import DOMPurify from 'dompurify';
import katex from 'katex';
import { Marked, type Tokens } from 'marked';
import { plainHeading, slugify } from '../../../shared/notes';

/**
 * Turns a note's Markdown into HTML for the notes view. Math is typeset here;
 * Mermaid diagrams are left as placeholders for `renderDiagrams`, since they
 * draw asynchronously. Everything passes through DOMPurify: the shell has the
 * whole Splash bridge, and note text is often pasted from the web.
 */

export interface Sketch {
  w: number;
  h: number;
  /** Strokes as flat lists of x, y pairs. */
  s: number[][];
}

const escapeHtml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const tex = (source: string, displayMode: boolean) =>
  katex.renderToString(source, {
    displayMode,
    throwOnError: false,
    output: 'htmlAndMathml',
    trust: false,
  });

export function parseSketch(source: string): Sketch | null {
  try {
    const value = JSON.parse(source) as Partial<Sketch>;
    const finite = (n: unknown): n is number =>
      typeof n === 'number' && Number.isFinite(n);
    if (!finite(value.w) || !finite(value.h) || !Array.isArray(value.s))
      return null;
    if (
      !value.s.every((stroke) => Array.isArray(stroke) && stroke.every(finite))
    )
      return null;
    return { w: value.w, h: value.h, s: value.s };
  } catch {
    return null;
  }
}

/** A stroke as a smooth path through the midpoints of its samples. */
export function strokePath(points: readonly number[]): string {
  const at = (index: number) => Math.round((points[index] ?? 0) * 10) / 10;
  const n = points.length;
  if (n < 2) return '';
  if (n < 6) {
    // A dot or a short dash still shows.
    return `M${at(0)} ${at(1)}L${at(n - 2) + 0.01} ${at(n - 1)}`;
  }
  let path = `M${at(0)} ${at(1)}`;
  for (let i = 2; i < n - 2; i += 2) {
    const mx = Math.round(((at(i) + at(i + 2)) / 2) * 10) / 10;
    const my = Math.round(((at(i + 1) + at(i + 3)) / 2) * 10) / 10;
    path += `Q${at(i)} ${at(i + 1)} ${mx} ${my}`;
  }
  return `${path}L${at(n - 2)} ${at(n - 1)}`;
}

export function sketchSvg(sketch: Sketch): string {
  const paths = sketch.s
    .map((stroke) => `<path d="${strokePath(stroke)}"/>`)
    .join('');
  return `<svg class="note-sketch" viewBox="0 0 ${sketch.w} ${sketch.h}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Sketch">${paths}</svg>`;
}

function linkCard(href: string): string {
  let host = href;
  let rest = '';
  try {
    const url = new URL(href);
    host = url.hostname.replace(/^www\./, '');
    rest = `${url.pathname === '/' ? '' : url.pathname}${url.search}`;
  } catch {
    // Shown as written.
  }
  const origin = (() => {
    try {
      return new URL(href).origin;
    } catch {
      return null;
    }
  })();
  return (
    `<a class="note-card" href="${escapeHtml(href)}">` +
    `<span class="note-card-mark">${escapeHtml(host.charAt(0).toUpperCase())}` +
    (origin
      ? `<img class="note-card-icon" alt="" src="${escapeHtml(origin)}/favicon.ico" referrerpolicy="no-referrer">`
      : '') +
    `</span><span class="note-card-text"><span class="note-card-host">${escapeHtml(host)}</span>` +
    (rest
      ? `<span class="note-card-path">${escapeHtml(decodeURI(rest))}</span>`
      : '') +
    `</span><span class="note-card-go" aria-hidden="true">↗</span></a>`
  );
}

function createMarked() {
  // Fresh per render: heading slugs count repeats within one note.
  const used = new Map<string, number>();
  const marked = new Marked({ gfm: true, breaks: false });
  marked.use({
    extensions: [
      {
        name: 'blockMath',
        level: 'block',
        start: (src) => src.match(/^\$\$/m)?.index,
        tokenizer(src) {
          const match = /^\$\$([\s\S]+?)\$\$[^\S\n]*(?:\n|$)/.exec(src);
          if (match)
            return {
              type: 'blockMath',
              raw: match[0],
              text: (match[1] ?? '').trim(),
            };
        },
        renderer: (token) =>
          `<div class="note-math">${tex(String(token.text), true)}</div>`,
      },
      {
        name: 'inlineMath',
        level: 'inline',
        start: (src) => {
          const index = src.indexOf('$');
          return index === -1 ? undefined : index;
        },
        tokenizer(src) {
          const match = /^\$(?![\s$])([^$\n]+?)(?<!\s)\$(?!\d)/.exec(src);
          if (match)
            return { type: 'inlineMath', raw: match[0], text: match[1] };
        },
        renderer: (token) => tex(String(token.text), false),
      },
    ],
    renderer: {
      heading({ tokens, depth, text }) {
        const plain = plainHeading(text);
        const base = slugify(plain);
        const count = used.get(base) ?? 0;
        used.set(base, count + 1);
        const slug = count ? `${base}-${count}` : base;
        return `<h${depth} id="note-${slug}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
      code({ text, lang }) {
        const language = (lang ?? '').trim().toLowerCase();
        if (language === 'mermaid') {
          // The source rides in the <pre>: DOMPurify drops attributes with `-->`.
          return `<div class="note-mermaid"><pre>${escapeHtml(text)}</pre></div>`;
        }
        if (language === 'sketch') {
          const sketch = parseSketch(text);
          if (sketch)
            return `<figure class="note-figure">${sketchSvg(sketch)}</figure>`;
        }
        if (language === 'math' || language === 'latex' || language === 'tex') {
          return `<div class="note-math">${tex(text, true)}</div>`;
        }
        return `<pre><code>${escapeHtml(text)}</code></pre>`;
      },
      paragraph({ tokens }) {
        const only = tokens.length === 1 ? tokens[0] : null;
        if (
          only?.type === 'link' &&
          /^https?:\/\//i.test((only as Tokens.Link).href) &&
          (only as Tokens.Link).text === (only as Tokens.Link).href
        ) {
          return linkCard((only as Tokens.Link).href);
        }
        return `<p>${this.parser.parseInline(tokens)}</p>\n`;
      },
    },
  });
  return marked;
}

export function renderNote(body: string): string {
  const html = createMarked().parse(body, { async: false });
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, svg: true, mathMl: true },
    ADD_ATTR: ['referrerpolicy'],
    // Links open through Splash, never inside the shell.
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe'],
  });
}

let mermaidReady: Promise<typeof import('mermaid').default> | null = null;
let diagramSerial = 0;

/** Draws the Mermaid placeholders `renderNote` left in `root`. */
export async function renderDiagrams(root: HTMLElement, dark: boolean) {
  const blocks = [
    ...root.querySelectorAll<HTMLElement>('.note-mermaid:not([data-drawn])'),
  ];
  if (!blocks.length) return;
  mermaidReady ??= import('mermaid').then((module) => module.default);
  const mermaid = await mermaidReady;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: dark ? 'dark' : 'neutral',
    fontFamily: getComputedStyle(root).fontFamily,
    // SVG text labels, so the second sanitising pass keeps them; HTML labels
    // live in <foreignObject>, which it strips.
    htmlLabels: false,
    flowchart: { htmlLabels: false },
  });
  for (const block of blocks) {
    const source = block.querySelector('pre')?.textContent ?? '';
    try {
      const { svg } = await mermaid.render(
        `note-diagram-${++diagramSerial}`,
        source,
      );
      if (!block.isConnected) return;
      block.dataset.drawn = 'true';
      block.innerHTML = DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
      });
    } catch (error) {
      block.dataset.failed = 'true';
      const message = document.createElement('p');
      message.className = 'note-mermaid-error';
      message.textContent = `Diagram: ${(error as Error).message?.split('\n')[0] ?? 'could not draw'}`;
      block.append(message);
    }
  }
}
