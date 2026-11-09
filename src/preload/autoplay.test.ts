// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { holdAudioContexts, holdAutoplayInShadowRoots } from './autoplay';

const activation = { hasBeenActive: false };

/** Enough of Web Audio's AudioContext: it starts running, as Electron's does. */
class FakeAudioContext extends EventTarget {
  state: 'running' | 'suspended' | 'closed' = 'running';
  resume() {
    return this.become('running');
  }
  suspend() {
    return this.become('suspended');
  }
  private become(state: 'running' | 'suspended') {
    return Promise.resolve().then(() => {
      if (this.state === state) return;
      this.state = state;
      this.dispatchEvent(new Event('statechange'));
    });
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function install() {
  activation.hasBeenActive = false;
  vi.stubGlobal('AudioContext', FakeAudioContext);
  Object.defineProperty(navigator, 'userActivation', {
    value: activation,
    configurable: true,
  });
  holdAudioContexts();
  return window.AudioContext as unknown as typeof FakeAudioContext;
}

afterEach(() => vi.unstubAllGlobals());

describe('Web Audio while autoplay is off for the site', () => {
  it('holds a context made before you interacted', async () => {
    const Context = install();
    const context = new Context();
    await settle();
    expect(context.state).toBe('suspended');
  });

  it('is still an AudioContext to the page', () => {
    const Context = install();
    expect(new Context()).toBeInstanceOf(FakeAudioContext);
  });

  it('doesn’t start on resume before you interact, and starts once you do', async () => {
    const Context = install();
    const context = new Context();
    await settle();
    let resumed = false;
    void context.resume().then(() => {
      resumed = true;
    });
    await settle();
    expect(context.state).toBe('suspended');
    expect(resumed).toBe(false);

    activation.hasBeenActive = true;
    await context.resume();
    await settle();
    expect(context.state).toBe('running');
    expect(resumed).toBe(true);
  });

  it('leaves a context made after you interacted alone', async () => {
    const Context = install();
    activation.hasBeenActive = true;
    const context = new Context();
    await settle();
    expect(context.state).toBe('running');
  });
});

describe('the autoplay attribute inside a shadow root', () => {
  function media() {
    activation.hasBeenActive = false;
    Object.defineProperty(navigator, 'userActivation', {
      value: activation,
      configurable: true,
    });
    holdAutoplayInShadowRoots();
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'closed' });
    const video = document.createElement('video');
    video.pause = vi.fn();
    root.append(video);
    return video;
  }

  it('stops media a shadow root started before you interacted', () => {
    const video = media();
    video.dispatchEvent(new Event('play'));
    expect(video.pause).toHaveBeenCalled();
  });

  it('lets it play once you have', () => {
    const video = media();
    activation.hasBeenActive = true;
    video.dispatchEvent(new Event('play'));
    expect(video.pause).not.toHaveBeenCalled();
  });
});
