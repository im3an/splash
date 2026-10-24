import type { BrowserSnapshot } from '../../shared/types';
import { createMockBackend } from './mock-backend';
import { MockPageHost } from './mock-page-host';
import { describeSite } from './mock-sites';

describe('describeSite', () => {
  it('describes known pages, searches and arbitrary hosts', () => {
    expect(describeSite('https://news.ycombinator.com/').title).toBe(
      'Hacker News',
    );
    expect(describeSite('https://duckduckgo.com/?q=tree%20ux').title).toBe(
      'tree ux at DuckDuckGo',
    );
    expect(describeSite('https://example.com/guides').title).toBe(
      'Guides · Example',
    );
  });

  it('fails offline and .invalid hosts', () => {
    expect(describeSite('https://nope.invalid/').failure?.code).toBe(-105);
    expect(describeSite('https://example.com/').failure).toBeNull();
  });
});

describe('MockPageHost', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function host() {
    const events = { onStateChange: vi.fn(), onOpenRequest: vi.fn() };
    const page = new MockPageHost(events);
    const state = () =>
      Object.assign({}, ...events.onStateChange.mock.calls.map(([p]) => p));
    return { page, state };
  }

  it('loads with a delay and reports the title', () => {
    const { page, state } = host();
    page.load('https://news.ycombinator.com/');
    expect(state()).toMatchObject({ isLoading: true, canGoBack: false });
    vi.runAllTimers();
    expect(state()).toMatchObject({ isLoading: false, title: 'Hacker News' });
  });

  it('keeps a back/forward history and truncates it on a new load', () => {
    const { page, state } = host();
    page.load('https://a.com/');
    page.load('https://b.com/');
    page.load('https://c.com/');
    vi.runAllTimers();
    page.goBack();
    page.goBack();
    expect(state()).toMatchObject({
      url: 'https://a.com/',
      canGoBack: false,
      canGoForward: true,
    });
    page.goForward();
    expect(state().url).toBe('https://b.com/');
    page.load('https://d.com/');
    expect(state()).toMatchObject({ canGoBack: true, canGoForward: false });
  });

  it('stops a load in flight', () => {
    const { page, state } = host();
    page.load('https://slow.example.com/');
    page.stop();
    expect(state().isLoading).toBe(false);
    vi.runAllTimers();
    expect(state().title).toBeUndefined();
  });

  it('reports load failures as errors', () => {
    const { page, state } = host();
    page.load('https://offline.example/');
    vi.runAllTimers();
    expect(state().error).toMatchObject({ kind: 'load-failed', code: -105 });
  });
});

describe('createMockBackend', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  async function settle<T>(promise: Promise<T>): Promise<T> {
    await vi.advanceTimersByTimeAsync(20);
    return promise;
  }

  it('seeds loaded workspaces with independent trails', async () => {
    const backend = createMockBackend();
    const snapshot = await settle(backend.getSnapshot());
    expect(snapshot.workspaces.map((w) => w.name)).toEqual([
      'Personal',
      'Research',
      'Side project',
    ]);
    expect(snapshot.rootIds).toHaveLength(2);
    const pages = Object.values(snapshot.pages);
    expect(pages.every((page) => !page.isLoading && page.title)).toBe(true);
    expect(pages.some((page) => page.customTitle === 'Trails prototype')).toBe(
      true,
    );
  });

  it('pushes snapshots and makes calls fail on request', async () => {
    const backend = createMockBackend({ seed: false });
    const snapshots: BrowserSnapshot[] = [];
    backend.onSnapshot((snapshot) => snapshots.push(snapshot));
    const id = await settle(backend.createPage({ input: 'example.com' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(snapshots.at(-1)?.activePageId).toBe(id);

    backend.failNextCall();
    const failing = backend.closePage(id);
    const assertion = expect(failing).rejects.toThrow('Simulated failure');
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
  });

  it('rejects invalid operations like the real backend', async () => {
    const backend = createMockBackend({ seed: false });
    const snapshot = await settle(backend.getSnapshot());
    const failing = backend.deleteWorkspace(snapshot.activeWorkspaceId);
    const assertion = expect(failing).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
  });
});
