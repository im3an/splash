import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron';

/*
 * electron-chrome-extensions answers chrome.* calls on four `ipcMain`
 * channels and believes the extension id each message names. Any renderer
 * can send on `ipcMain`, so a web page whose renderer was taken over could
 * name an installed extension and read every cookie, open pages or reach the
 * extension's native app. Its cookie calls also skip Chrome's permission
 * checks. Splash wraps the handlers as the library registers them:
 *
 * - a message counts only from a frame of the extension it names, by the
 *   frame's real origin, which the main process knows and the renderer can't
 *   change;
 * - the remote channel (toolbar icons) answers Splash's own UI only;
 * - cookies need the `cookies` permission and host access to the site;
 * - any other `crx-` channel is refused, so a library update can't add an
 *   unguarded one unnoticed.
 *
 * Extension service workers talk on their own `ipc`, which only that worker
 * can reach; those stay as the library made them.
 */

export const MESSAGE = 'crx-msg';
export const REMOTE = 'crx-msg-remote';
export const ADD_LISTENER = 'crx-add-listener';
export const REMOVE_LISTENER = 'crx-remove-listener';
const GUARDED = [MESSAGE, REMOTE, ADD_LISTENER, REMOVE_LISTENER];

/** What a guard reads off a message. */
export interface SenderEvent {
  senderFrame: { origin: string } | null;
  sender: {
    session: {
      extensions: {
        getExtension(id: string): { manifest: Manifest } | null;
      };
    };
  };
}

export interface Manifest {
  permissions?: unknown;
  host_permissions?: unknown;
}

export interface GuardOptions {
  /** Whether a message came from Splash's own UI. */
  fromShell(event: IpcMainEvent | IpcMainInvokeEvent): boolean;
}

type Listener = (event: never, ...args: never[]) => unknown;
type Ipc = Pick<
  IpcMain,
  'handle' | 'on' | 'removeHandler' | 'removeAllListeners'
>;

/** The extension a frame belongs to, by its origin; null for any other frame. */
export function extensionOfFrame(
  frame: { origin: string } | null | undefined,
): string | null {
  const match = /^chrome-extension:\/\/([a-z0-9]+)$/.exec(frame?.origin ?? '');
  return match?.[1] ?? null;
}

/** The sender's own extension, when it is the one the message names. */
function claimedBySender(event: SenderEvent, claimed: unknown): string | null {
  const own = extensionOfFrame(event.senderFrame);
  return own !== null && own === claimed ? own : null;
}

function stringsIn(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function permissionsOf(manifest: Manifest): string[] {
  return stringsIn(manifest.permissions);
}

/** Host patterns: MV3 lists them apart, MV2 among the permissions. */
function hostPatternsOf(manifest: Manifest): string[] {
  return [
    ...stringsIn(manifest.host_permissions),
    ...permissionsOf(manifest).filter(
      (entry) => entry === '<all_urls>' || entry.includes('://'),
    ),
  ];
}

/** Whether a Chrome match pattern covers a host over http or https. */
export function patternCoversHost(
  pattern: string,
  scheme: 'http' | 'https',
  host: string,
): boolean {
  if (pattern === '<all_urls>') return true;
  const match = /^(\*|https?):\/\/([^/]+)\//.exec(pattern);
  if (!match) return false;
  const [, patternScheme, patternHost] = match;
  if (patternScheme !== '*' && patternScheme !== scheme) return false;
  const wanted = host.toLowerCase();
  const allowed = patternHost!.toLowerCase().replace(/:\d+$/, '');
  if (allowed === '*') return true;
  if (allowed.startsWith('*.')) {
    const base = allowed.slice(2);
    return wanted === base || wanted.endsWith(`.${base}`);
  }
  return wanted === allowed;
}

function coversHost(
  manifest: Manifest,
  scheme: 'http' | 'https',
  host: string,
): boolean {
  return hostPatternsOf(manifest).some((pattern) =>
    patternCoversHost(pattern, scheme, host),
  );
}

function coversUrl(manifest: Manifest, address: unknown): boolean {
  if (typeof address !== 'string') return false;
  try {
    const { protocol, hostname } = new URL(address);
    if (protocol !== 'http:' && protocol !== 'https:') return false;
    return coversHost(
      manifest,
      protocol === 'https:' ? 'https' : 'http',
      hostname,
    );
  } catch {
    return false;
  }
}

/** A cookie from `cookies.getAll`, as the library describes it. */
interface CookieDetails {
  domain?: unknown;
  secure?: unknown;
}

function coversCookie(manifest: Manifest, cookie: CookieDetails): boolean {
  if (typeof cookie.domain !== 'string') return false;
  const host = cookie.domain.replace(/^\./, '');
  // A secure cookie only ever goes to https; any other to either.
  return (
    coversHost(manifest, 'https', host) ||
    (cookie.secure !== true && coversHost(manifest, 'http', host))
  );
}

function refuse(reason: string): never {
  throw new Error(`Refused extension message: ${reason}`);
}

/**
 * Runs a cookies.* call the way Chrome would allow it: only with the
 * `cookies` permission, only for sites the extension may reach.
 */
async function cookieCall(
  manifest: Manifest,
  handlerName: string,
  args: unknown[],
  call: () => unknown,
): Promise<unknown> {
  if (!permissionsOf(manifest).includes('cookies')) {
    refuse(`${handlerName} needs the cookies permission`);
  }
  if (handlerName === 'cookies.getAllCookieStores') return call();
  if (handlerName === 'cookies.getAll') {
    const found = await call();
    return Array.isArray(found)
      ? found.filter((cookie: CookieDetails) => coversCookie(manifest, cookie))
      : found;
  }
  const details = args[0] as { url?: unknown } | undefined;
  if (!coversUrl(manifest, details?.url)) {
    refuse(`${handlerName} for a site the extension can't reach`);
  }
  return call();
}

function guardMessage(handler: Listener): Listener {
  return (async (
    event: SenderEvent,
    extensionId: unknown,
    handlerName: unknown,
    ...args: unknown[]
  ) => {
    const own = claimedBySender(event, extensionId);
    if (!own) refuse(`not from extension ${String(extensionId)}`);
    const call = () =>
      (handler as (...all: unknown[]) => unknown)(
        event,
        extensionId,
        handlerName,
        ...args,
      );
    if (typeof handlerName === 'string' && handlerName.startsWith('cookies.')) {
      const extension = event.sender.session.extensions.getExtension(own);
      if (!extension) refuse(`extension ${own} isn't loaded`);
      return cookieCall(extension.manifest, handlerName, args, call);
    }
    return call();
  }) as Listener;
}

function guardListener(handler: Listener, adding: boolean): Listener {
  return ((event: SenderEvent, extensionId: unknown, eventName: unknown) => {
    const own = claimedBySender(event, extensionId);
    if (!own) return;
    if (
      adding &&
      typeof eventName === 'string' &&
      eventName.startsWith('cookies.')
    ) {
      const manifest =
        event.sender.session.extensions.getExtension(own)?.manifest;
      if (!manifest || !permissionsOf(manifest).includes('cookies')) return;
    }
    return (handler as (...all: unknown[]) => unknown)(
      event,
      extensionId,
      eventName,
    );
  }) as Listener;
}

function guardRemote(handler: Listener, options: GuardOptions): Listener {
  return ((event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!options.fromShell(event)) refuse('remote call not from Splash');
    return (handler as (...all: unknown[]) => unknown)(event, ...args);
  }) as Listener;
}

/** Wraps one of the library's handlers; null refuses the channel. */
export function guardFor(
  channel: string,
  handler: Listener,
  options: GuardOptions,
): Listener | null {
  switch (channel) {
    case MESSAGE:
      return guardMessage(handler);
    case REMOTE:
      return guardRemote(handler, options);
    case ADD_LISTENER:
      return guardListener(handler, true);
    case REMOVE_LISTENER:
      return guardListener(handler, false);
    default:
      return null;
  }
}

let installed = false;

/**
 * Builds the extensions library with its `ipcMain` handlers wrapped. The
 * library registers them once, the first time it's built; later builds (for
 * private windows) share them, so this only watches the first.
 */
export function withGuardedExtensionIpc<T>(
  ipc: Ipc,
  options: GuardOptions,
  build: () => T,
): T {
  if (installed) return build();
  const { handle, on } = ipc;
  const seen = new Set<string>();
  const wrap = (channel: string, handler: Listener): Listener | null => {
    if (!channel.startsWith('crx-')) return handler;
    seen.add(channel);
    const guarded = guardFor(channel, handler, options);
    if (!guarded)
      console.error(`Extensions: refused unknown channel ${channel}`);
    return guarded;
  };
  ipc.handle = (channel: string, handler: Listener) => {
    const guarded = wrap(channel, handler);
    if (guarded) handle.call(ipc, channel, guarded as never);
  };
  ipc.on = ((channel: string, handler: Listener) => {
    const guarded = wrap(channel, handler);
    if (guarded) on.call(ipc, channel, guarded as never);
    return ipc;
  }) as unknown as Ipc['on'];
  try {
    return build();
  } finally {
    ipc.handle = handle;
    ipc.on = on;
    installed = true;
    const missing = GUARDED.filter((channel) => !seen.has(channel));
    if (missing.length > 0) {
      // Registered before this ran, so unguarded: extensions stop working
      // rather than go around the checks.
      console.error(`Extensions: channels not guarded: ${missing.join(', ')}`);
      for (const channel of missing) {
        ipc.removeHandler(channel);
        ipc.removeAllListeners(channel);
      }
    }
  }
}

/** Tests build the library more than once. */
export function resetGuardForTests(): void {
  installed = false;
}
