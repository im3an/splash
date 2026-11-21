// @vitest-environment jsdom
import { readerScript, toggleReaderIn } from './reader';
import { READER_HOST_ID } from './reader-page';

function articlePage() {
  document.title = 'A long read';
  document.body.innerHTML = `<article><h1>A long read</h1>${'<p>Every link you follow opens beneath the page it came from, so the sidebar shows how you got there. </p>'.repeat(12)}</article>`;
}

/** Runs the script as a page's world would: text only, no imports, no module. */
function runInPage(script: string): unknown {
  // oxlint-disable-next-line no-eval -- the point is to run it from text.
  return (0, eval)(script);
}

afterEach(() => {
  document.getElementById(READER_HOST_ID)?.remove();
  document.documentElement.style.overflow = '';
});

it('runs from text alone, bringing Readability and DOMPurify with it', () => {
  articlePage();
  const script = readerScript({ siteName: 'example.com' });
  expect(runInPage(script)).toBe('shown');
  expect(
    document.getElementById(READER_HOST_ID)?.shadowRoot?.textContent,
  ).toContain('Every link you follow');
  expect(runInPage(script)).toBe('hidden');
});

it('leaves no globals behind in the world it runs in', () => {
  articlePage();
  runInPage(readerScript({ siteName: 'example.com' }));
  expect('Readability' in globalThis).toBe(false);
  expect('DOMPurify' in globalThis).toBe(false);
});

it('runs in its own world of the page’s main frame, and says why it couldn’t', async () => {
  const contents = {
    executeJavaScriptInIsolatedWorld: vi.fn(async () => 'shown'),
  };
  await expect(
    toggleReaderIn(contents as never, { siteName: 'a.example' }),
  ).resolves.toBe('shown');
  const [world, scripts] = contents.executeJavaScriptInIsolatedWorld.mock
    .calls[0] as unknown as [number, { code: string }[]];
  expect(world).toBeGreaterThan(1000);
  expect(scripts[0]?.code).toContain('a.example');

  contents.executeJavaScriptInIsolatedWorld.mockRejectedValueOnce(
    new Error('navigated'),
  );
  await expect(
    toggleReaderIn(contents as never, { siteName: 'a.example' }),
  ).resolves.toBe('none');
});
