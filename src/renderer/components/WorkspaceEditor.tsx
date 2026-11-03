import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  MoonStar,
  Sparkles,
  Sun,
  type LucideIcon,
} from 'lucide-react';
import { AccentWheel } from './AccentWheel';
import { GrainDial } from './GrainDial';
import { PanelHeader } from './PanelHeader';
import { SegmentedControl } from './SegmentedControl';
import { WaveSlider } from './WaveSlider';
import {
  accentColors,
  appearanceGrain,
  framePreset,
  INTENSITY,
  newWorkspaceAppearance,
  SYMBOLS,
  themeImage,
  themePreset,
  THEMES,
  type ThemePreset,
} from '../../shared/appearance';
import type {
  WorkspaceAppearance,
  WorkspaceIcon as Icon,
  WorkspaceId,
  WorkspaceMode,
} from '../../shared/types';
import { api } from '../splash-api';
import { selectWorkspaces, useShell } from '../stores/shell-store';
import { WorkspaceIcon } from './WorkspaceIcon';

const ICON_KINDS: { kind: Icon['kind']; label: string }[] = [
  { kind: 'letter', label: 'Letter' },
  { kind: 'symbol', label: 'Symbol' },
  { kind: 'emoji', label: 'Emoji' },
  { kind: 'image', label: 'Image' },
];

const MODES: { mode: WorkspaceMode; label: string; Icon: LucideIcon }[] = [
  { mode: 'system', label: 'Match the system', Icon: Sparkles },
  { mode: 'light', label: 'Light', Icon: Sun },
  { mode: 'dark', label: 'Dark', Icon: MoonStar },
];

/** Presets and Plain, nine to a page like Arc's, with arrows to page. */
const PER_PAGE = 9;

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
  const row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const plain = !appearance.gradient && !appearance.colors;
  const checked = (preset: ThemePreset) =>
    !appearance.colors && appearance.gradient === preset.id;

  const measure = () => {
    const el = row.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft <= 1,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1,
    });
  };
  // Opens on the page with the chosen preset.
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const index = THEMES.findIndex(checked) + 1;
    el.scrollLeft = Math.floor(index / PER_PAGE) * el.clientWidth;
    measure();
    // Only when it opens; paging is up to the person after that.
  }, []);
  const page = (direction: 1 | -1) =>
    row.current?.scrollBy({
      left: direction * row.current.clientWidth,
      behavior: 'smooth',
    });

  return (
    <div className="flex items-center">
      <button
        type="button"
        aria-label="Previous themes"
        title="Previous themes"
        disabled={edges.start}
        onClick={() => page(-1)}
        className="icon-button shrink-0 disabled:opacity-30"
      >
        <ChevronLeft size={16} strokeWidth={2} />
      </button>
      <div
        ref={row}
        role="radiogroup"
        aria-label="Theme"
        onScroll={measure}
        className="theme-row min-w-0 flex-1"
      >
        <button
          type="button"
          role="radio"
          aria-checked={plain}
          aria-label="Plain"
          title="Plain"
          onClick={onPlain}
          style={{
            background: dark
              ? framePreset(appearance.frame).dark.chrome
              : framePreset(appearance.frame).light.elevated,
          }}
          className="theme-swatch"
        />
        {THEMES.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={checked(preset)}
            aria-label={preset.label}
            title={preset.label}
            onClick={() => onPreset(preset)}
            style={{ backgroundImage: themeImage(preset.colors, 'swatch') }}
            className="theme-swatch"
          />
        ))}
      </div>
      <button
        type="button"
        aria-label="More themes"
        title="More themes"
        disabled={edges.end}
        onClick={() => page(1)}
        className="icon-button shrink-0 disabled:opacity-30"
      >
        <ChevronRight size={16} strokeWidth={2} />
      </button>
    </div>
  );
}

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

/** Names a group of choices, as Saved and the palette's groups are named. */
const GROUP_LABEL = 'text-caption font-medium tracking-[0.02em] text-fg-subtle';

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
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
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
        aria-busy={saving}
        aria-label={existing ? 'Edit workspace' : 'New workspace'}
        className="flex min-h-0 flex-1 flex-col"
      >
        <fieldset
          disabled={saving}
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-1 pt-1 pb-3"
        >
          {/* The workspace as it will look: its icon on a fan of cards. */}
          {!existing && (
            <div className="flex flex-col items-center gap-1 pt-2 pb-1 text-center">
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
              <p className="mt-2 max-w-[32ch] text-small leading-copy text-fg-muted">
                Keep your pages apart for life, work, projects and more.
              </p>
            </div>
          )}

          <label className="sheet-panel flex h-11 shrink-0 items-center gap-2.5 px-3.5">
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

          <section className="sheet-panel flex shrink-0 flex-col gap-2 p-2">
            <AccentWheel
              colors={wheelColors}
              onChange={(colors) =>
                update({ colors, gradient: undefined, accent: colors[0]! })
              }
            >
              <div
                role="radiogroup"
                aria-label="Light or dark"
                className="flex gap-1"
              >
                {MODES.map(({ mode, label, Icon }) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={appearance.mode === mode}
                    aria-label={label}
                    title={label}
                    onClick={() => update({ mode })}
                    className="grid size-9 place-items-center rounded-control text-fg-subtle transition-colors duration-fast hover:text-fg aria-checked:bg-row-pressed aria-checked:text-fg"
                  >
                    <Icon size={18} strokeWidth={1.75} />
                  </button>
                ))}
              </div>
            </AccentWheel>
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
            <div className="flex items-center gap-4 pr-1 pb-1 pl-2">
              <WaveSlider
                label="Intensity"
                value={appearance.intensity ?? INTENSITY}
                onChange={(intensity) => update({ intensity })}
              />
              <GrainDial
                label="Grain"
                value={appearanceGrain(appearance)}
                onChange={(grain) => update({ grain })}
              />
            </div>
          </section>

          <section className="sheet-panel flex shrink-0 flex-col gap-2.5 p-3">
            <div className="flex items-center justify-between gap-2 pl-1">
              <h2 className={GROUP_LABEL}>Icon</h2>
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
