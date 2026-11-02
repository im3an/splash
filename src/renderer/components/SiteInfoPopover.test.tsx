// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import type { SplashApi } from '../../shared/api';
import type { SiteInfo } from '../../shared/types';
import { useShell } from '../stores/shell-store';
import { sampleSnapshot } from '../test-fixtures';
import { SiteInfoPopover } from './SiteInfoPopover';

const info: SiteInfo = {
  origin: 'https://a.example',
  host: 'a.example',
  security: 'secure',
  blockedCount: 0,
  permissions: [{ permission: 'camera', label: 'Camera', decision: 'ask' }],
};
function stubApi() {
  const splash = {
    getSiteInfo: vi.fn(async () => info),
    setSitePermission: vi.fn(async () => undefined),
  };
  window.splash = splash as unknown as SplashApi;
  useShell.setState({ snapshot: sampleSnapshot() });
  return splash;
}
afterEach(() => vi.restoreAllMocks());

it('recovers from a failed load', async () => {
  const splash = stubApi();
  splash.getSiteInfo.mockRejectedValueOnce(new Error('unavailable'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  render(<SiteInfoPopover />);
  expect(await screen.findByRole('alert')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(
    await screen.findByRole('radiogroup', { name: 'Camera' }),
  ).toBeTruthy();
  expect(
    screen.getByText('Your connection to this site is encrypted.'),
  ).toBeTruthy();
});

it('retains the existing choice and reports a failed permission change', async () => {
  const splash = stubApi();
  splash.setSitePermission.mockRejectedValueOnce(new Error('locked'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  render(<SiteInfoPopover />);
  fireEvent.click(await screen.findByRole('radio', { name: 'Block' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(
    screen.getByRole('radio', { name: 'Ask' }).getAttribute('aria-checked'),
  ).toBe('true');
  expect(screen.queryByRole('button', { name: 'Reload to apply' })).toBeNull();
});
