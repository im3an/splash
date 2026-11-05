// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { SplashApi } from '../../shared/api';
import { useShell } from '../stores/shell-store';
import { page, sampleSnapshot } from '../test-fixtures';
import { TrailTree } from './TrailTree';
import { useGroupRename } from './SavedGroups';

/** Pages b and c are filed in "Weekend cooking"; a and e stay loose. */
function show(collapsed: boolean) {
  const splash = {
    activatePage: vi.fn(async () => undefined),
    setGroupCollapsed: vi.fn(async () => undefined),
    renameGroup: vi.fn(async () => undefined),
    setOverlayActive: vi.fn(),
  };
  window.splash = splash as unknown as SplashApi;
  const base = sampleSnapshot();
  const pages = {
    b: page('b', { title: 'Pumpkin bread', groupId: 'cooking' }),
    c: page('c', { title: 'Butternut squash', groupId: 'cooking' }),
    a: page('a', { title: 'Inbox' }),
    e: page('e', { title: 'Weather' }),
  };
  useShell.setState({
    snapshot: {
      ...base,
      pages: pages,
      rootIds: ['b', 'c', 'a', 'e'],
      activePageId: 'a',
      groups: [{ id: 'cooking', name: 'Weekend cooking', collapsed }],
    },
  });
  render(<TrailTree />);
  return splash;
}

const header = () =>
  screen.getByRole('button', { name: /^Weekend cooking, Group/ });

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => useGroupRename.setState({ id: null }));

describe('trail groups', () => {
  it('lists an open group’s pages in its card, apart from the others', () => {
    show(false);
    expect(header().getAttribute('aria-expanded')).toBe('true');
    const card = screen.getByRole('group', { name: 'Weekend cooking' });
    expect(card.textContent).toContain('Pumpkin bread');
    expect(card.textContent).toContain('Butternut squash');
    expect(card.textContent).not.toContain('Inbox');
    expect(screen.getByText('Weather')).toBeTruthy();
  });

  it('folds a collapsed group to its name and page count', () => {
    show(true);
    expect(header().getAttribute('aria-expanded')).toBe('false');
    expect(header().getAttribute('aria-label')).toContain('2 pages');
    expect(screen.queryByText('Pumpkin bread')).toBeNull();
  });

  it('asks the main process to fold it', async () => {
    const splash = show(false);
    await act(async () => {
      fireEvent.click(header(), { detail: 1 });
    });
    expect(splash.setGroupCollapsed).toHaveBeenCalledWith('cooking', true);
  });

  it('renames on a double-click without folding a second time', async () => {
    const splash = show(false);
    await act(async () => {
      fireEvent.click(header(), { detail: 1 });
      fireEvent.click(header(), { detail: 2 });
      fireEvent.doubleClick(header());
    });
    expect(splash.setGroupCollapsed).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('textbox', { name: 'Group name' })).toBeTruthy();
  });

  it('opens a page from the card like any other page', async () => {
    const splash = show(false);
    await act(async () => {
      fireEvent.click(screen.getByText('Pumpkin bread'));
    });
    expect(splash.activatePage).toHaveBeenCalledWith('b');
  });
});
