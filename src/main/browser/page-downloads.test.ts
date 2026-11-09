import { describe, expect, it } from 'vitest';
import { PageDownloads } from './page-downloads';

describe('PageDownloads', () => {
  it('lets a download through when someone asked for the page', () => {
    expect(new PageDownloads().starting()).toEqual({
      held: false,
      hasDocument: false,
      firstHeld: false,
    });
  });

  it('holds a download while the page is coming back by itself', () => {
    const downloads = new PageDownloads();
    downloads.comingBack();
    expect(downloads.starting().held).toBe(true);
    expect(downloads.isHolding).toBe(true);
  });

  it('keeps holding after the page commits: its script may start one', () => {
    const downloads = new PageDownloads();
    downloads.comingBack();
    downloads.committed();
    expect(downloads.starting()).toMatchObject({
      held: true,
      hasDocument: true,
    });
  });

  it('stops holding once the user acts on the page', () => {
    const downloads = new PageDownloads();
    downloads.comingBack();
    downloads.userActed();
    expect(downloads.starting().held).toBe(false);
  });

  it('says so only once, however often the page tries', () => {
    const downloads = new PageDownloads();
    downloads.comingBack();
    expect(downloads.starting().firstHeld).toBe(true);
    expect(downloads.starting().firstHeld).toBe(false);
  });
});
