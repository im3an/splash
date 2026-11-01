// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_APPEARANCE } from '../../shared/appearance';
import type { SplashApi } from '../../shared/api';
import { usePageMenu } from '../stores/page-menu-store';
import { useShell } from '../stores/shell-store';
import { sampleSnapshot } from '../test-fixtures';
import { PageMenu } from './PageMenu';

function stubApi() {
  const splash = {
    closePage: vi.fn(async () => undefined),
    closeBranch: vi.fn(async () => undefined),
    setPinned: vi.fn(async () => undefined),
    movePageToWorkspace: vi.fn(async () => undefined),
  };
  window.splash = splash as unknown as SplashApi;
  return splash;
}

function openMenu(pageId: string, fromKeyboard = false) {
  const row = document.createElement('div');
  row.tabIndex = -1;
  document.body.append(row);
  act(() =>
    usePageMenu.getState().open({
      pageId,
      x: 20,
      y: 20,
      fromKeyboard,
      returnFocus: row,
    }),
  );
  return row;
}

const labels = () =>
  screen
    .getAllByRole('menuitem')
    .map((item) => item.getAttribute('data-label'));

beforeEach(() => {
  document.body.innerHTML = '';
  act(() => usePageMenu.setState({ menu: null }));
});

describe('PageMenu', () => {
  it('offers what fits the page', () => {
    stubApi();
    useShell.setState({ snapshot: sampleSnapshot() });
    render(<PageMenu />);

    openMenu('b');
    expect(labels()).toContain('Collapse Branch');
    expect(labels()).toContain('Close Branch (2 Pages)');
    expect(labels()).toContain('Open in Split View');
    // One workspace: nowhere to move to.
    expect(labels()).not.toContain('Move to Workspace');
    // Shortcuts act on the current page, which this isn't.
    expect(document.querySelector('kbd')).toBeNull();
  });

  it('shows shortcuts in the current page’s menu', () => {
    stubApi();
    useShell.setState({ snapshot: sampleSnapshot() });
    render(<PageMenu />);

    openMenu('a');
    const close = screen.getByRole('menuitem', { name: /Close Page/ });
    expect(close.textContent).toContain('⌘W');
  });

  it('runs an item and closes', async () => {
    const splash = stubApi();
    useShell.setState({ snapshot: sampleSnapshot() });
    render(<PageMenu />);

    const row = openMenu('c');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pin Page' }));
    expect(splash.setPinned).toHaveBeenCalledWith('c', true);
    expect(document.activeElement).toBe(row);
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(usePageMenu.getState().menu).toBeNull();
  });

  it('moves through items from the keyboard and closes on Escape', async () => {
    stubApi();
    useShell.setState({ snapshot: sampleSnapshot() });
    render(<PageMenu />);

    const row = openMenu('c', true);
    const menu = screen.getByRole('menu');
    expect(document.activeElement?.getAttribute('data-label')).toBe(
      'New Child Page',
    );
    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement?.getAttribute('data-label')).toBe(
      'Duplicate',
    );
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement?.getAttribute('data-label')).toBe(
      'Close Page',
    );
    fireEvent.keyDown(menu, { key: 'r' });
    expect(document.activeElement?.getAttribute('data-label')).toBe('Rename…');
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(document.activeElement).toBe(row);
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(usePageMenu.getState().menu).toBeNull();
  });

  it('moves a page to another workspace through the submenu', () => {
    const splash = stubApi();
    const snapshot = sampleSnapshot();
    snapshot.workspaces.push({
      id: 'w2',
      name: 'Work',
      pageCount: 0,
      appearance: DEFAULT_APPEARANCE,
    });
    useShell.setState({ snapshot });
    render(<PageMenu />);

    openMenu('c');
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Move to Workspace' }),
    );
    expect(
      screen.getByRole('menu', { name: 'Move to Workspace' }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Work' }));
    expect(splash.movePageToWorkspace).toHaveBeenCalledWith('c', 'w2');
  });

  it.each([false, true])(
    'dismisses on Tab and restores row focus (shift: %s)',
    async (shiftKey) => {
      stubApi();
      useShell.setState({ snapshot: sampleSnapshot() });
      render(<PageMenu />);

      const row = openMenu('c', true);
      fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey });

      expect(document.activeElement).toBe(row);
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
      expect(screen.queryByRole('menu')).toBeNull();
    },
  );

  it('closes when the pointer goes down elsewhere', async () => {
    stubApi();
    useShell.setState({ snapshot: sampleSnapshot() });
    render(<PageMenu />);

    openMenu('c');
    fireEvent.pointerDown(document.body);
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
