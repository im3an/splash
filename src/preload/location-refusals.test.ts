// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { watchLocationRefusals } from './location-refusals';

const DENIED = { code: 1, message: 'denied' } as GeolocationPositionError;
const UNAVAILABLE = { code: 2, message: 'none' } as GeolocationPositionError;
const TIMED_OUT = { code: 3, message: 'late' } as GeolocationPositionError;

function install({ policyAllows = true as boolean | null } = {}) {
  class FakeGeolocation {
    answer: GeolocationPositionError | null = DENIED;
    getCurrentPosition(
      success: PositionCallback,
      failure?: PositionErrorCallback | null,
    ) {
      if (this.answer) failure?.(this.answer);
      else success({} as GeolocationPosition);
    }
    watchPosition(
      success: PositionCallback,
      failure?: PositionErrorCallback | null,
    ) {
      if (this.answer) failure?.(this.answer);
      else success({} as GeolocationPosition);
      return 7;
    }
  }
  vi.stubGlobal('Geolocation', FakeGeolocation);
  Object.defineProperty(document, 'featurePolicy', {
    value:
      policyAllows === null ? undefined : { allowsFeature: () => policyAllows },
    configurable: true,
  });
  const report = vi.fn();
  watchLocationRefusals(report);
  return { geolocation: new FakeGeolocation(), report };
}

afterEach(() => vi.unstubAllGlobals());

describe('hearing that a location was refused', () => {
  it('reports a refusal and still tells the page', () => {
    const { geolocation, report } = install();
    const failure = vi.fn();
    geolocation.getCurrentPosition(vi.fn(), failure);
    expect(report).toHaveBeenCalledOnce();
    expect(failure).toHaveBeenCalledWith(DENIED);
  });

  it('reports it when the page has no failure callback of its own', () => {
    const { geolocation, report } = install();
    geolocation.getCurrentPosition(vi.fn());
    geolocation.getCurrentPosition(vi.fn(), null);
    expect(report).toHaveBeenCalledTimes(2);
  });

  it('hears it from watchPosition, and keeps its return value', () => {
    const { geolocation, report } = install();
    expect(geolocation.watchPosition(vi.fn(), vi.fn())).toBe(7);
    expect(report).toHaveBeenCalledOnce();
  });

  it('stays quiet when a location simply isn’t available', () => {
    const { geolocation, report } = install();
    const failure = vi.fn();
    for (const answer of [UNAVAILABLE, TIMED_OUT]) {
      geolocation.answer = answer;
      geolocation.getCurrentPosition(vi.fn(), failure);
    }
    expect(report).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledTimes(2);
  });

  it('stays quiet on success', () => {
    const { geolocation, report } = install();
    geolocation.answer = null;
    const success = vi.fn();
    geolocation.getCurrentPosition(success, vi.fn());
    expect(report).not.toHaveBeenCalled();
    expect(success).toHaveBeenCalledOnce();
  });

  it('doesn’t blame macOS for a frame the page itself shut out', () => {
    const { geolocation, report } = install({ policyAllows: false });
    const failure = vi.fn();
    geolocation.getCurrentPosition(vi.fn(), failure);
    expect(report).not.toHaveBeenCalled();
    expect(failure).toHaveBeenCalledWith(DENIED);
  });

  it('reports when the browser has no way to tell about the frame', () => {
    const { geolocation, report } = install({ policyAllows: null });
    geolocation.getCurrentPosition(vi.fn(), vi.fn());
    expect(report).toHaveBeenCalledOnce();
  });
});
