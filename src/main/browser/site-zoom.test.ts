import { describe, expect, it } from 'vitest';
import { rememberZoom, zoomFor, zoomHost } from './site-zoom';

const preferences = { defaultZoom: 100, siteZoom: { 'a.com': 150 } };

describe('zoomFor', () => {
  it('prefers the zoom chosen for the site', () => {
    expect(zoomFor(preferences, 'https://a.com/page')).toBe(150);
  });

  it('falls back to the default', () => {
    expect(zoomFor(preferences, 'https://b.com/')).toBe(100);
    expect(zoomFor({ defaultZoom: 125, siteZoom: {} }, 'about:blank')).toBe(
      125,
    );
  });

  it('keeps a port apart from the same host without one', () => {
    expect(zoomHost('http://localhost:3000/x')).toBe('localhost:3000');
    expect(zoomHost('file:///tmp/a.pdf')).toBeNull();
  });
});

describe('rememberZoom', () => {
  it('records a site zoomed away from the default', () => {
    expect(rememberZoom(preferences, 'https://b.com/', 90)).toEqual({
      'a.com': 150,
      'b.com': 90,
    });
  });

  it('drops a site zoomed back to the default', () => {
    expect(rememberZoom(preferences, 'https://a.com/', 100)).toEqual({});
  });

  it('has nothing to do when the zoom is what it was', () => {
    expect(rememberZoom(preferences, 'https://a.com/', 150)).toBeNull();
    expect(rememberZoom(preferences, 'https://b.com/', 100)).toBeNull();
    expect(rememberZoom(preferences, 'about:blank', 150)).toBeNull();
  });
});
