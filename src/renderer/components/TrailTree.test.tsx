// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { SplashApi } from '../../shared/api';
import { useShell } from '../stores/shell-store';
import { sampleSnapshot } from '../test-fixtures';
import { TrailTree } from './TrailTree';

function stubApi() {
  const splash = {
    activatePage: vi.fn(async () => undefined),
    closePage: vi.fn(async () => undefined),
    setCollapsed: vi.fn(async () => undefined),
  };
  window.splash = splash as unknown as SplashApi;
  return splash;
}

beforeEach(() => {
  useShell.setState({ snapshot: null });
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
      useShell
        .getState()
        .receiveSnapshot({ pages: {}, rootIds: [], activePageId: null }),
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

  it('routes row interactions to the browser API', () => {
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
});
