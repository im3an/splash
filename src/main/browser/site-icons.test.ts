import { describe, expect, it, vi } from 'vitest';
import { SiteIcons } from './site-icons';

const icon = (type: string | null, bytes = 3, ok = true) => ({
  ok,
  headers: { get: () => type },
  arrayBuffer: async () => new ArrayBuffer(bytes),
});

describe('SiteIcons', () => {
  it('gives the icon as an inline image, asking once per site', async () => {
    const fetch = vi.fn(async () => icon('image/x-icon; charset=binary'));
    const icons = new SiteIcons(fetch);
    expect(await icons.get('https://a.example')).toBe(
      'data:image/x-icon;base64,AAAA',
    );
    await icons.get('https://a.example');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]).toEqual([
      'https://a.example/favicon.ico',
      expect.anything(),
    ]);
  });

  it('refuses what isn’t a usable image', async () => {
    for (const answer of [
      icon('image/x-icon', 3, false),
      icon('text/html'),
      icon(null),
      icon('image/png', 0),
      icon('image/png', 2 * 1024 * 1024),
    ]) {
      const icons = new SiteIcons(async () => answer);
      expect(await icons.get('https://a.example')).toBeNull();
    }
  });

  it('gives nothing when the site can’t be reached', async () => {
    const icons = new SiteIcons(async () => {
      throw new Error('offline');
    });
    expect(await icons.get('https://a.example')).toBeNull();
  });
});
