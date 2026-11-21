import { EventEmitter } from 'node:events';
import type { BaseWindow, BrowserWindow, Session } from 'electron';
import { popupWindowOptions, wirePopupWindow } from './popup-window';

vi.mock('electron', () => ({}));

const rules = vi.hoisted(() => ({
  isDangerous: vi.fn((url: string) => url.includes('phish.example')),
  upgradeOf: vi.fn((url: string) =>
    url.startsWith('http:') ? url.replace(/^http:/, 'https:') : null,
  ),
  allowPlain: vi.fn(async () => undefined),
}));
vi.mock('../privacy/helper-extension', () => ({
  sessionRulesFor: () => rules,
}));

const ERR_BLOCKED_BY_CLIENT = -20;
const ERR_CONNECTION_REFUSED = -102;

let nextId = 1;

function fakePopup() {
  const contents = Object.assign(new EventEmitter(), {
    id: nextId++,
    getURL: () => 'https://example.com/',
    setWindowOpenHandler: vi.fn(),
    isDestroyed: () => false,
    loadURL: vi.fn(async () => undefined),
  });
  const popup = Object.assign(new EventEmitter(), {
    webContents: contents,
    isDestroyed: vi.fn(() => false),
    close: vi.fn(),
    setTitle: vi.fn(),
  });
  const openPage = vi.fn();
  wirePopupWindow(popup as unknown as BrowserWindow, openPage);
  return { popup, contents, openPage };
}

describe('a popup’s settings', () => {
  const options = popupWindowOptions(
    {} as BaseWindow,
    {} as Session,
  ).webPreferences!;

  it('runs the privacy preloads in its frames too, as a page does', () => {
    expect(options.nodeIntegrationInSubFrames).toBe(true);
  });

  it('still gives the web no Node.js', () => {
    expect(options.sandbox).toBe(true);
    expect(options.nodeIntegration).toBe(false);
    expect(options.contextIsolation).toBe(true);
  });
});

describe('a popup sent to a site reported as dangerous', () => {
  const failed = (contents: EventEmitter, code: number, url: string) =>
    contents.emit('did-fail-load', {}, code, '', url, true);

  it('opens the address in the trail instead, where the warning can be read', () => {
    const { popup, contents, openPage } = fakePopup();
    failed(contents, ERR_BLOCKED_BY_CLIENT, 'https://phish.example/login');
    expect(openPage).toHaveBeenCalledWith('https://phish.example/login');
    expect(popup.close).toHaveBeenCalledOnce();
  });

  it('does it once, however often the popup tries', () => {
    const { popup, contents, openPage } = fakePopup();
    failed(contents, ERR_BLOCKED_BY_CLIENT, 'https://phish.example/a');
    failed(contents, ERR_BLOCKED_BY_CLIENT, 'https://phish.example/b');
    expect(openPage).toHaveBeenCalledOnce();
    expect(popup.close).toHaveBeenCalledOnce();
  });

  it('leaves a popup alone that uBlock Origin blocked', () => {
    const { popup, contents, openPage } = fakePopup();
    failed(contents, ERR_BLOCKED_BY_CLIENT, 'https://ads.example/');
    expect(openPage).not.toHaveBeenCalled();
    expect(popup.close).not.toHaveBeenCalled();
  });
});

describe('a popup HTTPS-only mode sent to HTTPS', () => {
  it('falls back to HTTP once the helper lets the plain address through', async () => {
    const { contents } = fakePopup();
    contents.emit('did-start-navigation', {
      url: 'http://plain.example/',
      isMainFrame: true,
      isSameDocument: false,
    });
    contents.emit(
      'did-fail-load',
      {},
      ERR_CONNECTION_REFUSED,
      '',
      'https://plain.example/',
      true,
    );
    await vi.waitFor(() =>
      expect(contents.loadURL).toHaveBeenCalledWith('http://plain.example/'),
    );
    expect(rules.allowPlain).toHaveBeenCalledWith(
      contents.id,
      'http://plain.example/',
    );
  });
});
