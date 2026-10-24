// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { SplashApi } from '../../../shared/api';
import { useShell } from '../../stores/shell-store';
import { useUi } from '../../stores/ui-store';
import { sampleSnapshot } from '../../test-fixtures';
import { ContextMenu } from '../overlays/ContextMenu';
import { TrailTree } from './TrailTree';

function stubApi() {
  const splash = {
    backend: 'mock',
    platform: 'darwin',
    activatePage: vi.fn(async () => undefined),
    closePage: vi.fn(async () => undefined),
    setCollapsed: vi.fn(async () => undefined),
    renamePage: vi.fn(async () => undefined),
    movePage: vi.fn(async () => undefined),
    createPage: vi.fn(async () => 'new'),
  };
  window.splash = splash as unknown as SplashApi;
  return splash;
}

beforeEach(() => {
  useShell.setState({ snapshot: null });
  useUi.setState({ editing: null, contextMenu: null, sheet: null, toasts: [] });
});

describe('TrailTree', () => {
  it('shows a loading state until the first snapshot arrives', () => {
    stubApi();
    render(<TrailTree />);
    expect(screen.getByLabelText('Loading pages')).toBeTruthy();
  });

  it('shows an empty state naming the workspace', () => {
    stubApi();
    render(<TrailTree />);
    act(() =>
      useShell.getState().receiveSnapshot({
        ...sampleSnapshot(),
        pages: {},
        rootIds: [],
        activePageId: null,
      }),
    );
    expect(screen.getByText('Personal has no pages')).toBeTruthy();
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
    expect(items[0]?.tabIndex).toBe(0);
    expect(items[1]?.tabIndex).toBe(-1);
  });

  it('routes row interactions to the browser API', async () => {
    const splash = stubApi();
    useShell.setState({ snapshot: sampleSnapshot() });
    render(<TrailTree />);

    fireEvent.click(screen.getByRole('treeitem', { name: 'c' }));
    expect(splash.activatePage).toHaveBeenCalledWith('c');

    fireEvent.click(screen.getByRole('button', { name: 'Collapse b' }));
    expect(splash.setCollapsed).toHaveBeenCalledWith('b', true);

    fireEvent.click(screen.getByRole('button', { name: 'Close e' }));
    expect(splash.closePage).toHaveBeenCalledWith('e');
    expect(splash.activatePage).toHaveBeenCalledTimes(1);
  });

  it('moves focus between rows with the arrow keys', () => {
    const splash = stubApi();
    useShell.setState({ snapshot: sampleSnapshot() });
    render(<TrailTree />);
    const [a, b, d] = screen.getAllByRole('treeitem');
    a!.focus();
    fireEvent.keyDown(a!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(b);
    fireEvent.keyDown(b!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(d);
    // Left on a leaf goes to its parent; on an expanded parent it collapses.
    fireEvent.keyDown(d!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(b);
    fireEvent.keyDown(b!, { key: 'ArrowLeft' });
    expect(splash.setCollapsed).toHaveBeenCalledWith('b', true);
    fireEvent.keyDown(b!, { key: 'Enter' });
    expect(splash.activatePage).toHaveBeenCalledWith('b');
  });

  it('renames a page inline and returns focus to its row', async () => {
    const splash = stubApi();
    useShell.setState({ snapshot: sampleSnapshot() });
    render(<TrailTree />);
    fireEvent.doubleClick(screen.getByRole('treeitem', { name: 'c' }));
    await act(async () => {});
    const field = screen.getByRole('textbox', { name: 'Page name' });
    expect(document.activeElement).toBe(field);
    fireEvent.change(field, { target: { value: '  Notes ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await act(async () => {});
    expect(splash.renamePage).toHaveBeenCalledWith('c', 'Notes');
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('cancels a rename with Escape without saving', async () => {
    const splash = stubApi();
    useShell.setState({ snapshot: sampleSnapshot() });
    render(<TrailTree />);
    fireEvent.doubleClick(screen.getByRole('treeitem', { name: 'c' }));
    await act(async () => {});
    const field = screen.getByRole('textbox', { name: 'Page name' });
    fireEvent.change(field, { target: { value: 'Something else' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(splash.renamePage).not.toHaveBeenCalled();
  });

  it('clears the custom name when the field is emptied', async () => {
    const splash = stubApi();
    useShell.setState({
      snapshot: sampleSnapshot({ c: { customTitle: 'Mine' } }),
    });
    render(<TrailTree />);
    fireEvent.doubleClick(screen.getByRole('treeitem', { name: 'Mine' }));
    await act(async () => {});
    const field = screen.getByRole('textbox', { name: 'Page name' });
    fireEvent.change(field, { target: { value: '' } });
    fireEvent.blur(field);
    await act(async () => {});
    expect(splash.renamePage).toHaveBeenCalledWith('c', null);
  });

  it('opens a page context menu whose items run commands', async () => {
    const splash = stubApi();
    useShell.setState({ snapshot: sampleSnapshot() });
    render(
      <>
        <TrailTree />
        <ContextMenu />
      </>,
    );
    fireEvent.contextMenu(screen.getByRole('treeitem', { name: 'c' }));
    const menu = screen.getByRole('menu');
    // c is the last child of a: it can move up or nest under b, not move down.
    expect(
      screen
        .getByRole('menuitem', { name: 'Move Down' })
        .getAttribute('aria-disabled'),
    ).toBe('true');
    expect(screen.queryByRole('menuitem', { name: /Children/ })).toBeNull();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Move Up' }));
    await act(async () => {});
    expect(splash.movePage).toHaveBeenCalledWith('c', 'a', 'b');
    expect(menu.isConnected).toBe(false);
  });

  it('closes the context menu with Escape and restores focus', () => {
    stubApi();
    useShell.setState({ snapshot: sampleSnapshot() });
    render(
      <>
        <TrailTree />
        <ContextMenu />
      </>,
    );
    const row = screen.getByRole('treeitem', { name: 'b' });
    fireEvent.contextMenu(row);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(row);
  });
});
