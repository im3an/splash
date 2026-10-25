// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import type { SplashApi } from '../../shared/api';
import { DEFAULT_PREFERENCES } from '../../shared/preferences';
import { useShell } from '../stores/shell-store';
import { PrivacySettings } from './sections';

function stubApi() {
  const splash = {
    listSiteSettings: vi.fn(async () => []),
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
