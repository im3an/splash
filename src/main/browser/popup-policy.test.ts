import { describe, expect, it } from 'vitest';
import {
  isGestureInput,
  judgePopup,
  UserGestures,
  type PopupRequest,
} from './popup-policy';

function request(overrides: Partial<PopupRequest> = {}): PopupRequest {
  return {
    url: 'https://ads.example/',
    disposition: 'foreground-tab',
    features: '',
    gesture: false,
    linkClick: false,
    allowed: null,
    ...overrides,
  };
}

describe('judgePopup', () => {
  it('blocks a script opening something on its own', () => {
    expect(judgePopup(request())).toBe('block');
    expect(judgePopup(request({ allowed: false }))).toBe('block');
  });

  it('opens what the user clicked for', () => {
    expect(judgePopup(request({ gesture: true }))).toBe('page');
    expect(judgePopup(request({ linkClick: true }))).toBe('page');
  });

  it('opens everything on a site the user allowed', () => {
    expect(judgePopup(request({ allowed: true }))).toBe('page');
  });

  it('stops click-triggered scripts on a blocked site, but not links', () => {
    expect(judgePopup(request({ allowed: false, gesture: true }))).toBe(
      'block',
    );
    expect(judgePopup(request({ allowed: false, linkClick: true }))).toBe(
      'page',
    );
    expect(
      judgePopup(
        request({
          allowed: false,
          gesture: true,
          disposition: 'background-tab',
        }),
      ),
    ).toBe('page');
  });

  it('keeps a sized popup a real window, so sign-in can report back', () => {
    expect(
      judgePopup(
        request({
          gesture: true,
          disposition: 'new-window',
          features: 'width=500,height=600',
        }),
      ),
    ).toBe('window');
  });

  it('opens a blank window for the opener to fill in', () => {
    expect(judgePopup(request({ gesture: true, url: 'about:blank' }))).toBe(
      'window',
    );
    expect(judgePopup(request({ url: '' }))).toBe('block');
  });

  it('treats a shift-clicked link as a page', () => {
    expect(
      judgePopup(request({ linkClick: true, disposition: 'new-window' })),
    ).toBe('page');
  });
});

describe('UserGestures', () => {
  it('lets one gesture open one thing', () => {
    const gestures = new UserGestures(() => 0);
    gestures.record();
    expect(gestures.consume()).toBe(true);
    expect(gestures.consume()).toBe(false);
  });

  it('forgets a gesture after a few seconds', () => {
    let now = 0;
    const gestures = new UserGestures(() => now);
    gestures.record();
    now = 5001;
    expect(gestures.consume()).toBe(false);
  });

  it('has nothing to spend before any input', () => {
    expect(new UserGestures(() => 0).consume()).toBe(false);
  });
});

describe('isGestureInput', () => {
  it('counts presses, not movement or releases', () => {
    expect(isGestureInput('mouseDown')).toBe(true);
    expect(isGestureInput('rawKeyDown')).toBe(true);
    expect(isGestureInput('mouseMove')).toBe(false);
    expect(isGestureInput('mouseUp')).toBe(false);
  });
});
