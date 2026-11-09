// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SplashApi } from '../../shared/api';
import type { SavedCollection } from '../../shared/preferences';
import type { ClosedSummary, Notice } from '../../shared/types';
import { confirmUndo, useToast } from '../stores/toast-store';
import { bookmarkBranch, deleteBookmarks, moveBookmarks } from './bookmarks';
import { removeFavorite, toggleBookmark } from './collections';
import { closedToast, noticeToast } from './notices';
import { redoLast, resetTrailUndo, undoLast } from './trail-undo';

/** A library that lives in the stub, as the real one lives in the main process. */
function stubApi(collections: SavedCollection[] = []) {
  const library = { collections };
  const splash = {
    undoClose: vi.fn(async (_serial: number) => true),
    closeAgain: vi.fn(async (_serial: number): Promise<number | null> => 20),
    setPinned: vi.fn(async () => undefined),
    returnPage: vi.fn(async () => undefined),
    getPreferences: vi.fn(async () => ({ collections: library.collections })),
    updatePreferences: vi.fn(
      async (next: { collections: SavedCollection[] }) => {
        library.collections = next.collections;
      },
    ),
  };
  window.splash = splash as unknown as SplashApi;
  return { splash, library };
}

const toastText = () => {
  const toast = useToast.getState().toast;
  return (
    toast && [toast.message, toast.detail, ...toast.actions.map((a) => a.label)]
  );
};

const closed: ClosedSummary = {
  kind: 'pages',
  label: 'Atlas',
  pageCount: 1,
  serial: 10,
};

beforeEach(() => {
  resetTrailUndo();
  useToast.setState({ toast: null });
});

describe('redoing a close', () => {
  it('names the newest close at every step', async () => {
    const { splash } = stubApi();
    useToast.getState().show(closedToast(closed));
    await undoLast();
    expect(splash.undoClose).toHaveBeenLastCalledWith(10);

    splash.closeAgain.mockResolvedValueOnce(20);
    await redoLast();
    expect(splash.closeAgain).toHaveBeenLastCalledWith(10);

    await undoLast();
    expect(splash.undoClose).toHaveBeenLastCalledWith(20);
    await redoLast();
    expect(splash.closeAgain).toHaveBeenLastCalledWith(20);
  });

  it('moves on to the change before when that close already came back', async () => {
    const { splash } = stubApi();
    useToast.getState().show(closedToast(closed));
    useToast.getState().show(closedToast({ ...closed, serial: 11 }));
    splash.undoClose.mockResolvedValueOnce(false);
    expect(await undoLast()).toMatchObject({ kind: 'undone' });
    expect(splash.undoClose.mock.calls).toEqual([[11], [10]]);
  });

  it('fails plainly when the pages could not close again', async () => {
    const { splash } = stubApi();
    useToast.getState().show(closedToast(closed));
    await undoLast();
    splash.closeAgain.mockResolvedValueOnce(null);
    expect(await redoLast()).toMatchObject({ kind: 'redo-failed' });
  });
});

describe('redoing what main reported', () => {
  it('pins again, to where it landed, quietly', async () => {
    const { splash } = stubApi();
    const notice: Notice = {
      kind: 'pinned',
      pageId: 'p',
      label: 'Inbox',
      pinned: true,
      origin: { parentId: 'q', index: 4 },
      at: { parentId: null, index: 1 },
    };
    useToast.getState().show(noticeToast(notice));
    await undoLast();
    expect(splash.setPinned).toHaveBeenLastCalledWith(
      'p',
      false,
      notice.origin,
    );
    await redoLast();
    expect(splash.setPinned).toHaveBeenLastCalledWith('p', true, notice.at);
  });

  it('sends a moved page to the other workspace again', async () => {
    const { splash } = stubApi();
    const origin = {
      workspaceId: 'home',
      parentId: null,
      index: 0,
      wasActive: true,
    };
    useToast.getState().show(
      noticeToast({
        kind: 'moved',
        pageId: 'p',
        label: 'Docs',
        pageCount: 1,
        workspaceId: 'work',
        workspaceName: 'Work',
        origin,
        index: 3,
      }),
    );
    await undoLast();
    expect(splash.returnPage).toHaveBeenLastCalledWith('p', origin);
    await redoLast();
    expect(splash.returnPage).toHaveBeenLastCalledWith('p', {
      workspaceId: 'work',
      parentId: null,
      index: 3,
      wasActive: false,
    });
  });
});

describe('redoing bookmark changes', () => {
  const link = (id: string) => ({
    id,
    url: `https://${id}.example/`,
    title: id,
    faviconUrl: null,
  });
  const folder = (id: string, links: ReturnType<typeof link>[]) =>
    ({
      id,
      name: id,
      kind: 'folder',
      parentId: null,
      collapsed: false,
      links,
    }) as SavedCollection;
  const ids = (items: SavedCollection[]) =>
    items.map((item) => [item.id, ...item.links.map((l) => l.id)]);

  it('deletes again, and undoes that too', async () => {
    const { library } = stubApi([folder('f', [link('a'), link('b')])]);
    await deleteBookmarks({ linkIds: ['a'], folderIds: [] });
    expect(ids(library.collections)).toEqual([['f', 'b']]);
    await undoLast();
    expect(ids(library.collections)[0]).toContain('a');
    await redoLast();
    expect(ids(library.collections)).toEqual([['f', 'b']]);
    await undoLast();
    expect(ids(library.collections)[0]).toContain('a');
  });

  it('moves again', async () => {
    const { library } = stubApi([folder('f', [link('a')]), folder('g', [])]);
    await moveBookmarks({ linkIds: ['a'], folderIds: [] }, 'g');
    expect(ids(library.collections)).toEqual([['f'], ['g', 'a']]);
    await undoLast();
    expect(ids(library.collections)).toEqual([['f', 'a'], ['g']]);
    await redoLast();
    expect(ids(library.collections)).toEqual([['f'], ['g', 'a']]);
  });

  it('removes a link again, from every folder holding it', async () => {
    const { library } = stubApi([
      folder('f', [link('a')]),
      folder('g', [link('a')]),
    ]);
    await removeFavorite('https://a.example/', 'a');
    await undoLast();
    expect(ids(library.collections)).toEqual([
      ['f', 'a'],
      ['g', 'a'],
    ]);
    await redoLast();
    expect(ids(library.collections)).toEqual([['f'], ['g']]);
  });

  it('removes a toggled bookmark again', async () => {
    const { library } = stubApi([folder('f', [link('a')])]);
    const page = { url: 'https://a.example/', title: 'a', faviconUrl: null };
    await toggleBookmark(page as never);
    expect(ids(library.collections)).toEqual([['f']]);
    await undoLast();
    expect(ids(library.collections)).toEqual([['f', 'a']]);
    await redoLast();
    expect(ids(library.collections)).toEqual([['f']]);
  });

  it('files a bookmarked branch again', async () => {
    const { library } = stubApi();
    const snapshot = {
      pages: {
        p: {
          id: 'p',
          url: 'https://a.example/',
          title: 'A',
          childIds: [],
          parentId: null,
          faviconUrl: null,
        },
      },
    };
    await bookmarkBranch(snapshot as never, 'p', 'Branch', vi.fn());
    expect(library.collections).toHaveLength(1);
    await undoLast();
    expect(library.collections).toHaveLength(0);
    await redoLast();
    expect(library.collections.map((item) => item.name)).toEqual(['Branch']);
  });

  it('counts a library that would not save as failed', async () => {
    const { splash } = stubApi([folder('f', [link('a')])]);
    await deleteBookmarks({ linkIds: ['a'], folderIds: [] });
    await undoLast();
    splash.updatePreferences.mockRejectedValueOnce(new Error('disk full'));
    expect(await redoLast()).toMatchObject({ kind: 'redo-failed' });
  });
});

describe('the toast after undo or redo', () => {
  it('after an undo, says what and offers Redo, which then offers Undo', async () => {
    const { splash } = stubApi();
    useToast.getState().show(closedToast(closed));
    confirmUndo(await undoLast());
    expect(toastText()).toEqual([
      'Undid: Closed “Atlas”.',
      '⇧⌘Z redoes it.',
      'Redo',
    ]);

    await useToast.getState().toast!.actions[0]!.run();
    expect(splash.closeAgain).toHaveBeenCalledOnce();
    expect(toastText()).toEqual(['Closed “Atlas”.', '⌘Z undoes it.', 'Undo']);

    // That Undo runs the history's entry rather than adding another one.
    await useToast.getState().toast!.actions[0]!.run();
    expect(splash.undoClose).toHaveBeenCalledTimes(2);
    expect(toastText()?.[0]).toBe('Undid: Closed “Atlas”.');
    expect(await undoLast()).toMatchObject({ kind: 'nothing' });
  });

  it('after the first toast’s own Undo, offers Redo too', async () => {
    stubApi();
    useToast.getState().show(closedToast(closed));
    await useToast.getState().toast!.actions[0]!.run();
    expect(toastText()).toContain('Redo');
  });

  it('says so when it failed, and stays quiet with nothing to do', () => {
    useToast.getState().show({
      message: 'earlier',
      detail: null,
      durationMs: 1000,
      actions: [],
    });
    confirmUndo({ kind: 'nothing', label: '', canRedo: false });
    expect(toastText()?.[0]).toBe('earlier');

    confirmUndo({
      kind: 'redo-failed',
      label: 'Closed “Atlas”.',
      canRedo: false,
    });
    expect(toastText()).toEqual([
      'Couldn’t redo: Closed “Atlas”.',
      'It may have changed since.',
    ]);
  });
});
