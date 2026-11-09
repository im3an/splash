// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import type { SplashApi } from '../../shared/api';
import type { HistoryEntry, PageId } from '../../shared/types';
import { useShell } from '../stores/shell-store';
import { StartPage } from './StartPage';

const PAGE = 'p1' as PageId;

function stubHistory(entries: Promise<HistoryEntry[]>) {
  window.splash = {
    listHistory: vi.fn(() => entries),
  } as unknown as SplashApi;
}

beforeEach(() => {
  useShell.setState({ snapshot: null, preferences: null });
});
afterEach(() => vi.restoreAllMocks());

it('explains trails on a first run, when there is nothing to show yet', async () => {
  stubHistory(Promise.resolve([]));
  render(<StartPage pageId={PAGE} />);
  expect(
    await screen.findByRole('heading', { name: 'Welcome to Splash' }),
  ).toBeTruthy();
  const steps = screen.getAllByRole('listitem').map((item) => item.textContent);
  expect(steps).toHaveLength(3);
  expect(steps[0]).toMatch(/beneath the page it came from/);
  expect(steps[1]).toMatch(/⌘T/);
  expect(steps[2]).toMatch(/⌘K/);
  expect(
    screen.getByText(/bookmarks, pinned pages and recent pages/),
  ).toBeTruthy();
});

it('says nothing about trails once there are recent pages', async () => {
  stubHistory(
    Promise.resolve([
      {
        url: 'https://example.com/',
        title: 'Example',
        visitCount: 1,
        lastVisitedAt: 1,
      },
    ]),
  );
  render(<StartPage pageId={PAGE} />);
  expect(await screen.findByText('Example')).toBeTruthy();
  expect(
    screen.queryByRole('heading', { name: 'Welcome to Splash' }),
  ).toBeNull();
});

it('doesn’t flash the welcome while history is still loading', () => {
  stubHistory(new Promise(() => undefined));
  render(<StartPage pageId={PAGE} />);
  expect(
    screen.queryByRole('heading', { name: 'Welcome to Splash' }),
  ).toBeNull();
});
