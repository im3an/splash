import type { SplashApi } from '../../shared/api';
import type { Notice } from '../../shared/types';
import { noticeMessage, noticeToast, undoMessage } from './notices';

describe('undoMessage', () => {
  it('shortens long names so the page count always shows', () => {
    const message = undoMessage({
      kind: 'workspace',
      label: 'Research and reading for the long project',
      pageCount: 2,
      serial: 1,
    });
    expect(message).toBe(
      'Deleted workspace “Research and reading fo…” and its 2 pages.',
    );
  });

  it('describes pages and empty workspaces', () => {
    expect(
      undoMessage({ kind: 'pages', label: 'Docs', pageCount: 1, serial: 1 }),
    ).toBe('Closed “Docs”.');
    expect(
      undoMessage({ kind: 'pages', label: 'Docs', pageCount: 3, serial: 1 }),
    ).toBe('Closed “Docs” and 2 more.');
    expect(
      undoMessage({
        kind: 'workspace',
        label: 'Work',
        pageCount: 0,
        serial: 1,
      }),
    ).toBe('Deleted workspace “Work”.');
  });

  it('describes a deleted group, with or without pages', () => {
    expect(
      undoMessage({ kind: 'group', label: 'Trip', pageCount: 3, serial: 1 }),
    ).toBe('Deleted group “Trip” and its 3 pages.');
    expect(
      undoMessage({ kind: 'group', label: 'Trip', pageCount: 0, serial: 1 }),
    ).toBe('Deleted group “Trip”.');
  });
});

describe('noticeMessage', () => {
  it('says what was copied', () => {
    expect(
      noticeMessage({ kind: 'copied', what: 'link', subject: 'Docs' }),
    ).toBe('Copied link to “Docs”.');
    expect(noticeMessage({ kind: 'copied', what: 'link', subject: null })).toBe(
      'Copied link.',
    );
    expect(
      noticeMessage({ kind: 'copied', what: 'image', subject: null }),
    ).toBe('Copied image.');
  });

  it('says where a branch moved', () => {
    const moved = {
      kind: 'moved',
      pageId: 'p',
      label: 'Docs',
      workspaceId: 'w',
      workspaceName: 'Research',
      origin: { workspaceId: 'h', parentId: null, index: 0, wasActive: false },
      index: 3,
    } as const;
    expect(noticeMessage({ ...moved, pageCount: 1 })).toBe(
      'Moved “Docs” to Research.',
    );
    expect(noticeMessage({ ...moved, pageCount: 3 })).toBe(
      'Moved “Docs” and 2 more to Research.',
    );
  });

  it('confirms pinning and explains a pinned page that stayed', () => {
    const origin = { parentId: null, index: 2 };
    const at = { parentId: null, index: 0 };
    expect(
      noticeMessage({
        kind: 'pinned',
        pageId: 'p',
        label: 'Inbox',
        pinned: true,
        origin,
        at,
      }),
    ).toBe('Pinned “Inbox” to the top of the trail.');
    expect(
      noticeMessage({
        kind: 'pinned',
        pageId: 'p',
        label: 'Inbox',
        pinned: false,
        origin,
        at,
      }),
    ).toBe('Unpinned “Inbox”.');
    expect(
      noticeMessage({
        kind: 'kept-pinned',
        pageId: 'p',
        label: 'Inbox',
        asleep: true,
      }),
    ).toBe('“Inbox” is pinned, so it went to sleep instead.');
    expect(
      noticeToast({
        kind: 'kept-pinned',
        pageId: 'p',
        label: 'Inbox',
        asleep: false,
      }).actions.map((action) => action.label),
    ).toEqual(['Unpin and close']);
  });
});

describe('a word added to the dictionary', () => {
  it('confirms it, with a way to take it out', () => {
    const toast = noticeToast({ kind: 'word-added', word: 'Splashy' });
    expect(toast.message).toBe('Added “Splashy” to the dictionary.');
    const [undo] = toast.actions;
    expect(undo?.icon).toBe('undo');
    expect(undo?.redo).toBeTypeOf('function');
  });

  it('says so when the word wasn’t kept', () => {
    const toast = noticeToast({ kind: 'word-not-added', word: 'Splashy' });
    expect(toast.message).toBe('Couldn’t add “Splashy” to the dictionary.');
    expect(toast.actions).toEqual([]);
  });
});

describe('a permission macOS refused', () => {
  const notice: Notice = {
    kind: 'system-permission-refused',
    permissions: ['location'],
    host: 'maps.example',
  };

  it('says what can’t happen, and why', () => {
    expect(noticeMessage(notice)).toBe(
      'maps.example can’t use your location, because macOS hasn’t allowed Splash to.',
    );
  });

  it('offers the place to change it', async () => {
    const openPermissionSettings = vi.fn(async () => undefined);
    vi.stubGlobal('window', {
      splash: { openPermissionSettings } as unknown as SplashApi,
    });
    const toast = noticeToast(notice);
    expect(toast.detail).toBe(
      'Turn it on in System Settings, then reload the page.',
    );
    expect(toast.actions.map((action) => action.label)).toEqual([
      'Open System Settings',
    ]);
    await toast.actions[0]!.run();
    expect(openPermissionSettings).toHaveBeenCalledWith('location');
    vi.unstubAllGlobals();
  });
});
