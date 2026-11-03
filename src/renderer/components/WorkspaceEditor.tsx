import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronUp, ImagePlus, Palette } from 'lucide-react';
import { useDialogFocus } from '../hooks/use-dialog-focus';
import { AccentWheel } from './AccentWheel';
import { Reveal } from './Reveal';
import { SegmentedControl } from './SegmentedControl';
import {
  ACCENTS,
  accentColors,
  newWorkspaceAppearance,
  FRAMES,
  framePreset,
  GRADIENTS,
  gradientImage,
  gradientPreset,
  isCustomAccent,
  SYMBOLS,
} from '../../shared/appearance';
import type {
  WorkspaceAppearance,
  WorkspaceIcon as Icon,
  WorkspaceId,
  WorkspaceMode,
} from '../../shared/types';
import { themeVariables } from '../hooks/use-workspace-theme';
import { api } from '../splash-api';
import { useOverlay } from '../stores/overlay-store';
import { selectWorkspaces, useShell } from '../stores/shell-store';
import { WorkspaceIcon } from './WorkspaceIcon';

const ICON_KINDS: { kind: Icon['kind']; label: string }[] = [
  { kind: 'letter', label: 'Letter' },
  { kind: 'symbol', label: 'Symbol' },
  { kind: 'emoji', label: 'Emoji' },
  { kind: 'image', label: 'Image' },
];

const MODES: { mode: WorkspaceMode; label: string }[] = [
  { mode: 'system', label: 'System' },
  { mode: 'light', label: 'Light' },
  { mode: 'dark', label: 'Dark' },
];

/** Scales an image file down to a small square PNG for the icon. */
async function squareIcon(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const side = Math.min(bitmap.width, bitmap.height);
  canvas
    .getContext('2d')
    ?.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      size,
      size,
    );
  bitmap.close();
  return canvas.toDataURL('image/png');
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-caption font-medium tracking-[0.02em] text-fg-subtle uppercase">
        {label}
      </span>
      {children}
    </div>
  );
}

/** Creating a workspace, or changing an existing one's name and look. */
export function WorkspaceEditor({
  workspaceId,
}: {
  workspaceId: WorkspaceId | null;
}) {
  const existing = useShell((state) =>
    state.snapshot?.workspaces.find((w) => w.id === workspaceId),
  );
  const count = useShell((state) => state.snapshot?.workspaces.length ?? 0);
  const closeOverlay = useOverlay((state) => state.close);
  const dialogRef = useDialogFocus<HTMLDivElement>();
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const close = () => {
    if (!savingRef.current) closeOverlay();
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
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const previewDark =
    appearance.mode === 'system' ? dark : appearance.mode === 'dark';
  const customAccent = isCustomAccent(appearance.accent);

  const update = (patch: Partial<WorkspaceAppearance>) =>
    setAppearance((current) => ({ ...current, ...patch }));
  const setIconKind = (kind: Icon['kind']) => {
    if (kind === appearance.icon.kind) return;
    if (kind === 'letter') update({ icon: { kind: 'letter' } });
    if (kind === 'symbol') update({ icon: { kind: 'symbol', name: 'house' } });
    if (kind === 'emoji') update({ icon: { kind: 'emoji', value: '🌿' } });
    if (kind === 'image') fileInput.current?.click();
  };

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
      closeOverlay();
    } catch {
      setSaveError(
        'Couldn’t save this workspace. Your changes are still here. Try again.',
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const preview = useMemo(
    () => themeVariables(appearance, previewDark) as CSSProperties,
    [appearance, previewDark],
  );

  const gradient = gradientPreset(appearance.gradient);
  const [themeOpen, setThemeOpen] = useState(true);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={existing ? 'Customize workspace' : 'New workspace'}
      className="scrim-in absolute inset-0 flex items-start justify-center overflow-y-auto bg-scrim p-6 pt-[6vh]"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
        }
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        aria-busy={saving}
        style={preview}
        className="workspace-sheet dialog-in flex w-(--dialog-width) max-w-full flex-col gap-3 rounded-sheet p-4 shadow-panel"
      >
        {/* The workspace as it will look: its icon on a fan of cards. */}
        <div className="flex flex-col items-center gap-1 pt-3 pb-2 text-center">
          <div className="workspace-cards" aria-hidden>
            {['left', 'right', 'front'].map((card) => (
              <span key={card} className="workspace-card" data-card={card}>
                <WorkspaceIcon
                  icon={appearance.icon}
                  name={displayName}
                  size={card === 'front' ? 26 : 22}
                />
              </span>
            ))}
          </div>
          <h1 className="mt-3 text-display font-semibold tracking-[-0.01em]">
            {existing ? 'Customize workspace' : 'Create a workspace'}
          </h1>
          <p className="max-w-[30ch] text-body leading-copy text-fg-muted">
            Keep your pages apart for life, work, projects and more.
          </p>
        </div>

        <fieldset disabled={saving} className="contents">
          <label className="sheet-panel flex h-11 items-center gap-2.5 px-3.5">
            <span
              className="grid size-5 shrink-0 place-items-center text-accent"
              aria-hidden
            >
              <WorkspaceIcon
                icon={appearance.icon}
                name={displayName}
                size={16}
              />
            </span>
            <input
              autoFocus
              aria-label="Workspace name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={`Workspace ${count + 1}`}
              maxLength={80}
              spellCheck={false}
              className="h-full min-w-0 flex-1 bg-transparent text-lead text-fg outline-none placeholder:text-fg-subtle select-text"
            />
          </label>
          {duplicate && (
            <p className="px-1 text-small text-fg-muted">
              Another workspace is already called “{trimmedName}”. A different
              name, icon or theme will help tell them apart.
            </p>
          )}

          <section className="sheet-panel flex flex-col gap-2.5 p-3">
            <div className="flex items-center justify-between gap-2 pl-1">
              <h2 className="text-body font-medium text-fg-muted">Icon</h2>
              <SegmentedControl
                label="Icon type"
                options={ICON_KINDS.map(({ kind, label }) => ({
                  value: kind,
                  label,
                }))}
                value={appearance.icon.kind}
                onChange={setIconKind}
              />
            </div>
            {appearance.icon.kind === 'symbol' && (
              <div
                role="radiogroup"
                aria-label="Symbol"
                className="grid grid-cols-8 gap-0.5"
              >
                {SYMBOLS.map((symbol) => {
                  const selected =
                    appearance.icon.kind === 'symbol' &&
                    appearance.icon.name === symbol;
                  return (
                    <button
                      key={symbol}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={symbol.replace(/-/g, ' ')}
                      title={symbol.replace(/-/g, ' ')}
                      onClick={() =>
                        update({ icon: { kind: 'symbol', name: symbol } })
                      }
                      className="symbol-choice"
                    >
                      <WorkspaceIcon
                        icon={{ kind: 'symbol', name: symbol }}
                        name={displayName}
                        size={18}
                      />
                    </button>
                  );
                })}
              </div>
            )}
            {appearance.icon.kind === 'emoji' && (
              <input
                value={appearance.icon.value}
                onChange={(event) =>
                  update({
                    icon: {
                      kind: 'emoji',
                      value: event.target.value.slice(0, 16),
                    },
                  })
                }
                aria-label="Emoji"
                placeholder="Type or pick an emoji (⌃⌘Space)"
                className="h-9 rounded-control bg-field px-2.5 text-fg outline-none focus:bg-field-focus focus:shadow-focus select-text"
              />
            )}
            {appearance.icon.kind === 'image' && (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex h-9 items-center justify-center gap-1.5 rounded-control bg-field text-small text-fg-muted hover:text-fg"
              >
                <ImagePlus size={14} strokeWidth={1.75} />
                Choose another image…
              </button>
            )}
            {appearance.icon.kind === 'letter' && (
              <p className="px-1 text-small text-fg-subtle">
                The first letter of the name, in the workspace’s accent.
              </p>
            )}
            {imageError && (
              <p className="text-small text-danger">{imageError}</p>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                try {
                  update({
                    icon: { kind: 'image', dataUrl: await squareIcon(file) },
                  });
                  setImageError(null);
                } catch {
                  setImageError(
                    'That image couldn’t be read. Try a PNG or JPEG.',
                  );
                }
              }}
            />
          </section>

          <section className="sheet-panel flex flex-col p-3">
            <button
              type="button"
              aria-expanded={themeOpen}
              onClick={() => setThemeOpen((open) => !open)}
              className="flex h-7 items-center gap-2 rounded-row pl-1 text-left text-body font-medium text-fg"
            >
              <Palette
                size={16}
                strokeWidth={1.75}
                className="text-fg-muted"
                aria-hidden
              />
              <span className="flex-1">Choose a theme</span>
              <ChevronUp
                size={14}
                strokeWidth={2}
                aria-hidden
                className="text-fg-subtle transition-transform duration-base ease-emphasized"
                style={{ rotate: themeOpen ? '0deg' : '180deg' }}
              />
            </button>
            <div
              role="radiogroup"
              aria-label="Theme"
              className="flex flex-wrap gap-2 pt-3 pl-1"
            >
              <button
                type="button"
                role="radio"
                aria-checked={!gradient}
                aria-label="Plain"
                title="Plain"
                onClick={() => update({ gradient: undefined })}
                style={{
                  background: previewDark
                    ? framePreset(appearance.frame).dark.chrome
                    : framePreset(appearance.frame).light.elevated,
                }}
                className="theme-swatch"
              />
              {GRADIENTS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={appearance.gradient === option.id}
                  aria-label={option.label}
                  title={option.label}
                  onClick={() =>
                    update({ gradient: option.id, accent: option.accent })
                  }
                  style={{
                    backgroundImage: gradientImage(option, 'swatch'),
                  }}
                  className="theme-swatch"
                />
              ))}
            </div>
            <Reveal show={themeOpen}>
              <div className="flex flex-col gap-4 pt-4 pl-1">
                <Field label="Accent">
                  <div
                    role="radiogroup"
                    aria-label="Accent colour"
                    className="flex flex-wrap items-center gap-1.5"
                  >
                    {ACCENTS.map((accent) => (
                      <button
                        key={accent.id}
                        type="button"
                        role="radio"
                        aria-checked={appearance.accent === accent.id}
                        aria-label={accent.label}
                        title={accent.label}
                        onClick={() => update({ accent: accent.id })}
                        style={{
                          background: previewDark ? accent.dark : accent.light,
                        }}
                        className="size-6 rounded-full shadow-outline outline-offset-2 aria-checked:outline-2 aria-checked:outline-(--fg-muted)"
                      />
                    ))}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={customAccent}
                      aria-label="Custom colour"
                      title="Custom colour"
                      onClick={() => {
                        // Start the wheel from the colour already chosen.
                        if (!customAccent)
                          update({
                            accent: accentColors(appearance.accent).light,
                          });
                      }}
                      style={{
                        background: customAccent
                          ? appearance.accent
                          : 'conic-gradient(#e55, #ec5, #5c7, #5ae, #85e, #e55)',
                      }}
                      className="size-6 rounded-full shadow-outline outline-offset-2 aria-checked:outline-2 aria-checked:outline-(--fg-muted)"
                    />
                  </div>
                  <Reveal show={customAccent}>
                    <div className="pt-1">
                      <AccentWheel
                        value={accentColors(appearance.accent).light}
                        onChange={(accent) => update({ accent })}
                      />
                    </div>
                  </Reveal>
                </Field>

                {/* A gradient covers the frame, so its colour only matters without one. */}
                {!gradient && (
                  <Field label="Frame">
                    <div
                      role="radiogroup"
                      aria-label="Frame colour"
                      className="flex flex-wrap gap-1.5"
                    >
                      {FRAMES.map((frame) => (
                        <button
                          key={frame.id}
                          type="button"
                          role="radio"
                          aria-checked={appearance.frame === frame.id}
                          aria-label={frame.label}
                          title={frame.label}
                          onClick={() => update({ frame: frame.id })}
                          style={{
                            background: previewDark
                              ? frame.dark.chrome
                              : frame.light.chrome,
                          }}
                          className="h-7 w-10 rounded-row shadow-outline outline-offset-2 aria-checked:outline-2 aria-checked:outline-(--fg-muted)"
                        />
                      ))}
                    </div>
                  </Field>
                )}

                <Field label="Appearance">
                  <SegmentedControl
                    stretch
                    label="Light or dark"
                    options={MODES.map(({ mode, label }) => ({
                      value: mode,
                      label,
                    }))}
                    value={appearance.mode}
                    onChange={(mode) => update({ mode })}
                  />
                </Field>
              </div>
            </Reveal>
          </section>
        </fieldset>

        {saveError && (
          <p role="alert" className="text-small leading-relaxed text-danger">
            {saveError}
          </p>
        )}
        <div className="flex items-center justify-end gap-2 pt-1">
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
    </div>
  );
}
