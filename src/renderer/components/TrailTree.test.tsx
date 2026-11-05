// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { SplashApi } from '../../shared/api';
import { usePageMenu } from '../stores/page-menu-store';
import { useShell } from '../stores/shell-store';
import { useToast } from '../stores/toast-store';
import { sampleSnapshot } from '../test-fixtures';
import { TrailTree } from './TrailTree';

function stubApi() {
  const splash = {
    activatePage: vi.fn(async () => undefined),
    closePage: vi.fn(async () => undefined),
    setCollapsed: vi.fn(async () => undefined),
    renamePage: vi.fn(async () => undefined),
    setMuted: vi.fn(async () => undefined),
    freezePage: vi.fn(async () => null),
    setOverlayActive: vi.fn(),
  };
  window.splash = splash as unknown as SplashApi;
  return splash;
}

beforeEach(() => {
  useShell.setState({ snapshot: null });
  // jsdom has no layout, so nothing to scroll; record the requests instead.
  Element.prototype.scrollIntoView = vi.fn();
});

describe('TrailTree', () => {
  it('shows a loading state until the first snapshot arrives', () => {
    stubApi();
    render(<TrailTree />);
    expect(screen.getByLabelText('Loading pages')).toBeTruthy();
  });

  it('shows an empty state when there are no pages', () => {
    stubApi();
    render(<TrailTree />);
    act(() =>
      useShell.getState().receiveSnapshot({
        pages: {},
        rootIds: [],
        groups: [],
        activePageId: null,
        split: null,
        otherWindows: [],
        lastClosed: null,
        workspaces: [],
        activeWorkspaceId: 'w1',
      }),
    );
    expect(screen.getByText('No pages yet')).toBeTruthy();
  });

  it('renders the hierarchy with levels and the active page', () => {
    stubApi();
    useShell.setState({ snapshot: sampleSnapshot() });
    render(<TrailTree />);
    const items = screen.getAllByRole('treeitem');
    expect(items.map((item) => item.getAttribute('aria-label'))).toEqual([
      'a',
      'b',
      'd',
      'c',
      'e',
    ]);
    expect(items.map((item) => item.getAttribute('aria-level'))).toEqual([
      '1',
      '2',
      '3',
      '2',
      '1',
    ]);
    expect(items[0]?.getAttribute('aria-selected')).toBe('true');
    expect(items[0]?.getAttribute('aria-expanded')).toBe('true');
    expect(items[2]?.hasAttribute('aria-expanded')).toBe(false);
  });

  it('scrolls a newly active page into view', () => {
    stubApi();
    useShell.setState({ snapshot: sampleSnapshot() });
    render(<TrailTree />);
    const scroll = vi.mocked(Element.prototype.scrollIntoView);
    scroll.mockClear();

    act(() =>
      useShell
        .getState()
        .receiveSnapshot({ ...sampleSnapshot(), activePageId: 'e' }),
    );
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(scroll.mock.contexts[0]).toBe(
      screen.getByRole('treeitem', { name: 'e' }),
    );
  });

  it('routes row interactions to the browser API', () => {
    const splash = stubApi();
    useShell.setState({ snapshot: sampleSnapshot() });
    render(<TrailTree />);

    fireEvent.click(screen.getByRole('treeitem', { name: 'c' }));
    expect(splash.activatePage).toHaveBeenCalledWith('c');

    fireEvent.click(screen.getByRole('button', { name: 'Collapse b' }));
    expect(splash.setCollapsed).toHaveBeenCalledWith('b', true);

    fireEvent.click(screen.getByRole('button', { name: 'Actions for e' }));
    expect(usePageMenu.getState().menu?.pageId).toBe('e');
    expect(splash.closePage).not.toHaveBeenCalled();
    expect(splash.activatePage).toHaveBeenCalledTimes(1);
  });

  it('picks a row up with the pointer and announces it by title', async () => {
    stubApi();
    useShell.setState({ snapshot: sampleSnapshot() });
    render(<TrailTree />);
    const row = screen.getAllByRole('treeitem')[4]!;
    // The row's own pointer handler must not replace the drag sensor's.
    fireEvent.pointerDown(row, {
      isPrimary: true,
      button: 0,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(document, { clientX: 10, clientY: 40 });
    await act(async () => {});
    expect(row.getAttribute('data-dragging')).toBe('true');
    expect(document.body.textContent).toContain('“e” is over');
    expect(document.body.textContent).not.toContain('Draggable item');
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    await act(async () => {});
    expect(row.getAttribute('data-dragging')).toBe('false');
    // After a drag the sensor swallows the next click for a moment.
    await act(() => new Promise((resolve) => setTimeout(resolve, 60)));
  });

  it('opens the page menu on right click', () => {
    const splash = stubApi();
    useShell.setState({ snapshot: sampleSnapshot() });
    render(<TrailTree />);
    const row = screen.getByRole('treeitem', { name: 'c' });
    fireEvent.contextMenu(row, { clientX: 40, clientY: 90 });
    expect(usePageMenu.getState().menu).toMatchObject({
      pageId: 'c',
      x: 40,
      y: 90,
      fromKeyboard: false,
    });
    expect(row.dataset.menuOpen).toBe('true');
    expect(splash.activatePage).not.toHaveBeenCalled();
  });

  it('renames a page in place', () => {
    const splash = stubApi();
    useShell.setState({ snapshot: sampleSnapshot(), renamingPageId: 'c' });
    render(<TrailTree />);
    const field = screen.getByLabelText('Page name') as HTMLInputElement;
    expect(field.value).toBe('c');
    fireEvent.change(field, { target: { value: 'Reading list' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(splash.renamePage).toHaveBeenCalledWith('c', 'Reading list');
    expect(splash.renamePage).toHaveBeenCalledTimes(1);
    expect(useShell.getState().renamingPageId).toBeNull();
  });

  it('confirms a rename with an undo back to the old name', async () => {
    const splash = stubApi();
    useShell.setState({
      snapshot: sampleSnapshot({ c: { customTitle: 'Old' } }),
      renamingPageId: 'c',
    });
    render(<TrailTree />);
    const field = screen.getByLabelText('Page name');
    fireEvent.change(field, { target: { value: 'New' } });
    await act(async () => fireEvent.keyDown(field, { key: 'Enter' }));
    const toast = useToast.getState().toast!;
    expect(toast.message).toBe('Renamed to “New”.');
    toast.actions[0]!.run();
    expect(splash.renamePage).toHaveBeenLastCalledWith('c', 'Old');
  });

  it('walks the trail from the keyboard without opening pages', () => {
    const splash = stubApi();
    useShell.setState({ snapshot: sampleSnapshot(), renamingPageId: null });
    render(<TrailTree />);
    const row = (name: string) => screen.getByRole('treeitem', { name });
    // Only the current page is in the tab order to begin with.
    expect(row('a').tabIndex).toBe(0);
    expect(row('b').tabIndex).toBe(-1);

    row('a').focus();
    fireEvent.keyDown(row('a'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(row('b'));
    expect(row('b').tabIndex).toBe(0);
    expect(row('a').tabIndex).toBe(-1);

    fireEvent.keyDown(row('b'), { key: 'End' });
    expect(document.activeElement).toBe(row('e'));
    fireEvent.keyDown(row('e'), { key: 'Home' });
    expect(document.activeElement).toBe(row('a'));
    fireEvent.keyDown(row('a'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(row('b'));
    expect(splash.activatePage).not.toHaveBeenCalled();

    fireEvent.keyDown(row('b'), { key: 'Enter' });
    expect(splash.activatePage).toHaveBeenCalledWith('b');
  });

  it('shows custom names instead of titles', () => {
    stubApi();
    useShell.setState({
      snapshot: sampleSnapshot({ e: { customTitle: 'Later' } }),
      renamingPageId: null,
    });
    render(<TrailTree />);
    expect(screen.getByRole('treeitem', { name: 'Later' })).toBeTruthy();
  });

  it('shows what a collapsed branch hides on its row', () => {
    const splash = stubApi();
    useShell.setState({
      snapshot: sampleSnapshot({
        a: { collapsed: true },
        c: { isAudible: true },
        d: {
          error: {
            kind: 'crashed',
            code: 0,
            description: '',
            url: 'https://d.example/',
          },
        },
      }),
    });
    render(<TrailTree />);
    expect(
      screen
        .getAllByRole('treeitem')
        .map((item) => item.getAttribute('aria-label')),
    ).toEqual(['a, 3 hidden pages', 'e']);

    fireEvent.click(
      screen.getByLabelText('Mute 1 page playing in this branch'),
    );
    expect(splash.setMuted).toHaveBeenCalledWith('c', true);

    fireEvent.click(screen.getByLabelText('Show “d”, which has a problem'));
    expect(splash.activatePage).toHaveBeenCalledWith('d');
  });
});

it('separates pinned branches from open pages and counts hidden descendants', () => {
  stubApi();
  useShell.setState({
    snapshot: sampleSnapshot({ a: { isPinned: true, collapsed: true } }),
    preferences: { trailStyle: 'branches' } as never,
  });
  render(<TrailTree />);
  expect(screen.getByText('Pinned')).toBeTruthy();
  expect(screen.getByText('Pages')).toBeTruthy();
  expect(
    screen
      .getByRole('treeitem', { name: /a, pinned/ })
      .getAttribute('data-pinned-root'),
  ).toBe('true');
  expect(screen.queryByRole('treeitem', { name: 'b' })).toBeNull();
});

describe('the Minimal trail style', () => {
  function showMinimal(style: 'branches' | 'minimal' = 'minimal') {
    stubApi();
    useShell.setState({
      snapshot: sampleSnapshot({ a: { isPinned: true } }),
      preferences: { trailStyle: style, showBranchLines: true } as never,
    });
    const { container } = render(<TrailTree />);
    return container;
  }
  const row = (name: RegExp | string) => screen.getByRole('treeitem', { name });

  afterEach(() => useShell.setState({ preferences: null }));

  it('gives a page with nothing beneath it a dot, and no branch lines', () => {
    const container = showMinimal();
    expect(row('d').querySelector('.trail-dot')).not.toBeNull();
    expect(row(/^a/).querySelector('.trail-dot')).toBeNull();
    expect(row(/^a/).querySelector('.trail-branch-toggle')).not.toBeNull();
    expect(container.querySelector('.indent-guides')).toBeNull();
  });

  it('runs rows edge to edge and indents them in even steps', () => {
    showMinimal();
    expect(row('b').style.marginLeft).toBe('0px');
    expect(row('b').style.paddingLeft).toBe('22px');
    expect(row('d').style.marginLeft).toBe('0px');
    expect(row('d').style.paddingLeft).toBe('38px');
  });

  it('draws a pinned page like any other row', () => {
    showMinimal();
    expect(row(/a, pinned/).getAttribute('data-pinned-root')).toBe('false');
  });

  it('leaves the branches style as it was', () => {
    const container = showMinimal('branches');
    expect(container.querySelector('.trail-dot')).toBeNull();
    expect(container.querySelector('.indent-guides')).not.toBeNull();
    expect(row(/a, pinned/).getAttribute('data-pinned-root')).toBe('true');
  });
});
