import {
  describeExtension,
  iconFile,
  loadProblem,
  parseDisabled,
  type LoadedExtension,
} from './extension-info';

const extension = (
  manifest: LoadedExtension['manifest'] = {},
): LoadedExtension => ({
  id: 'eimadpbcbfnmbkopoojfekhnkhdbieeh',
  name: 'Dark Reader',
  version: '4.9',
  path: '/data/Extensions/dark',
  manifest,
});

describe('iconFile', () => {
  it('picks the smallest icon that is big enough', () => {
    expect(
      iconFile(
        extension({ icons: { 16: 'a.png', 48: 'b.png', 128: 'c.png' } }),
      ),
    ).toBe('/data/Extensions/dark/b.png');
  });

  it('falls back to the largest there is', () => {
    expect(
      iconFile(extension({ icons: { 16: 'a.png', 32: '/icons/b.png' } })),
    ).toBe('/data/Extensions/dark/icons/b.png');
  });

  it('won’t read outside the extension', () => {
    expect(
      iconFile(extension({ icons: { 48: '../../../etc/passwd' } })),
    ).toBeNull();
  });

  it('copes with no icons and malformed ones', () => {
    expect(iconFile(extension())).toBeNull();
    expect(iconFile(extension({ icons: 'nope' }))).toBeNull();
    expect(iconFile(extension({ icons: { 48: 7, x: 'a.png' } }))).toBeNull();
  });
});

describe('describeExtension', () => {
  it('links a store extension to its listing, and no other', () => {
    expect(describeExtension(extension(), 'store', null).storeUrl).toBe(
      'https://chromewebstore.google.com/detail/eimadpbcbfnmbkopoojfekhnkhdbieeh',
    );
    expect(
      describeExtension(extension(), 'unpacked', null).storeUrl,
    ).toBeNull();
  });

  it('finds the options page either way a manifest names it', () => {
    const base = 'chrome-extension://eimadpbcbfnmbkopoojfekhnkhdbieeh';
    expect(
      describeExtension(extension({ options_page: 'o.html' }), 'store', null)
        .optionsUrl,
    ).toBe(`${base}/o.html`);
    expect(
      describeExtension(
        extension({ options_ui: { page: '/ui/o.html' } }),
        'store',
        null,
      ).optionsUrl,
    ).toBe(`${base}/ui/o.html`);
    expect(describeExtension(extension(), 'store', null).optionsUrl).toBeNull();
  });

  it('hides an untranslated description', () => {
    expect(
      describeExtension(
        extension({ description: '__MSG_extDescription__' }),
        'store',
        null,
      ).description,
    ).toBe('');
  });
});

describe('loadProblem', () => {
  it('keeps the reason and drops the path', () => {
    expect(
      loadProblem(
        new Error(
          'Loading extension at /a b/c failed with: Manifest file is missing or unreadable',
        ),
      ),
    ).toBe('Manifest file is missing or unreadable');
  });

  it('has something to say for anything else', () => {
    expect(loadProblem('odd')).toBe('That folder couldn’t be loaded.');
  });
});

describe('parseDisabled', () => {
  const info = describeExtension(extension(), 'store', null);

  it('reads back what was saved', () => {
    const saved = { [info.id]: { path: '/data/dark', info } };
    expect(parseDisabled(JSON.stringify(saved))).toEqual(saved);
  });

  it('treats a damaged file as nothing turned off', () => {
    expect(parseDisabled('{not json')).toEqual({});
    expect(parseDisabled('[]')).toEqual({});
    expect(
      parseDisabled(JSON.stringify({ a: { path: 'relative', info } })),
    ).toEqual({});
  });
});
