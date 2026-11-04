import { keepOpenedFiles } from './opened-files';
import { allowLocalFile, forgetLocalFiles, isPageUrl } from './url';

function fakeStore(saved: string | null = null) {
  const values = new Map<string, string>();
  if (saved !== null) values.set('opened-files', saved);
  return {
    getPreference: (key: string) => values.get(key) ?? null,
    setPreference: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    saved: () => JSON.parse(values.get('opened-files') ?? '[]') as string[],
  };
}

afterEach(() => forgetLocalFiles([]));

it('allows the saved files again after a restart, and no others', () => {
  const store = fakeStore('["file:///Users/me/saved.pdf"]');
  keepOpenedFiles(store);
  expect(isPageUrl('file:///Users/me/saved.pdf')).toBe(true);
  expect(isPageUrl('file:///etc/passwd')).toBe(false);
  // Reading the list back is not a change to save.
  expect(store.setPreference).not.toHaveBeenCalled();
});

it('saves each newly opened file', () => {
  const store = fakeStore();
  keepOpenedFiles(store);
  allowLocalFile('file:///Users/me/My%20Report.pdf');
  expect(store.saved()).toEqual(['file:///Users/me/My%20Report.pdf']);
});

it('forgets files on request, keeping the ones still open', () => {
  const store = fakeStore();
  keepOpenedFiles(store);
  allowLocalFile('file:///Users/me/open.pdf');
  allowLocalFile('file:///Users/me/closed.pdf');
  forgetLocalFiles(['file:///Users/me/open.pdf']);
  expect(store.saved()).toEqual(['file:///Users/me/open.pdf']);
  expect(isPageUrl('file:///Users/me/closed.pdf')).toBe(false);
});

it.each(['not json', '{"a":1}', '[1,null]'])(
  'ignores a damaged list (%s)',
  (saved) => {
    expect(() => keepOpenedFiles(fakeStore(saved))).not.toThrow();
  },
);

it('still opens the file when saving the list fails', () => {
  const store = fakeStore();
  store.setPreference.mockImplementation(() => {
    throw new Error('disk full');
  });
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  keepOpenedFiles(store);
  allowLocalFile('file:///Users/me/a.pdf');
  expect(isPageUrl('file:///Users/me/a.pdf')).toBe(true);
  error.mockRestore();
});
