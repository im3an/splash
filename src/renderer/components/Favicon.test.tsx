// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { defaultIconFor, SiteIcon } from './Favicon';

afterEach(cleanup);

const iconSrc = (container: HTMLElement) =>
  container.querySelector('img')?.getAttribute('src') ?? null;

describe('defaultIconFor', () => {
  it("points at a web site's /favicon.ico", () => {
    expect(defaultIconFor('https://www.example.com/a/b?c=d')).toBe(
      'https://www.example.com/favicon.ico',
    );
    expect(defaultIconFor('http://example.com:8080/')).toBe(
      'http://example.com:8080/favicon.ico',
    );
  });

  it('has nothing for other addresses', () => {
    expect(defaultIconFor(null)).toBeNull();
    expect(defaultIconFor('view-source:https://example.com/')).toBeNull();
    expect(defaultIconFor('not a url')).toBeNull();
  });
});

describe('SiteIcon', () => {
  it("shows the page's own icon first, eagerly", () => {
    const { container } = render(
      <SiteIcon
        url="https://cdn.example.com/icon.png"
        site="https://example.com/page"
      />,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://cdn.example.com/icon.png');
    expect(img?.getAttribute('loading')).toBeNull();
  });

  it("falls back to the site's /favicon.ico, then the globe", () => {
    const { container } = render(
      <SiteIcon
        url="https://cdn.example.com/old-hash/icon.png"
        site="https://example.com/page"
      />,
    );
    fireEvent.error(container.querySelector('img')!);
    expect(iconSrc(container)).toBe('https://example.com/favicon.ico');
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it("uses the site's /favicon.ico when the icon is unknown", () => {
    const { container } = render(
      <SiteIcon url={null} site="https://example.com/page" />,
    );
    expect(iconSrc(container)).toBe('https://example.com/favicon.ico');
  });

  it('accepts inline icons pages commonly use', () => {
    const svg = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
    const ico = 'data:image/vnd.microsoft.icon;base64,AAAB';
    expect(iconSrc(render(<SiteIcon url={svg} />).container)).toBe(svg);
    cleanup();
    expect(iconSrc(render(<SiteIcon url={ico} />).container)).toBe(ico);
  });

  it('never shows an icon from an unsafe address', () => {
    const { container } = render(
      <SiteIcon url="javascript:alert(1)" site="file:///etc/passwd" />,
    );
    expect(container.querySelector('img')).toBeNull();
  });
});
