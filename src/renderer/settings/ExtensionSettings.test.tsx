// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { SplashApi } from '../../shared/api';
import type { ExtensionInfo } from '../../shared/types';
import { ExtensionSettings } from './ExtensionSettings';

const darkReader: ExtensionInfo = {
  id: 'eimadpbcbfnmbkopoojfekhnkhdbieeh',
  name: 'Dark Reader',
  version: '4.9',
  description: 'Dark mode for every website.',
  source: 'store',
  enabled: true,
  iconUrl: null,
  optionsUrl: null,
  storeUrl:
    'https://chromewebstore.google.com/detail/eimadpbcbfnmbkopoojfekhnkhdbieeh',
  warnings: ['Read and change everything on every site you visit'],
};
const ublock: ExtensionInfo = {
  ...darkReader,
  id: 'gkhbpiofobmhlhbjkebcaacpihjdknji',
  name: 'uBlock Origin',
  source: 'bundled',
  optionsUrl: 'chrome-extension://gkhbpiofobmhlhbjkebcaacpihjdknji/dash.html',
  storeUrl: null,
};

function setup(list: ExtensionInfo[] = [darkReader, ublock]) {
  let push: (next: ExtensionInfo[]) => void = () => {};
  const splash = {
    listExtensions: vi.fn(async () => list),
    onExtensions: vi.fn((listener: (next: ExtensionInfo[]) => void) => {
      push = listener;
      return () => {};
    }),
    setExtensionEnabled: vi.fn(async () => undefined),
    removeExtension: vi.fn(async () => undefined),
    openWebStore: vi.fn(async () => undefined),
    openExtensionPage: vi.fn(async () => undefined),
    loadUnpackedExtension: vi.fn(async (): Promise<string | null> => null),
  };
  window.splash = splash as unknown as SplashApi;
  render(<ExtensionSettings />);
  return { splash, push: (next: ExtensionInfo[]) => act(() => push(next)) };
}

describe('ExtensionSettings', () => {
  it('lists what’s installed, and where it came from', async () => {
    setup();
    expect(await screen.findByText('Dark Reader')).toBeTruthy();
    expect(screen.getByText('uBlock Origin')).toBeTruthy();
    expect(screen.getByText('Chrome Web Store')).toBeTruthy();
    expect(screen.getByText('Comes with Splash')).toBeTruthy();
  });

  it('shows what an extension can reach when asked', async () => {
    setup([darkReader]);
    await screen.findByText('Dark Reader');
    expect(screen.queryByText(/every site you visit/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'What it can do' }));
    expect(screen.getByText(/every site you visit/)).toBeTruthy();
  });

  it('turns an extension off', async () => {
    const { splash } = setup([darkReader]);
    await screen.findByText('Dark Reader');
    fireEvent.click(
      screen.getByRole('switch', { name: 'Turn on Dark Reader' }),
    );
    expect(splash.setExtensionEnabled).toHaveBeenCalledWith(
      darkReader.id,
      false,
    );
  });

  it('asks before removing, and offers the way back after', async () => {
    const { splash } = setup([darkReader]);
    await screen.findByText('Dark Reader');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Dark Reader' }));
    expect(splash.removeExtension).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(splash.removeExtension).toHaveBeenCalledWith(darkReader.id);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Get it again' }),
    );
    expect(splash.openExtensionPage).toHaveBeenCalledWith(darkReader.storeUrl);
  });

  it('can cancel a removal', async () => {
    const { splash } = setup([darkReader]);
    await screen.findByText('Dark Reader');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Dark Reader' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(splash.removeExtension).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Remove Dark Reader' }),
    ).toBeTruthy();
  });

  it('won’t offer to remove what comes with Splash', async () => {
    setup([ublock]);
    await screen.findByText('uBlock Origin');
    expect(screen.queryByRole('button', { name: /^Remove/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Options' })).toBeTruthy();
  });

  it('follows changes made elsewhere, like an Add in the store', async () => {
    const { push } = setup([ublock]);
    await screen.findByText('uBlock Origin');
    push([darkReader, ublock]);
    expect(screen.getByText('Dark Reader')).toBeTruthy();
  });

  it('shows why a folder wouldn’t load', async () => {
    const { splash } = setup([ublock]);
    splash.loadUnpackedExtension.mockResolvedValue('Manifest file is missing.');
    await screen.findByText('uBlock Origin');
    fireEvent.click(screen.getByRole('button', { name: /Load from folder/ }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Manifest file is missing.',
    );
  });

  it('says when something fails', async () => {
    const { splash } = setup([darkReader]);
    splash.removeExtension.mockRejectedValue(new Error('disk'));
    await screen.findByText('Dark Reader');
    fireEvent.click(screen.getByRole('button', { name: 'Remove Dark Reader' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Dark Reader couldn’t be removed.',
    );
  });
});
