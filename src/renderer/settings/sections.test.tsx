// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import type { SplashApi } from '../../shared/api';
import { DEFAULT_PREFERENCES } from '../../shared/preferences';
import { useShell } from '../stores/shell-store';
import { PrivacySettings } from './sections';

function stubApi() {
  const splash = {
    listSiteSettings: vi.fn(async () => []),
    listCookies: vi.fn(async () => []),
    getThreatListStatus: vi.fn(async () => ({
      state: 'ready' as const,
      updatedAt: Date.now(),
      updateFailed: false,
      count: 1000,
    })),
    contentBlockingStatus: vi.fn(async () => ({
      state: 'ready' as const,
      updatedAt: Date.now(),
      updateFailed: false,
    })),
    updateFilterLists: vi.fn(async () => ({
      state: 'ready' as const,
      updatedAt: Date.now(),
      updateFailed: true,
    })),
    updatePreferences: vi.fn(async () => DEFAULT_PREFERENCES),
    clearBrowsingData: vi.fn(async () => ({
      summary: 'History cleared.',
      undoToken: 'undo-1',
    })),
    undoClearBrowsingData: vi.fn(async () => true),
  };
  window.splash = splash as unknown as SplashApi;
  return splash;
}

describe('PrivacySettings', () => {
  beforeEach(() => {
    useShell.setState({ preferences: DEFAULT_PREFERENCES });
  });

  it('turns ad blocking off and shows how fresh the lists are', async () => {
    const splash = stubApi();
    render(<PrivacySettings />);
    expect(
      await screen.findByText(
        /Updated today\. Splash updates them every week\./,
      ),
    ).toBeTruthy();

    const toggle = screen.getByRole('switch', {
      name: 'Block ads and trackers',
    });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(splash.updatePreferences).toHaveBeenCalledWith({ blockAds: false });
  });

  it('turns hiding cookie notices off', async () => {
    const splash = stubApi();
    render(<PrivacySettings />);
    const toggle = await screen.findByRole('switch', {
      name: 'Hide cookie notices',
    });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(splash.updatePreferences).toHaveBeenCalledWith({
      hideCookieNotices: false,
    });
  });

  it('says when updating the lists failed', async () => {
    const splash = stubApi();
    render(<PrivacySettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Update now' }));
    expect(splash.updateFilterLists).toHaveBeenCalledOnce();
    expect(
      await screen.findByText(/Couldn’t download newer lists/),
    ).toBeTruthy();
  });
});

it('shows a recoverable error when clearing data fails', async () => {
  const splash = stubApi();
  splash.clearBrowsingData.mockRejectedValueOnce(new Error('unavailable'));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  useShell.setState({ preferences: DEFAULT_PREFERENCES });
  render(<PrivacySettings />);
  fireEvent.click(screen.getByRole('button', { name: 'Clear data' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(
    (screen.getByRole('button', { name: 'Clear data' }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  warn.mockRestore();
});

it('keeps the undo offer when restoring cleared history fails', async () => {
  const splash = stubApi();
  splash.undoClearBrowsingData.mockRejectedValueOnce(new Error('unavailable'));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  useShell.setState({ preferences: DEFAULT_PREFERENCES });
  render(<PrivacySettings />);
  fireEvent.click(screen.getByRole('button', { name: 'Clear data' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
  warn.mockRestore();
});
