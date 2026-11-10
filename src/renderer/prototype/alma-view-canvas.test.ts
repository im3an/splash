import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { PageSnapshot } from '../../shared/types';
import type { Scene, SceneNode } from './alma-view-scene';

/*
 * Node outlines went missing in the zoomed-in view: chips were stroked with
 * `--hairline`, a faint tint of the theme's ink that in dark is light on a
 * light chip, and Focus cards had no edge at all, so lines ended in the air.
 * These pin both halves: every node kind is stroked with the outline token,
 * and that token stands out from the ground in light and dark.
 */

const TOKENS = readFileSync(
  path.resolve(__dirname, '../styles/tokens.css'),
  'utf8',
);

/** The custom properties of one block of tokens.css. */
function block(start: RegExp): Map<string, string> {
  const from = TOKENS.search(start);
  const body = TOKENS.slice(from, TOKENS.indexOf('\n}', from));
  const vars = new Map<string, string>();
  for (const [, name, value] of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    vars.set(name!, value!.trim().replace(/\s+/g, ' '));
  }
  return vars;
}

const LIGHT = block(/^:root \{/m);
const DARK = new Map([
  ...LIGHT,
  ...block(/@media \(prefers-color-scheme: dark\)/),
]);

type Rgba = [number, number, number, number];

function resolve(theme: Map<string, string>, name: string): string {
  const value = theme.get(name);
  if (!value) throw new Error(`no ${name}`);
  return value.replace(/var\((--[\w-]+)\)/g, (_, inner: string) =>
    resolve(theme, inner),
  );
}

function parse(color: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (hex) {
    const n = Number.parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgb =
    /^rgb\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)\s*(?:\/\s*([\d.]+))?\)$/.exec(
      color,
    );
  if (!rgb) throw new Error(`can't read ${color}`);
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), Number(rgb[4] ?? 1)];
}

function over(top: Rgba, ground: Rgba): Rgba {
  const a = top[3];
  return [0, 1, 2]
    .map((i) => top[i]! * a + ground[i]! * (1 - a))
    .concat(1) as Rgba;
}

function luminance([r, g, b]: Rgba) {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgba, b: Rgba) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** A 2D context that keeps the state each stroke was made with. */
function recordingContext() {
  const strokes: { style: string; alpha: number; width: number }[] = [];
  const state = {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    font: '',
    filter: 'none',
    lineCap: 'butt',
    lineJoin: 'miter',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    imageSmoothingEnabled: true,
    imageSmoothingQuality: 'low',
  };
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key as keyof typeof target];
      if (key === 'stroke') {
        return () =>
          strokes.push({
            style: target.strokeStyle,
            alpha: target.globalAlpha,
            width: target.lineWidth,
          });
      }
      if (key === 'measureText') {
        return (text: string) => ({ width: text.length * 6 });
      }
      if (key === 'getTransform') return () => ({});
      return () => {};
    },
    set(target, key, value) {
      (target as Record<string | symbol, unknown>)[key] = value;
      return true;
    },
  });
  return { ctx, strokes };
}

const OUTLINE = 'OUTLINE-COLOUR';

function page(id: string, url: string): PageSnapshot {
  return {
    id,
    parentId: null,
    childIds: [],
    url,
    title: id,
    faviconUrl: null,
  } as unknown as PageSnapshot;
}

function node(id: string, overrides: Partial<SceneNode> = {}): SceneNode {
  return {
    id,
    kind: 'page',
    page: page(id, `https://${id}.example/`),
    label: id,
    detail: `${id}.example`,
    iconUrl: null,
    iconSite: null,
    r: 9,
    card: null,
    labelRule: 'zoom',
    labelSide: 'below',
    labelMax: 150,
    charge: 1,
    collide: 0,
    trail: 0,
    site: `${id}.example`,
    orbit: null,
    labelDrop: 0,
    glyph: null,
    term: null,
    folder: null,
    type: null,
    ...overrides,
  };
}

function scene(nodes: SceneNode[]): Scene {
  return {
    mode: 'focus',
    nodes,
    edges: [],
    positions: new Map(nodes.map((n, i) => [n.id, { x: i * 300, y: 0 }])),
    gravity: 0,
    rings: [],
    hulls: [],
    labelMargin: 0,
    centerId: null,
    counts: { pages: nodes.length, trails: 1, sites: nodes.length },
  };
}

let AlmaCanvas: typeof import('./alma-view-canvas').AlmaCanvas;
let NODE_OUTLINE_TOKEN: string;

beforeAll(async () => {
  // Just enough of a browser for the canvas class to construct and draw.
  vi.stubGlobal(
    'Path2D',
    class {
      constructor(_d?: string) {}
    },
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.stubGlobal('window', { devicePixelRatio: 2 });
  vi.stubGlobal('document', { documentElement: { dataset: {} } });
  vi.stubGlobal(
    'Image',
    class {
      naturalWidth = 0;
      src = '';
    },
  );
  ({ AlmaCanvas, NODE_OUTLINE_TOKEN } = await import('./alma-view-canvas'));
  vi.stubGlobal('getComputedStyle', () => ({
    colorScheme: 'dark',
    getPropertyValue: (name: string) =>
      name === NODE_OUTLINE_TOKEN ? OUTLINE : `colour${name}`,
  }));
});

/** Draws one frame zoomed in, and returns the strokes it made. */
function strokesFor(nodes: SceneNode[]) {
  const { ctx, strokes } = recordingContext();
  const canvas = {
    getContext: () => ctx,
    getBoundingClientRect: () => ({ width: 1200, height: 800 }),
    addEventListener() {},
    removeEventListener() {},
    style: {},
    width: 0,
    height: 0,
  } as unknown as HTMLCanvasElement;
  const view = new AlmaCanvas(canvas, {
    onHover() {},
    onHoverMove() {},
    onClick() {},
    onContext() {},
    onLasso() {},
    canDrop: () => false,
    onDropTarget() {},
    onDrop() {},
  });
  const inner = view as unknown as {
    readColors(): void;
    draw(now: number): void;
    cam: { x: number; y: number; k: number };
    bodies: Map<string, { opacity: number }>;
  };
  view.setScene(scene(nodes), null);
  inner.readColors();
  for (const body of inner.bodies.values()) body.opacity = 1;
  inner.cam = { x: 0, y: 0, k: 3 };
  inner.draw(0);
  view.destroy();
  return strokes.filter((stroke) => stroke.style === OUTLINE);
}

describe('Alma view node outlines', () => {
  it('outline a page chip when zoomed in', () => {
    const outlines = strokesFor([node('chip')]);
    expect(outlines.length).toBeGreaterThan(0);
    // One screen pixel, whatever the zoom.
    expect(outlines[0]!.width * 3).toBeCloseTo(1);
    expect(outlines[0]!.alpha).toBeGreaterThan(0.5);
  });

  it('outline a site hub', () => {
    const hub = node('hub', { kind: 'site', page: null, r: 20 });
    expect(strokesFor([hub]).length).toBeGreaterThan(0);
  });

  it('outline a Focus card, so its lines end at an edge', () => {
    const card = node('card', { card: { w: 216, h: 34 }, r: 17 });
    expect(strokesFor([card]).length).toBeGreaterThan(0);
  });

  it.each([
    ['light', LIGHT],
    ['dark', DARK],
  ])('use a token that stands out from the ground in %s', (_, theme) => {
    const surface = parse(resolve(theme, '--surface'));
    const outline = over(parse(resolve(theme, NODE_OUTLINE_TOKEN)), surface);
    // `--hairline`, which lost the outlines, reaches 1.28 in light and 1.34
    // in dark.
    expect(contrast(outline, surface)).toBeGreaterThanOrEqual(1.45);
  });
});
