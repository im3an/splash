import type { BrowserSnapshot } from '../shared/types';
import { BrowserController } from './browser-controller';
import type { Bounds, PageHost, PageHostEvents } from './page-host';

class FakeHost implements PageHost {
  loaded: string[] = [];
  bounds: Bounds | null = null;
  visible = false;
  destroyed = false;
  calls: string[] = [];

  constructor(readonly events: PageHostEvents) {}

  load(url: string) {
    this.loaded.push(url);
  }
  goBack() {
    this.calls.push('back');
  }
  goForward() {
    this.calls.push('forward');
  }
  reload() {
    this.calls.push('reload');
  }
  stop() {
    this.calls.push('stop');
  }
  show(bounds: Bounds) {
    this.visible = true;
    this.bounds = bounds;
  }
  hide() {
    this.visible = false;
  }
  focus() {
    this.calls.push('focus');
  }
  toggleDevTools() {
    this.calls.push('devtools');
  }
  destroy() {
    this.destroyed = true;
    this.visible = false;
  }
}

const BOUNDS = { x: 260, y: 48, width: 900, height: 700 };

function setup() {
  const hosts: FakeHost[] = [];
  const snapshots: BrowserSnapshot[] = [];
  let next = 0;
  const controller = new BrowserController({
    createHost: (events) => {
      const host = new FakeHost(events);
      hosts.push(host);
      return host;
    },
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    schedule: (flush) => flush(),
    createId: () => `id-${++next}`,
  });
  controller.setContentBounds(BOUNDS);
  const latest = () => snapshots.at(-1)!;
  return { controller, hosts, latest };
}

describe('BrowserController', () => {
  it('creates an empty page without loading anything or showing a view', () => {
    const { controller, hosts, latest } = setup();
    const id = controller.createPage();
    expect(latest().activePageId).toBe(id);
    expect(latest().pages[id]?.url).toBeNull();
    expect(hosts[0]?.loaded).toEqual([]);
    expect(hosts[0]?.visible).toBe(false);
  });

  it('resolves address input, loads it and shows the view', () => {
    const { controller, hosts, latest } = setup();
    const id = controller.createPage({ input: 'example.com' });
    expect(hosts[0]?.loaded).toEqual(['https://example.com/']);
    expect(hosts[0]?.visible).toBe(true);
    expect(hosts[0]?.bounds).toEqual(BOUNDS);
    expect(latest().pages[id]).toMatchObject({
      url: 'https://example.com/',
      isLoading: true,
    });
  });

  it('only shows the active page', () => {
    const { controller, hosts } = setup();
    const first = controller.createPage({ input: 'a.com' });
    controller.createPage({ input: 'b.com' });
    expect(hosts.map((h) => h.visible)).toEqual([false, true]);
    controller.activatePage(first);
    expect(hosts.map((h) => h.visible)).toEqual([true, false]);
  });

  it('opens pages requested by a page as its children', () => {
    const { controller, hosts, latest } = setup();
    const parent = controller.createPage({ input: 'a.com' });
    hosts[0]!.events.onOpenRequest('https://b.com/', { background: false });
    const snapshot = latest();
    const childId = snapshot.pages[parent]!.childIds[0]!;
    expect(snapshot.pages[childId]).toMatchObject({
      parentId: parent,
      url: 'https://b.com/',
    });
    expect(snapshot.activePageId).toBe(childId);
  });

  it('keeps background children inactive', () => {
    const { controller, hosts, latest } = setup();
    const parent = controller.createPage({ input: 'a.com' });
    hosts[0]!.events.onOpenRequest('https://b.com/', { background: true });
    expect(latest().activePageId).toBe(parent);
    expect(hosts[1]?.visible).toBe(false);
  });

  it('hides a failed page and retries the failed address on reload', () => {
    const { controller, hosts, latest } = setup();
    const id = controller.createPage({ input: 'nope.invalid' });
    hosts[0]!.events.onStateChange({
      isLoading: false,
      error: {
        kind: 'load-failed',
        code: -105,
        description: 'ERR_NAME_NOT_RESOLVED',
        url: 'https://nope.invalid/',
      },
    });
    expect(hosts[0]?.visible).toBe(false);
    expect(latest().pages[id]?.error?.code).toBe(-105);

    controller.reload(id);
    expect(hosts[0]?.loaded.at(-1)).toBe('https://nope.invalid/');
    expect(hosts[0]?.calls).not.toContain('reload');
    expect(latest().pages[id]?.error).toBeNull();
    expect(hosts[0]?.visible).toBe(true);
  });

  it('closes a page, destroys its view and activates its successor', () => {
    const { controller, hosts, latest } = setup();
    const parent = controller.createPage({ input: 'a.com' });
    hosts[0]!.events.onOpenRequest('https://b.com/', { background: false });
    const child = latest().activePageId!;

    controller.closePage(child);
    expect(hosts[1]?.destroyed).toBe(true);
    expect(latest().activePageId).toBe(parent);
    expect(hosts[0]?.visible).toBe(true);

    controller.closePage(parent);
    expect(latest()).toMatchObject({
      pages: {},
      rootIds: [],
      activePageId: null,
    });
  });

  it('ignores events from a page after it is closed', () => {
    const { controller, hosts, latest } = setup();
    const id = controller.createPage({ input: 'a.com' });
    controller.closePage(id);
    hosts[0]!.events.onStateChange({ title: 'late' });
    hosts[0]!.events.onOpenRequest('https://b.com/', { background: false });
    expect(latest().rootIds).toEqual([]);
  });

  it('reveals a page activated inside a collapsed branch', () => {
    const { controller, hosts, latest } = setup();
    const parent = controller.createPage({ input: 'a.com' });
    hosts[0]!.events.onOpenRequest('https://b.com/', { background: true });
    const child = latest().pages[parent]!.childIds[0]!;
    controller.setCollapsed(parent, true);
    controller.activatePage(child);
    expect(latest().pages[parent]?.collapsed).toBe(false);
  });

  it('does not show views until the shell reports where content goes', () => {
    const hosts: FakeHost[] = [];
    const controller = new BrowserController({
      createHost: (events) => {
        const host = new FakeHost(events);
        hosts.push(host);
        return host;
      },
      onSnapshot: () => undefined,
      schedule: (flush) => flush(),
    });
    controller.createPage({ input: 'a.com' });
    expect(hosts[0]?.visible).toBe(false);
    controller.setContentBounds(BOUNDS);
    expect(hosts[0]?.visible).toBe(true);
  });

  it('coalesces snapshots scheduled in the same tick', async () => {
    const snapshots: BrowserSnapshot[] = [];
    const controller = new BrowserController({
      createHost: (events) => new FakeHost(events),
      onSnapshot: (snapshot) => snapshots.push(snapshot),
    });
    controller.createPage({ input: 'a.com' });
    controller.createPage({ input: 'b.com' });
    await Promise.resolve();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.rootIds).toHaveLength(2);
  });

  it('rejects unknown pages', () => {
    const { controller } = setup();
    expect(() => controller.activatePage('missing')).toThrow();
    expect(() => controller.navigate('missing', 'a.com')).toThrow();
  });

  it('closes a page with its descendants and skips them as successors', () => {
    const { controller, hosts, latest } = setup();
    const a = controller.createPage({ input: 'a.com' });
    const b = controller.createPage({ input: 'b.com', parentId: a });
    controller.createPage({ input: 'c.com', parentId: b });
    const d = controller.createPage({ input: 'd.com' });
    controller.activatePage(b);

    controller.closePage(a, { withDescendants: true });
    expect(latest().rootIds).toEqual([d]);
    expect(latest().activePageId).toBe(d);
    expect(hosts.map((h) => h.destroyed)).toEqual([true, true, true, false]);
  });

  it('renames a page and clears the name when given nothing', () => {
    const { controller, latest } = setup();
    const id = controller.createPage({ input: 'a.com' });
    controller.renamePage(id, '  Reading list ');
    expect(latest().pages[id]?.customTitle).toBe('Reading list');
    controller.renamePage(id, '   ');
    expect(latest().pages[id]?.customTitle).toBeNull();
  });

  it('moves pages and expands the new parent', () => {
    const { controller, latest } = setup();
    const a = controller.createPage({ input: 'a.com' });
    const b = controller.createPage({ input: 'b.com' });
    const c = controller.createPage({ input: 'c.com' });
    controller.movePage(c, null, a);
    expect(latest().rootIds).toEqual([c, a, b]);

    controller.createPage({ input: 'x.com', parentId: a });
    controller.setCollapsed(a, true);
    controller.movePage(b, a, null);
    expect(latest().pages[a]?.childIds.at(-1)).toBe(b);
    expect(latest().pages[a]?.collapsed).toBe(false);
  });

  describe('workspaces', () => {
    it('starts with one workspace', () => {
      const { controller } = setup();
      const snapshot = controller.snapshot();
      expect(snapshot.workspaces).toHaveLength(1);
      expect(snapshot.workspaces[0]?.name).toBe('Personal');
      expect(snapshot.activeWorkspaceId).toBe(snapshot.workspaces[0]?.id);
    });

    it('keeps an independent tree and active page per workspace', () => {
      const { controller, hosts, latest } = setup();
      const home = controller.workspaceId;
      const a = controller.createPage({ input: 'a.com' });
      const work = controller.createWorkspace('Work', { activate: true });
      expect(latest().rootIds).toEqual([]);
      expect(latest().activePageId).toBeNull();
      expect(hosts[0]?.visible).toBe(false);

      const b = controller.createPage({ input: 'b.com' });
      expect(latest().rootIds).toEqual([b]);
      expect(latest().workspaces.map((w) => w.pageCount)).toEqual([1, 1]);

      controller.activateWorkspace(home);
      expect(latest().rootIds).toEqual([a]);
      expect(latest().activePageId).toBe(a);
      expect(hosts.map((h) => h.visible)).toEqual([true, false]);

      controller.activatePage(b);
      expect(latest().activeWorkspaceId).toBe(work);
    });

    it('creates root pages in a background workspace without switching', () => {
      const { controller, latest } = setup();
      const home = controller.workspaceId;
      const work = controller.createWorkspace('Work');
      const id = controller.createPage({ input: 'a.com', workspaceId: work });
      expect(latest().activeWorkspaceId).toBe(home);
      controller.activateWorkspace(work);
      expect(latest().activePageId).toBe(id);
    });

    it('refuses to move a page into another workspace', () => {
      const { controller } = setup();
      const a = controller.createPage({ input: 'a.com' });
      controller.createWorkspace('Work', { activate: true });
      const b = controller.createPage({ input: 'b.com' });
      expect(() => controller.movePage(b, a, null)).toThrow();
    });

    it('deletes a workspace, its pages, and falls back to a neighbour', () => {
      const { controller, hosts, latest } = setup();
      const home = controller.workspaceId;
      const work = controller.createWorkspace('Work', { activate: true });
      controller.createPage({ input: 'b.com' });
      controller.deleteWorkspace(work);
      expect(hosts[0]?.destroyed).toBe(true);
      expect(latest().activeWorkspaceId).toBe(home);
      expect(latest().workspaces).toHaveLength(1);
      expect(() => controller.deleteWorkspace(home)).toThrow();
    });

    it('renames workspaces but not to nothing', () => {
      const { controller, latest } = setup();
      const id = controller.workspaceId;
      controller.renameWorkspace(id, ' Home ');
      expect(latest().workspaces[0]?.name).toBe('Home');
      expect(() => controller.renameWorkspace(id, '  ')).toThrow();
    });

    it('gives workspaces distinct colours', () => {
      const { controller } = setup();
      controller.createWorkspace('Two');
      const colors = controller.snapshot().workspaces.map((w) => w.color);
      expect(new Set(colors).size).toBe(2);
    });
  });
});
