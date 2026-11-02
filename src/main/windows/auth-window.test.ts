import { EventEmitter } from 'node:events';
import type { AuthInfo, BaseWindow, WebContents } from 'electron';
import { authenticationTarget, requestAuthentication } from './auth-window';
const mock = vi.hoisted(() => ({ windows: [] as unknown[] }));
vi.mock('./shell-url', () => ({
  shellUrl: () => 'https://shell.test/',
  isSameDocument: (a: string, b: string) => a.split('#')[0] === b.split('#')[0],
}));
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  let id = 100;
  class Window extends EventEmitter {
    static fromId() {
      return undefined;
    }
    webContents = Object.assign(new EventEmitter(), {
      id: ++id,
      setWindowOpenHandler: vi.fn(),
    });
    dead = false;
    constructor() {
      super();
      mock.windows.push(this);
    }
    isDestroyed() {
      return this.dead;
    }
    destroy() {
      this.dead = true;
      this.emit('closed');
    }
    async loadURL() {}
    show() {}
  }
  return { BrowserWindow: Window, nativeTheme: { shouldUseDarkColors: false } };
});
function setup() {
  const page = Object.assign(new EventEmitter(), {
    id: 1,
  }) as unknown as WebContents;
  const callback = vi.fn();
  requestAuthentication(
    { id: 2 } as BaseWindow,
    page,
    'https://private.example/',
    { host: 'private.example', isProxy: false } as AuthInfo,
    callback,
  );
  const prompt = mock.windows.at(-1) as {
    webContents: WebContents;
    emit(name: string): void;
    dead: boolean;
  };
  return {
    page,
    callback,
    prompt,
    target: authenticationTarget(prompt.webContents)!,
  };
}
it('only exposes the challenge and credential response to the auth window', () => {
  const { target, page } = setup();
  expect(target.invoke['auth:challenge']?.(undefined)).toEqual({
    origin: 'https://private.example',
    host: 'private.example',
    secure: true,
    isProxy: false,
  });
  expect(target.invoke['browser:get-snapshot']).toBeUndefined();
  page.emit('destroyed');
});
it('cancels exactly once and removes handlers when the page disappears', () => {
  const { page, callback, prompt } = setup();
  page.emit('destroyed');
  prompt.emit('closed');
  expect(callback).toHaveBeenCalledOnce();
  expect(callback).toHaveBeenCalledWith(undefined, undefined);
  expect(authenticationTarget(prompt.webContents)).toBeNull();
  expect(page.listenerCount('did-start-navigation')).toBe(0);
});
it('sends credentials once and retires the prompt', async () => {
  const { target, callback, prompt } = setup();
  await target.invoke['auth:respond']?.({
    username: 'test-user',
    password: 'test-only',
  });
  await new Promise((resolve) => setImmediate(resolve));
  expect(callback).toHaveBeenCalledWith('test-user', 'test-only');
  expect(callback).toHaveBeenCalledOnce();
  expect(prompt.dead).toBe(true);
});
it('cancels when navigating away but keeps same-document navigation', () => {
  const { page, callback } = setup();
  page.emit('did-start-navigation', {
    isMainFrame: true,
    isSameDocument: true,
  });
  expect(callback).not.toHaveBeenCalled();
  page.emit('did-start-navigation', {
    isMainFrame: true,
    isSameDocument: false,
  });
  expect(callback).toHaveBeenCalledOnce();
});
