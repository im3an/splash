import DOMPurify from 'dompurify';

/** A sketch as stored in a `sketch` code block: plain numbers only. */
export interface Sketch {
  w: number;
  h: number;
  /** Strokes as flat lists of x, y pairs. */
  s: number[][];
  /** Ink per stroke, as an index into `SKETCH_INKS`; ink 0 when missing. */
  k?: number[];
  /** Pen width per stroke; 2.5 when missing. */
  t?: number[];
}

/** Inks a sketch can use. Index 0 follows the text colour. */
export const SKETCH_INKS = [
  'currentColor',
  'var(--accent)',
  'var(--note-ink-red)',
  'var(--note-ink-blue)',
  'var(--note-ink-green)',
] as const;

export const SKETCH_WIDTHS = [1.5, 2.5, 5] as const;

const finite = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n);

export function parseSketch(source: string): Sketch | null {
  try {
    const value = JSON.parse(source) as Partial<Sketch>;
    if (!finite(value.w) || !finite(value.h) || !Array.isArray(value.s))
      return null;
    if (
      !value.s.every((stroke) => Array.isArray(stroke) && stroke.every(finite))
    )
      return null;
    const list = (input: unknown) =>
      Array.isArray(input) && input.every(finite) ? input : undefined;
    return {
      w: value.w,
      h: value.h,
      s: value.s,
      k: list(value.k),
      t: list(value.t),
    };
  } catch {
    return null;
  }
}

/** A stroke as a smooth path through the midpoints of its samples. */
export function strokePath(points: readonly number[]): string {
  const at = (index: number) => Math.round((points[index] ?? 0) * 10) / 10;
  const n = points.length;
  if (n < 2) return '';
  if (n < 6) return `M${at(0)} ${at(1)}L${at(n - 2) + 0.01} ${at(n - 1)}`;
  let path = `M${at(0)} ${at(1)}`;
  for (let i = 2; i < n - 2; i += 2) {
    const mx = Math.round(((at(i) + at(i + 2)) / 2) * 10) / 10;
    const my = Math.round(((at(i + 1) + at(i + 3)) / 2) * 10) / 10;
    path += `Q${at(i)} ${at(i + 1)} ${mx} ${my}`;
  }
  return `${path}L${at(n - 2)} ${at(n - 1)}`;
}

export const strokeInk = (sketch: Sketch, index: number) =>
  SKETCH_INKS[sketch.k?.[index] ?? 0] ?? SKETCH_INKS[0];
export const strokeWidth = (sketch: Sketch, index: number) =>
  sketch.t?.[index] ?? 2.5;

let mermaidReady: Promise<typeof import('mermaid').default> | null = null;
let diagramSerial = 0;

/**
 * Draws a Mermaid diagram to sanitised SVG. Labels are SVG text: HTML labels
 * live in <foreignObject>, which the sanitising pass strips.
 */
export async function renderMermaid(
  source: string,
  dark: boolean,
  font: string,
) {
  mermaidReady ??= import('mermaid').then((module) => module.default);
  const mermaid = await mermaidReady;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: dark ? 'dark' : 'neutral',
    fontFamily: font,
    htmlLabels: false,
    flowchart: { htmlLabels: false },
  });
  const { svg } = await mermaid.render(
    `note-diagram-${++diagramSerial}`,
    source,
  );
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
  });
}

export const prefersDark = () =>
  matchMedia('(prefers-color-scheme: dark)').matches;
