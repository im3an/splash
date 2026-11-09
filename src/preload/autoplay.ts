/*
 * Run in the page's own world, through `executeInMainWorld`, so each function
 * must stand alone: nothing from outside its body.
 */

/**
 * Web Audio makes sound without a media element. Electron lets a context start
 * on its own, so while autoplay is off for the site it starts held, and
 * `resume()` waits for your first interaction, as Chrome's own rule does.
 */
export function holdAudioContexts(): void {
  const Original = window.AudioContext;
  if (!Original) return;
  const { resume, suspend } = Original.prototype;
  const active = () => navigator.userActivation.hasBeenActive;

  Original.prototype.resume = function (this: AudioContext) {
    if (active()) return resume.call(this);
    // Settles when the context does start, after a later resume.
    return new Promise<void>((settle) => {
      const started = () => {
        if (this.state !== 'running') return;
        this.removeEventListener('statechange', started);
        settle();
      };
      this.addEventListener('statechange', started);
    });
  };

  const Held = function (this: unknown, ...args: unknown[]) {
    const context = Reflect.construct(
      Original,
      args,
      new.target ?? Original,
    ) as AudioContext;
    if (!active()) void suspend.call(context);
    return context;
  } as unknown as typeof AudioContext;
  Held.prototype = Original.prototype;
  Object.setPrototypeOf(Held, Original);
  Object.defineProperty(window, 'AudioContext', {
    value: Held,
    writable: true,
    configurable: true,
  });
}

/**
 * The `autoplay` attribute's `play` event stays inside a shadow root, so the
 * listener on the window never hears it. Every root a script attaches gets its
 * own. Roots written into the HTML itself aren't covered.
 */
export function holdAutoplayInShadowRoots(): void {
  const { attachShadow } = Element.prototype;
  const stop = (event: Event) => {
    if (
      event.target instanceof HTMLMediaElement &&
      !navigator.userActivation.hasBeenActive
    ) {
      event.target.pause();
    }
  };
  Element.prototype.attachShadow = function (
    this: Element,
    init: ShadowRootInit,
  ) {
    const root = attachShadow.call(this, init);
    root.addEventListener('play', stop, { capture: true });
    return root;
  };
}
