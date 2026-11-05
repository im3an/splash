// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import type { SplashApi } from '../../shared/api';
import {
  DEFAULT_PREFERENCES,
  type Preferences,
  type SavedCollection,
} from '../../shared/preferences';
import { useBookmarksView } from '../stores/bookmarks-view-store';
import { useShell } from '../stores/shell-store';
import { useToast } from '../stores/toast-store';
import { BookmarksPanel } from './BookmarksPanel';

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const link = (n: number, title: string) => ({
  id: uuid(n),
  title,
  url: `https://${title.toLowerCase()}.test/`,
});

const library: SavedCollection[] = [
  {
    id: uuid(100),
    name: 'Bookmarks',
    kind: 'folder',
    parentId: null,
    collapsed: false,
    links: [link(1, 'Alpha'), link(2, 'Beta')],
  },
  {
    id: uuid(101),
    name: 'Work',
    kind: 'folder',
    parentId: null,
    collapsed: false,
    links: [link(3, 'Gamma')],
  },
];

function setup(collections = library) {
  let preferences: Preferences = {
    ...structuredClone(DEFAULT_PREFERENCES),
    collections,
  };
  useShell.setState({ preferences });
  useBookmarksView.setState({ query: '', activeId: null });
  useToast.setState({ toast: null });
  const createPage = vi.fn(async () => 'page');
  window.splash = {
    createPage,
    getPreferences: async () => preferences,
    updatePreferences: async (patch: Partial<Preferences>) => {
      preferences = { ...preferences, ...patch };
      useShell.setState({ preferences });
      return preferences;
    },
  } as unknown as SplashApi;
  render(<BookmarksPanel />);
  return { createPage, read: () => preferences.collections };
}

const row = (name: string) =>
  screen.getByText(name).closest<HTMLElement>('[role="option"]')!;
const settle = () =>
  act(async () => void (await new Promise((r) => setTimeout(r))));

beforeAll(() => {
  Element.prototype.scrollIntoView = () => undefined;
});
afterEach(cleanup);

describe('BookmarksPanel', () => {
  it('lists folders first, and opens a link on click without selecting', async () => {
    const { createPage } = setup();
    const names = screen
      .getAllByRole('option')
      .map((option) => option.querySelector('.truncate')?.textContent);
    expect(names).toEqual(['Work', 'Gamma', 'Alpha', 'Beta']);
    fireEvent.click(row('Alpha'));
    await settle();
    expect(createPage).toHaveBeenCalledWith('https://alpha.test/');
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('selects with the box, then clicks select rather than open', async () => {
    const { createPage } = setup();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha' }));
    expect(screen.getByRole('toolbar').textContent).toContain(
      '1 bookmark selected',
    );
    fireEvent.click(row('Beta'));
    await settle();
    expect(createPage).not.toHaveBeenCalled();
    expect(screen.getByRole('toolbar').textContent).toContain(
      '2 bookmarks selected',
    );
  });

  it('selects a range with Shift', () => {
    setup();
    fireEvent.click(row('Gamma'), { metaKey: true });
    fireEvent.click(row('Beta'), { shiftKey: true });
    expect(row('Alpha').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('toolbar').textContent).toContain(
      '3 bookmarks selected',
    );
  });

  it('deletes a selection, with Undo', async () => {
    const { read } = setup();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Gamma' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await settle();
    expect(
      read()
        .flatMap((item) => item.links)
        .map((l) => l.title),
    ).toEqual(['Beta']);
    const toast = useToast.getState().toast!;
    expect(toast.message).toBe('Deleted 2 bookmarks');
    toast.actions[0]!.run();
    await settle();
    expect(read()).toEqual(library);
  });

  it('forgets a selection that search has hidden', () => {
    setup();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Alpha' }));
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search bookmarks' }),
      {
        target: { value: 'beta' },
      },
    );
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });

  it('says when nothing matches, and offers a way back', () => {
    setup();
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search bookmarks' }),
      {
        target: { value: 'zzz' },
      },
    );
    expect(screen.getByText('No matching bookmarks')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('has an empty state that says how to start', () => {
    setup([]);
    expect(screen.getByText('Keep the pages you return to')).toBeTruthy();
  });

  it('keeps the old folder name when the new one is empty', async () => {
    const { read } = setup();
    const list = screen.getByRole('listbox');
    fireEvent.click(row('Work'), { metaKey: true });
    fireEvent.keyDown(list, { key: 'Escape' });
    fireEvent.keyDown(list, { key: 'F2' });
    const field = screen.getByRole('textbox', { name: 'Folder name' });
    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await settle();
    expect(read()[1]!.name).toBe('Work');
  });

  it('takes the keyboard from search down into the list', () => {
    setup();
    const search = screen.getByRole('textbox', { name: 'Search bookmarks' });
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(row('Work').dataset.active).toBe('true');
    const list = screen.getByRole('listbox');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(row('Gamma').dataset.active).toBe('true');
    fireEvent.keyDown(list, { key: ' ' });
    expect(row('Gamma').getAttribute('aria-selected')).toBe('true');
  });
});
