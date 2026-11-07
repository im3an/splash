// @vitest-environment jsdom
import { act, fireEvent, render } from '@testing-library/react';
import type { SplashApi } from '../../shared/api';
import { useShell } from '../stores/shell-store';
import { page, sampleSnapshot } from '../test-fixtures';
import { TrailTree } from './TrailTree';

type Answer = { target: Element; isIntersecting: boolean };

let tell: (entries: Answer[]) => void;

class FakeObserver {
  constructor(callback: (entries: Answer[]) => void) {
    tell = callback;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

/** Where a slot appears to be at the moment it arrives. */
let arrivesAt = 99_999;

function row(id: string) {
  return document.querySelector<HTMLElement>(
    `.trail-row[data-page-id="${id}"]`,
  );
}

function slotOf(id: string) {
  const inner = document.querySelector<HTMLElement>(`[data-page-id="${id}"]`);
  return inner!.parentElement!;
}

function scroll(id: string, isIntersecting: boolean) {
  act(() => tell([{ target: slotOf(id), isIntersecting }]));
}

function show() {
  render(
    <nav className="link-drop-trail">
      <TrailTree />
    </nav>,
  );
}

beforeEach(() => {
  arrivesAt = 99_999;
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  window.splash = { setOverlayActive: vi.fn() } as unknown as SplashApi;
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(Element.prototype, 'clientHeight', 'get').mockReturnValue(500);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: Element) {
      return (
        this.matches('.link-drop-trail')
          ? { top: 0, bottom: 500, height: 500, left: 0, width: 200 }
          : {
              top: arrivesAt,
              bottom: arrivesAt + 30,
              height: 30,
              left: 0,
              width: 200,
            }
      ) as DOMRect;
    },
  );
  useShell.setState({
    snapshot: null,
    renamingPageId: null,
    editingNotePageId: null,
  });
  useShell.getState().receiveSnapshot(sampleSnapshot());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a trail longer than the window', () => {
  it('draws the current page, and only holds a place for far ones', () => {
    show();
    expect(row('a')).not.toBeNull();
    expect(row('e')).toBeNull();
    expect(document.querySelector('[data-page-id="e"]')).not.toBeNull();
  });

  it('holds the same room for a far row as the row takes', () => {
    const snapshot = sampleSnapshot({
      e: { childIds: ['f'], isPinned: true },
    });
    snapshot.pages.f = page('f', { parentId: 'e' });
    useShell.getState().receiveSnapshot(snapshot);
    useShell.setState({
      preferences: { trailStyle: 'branches' } as never,
    });
    show();
    const place = document.querySelector<HTMLElement>('[data-page-id="e"]')!;
    expect(place.className).toContain('trail-row-place');
    expect(place.dataset.trailhead).toBe('true');
    expect(place.dataset.pinnedRoot).toBe('true');
    scroll('e', true);
    expect(row('e')!.dataset.trailhead).toBe('true');
    expect(row('e')!.dataset.pinnedRoot).toBe('true');
  });

  it('draws a row as it comes near and lets it go again', () => {
    show();
    scroll('e', true);
    expect(row('e')).not.toBeNull();
    scroll('e', false);
    expect(row('e')).toBeNull();
  });

  it('draws rows that are on screen before anything paints', () => {
    arrivesAt = 10;
    show();
    expect(row('e')).not.toBeNull();
  });

  it('grows in a page that was just opened, not one scrolled back to', () => {
    arrivesAt = 10;
    show();
    expect(row('e')!.className).not.toContain('row-in');

    const next = sampleSnapshot();
    next.pages.n = page('n');
    next.rootIds = ['a', 'e', 'n'];
    act(() => useShell.getState().receiveSnapshot(next));
    expect(row('n')!.className).toContain('row-in');

    scroll('n', false);
    expect(row('n')).toBeNull();
    scroll('n', true);
    expect(row('n')!.className).not.toContain('row-in');
  });

  it('moves focus by keyboard to a row that was too far to be drawn', () => {
    show();
    expect(row('b')).toBeNull();
    fireEvent.keyDown(row('a')!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(row('b'));
  });

  it('keeps a row being renamed drawn', () => {
    useShell.setState({ renamingPageId: 'e' });
    show();
    expect(row('e')).not.toBeNull();
  });

  it('keeps a note open under a far row', () => {
    useShell.setState({ editingNotePageId: 'c' });
    show();
    expect(row('c')).toBeNull();
    expect(document.querySelector('textarea')).not.toBeNull();
  });
});
