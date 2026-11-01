// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { SplashApi } from '../../shared/api';
import {
  DEFAULT_PREFERENCES,
  type SavedCollection,
} from '../../shared/preferences';
import { useShell } from '../stores/shell-store';
import { sampleSnapshot } from '../test-fixtures';
import { BookmarkLibrary } from './BookmarkLibrary';
const folder: SavedCollection = {
  id: crypto.randomUUID(),
  name: 'Research',
  kind: 'folder',
  collapsed: false,
  links: [],
};
const child: SavedCollection = {
  id: crypto.randomUUID(),
  name: 'Design',
  parentId: folder.id,
  kind: 'folder',
  collapsed: false,
  links: [{ id: crypto.randomUUID(), title: 'A', url: 'https://a.example/' }],
};
function setup(items: SavedCollection[] = []) {
  let preferences = {
    ...DEFAULT_PREFERENCES,
    collections: structuredClone(items),
  };
  const methods = {
    getPreferences: vi.fn(async () => preferences),
    updatePreferences: vi.fn(async (patch) => {
      preferences = { ...preferences, ...patch };
      useShell.setState({ preferences });
      return preferences;
    }),
    createPage: vi.fn(async () => 'root'),
    createChildPage: vi.fn(async () => 'child'),
    navigate: vi.fn(async () => undefined),
    activatePage: vi.fn(async () => undefined),
    closePage: vi.fn(async () => undefined),
  };
  window.splash = methods as unknown as SplashApi;
  useShell.setState({ preferences, snapshot: sampleSnapshot() });
  return methods;
}
afterEach(cleanup);
it('renders nested folders and collapses their entire branch', async () => {
  setup([folder, child]);
  render(<BookmarkLibrary />);
  expect(screen.getByRole('button', { name: 'A' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Research, 1 items' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'A' })).toBeNull(),
  );
});
it('keeps the entered name on failure and retries without duplicate saves', async () => {
  const methods = setup();
  methods.updatePreferences.mockRejectedValueOnce(new Error('Disk full'));
  render(<BookmarkLibrary />);
  fireEvent.click(screen.getByRole('button', { name: 'New bookmark folder' }));
  fireEvent.change(
    screen.getByRole('textbox', { name: 'New bookmark folder' }),
    {
      target: { value: 'Reading' },
    },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain(
      'Your name is kept',
    ),
  );
  expect(
    (
      screen.getByRole('textbox', {
        name: 'New bookmark folder',
      }) as HTMLInputElement
    ).value,
  ).toBe('Reading');
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Reading, 0 items' }),
    ).toBeTruthy(),
  );
  expect(methods.updatePreferences).toHaveBeenCalledTimes(2);
});
it('selects an existing page when opening its bookmark', async () => {
  const methods = setup([folder, child]);
  render(<BookmarkLibrary />);
  fireEvent.click(screen.getByRole('button', { name: 'A' }));
  await waitFor(() => expect(methods.activatePage).toHaveBeenCalledWith('a'));
  expect(methods.createPage).not.toHaveBeenCalled();
});
it('offers retry for only unfinished pages after a partial group failure', async () => {
  const methods = setup([
    {
      ...folder,
      kind: 'group',
      links: [
        child.links[0]!,
        { id: crypto.randomUUID(), title: 'B', url: 'https://b.example/' },
      ],
    },
  ]);
  methods.createChildPage.mockRejectedValueOnce(new Error('Offline'));
  render(<BookmarkLibrary />);
  fireEvent.click(screen.getByRole('button', { name: 'Actions for Research' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Open All (2)' }));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('1 remaining'),
  );
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Retry remaining' }));
  });
  await waitFor(() => expect(methods.createChildPage).toHaveBeenCalledTimes(2));
  expect(methods.createPage).toHaveBeenCalledTimes(1);
  expect(methods.createChildPage).toHaveBeenLastCalledWith(
    'root',
    'https://b.example/',
  );
  expect(methods.navigate).not.toHaveBeenCalled();
});

it('shows default bookmarks directly without a duplicate folder, even if stored collapsed', () => {
  setup([
    { ...folder, name: 'Bookmarks', collapsed: true, links: child.links },
  ]);
  render(<BookmarkLibrary />);
  expect(screen.getByRole('button', { name: 'A' })).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'Bookmarks, 1 items' }),
  ).toBeNull();
  expect(screen.getAllByText('Bookmarks')).toHaveLength(1);
});
