import { useEffect, useMemo, useRef, useState } from 'react';
import { AccentWheel } from './AccentWheel';
import { PanelHeader } from './PanelHeader';
import { SegmentedControl } from './SegmentedControl';
import { Row, Section } from '../settings/controls';
import {
  accentColors,
  appearanceGrain,
  framePreset,
  INTENSITY,
  newWorkspaceAppearance,
  themeImage,
  themePreset,
  THEMES,
  type ThemePreset,
} from '../../shared/appearance';
import type {
  WorkspaceAppearance,
  WorkspaceId,
  WorkspaceMode,
} from '../../shared/types';
import { api } from '../splash-api';
import { selectWorkspaces, useShell } from '../stores/shell-store';

const MODES: { value: WorkspaceMode; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'system', label: 'System' },
];

/** Plain and every preset, two rows of nine. */
function ThemeSwatches({
  appearance,
  dark,
  onPlain,
  onPreset,
}: {
  appearance: WorkspaceAppearance;
  dark: boolean;
  onPlain(): void;
  onPreset(preset: ThemePreset): void;
}) {
  const frame = framePreset(appearance.frame);
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="grid grid-cols-9 justify-items-center gap-y-2.5 p-3"
    >
      <button
        type="button"
        role="radio"
        aria-checked={!appearance.gradient && !appearance.colors}
        aria-label="Plain"
        title="Plain"
        onClick={onPlain}
        style={{ background: dark ? frame.dark.chrome : frame.light.elevated }}
        className="theme-swatch"
      />
      {THEMES.map((preset) => (
        <button
          key={preset.id}
          type="button"
          role="radio"
          aria-checked={!appearance.colors && appearance.gradient === preset.id}
          aria-label={preset.label}
          title={preset.label}
          onClick={() => onPreset(preset)}
          style={{ backgroundImage: themeImage(preset.colors, 'swatch') }}
          className="theme-swatch"
        />
      ))}
    </div>
  );
}

/** A 0–1 value, on the native control so keys and screen readers just work. */
function RangeRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange(value: number): void;
}) {
  return (
    <Row label={label}>
      <input
        type="range"
        aria-label={label}
        aria-valuetext={`${Math.round(value * 100)}%`}
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ '--value': value } as React.CSSProperties}
        className="range-input w-40"
      />
    </Row>
  );
}

/**
 * Creating a workspace, or changing an existing one's name and look, in the
 * widened sidebar. The window frame previews the theme while it's chosen.
 */
export function WorkspaceEditor({
  workspaceId,
}: {
  workspaceId: WorkspaceId | null;
}) {
  const existing = useShell((state) =>
    state.snapshot?.workspaces.find((w) => w.id === workspaceId),
  );
  const count = useShell((state) => state.snapshot?.workspaces.length ?? 0);
  const setPanel = useShell((state) => state.setSidebarPanel);
  const setPreview = useShell((state) => state.setAppearancePreview);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const close = () => {
    if (!savingRef.current) setPanel(null);
  };
  const [name, setName] = useState(existing?.name ?? '');
  const [appearance, setAppearance] = useState<WorkspaceAppearance>(
    () => existing?.appearance ?? newWorkspaceAppearance(count),
  );
  const workspaces = useShell(selectWorkspaces);
  const otherNames = useMemo(
    () =>
      workspaces
        .filter((w) => w.id !== workspaceId)
        .map((w) => w.name.trim().toLowerCase()),
    [workspaces, workspaceId],
  );
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;

  // The frame shows the look being chosen; leaving the panel, however it
  // happens, puts the workspace's own back.
  useEffect(() => setPreview(appearance), [appearance, setPreview]);
  useEffect(() => () => setPreview(null), [setPreview]);
  // Light or dark is the main process's to set, so it previews there.
  useEffect(
    () => api().previewWorkspaceMode(appearance.mode),
    [appearance.mode],
  );
  useEffect(() => () => api().previewWorkspaceMode(null), []);

  const update = (patch: Partial<WorkspaceAppearance>) =>
    setAppearance((current) => ({ ...current, ...patch }));

  const trimmedName = name.trim();
  const duplicate =
    trimmedName !== '' && otherNames.includes(trimmedName.toLowerCase());
  const displayName = trimmedName || `Workspace ${count + 1}`;
  const save = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      if (workspaceId && existing) {
        await api().customizeWorkspace(workspaceId, displayName, appearance);
      } else {
        await api().createWorkspace(displayName, appearance);
      }
      savingRef.current = false;
      setPanel(null);
    } catch {
      setSaveError(
        'Couldn’t save this workspace. Your changes are still here. Try again.',
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // The canvas shows the picked colours, a preset's, or the accent.
  const wheelColors = appearance.colors ??
    themePreset(appearance.gradient)?.colors ?? [
      accentColors(appearance.accent).light,
    ];

  return (
    <>
      <PanelHeader title={existing ? 'Edit workspace' : 'New workspace'} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        // Nothing here needs validating, and a saved value that falls between
        // a slider's steps mustn't stop the save.
        noValidate
        aria-busy={saving}
        aria-label={existing ? 'Edit workspace' : 'New workspace'}
        className="flex min-h-0 flex-1 flex-col"
      >
        <fieldset
          disabled={saving}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-1 pt-1 pb-3"
        >
          <label className="mt-1 flex h-8 shrink-0 items-center rounded-control bg-field px-2.5 transition-[background-color,box-shadow] duration-base ease-out focus-within:bg-field-focus focus-within:shadow-focus">
            <input
              autoFocus
              aria-label="Workspace name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={`Workspace ${count + 1}`}
              maxLength={80}
              spellCheck={false}
              className="h-full min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-subtle select-text"
            />
          </label>
          {duplicate && (
            <p className="-mt-2 px-1 text-small leading-copy text-fg-subtle">
              Another workspace is already called “{trimmedName}”. A different
              name or theme will help tell them apart.
            </p>
          )}

          <Section title="Theme">
            <ThemeSwatches
              appearance={appearance}
              dark={dark}
              onPlain={() =>
                update({
                  gradient: undefined,
                  colors: undefined,
                  accent: appearance.colors?.[0] ?? appearance.accent,
                })
              }
              onPreset={(preset) =>
                update({
                  gradient: preset.id,
                  colors: undefined,
                  accent: preset.colors[0]!,
                })
              }
            />
            <AccentWheel
              colors={wheelColors}
              onChange={(colors) =>
                update({ colors, gradient: undefined, accent: colors[0]! })
              }
            />
            <RangeRow
              label="Intensity"
              value={appearance.intensity ?? INTENSITY}
              onChange={(intensity) => update({ intensity })}
            />
            <RangeRow
              label="Grain"
              value={appearanceGrain(appearance)}
              onChange={(grain) => update({ grain })}
            />
            <Row label="Mode">
              <SegmentedControl
                label="Light or dark"
                options={MODES}
                value={appearance.mode}
                onChange={(mode) => update({ mode })}
              />
            </Row>
          </Section>

          {saveError && (
            <p
              role="alert"
              className="px-1 text-small leading-relaxed text-danger"
            >
              {saveError}
            </p>
          )}
        </fieldset>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-divider px-1 pt-2 pb-1">
          <button
            type="button"
            onClick={close}
            disabled={saving}
            className="button h-8"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="button button-primary h-8"
          >
            {saving
              ? 'Saving…'
              : existing
                ? 'Save changes'
                : 'Create workspace'}
          </button>
        </div>
      </form>
    </>
  );
}
