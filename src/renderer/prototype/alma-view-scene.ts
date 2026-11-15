/*
 * Alma view's seven modes of one scene: pure data here (what's connected,
 * where it sits), drawn by alma-view-canvas.ts. Nothing here touches the trail.
 */
import type { PageGroup, PageId, PageSnapshot } from '../../shared/types';
import { pageParts, shortHost } from '../lib/format';

export type GraphMode =
  | 'web'
  | 'sites'
  | 'folders'
  | 'types'
  | 'trails'
  | 'rings'
  | 'focus';

export const GRAPH_MODES: { value: GraphMode; label: string; hint: string }[] =
  [
    {
      value: 'web',
      label: 'Web',
      hint: 'Every page, pulled toward the pages it came from.',
    },
    {
      value: 'sites',
      label: 'Sites',
      hint: 'Pages gathered by site. Lines show where a trail crossed sites.',
    },
    {
      value: 'folders',
      label: 'Folders',
      hint: 'Each folder holding its trails. Trails in no folder float free.',
    },
    {
      value: 'types',
      label: 'Types',
      hint: 'Pages gathered by what they are, going by their address.',
    },
    {
      value: 'trails',
      label: 'Trails',
      hint: 'Each trail as a tree, reading left to right.',
    },
    {
      value: 'rings',
      label: 'Rings',
      hint: 'Each ring is one step further from where a trail began.',
    },
    {
      value: 'focus',
      label: 'Focus',
      hint: 'Where this page came from, where it led, and its site’s other pages.',
    },
  ];

export interface GraphData {
  pages: Record<PageId, PageSnapshot>;
  rootIds: PageId[];
  activePageId: PageId | null;
  workspaceName: string;
  groups: PageGroup[];
  /** Bytes per page, from the task manager; asleep pages have none. */
  memory: Map<PageId, number>;
}

export interface SceneOptions {
  sameSiteLinks: boolean;
  hops: number;
  focusId: PageId | null;
  /** Width over height of the space available. */
  aspect: number;
  /** What a page's size says: how much it led to, or what it costs. */
  sizeBy: 'branch' | 'memory';
}

export interface SceneNode {
  id: string;
  kind: 'page' | 'site' | 'workspace';
  page: PageSnapshot | null;
  label: string;
  /** Second line: a site's page count, a card's address. */
  detail: string | null;
  iconUrl: string | null;
  iconSite: string | null;
  r: number;
  /** Drawn as a card of this size rather than a circle. */
  card: { w: number; h: number } | null;
  /** How readily its label shows: always, once legible, or close up. */
  labelRule: 'always' | 'large' | 'zoom';
  labelSide: 'right' | 'below';
  labelMax: number;
  charge: number;
  /** Pushes others away within this distance, whatever the charge. */
  collide: number;
  /** Which trail and site it belongs to, for colouring. */
  trail: number | null;
  site: string | null;
  /** Circles a site rather than finding its own place. */
  orbit: { hub: string; angle: number; radius: number } | null;
  /** Extra room under it before its label starts. */
  labelDrop: number;
  /** A hub's own mark, in place of a site icon: an icon outline or an emoji. */
  glyph: Glyph | null;
  /** The filter a hub stands for, so clicking it can apply it. */
  term: string | null;
  /** Which folder and type it belongs to, for colouring and the hover card. */
  folder: string | null;
  type: PageType | null;
}

export type Glyph = { path: string; fill: boolean } | { emoji: string };

export interface SceneEdge {
  id: string;
  a: string;
  b: string;
  kind: 'trail' | 'same-site' | 'member' | 'cross-site' | 'root' | 'bind';
  weight: number;
  length: number;
  strength: number;
  curve: 'line' | 'horizontal' | 'radial';
  /** On the way down to the current page, like the sidebar's guide lines. */
  path: 'current' | 'ancestor' | null;
}

export interface Scene {
  mode: GraphMode;
  nodes: SceneNode[];
  edges: SceneEdge[];
  /** Fixed places; `null` lets the forces decide. */
  positions: Map<string, { x: number; y: number }> | null;
  gravity: number;
  rings: number[];
  /** Trails outlined behind their pages. */
  hulls: { id: string; memberIds: string[] }[];
  /**
   * Pages that settle as one: they push each other about, while the group
   * as a whole keeps clear of the others. Empty leaves every node on its own.
   */
  groups: { id: string; memberIds: string[] }[];
  labelMargin: number;
  centerId: PageId | null;
  counts: { pages: number; trails: number; sites: number };
}

export type PageType =
  | 'docs'
  | 'code'
  | 'video'
  | 'read'
  | 'social'
  | 'talk'
  | 'shop'
  | 'tools'
  | 'search'
  | 'file'
  | 'other';

/**
 * What a page is, guessed from its address: the browser knows nothing firmer.
 * The first rule that fits wins, so the order matters.
 */
export const PAGE_TYPES: {
  value: PageType;
  label: string;
  /** Lucide's outline, on a 24 unit grid. */
  path: string;
  rule: RegExp | null;
}[] = [
  {
    value: 'file',
    label: 'Files',
    path: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5',
    rule: /^file:|\.(pdf|png|jpe?g|gif|webp|svg|zip|csv|xlsx?|docx?|pptx?)([?#]|$)/,
  },
  {
    value: 'search',
    label: 'Searches',
    path: 'M21 21l-4.34-4.34 M3 11a8 8 0 1 0 16 0a8 8 0 1 0 -16 0',
    rule: /\/\/(www\.)?(google\.[a-z.]+\/search|bing\.com\/search|duckduckgo\.com\/.*[?&]q=|kagi\.com\/search|search\.brave\.com)/,
  },
  {
    value: 'video',
    label: 'Video',
    path: 'M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z',
    rule: /\/\/([\w-]+\.)*(youtube\.com|youtu\.be|vimeo\.com|twitch\.tv|netflix\.com|disneyplus\.com|primevideo\.com|spotify\.com|soundcloud\.com)\//,
  },
  {
    value: 'code',
    label: 'Code',
    path: 'M18 16l4-4-4-4 M6 8l-4 4 4 4 M14.5 4l-5 16',
    rule: /\/\/([\w-]+\.)*(github\.com|gitlab\.com|bitbucket\.org|stackoverflow\.com|stackexchange\.com|npmjs\.com|pypi\.org|crates\.io|codepen\.io|codesandbox\.io|huggingface\.co)\//,
  },
  {
    value: 'docs',
    label: 'Docs',
    path: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5 M10 9H8 M16 13H8 M16 17H8',
    rule: /\/\/(docs?\.|developer\.|developers\.|devdocs\.|wiki\.|learn\.)|\/\/([\w-]+\.)*(readthedocs\.io|rfc-editor\.org|w3\.org|whatwg\.org|d3js\.org|react\.dev|tailwindcss\.com|electronjs\.org)\/|\/(docs?|documentation|reference|api|manual|guide)(\/|$)/,
  },
  {
    value: 'talk',
    label: 'Mail and chat',
    path: 'M22 7l-8.991 5.727a2 2 0 0 1-2.009 0L2 7 M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-16a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2z',
    rule: /\/\/(mail\.|webmail\.|chat\.)|\/\/([\w-]+\.)*(outlook\.(com|office\.com)|slack\.com|discord\.com|teams\.microsoft\.com|whatsapp\.com|telegram\.org)\//,
  },
  {
    value: 'social',
    label: 'Social',
    path: 'M16 10a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 14.286V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z M20 9a2 2 0 0 1 2 2v10.286a.71.71 0 0 1-1.212.502l-2.202-2.202A2 2 0 0 0 17.172 19H10a2 2 0 0 1-2-2v-1',
    rule: /\/\/([\w-]+\.)*(x\.com|twitter\.com|reddit\.com|linkedin\.com|facebook\.com|instagram\.com|threads\.net|bsky\.app|mastodon\.[a-z]+|ycombinator\.com|lobste\.rs|tiktok\.com)\//,
  },
  {
    value: 'shop',
    label: 'Shopping',
    path: 'M16 10a4 4 0 0 1-8 0 M3.103 6.034h17.794 M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z',
    rule: /\/\/([\w-]+\.)*(amazon\.[a-z.]+|ebay\.[a-z.]+|etsy\.com|idealo\.[a-z.]+|shopify\.com|zalando\.[a-z.]+|apple\.com\/shop)\/|\/(cart|checkout|basket)(\/|$)/,
  },
  {
    value: 'tools',
    label: 'Tools',
    path: 'M4 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1z M15 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1z M15 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1z M4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-5a1 1 0 0 1 1 -1z',
    rule: /\/\/([\w-]+\.)*(figma\.com|notion\.so|linear\.app|airtable\.com|miro\.com|trello\.com|atlassian\.net|canva\.com|sheets\.google\.com|calendar\.google\.com|drive\.google\.com|claude\.ai|chatgpt\.com)\//,
  },
  {
    value: 'read',
    label: 'Reading',
    path: 'M15 18h-5 M18 14h-8 M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2 M11 6h6a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-6a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1z',
    rule: /\/\/(news\.|blog\.)|\/\/([\w-]+\.)*(wikipedia\.org|medium\.com|substack\.com|nytimes\.com|theguardian\.com|bbc\.(com|co\.uk)|spiegel\.de|zeit\.de|theverge\.com|arstechnica\.com)\/|\/(blog|article|articles|news|posts?)\//,
  },
  {
    value: 'other',
    label: 'Other',
    path: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0 M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20 M2 12h20',
    rule: null,
  },
];

export function pageTypeOf(page: PageSnapshot): PageType {
  const url = (page.url ?? '').replace(/^view-source:/, '').toLowerCase();
  if (!url) return 'other';
  return PAGE_TYPES.find((type) => type.rule?.test(url))?.value ?? 'other';
}

const FOLDER_PATH =
  'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z';

/** The filter for a folder, or for pages in none. */
export function folderTerm(group: PageGroup | null) {
  if (!group) return 'folder:none';
  const name = group.name.toLowerCase().replace(/"/g, '');
  return /\s/.test(name) ? `folder:"${name}"` : `folder:${name}`;
}

interface Walk {
  order: PageId[];
  depth: Map<PageId, number>;
  rootOf: Map<PageId, PageId>;
  descendants: Map<PageId, number>;
  kids: Map<PageId, PageId[]>;
  ancestors: Set<PageId>;
  roots: PageId[];
}

/**
 * One walk per GraphData: the filter rail counts a dozen queries on every
 * keystroke, and each used to walk every trail again.
 */
const walks = new WeakMap<GraphData, Walk>();

function walkTrails(data: GraphData): Walk {
  const known = walks.get(data);
  if (known) return known;
  const walk: Walk = {
    order: [],
    depth: new Map(),
    rootOf: new Map(),
    descendants: new Map(),
    kids: new Map(),
    ancestors: new Set(),
    roots: data.rootIds.filter((id) => data.pages[id]),
  };
  const visit = (id: PageId, depth: number, root: PageId): number => {
    const page = data.pages[id]!;
    const kids = page.childIds.filter((child) => data.pages[child]);
    walk.order.push(id);
    walk.depth.set(id, depth);
    walk.rootOf.set(id, root);
    walk.kids.set(id, kids);
    let total = 0;
    for (const kid of kids) total += 1 + visit(kid, depth + 1, root);
    walk.descendants.set(id, total);
    return total;
  };
  for (const root of walk.roots) visit(root, 0, root);
  let up = data.activePageId ? data.pages[data.activePageId]?.parentId : null;
  while (up && data.pages[up]) {
    walk.ancestors.add(up);
    up = data.pages[up]!.parentId;
  }
  walks.set(data, walk);
  return walk;
}

/** The site a page belongs to; empty and internal pages have none. */
export function siteOf(page: PageSnapshot): string | null {
  if (!page.url) return null;
  const url = page.url.replace(/^view-source:/, '');
  return /^(https?|file):/.test(url) ? shortHost(url) : null;
}

function pageNode(
  page: PageSnapshot,
  overrides: Partial<SceneNode> = {},
): SceneNode {
  const { title, site } = pageParts(page);
  return {
    id: page.id,
    kind: 'page',
    page,
    label: title,
    detail: site,
    iconUrl: page.faviconUrl,
    iconSite: page.url,
    r: 8,
    card: null,
    labelRule: 'zoom',
    labelSide: 'below',
    labelMax: 150,
    charge: 1,
    collide: 0,
    trail: null,
    site: siteOf(page),
    orbit: null,
    labelDrop: 0,
    glyph: null,
    term: null,
    folder: null,
    type: null,
    ...overrides,
  };
}

function pathOf(data: GraphData, walk: Walk, childId: PageId) {
  if (childId === data.activePageId) return 'current' as const;
  return walk.ancestors.has(childId) ? ('ancestor' as const) : null;
}

function trailEdges(
  data: GraphData,
  walk: Walk,
  shape: Pick<SceneEdge, 'length' | 'strength' | 'curve'>,
  only?: Set<PageId>,
): SceneEdge[] {
  const edges: SceneEdge[] = [];
  for (const id of walk.order) {
    const parent = data.pages[id]!.parentId;
    if (!parent || !data.pages[parent]) continue;
    if (only && !(only.has(id) && only.has(parent))) continue;
    edges.push({
      id: `trail:${parent}:${id}`,
      a: parent,
      b: id,
      kind: 'trail',
      weight: 1,
      path: pathOf(data, walk, id),
      ...shape,
    });
  }
  return edges;
}

function buildWeb(data: GraphData, walk: Walk, options: SceneOptions) {
  const nodes = walk.order.map((id) => {
    const count = walk.descendants.get(id) ?? 0;
    return pageNode(data.pages[id]!, {
      r: 9 + 1.5 * Math.sqrt(count),
      // Room for the label underneath, not just the node.
      collide: 40 + 1.5 * Math.sqrt(count),
      labelRule: count >= 2 ? ('large' as const) : ('zoom' as const),
    });
  });
  const edges = trailEdges(data, walk, {
    length: 96,
    strength: 0.5,
    curve: 'line',
  });
  if (options.sameSiteLinks) {
    // A star from a site's first page: every pair would be a hairball.
    const first = new Map<string, PageId>();
    for (const id of walk.order) {
      const site = siteOf(data.pages[id]!);
      if (!site) continue;
      const hub = first.get(site);
      if (!hub) {
        first.set(site, id);
      } else if (walk.rootOf.get(hub) !== walk.rootOf.get(id)) {
        edges.push({
          id: `site:${hub}:${id}`,
          a: hub,
          b: id,
          kind: 'same-site',
          weight: 1,
          length: 260,
          strength: 0.008,
          curve: 'line',
          path: null,
        });
      }
    }
  }
  const hulls = walk.roots
    .map((root) => ({
      id: root,
      memberIds: walk.order.filter((id) => walk.rootOf.get(id) === root),
    }))
    .filter((hull) => hull.memberIds.length >= 3);
  // Every trail, a lone page too, so nothing drifts off by itself.
  const groups = walk.roots.map((root) => ({
    id: root,
    memberIds: walk.order.filter((id) => walk.rootOf.get(id) === root),
  }));
  return { nodes, edges, hulls, groups, gravity: 0.045 };
}

interface Gathering {
  /** The hub a page gathers under; pages with none float on their own. */
  keyOf(page: PageSnapshot): string | null;
  /** A hub with one page is that page, with nothing to gather. */
  mergeLone: boolean;
  hub(key: string, ids: PageId[], trails: number): Partial<SceneNode>;
}

/** Pages circling a hub, with lines where a trail crossed between hubs. */
function buildGathered(data: GraphData, walk: Walk, gathering: Gathering) {
  const members = new Map<string, PageId[]>();
  for (const id of walk.order) {
    const key = gathering.keyOf(data.pages[id]!);
    if (!key) continue;
    members.set(key, [...(members.get(key) ?? []), id]);
  }
  const nodes: SceneNode[] = [];
  const edges: SceneEdge[] = [];
  for (const [key, ids] of members) {
    const first = data.pages[ids[0]!]!;
    const trails = new Set(ids.map((id) => walk.rootOf.get(id))).size;
    const lone = gathering.mergeLone && ids.length === 1;
    const r = lone ? 11 : 14 + 2.6 * Math.sqrt(ids.length);
    // Up to a dozen to a ring; a busy site gets a second one.
    const perRing = 12;
    const inner = r + 30;
    const rings = Math.ceil(ids.length / perRing);
    const system = lone ? r + 14 : inner + (rings - 1) * 32 + 8;
    nodes.push({
      id: `site:${key}`,
      kind: 'site',
      page: lone ? first : null,
      label: key,
      detail: lone
        ? pageParts(first).title
        : `${ids.length} ${ids.length === 1 ? 'page' : 'pages'} · ${trails} ${trails === 1 ? 'trail' : 'trails'}`,
      iconUrl: first.faviconUrl,
      iconSite: first.url,
      r,
      card: null,
      labelRule: lone ? 'large' : 'always',
      labelSide: 'below',
      labelMax: 160,
      charge: 1 + system / 26,
      collide: system + 36,
      trail: null,
      site: null,
      orbit: null,
      labelDrop: lone ? 0 : system - r,
      glyph: null,
      term: null,
      folder: null,
      type: null,
      ...gathering.hub(key, ids, trails),
    });
    if (lone) continue;
    ids.forEach((id, i) => {
      const ring = Math.floor(i / perRing);
      const onRing = Math.min(ids.length - ring * perRing, perRing);
      const angle =
        ((i % perRing) / onRing) * Math.PI * 2 - Math.PI / 2 + ring * 0.4;
      const radius = inner + ring * 32;
      nodes.push(
        pageNode(data.pages[id]!, {
          r: 7,
          charge: 0,
          orbit: { hub: `site:${key}`, angle, radius },
        }),
      );
      edges.push({
        id: `member:${key}:${id}`,
        a: `site:${key}`,
        b: id,
        kind: 'member',
        weight: 1,
        length: radius,
        strength: 0,
        curve: 'line',
        path: id === data.activePageId ? 'current' : null,
      });
    });
  }
  for (const id of walk.order) {
    if (!gathering.keyOf(data.pages[id]!))
      nodes.push(pageNode(data.pages[id]!, { r: 7 }));
  }
  const crossings = new Map<string, { a: string; b: string; count: number }>();
  for (const id of walk.order) {
    const page = data.pages[id]!;
    const parent = page.parentId ? data.pages[page.parentId] : null;
    if (!parent) continue;
    const from = gathering.keyOf(parent);
    const to = gathering.keyOf(page);
    if (!from || !to || from === to) continue;
    const [a, b] = [from, to].sort() as [string, string];
    const key = `${a}|${b}`;
    const crossing = crossings.get(key) ?? { a, b, count: 0 };
    crossing.count++;
    crossings.set(key, crossing);
  }
  for (const [key, { a, b, count }] of crossings) {
    edges.push({
      id: `cross:${key}`,
      a: `site:${a}`,
      b: `site:${b}`,
      kind: 'cross-site',
      weight: count,
      length: 190,
      strength: Math.min(0.14, 0.06 + count * 0.02),
      curve: 'line',
      path: null,
    });
  }
  return { nodes, edges, gravity: 0.05 };
}

function buildSites(data: GraphData, walk: Walk) {
  return buildGathered(data, walk, {
    keyOf: siteOf,
    mergeLone: true,
    hub: (site) => ({ site }),
  });
}

function buildTypes(data: GraphData, walk: Walk) {
  return buildGathered(data, walk, {
    keyOf: pageTypeOf,
    mergeLone: false,
    hub: (key) => {
      const type = PAGE_TYPES.find((t) => t.value === key)!;
      return {
        id: `site:${key}`,
        label: type.label,
        iconUrl: null,
        iconSite: null,
        glyph: { path: type.path, fill: false },
        term: `type:${key}`,
        type: type.value,
      };
    },
  });
}

/** Web's shape, with each folder a hub its trails hang from. */
function buildFolders(data: GraphData, walk: Walk, options: SceneOptions) {
  const web = buildWeb(data, walk, options);
  const nodes = [...web.nodes];
  const edges = [...web.edges];
  const hulls: Scene['hulls'] = [];
  const filed = new Set<PageId>();
  for (const group of data.groups) {
    const roots = walk.roots.filter(
      (root) => data.pages[root]!.groupId === group.id,
    );
    if (!roots.length) continue;
    const ids = walk.order.filter((id) =>
      roots.includes(walk.rootOf.get(id) ?? ''),
    );
    const hub = `folder:${group.id}`;
    const r = 15 + 1.8 * Math.sqrt(ids.length);
    nodes.push({
      id: hub,
      kind: 'site',
      page: null,
      label: group.name,
      detail: `${ids.length} ${ids.length === 1 ? 'page' : 'pages'} · ${roots.length} ${roots.length === 1 ? 'trail' : 'trails'}`,
      iconUrl: null,
      iconSite: null,
      r,
      card: null,
      labelRule: 'always',
      labelSide: 'below',
      labelMax: 170,
      charge: 1.8,
      collide: r + 44,
      trail: null,
      site: null,
      orbit: null,
      labelDrop: 0,
      glyph: group.icon
        ? { emoji: group.icon.value }
        : { path: FOLDER_PATH, fill: true },
      term: folderTerm(group),
      folder: group.id,
      type: null,
    });
    for (const root of roots) {
      edges.push({
        id: `folder:${group.id}:${root}`,
        a: hub,
        b: root,
        kind: 'member',
        weight: 1,
        length: 120,
        strength: 0.3,
        curve: 'line',
        path: root === data.activePageId ? 'current' : null,
      });
    }
    // Every page leans toward its folder, so the hub ends up among them.
    for (const id of ids) {
      if (roots.includes(id)) continue;
      edges.push({
        id: `bind:${group.id}:${id}`,
        a: hub,
        b: id,
        kind: 'bind',
        weight: 1,
        length: 170,
        strength: 0.05,
        curve: 'line',
        path: null,
      });
    }
    hulls.push({ id: hub, memberIds: [hub, ...ids] });
    for (const root of roots) filed.add(root);
  }
  // A folder settles as one, so it keeps clear of the other folders and of
  // the trails in none; those settle as they do in Web.
  const groups = [
    ...hulls,
    ...web.groups.filter((group) => !filed.has(group.id)),
  ];
  return { nodes, edges, hulls, groups, gravity: web.gravity };
}

function buildTrails(data: GraphData, walk: Walk, options: SceneOptions) {
  const COL = 216;
  const ROW = 36;
  const GAP = 30;
  const LEAF_LABEL = 230;
  const trees = walk.roots.map((root) => {
    const spots = new Map<PageId, { x: number; y: number }>();
    let row = 0;
    let deepest = 0;
    const place = (id: PageId, depth: number): number => {
      deepest = Math.max(deepest, depth);
      const ys = (walk.kids.get(id) ?? []).map((kid) => place(kid, depth + 1));
      const y = ys.length ? (ys[0]! + ys.at(-1)!) / 2 : row++;
      spots.set(id, { x: depth * COL, y: y * ROW });
      return y;
    };
    place(root, 0);
    return { spots, w: deepest * COL + LEAF_LABEL, h: row * ROW };
  });
  // Trails stack in columns, wrapping to fill the space rather than a tall strip.
  const area = trees.reduce((sum, tree) => sum + tree.w * (tree.h + GAP), 0);
  const tallest = Math.max(0, ...trees.map((tree) => tree.h));
  const limit = Math.max(tallest, Math.sqrt(area / options.aspect));
  const positions = new Map<string, { x: number; y: number }>();
  let left = 0;
  let top = 0;
  let columnWidth = 0;
  let bottom = 0;
  for (const tree of trees) {
    if (top > 0 && top + tree.h > limit) {
      left += columnWidth + GAP * 2;
      top = 0;
      columnWidth = 0;
    }
    for (const [id, spot] of tree.spots) {
      positions.set(id, { x: left + spot.x, y: top + spot.y });
    }
    top += tree.h + GAP;
    bottom = Math.max(bottom, top);
    columnWidth = Math.max(columnWidth, tree.w);
  }
  const right = left + columnWidth;
  for (const spot of positions.values()) {
    spot.x -= right / 2;
    spot.y -= bottom / 2;
  }
  const nodes = walk.order.map((id) => {
    const leaf = !walk.kids.get(id)?.length;
    return pageNode(data.pages[id]!, {
      r: 8,
      labelRule: 'always',
      labelSide: 'right',
      labelMax: leaf ? LEAF_LABEL - 24 : COL - 30,
    });
  });
  const edges = trailEdges(data, walk, {
    length: 0,
    strength: 0,
    curve: 'horizontal',
  });
  return { nodes, edges, positions };
}

function buildRings(data: GraphData, walk: Walk) {
  const leaves = new Map<PageId, number>();
  const count = (id: PageId): number => {
    const kids = walk.kids.get(id) ?? [];
    const total = kids.length ? kids.reduce((sum, k) => sum + count(k), 0) : 1;
    leaves.set(id, total);
    return total;
  };
  const totalLeaves = walk.roots.reduce((sum, root) => sum + count(root), 0);
  const deepest = Math.max(0, ...walk.depth.values());
  // The outer ring has to fit every leaf; shallower rings follow from it.
  const step = Math.max(
    118,
    (totalLeaves * 46) / (2 * Math.PI) / (deepest + 1),
    (walk.roots.length * 60) / (2 * Math.PI),
  );
  const positions = new Map<string, { x: number; y: number }>();
  positions.set('workspace', { x: 0, y: 0 });
  const place = (id: PageId, from: number, to: number, depth: number) => {
    const angle = (from + to) / 2;
    const radius = step * (depth + 1);
    positions.set(id, {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    });
    let start = from;
    for (const kid of walk.kids.get(id) ?? []) {
      const end =
        start + ((to - from) * leaves.get(kid)!) / Math.max(1, leaves.get(id)!);
      place(kid, start, end, depth + 1);
      start = end;
    }
  };
  let start = -Math.PI / 2;
  // A lone page still gets a fair slice, or they bunch on the first ring.
  const SLICE = 1.5;
  const slices = totalLeaves + walk.roots.length * SLICE;
  for (const root of walk.roots) {
    const end =
      start + (Math.PI * 2 * (leaves.get(root)! + SLICE)) / Math.max(1, slices);
    place(root, start, end, 0);
    start = end;
  }
  const nodes: SceneNode[] = [
    {
      id: 'workspace',
      kind: 'workspace',
      page: null,
      label: data.workspaceName,
      detail: null,
      iconUrl: null,
      iconSite: null,
      r: 12,
      card: null,
      labelRule: 'always',
      labelSide: 'below',
      labelMax: 150,
      charge: 0,
      collide: 0,
      trail: null,
      site: null,
      orbit: null,
      labelDrop: 0,
      glyph: null,
      term: null,
      folder: null,
      type: null,
    },
    ...walk.order.map((id) =>
      pageNode(data.pages[id]!, {
        r: walk.depth.get(id) === 0 ? 10 : 8,
        labelRule:
          walk.depth.get(id) === 0 ? ('large' as const) : ('zoom' as const),
      }),
    ),
  ];
  const edges: SceneEdge[] = [
    ...walk.roots.map(
      (root): SceneEdge => ({
        id: `root:${root}`,
        a: 'workspace',
        b: root,
        kind: 'root',
        weight: 1,
        length: 0,
        strength: 0,
        curve: 'line',
        path: pathOf(data, walk, root),
      }),
    ),
    ...trailEdges(data, walk, { length: 0, strength: 0, curve: 'radial' }),
  ];
  const rings = Array.from({ length: deepest + 1 }, (_, i) => step * (i + 1));
  return { nodes, edges, positions, rings };
}

function buildFocus(data: GraphData, walk: Walk, options: SceneOptions) {
  // Trail rows: the same height, one line wider than the sidebar's.
  const CARD = { w: 216, h: 34 };
  const CENTER = { w: 248, h: 44 };
  const COL = 296;
  const ROW = 44;
  const centerId =
    options.focusId && data.pages[options.focusId]
      ? options.focusId
      : data.activePageId && data.pages[data.activePageId]
        ? data.activePageId
        : (walk.order[0] ?? null);
  const positions = new Map<string, { x: number; y: number }>();
  if (!centerId) {
    return { nodes: [], edges: [], positions, centerId };
  }
  // Generation relative to the centre: parents to the left, children right.
  const generation = new Map<PageId, number>([[centerId, 0]]);
  let frontier = [centerId];
  for (let hop = 0; hop < options.hops; hop++) {
    const next: PageId[] = [];
    for (const id of frontier) {
      const page = data.pages[id]!;
      const gen = generation.get(id)!;
      const steps: [PageId | null, number][] = [
        [page.parentId, gen - 1],
        ...(walk.kids.get(id) ?? []).map((kid): [PageId, number] => [
          kid,
          gen + 1,
        ]),
      ];
      for (const [neighbour, g] of steps) {
        if (!neighbour || !data.pages[neighbour] || generation.has(neighbour))
          continue;
        generation.set(neighbour, g);
        next.push(neighbour);
      }
    }
    frontier = next;
  }
  const columns = new Map<number, PageId[]>();
  for (const id of walk.order) {
    const gen = generation.get(id);
    if (gen === undefined) continue;
    columns.set(gen, [...(columns.get(gen) ?? []), id]);
  }
  let lowest = CENTER.h;
  for (const [gen, ids] of columns) {
    ids.forEach((id, i) => {
      const y = (i - (ids.length - 1) / 2) * ROW;
      positions.set(id, { x: gen * COL, y });
      lowest = Math.max(lowest, y);
    });
  }
  // The same site elsewhere in the workspace: a related shelf underneath.
  const site = siteOf(data.pages[centerId]!);
  const related = site
    ? walk.order
        .filter((id) => !generation.has(id) && siteOf(data.pages[id]!) === site)
        .slice(0, 6)
    : [];
  related.forEach((id, i) => {
    positions.set(id, {
      x: (i - (related.length - 1) / 2) * (CARD.w + 24),
      y: lowest + 120,
    });
  });
  const included = new Set<PageId>([...generation.keys(), ...related]);
  const nodes = walk.order
    .filter((id) => included.has(id))
    .map((id) =>
      pageNode(data.pages[id]!, {
        r: (id === centerId ? CENTER.h : CARD.h) / 2,
        card: id === centerId ? CENTER : CARD,
      }),
    );
  const edges: SceneEdge[] = [
    ...trailEdges(
      data,
      walk,
      { length: 0, strength: 0, curve: 'horizontal' },
      new Set(generation.keys()),
    ),
    ...related.map(
      (id): SceneEdge => ({
        id: `site:${centerId}:${id}`,
        a: centerId,
        b: id,
        kind: 'same-site',
        weight: 1,
        length: 0,
        strength: 0,
        curve: 'line',
        path: null,
      }),
    ),
  ];
  return { nodes, edges, positions, centerId };
}

export function buildScene(
  data: GraphData,
  mode: GraphMode,
  options: SceneOptions,
): Scene {
  const walk = walkTrails(data);
  const sites = new Set(
    walk.order.flatMap((id) => siteOf(data.pages[id]!) ?? []),
  ).size;
  const scene: Scene = {
    mode,
    nodes: [],
    edges: [],
    positions: null,
    gravity: 0,
    rings: [],
    hulls: [],
    groups: [],
    labelMargin: 0,
    centerId: null,
    counts: { pages: walk.order.length, trails: walk.roots.length, sites },
  };
  const built = (): Scene => {
    switch (mode) {
      case 'web':
        return { ...scene, ...buildWeb(data, walk, options) };
      case 'sites':
        return { ...scene, ...buildSites(data, walk) };
      case 'folders':
        return { ...scene, ...buildFolders(data, walk, options) };
      case 'types':
        return { ...scene, ...buildTypes(data, walk) };
      case 'trails':
        return {
          ...scene,
          ...buildTrails(data, walk, options),
          labelMargin: 40,
        };
      case 'rings':
        return { ...scene, ...buildRings(data, walk) };
      case 'focus':
        return { ...scene, ...buildFocus(data, walk, options) };
    }
  };
  const result = built();
  const trailIndex = new Map(walk.roots.map((root, i) => [root, i]));
  for (const node of result.nodes) {
    const root = node.page ? walk.rootOf.get(node.page.id) : undefined;
    if (root) node.trail = trailIndex.get(root) ?? null;
    if (root) node.folder = data.pages[root]!.groupId;
    if (node.page) node.type = pageTypeOf(node.page);
    if (options.sizeBy === 'memory' && node.page && !node.card) {
      const megabytes = (data.memory.get(node.page.id) ?? 0) / 1e6;
      // By area, so twice the memory looks like twice as much.
      node.r = 5 + Math.sqrt(megabytes) * 0.72;
      if (node.collide) node.collide = Math.max(node.collide, node.r + 34);
    }
  }
  return result;
}

/** Every page in the order the trail lists them. */
export function trailOrder(data: GraphData): PageId[] {
  return walkTrails(data).order;
}

/** A page can move under anything but itself and what's already under it. */
export function canMoveUnder(data: GraphData, id: PageId, target: PageId) {
  let up: PageId | null | undefined = target;
  while (up) {
    if (up === id) return false;
    up = data.pages[up]?.parentId;
  }
  return data.pages[id]?.parentId !== target;
}

function sameAddress(url: string) {
  return url.replace(/#.*$/, '').replace(/\/$/, '');
}

/**
 * The extra copies of a page open more than once. The first of each stays out,
 * so closing all of these leaves one of everything.
 */
function duplicatesIn(data: GraphData, order: PageId[]) {
  const seen = new Set<string>();
  const extra = new Set<PageId>();
  for (const id of order) {
    const url = data.pages[id]!.url;
    if (!url) continue;
    const key = sameAddress(url);
    if (seen.has(key)) extra.add(id);
    seen.add(key);
  }
  return extra;
}

const derived = new WeakMap<
  GraphData,
  { duplicates: Set<PageId>; heavy: Set<PageId> }
>();

/** What some `is:` terms need from every page, worked out once per data. */
function derivedOf(data: GraphData, walk: Walk) {
  let known = derived.get(data);
  if (!known) {
    known = {
      duplicates: duplicatesIn(data, walk.order),
      heavy: new Set(
        [...data.memory.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([id]) => id),
      ),
    };
    derived.set(data, known);
  }
  return known;
}

export const QUERY_HELP: { term: string; means: string }[] = [
  { term: 'is:duplicate', means: 'extra copies of a page' },
  { term: 'is:heavy', means: 'the five using most memory' },
  { term: 'is:asleep', means: 'also sound, muted, failed, pinned, loading' },
  { term: 'is:lone', means: 'trails that went nowhere' },
  { term: 'is:leaf', means: 'pages that led nowhere (also root)' },
  { term: 'site:github', means: 'on a matching site' },
  { term: 'folder:reading', means: 'in a folder (or folder:none)' },
  { term: 'type:docs', means: 'also code, video, read, social, shop…' },
  { term: 'trail:espresso', means: 'in a trail starting there' },
  { term: 'depth:>2', means: 'steps from the trail’s start' },
  { term: 'mem:>300', means: 'using more than that many MB' },
  { term: '-is:pinned', means: 'a minus turns any of them around' },
];

/**
 * Words and operators, all of which must hold. In trail order, so the first is
 * the first you'd come to in the sidebar.
 */
export function matchPages(data: GraphData, text: string): Set<string> | null {
  const terms = text.toLowerCase().match(/-?(?:[a-z]+:)?"[^"]*"|\S+/g);
  if (!terms?.length) return null;
  const walk = walkTrails(data);
  const { duplicates, heavy } = derivedOf(data, walk);
  const compare = (value: number, spec: string) => {
    const [, op, digits] = /^([<>]?=?)(\d+(?:\.\d+)?)$/.exec(spec) ?? [];
    if (digits === undefined) return false;
    const limit = Number(digits);
    if (op === '>') return value > limit;
    if (op === '>=') return value >= limit;
    if (op === '<') return value < limit;
    if (op === '<=') return value <= limit;
    return value === limit;
  };
  const holds = (id: PageId, term: string) => {
    const page = data.pages[id]!;
    const [, key, raw] = /^([a-z]+):(.*)$/.exec(term) ?? [];
    const value = (raw ?? '').replace(/"/g, '');
    const kids = walk.kids.get(id)?.length ?? 0;
    switch (key) {
      case 'site':
        return (siteOf(page) ?? '').includes(value);
      case 'type':
        return pageTypeOf(page) === value;
      case 'folder': {
        const groupId = data.pages[walk.rootOf.get(id) ?? '']?.groupId ?? null;
        if (value === 'none') return !groupId;
        const named = data.groups.filter(
          (group) => group.name.toLowerCase() === value,
        );
        const groups = named.length
          ? named
          : data.groups.filter((g) => g.name.toLowerCase().includes(value));
        return groups.some((group) => group.id === groupId);
      }
      case 'trail': {
        const root = data.pages[walk.rootOf.get(id) ?? '']!;
        return [pageParts(root).title, root.url]
          .join(' ')
          .toLowerCase()
          .includes(value);
      }
      case 'depth':
        return compare(walk.depth.get(id) ?? 0, value);
      case 'mem':
        return compare((data.memory.get(id) ?? 0) / 1e6, value);
      case 'is':
      case 'has':
        switch (value) {
          case 'duplicate':
            return duplicates.has(id);
          case 'heavy':
            return heavy.has(id);
          case 'asleep':
            return page.isDiscarded;
          case 'sound':
            return page.isAudible;
          case 'muted':
            return page.isMuted;
          case 'failed':
            return !!page.error || page.isUnresponsive;
          case 'pinned':
            return page.isPinned;
          case 'loading':
            return page.isLoading;
          case 'lone':
            return !page.parentId && kids === 0;
          case 'leaf':
            return kids === 0;
          case 'root':
            return !page.parentId;
          case 'note':
          case 'noted':
            return !!page.note;
          case 'current':
            return id === data.activePageId;
        }
        return false;
    }
    const word = term.replace(/"/g, '');
    return [pageParts(page).title, page.url, page.note]
      .join(' ')
      .toLowerCase()
      .includes(word);
  };
  const found = new Set<string>();
  for (const id of walk.order) {
    const all = terms.every((term) => {
      if (term === '-') return true;
      return term.startsWith('-') ? !holds(id, term.slice(1)) : holds(id, term);
    });
    if (all) found.add(id);
  }
  return found;
}

export function formatMemory(bytes: number) {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${Math.round(bytes / 1e6)} MB`;
}
