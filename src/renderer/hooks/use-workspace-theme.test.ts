// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { DEFAULT_APPEARANCE } from '../../shared/appearance';
import { useShell } from '../stores/shell-store';
import { sampleSnapshot } from '../test-fixtures';
import { useWorkspaceTheme } from './use-workspace-theme';

const root = document.documentElement;
const preview = (patch: object) =>
  act(() =>
    useShell.setState({
      appearancePreview: { ...DEFAULT_APPEARANCE, ...patch },
    }),
  );

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

describe('useWorkspaceTheme', () => {
  beforeEach(() => {
    useShell.setState({ snapshot: sampleSnapshot(), appearancePreview: null });
    renderHook(() => useWorkspaceTheme());
  });

  // Each tick of the slider restarting the fade made the frame flicker.
  it('tunes intensity without replaying the frame fade', () => {
    preview({ gradient: 'dusk', intensity: 0.2 });
    const swap = root.dataset.frameSwap;
    const image = root.style.getPropertyValue('--frame-image');
    preview({ gradient: 'dusk', intensity: 0.8 });
    expect(root.style.getPropertyValue('--frame-image')).not.toBe(image);
    expect(root.dataset.frameSwap).toBe(swap);
    expect(root.dataset.themeMotion).toBe('false');
  });

  it('moves custom colours without replaying the frame fade', () => {
    preview({ colors: ['#cc6677'], gradient: undefined });
    const swap = root.dataset.frameSwap;
    preview({ colors: ['#6677cc'], gradient: undefined });
    expect(root.dataset.frameSwap).toBe(swap);
  });

  it('takes the first touch of the colour canvas without a fade', () => {
    preview({ gradient: 'dusk' });
    const swap = root.dataset.frameSwap;
    preview({ colors: ['#cc6677'], gradient: undefined });
    expect(root.dataset.frameSwap).toBe(swap);
  });

  it('fades when leaving custom colours for a preset', () => {
    preview({ colors: ['#cc6677'], gradient: undefined });
    const swap = root.dataset.frameSwap;
    preview({ gradient: 'ember' });
    expect(root.dataset.frameSwap).not.toBe(swap);
  });

  it('fades when the look itself changes', () => {
    preview({ gradient: 'dusk' });
    const swap = root.dataset.frameSwap;
    preview({ gradient: 'ember' });
    expect(root.dataset.frameSwap).not.toBe(swap);
  });
});
