import { EventEmitter } from 'node:events';
import type { BaseWindow, BrowserWindow, Session } from 'electron';
import {
  popupHandleFor,
  popupWindowOptions,
  wirePopupWindow,
} from './popup-window';

vi.mock('electron', () => ({}));

let nextId = 1;

function fakePopup() {
  const contents = Object.assign(new EventEmitter(), {
    id: nextId++,
    getURL: () => 'https://example.com/',
    setWindowOpenHandler: vi.fn(),
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
  it('opens the address in the trail instead, where the warning can be read', async () => {
    const { popup, contents, openPage } = fakePopup();
    popupHandleFor(contents)!.flaggedDangerous('https://phish.example/login');
    await new Promise((resolve) => setImmediate(resolve));
    expect(openPage).toHaveBeenCalledWith('https://phish.example/login');
    expect(popup.close).toHaveBeenCalledOnce();
  });

  it('does it once, however often the popup tries', async () => {
    const { popup, contents, openPage } = fakePopup();
    const handle = popupHandleFor(contents)!;
    handle.flaggedDangerous('https://phish.example/a');
    handle.flaggedDangerous('https://phish.example/b');
    await new Promise((resolve) => setImmediate(resolve));
    expect(openPage).toHaveBeenCalledOnce();
    expect(popup.close).toHaveBeenCalledOnce();
  });

  it('leaves an ordinary popup alone', () => {
    const { popup, openPage } = fakePopup();
    expect(openPage).not.toHaveBeenCalled();
    expect(popup.close).not.toHaveBeenCalled();
  });

  it('forgets a popup once it has closed', () => {
    const { contents } = fakePopup();
    contents.emit('destroyed');
    expect(popupHandleFor(contents)).toBeNull();
  });

  it('knows nothing of contents that aren’t popups', () => {
    expect(popupHandleFor(undefined)).toBeNull();
    expect(popupHandleFor({ id: 9999 })).toBeNull();
  });
});
