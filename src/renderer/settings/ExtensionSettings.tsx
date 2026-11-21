import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, FolderOpen, Puzzle, Store } from '../icons';
import type { ExtensionInfo, ExtensionSource } from '../../shared/types';
import { api } from '../splash-api';
import { Button, Section, Toggle } from './controls';

const SOURCE_LABELS: Record<ExtensionSource, string> = {
  bundled: 'Comes with Splash',
  store: 'Chrome Web Store',
  unpacked: 'Loaded from a folder',
};

/** What happened last, shown over the list until the next thing happens. */
type Status =
  | { kind: 'problem'; message: string }
  | { kind: 'removed'; name: string; storeUrl: string | null };

/**
 * The extensions Splash has: what each one is, what it can reach, and a way to
 * turn it off, set it up or remove it. Follows changes made elsewhere, such as
 * an Add click in the Chrome Web Store.
 */
export function ExtensionSettings() {
  const [extensions, setExtensions] = useState<ExtensionInfo[] | null>(null);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    void api().listExtensions().then(setExtensions);
    return api().onExtensions(setExtensions);
  }, []);

  // Everything here can fail on disk or in Chromium; say so where it happened.
  const attempt = useCallback(
    async (action: () => Promise<unknown>, fallback: string) => {
      setStatus(null);
      try {
        await action();
      } catch {
        setStatus({ kind: 'problem', message: fallback });
      }
    },
    [],
  );

  const loadUnpacked = () =>
    attempt(async () => {
      const problem = await api().loadUnpackedExtension();
      if (problem) setStatus({ kind: 'problem', message: problem });
    }, 'That folder couldn’t be loaded.');

  return (
    <>
      <p className="-mt-4 leading-copy text-fg-muted">
        Extensions can read and change the sites their permissions allow. Only
        add ones you trust. Some need Chrome features Splash doesn’t have yet,
        and may not work fully.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          tone="primary"
          onClick={() =>
            void attempt(
              () => api().openWebStore(),
              'The Chrome Web Store couldn’t be opened.',
            )
          }
        >
          <Store size={13} />
          Get extensions
        </Button>
        <Button onClick={() => void loadUnpacked()}>
          <FolderOpen size={13} />
          Load from folder…
        </Button>
      </div>
      {status && (
        <p
          role={status.kind === 'problem' ? 'alert' : 'status'}
          className="-my-3 leading-copy text-fg-muted data-[problem=true]:text-danger"
          data-problem={status.kind === 'problem'}
        >
          {status.kind === 'problem' ? (
            status.message
          ) : (
            <>
              Removed {status.name}.{' '}
              {status.storeUrl && (
                <button
                  type="button"
                  className="font-medium text-fg underline-offset-2 hover:underline"
                  onClick={() =>
                    void attempt(
                      () => api().openExtensionPage(status.storeUrl!),
                      'The Chrome Web Store couldn’t be opened.',
                    )
                  }
                >
                  Get it again
                </button>
              )}
            </>
          )}
        </p>
      )}
      {extensions?.length === 0 && (
        <p className="leading-copy text-fg-muted">No extensions yet.</p>
      )}
      {extensions && extensions.length > 0 && (
        <Section title="Installed">
          {extensions.map((extension) => (
            <ExtensionRow
              key={extension.id}
              extension={extension}
              onToggle={(enabled) =>
                void attempt(
                  () => api().setExtensionEnabled(extension.id, enabled),
                  `${extension.name} couldn’t be turned ${enabled ? 'on' : 'off'}.`,
                )
              }
              onOpen={(url) =>
                void attempt(
                  () => api().openExtensionPage(url),
                  'That page couldn’t be opened.',
                )
              }
              onRemove={() =>
                void attempt(async () => {
                  await api().removeExtension(extension.id);
                  setStatus({
                    kind: 'removed',
                    name: extension.name,
                    storeUrl: extension.storeUrl,
                  });
                }, `${extension.name} couldn’t be removed.`)
              }
            />
          ))}
        </Section>
      )}
    </>
  );
}

function ExtensionRow({
  extension,
  onToggle,
  onOpen,
  onRemove,
}: {
  extension: ExtensionInfo;
  onToggle(enabled: boolean): void;
  onOpen(url: string): void;
  onRemove(): void;
}) {
  const { name, enabled, warnings, source } = extension;
  const [confirming, setConfirming] = useState(false);
  const [showingReach, setShowingReach] = useState(false);

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div
        className="flex size-8 shrink-0 items-center justify-center data-[off=true]:opacity-50"
        data-off={!enabled}
      >
        {extension.iconUrl ? (
          <img src={extension.iconUrl} alt="" className="size-8" />
        ) : (
          <Puzzle size={20} className="text-fg-subtle" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate">
          <span className="font-medium">{name}</span>{' '}
          <span className="text-small text-fg-subtle">{extension.version}</span>
        </p>
        {extension.description && (
          <p className="mt-0.5 line-clamp-2 text-small leading-copy text-fg-muted">
            {extension.description}
          </p>
        )}
        <p className="mt-0.5 text-small text-fg-subtle">
          {SOURCE_LABELS[source]}
          {!enabled && ' · Off'}
        </p>
        {showingReach && (
          <ul className="mt-1.5 flex list-disc flex-col gap-0.5 pl-4 text-small leading-copy text-fg-muted">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
        {confirming ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-small text-fg-muted">
              Remove {name}
              {source === 'store' ? ' and its files' : ''}?
            </span>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button
              tone="danger"
              onClick={() => {
                setConfirming(false);
                onRemove();
              }}
            >
              Remove
            </Button>
          </div>
        ) : (
          <div className="mt-1 flex flex-wrap gap-x-3 text-small font-medium text-fg-muted">
            {warnings.length > 0 && (
              <button
                type="button"
                aria-expanded={showingReach}
                className="flex items-center gap-0.5 hover:text-fg"
                onClick={() => setShowingReach((open) => !open)}
              >
                <ChevronRight
                  size={12}
                  className="transition-transform duration-fast data-[open=true]:rotate-90"
                  data-open={showingReach}
                />
                What it can do
              </button>
            )}
            {extension.optionsUrl && enabled && (
              <button
                type="button"
                className="hover:text-fg"
                onClick={() => onOpen(extension.optionsUrl!)}
              >
                Options
              </button>
            )}
            {extension.storeUrl && (
              <button
                type="button"
                className="hover:text-fg"
                onClick={() => onOpen(extension.storeUrl!)}
              >
                View in store
              </button>
            )}
            {source !== 'bundled' && (
              <button
                type="button"
                className="hover:text-fg"
                aria-label={`Remove ${name}`}
                onClick={() => setConfirming(true)}
              >
                Remove
              </button>
            )}
          </div>
        )}
      </div>
      <Toggle label={`Turn on ${name}`} checked={enabled} onChange={onToggle} />
    </div>
  );
}
