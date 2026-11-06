import {
  installPrompt,
  isWebStoreFrame,
  permissionWarnings,
  WEB_STORE_ORIGIN,
} from './web-store';

describe('isWebStoreFrame', () => {
  it('accepts only the store’s own top-level page', () => {
    expect(isWebStoreFrame({ origin: WEB_STORE_ORIGIN, parent: null })).toBe(
      true,
    );
  });

  it('refuses a lookalike address the library’s own check would let through', () => {
    const origin = `${WEB_STORE_ORIGIN}.evil.example`;
    expect(origin.startsWith(WEB_STORE_ORIGIN)).toBe(true);
    expect(isWebStoreFrame({ origin, parent: null })).toBe(false);
  });

  it('refuses the store when another page embeds it', () => {
    expect(isWebStoreFrame({ origin: WEB_STORE_ORIGIN, parent: {} })).toBe(
      false,
    );
  });
});

describe('permissionWarnings', () => {
  it('says plainly when an extension can reach every site', () => {
    for (const pattern of ['<all_urls>', '*://*/*', 'https://*/*']) {
      expect(permissionWarnings({ host_permissions: [pattern] })).toEqual([
        'Read and change everything on every site you visit',
      ]);
    }
  });

  it('counts a content script’s sites as reach', () => {
    expect(
      permissionWarnings({
        content_scripts: [{ matches: ['https://*.example.com/*'] }],
      }),
    ).toEqual(['Read and change everything on example.com']);
  });

  it('reads Manifest V2 site patterns from its permissions', () => {
    expect(permissionWarnings({ permissions: ['<all_urls>'] })).toEqual([
      'Read and change everything on every site you visit',
    ]);
  });

  it('names a few sites and counts many', () => {
    const hosts = ['a.example', 'b.example', 'c.example', 'd.example'].map(
      (host) => `https://${host}/*`,
    );
    expect(permissionWarnings({ host_permissions: hosts })).toEqual([
      'Read and change everything on 4 sites',
    ]);
    expect(permissionWarnings({ host_permissions: hosts.slice(0, 2) })).toEqual(
      ['Read and change everything on a.example, b.example'],
    );
  });

  it('puts the serious permissions first and says each thing once', () => {
    expect(
      permissionWarnings({
        permissions: ['notifications', 'tabs', 'webNavigation', 'debugger'],
      }),
    ).toEqual([
      'Read and change everything in the pages it debugs',
      'See the address of every page you open',
      'Show notifications',
    ]);
  });

  it('ignores a malformed manifest', () => {
    expect(
      permissionWarnings({
        permissions: 'tabs',
        host_permissions: [1, null],
        content_scripts: [null, { matches: 'nope' }],
      }),
    ).toEqual([]);
  });
});

describe('installPrompt', () => {
  it('names the extension and lists what it can reach', () => {
    const { message, detail } = installPrompt('Dark Reader', {
      host_permissions: ['<all_urls>'],
    });
    expect(message).toBe('Add “Dark Reader” to Splash?');
    expect(detail).toContain(
      '• Read and change everything on every site you visit',
    );
  });

  it('says so when an extension asks for nothing', () => {
    expect(installPrompt('Quiet', {}).detail).toContain(
      'doesn’t ask for access',
    );
  });
});
