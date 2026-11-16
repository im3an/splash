/*
 * Alma view: a graph of the workspace's pages, in seven modes, drawn in the
 * page card as an overlay so the sidebar stays live beside it. Finds things the
 * sidebar can't (lenses, folders, types, a query language) and acts on them in
 * bulk, with real closes and moves that undo. Still dev builds only (see
 * WorkspaceBar and ContentArea); docs/todo.md lists what's left before release.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronUp,
  Circle,
  CircleAlert,
  CircleHelp,
  CodeXml,
  Copy,
  Columns2,
  ExternalLink,
  EyeOff,
  File,
  FileText,
  FolderInput,
  FolderMinus,
  Globe,
  LayoutGrid,
  ListTree,
  Mail,
  Maximize,
  MessagesSquare,
  Minus,
  Moon,
  Network,
  Newspaper,
  PanelRight,
  Play,
  Plus,
  RotateCcw,
  Search,
  SearchX,
  ShoppingBag,
  SlidersHorizontal,
  Sprout,
  Target,
  Trash2,
  Volume2,
  Weight,
  X,
  type LucideIcon,
} from '../icons';
import type { MoveOrigin, PageId, PageSnapshot } from '../../shared/types';
import { GroupMark } from '../components/GroupIconPicker';
import { PanelState } from '../components/PanelState';
import { SegmentedControl } from '../components/SegmentedControl';
import { useSidebarMenu } from '../hooks/use-sidebar-menu';
import { pageParts } from '../lib/format';
import { api } from '../splash-api';
import { useOverlay } from '../stores/overlay-store';
import { usePageMenu } from '../stores/page-menu-store';
import { useShell } from '../stores/shell-store';
import { useToast } from '../stores/toast-store';
import { sampleData } from './alma-view-sample';
import {
  buildScene,
  canMoveUnder,
  folderTerm,
  formatMemory,
  GRAPH_MODES,
  matchPages,
  PAGE_TYPES,
  pageTypeOf,
  QUERY_HELP,
  siteOf,
  trailOrder,
  type GraphData,
  type GraphMode,
  type PageType,
  type SceneNode,
} from './alma-view-scene';
import {
  AlmaCanvas,
  DEFAULT_ALMA_SETTINGS,
  prefersReducedMotion,
  type AlmaLook,
  type AlmaSettings,
  type AlmaTint,
} from './alma-view-canvas';

type Source = 'yours' | 'sample' | 'stress';
type Rail = 'filters' | 'settings' | null;

const SOURCES: { value: Source; label: string }[] = [
  { value: 'yours', label: 'Your pages' },
  { value: 'sample', label: 'Sample' },
  { value: 'stress', label: 'Stress' },
];

/** Questions worth one click. Each is only a query, so it teaches the syntax. */
const LENSES: {
  label: string;
  query: string;
  title: string;
  icon: LucideIcon;
}[] = [
  {
    label: 'Duplicates',
    query: 'is:duplicate',
    title: 'Extra copies of pages open more than once. One of each stays out.',
    icon: Copy,
  },
  {
    label: 'Heaviest',
    query: 'is:heavy',
    title: 'The five pages using the most memory',
    icon: Weight,
  },
  {
    label: 'Asleep',
    query: 'is:asleep',
    title: 'Pages holding no memory',
    icon: Moon,
  },
  {
    label: 'Sound',
    query: 'is:sound',
    title: 'Pages playing sound, or muted',
    icon: Volume2,
  },
  {
    label: 'Failed',
    query: 'is:failed',
    title: 'Pages that couldn’t load',
    icon: CircleAlert,
  },
  {
    label: 'Lone',
    query: 'is:lone',
    title: 'Trails of one page that went nowhere',
    icon: Circle,
  },
  {
    label: 'Deep',
    query: 'depth:>2',
    title: 'More than two steps in',
    icon: ListTree,
  },
];

const TYPE_ICONS: Record<PageType, LucideIcon> = {
  docs: FileText,
  code: CodeXml,
  video: Play,
  read: Newspaper,
  social: MessagesSquare,
  talk: Mail,
  shop: ShoppingBag,
  tools: LayoutGrid,
  search: Search,
  file: File,
  other: Globe,
};

const TERM = /-?(?:[a-z]+:)?"[^"]*"|\S+/g;

/** Keys a focused list or segment answers itself, so the graph leaves them. */
const ARROW_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
]);

/** Terms that replace each other: one lens, one folder, one type at a time. */
function familyOf(term: string): (other: string) => boolean {
  if (term.startsWith('folder:')) return (t) => t.startsWith('folder:');
  if (term.startsWith('type:')) return (t) => t.startsWith('type:');
  return (t) => LENSES.some((lens) => lens.query === t);
}

function termsOf(filter: string) {
  return (filter.toLowerCase().match(TERM) ?? []) as string[];
}

function hasTerm(filter: string, term: string) {
  return termsOf(filter).includes(term);
}

/** Puts a term in the filter, or takes it out, leaving the other kinds alone. */
function toggleTerm(filter: string, term: string) {
  const family = familyOf(term);
  const kept = termsOf(filter).filter((t) => !family(t));
  return [...kept, ...(hasTerm(filter, term) ? [] : [term])].join(' ');
}

const SHORTCUTS: { group: string; keys: [string, string][] }[] = [
  {
    group: 'Move around',
    keys: [
      ['1–7  ← →', 'Change mode'],
      ['J  K', 'Next or previous page'],
      ['F', 'Focus on this page'],
      ['0  +  −', 'Fit, zoom in, zoom out'],
    ],
  },
  {
    group: 'Find',
    keys: [
      ['/', 'Filter, with is: folder: type: site:'],
      ['↵', 'Open this page, or the first match'],
      ['⇧↵', 'Select every match'],
    ],
  },
  {
    group: 'Select',
    keys: [
      ['Space', 'Select this page'],
      ['⇧-click', 'Add or remove a page'],
      ['⇧-drag', 'Select with a box'],
      ['⌘A', 'Select all, or every match'],
    ],
  },
  {
    group: 'Act',
    keys: [
      ['X', 'Close selected, with undo'],
      ['M', 'Move to a workspace'],
      ['C', 'Copy links as Markdown'],
      ['Drag', 'Drop a page on another to move it under'],
      ['Right-click', 'The page’s full menu'],
    ],
  },
];

// Kept for the session, so reopening comes back to the same view.
let lastMode: GraphMode = 'web';
let lastSource: Source = 'yours';
let lastSettings: AlmaSettings = DEFAULT_ALMA_SETTINGS;
let lastSizeBy: 'branch' | 'memory' = 'branch';
let lastRail: Rail = 'filters';

/**
 * The sidebar's way in, which Settings can take away. ⌘K and ⌥⌘G (View menu)
 * open the view with or without it.
 */
export function AlmaViewButton() {
  const open = useOverlay((state) => state.overlay?.kind === 'alma-view');
  const menu = useSidebarMenu('Alma view');
  const toggle = () => {
    const { overlay, open: show, close } = useOverlay.getState();
    if (overlay?.kind === 'alma-view') close();
    else void show({ kind: 'alma-view' });
  };
  const remove = () => {
    void api()
      .updatePreferences({ almaViewButton: false })
      .then(() =>
        toast(
          'Removed Alma view from the sidebar',
          () => api().updatePreferences({ almaViewButton: true }),
          '⌘K still opens it, and Settings brings the button back.',
        ),
      );
  };
  return (
    <>
      <button
        type="button"
        onClick={toggle}
        onContextMenu={(event) =>
          menu.show(event, [
            {
              kind: 'action',
              label: 'Remove from sidebar',
              icon: <EyeOff size={15} />,
              run: remove,
            },
          ])
        }
        aria-label="Alma view"
        aria-pressed={open}
        title="Alma view (⌥⌘G)"
        className="icon-button shrink-0 justify-self-end"
      >
        <Network size={16} />
      </button>
      {menu.element}
    </>
  );
}

function toast(
  message: string,
  run?: () => unknown,
  detail: string | null = null,
) {
  useToast.getState().show({
    message,
    detail,
    durationMs: run ? 9000 : 3000,
    actions: run ? [{ label: 'Undo', icon: 'undo', run }] : [],
  });
}

const plural = (count: number) => `${count} ${count === 1 ? 'page' : 'pages'}`;

export function AlmaViewPrototype() {
  const snapshot = useShell((state) => state.snapshot);
  const close = useOverlay((state) => state.close);
  const [mode, setModeState] = useState<GraphMode>(lastMode);
  const [source, setSourceState] = useState<Source>(lastSource);
  const [sameSiteLinks, setSameSiteLinks] = useState(false);
  const [hops, setHops] = useState(2);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [filterFocused, setFilterFocused] = useState(false);
  const [hover, setHover] = useState<SceneNode | null>(null);
  const [aspect, setAspect] = useState(1.5);
  const [settings, setSettingsState] = useState(lastSettings);
  const [sizeBy, setSizeByState] = useState(lastSizeBy);
  const [rail, setRailState] = useState<Rail>(lastRail);
  const [narrow, setNarrow] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  /** What the keyboard cursor landed on, read out by screen readers. */
  const [announced, setAnnounced] = useState('');
  const [moveOpen, setMoveOpen] = useState(false);
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());
  const [memory, setMemory] = useState<Map<PageId, number>>(new Map());
  const [drop, setDrop] = useState<{ page: string; target: string } | null>(
    null,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const railRef = useRef<HTMLElement>(null);
  const viewRef = useRef<AlmaCanvas | null>(null);
  const cursorRef = useRef<string | null>(null);

  const updateSettings = (next: AlmaSettings) => {
    lastSettings = next;
    setSettingsState(next);
  };
  const setRail = (next: Rail) => {
    lastRail = next;
    setRailState(next);
  };
  const setSizeBy = (next: 'branch' | 'memory') => {
    lastSizeBy = next;
    setSizeByState(next);
  };
  const setMode = (next: GraphMode) => {
    lastMode = next;
    setModeState(next);
  };
  const setSource = (next: Source) => {
    lastSource = next;
    setSourceState(next);
    setFocusId(null);
    setSelection(new Set());
  };

  // What each page costs, from the same source as the task manager.
  useEffect(() => {
    if (source !== 'yours') return;
    let current = true;
    const load = () =>
      api()
        .listTasks()
        .then((list) => {
          if (!current) return;
          const next = new Map<PageId, number>();
          for (const row of list.entries) {
            for (const id of row.pageIds) {
              next.set(id, row.memoryBytes / row.pageIds.length);
            }
          }
          setMemory(next);
        })
        .catch(() => {});
    void load();
    const timer = setInterval(() => void load(), 4000);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, [source]);

  const data: GraphData = useMemo(() => {
    if (source === 'sample') return sampleData(1);
    if (source === 'stress') return sampleData(5);
    const workspace = snapshot?.workspaces.find(
      (w) => w.id === snapshot.activeWorkspaceId,
    );
    return {
      pages: snapshot?.pages ?? {},
      rootIds: snapshot?.rootIds ?? [],
      activePageId: snapshot?.activePageId ?? null,
      workspaceName: workspace?.name ?? 'Workspace',
      groups: snapshot?.groups ?? [],
      memory,
    };
  }, [source, snapshot, memory]);

  const realPages = source === 'yours';
  const dataRef = useRef(data);
  dataRef.current = data;

  // Choosing a page elsewhere (the sidebar) moves Focus along with it.
  useEffect(() => setFocusId(null), [data.activePageId]);
  // Pages that closed drop out of the selection.
  useEffect(() => {
    setSelection((picked) => {
      const kept = [...picked].filter((id) => data.pages[id]);
      return kept.length === picked.size ? picked : new Set(kept);
    });
  }, [data.pages]);

  const scene = useMemo(
    () =>
      buildScene(data, mode, { sameSiteLinks, hops, focusId, aspect, sizeBy }),
    [data, mode, sameSiteLinks, hops, focusId, aspect, sizeBy],
  );
  const matches = useMemo(() => matchPages(data, filter), [data, filter]);
  /** What pointing at a row would show, before it's clicked. */
  const shownMatches = useMemo(
    () => (preview === null ? matches : matchPages(data, preview)),
    [preview, matches, data],
  );
  // Each count allows for the filter's other kinds of term, so a row's number
  // is what clicking it gets. Rows go by the whole workspace, so they stay put.
  const facets = useMemo(() => {
    const within = (term: string) => {
      const family = familyOf(term);
      const others = termsOf(filter).filter((t) => !family(t));
      return matchPages(data, [...others, term].join(' '))?.size ?? 0;
    };
    const total = (term: string) => matchPages(data, term)?.size ?? 0;
    const folders = data.groups.length
      ? [...data.groups, null].map((group) => {
          const term = folderTerm(group);
          return { group, term, count: within(term) };
        })
      : [];
    return {
      lenses: LENSES.map((lens) => ({
        lens,
        count: within(lens.query),
        total: total(lens.query),
      })),
      folders,
      types: PAGE_TYPES.map((type) => {
        const term = `type:${type.value}`;
        return { type, term, count: within(term), total: total(term) };
      }),
    };
  }, [data, filter]);
  // Lenses and types that never apply here stay out, so the list keeps one
  // shape for the workspace; one that applies but not with the rest of the
  // filter shows a 0 and can't be pressed into an empty graph.
  const lensRows = facets.lenses.filter((row) => row.total > 0);
  const typeRows = facets.types.filter((row) => row.total > 0);
  const totalMemory = useMemo(
    () => [...data.memory.values()].reduce((sum, bytes) => sum + bytes, 0),
    [data.memory],
  );

  /** What the action bar works on: the selection, or else the matches. */
  const targets: string[] = useMemo(() => {
    if (selection.size) return [...selection];
    return matches ? [...matches] : [];
  }, [selection, matches]);

  const applyTerm = (term: string) => {
    setFilter((now) => toggleTerm(now, term));
    setPreview(null);
  };
  const previewTerm = (term: string) => setPreview(toggleTerm(filter, term));

  const open = (pageId: string) => {
    if (!realPages) return;
    void api().activatePage(pageId);
    close();
  };

  const closePages = async (ids: string[]) => {
    if (!realPages || !ids.length) return;
    const depthOf = (id: string) => {
      let depth = 0;
      let up = data.pages[id]?.parentId;
      while (up) {
        depth++;
        up = data.pages[up]?.parentId;
      }
      return depth;
    };
    // Deepest first, so a branch doesn't reshuffle while it's being closed.
    const order = [...ids].sort((a, b) => depthOf(b) - depthOf(a));
    const closed: string[] = [];
    try {
      for (const id of order) {
        await api().closePage(id);
        closed.push(id);
      }
    } catch {
      // The ones that did close can still come back.
    }
    setSelection(new Set());
    setFilter('');
    cursorRef.current = null;
    if (!closed.length) {
      toast('Couldn’t close those pages', undefined, 'Nothing was closed.');
      return;
    }
    // After the toast each single close raises, which this one sums up.
    setTimeout(() => {
      toast(
        closed.length === order.length
          ? `Closed ${plural(closed.length)}`
          : `Closed ${closed.length} of ${plural(order.length)}`,
        async () => {
          for (let i = 0; i < closed.length; i++) await api().reopenClosed();
        },
        '⇧⌘T reopens them one at a time.',
      );
    }, 250);
  };

  const originOf = (page: PageSnapshot): MoveOrigin => {
    const siblings = page.parentId
      ? (data.pages[page.parentId]?.childIds ?? [])
      : data.rootIds;
    return {
      workspaceId: snapshot!.activeWorkspaceId,
      parentId: page.parentId,
      index: Math.max(0, siblings.indexOf(page.id)),
      wasActive: data.activePageId === page.id,
    };
  };

  const moveToWorkspace = async (ids: string[], workspaceId: string) => {
    setMoveOpen(false);
    if (!realPages || !ids.length) return;
    const moves = ids.flatMap((id) => {
      const page = data.pages[id];
      return page ? [{ id, origin: originOf(page) }] : [];
    });
    const moved: typeof moves = [];
    try {
      for (const move of moves) {
        await api().movePageToWorkspace(move.id, workspaceId);
        moved.push(move);
      }
    } catch {
      // Undo still returns the ones that went.
    }
    setSelection(new Set());
    if (!moved.length) {
      toast('Couldn’t move those pages', undefined, 'Nothing was moved.');
      return;
    }
    const name =
      snapshot?.workspaces.find((w) => w.id === workspaceId)?.name ??
      'that workspace';
    setTimeout(() => {
      toast(`Moved ${plural(moved.length)} to ${name}`, async () => {
        for (const { id, origin } of [...moved].reverse()) {
          await api().returnPage(id, origin);
        }
      });
    }, 250);
  };

  const copyLinks = async (ids: string[]) => {
    const lines = ids.flatMap((id) => {
      const page = data.pages[id];
      return page?.url ? [`- [${pageParts(page).title}](${page.url})`] : [];
    });
    if (!lines.length) return;
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
    } catch {
      toast(
        'Couldn’t copy the links',
        undefined,
        'Try again with Splash in front.',
      );
      return;
    }
    toast(
      `Copied ${lines.length} ${lines.length === 1 ? 'link' : 'links'} as Markdown`,
    );
  };

  const toggleSelected = (id: string) => {
    setSelection((picked) => {
      const next = new Set(picked);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlers = useRef({
    click: (
      _node: SceneNode,
      _event: { altKey: boolean; shiftKey: boolean },
    ) => {},
    context: (_node: SceneNode, _x: number, _y: number) => {},
    lasso: (_ids: string[]) => {},
    canDrop: (_page: string, _target: string) => false as boolean,
    drop: (_page: string, _target: string) => {},
  });
  handlers.current.click = (node, event) => {
    const view = viewRef.current;
    if (node.term) {
      const leaving = hasTerm(filter, node.term);
      applyTerm(node.term);
      return leaving ? view?.resetCamera() : view?.zoomToNode(node.id);
    }
    if (node.kind === 'site' && !node.page) return view?.zoomToNode(node.id);
    if (node.kind === 'workspace') return view?.resetCamera();
    const pageId = node.page?.id ?? node.id;
    if (event.shiftKey) return toggleSelected(pageId);
    const isCentre = mode === 'focus' && pageId === scene.centerId;
    if (!isCentre && (event.altKey || mode === 'focus' || !realPages)) {
      setFocusId(pageId);
      setMode('focus');
      return;
    }
    open(pageId);
  };
  handlers.current.context = (node, x, y) => {
    if (!realPages || !node.page) return;
    usePageMenu.getState().open({
      pageId: node.page.id,
      x,
      y,
      fromKeyboard: false,
      returnFocus: rootRef.current,
    });
  };
  handlers.current.lasso = (ids) => {
    setSelection((picked) => new Set([...picked, ...ids]));
  };
  handlers.current.canDrop = (page, target) =>
    realPages && canMoveUnder(data, page, target);
  handlers.current.drop = (page, target) => {
    const moved = data.pages[page];
    const under = data.pages[target];
    if (!moved || !under || !realPages) return;
    const siblings = moved.parentId
      ? (data.pages[moved.parentId]?.childIds ?? [])
      : data.rootIds;
    const before = siblings[siblings.indexOf(page) - 1] ?? null;
    const parent = moved.parentId;
    void api()
      .movePage(page, target, under.childIds.at(-1) ?? null)
      .then(() => {
        toast(
          `Moved “${pageParts(moved).title}” under “${pageParts(under).title}”`,
          () => api().movePage(page, parent, before),
        );
      })
      .catch(() =>
        toast('Couldn’t move that page', undefined, 'It stayed where it was.'),
      );
  };

  useEffect(() => {
    const canvas = canvasRef.current!;
    const view = new AlmaCanvas(canvas, {
      onHover: (node) => {
        setHover(node);
        cursorRef.current = node?.id ?? cursorRef.current;
      },
      onHoverMove: (x, y) => {
        const card = cardRef.current;
        if (!card) return;
        const place = `${card.offsetWidth}|${Math.round(x)}|${Math.round(y)}`;
        if (card.dataset.place === place) return;
        card.dataset.place = place;
        const left = Math.min(
          x + 18,
          canvas.clientWidth - card.offsetWidth - 12,
        );
        const below = y + 18 + card.offsetHeight < canvas.clientHeight - 12;
        const top = below ? y + 18 : y - card.offsetHeight - 18;
        card.style.transform = `translate(${Math.max(12, left)}px, ${Math.max(12, top)}px)`;
      },
      onClick: (node, event) => handlers.current.click(node, event),
      onContext: (node, x, y) => handlers.current.context(node, x, y),
      onLasso: (ids) => handlers.current.lasso(ids),
      canDrop: (page, target) => handlers.current.canDrop(page, target),
      onDropTarget: (page, target) =>
        setDrop(page && target ? { page, target } : null),
      onDrop: (page, target) => handlers.current.drop(page, target),
    });
    viewRef.current = view;
    if (import.meta.env.DEV) {
      (window as unknown as { __alma: AlmaCanvas }).__alma = view;
    }
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      if (height > 0) setAspect(Math.round((width / height) * 10) / 10);
    });
    observer.observe(canvas);
    const rootObserver = new ResizeObserver(([entry]) => {
      setNarrow(entry!.contentRect.width < 760);
    });
    rootObserver.observe(rootRef.current!);
    rootRef.current?.focus();
    return () => {
      observer.disconnect();
      rootObserver.disconnect();
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  useEffect(() => {
    viewRef.current?.setScene(scene, data.activePageId);
  }, [scene, data.activePageId]);
  useEffect(() => viewRef.current?.setMatches(shownMatches), [shownMatches]);
  // In a small window the rail lies over the graph, so it waits to be asked.
  useEffect(() => {
    if (narrow) setRailState(null);
    else setRailState(lastRail);
  }, [narrow]);
  useEffect(() => viewRef.current?.setSettings(settings), [settings]);
  useEffect(() => viewRef.current?.setSelected(selection), [selection]);

  /** The page the keyboard is on, from the node it lit up. */
  const cursorPage = () => {
    const node = scene.nodes.find((n) => n.id === cursorRef.current);
    return node?.page?.id ?? null;
  };

  const walk = (step: number) => {
    const list = scene.nodes.filter(
      (node) => node.page && (!matches || matches.has(node.page.id)),
    );
    if (!list.length) return;
    const at = list.findIndex((node) => node.id === cursorRef.current);
    const next = at < 0 ? (step > 0 ? 0 : list.length - 1) : at + step;
    const node = list[(next + list.length) % list.length]!;
    cursorRef.current = node.id;
    viewRef.current?.showNode(node.id);
    const index = list.indexOf(node) + 1;
    setAnnounced(
      [node.label, node.detail, `${index} of ${list.length}`]
        .filter(Boolean)
        .join(', '),
    );
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = (event.target as HTMLElement).closest?.(
        'input, textarea, [contenteditable]',
      );
      if (event.key === 'Escape') {
        event.preventDefault();
        if (helpOpen) setHelpOpen(false);
        else if (moveOpen) setMoveOpen(false);
        else if (filter) setFilter('');
        else if (selection.size) setSelection(new Set());
        else if (rail === 'settings') setRail('filters');
        else close();
        return;
      }
      if (typing || event.defaultPrevented) return;
      // A focused row, switch or segment keeps its own keys: Space and Enter
      // press it, and arrows move between its neighbours.
      const target = event.target as HTMLElement;
      if (
        (event.key === ' ' || event.key === 'Enter') &&
        target.closest?.('button, [role="radio"], [role="switch"], input')
      ) {
        return;
      }
      if (
        ARROW_KEYS.has(event.key) &&
        target.closest?.('[role="radio"], input, [data-rail-item]')
      ) {
        return;
      }
      if (event.metaKey) {
        if (event.key === 'a') {
          event.preventDefault();
          setSelection(new Set(matches ?? trailOrder(data)));
        }
        return;
      }
      const index = GRAPH_MODES.findIndex((m) => m.value === mode);
      const count = GRAPH_MODES.length;
      const number = Number(event.key);
      const key = event.key.toLowerCase();
      const acts = selection.size
        ? [...selection]
        : [cursorPage()].filter((id): id is string => !!id);
      if (event.key === 'ArrowRight') {
        setMode(GRAPH_MODES[(index + 1) % count]!.value);
      } else if (event.key === 'ArrowLeft') {
        setMode(GRAPH_MODES[(index - 1 + count) % count]!.value);
      } else if (number >= 1 && number <= count) {
        setMode(GRAPH_MODES[number - 1]!.value);
      } else if (event.key === '/') {
        event.preventDefault();
        if (rail === 'filters') filterRef.current?.focus();
        else {
          setRail('filters');
          // The field only exists once the rail has drawn.
          requestAnimationFrame(() => filterRef.current?.focus());
        }
      } else if (event.key === '?') {
        setHelpOpen((shown) => !shown);
      } else if (key === 's') {
        setRail(rail === 'settings' ? 'filters' : 'settings');
      } else if (key === 'j') {
        walk(1);
      } else if (key === 'k') {
        walk(-1);
      } else if (event.key === ' ') {
        event.preventDefault();
        const id = cursorPage();
        if (id) toggleSelected(id);
      } else if (event.key === 'Enter') {
        const id = cursorPage();
        if (id) open(id);
      } else if (key === 'f') {
        const id = cursorPage();
        if (id) {
          setFocusId(id);
          setMode('focus');
        }
      } else if (key === 'x') {
        void closePages(acts);
      } else if (key === 'c') {
        void copyLinks(acts);
      } else if (key === 'm') {
        if (acts.length) setMoveOpen((shown) => !shown);
      } else if (event.key === '0') {
        viewRef.current?.resetCamera();
      } else if (event.key === '=' || event.key === '+') {
        viewRef.current?.zoomBy(1.25);
      } else if (event.key === '-') {
        viewRef.current?.zoomBy(0.8);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const hint =
    mode === 'folders' && !data.groups.length
      ? 'No folders in this workspace yet, so every trail floats free.'
      : GRAPH_MODES.find((m) => m.value === mode)?.hint;
  const { pages, trails, sites } = scene.counts;
  const isEmpty = pages === 0;
  const otherWorkspaces =
    snapshot?.workspaces.filter((w) => w.id !== snapshot.activeWorkspaceId) ??
    [];
  const barVisible = targets.length > 0 && (selection.size > 0 || !!filter);
  const loading = realPages && !snapshot;

  /** ↑ ↓ Home End walk the field, its hints and the rows, like a list. */
  const moveInRail = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    // Segments and sliders use the arrows themselves; a field keeps Home/End.
    if (target.closest('[role="radio"], input[type="range"]')) return;
    if (target.tagName === 'INPUT' && !event.key.startsWith('Arrow')) return;
    const items = [
      ...(railRef.current?.querySelectorAll<HTMLElement>(
        '[data-rail-item]:not(:disabled)',
      ) ?? []),
    ];
    if (!items.length) return;
    const at = items.indexOf(target);
    const last = items.length - 1;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : at < 0
            ? 0
            : Math.min(
                last,
                Math.max(0, at + (event.key === 'ArrowDown' ? 1 : -1)),
              );
    event.preventDefault();
    items[next]!.focus();
  };

  const railBody =
    rail === 'settings' ? (
      <AlmaSettingsPanel
        settings={settings}
        onChange={updateSettings}
        sizeBy={sizeBy}
        onSizeBy={setSizeBy}
        forcesApply={['web', 'sites', 'folders', 'types'].includes(mode)}
        onGrow={() => viewRef.current?.grow()}
        onBack={() => setRail('filters')}
      />
    ) : (
      <>
        <div
          className="relative z-20 shrink-0 px-2 pt-2 pb-1"
          // The field and its hints count as one place, so tabbing from the
          // field into a hint keeps them open.
          onFocus={() => setFilterFocused(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setFilterFocused(false);
            }
          }}
        >
          {/* The History and Bookmarks panels' field, at the rail's width. */}
          <div className="flex h-8 items-center gap-2 rounded-control bg-field pr-1 pl-2.5 transition-[background-color,box-shadow] duration-base ease-out focus-within:bg-field-focus focus-within:shadow-focus">
            <span className="grid size-4 shrink-0 place-items-center text-fg-subtle">
              <Search size={14} aria-hidden />
            </span>
            <input
              ref={filterRef}
              data-rail-item
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || !matches?.size) return;
                if (event.shiftKey) {
                  setSelection(new Set(matches));
                  rootRef.current?.focus();
                  return;
                }
                const [first] = matches;
                if (first) open(first);
              }}
              placeholder="Filter, or try is:duplicate"
              aria-label="Filter pages"
              aria-describedby={filter ? 'alma-filter-result' : undefined}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              className="h-full min-w-0 flex-1 bg-transparent text-small text-fg outline-none placeholder:text-fg-subtle select-text"
            />
            {filter && (
              <button
                type="button"
                onClick={() => {
                  setFilter('');
                  filterRef.current?.focus();
                }}
                aria-label="Clear filter"
                title="Clear filter (esc)"
                className="icon-button size-6 shrink-0"
              >
                <X size={12} />
              </button>
            )}
          </div>
          {filterFocused && !filter && (
            <div
              role="group"
              aria-label="Filter terms"
              className="overlay-in absolute top-11 right-2 left-2 z-20 rounded-panel bg-elevated p-1 shadow-panel"
            >
              {QUERY_HELP.map(({ term, means }) => (
                <button
                  key={term}
                  type="button"
                  data-rail-item
                  // Keeps the field focused so typing can carry on from here.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setFilter(`${term} `);
                    filterRef.current?.focus();
                  }}
                  className="flex h-7 w-full items-center gap-2 rounded-row px-2 text-left outline-offset-[-2px] hover:bg-row-hover focus-visible:bg-row-hover"
                >
                  <code className="shrink-0 font-mono text-caption text-fg">
                    {term}
                  </code>
                  <span className="min-w-0 truncate text-caption text-fg-subtle">
                    {means}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        {filter && (
          <p
            id="alma-filter-result"
            role="status"
            className="flex h-6 shrink-0 items-center gap-1 px-4 text-caption text-fg-subtle tabular-nums"
          >
            <span className="min-w-0 flex-1 truncate">
              {matches?.size
                ? `${matches.size} of ${plural(pages)}`
                : 'No pages match'}
            </span>
            {selection.size === 0 && !!matches?.size && (
              <button
                type="button"
                onClick={() => setSelection(new Set(matches))}
                title="Select every match (⇧↵)"
                className="shrink-0 rounded-inner px-1 text-caption text-fg-muted hover:text-fg"
              >
                Select all
              </button>
            )}
          </p>
        )}
        <div
          onPointerLeave={() => setPreview(null)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setPreview(null);
            }
          }}
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-2 pt-1 pb-3"
        >
          {mode === 'web' && (
            <RailGroup label="Layout">
              <div className="px-2">
                <SwitchRow
                  label="Same-site lines"
                  detail="Also link pages on one site across trails."
                  checked={sameSiteLinks}
                  disabled={false}
                  onChange={setSameSiteLinks}
                />
              </div>
            </RailGroup>
          )}
          {mode === 'focus' && (
            <RailGroup label="Steps from this page">
              <div className="px-2">
                <SegmentedControl<number>
                  label="Steps from this page"
                  compact
                  stretch
                  options={[1, 2, 3].map((value) => ({
                    value,
                    label: String(value),
                  }))}
                  value={hops}
                  onChange={setHops}
                />
              </div>
            </RailGroup>
          )}
          {pages === 0 ? (
            <p className="px-2 text-caption text-fg-subtle">
              {loading
                ? 'Loading pages…'
                : 'Filters show up here once this workspace has pages.'}
            </p>
          ) : (
            <>
              {lensRows.length > 0 && (
                <RailGroup label="Find">
                  {lensRows.map(({ lens, count }) => (
                    <RailRow
                      key={lens.query}
                      icon={<lens.icon size={16} aria-hidden />}
                      label={lens.label}
                      count={count}
                      title={`${lens.title} (${lens.query})`}
                      pressed={hasTerm(filter, lens.query)}
                      onClick={() => applyTerm(lens.query)}
                      onPreview={() => previewTerm(lens.query)}
                    />
                  ))}
                </RailGroup>
              )}
              {facets.folders.length > 0 && (
                <RailGroup label="Folders">
                  {facets.folders.map(({ group, term, count }) => (
                    <RailRow
                      key={term}
                      icon={
                        group ? (
                          <GroupMark group={group} size={16} />
                        ) : (
                          <FolderMinus size={16} aria-hidden />
                        )
                      }
                      label={group?.name ?? 'In no folder'}
                      count={count}
                      title={term}
                      pressed={hasTerm(filter, term)}
                      onClick={() => applyTerm(term)}
                      onPreview={() => previewTerm(term)}
                    />
                  ))}
                </RailGroup>
              )}
              {typeRows.length > 0 && (
                <RailGroup
                  label="Types"
                  aside="By address"
                  asideTitle="Guessed from each page’s address, so some will be wrong"
                >
                  {typeRows.map(({ type, term, count }) => {
                    const Icon = TYPE_ICONS[type.value];
                    return (
                      <RailRow
                        key={term}
                        icon={<Icon size={16} aria-hidden />}
                        label={type.label}
                        count={count}
                        title={`${term}, guessed from the address`}
                        pressed={hasTerm(filter, term)}
                        onClick={() => applyTerm(term)}
                        onPreview={() => previewTerm(term)}
                      />
                    );
                  })}
                </RailGroup>
              )}
            </>
          )}
        </div>
      </>
    );

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-label="Alma view"
      className="overlay-in absolute inset-0 z-10 flex flex-col overflow-hidden rounded-content bg-surface outline-none"
    >
      {/* Built like the palette: a header and a footer, each with a hairline. */}
      <header
        className={`flex h-12 shrink-0 items-center border-b border-divider ${narrow ? 'gap-1 pr-1.5 pl-2' : 'gap-2 pr-2 pl-3.5'}`}
      >
        {!narrow && (
          <h2 className="mr-1 text-small font-semibold whitespace-nowrap text-fg">
            Alma view
          </h2>
        )}
        <div className="min-w-0 overflow-x-auto [scrollbar-width:none]">
          <SegmentedControl
            label="Graph mode"
            compact={narrow}
            options={GRAPH_MODES.map(({ value, label }) => ({ value, label }))}
            value={mode}
            onChange={setMode}
          />
        </div>
        <div className="flex-1" />
        {!narrow && (
          <button
            type="button"
            onClick={() => setHelpOpen((shown) => !shown)}
            aria-label="Shortcuts"
            aria-pressed={helpOpen}
            title="Shortcuts (?)"
            className="icon-button shrink-0"
          >
            <CircleHelp size={16} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setRail(rail === 'filters' ? null : 'filters')}
          aria-label="Filters"
          aria-pressed={rail === 'filters'}
          title={rail === 'filters' ? 'Hide filters' : 'Show filters'}
          className="icon-button shrink-0"
        >
          <PanelRight size={16} />
        </button>
        <button
          type="button"
          onClick={() => setRail(rail === 'settings' ? 'filters' : 'settings')}
          aria-label="Alma settings"
          aria-pressed={rail === 'settings'}
          title="Alma settings (S)"
          className="icon-button shrink-0"
        >
          <SlidersHorizontal size={16} />
        </button>
        <button
          type="button"
          onClick={close}
          aria-label="Close Alma view"
          title="Close Alma view (Esc)"
          className="icon-button shrink-0"
        >
          <X size={16} />
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`Graph of ${plural(pages)} in ${trails} ${trails === 1 ? 'trail' : 'trails'}. J and K walk the pages, Enter opens one, ? lists every key.`}
            onPointerDown={() => rootRef.current?.focus()}
            className="absolute inset-0 size-full cursor-grab touch-none"
          />

          <p className="pointer-events-none absolute top-2.5 left-3.5 max-w-[70%] truncate text-caption text-fg-subtle">
            {hint}
          </p>

          {barVisible && (
            <div
              role="toolbar"
              aria-label="Selected pages"
              className="overlay-in absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-panel bg-elevated p-1.5 shadow-panel"
            >
              <span className="px-1.5 text-small font-medium whitespace-nowrap text-fg tabular-nums">
                {plural(targets.length)}
              </span>
              {targets.length === 1 && (
                <button
                  type="button"
                  disabled={!realPages}
                  onClick={() => open(targets[0]!)}
                  className="button"
                >
                  <ExternalLink size={14} />
                  Open
                </button>
              )}
              {targets.length === 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setFocusId(targets[0]!);
                    setMode('focus');
                  }}
                  className="button"
                >
                  <Target size={14} />
                  Focus
                </button>
              )}
              {targets.length === 2 && (
                <button
                  type="button"
                  disabled={!realPages}
                  onClick={() => {
                    void api()
                      .openSplit(targets[0]!, targets[1]!)
                      .then(() => close());
                  }}
                  className="button whitespace-nowrap"
                >
                  <Columns2 size={14} />
                  Side by side
                </button>
              )}
              <div className="relative">
                <button
                  type="button"
                  disabled={!realPages || !otherWorkspaces.length}
                  aria-expanded={moveOpen}
                  onClick={() => setMoveOpen((shown) => !shown)}
                  title={
                    otherWorkspaces.length
                      ? 'Move to a workspace (M)'
                      : 'There’s only this workspace'
                  }
                  className="button whitespace-nowrap"
                >
                  <FolderInput size={14} />
                  Move to
                  <ChevronUp size={12} />
                </button>
                {moveOpen && (
                  <div className="overlay-in absolute bottom-9 left-0 z-20 w-48 rounded-panel bg-elevated p-1 shadow-panel">
                    {otherWorkspaces.map((workspace) => (
                      <button
                        key={workspace.id}
                        type="button"
                        onClick={() =>
                          void moveToWorkspace(targets, workspace.id)
                        }
                        className="block h-7 w-full truncate rounded-row px-2 text-left text-small text-fg hover:bg-row-hover"
                      >
                        {workspace.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => void copyLinks(targets)}
                title="Copy links as Markdown (C)"
                className="button whitespace-nowrap"
              >
                <Copy size={14} />
                Copy links
              </button>
              <button
                type="button"
                disabled={!realPages}
                onClick={() => void closePages(targets)}
                title={
                  realPages
                    ? 'Close them, with undo (X)'
                    : 'Sample pages can’t be closed'
                }
                className="button button-danger whitespace-nowrap"
              >
                <Trash2 size={14} />
                Close {targets.length}
              </button>
              {selection.size > 0 && (
                <button
                  type="button"
                  aria-label="Clear selection"
                  title="Clear selection (Esc)"
                  onClick={() => setSelection(new Set())}
                  className="icon-button"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )}

          {drop && data.pages[drop.page] && data.pages[drop.target] && (
            <p className="absolute top-3 left-1/2 max-w-[60%] -translate-x-1/2 truncate rounded-control bg-elevated px-2.5 py-1 text-small text-fg shadow-panel">
              Move under “{pageParts(data.pages[drop.target]!).title}”
            </p>
          )}

          {(isEmpty || matches?.size === 0) && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="pointer-events-auto">
                {loading ? (
                  <PanelState
                    icon={Network}
                    title="Loading pages…"
                    detail="The graph draws as soon as this workspace’s pages arrive."
                  />
                ) : isEmpty ? (
                  <PanelState
                    icon={Network}
                    title="No pages yet"
                    detail="Pages you open in this workspace show up here, joined to the page they came from."
                  />
                ) : (
                  <PanelState
                    icon={SearchX}
                    title="No pages match"
                    detail={`Nothing in this workspace fits “${filter.trim()}”.`}
                    action="Clear filter"
                    onAction={() => setFilter('')}
                  />
                )}
              </div>
            </div>
          )}

          <p aria-live="polite" className="sr-only">
            {announced}
          </p>

          {hover && hover.kind !== 'workspace' && (
            <div
              ref={cardRef}
              className="pointer-events-none absolute top-0 left-0 w-64 rounded-control bg-elevated px-2.5 py-2 shadow-panel"
            >
              <NodeCard
                node={hover}
                data={data}
                source={source}
                isCentre={(hover.page?.id ?? hover.id) === scene.centerId}
                mode={mode}
              />
            </div>
          )}
        </div>

        {rail && (
          <section
            ref={railRef}
            onKeyDown={moveInRail}
            aria-label={rail === 'settings' ? 'Alma settings' : 'Filters'}
            className={`flex w-65 shrink-0 flex-col border-l border-divider bg-surface ${narrow ? 'absolute inset-y-0 right-0 z-20 shadow-panel' : ''}`}
          >
            {railBody}
          </section>
        )}

        {helpOpen && <ShortcutSheet onClose={() => setHelpOpen(false)} />}
      </div>

      <footer className="flex h-9 shrink-0 items-center gap-3 border-t border-divider pr-1.5 pl-3.5 text-caption text-fg-subtle">
        <p className="min-w-0 truncate tabular-nums">
          {pages} {pages === 1 ? 'page' : 'pages'} · {trails}{' '}
          {trails === 1 ? 'trail' : 'trails'} · {sites}{' '}
          {sites === 1 ? 'site' : 'sites'}
          {data.groups.length > 0 &&
            ` · ${data.groups.length} ${data.groups.length === 1 ? 'folder' : 'folders'}`}
          {totalMemory > 0 && ` · ${formatMemory(totalMemory)}`}
        </p>
        <div className="flex-1" />
        {/* Made-up workspaces for trying the layouts: development only. */}
        {import.meta.env.DEV && (
          <>
            <span className="whitespace-nowrap">Dev data</span>
            <div className="shrink-0 whitespace-nowrap">
              <SegmentedControl
                label="Pages to show"
                compact
                options={SOURCES}
                value={source}
                onChange={setSource}
              />
            </div>
          </>
        )}
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => viewRef.current?.zoomBy(0.8)}
            aria-label="Zoom out"
            title="Zoom out (−)"
            className="icon-button icon-button-sm"
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            onClick={() => viewRef.current?.resetCamera()}
            aria-label="Fit everything"
            title="Fit everything (0)"
            className="icon-button icon-button-sm"
          >
            <Maximize size={14} />
          </button>
          <button
            type="button"
            onClick={() => viewRef.current?.zoomBy(1.25)}
            aria-label="Zoom in"
            title="Zoom in (+)"
            className="icon-button icon-button-sm"
          >
            <Plus size={14} />
          </button>
        </div>
      </footer>
    </div>
  );
}

function RailGroup({
  label,
  aside,
  asideTitle,
  children,
}: {
  label: string;
  /** A quiet note at the end of the heading. */
  aside?: string;
  asideTitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col">
      <div className="mb-1 flex items-baseline gap-2 px-2">
        <p className={`${GROUP_LABEL} min-w-0 flex-1 truncate`}>{label}</p>
        {aside && (
          <p
            title={asideTitle}
            className="shrink-0 text-caption text-fg-subtle"
          >
            {aside}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * A row in the sidebar's language. A pressed one is raised like the chosen
 * segment, so it reads apart from the one under the pointer.
 */
function RailRow({
  icon,
  label,
  count,
  title,
  pressed,
  onClick,
  onPreview,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  title: string;
  pressed: boolean;
  onClick(): void;
  onPreview(): void;
}) {
  // Nothing to show with the rest of the filter: no use pressing it.
  const empty = count === 0 && !pressed;
  return (
    <button
      type="button"
      data-rail-item
      aria-pressed={pressed}
      disabled={empty}
      aria-label={`${label}, ${count} ${count === 1 ? 'page' : 'pages'}`}
      title={title}
      onClick={onClick}
      onPointerEnter={empty ? undefined : onPreview}
      onFocus={onPreview}
      className="flex h-7 w-full shrink-0 items-center gap-2 rounded-row px-2 text-left text-small text-fg-muted outline-offset-[-2px] transition-[background-color,color,box-shadow] duration-fast hover:bg-row-hover hover:text-fg disabled:text-fg-disabled disabled:hover:bg-transparent aria-pressed:bg-elevated aria-pressed:text-fg aria-pressed:shadow-row"
    >
      <span className="grid size-4 shrink-0 place-items-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 text-caption tabular-nums">{count}</span>
    </button>
  );
}

function ShortcutSheet({ onClose }: { onClose(): void }) {
  return (
    <div
      role="dialog"
      aria-label="Shortcuts"
      className="overlay-in absolute top-1/2 left-1/2 z-30 w-[34rem] max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-panel bg-elevated p-4 shadow-panel"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-small font-medium text-fg">Alma view shortcuts</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close shortcuts"
          className="icon-button icon-button-sm"
        >
          <X size={14} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        {SHORTCUTS.map(({ group, keys }) => (
          <div key={group}>
            <p className="mb-1 text-caption font-medium text-fg-subtle">
              {group}
            </p>
            {keys.map(([key, what]) => (
              <div key={key} className="flex items-baseline gap-2 py-0.5">
                <kbd className="w-16 shrink-0 font-mono text-caption whitespace-nowrap text-fg">
                  {key}
                </kbd>
                <span className="text-caption text-fg-muted">{what}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function stateWords(node: SceneNode, data: GraphData): string[] {
  const page = node.page;
  if (!page) return [];
  const bytes = data.memory.get(page.id);
  const site = siteOf(page);
  const sameSite = site
    ? Object.values(data.pages).filter((other) => siteOf(other) === site)
        .length - 1
    : 0;
  const folder = data.groups.find((group) => group.id === node.folder);
  const type = PAGE_TYPES.find((t) => t.value === pageTypeOf(page));
  return [
    folder && `In ${folder.name}`,
    type && type.value !== 'other' && type.label,
    page.isUnresponsive && 'Not responding',
    page.isLoading && 'Loading',
    page.error && 'Couldn’t load',
    page.isDiscarded && 'Asleep',
    page.isAudible && (page.isMuted ? 'Muted' : 'Playing sound'),
    page.isPinned && 'Pinned',
    bytes && formatMemory(bytes),
    page.childIds.length > 0 && `Led to ${plural(page.childIds.length)}`,
    sameSite > 0 && `${sameSite} more on this site`,
  ].filter((word): word is string => !!word);
}

function NodeCard({
  node,
  data,
  source,
  isCentre,
  mode,
}: {
  node: SceneNode;
  data: GraphData;
  source: Source;
  isCentre: boolean;
  mode: GraphMode;
}) {
  const words = stateWords(node, data);
  let action: string;
  if (node.term) {
    action = 'Click to show only these';
  } else if (node.kind === 'site' && !node.page) {
    action = 'Click to zoom to this site';
  } else if (mode === 'focus' && !isCentre) {
    action = 'Click to focus here';
  } else if (source !== 'yours') {
    action = isCentre ? 'Sample page' : 'Click to focus here';
  } else {
    action =
      mode === 'focus' ? 'Click to open' : 'Click to open · ⌥-click to focus';
  }
  return (
    <>
      <p className="truncate text-small font-medium text-fg">{node.label}</p>
      {node.detail && (
        <p className="truncate text-caption text-fg-muted">{node.detail}</p>
      )}
      {words.length > 0 && (
        <p className="mt-1 text-caption text-fg-muted">{words.join(' · ')}</p>
      )}
      {node.page?.note && (
        <p className="mt-1 line-clamp-2 text-caption text-fg-muted">
          {node.page.note}
        </p>
      )}
      <p className="mt-1 text-caption text-fg-subtle">{action}</p>
    </>
  );
}

const GROUP_LABEL = 'text-caption font-medium text-fg-subtle';

const LOOKS: { value: AlmaLook; label: string; preview: React.ReactNode }[] = [
  {
    value: 'icons',
    label: 'Icons',
    preview: (
      <>
        <path d="M14 24 34 12M34 12l14 14" className="stroke-(--guide-path)" />
        <circle cx="14" cy="24" r="6" className="fill-(--icon-chip)" />
        <circle cx="34" cy="12" r="8" className="fill-(--icon-chip)" />
        <circle cx="48" cy="26" r="5" className="fill-(--icon-chip)" />
      </>
    ),
  },
  {
    value: 'stars',
    label: 'Stars',
    preview: (
      <>
        <path
          d="M12 26 28 10l12 12 12-10"
          strokeDasharray="1 3"
          className="stroke-(--fg-subtle)"
        />
        <circle cx="12" cy="26" r="1.5" className="fill-(--fg)" />
        <circle cx="28" cy="10" r="2.4" className="fill-(--fg)" />
        <circle cx="40" cy="22" r="1.2" className="fill-(--fg)" />
        <circle cx="52" cy="12" r="1.8" className="fill-(--fg)" />
        <circle cx="20" cy="9" r="0.6" className="fill-(--fg-subtle)" />
        <circle cx="46" cy="30" r="0.6" className="fill-(--fg-subtle)" />
      </>
    ),
  },
  {
    value: 'ink',
    label: 'Ink',
    preview: (
      <>
        <path
          d="M15 25C22 14 26 16 33 13M36 14c6 2 9 6 12 12"
          className="stroke-(--fg-muted)"
        />
        <circle cx="13" cy="26" r="5" className="fill-none stroke-(--fg)" />
        <circle cx="34" cy="12" r="7" className="fill-none stroke-(--fg)" />
        <circle cx="49" cy="27" r="4" className="fill-none stroke-(--fg)" />
      </>
    ),
  },
];

function SliderRow({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onChange(value: number): void;
}) {
  return (
    <label className="flex h-7 items-center justify-between gap-3 text-small text-fg-muted">
      {label}
      <input
        type="range"
        aria-label={label}
        min={0}
        max={1}
        step={0.01}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ '--value': value } as React.CSSProperties}
        className="range-input w-28 disabled:opacity-40"
      />
    </label>
  );
}

function SwitchRow({
  label,
  detail,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  disabled: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="min-w-0">
        <p className="text-small text-fg-muted">{label}</p>
        <p className="text-caption text-fg-subtle">{detail}</p>
      </div>
      <button
        type="button"
        role="switch"
        data-rail-item
        aria-label={label}
        aria-checked={checked && !disabled}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="switch shrink-0 disabled:opacity-40"
      >
        <span className="switch-knob" />
      </button>
    </div>
  );
}

/** Everything applies as it changes, with the graph in view beside it. */
function AlmaSettingsPanel({
  settings,
  onChange,
  sizeBy,
  onSizeBy,
  forcesApply,
  onGrow,
  onBack,
}: {
  settings: AlmaSettings;
  onChange(settings: AlmaSettings): void;
  sizeBy: 'branch' | 'memory';
  onSizeBy(sizeBy: 'branch' | 'memory'): void;
  forcesApply: boolean;
  onGrow(): void;
  onBack(): void;
}) {
  const set = (patch: Partial<AlmaSettings>) =>
    onChange({ ...settings, ...patch });
  const calm = prefersReducedMotion();
  const untouched =
    JSON.stringify(settings) === JSON.stringify(DEFAULT_ALMA_SETTINGS);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2 pb-3">
      {/* Mirrors the sidebar panels' header, with back in the icon slot. */}
      <div className="flex h-7 shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onBack}
          title="Back to filters (esc)"
          className="group flex h-7 min-w-0 items-center gap-1.5 rounded-control pr-2 pl-1 text-small font-semibold text-fg transition-colors duration-fast hover:bg-row-hover"
        >
          <span className="grid size-4 shrink-0 place-items-center text-fg-subtle transition-[color,translate] duration-fast group-hover:-translate-x-0.5 group-hover:text-fg">
            <ChevronLeft size={15} aria-hidden />
          </span>
          <h2 className="truncate">Alma settings</h2>
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => onChange(DEFAULT_ALMA_SETTINGS)}
          disabled={untouched}
          aria-label="Reset Alma settings"
          title="Reset"
          className="icon-button icon-button-sm"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className={GROUP_LABEL}>Look</p>
        <div
          role="radiogroup"
          aria-label="Look"
          className="grid grid-cols-3 gap-1.5"
        >
          {LOOKS.map((look) => (
            <button
              key={look.value}
              type="button"
              role="radio"
              aria-checked={settings.look === look.value}
              onClick={() => set({ look: look.value })}
              className="flex flex-col items-center gap-1 rounded-control bg-field pt-1.5 pb-1 text-caption text-fg-muted shadow-outline transition-colors duration-fast hover:bg-field-hover aria-checked:text-fg aria-checked:shadow-focus"
            >
              <svg
                viewBox="0 0 64 38"
                aria-hidden
                className="h-8 w-full"
                fill="none"
                strokeWidth="1.2"
                strokeLinecap="round"
              >
                {look.preview}
              </svg>
              {look.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className={GROUP_LABEL}>Colour by</p>
        <SegmentedControl<AlmaTint>
          label="Colour by"
          compact
          stretch
          options={[
            { value: 'none', label: 'None' },
            { value: 'trail', label: 'Trail' },
            { value: 'site', label: 'Site' },
            { value: 'folder', label: 'Folder' },
            { value: 'type', label: 'Type' },
          ]}
          value={settings.tint}
          onChange={(tint) => set({ tint })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <p className={GROUP_LABEL}>Size by</p>
        <SegmentedControl<'branch' | 'memory'>
          label="Size by"
          compact
          stretch
          options={[
            { value: 'branch', label: 'What it led to' },
            { value: 'memory', label: 'Memory' },
          ]}
          value={sizeBy}
          onChange={onSizeBy}
        />
      </div>

      <div className="flex flex-col">
        <p className={`${GROUP_LABEL} mb-0.5`}>Forces</p>
        <SliderRow
          label="Spread"
          value={settings.spread}
          disabled={!forcesApply}
          onChange={(spread) => set({ spread })}
        />
        <SliderRow
          label="Pull"
          value={settings.pull}
          disabled={!forcesApply}
          onChange={(pull) => set({ pull })}
        />
        <SliderRow
          label="Gather"
          value={settings.gather}
          disabled={!forcesApply}
          onChange={(gather) => set({ gather })}
        />
        {!forcesApply && (
          <p className="text-caption text-fg-subtle">
            Forces shape Web, Sites, Folders and Types. This mode has fixed
            places.
          </p>
        )}
      </div>

      <div className="flex flex-col">
        <p className={`${GROUP_LABEL} mb-0.5`}>Display</p>
        <SliderRow
          label="Size"
          value={settings.size}
          onChange={(size) => set({ size })}
        />
        <SliderRow
          label="Lines"
          value={settings.lines}
          onChange={(lines) => set({ lines })}
        />
        <SliderRow
          label="Labels"
          value={settings.labels}
          onChange={(labels) => set({ labels })}
        />
      </div>

      <div className="flex flex-col">
        <p className={`${GROUP_LABEL} mb-0.5`}>Motion</p>
        <SwitchRow
          label="Drift"
          detail="Everything floats. Pages circle their sites."
          checked={settings.drift}
          disabled={calm}
          onChange={(drift) => set({ drift })}
        />
        <SwitchRow
          label="Flow"
          detail="Dots run the way each trail went."
          checked={settings.flow}
          disabled={calm}
          onChange={(flow) => set({ flow })}
        />
        <button
          type="button"
          onClick={onGrow}
          disabled={calm}
          className="button button-raised mt-1.5 w-full justify-center"
        >
          <Sprout size={14} />
          Grow from the first page
        </button>
        {calm && (
          <p className="mt-1 text-caption text-fg-subtle">
            Off while reduced motion is on.
          </p>
        )}
      </div>
    </div>
  );
}
