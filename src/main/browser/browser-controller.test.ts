import type { Rectangle } from 'electron';
import type { BrowserSnapshot, Notice } from '../../shared/types';
import { BrowserController } from './browser-controller';
import type {
  LoadOptions,
  PageHistory,
  PageHost,
  PageHostEvents,
} from './page-host';

class FakeHost implements PageHost {
  loaded: string[] = [];
  referrers: (string | undefined)[] = [];
  bounds: Rectangle | null = null;
  visible = false;
  destroyed = false;
  audible = false;
  restored: PageHistory | null = null;
  history: PageHistory | null = null;
  calls: string[] = [];

  constructor(readonly events: PageHostEvents) {}

  load(url: string, options?: LoadOptions) {
    this.loaded.push(url);
    this.referrers.push(options?.referrer);
    this.history = { entries: [{ url, title: '' }], index: 0 };
  }
  captureHistory() {
    return this.history;
  }
  restoreHistory(history: PageHistory) {
    this.restored = history;
    this.history = history;
  }
  isAudible() {
    return this.audible;
  }
  muted = false;
  zoomPercent = 100;
  findQueries: string[] = [];
  setMuted(muted: boolean) {
    this.muted = muted;
    this.events.onStateChange({ isMuted: muted });
  }
  setZoomPercent(percent: number) {
    this.zoomPercent = percent;
    this.events.onStateChange({ zoomPercent: percent });
  }
  find(text: string) {
    this.findQueries.push(text);
  }
  stopFind() {
    this.events.onStateChange({ find: null });
  }
  async capture() {
    return 'data:image/jpeg;base64,AAAA';
  }
  goBack() {
    this.calls.push('back');
  }
  goForward() {
    this.calls.push('forward');
  }
  reload(options?: { ignoreCache?: boolean }) {
    this.calls.push(options?.ignoreCache ? 'hard-reload' : 'reload');
  }
  print() {
    this.calls.push('print');
  }
  stop() {
    this.calls.push('stop');
  }
  show(bounds: Rectangle) {
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

function setup(options: { maxLiveViews?: number; idPrefix?: string } = {}) {
  const { idPrefix = 'page', ...controllerOptions } = options;
  const hosts: FakeHost[] = [];
  const snapshots: BrowserSnapshot[] = [];
  const visits: string[] = [];
  const titles: [string, string][] = [];
  const notices: Notice[] = [];
  let next = 0;
  let clock = 0;
  const controller = new BrowserController({
    ...controllerOptions,
    now: () => ++clock,
    onVisit: (url) => visits.push(url),
    onTitle: (url, title) => titles.push([url, title]),
    onNotice: (notice) => notices.push(notice),
    createHost: (events) => {
      const host = new FakeHost(events);
      hosts.push(host);
      return host;
    },
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    schedule: (flush) => flush(),
    createId: () => `${idPrefix}-${++next}`,
  });
  controller.setContentBounds(BOUNDS);
  const latest = () => snapshots.at(-1)!;
  return { controller, hosts, latest, visits, titles, notices };
}

describe('BrowserController', () => {
  it('creates an empty page without loading anything or showing a view', () => {
    const { controller, hosts, latest } = setup();
    const id = controller.createPage();
    expect(latest().activePageId).toBe(id);
    expect(latest().pages[id]?.url).toBeNull();
    expect(hosts).toHaveLength(0);
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
    expect(latest().lastClosed?.pageCount).toBe(1);
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

  describe('trail branching', () => {
    it('turns a link click into an active child page with a referrer', () => {
      const { controller, hosts, latest } = setup();
      const parent = controller.createPage({ input: 'a.com' });
      hosts[0]!.events.onBranchRequest('https://b.com/', 'https://a.com/');
      const child = latest().activePageId!;
      expect(child).not.toBe(parent);
      expect(latest().pages[child]).toMatchObject({
        parentId: parent,
        url: 'https://b.com/',
      });
      expect(hosts[1]?.referrers).toEqual(['https://a.com/']);
      // The parent's view survives, just hidden.
      expect(hosts[0]?.destroyed).toBe(false);
      expect(hosts.map((h) => h.visible)).toEqual([false, true]);
    });

    it('goes back up the trail once a page has no history of its own', () => {
      const { controller, hosts, latest } = setup();
      const parent = controller.createPage({ input: 'a.com' });
      hosts[0]!.events.onBranchRequest('https://b.com/', 'https://a.com/');
      const child = latest().activePageId!;
      expect(latest().pages[child]?.canGoBack).toBe(true);

      controller.goBack(child);
      expect(latest().activePageId).toBe(parent);
      expect(hosts[1]?.calls).not.toContain('back');
    });

    it('prefers the page’s own history when it has one', () => {
      const { controller, hosts, latest } = setup();
      controller.createPage({ input: 'a.com' });
      hosts[0]!.events.onBranchRequest('https://b.com/', 'https://a.com/');
      const child = latest().activePageId!;
      hosts[1]!.events.onStateChange({ canGoBack: true });
      controller.goBack(child);
      expect(hosts[1]?.calls).toContain('back');
      expect(latest().activePageId).toBe(child);
    });

    it('goes forward to the child visited last', () => {
      const { controller, hosts, latest } = setup();
      const parent = controller.createPage({ input: 'a.com' });
      hosts[0]!.events.onBranchRequest('https://b.com/', 'https://a.com/');
      const first = latest().activePageId!;
      controller.activatePage(parent);
      hosts[0]!.events.onBranchRequest('https://c.com/', 'https://a.com/');
      const second = latest().activePageId!;
      controller.activatePage(first);
      controller.activatePage(parent);
      expect(latest().pages[parent]?.canGoForward).toBe(true);

      controller.goForward(parent);
      expect(latest().activePageId).toBe(first);
      expect(second).not.toBe(first);
    });

    it('ignores branch requests from closed pages', () => {
      const { controller, hosts, latest } = setup();
      const id = controller.createPage({ input: 'a.com' });
      controller.closePage(id);
      hosts[0]!.events.onBranchRequest('https://b.com/', 'https://a.com/');
      expect(latest().rootIds).toEqual([]);
    });
  });

  describe('view lifecycle', () => {
    it('discards the least recently used views beyond the budget', () => {
      const { controller, hosts, latest } = setup({ maxLiveViews: 2 });
      const a = controller.createPage({ input: 'a.com' });
      const b = controller.createPage({ input: 'b.com' });
      controller.createPage({ input: 'c.com' });
      expect(hosts.map((h) => h.destroyed)).toEqual([true, false, false]);
      expect(latest().pages[a]?.isDiscarded).toBe(true);
      expect(latest().pages[a]?.url).toBe('https://a.com/');
      expect(latest().pages[b]?.isDiscarded).toBe(false);
    });

    it('restores a discarded page with its history when activated', () => {
      const { controller, hosts, latest } = setup({ maxLiveViews: 1 });
      const a = controller.createPage({ input: 'a.com' });
      controller.createPage({ input: 'b.com' });
      expect(hosts[0]?.destroyed).toBe(true);

      controller.activatePage(a);
      const revived = hosts[2]!;
      expect(revived.restored?.entries[0]?.url).toBe('https://a.com/');
      expect(revived.loaded).toEqual([]);
      expect(revived.visible).toBe(true);
      expect(latest().pages[a]?.isDiscarded).toBe(false);
      // The budget now discards the other page instead.
      expect(hosts[1]?.destroyed).toBe(true);
    });

    it('never discards the active page or one playing sound', () => {
      const { controller, hosts } = setup({ maxLiveViews: 1 });
      controller.createPage({ input: 'a.com' });
      hosts[0]!.audible = true;
      controller.createPage({ input: 'b.com' });
      expect(hosts.map((h) => h.destroyed)).toEqual([false, false]);
    });

    it('ignores late events from a discarded view', () => {
      const { controller, hosts, latest } = setup({ maxLiveViews: 1 });
      const a = controller.createPage({ input: 'a.com' });
      controller.createPage({ input: 'b.com' });
      hosts[0]!.events.onStateChange({ title: 'stale' });
      expect(latest().pages[a]?.title).toBe('');
    });

    it('reloading a discarded page brings it back', () => {
      const { controller, hosts } = setup({ maxLiveViews: 1 });
      const a = controller.createPage({ input: 'a.com' });
      controller.createPage({ input: 'b.com' });
      controller.reload(a);
      expect(hosts[2]?.restored).not.toBeNull();
    });
  });

  describe('tree interaction', () => {
    /** root → (a → a1), b */
    function trail() {
      const ctx = setup();
      const { controller } = ctx;
      const root = controller.createPage({ input: 'root.com' });
      const a = controller.createPage({ input: 'a.com', parentId: root });
      const a1 = controller.createPage({ input: 'a1.com', parentId: a });
      const b = controller.createPage({ input: 'b.com', parentId: root });
      return { ...ctx, root, a, a1, b };
    }

    it('closes a whole branch and reopens it in place with its history', () => {
      const { controller, latest, root, a, a1, b } = trail();
      controller.activatePage(a1);
      controller.closeBranch(a);
      expect(latest().pages[root]?.childIds).toEqual([b]);
      expect(latest().pages[a1]).toBeUndefined();
      expect(latest().activePageId).toBe(b);
      expect(latest().lastClosed).toMatchObject({ pageCount: 2 });

      expect(controller.reopenClosed()).toBe(a);
      expect(latest().pages[root]?.childIds).toEqual([a, b]);
      expect(latest().pages[a]?.childIds).toEqual([a1]);
      expect(latest().pages[a1]?.isDiscarded).toBe(true);
      expect(latest().activePageId).toBe(a);
      expect(latest().lastClosed).toBeNull();
    });

    it('closes other pages, keeping the line, pinned pages, and one undo', () => {
      const { controller, latest, root, a, a1, b } = trail();
      const other = controller.createPage({ input: 'other.com' });
      const otherChild = controller.createPage({
        input: 'other-child.com',
        parentId: other,
      });
      const stray = controller.createPage({ input: 'stray.com' });
      // Pinning lifts a page to the top of the trail.
      const pinned = controller.createPage({
        input: 'pin.com',
        parentId: stray,
      });
      controller.setPinned(pinned, true);
      controller.closeOtherPages(a);
      expect(Object.keys(latest().pages).sort()).toEqual(
        [pinned, root, a, a1].sort(),
      );
      expect(latest().activePageId).toBe(a);
      expect(latest().lastClosed).toMatchObject({ pageCount: 4 });

      controller.reopenClosed();
      expect(latest().pages[root]?.childIds).toEqual([a, b]);
      expect(latest().pages[other]?.childIds).toEqual([otherChild]);
      expect(latest().rootIds).toEqual([pinned, root, other, stray]);
    });

    it('reopening a single closed page takes its children back', () => {
      const { controller, latest, root, a, a1 } = trail();
      controller.closePage(a);
      expect(latest().pages[a1]?.parentId).toBe(root);
      controller.reopenClosed();
      expect(latest().pages[a]?.childIds).toEqual([a1]);
      expect(latest().pages[a1]?.parentId).toBe(a);
    });

    it('leaves promoted children alone if they were moved meanwhile', () => {
      const { controller, latest, a, a1, b } = trail();
      controller.closePage(a);
      controller.movePage(a1, b, null);
      controller.reopenClosed();
      expect(latest().pages[a]?.childIds).toEqual([]);
      expect(latest().pages[a1]?.parentId).toBe(b);
    });

    it('restores a closed page under the root when its parent is gone', () => {
      const { controller, latest, root, a } = trail();
      controller.closePage(a);
      controller.closeBranch(root);
      controller.reopenClosed(); // root's branch
      controller.reopenClosed(); // a
      expect(latest().pages[a]).toBeDefined();
    });

    it('moves a page after a sibling, or first', () => {
      const { controller, latest, root, a, b } = trail();
      controller.movePage(a, root, b);
      expect(latest().pages[root]?.childIds).toEqual([b, a]);
      controller.movePage(a, root, null);
      expect(latest().pages[root]?.childIds).toEqual([a, b]);
      controller.movePage(b, null, root);
      expect(latest().rootIds).toEqual([root, b]);
    });

    it('expands the new parent and rejects moves into the own branch', () => {
      const { controller, latest, a, a1, b } = trail();
      controller.setCollapsed(b, true);
      controller.movePage(a, b, null);
      expect(latest().pages[b]?.collapsed).toBe(false);
      expect(() => controller.movePage(a, a1, null)).toThrow();
      expect(() => controller.movePage(b, a, 'missing')).toThrow();
    });

    it('renames a page and falls back to its title', () => {
      const { controller, latest, a } = trail();
      controller.renamePage(a, '  Research  ');
      expect(latest().pages[a]?.customTitle).toBe('Research');
      controller.renamePage(a, '   ');
      expect(latest().pages[a]?.customTitle).toBeNull();
    });

    it('duplicates a page right after it with the same history', () => {
      const { controller, hosts, latest, root, a, b } = trail();
      const copy = controller.duplicatePage(a);
      expect(latest().pages[root]?.childIds).toEqual([a, copy, b]);
      expect(latest().activePageId).toBe(copy);
      expect(hosts.at(-1)?.restored?.entries[0]?.url).toBe('https://a.com/');
    });

    it('creates an empty child page', () => {
      const { controller, latest, b } = trail();
      const child = controller.createChildPage(b);
      expect(latest().pages[b]?.childIds).toEqual([child]);
      expect(latest().pages[child]?.url).toBeNull();
    });

    it('routes in-page navigation commands through the trail', () => {
      const { controller, hosts, latest, a, a1 } = trail();
      controller.activatePage(a1);
      const a1Host = hosts[2]!;
      expect(a1Host.events.navigationAvailability().canGoBack).toBe(true);
      a1Host.events.onNavigationCommand('back');
      expect(latest().activePageId).toBe(a);
    });
  });

  describe('workspaces', () => {
    it('starts with one workspace and switches between trails', () => {
      const { controller, hosts, latest } = setup();
      const first = controller.createPage({ input: 'a.com' });
      expect(latest().workspaces).toHaveLength(1);

      const work = controller.createWorkspace('Work');
      expect(latest().activeWorkspaceId).toBe(work);
      expect(latest().rootIds).toEqual([]);
      expect(hosts[0]?.visible).toBe(false);

      const second = controller.createPage({ input: 'b.com' });
      expect(latest().rootIds).toEqual([second]);

      controller.activatePage(first);
      expect(latest().activeWorkspaceId).not.toBe(work);
      expect(latest().rootIds).toEqual([first]);
      expect(hosts.map((h) => h.visible)).toEqual([true, false]);
      expect(latest().workspaces.map((w) => [w.name, w.pageCount])).toEqual([
        ['Personal', 1],
        ['Work', 1],
      ]);
    });

    it('moves a branch to another workspace', () => {
      const { controller, latest } = setup();
      const root = controller.createPage({ input: 'a.com' });
      const child = controller.createPage({ input: 'b.com', parentId: root });
      const home = latest().activeWorkspaceId;
      const work = controller.createWorkspace('Work');
      controller.switchWorkspace(home);

      controller.movePageToWorkspace(root, work);
      expect(latest().rootIds).toEqual([]);
      expect(latest().activePageId).toBeNull();

      controller.switchWorkspace(work);
      expect(latest().rootIds).toEqual([root]);
      expect(latest().pages[root]?.childIds).toEqual([child]);
      expect(latest().activePageId).toBe(root);
    });

    it('confirms a move and can put the branch back where it was', () => {
      const { controller, latest, notices } = setup();
      const top = controller.createPage({ input: 'a.com' });
      const first = controller.createPage({ input: 'b.com', parentId: top });
      const moved = controller.createPage({ input: 'c.com', parentId: top });
      const last = controller.createPage({ input: 'd.com', parentId: top });
      controller.createPage({ input: 'e.com', parentId: moved });
      controller.activatePage(moved);
      const home = latest().activeWorkspaceId;
      const work = controller.createWorkspace('Work');
      controller.switchWorkspace(home);

      controller.movePageToWorkspace(moved, work);
      expect(latest().pages[top]?.childIds).toEqual([first, last]);
      expect(notices).toEqual([
        {
          kind: 'moved',
          pageId: moved,
          label: 'c.com',
          pageCount: 2,
          workspaceId: work,
          workspaceName: 'Work',
          origin: {
            workspaceId: home,
            parentId: top,
            index: 1,
            wasActive: true,
          },
        },
      ]);

      const notice = notices[0]!;
      if (notice.kind !== 'moved') throw new Error('expected a move');
      controller.returnPage(moved, notice.origin);
      expect(latest().activeWorkspaceId).toBe(home);
      expect(latest().pages[top]?.childIds).toEqual([first, moved, last]);
      expect(latest().pages[moved]?.childIds).toHaveLength(1);
      expect(latest().activePageId).toBe(moved);
      expect(notices).toHaveLength(1);
    });

    it('puts a moved branch at the end when its old parent has closed', () => {
      const { controller, latest, notices } = setup();
      const top = controller.createPage({ input: 'a.com' });
      const moved = controller.createPage({ input: 'b.com', parentId: top });
      const home = latest().activeWorkspaceId;
      const work = controller.createWorkspace('Work');
      controller.switchWorkspace(home);
      controller.movePageToWorkspace(moved, work);
      controller.closePage(top);

      const notice = notices[0]!;
      if (notice.kind !== 'moved') throw new Error('expected a move');
      controller.returnPage(moved, notice.origin);
      expect(latest().rootIds).toEqual([moved]);
    });

    it('renames and deletes workspaces, but never the last one', () => {
      const { controller, hosts, latest } = setup();
      const home = latest()?.activeWorkspaceId ?? controller.currentWorkspaceId;
      const work = controller.createWorkspace();
      controller.createPage({ input: 'a.com' });
      controller.renameWorkspace(work, '  Deep work ');
      expect(latest().workspaces[1]?.name).toBe('Deep work');

      controller.deleteWorkspace(work);
      expect(hosts[0]?.destroyed).toBe(true);
      expect(latest().activeWorkspaceId).toBe(home);
      expect(() => controller.deleteWorkspace(home)).toThrow();
    });

    it('brings a deleted workspace back with its trail', () => {
      const { controller, latest } = setup();
      const home = latest()?.activeWorkspaceId ?? controller.currentWorkspaceId;
      const work = controller.createWorkspace('Work');
      const root = controller.createPage({ input: 'a.com' });
      const child = controller.createPage({ input: 'b.com', parentId: root });
      controller.createWorkspace('Later');
      controller.deleteWorkspace(work);
      expect(latest().workspaces.map((w) => w.name)).toEqual([
        'Personal',
        'Later',
      ]);
      expect(latest().lastClosed).toMatchObject({
        kind: 'workspace',
        label: 'Work',
        pageCount: 2,
      });

      controller.reopenClosed();
      expect(latest().workspaces.map((w) => w.name)).toEqual([
        'Personal',
        'Work',
        'Later',
      ]);
      expect(latest().activeWorkspaceId).toBe(work);
      expect(latest().pages[root]?.childIds).toEqual([child]);
      expect(latest().activePageId).toBe(child);
      expect(home).not.toBe(work);
    });

    it('gives each new workspace a different accent', () => {
      const { controller, latest } = setup();
      controller.createWorkspace('Work');
      controller.createWorkspace('Later');
      const accents = latest().workspaces.map((w) => w.appearance.accent);
      expect(new Set(accents).size).toBe(3);
    });

    it('reorders workspaces', () => {
      const { controller, latest } = setup();
      controller.createWorkspace('Work');
      const later = controller.createWorkspace('Later');
      controller.moveWorkspace(later, 0);
      expect(latest().workspaces.map((w) => w.name)).toEqual([
        'Later',
        'Personal',
        'Work',
      ]);
      controller.moveWorkspace(later, 99);
      expect(latest().workspaces.at(-1)?.name).toBe('Later');
    });

    it('reopens a closed page into the workspace it came from', () => {
      const { controller, latest } = setup();
      const page = controller.createPage({ input: 'a.com' });
      const home = latest().activeWorkspaceId;
      controller.closePage(page);
      controller.createWorkspace('Work');
      controller.reopenClosed();
      expect(latest().activeWorkspaceId).toBe(home);
      expect(latest().rootIds).toEqual([page]);
    });
  });

  describe('notes and history events', () => {
    it('keeps a trimmed note per page', () => {
      const { controller, latest } = setup();
      const id = controller.createPage({ input: 'a.com' });
      controller.setNote(id, '  compare prices  ');
      expect(latest().pages[id]?.note).toBe('compare prices');
      controller.setNote(id, '');
      expect(latest().pages[id]?.note).toBeNull();
    });

    it('records a visit when a requested address commits', () => {
      const { controller, hosts, visits } = setup();
      const id = controller.createPage({ url: 'https://a.com/' });
      hosts[0]!.events.onStateChange({ url: 'https://a.com/' });
      expect(visits).toEqual(['https://a.com/']);

      controller.navigate(id, 'b.com');
      hosts[0]!.events.onStateChange({ url: 'https://b.com/' });
      hosts[0]!.events.onStateChange({ url: 'https://b.com/#part' });
      expect(visits).toEqual(['https://a.com/', 'https://b.com/']);
    });

    it('can start on a new page, reusing an empty one left from last time', () => {
      const original = setup();
      const kept = original.controller.createPage({ url: 'https://a.com/' });
      const session = original.controller.exportSession();

      const first = setup({ idPrefix: 'first' });
      first.controller.restoreSession(session);
      const blank = first.controller.startWithNewPage();
      expect(blank).not.toBe(kept);
      expect(first.latest().pages[kept]).toBeDefined();
      expect(first.latest().activePageId).toBe(blank);

      const second = setup({ idPrefix: 'second' });
      second.controller.restoreSession(first.controller.exportSession());
      expect(second.controller.startWithNewPage()).toBe(blank);
      expect(Object.keys(second.latest().pages)).toHaveLength(2);
    });

    it('does not count a restored page as a new visit', () => {
      const original = setup();
      original.controller.createPage({ url: 'https://a.com/' });
      const session = original.controller.exportSession();
      const restored = setup();
      restored.controller.restoreSession(session);
      restored.hosts[0]!.events.onStateChange({ url: 'https://a.com/' });
      expect(restored.visits).toEqual([]);
    });

    it('reports new documents and their titles, not fragment changes', () => {
      const { controller, hosts, visits, titles } = setup();
      controller.createPage({ input: 'a.com' });
      const host = hosts[0]!;
      host.events.onStateChange({ url: 'https://a.com/' });
      host.events.onStateChange({ url: 'https://a.com/#section' });
      host.events.onStateChange({ url: 'https://a.com/next' });
      host.events.onStateChange({ title: 'Next' });
      expect(visits).toEqual(['https://a.com/', 'https://a.com/next']);
      expect(titles).toEqual([['https://a.com/next', 'Next']]);
    });
  });

  describe('split view', () => {
    /** parent → child, other */
    function related() {
      const ctx = setup();
      const parent = ctx.controller.createPage({ input: 'a.com' });
      const child = ctx.controller.createPage({
        input: 'b.com',
        parentId: parent,
      });
      const other = ctx.controller.createPage({ input: 'c.com' });
      ctx.controller.activatePage(child);
      // hosts: 0 parent, 1 child, 2 other
      return { ...ctx, parent, child, other };
    }

    it('shows a page beside its parent, parent on the left', () => {
      const { controller, hosts, latest, parent, child } = related();
      controller.toggleSplit(child);
      expect(latest().split).toEqual({ leftId: parent, rightId: child });
      expect(latest().activePageId).toBe(child);
      expect(hosts[0]).toMatchObject({ visible: true });
      expect(hosts[1]).toMatchObject({ visible: true });
      expect(hosts[0]!.bounds).toEqual({
        x: 260,
        y: 48,
        width: 446,
        height: 700,
      });
      expect(hosts[1]!.bounds).toEqual({
        x: 714,
        y: 48,
        width: 446,
        height: 700,
      });
      expect(hosts[2]!.visible).toBe(false);
    });

    it('pairs a top-level page with the child it leads to', () => {
      const { controller, latest, parent, child } = related();
      controller.activatePage(parent);
      controller.toggleSplit(parent);
      expect(latest().split).toEqual({ leftId: parent, rightId: child });
      expect(latest().activePageId).toBe(parent);
    });

    it('does nothing for a page with no parent or children', () => {
      const { controller, latest, other } = related();
      controller.activatePage(other);
      controller.toggleSplit(other);
      expect(latest().split).toBeNull();
    });

    it('puts the ancestor on the left whichever page asks', () => {
      const { controller, latest, parent, child } = related();
      controller.openSplit(parent, child);
      expect(latest().split).toEqual({ leftId: parent, rightId: child });
      expect(latest().activePageId).toBe(parent);
    });

    it('keeps the pair while other pages are shown, and shows it again', () => {
      const { controller, hosts, latest, parent, child, other } = related();
      controller.toggleSplit(child);
      controller.activatePage(other);
      expect(hosts.map((h) => h.visible)).toEqual([false, false, true]);
      expect(hosts[2]!.bounds).toEqual(BOUNDS);
      expect(latest().split).toEqual({ leftId: parent, rightId: child });

      controller.activatePage(parent);
      expect(hosts.map((h) => h.visible)).toEqual([true, true, false]);
      expect(latest().activePageId).toBe(parent);
    });

    it('closes again with the same toggle, keeping the active page', () => {
      const { controller, hosts, latest, child } = related();
      controller.toggleSplit(child);
      controller.toggleSplit(child);
      expect(latest().split).toBeNull();
      expect(hosts.map((h) => h.visible)).toEqual([false, true, false]);
      expect(hosts[1]!.bounds).toEqual(BOUNDS);
    });

    it('makes the side the user clicks into active', () => {
      const { controller, hosts, latest, parent, child } = related();
      controller.toggleSplit(child);
      hosts[0]!.events.onFocus();
      expect(latest().activePageId).toBe(parent);
      expect(latest().split).toEqual({ leftId: parent, rightId: child });
    });

    it('ignores focus from a page that is not on screen', () => {
      const { controller, hosts, latest, child } = related();
      controller.toggleSplit(child);
      hosts[2]!.events.onFocus();
      expect(latest().activePageId).toBe(child);
    });

    it('opens links from either side on the right', () => {
      const { controller, hosts, latest, parent, child } = related();
      controller.toggleSplit(child);
      hosts[0]!.events.onBranchRequest('https://a.com/next', 'https://a.com/');
      const fromLeft = latest().activePageId!;
      expect(latest().pages[fromLeft]?.parentId).toBe(parent);
      expect(latest().split).toEqual({ leftId: parent, rightId: fromLeft });
      expect(hosts[1]!.visible).toBe(false);

      hosts[3]!.events.onBranchRequest(
        'https://a.com/deeper',
        'https://a.com/next',
      );
      const fromRight = latest().activePageId!;
      expect(latest().split).toEqual({ leftId: parent, rightId: fromRight });
      expect(latest().pages[child]).toBeDefined();
    });

    it('leaves the pair alone for links opened in the background', () => {
      const { controller, hosts, latest, parent, child } = related();
      controller.toggleSplit(child);
      hosts[1]!.events.onOpenRequest('https://b.com/later', {
        background: true,
      });
      expect(latest().split).toEqual({ leftId: parent, rightId: child });
      expect(latest().activePageId).toBe(child);
    });

    it('ends when either page closes or moves away', () => {
      const closing = related();
      closing.controller.toggleSplit(closing.child);
      closing.controller.closePage(closing.parent);
      expect(closing.latest().split).toBeNull();
      expect(closing.hosts[1]!.bounds).toEqual(BOUNDS);

      const moving = related();
      moving.controller.toggleSplit(moving.child);
      const work = moving.controller.createWorkspace('Work');
      moving.controller.switchWorkspace(moving.latest().workspaces[0]!.id);
      moving.controller.movePageToWorkspace(moving.child, work);
      expect(moving.latest().split).toBeNull();
    });

    it('never puts a page on screen to sleep', () => {
      const { controller, hosts } = setup({ maxLiveViews: 2 });
      const parent = controller.createPage({ input: 'a.com' });
      const kid = controller.createPage({ input: 'b.com', parentId: parent });
      controller.toggleSplit(kid);
      controller.createPage({ input: 'c.com', parentId: kid, activate: false });
      expect(hosts[0]!.destroyed).toBe(false);
      expect(hosts[1]!.destroyed).toBe(false);
    });

    it('wakes the other side when the pair comes back', () => {
      const { controller, hosts, latest, parent, child, other } = related();
      controller.toggleSplit(child);
      controller.activatePage(other);
      controller.discard(parent);
      controller.activatePage(child);
      expect(latest().pages[parent]?.isDiscarded).toBe(false);
      expect(hosts.at(-1)!.visible).toBe(true);
    });

    it('captures both sides for the shell to show under a popover', async () => {
      const { controller, parent, child } = related();
      controller.toggleSplit(child);
      const stills = await controller.captureVisiblePages();
      expect(Object.keys(stills).sort()).toEqual([parent, child].sort());
      controller.setOverlayActive(true);
      expect(await controller.captureVisiblePages()).toEqual({});
    });

    it('survives a restart, unless one of its pages is gone', () => {
      const original = related();
      original.controller.toggleSplit(original.child);
      const session = original.controller.exportSession();
      expect(session.workspaces[0]?.split).toEqual({
        leftId: original.parent,
        rightId: original.child,
      });

      const restored = setup();
      restored.controller.restoreSession(session);
      expect(restored.latest().split).toEqual({
        leftId: original.parent,
        rightId: original.child,
      });
      expect(restored.hosts.filter((h) => h.visible)).toHaveLength(2);

      const broken = setup();
      broken.controller.restoreSession({
        ...session,
        workspaces: [
          {
            ...session.workspaces[0]!,
            split: { leftId: 'gone', rightId: original.child },
          },
        ],
      });
      expect(broken.latest().split).toBeNull();
    });
  });

  describe('pinned pages', () => {
    it('pins a branch to the top of the trail, after earlier pins', () => {
      const { controller, latest } = setup();
      const a = controller.createPage({ url: 'https://a.example/' });
      const b = controller.createPage({ url: 'https://b.example/' });
      const child = controller.createPage({
        url: 'https://c.example/',
        parentId: b,
      });
      const grandchild = controller.createPage({ parentId: child });

      controller.setPinned(b, true);
      controller.setPinned(child, true);

      expect(latest().rootIds).toEqual([b, child, a]);
      // The pinned child brought its own branch along.
      expect(latest().pages[grandchild]!.parentId).toBe(child);
      expect(latest().pages[b]!.isPinned).toBe(true);
    });

    it('unpins to just below the pinned pages', () => {
      const { controller, latest } = setup();
      const a = controller.createPage({ url: 'https://a.example/' });
      const b = controller.createPage({ url: 'https://b.example/' });
      const c = controller.createPage({ url: 'https://c.example/' });
      controller.setPinned(b, true);
      controller.setPinned(c, true);

      controller.setPinned(b, false);

      expect(latest().rootIds).toEqual([c, b, a]);
      expect(latest().pages[b]!.isPinned).toBe(false);
    });

    it('confirms a pin, and its undo puts the page back quietly', () => {
      const { controller, latest, notices } = setup();
      const parent = controller.createPage({ url: 'https://a.example/' });
      const page = controller.createPage({
        url: 'https://b.example/',
        parentId: parent,
      });

      controller.setPinned(page, true);
      const notice = notices[0]!;
      expect(notice).toMatchObject({
        kind: 'pinned',
        pageId: page,
        pinned: true,
        origin: { parentId: parent, index: 0 },
      });

      if (notice.kind !== 'pinned') throw new Error('unexpected notice');
      controller.setPinned(page, false, notice.origin);
      expect(latest().pages[page]!.parentId).toBe(parent);
      expect(latest().pages[page]!.isPinned).toBe(false);
      expect(notices).toHaveLength(1);
    });

    it('puts a pinned page to sleep instead of closing it', () => {
      const { controller, latest, hosts, notices } = setup();
      const a = controller.createPage({ url: 'https://a.example/' });
      const pinned = controller.createPage({ url: 'https://b.example/' });
      controller.setPinned(pinned, true);
      const host = hosts[1]!;

      controller.closePage(pinned);
      controller.closeBranch(pinned);

      expect(latest().rootIds).toEqual([pinned, a]);
      expect(latest().activePageId).toBe(a);
      expect(latest().pages[pinned]!.isDiscarded).toBe(true);
      expect(host.destroyed).toBe(true);
      expect(latest().lastClosed).toBeNull();
      expect(notices.at(-1)).toMatchObject({
        kind: 'kept-pinned',
        pageId: pinned,
        asleep: true,
      });
    });

    it('keeps the only page awake when it is pinned', () => {
      const { controller, latest, notices } = setup();
      const only = controller.createPage({ url: 'https://a.example/' });
      controller.setPinned(only, true);

      controller.closePage(only);

      expect(latest().activePageId).toBe(only);
      expect(latest().pages[only]!.isDiscarded).toBe(false);
      expect(notices.at(-1)).toMatchObject({
        kind: 'kept-pinned',
        asleep: false,
      });
    });

    it('unpins and closes on request, and reopening brings the pin back', () => {
      const { controller, latest } = setup();
      const a = controller.createPage({ url: 'https://a.example/' });
      const pinned = controller.createPage({ url: 'https://b.example/' });
      controller.setPinned(pinned, true);

      controller.closePage(pinned, { unpin: true });
      expect(latest().rootIds).toEqual([a]);

      controller.reopenClosed();
      expect(latest().rootIds).toEqual([pinned, a]);
      expect(latest().pages[pinned]!.isPinned).toBe(true);
    });

    it('keeps pins across a restart', () => {
      const { controller } = setup();
      controller.createPage({ url: 'https://a.example/' });
      const pinned = controller.createPage({ url: 'https://b.example/' });
      controller.setPinned(pinned, true);

      const restored = setup();
      restored.controller.restoreSession(controller.exportSession());
      expect(restored.latest().rootIds[0]).toBe(pinned);
      expect(restored.latest().pages[pinned]!.isPinned).toBe(true);
      expect(
        restored.controller.listPages().find((p) => p.id === pinned)?.pinned,
      ).toBe(true);
    });
  });

  describe('sessions', () => {
    it('exports and restores workspaces, trails and history', () => {
      const original = setup();
      const root = original.controller.createPage({ input: 'a.com' });
      const child = original.controller.createPage({
        input: 'b.com',
        parentId: root,
      });
      original.controller.renamePage(root, 'Trip');
      original.controller.setNote(child, 'book it');
      original.controller.setCollapsed(root, true);
      original.controller.createWorkspace('Work');
      original.controller.createPage({ input: 'c.com' });
      original.controller.activatePage(child);
      const session = original.controller.exportSession();

      expect(session.workspaces.map((w) => w.name)).toEqual([
        'Personal',
        'Work',
      ]);
      expect(session.pages.find((p) => p.id === child)?.history).toEqual({
        entries: [{ url: 'https://b.com/', title: '' }],
        index: 0,
      });

      const restored = setup();
      restored.controller.restoreSession(session);
      const snapshot = restored.latest();
      expect(snapshot.workspaces.map((w) => [w.name, w.pageCount])).toEqual([
        ['Personal', 2],
        ['Work', 1],
      ]);
      expect(snapshot.activePageId).toBe(child);
      expect(snapshot.pages[root]).toMatchObject({
        customTitle: 'Trip',
        childIds: [child],
        isDiscarded: true,
        url: 'https://a.com/',
      });
      expect(snapshot.pages[child]?.note).toBe('book it');
      // Only the active page gets a view, restored from its history.
      expect(restored.hosts).toHaveLength(1);
      expect(restored.hosts[0]?.restored?.entries[0]?.url).toBe(
        'https://b.com/',
      );
    });

    it('keeps undo history across a restart', () => {
      const original = setup();
      const page = original.controller.createPage({ input: 'a.com' });
      original.controller.closePage(page);
      const session = original.controller.exportSession();
      expect(session.closed).toHaveLength(1);

      const restored = setup();
      restored.controller.restoreSession(session);
      expect(restored.latest().lastClosed?.label).toBe('a.com');
      expect(restored.controller.reopenClosed()).toBe(page);
      expect(restored.latest().pages[page]?.url).toBe('https://a.com/');
    });

    it('ignores an empty session', () => {
      const { controller, latest } = setup();
      controller.createPage({ input: 'a.com' });
      controller.restoreSession({
        workspaces: [],
        pages: [],
        activeWorkspaceId: null,
      });
      expect(latest().rootIds).toHaveLength(1);
    });
  });

  describe('page status and tools', () => {
    it('mutes, zooms and finds through the page’s view', () => {
      const { controller, hosts, latest } = setup();
      const id = controller.createPage({ input: 'a.com' });
      controller.setMuted(id, true);
      expect(latest().pages[id]?.isMuted).toBe(true);

      controller.zoom(id, 'in');
      controller.zoom(id, 'in');
      expect(latest().pages[id]?.zoomPercent).toBe(125);
      controller.zoom(id, 'reset');
      expect(hosts[0]?.zoomPercent).toBe(100);

      controller.find(id, 'trail', { forward: true, findNext: false });
      expect(hosts[0]?.findQueries).toEqual(['trail']);
    });

    it('steps the page aside while the shell shows a popover', async () => {
      const { controller, hosts } = setup();
      const id = controller.createPage({ input: 'a.com' });
      await expect(controller.captureVisiblePages()).resolves.toEqual({
        [id]: expect.stringMatching(/^data:/),
      });
      controller.setOverlayActive(true);
      expect(hosts[0]?.visible).toBe(false);
      controller.setOverlayActive(false);
      expect(hosts[0]?.visible).toBe(true);
    });

    it('focuses the page once an overlay has finished closing', () => {
      const { controller, hosts } = setup();
      controller.createPage({ input: 'a.com' });
      controller.setOverlayActive(true);
      controller.focusActivePage();
      expect(hosts[0]?.calls).not.toContain('focus');
      controller.setOverlayActive(false);
      expect(hosts[0]?.calls).toContain('focus');
    });

    it('lists pages from every workspace for search', () => {
      const { controller } = setup();
      controller.createPage({ input: 'a.com' });
      controller.createWorkspace('Work');
      const work = controller.createPage({ input: 'b.com' });
      controller.renamePage(work, 'Quarterly plan');
      expect(
        controller.listPages().map((page) => [page.title, page.workspaceName]),
      ).toEqual([
        ['', 'Personal'],
        ['Quarterly plan', 'Work'],
      ]);
    });

    it('mutes live pages on a site when its sound is blocked', () => {
      const { controller, hosts } = setup();
      controller.createPage({ input: 'a.com' });
      controller.createPage({ input: 'b.com' });
      hosts[0]!.events.onStateChange({ url: 'https://a.com/' });
      hosts[1]!.events.onStateChange({ url: 'https://b.com/' });
      controller.applySoundPolicy('https://a.com', true);
      expect(hosts.map((h) => h.muted)).toEqual([true, false]);
    });
  });

  describe('permission requests', () => {
    it('queues a request on the page until the user answers', async () => {
      const { controller, hosts, latest } = setup();
      const id = controller.createPage({ input: 'meet.example' });
      const answer = hosts[0]!.events.onPermissionRequest(
        'https://meet.example',
        ['camera', 'microphone'],
      );
      const request = latest().pages[id]?.permissionRequest;
      expect(request).toMatchObject({
        origin: 'https://meet.example',
        permissions: ['camera', 'microphone'],
      });

      controller.respondToPermission(id, request!.id, true);
      await expect(answer).resolves.toBe(true);
      expect(latest().pages[id]?.permissionRequest).toBeNull();
    });

    it('shows refused permissions until the page leaves the site', async () => {
      const { controller, hosts, latest } = setup();
      const id = controller.createPage({ input: 'meet.example' });
      hosts[0]!.events.onStateChange({ url: 'https://meet.example/' });
      const answer = hosts[0]!.events.onPermissionRequest(
        'https://meet.example',
        ['location'],
      );
      controller.respondToPermission(
        id,
        latest().pages[id]!.permissionRequest!.id,
        false,
      );
      await expect(answer).resolves.toBe(false);
      expect(latest().pages[id]?.blockedPermissions).toEqual(['location']);

      hosts[0]!.events.onPermissionBlocked(['midi']);
      expect(latest().pages[id]?.blockedPermissions).toEqual([
        'location',
        'midi',
      ]);
      hosts[0]!.events.onStateChange({ url: 'https://meet.example/other' });
      expect(latest().pages[id]?.blockedPermissions).toHaveLength(2);
      hosts[0]!.events.onStateChange({ url: 'https://elsewhere.example/' });
      expect(latest().pages[id]?.blockedPermissions).toEqual([]);
    });

    it('refuses pending requests when the page leaves or closes', async () => {
      const { controller, hosts } = setup();
      const id = controller.createPage({ input: 'meet.example' });
      hosts[0]!.events.onStateChange({ url: 'https://meet.example/' });
      const leaving = hosts[0]!.events.onPermissionRequest(
        'https://meet.example',
        ['camera'],
      );
      hosts[0]!.events.onStateChange({ url: 'https://elsewhere.example/' });
      await expect(leaving).resolves.toBe(false);

      const closing = hosts[0]!.events.onPermissionRequest(
        'https://elsewhere.example',
        ['camera'],
      );
      controller.closePage(id);
      await expect(closing).resolves.toBe(false);
    });

    it('ignores answers to requests that are gone', () => {
      const { controller } = setup();
      const id = controller.createPage({ input: 'a.com' });
      expect(() =>
        controller.respondToPermission(id, 'stale', true),
      ).not.toThrow();
    });
  });

  describe('browser essentials', () => {
    const WINDOW = { x: 0, y: 0, width: 1200, height: 800 };

    it('lets a page in full screen cover the window, then puts it back', () => {
      const { controller, hosts } = setup();
      controller.setContentBounds(BOUNDS, WINDOW);
      controller.createPage({ input: 'video.example' });
      hosts[0]!.events.onFullscreenChange(true);
      expect(hosts[0]!.bounds).toEqual(WINDOW);
      hosts[0]!.events.onFullscreenChange(false);
      expect(hosts[0]!.bounds).toEqual(BOUNDS);
    });

    it('hides the other side of a split while one side is full screen', () => {
      const { controller, hosts } = setup();
      controller.setContentBounds(BOUNDS, WINDOW);
      const left = controller.createPage({ input: 'a.example' });
      const right = controller.createPage({
        input: 'b.example',
        parentId: left,
      });
      controller.openSplit(right, left);
      expect(hosts[0]!.visible && hosts[1]!.visible).toBe(true);
      hosts[1]!.events.onFullscreenChange(true);
      expect(hosts[0]!.visible).toBe(false);
      expect(hosts[1]!.bounds).toEqual(WINDOW);
      hosts[1]!.events.onFullscreenChange(false);
      expect(hosts[0]!.visible).toBe(true);
    });

    it('puts a page dropped on one side of a split there', () => {
      const { controller, latest } = setup();
      const parent = controller.createPage({ input: 'a.example' });
      const child = controller.createPage({
        input: 'b.example',
        parentId: parent,
      });
      controller.openSplit(parent, child, 'right');
      expect(latest().split).toEqual({ leftId: child, rightId: parent });
      expect(latest().activePageId).toBe(parent);
      controller.openSplit(parent, child, 'left');
      expect(latest().split).toEqual({ leftId: parent, rightId: child });
    });

    it('steps through the rows the sidebar shows, wrapping around', () => {
      const { controller, latest } = setup();
      const a = controller.createPage({ input: 'a.example' });
      const b = controller.createPage({ input: 'b.example', parentId: a });
      const c = controller.createPage({ input: 'c.example' });
      controller.activatePage(a);
      controller.activateAdjacent(1);
      expect(latest().activePageId).toBe(b);
      controller.activateAdjacent(1);
      expect(latest().activePageId).toBe(c);
      controller.activateAdjacent(1);
      expect(latest().activePageId).toBe(a);
      controller.activateAdjacent(-1);
      expect(latest().activePageId).toBe(c);

      controller.setCollapsed(a, true);
      controller.activatePage(a);
      controller.activateAdjacent(1);
      expect(latest().activePageId).toBe(c);
    });

    it('shows the nth row or the last one', () => {
      const { controller, latest } = setup();
      const a = controller.createPage({ input: 'a.example' });
      const b = controller.createPage({ input: 'b.example', parentId: a });
      const c = controller.createPage({ input: 'c.example' });
      controller.activateRow(2);
      expect(latest().activePageId).toBe(b);
      controller.activateRow('last');
      expect(latest().activePageId).toBe(c);
      controller.activateRow(9);
      expect(latest().activePageId).toBe(c);
    });

    it('reopens a chosen closed page, not only the last one', () => {
      const { controller, latest } = setup();
      const a = controller.createPage({ input: 'a.example' });
      const b = controller.createPage({ input: 'b.example' });
      controller.createPage({ input: 'c.example' });
      controller.closePage(a);
      controller.closePage(b);
      const [newest, older] = controller.recentlyClosed();
      expect(newest?.label).toBe('b.example');
      expect(older?.label).toBe('a.example');
      expect(controller.reopenClosed(older!.serial)).toBe(a);
      expect(latest().pages[a]).toBeDefined();
      expect(controller.recentlyClosed().map((s) => s.label)).toEqual([
        'b.example',
      ]);
      controller.forgetClosed();
      expect(controller.recentlyClosed()).toEqual([]);
      expect(controller.reopenClosed()).toBeNull();
      expect(controller.reopenClosed(12345)).toBeNull();
    });

    it('reloads ignoring the cache and prints the page', () => {
      const { controller, hosts } = setup();
      const id = controller.createPage({ input: 'a.example' });
      controller.reload(id, { ignoreCache: true });
      controller.print(id);
      expect(hosts[0]!.calls).toEqual(['hard-reload', 'print']);
    });
  });
});

describe('protected close lifecycle', () => {
  it('keeps a page and its live view when leaving is canceled', async () => {
    const { controller, hosts } = setup();
    const id = controller.createPage({ url: 'https://forms.example/' });
    const host = hosts[0]! as FakeHost & { requestClose(): Promise<boolean> };
    host.requestClose = vi.fn(async () => false);
    await controller.closePage(id);
    expect(controller.hasPage(id)).toBe(true);
    expect(host.destroyed).toBe(false);
  });
  it('records history before an approved native close destroys the view', async () => {
    const { controller, hosts } = setup();
    const id = controller.createPage({ url: 'https://forms.example/' });
    const host = hosts[0]! as FakeHost & { requestClose(): Promise<boolean> };
    host.requestClose = vi.fn(async () => true);
    await controller.closePage(id);
    expect(controller.hasPage(id)).toBe(false);
    controller.reopenClosed();
    expect(controller.hasPage(id)).toBe(true);
    expect(hosts.at(-1)!.restored?.entries[0]!.url).toBe(
      'https://forms.example/',
    );
  });
  it('keeps the entire branch if a child refuses to close', async () => {
    const { controller, hosts } = setup();
    const root = controller.createPage({ url: 'https://a.example/' });
    const child = controller.createPage({
      url: 'https://b.example/',
      parentId: root,
    });
    const first = hosts[0]! as FakeHost & { requestClose(): Promise<boolean> };
    const second = hosts[1]! as FakeHost & { requestClose(): Promise<boolean> };
    first.requestClose = vi.fn(async () => true);
    second.requestClose = vi.fn(async () => false);
    await controller.closeBranch(root);
    expect(controller.hasPage(root)).toBe(true);
    expect(controller.hasPage(child)).toBe(true);
    expect(second.destroyed).toBe(false);
  });
  it('does not issue duplicate prompts for repeated close requests', async () => {
    const { controller, hosts } = setup();
    const id = controller.createPage({ url: 'https://forms.example/' });
    let resolve: (allowed: boolean) => void = () => {};
    const pending = new Promise<boolean>((done) => {
      resolve = done;
    });
    const host = hosts[0]! as FakeHost & { requestClose(): Promise<boolean> };
    host.requestClose = vi.fn(() => pending);
    const closing = controller.closePage(id);
    controller.closePage(id);
    expect(host.requestClose).toHaveBeenCalledTimes(1);
    resolve(false);
    await closing;
    expect(controller.hasPage(id)).toBe(true);
  });
  it('does not discard edited pages to meet the memory budget', () => {
    const { controller, hosts } = setup({ maxLiveViews: 1 });
    const first = controller.createPage({ url: 'https://forms.example/' });
    hosts[0]!.events.onStateChange({ hasFormEdits: true });
    controller.createPage({ url: 'https://other.example/' });
    expect(hosts[0]!.destroyed).toBe(false);
    controller.discard(first);
    expect(hosts[0]!.destroyed).toBe(false);
    expect(controller.snapshot().pages[first]!.hasFormEdits).toBe(true);
  });
});

it('opens a restored child with its destination before publishing it as active', () => {
  const { controller, latest, hosts } = setup();
  const root = controller.createPage({ url: 'https://example.com/' });
  const child = controller.createChildPage(root, 'https://www.wikipedia.org/');
  expect(latest().activePageId).toBe(child);
  expect(latest().pages[child]?.url).toBe('https://www.wikipedia.org/');
  expect(hosts.at(-1)?.loaded).toEqual(['https://www.wikipedia.org/']);
});
