// @vitest-environment jsdom
import { Readability } from '@mozilla/readability';
import DOMPurify from 'dompurify';
import { READER_HOST_ID, toggleReader } from './reader-page';

const paragraph = (n: number) =>
  `<p>Paragraph ${n} of the article. ${'Trails keep every page you open beneath the page it came from, so a morning of reading stays in order. '.repeat(4)}</p>`;

function articlePage() {
  document.title = 'How trails work | Example Journal';
  document.documentElement.style.overflow = '';
  document.body.innerHTML = `
    <nav><a href="/">Home</a><a href="/about">About</a></nav>
    <article>
      <h1>How trails work</h1>
      <p class="byline">By Ada Example</p>
      ${[1, 2, 3, 4, 5, 6].map(paragraph).join('')}
      <img src="https://example.com/figure.png" onerror="window.__hacked = true" alt="A figure">
      <script>window.__ran = true</script>
    </article>
    <footer>Copyright</footer>`;
}

const host = () => document.getElementById(READER_HOST_ID);
const reader = () => host()?.shadowRoot ?? null;
const toggle = (dark = false) =>
  toggleReader(Readability, DOMPurify, { dark, siteName: 'example.com' });

afterEach(() => {
  host()?.remove();
  document.documentElement.style.overflow = '';
});

it('shows the article on its own, over the page', () => {
  articlePage();
  expect(toggle()).toBe('shown');
  const root = reader();
  expect(root).not.toBeNull();
  expect(root?.querySelector('h1')?.textContent).toBe('How trails work');
  expect(root?.textContent).toContain('Paragraph 6 of the article');
  expect(root?.textContent).toContain('example.com');
  expect(root?.textContent).toMatch(/\d+ min read/);
  // The page's navigation and footer stay behind.
  expect(root?.textContent).not.toContain('Copyright');
  // The page underneath doesn't scroll while Reader is up.
  expect(document.documentElement.style.overflow).toBe('hidden');
  expect(host()?.getAttribute('role')).toBe('dialog');
});

it('keeps nothing from the page that could run', () => {
  articlePage();
  toggle();
  const root = reader();
  expect(root?.querySelector('script')).toBeNull();
  expect(root?.querySelector('[onerror]')).toBeNull();
  expect(root?.querySelector('img')?.getAttribute('alt')).toBe('A figure');
});

it('goes away on the second toggle, and the page scrolls again', () => {
  articlePage();
  document.documentElement.style.overflow = 'auto';
  toggle();
  expect(toggle()).toBe('hidden');
  expect(host()).toBeNull();
  expect(document.documentElement.style.overflow).toBe('auto');
});

it('closes with Escape and with its Close button', () => {
  articlePage();
  toggle();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(host()).toBeNull();

  toggle();
  const close = reader()?.querySelector<HTMLButtonElement>(
    'button[aria-label="Close Reader"]',
  );
  close?.click();
  expect(host()).toBeNull();
});

it('makes the text larger and smaller within bounds', () => {
  articlePage();
  toggle();
  const root = reader();
  const article = () => root?.querySelector<HTMLElement>('article');
  const size = () => Number.parseInt(article()?.style.fontSize ?? '', 10);
  const start = size();
  root
    ?.querySelector<HTMLButtonElement>('button[aria-label="Larger text"]')
    ?.click();
  expect(size()).toBeGreaterThan(start);
  for (let i = 0; i < 20; i++)
    root
      ?.querySelector<HTMLButtonElement>('button[aria-label="Smaller text"]')
      ?.click();
  expect(size()).toBeGreaterThanOrEqual(14);
});

it('follows Splash’s theme', () => {
  articlePage();
  toggle(true);
  expect(host()?.dataset.theme).toBe('dark');
});

it('says so when a page has no article', () => {
  document.title = 'Search';
  document.body.innerHTML = '<form><input name="q"><button>Go</button></form>';
  expect(toggle()).toBe('none');
  expect(host()).toBeNull();
  expect(document.documentElement.style.overflow).toBe('');
});
