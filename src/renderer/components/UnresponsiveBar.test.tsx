// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { SplashApi } from '../../shared/api';
import { useShell } from '../stores/shell-store';
import { sampleSnapshot } from '../test-fixtures';
import { UnresponsiveBar } from './UnresponsiveBar';

function arrive(id: string, isUnresponsive: boolean) {
  const snapshot = sampleSnapshot({ [id]: { isUnresponsive } });
  act(() =>
    useShell.getState().receiveSnapshot({ ...snapshot, activePageId: id }),
  );
}

/** Closing, it stays in place while it slides shut, so look at what it's doing. */
const barIsOpen = () =>
  document.querySelector('.reveal')?.getAttribute('data-state') === 'open';

beforeEach(() => {
  window.splash = {
    reload: vi.fn(async () => undefined),
  } as unknown as SplashApi;
  useShell.setState({ snapshot: null });
  arrive('a', false);
  render(<UnresponsiveBar />);
});

describe('the bar for a page that stopped answering', () => {
  it('appears with the hang, and goes when the page answers', () => {
    expect(barIsOpen()).toBe(false);
    arrive('a', true);
    expect(barIsOpen()).toBe(true);
    arrive('a', false);
    expect(barIsOpen()).toBe(false);
  });

  it('reloads the page', () => {
    arrive('a', true);
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(window.splash.reload).toHaveBeenCalledWith('a');
  });

  it('stays away after Wait for as long as that hang lasts', () => {
    arrive('a', true);
    fireEvent.click(screen.getByRole('button', { name: 'Wait' }));
    expect(barIsOpen()).toBe(false);
    arrive('a', true);
    expect(barIsOpen()).toBe(false);
  });

  it('comes back when the same page hangs again later', () => {
    arrive('a', true);
    fireEvent.click(screen.getByRole('button', { name: 'Wait' }));
    arrive('a', false);
    arrive('a', true);
    expect(barIsOpen()).toBe(true);
  });

  it('keeps Wait while you look at another page and come back', () => {
    arrive('a', true);
    fireEvent.click(screen.getByRole('button', { name: 'Wait' }));
    act(() => {
      const snapshot = sampleSnapshot({ a: { isUnresponsive: true } });
      useShell.getState().receiveSnapshot({ ...snapshot, activePageId: 'b' });
    });
    expect(barIsOpen()).toBe(false);
    arrive('a', true);
    expect(barIsOpen()).toBe(false);
  });
});
