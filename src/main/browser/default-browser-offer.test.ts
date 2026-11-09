import { describe, expect, it } from 'vitest';
import { DefaultBrowserOffer, OFFER_ON_DAY } from './default-browser-offer';

const DAY = 24 * 60 * 60 * 1000;

function setup(status = { isDefault: false, canChange: true }) {
  const saved = new Map<string, string>();
  const store = {
    getPreference: (key: string) => saved.get(key) ?? null,
    setPreference: (key: string, value: string) => void saved.set(key, value),
  };
  let time = new Date(2026, 10, 1, 9).getTime();
  const launch = () =>
    new DefaultBrowserOffer({ store, status: () => status, now: () => time });
  return {
    status,
    launch,
    nextDay: () => (time += DAY),
    laterToday: () => (time += 60 * 60 * 1000),
  };
}

describe('DefaultBrowserOffer', () => {
  it('asks once, on the third day Splash is opened', () => {
    const test = setup();
    for (let day = 1; day < OFFER_ON_DAY; day++) {
      const offer = test.launch();
      offer.countLaunch();
      expect(offer.take()).toBe(false);
      test.nextDay();
    }
    const offer = test.launch();
    offer.countLaunch();
    expect(offer.take()).toBe(true);
    expect(offer.take()).toBe(false);
    test.nextDay();
    const later = test.launch();
    later.countLaunch();
    expect(later.take()).toBe(false);
  });

  it('counts days, not launches', () => {
    const test = setup();
    for (let launch = 0; launch < 5; launch++) {
      const offer = test.launch();
      offer.countLaunch();
      expect(offer.take()).toBe(false);
      test.laterToday();
    }
  });

  it('never asks when Splash already is the default, or a dev build', () => {
    for (const status of [
      { isDefault: true, canChange: true },
      { isDefault: false, canChange: false },
    ]) {
      const test = setup(status);
      for (let day = 0; day < OFFER_ON_DAY + 2; day++) {
        const offer = test.launch();
        offer.countLaunch();
        expect(offer.take()).toBe(false);
        test.nextDay();
      }
    }
  });

  it('stops counting once Splash was already the default', () => {
    const test = setup({ isDefault: true, canChange: true });
    for (let day = 0; day < OFFER_ON_DAY; day++) {
      const offer = test.launch();
      offer.countLaunch();
      offer.take();
      test.nextDay();
    }
    // Someone else became the default afterwards: still no nagging.
    test.status.isDefault = false;
    const offer = test.launch();
    offer.countLaunch();
    expect(offer.take()).toBe(false);
  });
});
