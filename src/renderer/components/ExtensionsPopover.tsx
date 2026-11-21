import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, Puzzle, Settings, Store, Trash2 } from '../icons';
import type { ExtensionInfo } from '../../shared/types';
import { api } from '../splash-api';
import { useOverlay } from '../stores/overlay-store';
import { AnchoredPanel } from './AnchoredPanel';
import { PanelState } from './PanelState';

export const EXTENSIONS_BUTTON_ID = 'extensions-button';

/**
 * Every extension from the toolbar's puzzle button: turn one on or off, open
 * its options, remove it, or add more, without going through Settings.
 */
export function ExtensionsPopover() {
  const close = useOverlay((state) => state.close);
  const [extensions, setExtensions] = useState<ExtensionInfo[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const content = useRef<HTMLDivElement>(null);
  /** The folder picker is a sheet on this window; it mustn't close this. */
  const picking = useRef(false);

  useEffect(() => {
    void api()
      .listExtensions()
      .then(setExtensions)
      .catch(() => setExtensions([]));
    return api().onExtensions(setExtensions);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (confirming) setConfirming(null);
      else close();
    };
    // The page area's backdrop can't see clicks on the toolbar or sidebar. The
    // button is left out because it closes this itself.
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !content.current?.contains(target) &&
        !document.getElementById(EXTENSIONS_BUTTON_ID)?.contains(target)
      ) {
        close();
      }
    };
    const onBlur = () => {
      if (!picking.current) close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('blur', onBlur);
    };
  }, [close, confirming]);

  const attempt = useCallback(
    async (action: () => Promise<unknown>, fallback: string) => {
      setProblem(null);
      try {
        await action();
      } catch {
        setProblem(fallback);
      }
    },
    [],
  );

  /** The page opens in front, so this steps aside unless it can't open. */
  const openPage = (open: () => Promise<unknown>, fallback: string) =>
    attempt(async () => {
      await open();
      close();
    }, fallback);

  const loadUnpacked = () =>
    attempt(async () => {
      picking.current = true;
      try {
        const reason = await api().loadUnpackedExtension();
        if (reason) setProblem(reason);
      } finally {
        picking.current = false;
      }
    }, 'That folder couldn’t be loaded.');

  return (
    <>
      <div className="absolute inset-0" aria-hidden />
      <AnchoredPanel
        width={340}
        label="Extensions"
        alignEndTo={EXTENSIONS_BUTTON_ID}
        modal
      >
        <div ref={content} className="flex min-h-0 flex-col">
          <div className="flex shrink-0 items-baseline justify-between gap-3 px-4 pt-3 pb-1.5">
            <h2 className="font-medium">Extensions</h2>
          </div>
          {problem && (
            <p
              role="alert"
              className="px-4 pb-1.5 text-small leading-copy text-danger"
            >
              {problem}
            </p>
          )}
          {extensions?.length === 0 ? (
            <PanelState
              icon={Puzzle}
              title="No extensions yet"
              detail="Add some from the Chrome Web Store or from a folder."
            />
          ) : (
            <ul className="flex min-h-0 flex-col gap-px overflow-y-auto overscroll-contain px-1.5 pb-1.5">
              {extensions?.map((extension) => (
                <ExtensionItem
                  key={extension.id}
                  extension={extension}
                  confirming={confirming === extension.id}
                  onConfirm={(asking) =>
                    setConfirming(asking ? extension.id : null)
                  }
                  onToggle={(enabled) =>
                    void attempt(
                      () => api().setExtensionEnabled(extension.id, enabled),
                      `${extension.name} couldn’t be turned ${enabled ? 'on' : 'off'}.`,
                    )
                  }
                  onOptions={() =>
                    void openPage(
                      () => api().openExtensionPage(extension.optionsUrl!),
                      'That page couldn’t be opened.',
                    )
                  }
                  onRemove={() => {
                    setConfirming(null);
                    void attempt(
                      () => api().removeExtension(extension.id),
                      `${extension.name} couldn’t be removed.`,
                    );
                  }}
                />
              ))}
            </ul>
          )}
          <div className="flex shrink-0 items-center gap-1 border-t border-divider py-1.5 pr-1.5 pl-1.5">
            <button
              type="button"
              className="button button-sm"
              onClick={() =>
                void openPage(
                  () => api().openWebStore(),
                  'The Chrome Web Store couldn’t be opened.',
                )
              }
            >
              <Store size={13} />
              Get extensions
            </button>
            <button
              type="button"
              className="button button-sm"
              onClick={() => void loadUnpacked()}
            >
              <FolderOpen size={13} />
              Load from folder…
            </button>
            <button
              type="button"
              onClick={() => {
                close();
                void api()
                  .manageExtensions()
                  .catch(() => undefined);
              }}
              aria-label="Extension settings"
              title="Extension settings"
              className="icon-button ml-auto size-7 shrink-0"
            >
              <Settings size={14} />
            </button>
          </div>
        </div>
      </AnchoredPanel>
    </>
  );
}

function ExtensionItem({
  extension,
  confirming,
  onConfirm,
  onToggle,
  onOptions,
  onRemove,
}: {
  extension: ExtensionInfo;
  confirming: boolean;
  onConfirm(asking: boolean): void;
  onToggle(enabled: boolean): void;
  onOptions(): void;
  onRemove(): void;
}) {
  const { name, enabled, source } = extension;
  const removable = source !== 'bundled';
  return (
    <li className="group flex min-h-11 items-center gap-2.5 rounded-row px-2.5 py-1.5 hover:bg-row-hover">
      <span
        className="flex size-5 shrink-0 items-center justify-center data-[off=true]:opacity-45"
        data-off={!enabled}
      >
        {extension.iconUrl ? (
          <img src={extension.iconUrl} alt="" className="size-5" />
        ) : (
          <Puzzle size={16} className="text-fg-subtle" />
        )}
      </span>
      {confirming ? (
        <>
          <span className="min-w-0 flex-1 truncate text-small text-fg-muted">
            Remove {name}?
          </span>
          <button
            type="button"
            className="button button-sm"
            onClick={() => onConfirm(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button button-sm button-danger"
            onClick={onRemove}
          >
            Remove
          </button>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1">
            <span
              className="block truncate data-[off=true]:text-fg-muted"
              data-off={!enabled}
            >
              {name}
            </span>
            {!enabled && (
              <span className="block text-small text-fg-subtle">Off</span>
            )}
          </span>
          <span className="flex shrink-0 items-center opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
            {extension.optionsUrl && enabled && (
              <button
                type="button"
                className="icon-button size-7"
                aria-label={`${name} options`}
                title="Options"
                onClick={onOptions}
              >
                <Settings size={14} />
              </button>
            )}
            {removable && (
              <button
                type="button"
                className="icon-button size-7"
                aria-label={`Remove ${name}`}
                title="Remove"
                onClick={() => onConfirm(true)}
              >
                <Trash2 size={14} />
              </button>
            )}
          </span>
          <button
            type="button"
            role="switch"
            aria-label={`Turn on ${name}`}
            aria-checked={enabled}
            onClick={() => onToggle(!enabled)}
            className="switch shrink-0"
          >
            <span className="switch-knob" />
          </button>
        </>
      )}
    </li>
  );
}
