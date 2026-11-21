// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES } from '../../shared/preferences';
import { useOverlay } from '../stores/overlay-store';
import { useShell } from '../stores/shell-store';
import { useToast } from '../stores/toast-store';
import {
  endSidebarPeek,
  startSidebarPeek,
  useSidebarPeek,
} from './use-sidebar-peek';

function Harness() {
  useSidebarPeek();
  return null;
}

const splash = {
  freezePage: vi.fn(async () => ({})),
  setOverlayActive: vi.fn(),
  setWindowButtonsVisible: vi.fn(),
};

/** Lets an overlay finish opening or closing. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 4; i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
  });
}

async function peek() {
  act(() => startSidebarPeek());
  await settle();
}

const peeking = () => useShell.getState().sidebarPeek;
const overlayKind = () => useOverlay.getState().overlay?.kind ?? null;

function showToast() {
  act(() =>
    useToast.getState().show({
      message: 'Closed “Docs”.',
      detail: null,
      durationMs: 9000,
      actions: [{ label: 'Reopen', run: vi.fn() }],
    }),
  );
}

beforeEach(async () => {
  vi.clearAllMocks();
  Object.assign(window, { splash });
  useShell.setState({
    preferences: { ...DEFAULT_PREFERENCES, addressBar: 'sidebar' },
    sidebarOpen: false,
    sidebarPeek: false,
  });
  useToast.setState({ toast: null });
  render(<Harness />);
});

afterEach(async () => {
  cleanup();
  act(() => {
    useOverlay.getState().close();
    useToast.setState({ toast: null });
  });
  await settle();
  useOverlay.setState({ overlay: null, leaving: false, frozenPages: null });
  useShell.setState({
    preferences: null,
    sidebarOpen: true,
    sidebarPeek: false,
  });
});

describe('sidebar peek', () => {
  it('comes out over the frozen page from the left edge', async () => {
    await peek();
    expect(peeking()).toBe(true);
    expect(overlayKind()).toBe('sidebar-peek');
    expect(splash.setOverlayActive).toHaveBeenCalledWith(true);
  });

  it('hides the window buttons only while nothing is above the page', async () => {
    expect(splash.setWindowButtonsVisible).toHaveBeenLastCalledWith(false);
    await peek();
    expect(splash.setWindowButtonsVisible).toHaveBeenLastCalledWith(true);
    act(() => endSidebarPeek());
    await settle();
    expect(splash.setWindowButtonsVisible).toHaveBeenLastCalledWith(false);
  });

  it('stays in when the sidebar is open or the address bar is in the toolbar', async () => {
    act(() => useShell.setState({ sidebarOpen: true }));
    await peek();
    expect(peeking()).toBe(false);
    act(() =>
      useShell.setState({
        sidebarOpen: false,
        preferences: { ...DEFAULT_PREFERENCES, addressBar: 'toolbar' },
      }),
    );
    await peek();
    expect(peeking()).toBe(false);
    expect(overlayKind()).toBeNull();
  });

  it('waits for another overlay to go', async () => {
    await act(() =>
      useOverlay.getState().open({ kind: 'palette', scope: 'palette' }),
    );
    await peek();
    expect(peeking()).toBe(false);
    expect(overlayKind()).toBe('palette');
  });

  it('goes back in when it ends', async () => {
    await peek();
    act(() => endSidebarPeek());
    expect(peeking()).toBe(false);
    await settle();
    expect(overlayKind()).toBeNull();
    expect(splash.setOverlayActive).toHaveBeenLastCalledWith(false);
  });

  it('cancels an open still on its way', async () => {
    act(() => startSidebarPeek());
    act(() => endSidebarPeek());
    await settle();
    expect(peeking()).toBe(false);
    expect(overlayKind()).toBeNull();
    expect(splash.setOverlayActive).not.toHaveBeenCalledWith(true);
  });

  it('is kept by a menu opened from it, and goes with the menu', async () => {
    await peek();
    await act(() => useOverlay.getState().open({ kind: 'toolbar-menu' }));
    // The pointer left the sidebar for the menu.
    act(() => endSidebarPeek());
    expect(peeking()).toBe(true);
    act(() => useOverlay.getState().close());
    expect(peeking()).toBe(false);
  });

  it('goes back in on Escape', async () => {
    await peek();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(peeking()).toBe(false);
    await settle();
    expect(overlayKind()).toBeNull();
  });

  it('ends when the sidebar opens for real', async () => {
    await peek();
    act(() => useShell.getState().toggleSidebar());
    expect(peeking()).toBe(false);
    await settle();
    expect(overlayKind()).toBeNull();
    expect(useShell.getState().sidebarOpen).toBe(true);
  });

  it('survives the last overlay letting go of its still', async () => {
    // An overlay closed just before the pointer reached the edge clears its
    // still a moment later, while the peek is still opening.
    await act(() =>
      useOverlay.getState().open({ kind: 'palette', scope: 'palette' }),
    );
    act(() => useOverlay.getState().close());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(overlayKind()).toBeNull();
    // Taking the still is slower than letting the last one go.
    splash.freezePage.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve({}), 200)),
    );
    act(() => startSidebarPeek());
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
    await settle();
    expect(overlayKind()).toBe('sidebar-peek');
    expect(peeking()).toBe(true);
  });

  describe('for a toast', () => {
    it('comes out to show it and goes back in after', async () => {
      showToast();
      await settle();
      expect(peeking()).toBe(true);
      act(() => useToast.getState().dismiss(useToast.getState().toast!.id));
      expect(peeking()).toBe(false);
    });

    it('stays out while the pointer is on it', async () => {
      showToast();
      await settle();
      const hovered = vi
        .spyOn(document, 'querySelector')
        .mockImplementation((selector) =>
          selector === 'aside.sidebar-peek:hover' ? document.body : null,
        );
      act(() => useToast.getState().dismiss(useToast.getState().toast!.id));
      hovered.mockRestore();
      expect(peeking()).toBe(true);
    });

    it('leaves a peek the pointer opened alone', async () => {
      await peek();
      showToast();
      act(() => useToast.getState().dismiss(useToast.getState().toast!.id));
      expect(peeking()).toBe(true);
    });
  });
});
