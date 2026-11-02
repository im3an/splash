// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { SplashApi } from '../../shared/api';
import { DEFAULT_PREFERENCES } from '../../shared/preferences';
import { useShell } from '../stores/shell-store';
import { SidebarResize } from './SidebarResize';
afterEach(cleanup);
it('supports bounded keyboard resizing and persists the result', async () => {
  const update = vi.fn(async (patch) => ({ ...DEFAULT_PREFERENCES, ...patch }));
  window.splash = { updatePreferences: update } as unknown as SplashApi;
  useShell.setState({ preferences: DEFAULT_PREFERENCES });
  render(<SidebarResize />);
  fireEvent.keyDown(screen.getByRole('separator'), { key: 'End' });
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith({ sidebarWidth: 420 }),
  );
  fireEvent.keyDown(screen.getByRole('separator'), { key: 'Home' });
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith({ sidebarWidth: 220 }),
  );
});
it('restores the saved width after a persistence failure', async () => {
  window.splash = {
    updatePreferences: vi.fn(async () => {
      throw new Error('Disk full');
    }),
  } as unknown as SplashApi;
  useShell.setState({ preferences: DEFAULT_PREFERENCES });
  render(<SidebarResize />);
  fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' });
  await waitFor(() =>
    expect(
      document.documentElement.style.getPropertyValue('--sidebar-width'),
    ).toBe('260px'),
  );
});
