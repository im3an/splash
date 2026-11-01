import { useMemo, useRef, useState, type CSSProperties } from 'react';
import { ImagePlus } from 'lucide-react';
import { useDialogFocus } from '../hooks/use-dialog-focus';
import { SegmentedControl } from './SegmentedControl';
import {
  ACCENTS,
  accentColors,
  newWorkspaceAppearance,
  FRAMES,
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
import { SYMBOL_ICONS, WorkspaceIcon } from './WorkspaceIcon';

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

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={existing ? 'Customize workspace' : 'New workspace'}
      className="scrim-in absolute inset-0 flex items-start justify-center overflow-y-auto bg-scrim p-6 pt-[8vh]"
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
        className="dialog-in flex w-(--dialog-width) max-w-full flex-col gap-5 rounded-content bg-elevated p-5 shadow-panel"
      >
        <div className="flex items-center gap-3">
          <div
            style={preview}
            className="grid size-11 shrink-0 place-items-center rounded-content bg-chrome text-(--type-title) font-semibold text-accent shadow-outline"
          >
            <WorkspaceIcon
              icon={appearance.icon}
              name={displayName}
              size={20}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-title font-semibold">
              {existing ? 'Customize workspace' : 'New workspace'}
            </h1>
            <p className="text-small text-fg-subtle">
              A workspace keeps its own trail, look and active page.
            </p>
          </div>
        </div>

        <fieldset disabled={saving} className="contents">
          <Field label="Name">
            <input
              autoFocus
              aria-label="Workspace name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={`Workspace ${count + 1}`}
              maxLength={80}
              spellCheck={false}
              className="h-8 rounded-control bg-field px-2.5 text-fg outline-none placeholder:text-fg-subtle focus:bg-field-focus focus:shadow-focus select-text"
            />
            {duplicate && (
              <p className="text-small text-fg-muted">
                Another workspace is already called “{trimmedName}”. A different
                name, icon or accent will help tell them apart.
              </p>
            )}
          </Field>

          <Field label="Icon">
            <SegmentedControl
              stretch
              label="Icon type"
              options={ICON_KINDS.map(({ kind, label }) => ({
                value: kind,
                label,
              }))}
              value={appearance.icon.kind}
              onChange={setIconKind}
            />
            {appearance.icon.kind === 'symbol' && (
              <div
                role="radiogroup"
                aria-label="Symbol"
                className="grid grid-cols-8 gap-1"
              >
                {SYMBOLS.map((symbol) => {
                  const Symbol = SYMBOL_ICONS[symbol];
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
                      className="grid h-8 place-items-center rounded-row text-fg-muted transition-colors duration-fast hover:bg-hover hover:text-fg aria-checked:bg-accent-soft aria-checked:text-accent"
                    >
                      <Symbol size={16} strokeWidth={1.75} />
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
                className="h-8 rounded-control bg-field px-2.5 text-fg outline-none focus:bg-field-focus focus:shadow-focus select-text"
              />
            )}
            {appearance.icon.kind === 'image' && (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex h-8 items-center justify-center gap-1.5 rounded-control bg-field text-small text-fg-muted hover:text-fg"
              >
                <ImagePlus size={14} strokeWidth={1.75} />
                Choose another image…
              </button>
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
          </Field>

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
              <label
                title="Custom colour"
                className="relative size-6 cursor-default overflow-hidden rounded-full shadow-outline"
                style={{
                  background: isCustomAccent(appearance.accent)
                    ? appearance.accent
                    : 'conic-gradient(#e55, #ec5, #5c7, #5ae, #85e, #e55)',
                  outline: isCustomAccent(appearance.accent)
                    ? '2px solid var(--fg-muted)'
                    : undefined,
                  outlineOffset: 2,
                }}
              >
                <input
                  type="color"
                  aria-label="Custom accent colour"
                  value={
                    isCustomAccent(appearance.accent)
                      ? appearance.accent
                      : accentColors(appearance.accent).light
                  }
                  onChange={(event) => update({ accent: event.target.value })}
                  className="absolute inset-0 opacity-0"
                />
              </label>
            </div>
          </Field>

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

          <Field label="Appearance">
            <SegmentedControl
              stretch
              label="Light or dark"
              options={MODES.map(({ mode, label }) => ({ value: mode, label }))}
              value={appearance.mode}
              onChange={(mode) => update({ mode })}
            />
          </Field>
        </fieldset>

        {saveError && (
          <p role="alert" className="text-small leading-relaxed text-danger">
            {saveError}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
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
