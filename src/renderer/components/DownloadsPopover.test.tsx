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
import { DEFAULT_PREFERENCES } from '../../shared/preferences';
import type { DownloadSummary } from '../../shared/types';
import { useDownloads } from '../stores/downloads-store';
import { useOverlay } from '../stores/overlay-store';
import { useShell } from '../stores/shell-store';
import { sampleSnapshot } from '../test-fixtures';
import { DownloadsButton } from './DownloadsButton';
import { DownloadsPanel } from './DownloadsPanel';
import { DownloadsPopover } from './DownloadsPopover';

function download(
  filename: string,
  patch: Partial<DownloadSummary> = {},
): DownloadSummary {
  return {
    id: filename,
    pageId: null,
    url: `https://files.example/${filename}`,
    filename,
    savePath: `/dl/${filename}`,
    state: 'completed',
    receivedBytes: 1000,
    totalBytes: 1000,
    bytesPerSecond: 0,
    startedAt: 0,
    problem: null,
    runnable: false,
    ...patch,
  };
}

function stubApi() {
  const splash = {
    freezePage: vi.fn(async () => ({})),
    setOverlayActive: vi.fn(),
    actOnDownload: vi.fn(async () => undefined),
    clearDownloads: vi.fn(async () => undefined),
    openDownloadsFolder: vi.fn(async () => undefined),
  };
  window.splash = splash as unknown as SplashApi;
  return splash;
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  );
  useShell.setState({
    preferences: DEFAULT_PREFERENCES,
    snapshot: sampleSnapshot(),
    sidebarOpen: true,
    sidebarPanel: null,
  });
  useOverlay.setState({ overlay: null, leaving: false, frozenPages: null });
  useDownloads.setState({
    downloads: [],
    unseenProblems: 0,
    unseenFinished: 0,
  });
});

afterEach(async () => {
  cleanup();
  // A close still on its way out would end the next test's overlay.
  useOverlay.getState().close();
  await waitFor(() => expect(useOverlay.getState().overlay).toBeNull());
  vi.unstubAllGlobals();
});

describe('DownloadsPanel', () => {
  const list = [
    download('report.pdf'),
    download('notes.txt'),
    download('photo.png'),
    download('movie.mp4', { state: 'progressing', receivedBytes: 500 }),
  ];
  const chip = (name: RegExp) => screen.getByRole('button', { name });
  const rows = () =>
    screen.getAllByRole('listitem').map((row) => row.textContent);

  it('offers the kinds of file present, with counts', () => {
    stubApi();
    useDownloads.setState({ downloads: list });
    render(<DownloadsPanel />);
    const group = screen.getByRole('group');
    expect(
      [...group.querySelectorAll('button')].map((b) => b.textContent),
    ).toEqual(['All4', 'Documents2', 'Images1', 'Video1']);
    expect(chip(/^All/).getAttribute('aria-pressed')).toBe('true');
  });

  it('has no chips with only one kind of file', () => {
    stubApi();
    useDownloads.setState({
      downloads: [download('a.pdf'), download('b.pdf')],
    });
    render(<DownloadsPanel />);
    expect(screen.queryByRole('group')).toBeNull();
    expect(rows()).toHaveLength(2);
  });

  it('narrows the list to the chosen kind', () => {
    stubApi();
    useDownloads.setState({ downloads: list });
    render(<DownloadsPanel />);
    fireEvent.click(chip(/^Documents/));
    expect(chip(/^Documents/).getAttribute('aria-pressed')).toBe('true');
    expect(rows()).toHaveLength(2);
    expect(screen.queryByText('photo.png')).toBeNull();
  });

  it('goes back to All when the chosen kind empties, and stays there', () => {
    stubApi();
    useDownloads.setState({ downloads: list });
    render(<DownloadsPanel />);
    fireEvent.click(chip(/^Images/));
    act(() =>
      useDownloads.setState({
        downloads: list.filter((d) => d.filename !== 'photo.png'),
      }),
    );
    expect(chip(/^All/).getAttribute('aria-pressed')).toBe('true');
    expect(rows()).toHaveLength(3);
    act(() => useDownloads.setState({ downloads: list }));
    expect(chip(/^All/).getAttribute('aria-pressed')).toBe('true');
  });

  it('clears only the finished rows on show while filtered', () => {
    const splash = stubApi();
    useDownloads.setState({ downloads: list });
    render(<DownloadsPanel />);
    fireEvent.click(chip(/^Documents/));
    fireEvent.click(screen.getByRole('button', { name: 'Clear finished' }));
    expect(splash.clearDownloads).not.toHaveBeenCalled();
    expect(splash.actOnDownload.mock.calls).toEqual([
      ['report.pdf', 'remove'],
      ['notes.txt', 'remove'],
    ]);
  });

  it('clears everything finished from All', () => {
    const splash = stubApi();
    useDownloads.setState({ downloads: list });
    render(<DownloadsPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear finished' }));
    expect(splash.clearDownloads).toHaveBeenCalledOnce();
    expect(splash.actOnDownload).not.toHaveBeenCalled();
  });

  it('offers no clearing where nothing shown has finished', () => {
    stubApi();
    useDownloads.setState({ downloads: list });
    render(<DownloadsPanel />);
    fireEvent.click(chip(/^Video/));
    expect(screen.queryByRole('button', { name: 'Clear finished' })).toBeNull();
  });
});

describe('DownloadRow progress', () => {
  it('shows speed and time left, and a bar with its value', () => {
    stubApi();
    useDownloads.setState({
      downloads: [
        download('movie.mp4', {
          state: 'progressing',
          receivedBytes: 1_000_000,
          totalBytes: 4_000_000,
          bytesPerSecond: 1_500_000,
        }),
      ],
    });
    render(<DownloadsPanel />);
    expect(
      screen.getByText('1.0 MB of 4.0 MB · 1.5 MB/s · 2 s left'),
    ).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe(
      '25',
    );
  });

  it('has no value to report for an unknown size', () => {
    stubApi();
    useDownloads.setState({
      downloads: [
        download('movie.mp4', {
          state: 'progressing',
          receivedBytes: 2000,
          totalBytes: 0,
        }),
      ],
    });
    render(<DownloadsPanel />);
    const bar = screen.getByRole('progressbar');
    expect(bar.hasAttribute('aria-valuenow')).toBe(false);
    expect(bar.hasAttribute('data-sweeping')).toBe(true);
    expect(screen.getByText('2.0 KB so far')).toBeTruthy();
  });

  it('has no bar once it has stopped', () => {
    stubApi();
    useDownloads.setState({ downloads: [download('report.pdf')] });
    render(<DownloadsPanel />);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});

describe('DownloadsPopover', () => {
  async function openPopover() {
    await act(() => useOverlay.getState().open({ kind: 'downloads' }));
    return render(<DownloadsPopover />);
  }
  const leaving = () => useOverlay.getState().leaving;

  it('leads with what is running, and sums it up', async () => {
    stubApi();
    useDownloads.setState({
      downloads: [
        download('done.pdf'),
        download('movie.mp4', {
          state: 'progressing',
          receivedBytes: 500,
          bytesPerSecond: 100,
        }),
      ],
    });
    await openPopover();
    const names = screen
      .getAllByRole('listitem')
      .map((row) => row.textContent ?? '');
    expect(names[0]).toContain('movie.mp4');
    expect(names[1]).toContain('done.pdf');
    expect(screen.getByText('1 in progress · 5 s left')).toBeTruthy();
  });

  it('has an empty state', async () => {
    stubApi();
    await openPopover();
    expect(screen.getByText('No downloads yet')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Show all downloads' }),
    ).toBeNull();
  });

  it('marks what it shows as seen', async () => {
    stubApi();
    useDownloads.setState({
      downloads: [download('done.pdf')],
      unseenFinished: 1,
      unseenProblems: 1,
    });
    await openPopover();
    expect(useDownloads.getState().unseenFinished).toBe(0);
    expect(useDownloads.getState().unseenProblems).toBe(0);
  });

  it('closes on Escape', async () => {
    stubApi();
    await openPopover();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(leaving()).toBe(true);
  });

  it('closes on a click outside, but not on one inside', async () => {
    stubApi();
    useDownloads.setState({ downloads: [download('done.pdf')] });
    await openPopover();
    fireEvent.mouseDown(screen.getByText('done.pdf'));
    expect(leaving()).toBe(false);
    fireEvent.mouseDown(document.body);
    expect(leaving()).toBe(true);
  });

  it('closes when the window loses focus', async () => {
    stubApi();
    await openPopover();
    fireEvent.blur(window);
    expect(leaving()).toBe(true);
  });

  it('hands over to the panel for the whole list', async () => {
    stubApi();
    useDownloads.setState({ downloads: [download('done.pdf')] });
    await openPopover();
    fireEvent.click(screen.getByRole('button', { name: 'Show all downloads' }));
    expect(leaving()).toBe(true);
    expect(useShell.getState().sidebarPanel).toBe('downloads');
    expect(useShell.getState().sidebarOpen).toBe(true);
  });

  it('lets the button close it, rather than closing and reopening', async () => {
    stubApi();
    useDownloads.setState({
      downloads: [download('a.pdf', { state: 'progressing' })],
    });
    render(<DownloadsButton />);
    const button = screen.getByRole('button');
    await act(async () => {
      fireEvent.click(button);
      await waitFor(() =>
        expect(useOverlay.getState().overlay?.kind).toBe('downloads'),
      );
    });
    render(<DownloadsPopover />);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    fireEvent.mouseDown(button);
    expect(leaving()).toBe(false);
    fireEvent.click(button);
    expect(leaving()).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('DownloadsButton', () => {
  const button = () => screen.queryByRole('button');

  it('stays away with nothing to follow while the sidebar lists them', () => {
    stubApi();
    useDownloads.setState({ downloads: [download('done.pdf')] });
    render(<DownloadsButton />);
    expect(button()).toBeNull();
  });

  it('comes up for a running or paused download with the sidebar open', () => {
    stubApi();
    useDownloads.setState({
      downloads: [download('a.pdf', { state: 'paused' })],
    });
    render(<DownloadsButton />);
    expect(button()?.getAttribute('aria-label')).toBe('Downloads: 1 paused');
  });

  it('stays after a file arrives, until it has been seen', () => {
    stubApi();
    useDownloads.setState({
      downloads: [download('a.pdf')],
      unseenFinished: 1,
    });
    render(<DownloadsButton />);
    expect(button()?.getAttribute('aria-label')).toBe('Downloads: finished');
    act(() => useDownloads.getState().markSeen());
    expect(button()).toBeNull();
  });

  it('stays while the sidebar is hidden, as the only way to the list', () => {
    stubApi();
    useShell.setState({ sidebarOpen: false });
    useDownloads.setState({ downloads: [download('done.pdf')] });
    render(<DownloadsButton />);
    expect(button()).not.toBeNull();
  });

  it('stays while its popover is open, though that marks all as seen', async () => {
    stubApi();
    useDownloads.setState({
      downloads: [download('a.pdf')],
      unseenFinished: 1,
    });
    render(<DownloadsButton />);
    await act(() => useOverlay.getState().open({ kind: 'downloads' }));
    act(() => useDownloads.getState().markSeen());
    expect(button()?.getAttribute('aria-expanded')).toBe('true');
  });

  it('is always there when pinned', () => {
    stubApi();
    render(<DownloadsButton always />);
    expect(button()).not.toBeNull();
  });

  it('puts the panel away when it is already showing', () => {
    stubApi();
    useShell.setState({ sidebarPanel: 'downloads' });
    render(<DownloadsButton always />);
    fireEvent.click(screen.getByRole('button'));
    expect(useShell.getState().sidebarPanel).toBeNull();
    expect(useOverlay.getState().overlay).toBeNull();
  });

  it('falls back to the panel if the page cannot be frozen', async () => {
    const splash = stubApi();
    splash.freezePage.mockRejectedValueOnce(new Error('no'));
    render(<DownloadsButton always />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(useShell.getState().sidebarPanel).toBe('downloads'),
    );
  });
});
