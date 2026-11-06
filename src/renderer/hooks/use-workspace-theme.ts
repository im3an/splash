import { useEffect, useState } from 'react';
import {
  accentColors,
  appearanceColors,
  appearanceGrain,
  frameColor,
  framePreset,
  themeImage,
} from '../../shared/appearance';
import type { WorkspaceAppearance } from '../../shared/types';
import { grainImage } from '../lib/grain';
import { useShell } from '../stores/shell-store';

const DARK = '(prefers-color-scheme: dark)';

let lastImage: string | undefined;
let lastLook: { scope: string; source: string } | undefined;

/**
 * Whether this is the look already showing being tuned, rather than a new
 * one. Moving the intensity or a custom colour changes the gradient on every
 * tick of a drag, and each tick must land at once, with no fade. So must the
 * first touch of the colour canvas, which turns any look into a custom one.
 */
function isTuning(
  appearance: WorkspaceAppearance,
  workspaceId: string | undefined,
  dark: boolean,
): boolean {
  const scope = `${workspaceId}/${dark}`;
  const source = appearance.colors
    ? 'custom'
    : (appearance.gradient ?? 'plain');
  const tuning =
    scope === lastLook?.scope &&
    (source === lastLook.source || source === 'custom');
  lastLook = { scope, source };
  return tuning;
}

function usePrefersDark(): boolean {
  const [dark, setDark] = useState(() => matchMedia(DARK).matches);
  useEffect(() => {
    const query = matchMedia(DARK);
    const update = () => setDark(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return dark;
}

/** Design-token overrides for a workspace's look in the current scheme. */
export function themeVariables(
  appearance: WorkspaceAppearance,
  dark: boolean,
): Record<string, string> {
  const frame = framePreset(appearance.frame);
  const accent = accentColors(appearance.accent);
  const accentColor = dark ? accent.dark : accent.light;
  const colors = dark ? frame.dark : frame.light;
  const gradient = appearanceColors(appearance);
  return {
    // Painted over the frame colour, which stands in while it fades in.
    '--frame-image': gradient
      ? themeImage(gradient, dark ? 'dark' : 'light', appearance.intensity)
      : 'none',
    '--frame-grain': grainImage(appearanceGrain(appearance)),
    '--chrome': colors.chrome,
    '--frame': frameColor(appearance, dark),
    '--surface': colors.surface,
    '--elevated': colors.elevated,
    '--field-focus': dark
      ? `color-mix(in oklab, ${colors.elevated} 85%, ${colors.chrome})`
      : colors.elevated,
    '--ink': colors.ink,
    '--accent': accentColor,
    '--accent-soft': `color-mix(in oklab, ${accentColor} ${dark ? 22 : 16}%, transparent)`,
  };
}

/**
 * Applies the active workspace's frame and accent to the shell. Light or
 * dark itself is set by the main process, so pages follow it too.
 */
export function useWorkspaceTheme(): void {
  // The workspace panel previews the look it's editing on the real frame.
  const appearance = useShell(
    (state) =>
      state.appearancePreview ??
      state.snapshot?.workspaces.find(
        (workspace) => workspace.id === state.snapshot?.activeWorkspaceId,
      )?.appearance,
  );
  const workspaceId = useShell((state) => state.snapshot?.activeWorkspaceId);
  const dark = usePrefersDark();

  useEffect(() => {
    if (!appearance) return;
    const root = document.documentElement;
    const variables = themeVariables(appearance, dark);
    const tuning = isTuning(appearance, workspaceId, dark);
    // Tuning follows the pointer: colours snap, or they'd trail the gradient.
    if (tuning) root.dataset.themeMotion = 'false';
    for (const [name, value] of Object.entries(variables)) {
      root.style.setProperty(name, value);
    }
    // A new gradient fades in over the old frame colour; the animation's
    // name alternates so it plays again each time.
    const image = variables['--frame-image'];
    if (image !== lastImage) {
      lastImage = image;
      if (!tuning)
        root.dataset.frameSwap = root.dataset.frameSwap === 'a' ? 'b' : 'a';
    }
    // From the next frame on, changes crossfade (see app.css).
    const frame = requestAnimationFrame(() => {
      root.dataset.themeMotion = 'true';
    });
    return () => {
      cancelAnimationFrame(frame);
      for (const name of Object.keys(variables))
        root.style.removeProperty(name);
    };
  }, [appearance, workspaceId, dark]);
}
