// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SplashApi } from '../../shared/api';
import type { HistoryEntry } from '../../shared/types';
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
