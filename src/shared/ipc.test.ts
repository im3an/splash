import { invokeContract, sendContract } from './ipc';

const PAGE = '6f1c1d3e-8b7a-4c55-9d2e-0a1b2c3d4e5f';

describe('IPC contract', () => {
  it('accepts well-formed input', () => {
    expect(
      invokeContract['page:navigate'].parse({ pageId: PAGE, input: ' a.com ' }),
    ).toEqual({
      pageId: PAGE,
      input: 'a.com',
    });
    expect(invokeContract['page:create'].parse({})).toEqual({});
  });

  it.each([
    ['page:activate', { pageId: 'not-a-uuid' }],
    ['page:activate', { pageId: PAGE, extra: true }],
    ['page:navigate', { pageId: PAGE, input: '   ' }],
    ['page:navigate', { pageId: PAGE, input: 'x'.repeat(9000) }],
    ['page:set-collapsed', { pageId: PAGE, collapsed: 'yes' }],
    ['browser:get-snapshot', { anything: 1 }],
  ] as const)('rejects malformed %s input', (channel, input) => {
    expect(invokeContract[channel].safeParse(input).success).toBe(false);
  });

  it('rejects impossible content insets', () => {
    const schema = sendContract['view:set-content-insets'];
    expect(
      schema.safeParse({ top: 48, right: 8, bottom: 8, left: 260 }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ top: -1, right: 8, bottom: 8, left: 260 }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ top: Number.NaN, right: 8, bottom: 8, left: 260 })
        .success,
    ).toBe(false);
  });
});

it('preserves a saved favicon through the history Undo contract', () => {
  const entry = {
    url: 'https://example.com/',
    title: 'Example',
    visitCount: 1,
    lastVisitedAt: 10,
    faviconUrl: 'https://example.com/favicon.ico',
  };
  expect(invokeContract['history:restore'].parse({ entry })).toEqual({ entry });
});

describe('library and toolbar validation', () => {
  it('rejects duplicate toolbar actions and unsafe bookmark URLs', async () => {
    const { preferencesSchema } = await import('./ipc');
    const { DEFAULT_PREFERENCES } = await import('./preferences');
    expect(
      preferencesSchema.safeParse({
        ...DEFAULT_PREFERENCES,
        toolbarActions: ['share', 'share'],
      }).success,
    ).toBe(false);
    for (const url of [
      'javascript:alert(1)',
      'file:///etc/passwd',
      'chrome-extension://other/index.html',
    ]) {
      expect(
        preferencesSchema.safeParse({
          ...DEFAULT_PREFERENCES,
          collections: [
            {
              id: PAGE,
              name: 'Reading',
              kind: 'folder',
              collapsed: false,
              links: [{ id: PAGE, title: 'Unsafe', url }],
            },
          ],
        }).success,
      ).toBe(false);
    }
    expect(preferencesSchema.safeParse(DEFAULT_PREFERENCES).success).toBe(true);
  });
});

describe('nested collection validation', () => {
  it('accepts old collections but rejects missing parents and ancestry cycles', async () => {
    const { preferencesSchema } = await import('./ipc');
    const { DEFAULT_PREFERENCES } = await import('./preferences');
    const parent = {
      id: PAGE,
      name: 'Parent',
      kind: 'folder',
      collapsed: false,
      links: [],
    };
    const id = 'f23d7a5b-cc9d-4a27-9aa8-179bec1c6e20';
    const child = { ...parent, id, parentId: PAGE };
    const valid = (collections: unknown[]) =>
      preferencesSchema.safeParse({ ...DEFAULT_PREFERENCES, collections })
        .success;
    expect(valid([parent])).toBe(true);
    expect(valid([parent, child])).toBe(true);
    expect(valid([child])).toBe(false);
    expect(valid([{ ...parent, parentId: id }, child])).toBe(false);
    expect(valid([parent, parent])).toBe(false);
  });
});
