import { contextBridge, ipcRenderer } from 'electron';
import {
  LOCATION_REFUSED,
  PAGE_SETTINGS,
  PASSKEY_REQUESTED,
  type PageSettings,
} from '../shared/page-bridge';
import { watchLocationRefusals } from './location-refusals';

/*
 * Applies, before the page's own scripts run, the settings a request hook
 * can't: what scripts in this frame see, and what the document does by
 * itself. Runs in every frame of the web session. Extension pages have their
 * own rules.
 */

/* The next three run in the page's world, so they may use nothing from here. */

function announcePrivacySignal(): void {
  Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', {
    get: () => true,
    configurable: true,
    enumerable: true,
  });
  Object.defineProperty(Navigator.prototype, 'doNotTrack', {
    get: () => '1',
    configurable: true,
    enumerable: true,
  });
}

/** Request hooks stop cookies on the wire; this stops them in the frame. */
function hideCookies(): void {
  Object.defineProperty(Document.prototype, 'cookie', {
    get: () => '',
    set() {},
    configurable: true,
  });
  Object.defineProperty(window, 'cookieStore', {
    value: undefined,
    configurable: true,
  });
}

/** Catches what never reaches the document: `new Audio().play()`. */
function holdPlayCalls(): void {
  const { play } = HTMLMediaElement.prototype;
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    return navigator.userActivation.hasBeenActive
      ? play.call(this)
      : Promise.reject(
          new DOMException('Autoplay is off for this site.', 'NotAllowedError'),
        );
  };
}

/** Stops media the `autoplay` attribute started, however it was created. */
function holdAutoplayAttribute(): void {
  window.addEventListener(
    'play',
    (event) => {
      if (
        event.target instanceof HTMLMediaElement &&
        !navigator.userActivation.hasBeenActive
      ) {
        event.target.pause();
      }
    },
    { capture: true },
  );
}

/**
 * Lets a site see it hasn't been answered yet. Once the user answers, what
 * Chromium reports is true again, so each request ends the pretence for what
 * it asked about. Asking still goes through Splash's prompt; nothing is granted.
 */
function reportUndecidedAsUnasked(names: string[]): void {
  const undecided = new Set(names);
  const unasked = (name: string, state: string, asked: string) =>
    state === 'denied' && undecided.has(name) ? asked : state;

  const nativeState = Object.getOwnPropertyDescriptor(
    PermissionStatus.prototype,
    'state',
  )!.get!;
  const { query } = Permissions.prototype;
  Permissions.prototype.query = async function (
    this: Permissions,
    descriptor: PermissionDescriptor,
  ) {
    const status = await query.call(this, descriptor);
    Object.defineProperty(status, 'state', {
      get: () =>
        unasked(descriptor.name, nativeState.call(status) as string, 'prompt'),
      configurable: true,
    });
    return status;
  };

  if ('Notification' in window) {
    const nativePermission = Object.getOwnPropertyDescriptor(
      Notification,
      'permission',
    )!.get!;
    Object.defineProperty(Notification, 'permission', {
      get: () =>
        unasked(
          'notifications',
          nativePermission.call(Notification) as string,
          'default',
        ),
      configurable: true,
      enumerable: true,
    });
    const { requestPermission } = Notification;
    Notification.requestPermission = function (callback) {
      return requestPermission.call(Notification).then((answer) => {
        undecided.delete('notifications');
        callback?.(answer);
        return answer;
      });
    };
  }

  if ('mediaDevices' in navigator) {
    const { getUserMedia } = MediaDevices.prototype;
    MediaDevices.prototype.getUserMedia = function (
      this: MediaDevices,
      constraints,
    ) {
      const answered = () => {
        if (constraints?.video) undecided.delete('camera');
        if (constraints?.audio) undecided.delete('microphone');
      };
      const asked = getUserMedia.call(this, constraints);
      asked.then(answered, answered);
      return asked;
    };
  }

  if ('geolocation' in navigator) {
    const answered =
      <T>(then?: ((value: T) => void) | null) =>
      (value: T) => {
        undecided.delete('geolocation');
        then?.(value);
      };
    const { getCurrentPosition, watchPosition } = Geolocation.prototype;
    Geolocation.prototype.getCurrentPosition = function (
      this: Geolocation,
      success,
      failure,
      options,
    ) {
      getCurrentPosition.call(
        this,
        answered(success),
        answered(failure),
        options,
      );
    };
    Geolocation.prototype.watchPosition = function (
      this: Geolocation,
      success,
      failure,
      options,
    ) {
      return watchPosition.call(
        this,
        answered(success),
        answered(failure),
        options,
      );
    };
  }
}

/** With scripts refused, the page's fallback for that case has to appear. */
function showNoscriptContent(): void {
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      for (const element of document.querySelectorAll('noscript')) {
        const template = document.createElement('template');
        template.innerHTML = element.textContent ?? '';
        element.replaceWith(template.content);
      }
    },
    { once: true },
  );
}

/** A site that isn't allowed to float a video finds it just isn't possible. */
function refusePictureInPicture(): void {
  HTMLVideoElement.prototype.requestPictureInPicture = () =>
    Promise.reject(
      new DOMException(
        'Picture in picture is off for this site.',
        'NotAllowedError',
      ),
    );
  Object.defineProperty(Document.prototype, 'pictureInPictureEnabled', {
    get: () => false,
    configurable: true,
  });
}

/**
 * Nothing in Splash can answer a passkey request yet, and Chromium shows no
 * prompt of its own, so the user would just see a page spinning. This reports
 * requests the user is meant to answer; it changes nothing about them, so a
 * security key or a password manager extension can still take them.
 */
function watchPasskeyRequests(report: () => void): void {
  const { get, create } = CredentialsContainer.prototype;
  const isForUser = (options?: CredentialRequestOptions) =>
    !!options?.publicKey && options.mediation !== 'conditional';
  CredentialsContainer.prototype.get = function (
    this: CredentialsContainer,
    options?: CredentialRequestOptions,
  ) {
    if (isForUser(options)) report();
    return get.call(this, options);
  };
  CredentialsContainer.prototype.create = function (
    this: CredentialsContainer,
    options?: CredentialCreationOptions,
  ) {
    if (options?.publicKey) report();
    return create.call(this, options);
  };
}

function pageSettings(): PageSettings | null {
  if (location.protocol === 'chrome-extension:') return null;
  try {
    // A blank frame's `location` says nothing; its origin is its creator's.
    const frameUrl = window.origin === 'null' ? location.href : window.origin;
    return ipcRenderer.sendSync(
      PAGE_SETTINGS,
      window === window.top ? location.href : frameUrl,
      window === window.top,
    ) as PageSettings | null;
  } catch {
    return null;
  }
}

export const settings = pageSettings();
if (settings?.privacySignal) {
  contextBridge.executeInMainWorld({ func: announcePrivacySignal });
}
if (settings?.blockCookies) {
  contextBridge.executeInMainWorld({ func: hideCookies });
}
if (settings?.blockAutoplay) {
  contextBridge.executeInMainWorld({ func: holdPlayCalls });
  holdAutoplayAttribute();
}
if (settings?.blockScripts) showNoscriptContent();
if (settings?.blockPictureInPicture) {
  contextBridge.executeInMainWorld({ func: refusePictureInPicture });
}
if (settings && window.isSecureContext) {
  contextBridge.executeInMainWorld({
    func: watchPasskeyRequests,
    args: [() => ipcRenderer.send(PASSKEY_REQUESTED)],
  });
  contextBridge.executeInMainWorld({
    func: watchLocationRefusals,
    args: [() => ipcRenderer.send(LOCATION_REFUSED)],
  });
}
if (settings && settings.undecided.length > 0) {
  contextBridge.executeInMainWorld({
    func: reportUndecidedAsUnasked,
    args: [settings.undecided],
  });
}
