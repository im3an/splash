/*
 * Alma view's drawing: a Scene on a canvas, animated between
 * scenes. Bodies outlive the scene they came from, so a page keeps its place
 * and moves when the mode changes. AlmaSettings tune it live.
 */
import { defaultIconFor } from '../components/Favicon';
import {
  enclosingCircle,
  roundedHull,
  separateGroups,
} from './alma-view-physics';
import type { Glyph, Scene, SceneEdge, SceneNode } from './alma-view-scene';

/** Room a trail's outline leaves around its pages. */
const HULL_PAD = 18;
/** Clear ground between two groups' outlines, with room for labels. */
const GROUP_GAP = 30;
/** How hard pages in different groups push each other: the groups' own
 * spacing does the rest, so a far trail can't shove a near one about. */
const ACROSS_GROUPS = 0.12;

export type AlmaLook = 'icons' | 'stars' | 'ink';
export type AlmaTint = 'none' | 'trail' | 'site' | 'folder' | 'type';

export interface AlmaSettings {
  look: AlmaLook;
  tint: AlmaTint;
  /** Forces, 0–1 with the middle as the default. */
  spread: number;
  pull: number;
  gather: number;
  /** Display, 0–1 with the middle as the default. */
  size: number;
  lines: number;
  labels: number;
  /** Everything floats a little; pages circle their sites. */
  drift: boolean;
  /** Dots run down the lines, from a page to the pages it led to. */
  flow: boolean;
}

export const DEFAULT_ALMA_SETTINGS: AlmaSettings = {
  look: 'icons',
  tint: 'none',
  spread: 0.5,
  pull: 0.5,
  gather: 0.5,
  size: 0.5,
  lines: 0.5,
  labels: 0.5,
  drift: false,
  flow: false,
};

interface Body {
  node: SceneNode;
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  corner: number;
  opacity: number;
  /** 1 in full view, down toward 0 when something else has the attention. */
  focus: number;
  /** When Grow reaches it; 0 once it's simply there. */
  growAt: number;
  grown: number;
  seed: number;
}

interface Colors {
  surface: string;
  elevated: string;
  halo: string;
  stroke: number;
  chip: string;
  hover: string;
  guide: string;
  path: string;
  current: string;
  /** Every node's edge: chips, hubs and cards. */
  outline: string;
  fg: string;
  muted: string;
  subtle: string;
  danger: string;
  accent: string;
  font: string;
  dark: boolean;
}

export interface AlmaCallbacks {
  onHover(node: SceneNode | null): void;
  /** Called every frame a node is hovered, with where to put its card. */
  onHoverMove(x: number, y: number): void;
  onClick(node: SceneNode, event: { altKey: boolean; shiftKey: boolean }): void;
  /** Right-click: `x` and `y` in window coordinates. */
  onContext(node: SceneNode, x: number, y: number): void;
  /** ⇧-dragged a box over these pages. */
  onLasso(pageIds: string[]): void;
  /** Whether the page being dragged could go under this one. */
  canDrop(pageId: string, targetId: string): boolean;
  /** While dragging: the page it would go under, or none. */
  onDropTarget(pageId: string | null, targetId: string | null): void;
  onDrop(pageId: string, targetId: string): void;
}

type Curve =
  | { kind: 'line'; x0: number; y0: number; x1: number; y1: number }
  | {
      kind: 'cubic';
      x0: number;
      y0: number;
      c1x: number;
      c1y: number;
      c2x: number;
      c2y: number;
      x1: number;
      y1: number;
    };

const SPEAKER = new Path2D(
  'M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z',
);
const GLOBE = new Path2D(
  'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20',
);
const SAFE_ICON = /^(https?:\/\/|data:image\/)/i;

/**
 * The edge every chip, hub and card is drawn with: the control edge, which is
 * strong enough to show on the ground and on a trail's hull in both themes.
 * `--hairline` is too faint for it, and in dark it is light on a light chip,
 * which is how the outlines went missing (see alma-view-canvas.test.ts).
 */
export const NODE_OUTLINE_TOKEN = '--border-hover';

export function prefersReducedMotion() {
  return document.documentElement.dataset.motion === 'reduced';
}

function hashOf(text: string) {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** 0 → low, 0.5 → 1, 1 → high. */
function scaled(value: number, low: number, high: number) {
  return value < 0.5
    ? low + (1 - low) * (value / 0.5)
    : 1 + (high - 1) * ((value - 0.5) / 0.5);
}

export class AlmaCanvas {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly bodies = new Map<string, Body>();
  private readonly icons = new Map<
    string,
    { image: HTMLImageElement; state: 'loading' | 'ok' | 'failed' }
  >();
  private readonly ellipsized = new Map<string, string>();
  private readonly observer: ResizeObserver;
  private readonly specks: { x: number; y: number; r: number; d: number }[];
  private settings: AlmaSettings = DEFAULT_ALMA_SETTINGS;
  private scene: Scene | null = null;
  private signature = '';
  private neighbours = new Map<string, Set<string>>();
  /** Which of the scene's groups each node settles with. */
  private groupOf = new Map<string, number>();
  private cam = { x: 0, y: 0, k: 1 };
  private camTarget = { x: 0, y: 0, k: 1 };
  private handCamera = false;
  private alpha = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private raf = 0;
  private frame = 0;
  private dirty = true;
  private growing = false;
  /** Runs the float; stops while a node is hovered, so targets hold still. */
  private clock = 0;
  private lastFrame = 0;
  private readonly iconChoice = new Map<
    string,
    { image: HTMLImageElement; pixels: number } | null
  >();
  private readonly scaledIcons = new Map<string, HTMLCanvasElement>();
  private readonly glyphPaths = new Map<string, Path2D>();
  private readonly textWidths = new Map<string, number>();
  private colors: Colors | null = null;
  private hoverId: string | null = null;
  private matches: Set<string> | null = null;
  private activeId: string | null = null;
  private selected: ReadonlySet<string> = new Set();
  private dropTarget: string | null = null;
  private lasso: { x0: number; y0: number; x1: number; y1: number } | null =
    null;
  private press: {
    id: string | null;
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    moved: boolean;
    shift: boolean;
    at: number;
  } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: AlmaCallbacks,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.specks = Array.from({ length: 110 }, (_, i) => ({
      x: ((i * 7919) % 1000) / 1000,
      y: ((i * 104729) % 1000) / 1000,
      r: 0.4 + ((i * 31) % 10) / 12,
      d: 0.15 + ((i * 17) % 10) / 22,
    }));
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }

  setSettings(settings: AlmaSettings) {
    const forcesChanged =
      settings.spread !== this.settings.spread ||
      settings.pull !== this.settings.pull ||
      settings.gather !== this.settings.gather;
    const sizeChanged = settings.size !== this.settings.size;
    this.settings = settings;
    if (forcesChanged && !this.scene?.positions) {
      this.alpha = Math.max(this.alpha, 0.5);
    }
    if (sizeChanged && !this.handCamera) this.fit();
    this.dirty = true;
  }

  setScene(scene: Scene, activeId: string | null) {
    const modeChanged = this.scene?.mode !== scene.mode;
    const signature = [
      scene.mode,
      scene.nodes.map((node) => node.id).join(),
      scene.edges.map((edge) => edge.id).join(),
    ].join('|');
    const reshaped = signature !== this.signature;
    this.signature = signature;
    this.scene = scene;
    this.activeId = activeId;

    for (const body of this.bodies.values()) body.alive = false;
    scene.nodes.forEach((node, index) => {
      let body = this.bodies.get(node.id);
      if (!body) {
        const seed = this.seedFor(node, scene, index);
        const size = this.sizeOf(node);
        body = {
          node,
          alive: true,
          x: seed.x,
          y: seed.y,
          vx: 0,
          vy: 0,
          w: size.w,
          h: size.h,
          corner: size.corner,
          opacity: 0,
          focus: 1,
          growAt: 0,
          grown: 1,
          seed: hashOf(node.id) % 1000,
        };
        this.bodies.set(node.id, body);
      }
      body.node = node;
      body.alive = true;
    });
    this.groupOf = new Map();
    scene.groups.forEach((group, index) => {
      for (const id of group.memberIds) this.groupOf.set(id, index);
    });
    this.neighbours = new Map();
    const link = (a: string, b: string) => {
      const set = this.neighbours.get(a) ?? new Set<string>();
      set.add(b);
      this.neighbours.set(a, set);
    };
    for (const edge of scene.edges) {
      link(edge.a, edge.b);
      link(edge.b, edge.a);
    }
    if (modeChanged) {
      this.handCamera = false;
      // What was under the pointer has moved out from under it.
      this.setHover(null);
    }
    if (reshaped && !scene.positions) this.alpha = Math.max(this.alpha, 1);
    if (reshaped && !this.handCamera) this.fit();
    if (prefersReducedMotion()) this.settleNow();
    this.dirty = true;
  }

  setMatches(matches: Set<string> | null) {
    this.matches = matches;
    this.dirty = true;
  }

  setSelected(selected: ReadonlySet<string>) {
    this.selected = selected;
    this.dirty = true;
  }

  /** Lights a node up from the keyboard, bringing it into view if it's off. */
  showNode(id: string | null) {
    const body = id ? this.bodies.get(id) : null;
    this.setHover(body ?? null);
    if (!body) return;
    const k = this.cam.k;
    const sx = (body.x - this.cam.x) * k + this.width / 2;
    const sy = (body.y - this.cam.y) * k + this.height / 2;
    const off =
      sx < 80 ||
      sx > this.width - 80 ||
      sy < 110 ||
      sy > this.height - 110 ||
      k < 0.6;
    if (!off) return;
    this.handCamera = true;
    this.camTarget = {
      x: body.x,
      y: body.y,
      k: Math.max(this.camTarget.k, 0.8),
    };
  }

  /** Back to showing everything, and following the layout from here on. */
  resetCamera() {
    this.handCamera = false;
    this.fit();
    this.dirty = true;
  }

  zoomBy(factor: number) {
    this.handCamera = true;
    this.camTarget = {
      ...this.camTarget,
      k: Math.min(4, Math.max(0.12, this.camTarget.k * factor)),
    };
    this.dirty = true;
  }

  /** Brings a node and everything linked to it into view. */
  zoomToNode(id: string) {
    const ids = new Set([id, ...(this.neighbours.get(id) ?? [])]);
    this.handCamera = true;
    this.camTarget = this.fitTo(
      [...ids].flatMap((other) => this.bodies.get(other) ?? []),
    );
    this.dirty = true;
  }

  /**
   * Replays the workspace: pages appear one by one out of the page they came
   * from, in trail order. It isn't the order they were opened in; pages don't
   * keep that yet.
   */
  grow() {
    if (!this.scene) return;
    const list = this.scene.nodes
      .map((node) => this.bodies.get(node.id))
      .filter((body): body is Body => !!body);
    const now = performance.now();
    const step = Math.min(150, 5200 / Math.max(1, list.length));
    list.forEach((body, i) => {
      body.growAt = now + 200 + i * step;
      body.grown = 0;
    });
    this.growing = true;
    this.dirty = true;
  }

  private sizeOf(node: SceneNode) {
    const scale = scaled(this.settings.size, 0.55, 1.9);
    // A row's radius, as in the trail. Marked hubs take the control's.
    if (node.card) return { w: node.card.w, h: node.card.h, corner: 6 };
    const r = node.r * scale;
    return { w: r * 2, h: r * 2, corner: node.glyph ? r * 0.5 : r };
  }

  private pageIdOf(node: SceneNode) {
    return node.page?.id ?? node.id;
  }

  private seedFor(node: SceneNode, scene: Scene, index: number) {
    const fixed = scene.positions?.get(node.id);
    const parent = node.page?.parentId
      ? this.bodies.get(node.page.parentId)
      : undefined;
    if (node.kind === 'site') {
      const self = node.page ? this.bodies.get(node.page.id) : undefined;
      if (self) return { x: self.x, y: self.y };
      const members = scene.edges.flatMap((edge) =>
        edge.a === node.id ? (this.bodies.get(edge.b) ?? []) : [],
      );
      if (members.length) {
        const sum = members.reduce(
          (total, body) => ({ x: total.x + body.x, y: total.y + body.y }),
          { x: 0, y: 0 },
        );
        return { x: sum.x / members.length, y: sum.y / members.length };
      }
    }
    if (parent) {
      return {
        x: parent.x + Math.cos(index * 2.4) * 18,
        y: parent.y + Math.sin(index * 2.4) * 18,
      };
    }
    if (fixed && scene.mode !== 'web') {
      return { x: fixed.x * 0.9, y: fixed.y * 0.9 };
    }
    const radius = 26 * Math.sqrt(index + 1);
    return {
      x: Math.cos(index * 2.399) * radius,
      y: Math.sin(index * 2.399) * radius,
    };
  }

  private settleNow() {
    if (!this.scene) return;
    if (!this.scene.positions) {
      for (let i = 0; i < 320; i++) this.forces(1 - i / 320);
      this.alpha = 0;
      this.orbits(1, 0);
    } else {
      for (const body of this.bodies.values()) {
        const spot = this.scene.positions.get(body.node.id);
        if (spot) Object.assign(body, spot);
      }
    }
    this.fit();
    this.cam = { ...this.camTarget };
  }

  private resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    if (!this.handCamera) this.fit();
    this.dirty = true;
  }

  private readColors() {
    const style = getComputedStyle(this.canvas);
    const read = (name: string) => style.getPropertyValue(name).trim();
    const next: Colors = {
      surface: read('--surface'),
      elevated: read('--elevated'),
      halo: read('--favicon-halo'),
      stroke: Number.parseFloat(read('--icon-stroke-md')) || 2,
      chip: read('--icon-chip'),
      hover: read('--hover'),
      guide: read('--guide'),
      path: read('--guide-path'),
      current: read('--guide-current'),
      outline: read(NODE_OUTLINE_TOKEN),
      fg: read('--fg'),
      muted: read('--fg-muted'),
      subtle: read('--fg-subtle'),
      danger: read('--danger'),
      accent: read('--accent'),
      font: read('--font-ui'),
      dark: style.colorScheme.includes('dark'),
    };
    if (JSON.stringify(next) !== JSON.stringify(this.colors)) {
      this.colors = next;
      this.dirty = true;
    }
  }

  private tintOf(node: SceneNode | undefined): string | null {
    if (!node || !this.colors) return null;
    const { tint } = this.settings;
    let hue: number | null = null;
    if (tint === 'site' && node.site) hue = hashOf(node.site) % 360;
    if (tint === 'trail' && node.trail !== null)
      hue = (node.trail * 137.5) % 360;
    if (tint === 'folder' && node.folder) hue = hashOf(node.folder) % 360;
    if (tint === 'type' && node.type) hue = hashOf(node.type) % 360;
    if (hue === null) return null;
    return this.colors.dark
      ? `oklch(0.76 0.13 ${hue})`
      : `oklch(0.52 0.14 ${hue})`;
  }

  // ———— Motion ————

  private forces(alpha: number) {
    const scene = this.scene;
    if (!scene) return;
    const list = [...this.bodies.values()].filter(
      (body) => body.alive && !body.node.orbit,
    );
    const held = this.stillId();
    const repulsion = 620 * scaled(this.settings.spread, 0.2, 3.5);
    const pullBy = scaled(this.settings.pull, 0.2, 2.2);
    const gravity = scene.gravity * scaled(this.settings.gather, 0.1, 4);
    for (let i = 0; i < list.length; i++) {
      const a = list[i]!;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j]!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        if (dx === 0 && dy === 0) {
          dx = 0.5 - ((i * 7) % 11) / 11;
          dy = 0.5 - ((j * 5) % 11) / 11;
        }
        const d2 = dx * dx + dy * dy;
        if (d2 > 640000) continue;
        const ga = this.groupOf.get(a.node.id);
        const across = ga !== undefined && ga !== this.groupOf.get(b.node.id);
        const push =
          (repulsion *
            a.node.charge *
            b.node.charge *
            alpha *
            (across ? ACROSS_GROUPS : 1)) /
          Math.max(d2, 36);
        a.vx -= dx * push;
        a.vy -= dy * push;
        b.vx += dx * push;
        b.vy += dy * push;
        // Hard edge: systems and nodes don't sit on each other.
        const reach = a.node.collide + b.node.collide;
        if (reach > 0 && d2 < reach * reach) {
          const d = Math.sqrt(d2) || 1;
          const shove = ((reach - d) / d) * 0.25;
          a.x -= dx * shove * 0.5;
          a.y -= dy * shove * 0.5;
          b.x += dx * shove * 0.5;
          b.y += dy * shove * 0.5;
        }
      }
    }
    for (const edge of scene.edges) {
      if (edge.strength === 0) continue;
      const a = this.bodies.get(edge.a);
      const b = this.bodies.get(edge.b);
      if (!a || !b) continue;
      const dx = b.x + b.vx - a.x - a.vx;
      const dy = b.y + b.vy - a.y - a.vy;
      const d = Math.hypot(dx, dy) || 1;
      const pull = ((d - edge.length) / d) * edge.strength * pullBy * alpha;
      a.vx += dx * pull * 0.5;
      a.vy += dy * pull * 0.5;
      b.vx -= dx * pull * 0.5;
      b.vy -= dy * pull * 0.5;
    }
    for (const body of list) {
      body.vx -= body.x * gravity * alpha;
      body.vy -= body.y * gravity * alpha;
      body.vx *= 0.62;
      body.vy *= 0.62;
      if (body.node.id === held) {
        body.vx = 0;
        body.vy = 0;
        continue;
      }
      body.x += body.vx;
      body.y += body.vy;
    }
    this.packGroups(held);
  }

  /** Whole groups shift so their outlines keep clear of each other. */
  private packGroups(held: string | null) {
    const scene = this.scene;
    if (!scene?.groups.length) return;
    const groups = scene.groups.flatMap((group) => {
      const members = group.memberIds.flatMap((id) => {
        const body = this.bodies.get(id);
        return body?.alive && !body.node.orbit ? [body] : [];
      });
      if (!members.length) return [];
      const circle = enclosingCircle(
        members.map((body) => ({
          x: body.x,
          y: body.y,
          r: Math.max(body.w, body.h) / 2 + HULL_PAD,
        })),
      );
      return [{ members, circle }];
    });
    separateGroups(groups, GROUP_GAP, 0.35, (body) => body.node.id === held);
  }

  /**
   * The node that stays put while everything else keeps moving: the one being
   * dragged, or else the one under the pointer, so it holds still to be
   * clicked without stopping the rest of the graph.
   */
  private stillId() {
    if (this.press?.moved) return this.press.id;
    return this.hoverId;
  }

  /** Pages around their site. Returns whether any still has far to go. */
  private orbits(ease: number, spin: number) {
    const held = this.stillId();
    let moving = false;
    for (const body of this.bodies.values()) {
      const orbit = body.node.orbit;
      if (!orbit || !body.alive || body.node.id === held) continue;
      const hub = this.bodies.get(orbit.hub);
      if (!hub) continue;
      const angle = orbit.angle + spin;
      const dx = hub.x + Math.cos(angle) * orbit.radius - body.x;
      const dy = hub.y + Math.sin(angle) * orbit.radius - body.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.1) moving = true;
      body.x += dx * ease;
      body.y += dy * ease;
    }
    return moving;
  }

  /** Eases everything a step; returns whether anything is still moving. */
  private step(now: number): boolean {
    const scene = this.scene;
    if (!scene) return false;
    let moving = false;
    const { drift, flow } = this.settings;
    const calm = prefersReducedMotion();
    const drifting = drift && !calm;
    if (drifting || (flow && !calm)) moving = true;

    this.clock += Math.min(50, now - this.lastFrame);
    this.lastFrame = now;
    const time = this.clock;

    if (!scene.positions) {
      if (this.alpha > 0.006) {
        this.forces(this.alpha);
        this.alpha *= 0.982;
        moving = true;
      } else if (drifting) {
        // Keep the forces barely awake, so the float stays connected.
        for (const body of this.bodies.values()) {
          if (!body.alive || body.node.orbit) continue;
          body.vx += Math.sin(time / 1700 + body.seed) * 0.018;
          body.vy += Math.cos(time / 2300 + body.seed * 1.7) * 0.018;
        }
        this.forces(0.02);
      }
    } else {
      const held = this.stillId();
      for (const body of this.bodies.values()) {
        const spot = scene.positions.get(body.node.id);
        if (!spot || !body.alive || body.node.id === held) continue;
        const wobbleX = drifting ? Math.sin(time / 1700 + body.seed) * 3 : 0;
        const wobbleY = drifting
          ? Math.cos(time / 2300 + body.seed * 1.7) * 3
          : 0;
        const dx = spot.x + wobbleX - body.x;
        const dy = spot.y + wobbleY - body.y;
        if (Math.abs(dx) + Math.abs(dy) > 0.1) moving = true;
        body.x += dx * 0.13;
        body.y += dy * 0.13;
      }
    }
    if (this.orbits(0.16, drifting ? time / 14000 : 0)) {
      moving = true;
    }

    const hoverSet = this.hoverId
      ? new Set([this.hoverId, ...(this.neighbours.get(this.hoverId) ?? [])])
      : null;
    let stillGrowing = false;
    for (const [id, body] of this.bodies) {
      const node = body.node;
      const targetOpacity = body.alive ? 1 : 0;
      const shown = hoverSet
        ? hoverSet.has(id)
        : this.matches
          ? this.matches.has(this.pageIdOf(node))
          : true;
      const targetFocus = shown ? 1 : 0.2;
      const size = this.sizeOf(node);
      const change =
        Math.abs(targetOpacity - body.opacity) +
        Math.abs(targetFocus - body.focus) +
        Math.abs(size.w - body.w) +
        Math.abs(size.h - body.h) +
        Math.abs(size.corner - body.corner);
      if (change > 0.01) moving = true;
      body.opacity += (targetOpacity - body.opacity) * 0.16;
      body.focus += (targetFocus - body.focus) * 0.22;
      body.w += (size.w - body.w) * 0.18;
      body.h += (size.h - body.h) * 0.18;
      body.corner += (size.corner - body.corner) * 0.18;
      if (this.growing && body.grown < 1) {
        stillGrowing = true;
        if (now >= body.growAt) {
          body.grown = Math.min(1, body.grown + 0.09);
        }
      }
    }
    if (this.growing) {
      moving = true;
      if (!stillGrowing) this.growing = false;
    }

    if (!this.handCamera && moving && !scene.positions && this.alpha > 0.04) {
      this.fit();
    }
    const { cam, camTarget } = this;
    const camChange =
      Math.abs(camTarget.x - cam.x) +
      Math.abs(camTarget.y - cam.y) +
      Math.abs(camTarget.k - cam.k) * 200;
    if (camChange > 0.02) moving = true;
    const ease = 0.14;
    cam.x += (camTarget.x - cam.x) * ease;
    cam.y += (camTarget.y - cam.y) * ease;
    cam.k += (camTarget.k - cam.k) * ease;
    return moving;
  }

  private fit() {
    const scene = this.scene;
    if (!scene) return;
    const alive = [...this.bodies.values()].filter((body) => body.alive);
    this.camTarget = this.fitTo(alive, scene.labelMargin);
  }

  private fitTo(list: Body[], labelMargin = 0) {
    if (!list.length || !this.width) return { x: 0, y: 0, k: 1 };
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const positions = this.scene?.positions;
    for (const body of list) {
      const hub = body.node.orbit ? this.bodies.get(body.node.orbit.hub) : null;
      const spot =
        positions?.get(body.node.id) ??
        (hub && body.node.orbit
          ? {
              x:
                hub.x +
                Math.cos(body.node.orbit.angle) * body.node.orbit.radius,
              y:
                hub.y +
                Math.sin(body.node.orbit.angle) * body.node.orbit.radius,
            }
          : body);
      const size = this.sizeOf(body.node);
      const drop = body.node.labelDrop;
      minX = Math.min(minX, spot.x - size.w / 2);
      maxX = Math.max(maxX, spot.x + size.w / 2);
      minY = Math.min(minY, spot.y - size.h / 2);
      maxY = Math.max(maxY, spot.y + size.h / 2 + drop);
    }
    maxX += labelMargin;
    // Room for the controls along the top and bottom edges.
    const top = 96;
    const bottom = 88;
    const sides = 72;
    const k = Math.max(
      0.12,
      Math.min(
        1.1,
        (this.width - sides * 2) / Math.max(1, maxX - minX),
        (this.height - top - bottom) / Math.max(1, maxY - minY),
      ),
    );
    return {
      x: (minX + maxX) / 2,
      y: (minY + maxY) / 2 - (top - bottom) / (2 * k),
      k,
    };
  }

  // ———— Input ————

  private toWorld(x: number, y: number) {
    return {
      x: (x - this.width / 2) / this.cam.k + this.cam.x,
      y: (y - this.height / 2) / this.cam.k + this.cam.y,
    };
  }

  private pick(x: number, y: number, except?: string): Body | null {
    const point = this.toWorld(x, y);
    const slop = 6 / this.cam.k;
    let best: Body | null = null;
    for (const body of this.bodies.values()) {
      if (!body.alive || body.node.id === except) continue;
      const hit = body.node.card
        ? Math.abs(point.x - body.x) <= body.w / 2 + slop &&
          Math.abs(point.y - body.y) <= body.h / 2 + slop
        : Math.hypot(point.x - body.x, point.y - body.y) <= body.w / 2 + slop;
      // Later-drawn bodies sit on top.
      if (hit) best = body;
    }
    return best;
  }

  private setHover(body: Body | null) {
    const id = body?.node.id ?? null;
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.canvas.style.cursor = id ? 'pointer' : 'grab';
    this.callbacks.onHover(body?.node ?? null);
    this.dirty = true;
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    this.canvas.setPointerCapture(event.pointerId);
    // What's lit up is what you meant, even if the pick just misses it.
    const body =
      this.pick(event.offsetX, event.offsetY) ??
      (this.hoverId ? (this.bodies.get(this.hoverId) ?? null) : null);
    this.press = {
      id: body?.node.id ?? null,
      startX: event.offsetX,
      startY: event.offsetY,
      lastX: event.offsetX,
      lastY: event.offsetY,
      moved: false,
      shift: event.shiftKey,
      at: event.timeStamp,
    };
    if (!body) {
      this.canvas.style.cursor = event.shiftKey ? 'crosshair' : 'grabbing';
    }
  };

  private readonly onPointerMove = (event: PointerEvent) => {
    const press = this.press;
    if (!press) {
      this.setHover(this.pick(event.offsetX, event.offsetY));
      return;
    }
    // A trackpad press wanders a little; it isn't a drag until it's meant.
    const travel = Math.hypot(
      event.offsetX - press.startX,
      event.offsetY - press.startY,
    );
    const quick = event.timeStamp - press.at < 220;
    if (!press.moved && travel > (quick ? 10 : 5)) press.moved = true;
    if (!press.moved) return;
    if (!press.id && press.shift) {
      this.lasso = {
        x0: press.startX,
        y0: press.startY,
        x1: event.offsetX,
        y1: event.offsetY,
      };
      this.dirty = true;
      return;
    }
    if (press.id) {
      const body = this.bodies.get(press.id);
      const dragged = body?.node.page?.id;
      if (dragged && body.node.kind === 'page') {
        const under = this.pick(event.offsetX, event.offsetY, press.id);
        const target = under?.node.page?.id;
        const next =
          target &&
          under.node.kind === 'page' &&
          this.callbacks.canDrop(dragged, target)
            ? target
            : null;
        if (next !== this.dropTarget) {
          this.dropTarget = next;
          this.callbacks.onDropTarget(next ? dragged : null, next);
        }
      }
      if (body) {
        const point = this.toWorld(event.offsetX, event.offsetY);
        body.x = point.x;
        body.y = point.y;
        if (!this.scene?.positions) this.alpha = Math.max(this.alpha, 0.25);
        this.handCamera = true;
      }
    } else {
      this.handCamera = true;
      const dx = (event.offsetX - press.lastX) / this.cam.k;
      const dy = (event.offsetY - press.lastY) / this.cam.k;
      this.cam.x -= dx;
      this.cam.y -= dy;
      this.camTarget = { ...this.camTarget, x: this.cam.x, y: this.cam.y };
    }
    press.lastX = event.offsetX;
    press.lastY = event.offsetY;
    this.dirty = true;
  };

  private readonly onPointerUp = (event: PointerEvent) => {
    const press = this.press;
    this.press = null;
    this.canvas.style.cursor = this.hoverId ? 'pointer' : 'grab';
    if (!press) return;
    if (this.lasso) {
      const { x0, y0, x1, y1 } = this.lasso;
      this.lasso = null;
      this.dirty = true;
      const k = this.cam.k;
      const inside = [...this.bodies.values()].flatMap((body) => {
        if (!body.alive || !body.node.page) return [];
        const sx = (body.x - this.cam.x) * k + this.width / 2;
        const sy = (body.y - this.cam.y) * k + this.height / 2;
        const hit =
          sx >= Math.min(x0, x1) &&
          sx <= Math.max(x0, x1) &&
          sy >= Math.min(y0, y1) &&
          sy <= Math.max(y0, y1);
        return hit ? [body.node.page.id] : [];
      });
      this.callbacks.onLasso(inside);
      return;
    }
    if (this.dropTarget) {
      const target = this.dropTarget;
      this.dropTarget = null;
      this.callbacks.onDropTarget(null, null);
      if (press.id) this.callbacks.onDrop(press.id, target);
      this.dirty = true;
      return;
    }
    if (press.moved || !press.id) return;
    const body = this.bodies.get(press.id);
    if (body) {
      this.callbacks.onClick(body.node, {
        altKey: event.altKey,
        shiftKey: press.shift,
      });
    }
  };

  private readonly onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    const body = this.pick(event.offsetX, event.offsetY);
    if (body) this.callbacks.onContext(body.node, event.clientX, event.clientY);
  };

  private readonly onPointerLeave = () => {
    if (!this.press) this.setHover(null);
  };

  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault();
    this.handCamera = true;
    // Pinch arrives as ctrl+wheel. A mouse wheel moves in big whole steps.
    const mouseWheel =
      event.deltaMode !== 0 ||
      (event.deltaX === 0 &&
        Number.isInteger(event.deltaY) &&
        Math.abs(event.deltaY) >= 100);
    if (event.ctrlKey || mouseWheel) {
      const factor = Math.exp(-event.deltaY * (event.ctrlKey ? 0.012 : 0.002));
      const before = this.toWorld(event.offsetX, event.offsetY);
      this.cam.k = Math.min(4, Math.max(0.12, this.cam.k * factor));
      // Keep the point under the cursor where it is.
      const after = this.toWorld(event.offsetX, event.offsetY);
      this.cam.x += before.x - after.x;
      this.cam.y += before.y - after.y;
    } else {
      this.cam.x += event.deltaX / this.cam.k;
      this.cam.y += event.deltaY / this.cam.k;
    }
    this.camTarget = { ...this.cam };
    this.dirty = true;
  };

  // ———— Drawing ————

  private readonly loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    if (this.frame++ % 30 === 0 || !this.colors) this.readColors();
    const moving = this.step(now);
    const animated = [...this.bodies.values()].some(
      (body) => body.alive && body.node.page?.isLoading,
    );
    if (!moving && !animated && !this.dirty) return;
    this.dirty = false;
    this.draw(now);
    if (this.hoverId) {
      const body = this.bodies.get(this.hoverId);
      if (body) {
        const k = this.cam.k;
        this.callbacks.onHoverMove(
          (body.x - this.cam.x) * k + this.width / 2,
          (body.y - this.cam.y) * k + this.height / 2,
        );
      }
    }
  };

  /**
   * The sharpest icon the site offers. Page favicons are often 16px, so the
   * touch icon, usually 180px, is tried beside them and the largest one wins.
   */
  private iconFor(
    node: SceneNode,
  ): { image: HTMLImageElement; pixels: number } | null {
    const key = `${node.iconUrl ?? ''}|${node.iconSite ?? ''}`;
    const known = this.iconChoice.get(key);
    if (known !== undefined) return known;
    const favicon = defaultIconFor(node.iconSite);
    const candidates = [
      node.iconUrl,
      favicon?.replace('/favicon.ico', '/apple-touch-icon.png'),
      favicon,
    ];
    let best: { image: HTMLImageElement; pixels: number } | null = null;
    for (const url of candidates) {
      if (!url || !SAFE_ICON.test(url)) continue;
      let entry = this.icons.get(url);
      if (!entry) {
        const image = new Image();
        image.referrerPolicy = 'no-referrer';
        const created = {
          image,
          state: 'loading' as 'loading' | 'ok' | 'failed',
        };
        image.onload = () => {
          created.state = 'ok';
          this.iconChoice.clear();
          this.dirty = true;
        };
        image.onerror = () => {
          created.state = 'failed';
          this.iconChoice.clear();
          this.dirty = true;
        };
        image.src = url;
        this.icons.set(url, created);
        entry = created;
      }
      if (entry.state !== 'ok') continue;
      const vector = /\.svg(\?|$)|^data:image\/svg/i.test(url);
      const pixels = vector ? 512 : entry.image.naturalWidth;
      if (!best || pixels > best.pixels) best = { image: entry.image, pixels };
    }
    this.iconChoice.set(key, best);
    return best;
  }

  private ellipsize(text: string, max: number): string {
    const key = `${max | 0}:${this.ctx.font}:${text}`;
    const known = this.ellipsized.get(key);
    if (known !== undefined) return known;
    let result = text;
    if (this.ctx.measureText(text).width > max) {
      let low = 0;
      let high = text.length;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (this.ctx.measureText(`${text.slice(0, mid)}…`).width <= max) {
          low = mid;
        } else {
          high = mid - 1;
        }
      }
      result = low > 0 ? `${text.slice(0, low).trimEnd()}…` : '';
    }
    if (this.ellipsized.size > 4000) this.ellipsized.clear();
    this.ellipsized.set(key, result);
    return result;
  }

  private draw(now: number) {
    const { ctx, cam, colors, dpr, width, height, scene } = this;
    if (!colors || !scene) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (this.settings.look === 'stars') this.drawSpecks(colors);
    ctx.setTransform(
      dpr * cam.k,
      0,
      0,
      dpr * cam.k,
      dpr * (width / 2 - cam.x * cam.k),
      dpr * (height / 2 - cam.y * cam.k),
    );
    this.drawRings(scene, colors);
    if (this.settings.look === 'icons') this.drawHulls(scene, colors);
    for (const edge of scene.edges) this.drawEdge(edge, colors);
    if (this.settings.flow && !prefersReducedMotion()) {
      this.drawFlow(scene, colors, now);
    }
    for (const body of this.bodies.values()) this.drawBody(body, colors, now);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawLabels(colors);
    ctx.globalAlpha = 1;
    if (this.lasso) {
      const { x0, y0, x1, y1 } = this.lasso;
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(
        Math.min(x0, x1) + 0.5,
        Math.min(y0, y1) + 0.5,
        Math.abs(x1 - x0),
        Math.abs(y1 - y0),
      );
      ctx.setLineDash([]);
    }
  }

  /** The Stars look's far field, sliding slower than the graph as you pan. */
  private drawSpecks(colors: Colors) {
    const { ctx, cam, width, height } = this;
    ctx.fillStyle = colors.subtle;
    for (const speck of this.specks) {
      const x = (speck.x * width - cam.x * speck.d * 0.4) % width;
      const y = (speck.y * height - cam.y * speck.d * 0.4) % height;
      ctx.globalAlpha = 0.18 + speck.d * 0.5;
      ctx.beginPath();
      ctx.arc(
        x < 0 ? x + width : x,
        y < 0 ? y + height : y,
        speck.r,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }

  private drawRings(scene: Scene, colors: Colors) {
    const { ctx, cam } = this;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colors.guide;
    ctx.lineWidth = 1 / cam.k;
    ctx.setLineDash(
      this.settings.look === 'stars' ? [1 / cam.k, 5 / cam.k] : [],
    );
    for (const radius of scene.rings) {
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  private drawHulls(scene: Scene, colors: Colors) {
    const { ctx } = this;
    for (const hull of scene.hulls) {
      const bodies = hull.memberIds.flatMap((id) => this.bodies.get(id) ?? []);
      if (!bodies.length) continue;
      const focus = Math.min(...bodies.map((body) => body.focus));
      const grown = Math.min(...bodies.map((body) => body.grown));
      ctx.globalAlpha =
        Math.min(...bodies.map((body) => body.opacity)) *
        grown *
        (this.hoverId || this.matches ? Math.max(0.35, focus) : 1);
      // Grown from the hull's sides, past the biggest node, so a page on the
      // edge of a long trail or folder is never left outside.
      const reach =
        HULL_PAD +
        Math.max(...bodies.map((body) => Math.max(body.w, body.h) / 2));
      const outline = roundedHull(bodies, reach);
      if (outline.length < 3) continue;
      ctx.fillStyle = colors.hover;
      ctx.beginPath();
      ctx.moveTo(outline[0]!.x, outline[0]!.y);
      for (const point of outline.slice(1)) ctx.lineTo(point.x, point.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  private curveOf(edge: SceneEdge, a: Body, b: Body): Curve {
    if (edge.curve === 'horizontal') {
      const x0 = a.x + a.w / 2;
      const x1 = b.x - b.w / 2;
      const mid = (x0 + x1) / 2;
      return {
        kind: 'cubic',
        x0,
        y0: a.y,
        c1x: mid,
        c1y: a.y,
        c2x: mid,
        c2y: b.y,
        x1,
        y1: b.y,
      };
    }
    if (edge.curve === 'radial') {
      // Out from the parent along its own angle, into the child along its.
      const ra = Math.hypot(a.x, a.y);
      const rb = Math.hypot(b.x, b.y);
      const mid = (ra + rb) / 2;
      const angleA = Math.atan2(a.y, a.x);
      const angleB = Math.atan2(b.y, b.x);
      return {
        kind: 'cubic',
        x0: a.x,
        y0: a.y,
        c1x: Math.cos(angleA) * mid,
        c1y: Math.sin(angleA) * mid,
        c2x: Math.cos(angleB) * mid,
        c2y: Math.sin(angleB) * mid,
        x1: b.x,
        y1: b.y,
      };
    }
    if (this.settings.look === 'ink') {
      // A hand's slight bow rather than a ruled line.
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const bow = ((hashOf(edge.id) % 100) / 100 - 0.5) * 0.22;
      const mx = (a.x + b.x) / 2 - dy * bow;
      const my = (a.y + b.y) / 2 + dx * bow;
      return {
        kind: 'cubic',
        x0: a.x,
        y0: a.y,
        c1x: mx,
        c1y: my,
        c2x: mx,
        c2y: my,
        x1: b.x,
        y1: b.y,
      };
    }
    return { kind: 'line', x0: a.x, y0: a.y, x1: b.x, y1: b.y };
  }

  private drawEdge(edge: SceneEdge, colors: Colors) {
    const { ctx, cam } = this;
    // A force with nothing to show for it.
    if (edge.kind === 'bind') return;
    const a = this.bodies.get(edge.a);
    const b = this.bodies.get(edge.b);
    if (!a || !b) return;
    const touchesHover =
      this.hoverId !== null &&
      (edge.a === this.hoverId || edge.b === this.hoverId);
    let alpha = Math.min(a.opacity, b.opacity) * Math.min(a.grown, b.grown);
    if (this.hoverId) alpha *= touchesHover ? 1 : 0.1;
    else if (this.matches) alpha *= Math.min(a.focus, b.focus);
    if (alpha < 0.01) return;
    ctx.globalAlpha = alpha;
    let width = 1;
    ctx.strokeStyle = colors.path;
    ctx.setLineDash([]);
    switch (edge.kind) {
      case 'same-site':
        ctx.strokeStyle = colors.path;
        ctx.setLineDash([2 / cam.k, 5 / cam.k]);
        ctx.globalAlpha = alpha * 0.55;
        break;
      case 'member':
        ctx.strokeStyle = colors.guide;
        break;
      case 'cross-site':
        width = 1 + Math.log2(edge.weight) * 0.45;
        break;
      case 'root':
        ctx.strokeStyle = colors.guide;
        break;
      case 'trail':
        ctx.strokeStyle = colors.path;
        width = 1.25;
        break;
    }
    const tint = edge.kind === 'trail' ? this.tintOf(b.node) : null;
    if (tint) {
      ctx.strokeStyle = tint;
      ctx.globalAlpha = alpha * 0.7;
    }
    if (touchesHover) {
      ctx.strokeStyle = tint ?? colors.muted;
      ctx.globalAlpha = alpha;
      width = Math.max(width, 1.5);
    }
    if (edge.path === 'ancestor') {
      ctx.strokeStyle = colors.path;
      width = Math.max(width, 1.5);
    }
    if (edge.path === 'current') {
      ctx.strokeStyle = colors.current;
      ctx.globalAlpha = alpha;
      width = Math.max(width, 1.75);
    }
    width *= scaled(this.settings.lines, 0.5, 3);
    ctx.lineWidth = width / cam.k;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const curve = this.curveOf(edge, a, b);
    ctx.moveTo(curve.x0, curve.y0);
    if (curve.kind === 'cubic') {
      ctx.bezierCurveTo(
        curve.c1x,
        curve.c1y,
        curve.c2x,
        curve.c2y,
        curve.x1,
        curve.y1,
      );
    } else {
      ctx.lineTo(curve.x1, curve.y1);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** Which way a trail went: dots run from a page to the pages it led to. */
  private drawFlow(scene: Scene, colors: Colors, now: number) {
    const { ctx, cam } = this;
    for (const edge of scene.edges) {
      if (edge.kind !== 'trail' && edge.kind !== 'cross-site') continue;
      const a = this.bodies.get(edge.a);
      const b = this.bodies.get(edge.b);
      if (!a || !b) continue;
      const curve = this.curveOf(edge, a, b);
      const t = (now / 1700 + (hashOf(edge.id) % 100) / 100) % 1;
      const u = 1 - t;
      let x: number;
      let y: number;
      if (curve.kind === 'cubic') {
        x =
          u * u * u * curve.x0 +
          3 * u * u * t * curve.c1x +
          3 * u * t * t * curve.c2x +
          t * t * t * curve.x1;
        y =
          u * u * u * curve.y0 +
          3 * u * u * t * curve.c1y +
          3 * u * t * t * curve.c2y +
          t * t * t * curve.y1;
      } else {
        x = curve.x0 + (curve.x1 - curve.x0) * t;
        y = curve.y0 + (curve.y1 - curve.y0) * t;
      }
      const edgeFade = Math.sin(t * Math.PI);
      let alpha = Math.min(a.opacity, b.opacity) * Math.min(a.grown, b.grown);
      if (this.hoverId) {
        alpha *= edge.a === this.hoverId || edge.b === this.hoverId ? 1 : 0.1;
      } else if (this.matches) {
        alpha *= Math.min(a.focus, b.focus);
      }
      ctx.globalAlpha = alpha * edgeFade;
      ctx.fillStyle =
        edge.path === 'current'
          ? colors.current
          : (this.tintOf(b.node) ?? colors.fg);
      ctx.beginPath();
      ctx.arc(x, y, (edge.path ? 2.4 : 1.8) / cam.k, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawBody(body: Body, colors: Colors, now: number) {
    const { ctx, cam } = this;
    const { node, x, y } = body;
    const page = node.page;
    // Grow pops a node up from nothing.
    const pop = 1 - (1 - body.grown) * (1 - body.grown);
    const w = body.w * pop;
    const h = body.h * pop;
    const corner = body.corner * pop;
    let alpha = body.opacity * body.focus * body.grown;
    if (alpha < 0.01) return;
    const asleep = page?.isDiscarded ?? false;
    if (asleep) alpha *= 0.6;
    ctx.globalAlpha = alpha;
    const isCard = w > h + 2;
    const pixelRadius = (Math.min(w, h) / 2) * cam.k;
    const look = this.settings.look;
    const tint = this.tintOf(node);

    if (node.kind === 'workspace') {
      ctx.fillStyle = colors.accent;
      ctx.beginPath();
      ctx.arc(x, y, w / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (!isCard && look === 'stars') {
      // A point of light: bigger for pages that led to more.
      ctx.fillStyle = tint ?? (node.kind === 'site' ? colors.fg : colors.muted);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(w * 0.28, 1.6 / cam.k), 0, Math.PI * 2);
      ctx.fill();
    } else if (!isCard && look === 'ink') {
      ctx.fillStyle = colors.surface;
      ctx.strokeStyle = tint ?? colors.fg;
      ctx.lineWidth = 1.25 / cam.k;
      ctx.beginPath();
      ctx.arc(x, y, w / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (pixelRadius >= 6) {
        const letter = (node.site ?? node.label).charAt(0).toUpperCase();
        ctx.fillStyle = tint ?? colors.fg;
        ctx.font = `500 ${w * 0.62}px ${colors.font}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, x, y + w * 0.03);
      }
    } else if (pixelRadius < 3.5) {
      ctx.fillStyle = tint ?? colors.muted;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(w / 2, 2.2 / cam.k), 0, Math.PI * 2);
      ctx.fill();
    } else if (isCard) {
      this.drawRow(body, w, h, corner, alpha, colors);
    } else {
      const isHub = node.kind === 'site' && !node.page;
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - h / 2, w, h, corner);
      ctx.fillStyle = isHub ? colors.elevated : colors.chip;
      ctx.fill();
      this.drawOutline(
        x,
        y,
        w,
        h,
        corner,
        tint ?? colors.outline,
        tint ? 2 : 1,
      );

      if (node.glyph) {
        this.drawGlyph(
          node.glyph,
          x,
          y,
          w * 0.52,
          tint ?? colors.muted,
          colors,
        );
      } else if (isHub) {
        // Some icons are black: they sit on the chip, not the dark surface.
        const chip = (w / 2) * 0.72;
        ctx.fillStyle = colors.chip;
        ctx.beginPath();
        ctx.arc(x, y, chip, 0, Math.PI * 2);
        ctx.fill();
        this.drawIcon(node, x, y, chip * 1.34, colors);
      } else {
        this.drawIcon(node, x, y, Math.max(8, Math.min(w, h) * 0.66), colors);
      }
    }

    // State, in the same terms as the trail row.
    const hasProblem = !!page?.error || !!page?.isUnresponsive;
    if (hasProblem) {
      ctx.strokeStyle = colors.danger;
      ctx.lineWidth = 1.5 / cam.k;
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y - h / 2, w, h, corner);
      ctx.stroke();
    }
    if (page?.isLoading) {
      const spin = (now / 900) % 1;
      ctx.strokeStyle = colors.muted;
      ctx.lineWidth = 1.5 / cam.k;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const radius = isCard ? 11 : Math.min(w, h) / 2 + 3 / cam.k;
      const start = spin * Math.PI * 2;
      ctx.arc(
        isCard ? x - w / 2 + 18 : x,
        y,
        radius,
        start,
        start + Math.PI * 1.4,
      );
      ctx.stroke();
    }
    if (page?.isAudible && pixelRadius >= 3.5 && look === 'icons') {
      this.drawAudioBadge(body, colors, page.isMuted);
    }

    const isSelected = this.selected.has(this.pageIdOf(node));
    if (isSelected || this.dropTarget === this.pageIdOf(node)) {
      // Picked is an on-state, so it's the one ring that takes the accent.
      ctx.globalAlpha = body.opacity * body.grown;
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = 2 / cam.k;
      const gap = (isSelected ? 2 : 5) / cam.k;
      ctx.setLineDash(isSelected ? [] : [3 / cam.k, 3 / cam.k]);
      ctx.beginPath();
      ctx.roundRect(
        x - w / 2 - gap,
        y - h / 2 - gap,
        w + gap * 2,
        h + gap * 2,
        corner + gap,
      );
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const isActive = this.pageIdOf(node) === this.activeId;
    const isHover = node.id === this.hoverId;
    if (isActive || isHover) {
      // Selection is neutral, as in the sidebar. The accent is on its line.
      ctx.globalAlpha = body.opacity * body.grown * (isActive ? 1 : 0.7);
      ctx.strokeStyle = isActive ? colors.fg : colors.muted;
      ctx.lineWidth = 1.5 / cam.k;
      const gap = 2.5 / cam.k;
      ctx.beginPath();
      ctx.roundRect(
        x - w / 2 - gap,
        y - h / 2 - gap,
        w + gap * 2,
        h + gap * 2,
        corner + gap,
      );
      ctx.stroke();
    }
  }

  /**
   * A page as a trail row: a bare icon and its title, in muted text until it's
   * the current one, which takes the row-hover surface and full-strength text.
   */
  private drawRow(
    body: Body,
    w: number,
    h: number,
    corner: number,
    alpha: number,
    colors: Colors,
  ) {
    const { ctx } = this;
    const { node, x, y } = body;
    const lit =
      node.id === this.hoverId ||
      node.page?.id === this.scene?.centerId ||
      this.pageIdOf(node) === this.activeId;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, corner);
    // Raised off the ground like the current trail row, so lines stop at a
    // visible edge rather than in mid-air.
    ctx.fillStyle = colors.elevated;
    ctx.fill();
    if (lit) {
      ctx.fillStyle = colors.hover;
      ctx.fill();
    }
    this.drawOutline(x, y, w, h, corner, colors.outline, 1);
    const tint = this.tintOf(node);
    if (tint) {
      // A mark at the row's edge: rows in the trail have no borders to colour.
      ctx.fillStyle = tint;
      ctx.beginPath();
      ctx.roundRect(x - w / 2 + 3, y - 7, 2, 14, 1);
      ctx.fill();
    }
    const iconX = x - w / 2 + 18;
    if (colors.halo !== 'none') ctx.filter = colors.halo;
    this.drawIcon(node, iconX, y, 16, colors, true);
    ctx.filter = 'none';
    const textX = iconX + 16;
    const room = x + w / 2 - textX - 10;
    ctx.globalAlpha = alpha * Math.min(1, (w - h) / 90);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = lit ? colors.fg : colors.muted;
    ctx.font = `${lit ? 500 : 400} 13px ${colors.font}`;
    const title = this.ellipsize(node.label, room);
    const hasDetail = !!node.detail && h >= 40;
    ctx.fillText(title, textX, hasDetail ? y - 7 : y);
    if (hasDetail) {
      ctx.fillStyle = colors.subtle;
      ctx.font = `400 11px ${colors.font}`;
      ctx.fillText(this.ellipsize(node.detail!, room), textX, y + 8);
    }
    ctx.globalAlpha = alpha;
  }

  /**
   * A node's edge, just outside its fill so it never sinks into a light chip.
   * `pixels` is the width on screen, whatever the zoom.
   */
  private drawOutline(
    x: number,
    y: number,
    w: number,
    h: number,
    corner: number,
    color: string,
    pixels: number,
  ) {
    const { ctx, cam } = this;
    const lw = pixels / cam.k;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.roundRect(
      x - w / 2 - lw / 2,
      y - h / 2 - lw / 2,
      w + lw,
      h + lw,
      corner + lw / 2,
    );
    ctx.stroke();
  }

  /** A hub's own mark, in the app's icon set and stroke. */
  private drawGlyph(
    glyph: Glyph,
    x: number,
    y: number,
    size: number,
    color: string,
    colors: Colors,
  ) {
    const { ctx } = this;
    if ('emoji' in glyph) {
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${size}px ${colors.font}`;
      ctx.fillText(glyph.emoji, x, y + size * 0.04);
      return;
    }
    let path = this.glyphPaths.get(glyph.path);
    if (!path) {
      path = new Path2D(glyph.path);
      this.glyphPaths.set(glyph.path, path);
    }
    const scale = size / 24;
    ctx.save();
    ctx.translate(x - size / 2, y - size / 2);
    ctx.scale(scale, scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (glyph.fill) {
      ctx.fillStyle = color;
      ctx.fill(path);
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = colors.stroke;
      ctx.stroke(path);
    }
    ctx.restore();
  }

  private drawIcon(
    node: SceneNode,
    x: number,
    y: number,
    size: number,
    colors: Colors,
    bare = false,
  ) {
    const { ctx, cam, dpr, width, height } = this;
    const icon = this.iconFor(node);
    if (icon && size * cam.k >= 5) {
      // Whole device pixels, never stretched past what the icon holds: a small
      // sharp icon reads better than a big blurred one.
      const wanted = size * cam.k * dpr;
      const limit =
        icon.pixels >= 64 ? Infinity : Math.max(icon.pixels * 1.5, 16 * dpr);
      const device = Math.max(4, Math.round(Math.min(wanted, limit) / 4) * 4);
      const dx = Math.round(
        ((x - cam.x) * cam.k + width / 2) * dpr - device / 2,
      );
      const dy = Math.round(
        ((y - cam.y) * cam.k + height / 2) * dpr - device / 2,
      );
      // Scaled once per size, then copied: this runs every frame.
      const scaledKey = `${icon.image.src}@${device}`;
      let tile = this.scaledIcons.get(scaledKey);
      if (!tile) {
        tile = document.createElement('canvas');
        tile.width = device;
        tile.height = device;
        const paint = tile.getContext('2d')!;
        paint.imageSmoothingEnabled = true;
        paint.imageSmoothingQuality = 'high';
        if (icon.pixels >= 64) {
          // Touch icons are opaque squares; round them like the chip.
          paint.beginPath();
          paint.roundRect(0, 0, device, device, device * 0.22);
          paint.clip();
        }
        paint.drawImage(icon.image, 0, 0, device, device);
        if (this.scaledIcons.size > 800) this.scaledIcons.clear();
        this.scaledIcons.set(scaledKey, tile);
      }
      const before = ctx.getTransform();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(tile, dx, dy);
      ctx.setTransform(before);
      return;
    }
    const scale = size / 24;
    ctx.save();
    ctx.translate(x - size / 2, y - size / 2);
    ctx.scale(scale, scale);
    // A globe on the chip, which stays light in both themes.
    ctx.strokeStyle = colors.dark && !bare ? colors.elevated : colors.subtle;
    ctx.lineWidth = 2;
    ctx.stroke(GLOBE);
    ctx.restore();
  }

  private drawAudioBadge(body: Body, colors: Colors, muted: boolean) {
    const { ctx, cam } = this;
    const size = 12 / cam.k;
    const bx = body.x + body.w / 2 - size * 0.15;
    const by = body.y - body.h / 2 + size * 0.15;
    ctx.fillStyle = colors.elevated;
    ctx.strokeStyle = colors.outline;
    ctx.lineWidth = 1 / cam.k;
    ctx.beginPath();
    ctx.arc(bx, by, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.translate(bx - size * 0.32, by - size * 0.32);
    ctx.scale(size * 0.0266, size * 0.0266);
    ctx.fillStyle = muted ? colors.subtle : colors.fg;
    ctx.fill(SPEAKER);
    ctx.restore();
    if (muted) {
      ctx.strokeStyle = colors.subtle;
      ctx.lineWidth = 1 / cam.k;
      ctx.beginPath();
      ctx.moveTo(bx + size * 0.08, by - size * 0.14);
      ctx.lineTo(bx + size * 0.32, by + size * 0.14);
      ctx.stroke();
    }
  }

  private drawLabels(colors: Colors) {
    const { ctx, cam, width, height } = this;
    const hoverNear = this.hoverId ? this.neighbours.get(this.hoverId) : null;
    const rank = (body: Body) => {
      const id = body.node.id;
      if (id === this.hoverId) return 0;
      if (this.pageIdOf(body.node) === this.activeId) return 1;
      if (hoverNear?.has(id)) return 2;
      if (this.matches?.has(this.pageIdOf(body.node))) return 3;
      if (body.node.kind !== 'page') return 4;
      return 5 - Math.min(0.9, body.node.r / 60);
    };
    const list = [...this.bodies.values()]
      .filter((body) => body.alive && !body.node.card)
      .sort((a, b) => rank(a) - rank(b));
    const taken: { x: number; y: number; w: number; h: number }[] = [];
    // Labels keep off the nodes too, so a word never runs across an icon.
    const obstacles = list.map((body) => {
      const r = (body.w / 2) * cam.k + 3;
      return {
        id: body.node.id,
        x: (body.x - cam.x) * cam.k + width / 2 - r,
        y: (body.y - cam.y) * cam.k + height / 2 - r,
        w: r * 2,
        h: r * 2,
      };
    });
    // 0 hides all but the strongest; 1 lets them all through much sooner.
    const density = (this.settings.labels - 0.5) * 2;
    // With few pages there's room for every name, and half-faded text reads
    // worse than either.
    const few = list.length <= 40;
    ctx.lineJoin = 'round';
    ctx.textBaseline = 'middle';
    let drawn = 0;
    for (const body of list) {
      if (drawn > 90) break;
      const node = body.node;
      const r = rank(body);
      const forced = r < 4;
      let reveal = 1;
      if (!forced) {
        if ((this.hoverId || this.matches) && node.labelRule !== 'always') {
          reveal = 0;
        } else if (node.labelRule === 'always') {
          reveal =
            (this.hoverId || this.matches ? body.focus : 1) *
            (density <= -0.8 ? 0 : 1);
        } else if (few) {
          reveal = 1;
        } else if (node.labelRule === 'large') {
          reveal = (cam.k - (0.45 - density * 0.4)) / 0.08;
        } else {
          reveal = (cam.k - (1.05 - density * 0.85)) / 0.08;
        }
      }
      reveal = Math.min(1, reveal) * body.opacity * body.grown;
      if (reveal < 0.03) continue;
      const sx = (body.x - cam.x) * cam.k + width / 2;
      const sy = (body.y - cam.y) * cam.k + height / 2;
      if (sx < -160 || sx > width + 160 || sy < -40 || sy > height + 40) {
        continue;
      }
      const strong = r < 3;
      ctx.font = `${strong ? 500 : 400} 12px ${colors.font}`;
      const right = node.labelSide === 'right';
      const room = right
        ? Math.max(0, node.labelMax * cam.k)
        : Math.max(90, node.labelMax * Math.min(1, cam.k + 0.2));
      const text = this.ellipsize(node.label, room);
      if (!text || (right && room < 34)) continue;
      const widthKey = `${strong ? 'b' : 'r'}${text}`;
      let w = this.textWidths.get(widthKey);
      if (w === undefined) {
        w = ctx.measureText(text).width;
        if (this.textWidths.size > 4000) this.textWidths.clear();
        this.textWidths.set(widthKey, w);
      }
      const offset = (body.h / 2 + node.labelDrop) * cam.k + 4;
      const lx = right ? sx + offset + 2 : sx - w / 2;
      const ly = right ? sy : sy + offset + 8;
      const box = { x: lx - 6, y: ly - 10, w: w + 12, h: 20 };
      const hits = (other: { x: number; y: number; w: number; h: number }) =>
        box.x < other.x + other.w &&
        other.x < box.x + box.w &&
        box.y < other.y + other.h &&
        other.y < box.y + box.h;
      // A hub's name lies past its ring of pages, and has to show regardless.
      const overlaps =
        taken.some(hits) ||
        (node.kind === 'page' &&
          obstacles.some((other) => other.id !== node.id && hits(other)));
      if (overlaps && !strong) continue;
      taken.push(box);
      drawn++;
      ctx.textAlign = 'left';
      ctx.globalAlpha =
        reveal * (body.node.page?.isDiscarded && !strong ? 0.7 : 1);
      ctx.lineWidth = 3;
      ctx.strokeStyle = colors.surface;
      ctx.strokeText(text, lx, ly);
      ctx.fillStyle = strong || node.kind !== 'page' ? colors.fg : colors.muted;
      ctx.fillText(text, lx, ly);
    }
  }
}
