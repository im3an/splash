/** The element Reader draws into; `toggleReader` spells it out itself. */
export const READER_HOST_ID = 'splash-reader';

interface ReadabilityArticle {
  title?: string | null;
  byline?: string | null;
  siteName?: string | null;
  content?: string | null;
  textContent?: string | null;
  length?: number | null;
}

type ReadabilityClass = new (
  document: Document,
  options?: Record<string, unknown>,
) => { parse(): ReadabilityArticle | null };

interface Purifier {
  sanitize(dirty: string, config?: Record<string, unknown>): unknown;
}

export interface ReaderOptions {
  dark: boolean;
  /** The page's host, for the line above the title. */
  siteName: string;
}

export type ReaderResult = 'shown' | 'hidden' | 'none';

/**
 * Shows the page's article on its own, over the page, or takes it away
 * again. Runs inside the page, in an isolated world, so it must use nothing
 * from outside its own body: main sends it as text with Readability and
 * DOMPurify before it.
 *
 * Readability reads a copy of the document, so the page itself is left as it
 * was, and what it finds goes through DOMPurify before it is shown: nothing
 * of the page's can run in Reader.
 */
export function toggleReader(
  Readability: ReadabilityClass,
  purifier: Purifier,
  options: ReaderOptions,
): ReaderResult {
  const HOST_ID = 'splash-reader';
  const MIN_SIZE = 14;
  const MAX_SIZE = 30;
  const root = document.documentElement;
  type ReaderState = { close(): void };
  const store = window as unknown as {
    __splashReader?: ReaderState;
    __splashReaderSize?: number;
  };

  const existing = document.getElementById(HOST_ID);
  if (existing) {
    if (store.__splashReader) store.__splashReader.close();
    else existing.remove();
    return 'hidden';
  }

  const copy = document.cloneNode(true) as Document;
  let article: ReadabilityArticle | null = null;
  try {
    article = new Readability(copy, { charThreshold: 400 }).parse();
  } catch {
    article = null;
  }
  const text = article?.textContent?.trim() ?? '';
  if (!article?.content || text.length < 400) return 'none';

  const clean = String(
    purifier.sanitize(article.content, {
      FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'],
      FORBID_ATTR: ['style', 'class', 'id'],
    }),
  );

  const words = text.split(/\s+/).length;
  const minutes = Math.max(1, Math.round(words / 230));
  const size = store.__splashReaderSize ?? 19;

  const host = document.createElement('div');
  host.id = HOST_ID;
  host.dataset.theme = options.dark ? 'dark' : 'light';
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true');
  host.setAttribute('aria-label', 'Reader');
  host.style.cssText =
    'all: initial; position: fixed; inset: 0; z-index: 2147483647; display: block;';
  const shadow = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host { color-scheme: light; --bg: #faf8f5; --fg: #221d17; --muted: #585047; --line: rgb(34 29 23 / 0.14); --accent: #b4542d; --control: rgb(34 29 23 / 0.06); }
    :host([data-theme="dark"]) { color-scheme: dark; --bg: #201c18; --fg: #ede6dd; --muted: #b3a89b; --line: rgb(237 230 221 / 0.11); --accent: #e3906a; --control: rgb(237 230 221 / 0.08); }
    .scroll { position: absolute; inset: 0; overflow-y: auto; background: var(--bg); color: var(--fg); -webkit-font-smoothing: antialiased; outline: none; }
    .bar { position: sticky; top: 0; display: flex; justify-content: flex-end; gap: 4px; padding: 12px 16px; background: var(--bg); border-bottom: 1px solid transparent; font: 13px/1 -apple-system, system-ui, sans-serif; }
    .bar.scrolled { border-bottom-color: var(--line); }
    button { all: unset; box-sizing: border-box; min-width: 32px; height: 28px; padding: 0 10px; border-radius: 7px; display: inline-grid; place-items: center; color: var(--muted); background: var(--control); cursor: default; font: inherit; }
    button:hover { color: var(--fg); }
    button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
    .reader { box-sizing: border-box; max-width: 68ch; margin: 0 auto; padding: 24px 32px 96px; font-family: ui-serif, "New York", Georgia, serif; line-height: 1.6; }
    .site { font: 500 13px/1.4 -apple-system, system-ui, sans-serif; color: var(--muted); margin: 0 0 12px; }
    .title { font-size: 1.9em; line-height: 1.2; margin: 0 0 12px; font-weight: 650; letter-spacing: -0.01em; }
    .meta { font: 14px/1.4 -apple-system, system-ui, sans-serif; color: var(--muted); margin: 0 0 32px; padding-bottom: 24px; border-bottom: 1px solid var(--line); }
    .content h1, .content h2, .content h3 { line-height: 1.25; margin: 1.6em 0 0.5em; }
    .content p, .content ul, .content ol, .content blockquote, .content pre, .content figure { margin: 0 0 1em; }
    .content img, .content video, .content svg { max-width: 100%; height: auto; border-radius: 6px; }
    .content figcaption { font-size: 0.8em; color: var(--muted); margin-top: 6px; }
    .content a { color: inherit; text-decoration: underline; text-decoration-thickness: 1px; text-decoration-color: color-mix(in srgb, var(--accent) 65%, transparent); text-underline-offset: 3px; }
    .content a:hover { color: var(--accent); }
    .content sup { line-height: 0; }
    .content blockquote { border-left: 3px solid var(--line); padding-left: 1em; color: var(--muted); }
    .content pre, .content code { font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 0.85em; }
    .content pre { background: var(--control); padding: 12px 14px; border-radius: 8px; overflow-x: auto; }
    .content table { border-collapse: collapse; max-width: 100%; display: block; overflow-x: auto; font-size: 0.9em; }
    .content td, .content th { border: 1px solid var(--line); padding: 6px 8px; }
    .content hr { border: 0; border-top: 1px solid var(--line); margin: 2em 0; }
  `;

  const scroll = document.createElement('div');
  scroll.className = 'scroll';
  const bar = document.createElement('div');
  bar.className = 'bar';
  const button = (label: string, text: string, onClick: () => void) => {
    const element = document.createElement('button');
    element.type = 'button';
    element.setAttribute('aria-label', label);
    element.title = label;
    element.textContent = text;
    element.addEventListener('click', onClick);
    bar.append(element);
    return element;
  };

  const body = document.createElement('article');
  body.className = 'reader';
  body.style.fontSize = `${size}px`;
  const site = document.createElement('p');
  site.className = 'site';
  // Where the reader is, as the address says it; a publisher's own name can
  // be its owner's ("Wikimedia Foundation, Inc." on Wikipedia).
  site.textContent = options.siteName || article.siteName?.trim() || '';
  const title = document.createElement('h1');
  title.className = 'title';
  title.textContent = article.title?.trim() || document.title;
  const meta = document.createElement('p');
  meta.className = 'meta';
  const byline = article.byline?.trim();
  meta.textContent = byline
    ? `${byline} · ${minutes} min read`
    : `${minutes} min read`;
  const content = document.createElement('div');
  content.className = 'content';
  content.innerHTML = clean;
  // A page title often carries the site's name ("Title | Journal"); the
  // article's own heading doesn't, and would otherwise show twice.
  const first = content.querySelector('h1, h2');
  const heading = first?.textContent?.trim();
  if (first && heading && title.textContent?.includes(heading)) {
    title.textContent = heading;
    first.remove();
  } else {
    // Readability may have taken the heading out already; the page has it.
    for (const candidate of document.querySelectorAll('h1')) {
      const text = candidate.textContent?.trim();
      if (text && text.length > 2 && title.textContent?.includes(text)) {
        title.textContent = text;
        break;
      }
    }
  }
  body.append(site, title, meta, content);

  const resize = (step: number) => {
    const next = Math.min(
      MAX_SIZE,
      Math.max(MIN_SIZE, (store.__splashReaderSize ?? size) + step),
    );
    store.__splashReaderSize = next;
    body.style.fontSize = `${next}px`;
  };

  const overflow = root.style.overflow;
  const focused =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    host.remove();
    root.style.overflow = overflow;
    delete store.__splashReader;
    focused?.focus?.();
  };

  button('Smaller text', 'A−', () => resize(-2));
  button('Larger text', 'A+', () => resize(2));
  const closeButton = button('Close Reader', 'Close', close);
  scroll.addEventListener('scroll', () =>
    bar.classList.toggle('scrolled', scroll.scrollTop > 0),
  );

  scroll.append(bar, body);
  shadow.append(style, scroll);
  (document.body ?? root).append(host);
  root.style.overflow = 'hidden';
  document.addEventListener('keydown', onKey, true);
  store.__splashReader = { close };
  scroll.tabIndex = -1;
  scroll.focus?.({ preventScroll: true });
  void closeButton;
  return 'shown';
}
