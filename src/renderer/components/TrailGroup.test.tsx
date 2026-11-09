// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { SplashApi } from '../../shared/api';
import type { GroupIcon } from '../../shared/types';
import { useShell } from '../stores/shell-store';
import { page, sampleSnapshot } from '../test-fixtures';
import { TrailTree } from './TrailTree';
import { useGroupRename } from './SavedGroups';

/** Pages b and c are filed in "Weekend cooking"; a and e stay loose. */
function show(
  collapsed: boolean,
  icon?: GroupIcon,
  filed: string[] = ['b', 'c'],
) {
  const splash = {
    activatePage: vi.fn(async () => undefined),
    setGroupCollapsed: vi.fn(async () => undefined),
    renameGroup: vi.fn(async () => undefined),
    setGroupIcon: vi.fn(async () => undefined),
    deleteGroup: vi.fn(async () => undefined),
    deleteGroupWithPages: vi.fn(async () => undefined),
    setOverlayActive: vi.fn(),
  };
  window.splash = splash as unknown as SplashApi;
  const base = sampleSnapshot();
  const groupId = (id: string) => (filed.includes(id) ? 'cooking' : null);
  const pages = {
    b: page('b', { title: 'Pumpkin bread', groupId: groupId('b') }),
    c: page('c', { title: 'Butternut squash', groupId: groupId('c') }),
    a: page('a', { title: 'Inbox' }),
    e: page('e', { title: 'Weather' }),
  };
  useShell.setState({
    snapshot: {
      ...base,
      pages: pages,
      rootIds: ['b', 'c', 'a', 'e'],
      activePageId: 'a',
      groups: [
        {
          id: 'cooking',
          name: 'Weekend cooking',
          collapsed,
          ...(icon ? { icon } : {}),
        },
      ],
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

  describe('its icon', () => {
    const mark = () =>
      screen.getByRole('button', { name: 'Change icon for Weekend cooking' });

    it('changes from the mark without folding, and closes once picked', async () => {
      const splash = show(false);
      fireEvent.click(mark());
      expect(splash.setGroupCollapsed).not.toHaveBeenCalled();
      const folder = screen.getByRole('radio', { name: 'folder' });
      expect(folder.getAttribute('aria-checked')).toBe('true');
      await act(async () => {
        fireEvent.click(screen.getByRole('radio', { name: 'fox' }));
      });
      expect(splash.setGroupIcon).toHaveBeenCalledWith('cooking', {
        kind: 'emoji',
        value: '🦊',
      });
      await act(async () => {
        await new Promise((done) => setTimeout(done, 400));
      });
      expect(screen.queryByRole('radiogroup')).toBeNull();
      expect(mark().getAttribute('aria-expanded')).toBe('false');
    });

    it('goes back to the folder, and marks the current choice', async () => {
      const splash = show(false, { kind: 'emoji', value: '🐎' });
      expect(mark().textContent).toBe('🐎');
      fireEvent.click(mark());
      const horse = screen.getByRole('radio', { name: 'horse' });
      expect(horse.getAttribute('aria-checked')).toBe('true');
      expect(document.activeElement).toBe(horse);
      await act(async () => {
        fireEvent.click(screen.getByRole('radio', { name: 'folder' }));
      });
      expect(splash.setGroupIcon).toHaveBeenCalledWith('cooking', null);
    });

    it('stays usable when the saved emoji isn’t one of the choices', () => {
      show(false, { kind: 'emoji', value: '🦄' });
      expect(mark().textContent).toBe('🦄');
      fireEvent.click(mark());
      expect(document.activeElement).toBe(
        screen.getByRole('radio', { name: 'folder' }),
      );
    });

    it('moves through the grid by row and column, and closes on Escape', async () => {
      show(false);
      fireEvent.click(mark());
      const folder = screen.getByRole('radio', { name: 'folder' });
      expect(document.activeElement).toBe(folder);
      fireEvent.keyDown(folder, { key: 'ArrowRight' });
      expect(document.activeElement).toBe(
        screen.getByRole('radio', { name: 'star' }),
      );
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
      expect(
        (document.activeElement as HTMLElement).getAttribute('aria-label'),
      ).toBe('books');
      fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
      await act(async () => {
        await new Promise((done) => setTimeout(done, 400));
      });
      expect(screen.queryByRole('radiogroup')).toBeNull();
      expect(document.activeElement).toBe(mark());
    });
  });

  describe('its menu', () => {
    const open = () =>
      fireEvent.click(
        screen.getByRole('button', { name: 'Actions for Weekend cooking' }),
      );
    const item = (name: string | RegExp) =>
      screen.getByRole('menuitem', { name });

    it('deletes the group with its pages, or ungroups and keeps them', async () => {
      const splash = show(false);
      open();
      expect(item('Ungroup')).toBeTruthy();
      await act(async () => {
        fireEvent.click(item('Delete Group and 2 Pages'));
      });
      expect(splash.deleteGroupWithPages).toHaveBeenCalledWith('cooking');
      expect(splash.deleteGroup).not.toHaveBeenCalled();
    });

    it('only offers to delete a group with nothing in it', () => {
      show(false, undefined, []);
      open();
      expect(screen.queryByRole('menuitem', { name: 'Ungroup' })).toBeNull();
      expect(item('Delete Group')).toBeTruthy();
    });

    it('opens the icon picker', async () => {
      show(false);
      open();
      await act(async () => {
        fireEvent.click(item('Change Icon…'));
      });
      expect(
        screen.getByRole('radiogroup', { name: /^Icon for/ }),
      ).toBeTruthy();
    });
  });

  it('opens a page from the card like any other page', async () => {
    const splash = show(false);
    await act(async () => {
      fireEvent.click(screen.getByText('Pumpkin bread'));
    });
    expect(splash.activatePage).toHaveBeenCalledWith('b');
  });
});
