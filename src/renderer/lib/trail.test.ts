import { sampleSnapshot } from '../test-fixtures';
import type { DrawnHalf } from './trail';
import {
  filteredRows,
  guideHalves,
  hiddenSummary,
  pageMatches,
  pathGuides,
  planGuides,
  pruneGuides,
  treeFocusTarget,
  visibleRows,
} from './trail';

describe('visibleRows', () => {
  it('lists pages depth-first with their depth', () => {
    expect(visibleRows(sampleSnapshot())).toEqual([
      { id: 'a', parentId: null, depth: 0, hasChildren: true },
      { id: 'b', parentId: 'a', depth: 1, hasChildren: true },
      { id: 'd', parentId: 'b', depth: 2, hasChildren: false },
      { id: 'c', parentId: 'a', depth: 1, hasChildren: false },
      { id: 'e', parentId: null, depth: 0, hasChildren: false },
    ]);
  });

  it('skips the descendants of collapsed pages', () => {
    const rows = visibleRows(sampleSnapshot({ b: { collapsed: true } }));
    expect(rows.map((row) => row.id)).toEqual(['a', 'b', 'c', 'e']);
  });
});

describe('filteredRows', () => {
  const snapshot = () =>
    sampleSnapshot({
      b: { collapsed: true, title: 'Trail maps' },
      d: { title: 'Alpine huts', url: 'https://huts.example/alps' },
    });

  it('keeps matches and the pages they came from, opening collapsed ones', () => {
    expect(filteredRows(snapshot(), 'alpine').map((row) => row.id)).toEqual([
      'a',
      'b',
      'd',
    ]);
  });

  it('needs every word, in the title or the address', () => {
    expect(filteredRows(snapshot(), 'huts alps').map((r) => r.id)).toEqual([
      'a',
      'b',
      'd',
    ]);
    expect(filteredRows(snapshot(), 'huts beach')).toEqual([]);
  });

  it('is the whole visible trail when empty', () => {
    expect(filteredRows(snapshot(), '  ')).toEqual(visibleRows(snapshot()));
  });

  it('tells matches from the pages shown above them', () => {
    expect(pageMatches(snapshot(), 'd', 'ALPINE')).toBe(true);
    expect(pageMatches(snapshot(), 'b', 'alpine')).toBe(false);
  });
});

describe('hiddenSummary', () => {
  it('is null for expanded pages and pages without children', () => {
    expect(hiddenSummary(sampleSnapshot(), 'a')).toBeNull();
    expect(
      hiddenSummary(sampleSnapshot({ c: { collapsed: true } }), 'c'),
    ).toBeNull();
  });

  it('collects what the collapsed pages are doing', () => {
    const snapshot = sampleSnapshot({
      a: { collapsed: true },
      b: { isAudible: true, isMuted: true },
      c: { isAudible: true },
      d: { isUnresponsive: true },
    });
    expect(hiddenSummary(snapshot, 'a')).toEqual({
      ids: ['b', 'd', 'c'],
      playing: ['c'],
      failedId: 'd',
    });
  });
});

describe('pathGuides', () => {
  it('lights the lines from each ancestor down to the current page', () => {
    const snapshot = { ...sampleSnapshot(), activePageId: 'd' };
    const guides = pathGuides(visibleRows(snapshot), 'd');
    expect(Object.fromEntries(guides)).toEqual({
      b: { level: 0, end: true, start: 0 },
      d: { level: 1, end: true, start: 0.5 },
    });
  });

  it('runs past earlier siblings to reach the page', () => {
    const rows = visibleRows(sampleSnapshot());
    expect(Object.fromEntries(pathGuides(rows, 'c'))).toEqual({
      b: { level: 0, end: false, start: 0 },
      d: { level: 0, end: false, start: 1 },
      c: { level: 0, end: true, start: 2 },
    });
  });

  it('lights nothing for a top-level page or one hidden in a branch', () => {
    expect(pathGuides(visibleRows(sampleSnapshot()), 'a').size).toBe(0);
    const collapsed = visibleRows(sampleSnapshot({ b: { collapsed: true } }));
    expect(pathGuides(collapsed, 'd').size).toBe(0);
  });
});

describe('treeFocusTarget', () => {
  const rows = visibleRows(sampleSnapshot());

  it('steps through the visible rows', () => {
    expect(treeFocusTarget(rows, 'b', 'ArrowDown')).toBe('d');
    expect(treeFocusTarget(rows, 'b', 'ArrowUp')).toBe('a');
    expect(treeFocusTarget(rows, 'e', 'ArrowDown')).toBeNull();
    expect(treeFocusTarget(rows, 'a', 'ArrowUp')).toBeNull();
  });

  it('goes to the parent and the first child', () => {
    expect(treeFocusTarget(rows, 'd', 'ArrowLeft')).toBe('b');
    expect(treeFocusTarget(rows, 'a', 'ArrowLeft')).toBeNull();
    expect(treeFocusTarget(rows, 'a', 'ArrowRight')).toBe('b');
    expect(treeFocusTarget(rows, 'c', 'ArrowRight')).toBeNull();
  });

  it('jumps to either end', () => {
    expect(treeFocusTarget(rows, 'c', 'Home')).toBe('a');
    expect(treeFocusTarget(rows, 'c', 'End')).toBe('e');
    expect(treeFocusTarget(rows, 'e', 'End')).toBeNull();
  });
});

describe('planGuides', () => {
  const rows = visibleRows(sampleSnapshot());
  const halves = (id: string) => guideHalves(pathGuides(rows, id));
  const strokes = (plan: Map<string, DrawnHalf>) =>
    Object.fromEntries([...plan].map(([key, drawn]) => [key, drawn.stroke]));

  it('draws a new path as one stroke from the top', () => {
    const plan = planGuides(new Map(), halves('c'), true);
    expect(strokes(plan)).toEqual({
      'b:0:top': { direction: 'in', from: 0, to: 0.2, count: 5 },
      'b:0:bottom': { direction: 'in', from: 0.2, to: 0.4, count: 5 },
      'd:0:top': { direction: 'in', from: 0.4, to: 0.6, count: 5 },
      'd:0:bottom': { direction: 'in', from: 0.6, to: 0.8, count: 5 },
      'c:0:top': { direction: 'in', from: 0.8, to: 1, count: 5 },
    });
  });

  it('only draws the new part and keeps what is there', () => {
    const before = planGuides(new Map(), halves('b'), false);
    const plan = planGuides(before, halves('c'), true);
    expect(plan.get('b:0:top')).toBe(before.get('b:0:top'));
    expect(plan.get('b:0:bottom')?.stroke).toEqual({
      direction: 'in',
      from: 0,
      to: 0.25,
      count: 4,
    });
  });

  it('retracts what leaves the path upward, lowest first', () => {
    const before = planGuides(new Map(), halves('c'), false);
    const plan = planGuides(before, halves('b'), true);
    expect(strokes(plan)).toEqual({
      'b:0:top': null,
      'c:0:top': { direction: 'out', from: 0, to: 0.25, count: 4 },
      'd:0:bottom': { direction: 'out', from: 0.25, to: 0.5, count: 4 },
      'd:0:top': { direction: 'out', from: 0.5, to: 0.75, count: 4 },
      'b:0:bottom': { direction: 'out', from: 0.75, to: 1, count: 4 },
    });
    // Once retracted, they go.
    const serial = plan.get('c:0:top')!.leavingSince!;
    expect([...pruneGuides(plan, serial).keys()]).toEqual(['b:0:top']);
  });

  it('keeps a stroke that is still running, and redraws one coming back', () => {
    const first = planGuides(new Map(), halves('d'), true);
    expect(planGuides(first, halves('d'), true)).toEqual(first);
    const away = planGuides(first, halves('a'), true);
    const back = planGuides(away, halves('d'), true);
    expect(back.get('d:1:top')!.id).not.toBe(first.get('d:1:top')!.id);
    expect(back.get('d:1:top')!.stroke?.direction).toBe('in');
  });
});

describe('sidebar section counts', () => {
  it('counts collapsed descendants under the pinned ancestor', async () => {
    const { trailSectionCounts } = await import('./trail');
    const snapshot = sampleSnapshot({ a: { isPinned: true, collapsed: true } });
    expect(trailSectionCounts(snapshot)).toEqual({ pinned: 4, open: 1 });
  });
});
