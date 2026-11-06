// @vitest-environment jsdom
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { SplashApi } from '../../shared/api';
import type { ClosedSummary, HistoryEntry } from '../../shared/types';
import { useShell } from '../stores/shell-store';
import { useHistoryView } from '../stores/history-view-store';
import { HistoryPanel } from './HistoryPanel';

const entry: HistoryEntry = {
  url: 'https://example.com/design',
  title: 'Design notes',
  lastVisitedAt: Date.now(),
  visitCount: 1,
};
function stubApi() {
  const splash = {
    listHistory: vi.fn(
      async (_query: string, _limit: number): Promise<HistoryEntry[]> => [
        entry,
      ],
    ),
    deleteHistoryEntry: vi.fn(async () => undefined),
    restoreHistoryEntry: vi.fn(async () => undefined),
    recentlyClosed: vi.fn(async (): Promise<ClosedSummary[]> => []),
  };
  window.splash = splash as unknown as SplashApi;
  return splash;
}
beforeEach(() => {
  useHistoryView.setState({
    query: '',
    selected: 0,
    scrollTop: 0,
    removed: null,
  });
  useShell.setState({ snapshot: null });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

it('shows loading, then offers a retry when history cannot be read', async () => {
  const splash = stubApi();
  splash.listHistory.mockRejectedValueOnce(new Error('unavailable'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  render(<HistoryPanel />);
  expect(screen.getByRole('status', { name: 'Loading history' })).toBeTruthy();
  expect(await screen.findByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('option')).toBeTruthy();
  expect(splash.listHistory).toHaveBeenCalledTimes(2);
});

it('offers a way out of an empty search', async () => {
  const splash = stubApi();
  splash.listHistory.mockImplementation(async (query) =>
    query ? [] : [entry],
  );
  render(<HistoryPanel />);
  await screen.findByRole('option');
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: 'missing' },
  });
  expect(await screen.findByText('No matching pages')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
  expect(await screen.findByRole('option')).toBeTruthy();
  expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('');
});

it('keeps an entry visible if removing it fails', async () => {
  const splash = stubApi();
  splash.deleteHistoryEntry.mockRejectedValueOnce(new Error('locked'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  render(<HistoryPanel />);
  await screen.findByRole('option');
  fireEvent.click(screen.getByRole('button', { name: /Remove Design notes/ }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByRole('option')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
});

it('preserves the Undo action when restoring fails', async () => {
  const splash = stubApi();
  splash.restoreHistoryEntry.mockRejectedValueOnce(new Error('locked'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  render(<HistoryPanel />);
  await screen.findByRole('option');
  fireEvent.click(screen.getByRole('button', { name: /Remove Design notes/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  expect(splash.restoreHistoryEntry).toHaveBeenCalledWith(entry);
});

it('shows saved icons with no open pages and shares them with older visits on the same site', async () => {
  const splash = stubApi();
  splash.listHistory.mockResolvedValue([
    { ...entry, faviconUrl: 'https://example.com/icon.png' },
    { ...entry, url: 'https://example.com/older', title: 'Older visit' },
  ]);
  const { container } = render(<HistoryPanel />);
  await screen.findByText('Older visit');
  expect(
    [...container.querySelectorAll('img')].map((image) =>
      image.getAttribute('src'),
    ),
  ).toEqual(['https://example.com/icon.png', 'https://example.com/icon.png']);
});

it('preserves the search when leaving and returning to history', async () => {
  const splash = stubApi();
  const first = render(<HistoryPanel />);
  await screen.findByRole('option');
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: 'design' },
  });
  await waitFor(() =>
    expect(splash.listHistory).toHaveBeenCalledWith('design', 300),
  );
  first.unmount();
  render(<HistoryPanel />);
  expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe(
    'design',
  );
  await screen.findByRole('option');
});

describe('recently closed', () => {
  const closedPage: ClosedSummary = {
    kind: 'pages',
    label: 'Design notes',
    pageCount: 1,
    serial: 7,
    url: 'https://example.com/design',
    faviconUrl: null,
  };
  const closedBranch: ClosedSummary = {
    kind: 'pages',
    label: 'Atlas',
    pageCount: 3,
    serial: 6,
    url: 'https://atlas.example/',
  };
  const closedWorkspace: ClosedSummary = {
    kind: 'workspace',
    label: 'Home',
    pageCount: 2,
    serial: 5,
  };
  function stubClosed(list: ClosedSummary[]) {
    const reopenClosedItem = vi.fn(async (_serial: number) => 'page-1');
    const recentlyClosed = vi.fn(async () => list);
    const splash = stubApi();
    window.splash = {
      ...splash,
      recentlyClosed,
      reopenClosedItem,
      focusPage: vi.fn(),
    } as unknown as SplashApi;
    return { recentlyClosed, reopenClosedItem };
  }

  it('lists what can come back, saying what each one is', async () => {
    stubClosed([closedPage, closedBranch, closedWorkspace]);
    render(<HistoryPanel />);
    const list = await screen.findByRole('group', { name: 'Recently closed' });
    const rows = within(list).getAllByRole('option');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Design notesexample.com/design',
      'Atlasatlas.example and 2 more',
      'HomeWorkspace with 2 pages',
    ]);
  });

  it('reopens the row clicked, and drops it from the list', async () => {
    const { reopenClosedItem, recentlyClosed } = stubClosed([
      closedPage,
      closedBranch,
    ]);
    render(<HistoryPanel />);
    const row = await screen.findByRole('option', { name: /Atlas/ });
    recentlyClosed.mockResolvedValue([closedPage]);
    fireEvent.click(row);
    await waitFor(() => expect(reopenClosedItem).toHaveBeenCalledWith(6));
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: /Atlas/ })).toBeNull(),
    );
  });

  it('reaches closed rows and history with the arrow keys and Enter', async () => {
    const { reopenClosedItem } = stubClosed([closedBranch]);
    render(<HistoryPanel />);
    await screen.findByRole('option', { name: /Atlas/ });
    const history = await screen.findByText('example.com/design');
    const field = screen.getByRole('combobox', { name: 'Search history' });
    expect(history).toBeTruthy();
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(reopenClosedItem).toHaveBeenCalledWith(6));
  });

  it('is only there before searching, and when nothing is closed it is gone', async () => {
    stubClosed([closedPage]);
    const { unmount } = render(<HistoryPanel />);
    await screen.findByRole('group', { name: 'Recently closed' });
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'design' },
    });
    await waitFor(() =>
      expect(
        screen.queryByRole('group', { name: 'Recently closed' }),
      ).toBeNull(),
    );
    unmount();

    useHistoryView.setState({ query: '' });
    stubClosed([]);
    render(<HistoryPanel />);
    await screen.findByRole('option');
    expect(screen.queryByRole('group', { name: 'Recently closed' })).toBeNull();
  });

  it('says so when a closed page cannot come back', async () => {
    const { reopenClosedItem } = stubClosed([closedPage]);
    reopenClosedItem.mockResolvedValueOnce(null as never);
    render(<HistoryPanel />);
    const list = await screen.findByRole('group', { name: 'Recently closed' });
    fireEvent.click(within(list).getByRole('option'));
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /Couldn’t reopen/,
    );
  });
});
