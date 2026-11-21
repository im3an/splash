import { useEffect, useRef } from 'react';
import { Download, FolderOpen } from '../icons';
import { popoverDownloads } from '../../shared/downloads';
import { downloadsSummary } from '../lib/format';
import { api } from '../splash-api';
import { useDownloads } from '../stores/downloads-store';
import { useOverlay } from '../stores/overlay-store';
import { useShell } from '../stores/shell-store';
import { AnchoredPanel } from './AnchoredPanel';
import { DownloadRow } from './DownloadRow';
import { PanelState } from './PanelState';

export const DOWNLOADS_BUTTON_ID = 'downloads-button';

/**
 * Progress at a glance, from the toolbar's downloads button: what's running,
 * then what just finished. The page is frozen behind it like any overlay, so
 * it only ever opens on request, and leaves as soon as attention goes elsewhere.
 */
export function DownloadsPopover() {
  const downloads = useDownloads((state) => state.downloads);
  const markSeen = useDownloads((state) => state.markSeen);
  const close = useOverlay((state) => state.close);
  const setPanel = useShell((state) => state.setSidebarPanel);
  const panelShowing = useShell(
    (state) => state.sidebarOpen && state.sidebarPanel === 'downloads',
  );
  const content = useRef<HTMLDivElement>(null);

  useEffect(() => {
    markSeen();
  }, [markSeen, downloads]);

  // ⌥⌘L shows the whole list, which makes this one redundant.
  useEffect(() => {
    if (panelShowing) close();
  }, [panelShowing, close]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    // The page area's backdrop can't see clicks on the toolbar or sidebar. The
    // button is left out because it closes this itself.
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        !content.current?.contains(target) &&
        !document.getElementById(DOWNLOADS_BUTTON_ID)?.contains(target)
      ) {
        close();
      }
    };
    // Opening a file or showing it in Finder moves to another app. A missing
    // file doesn't, so the row can still say what went wrong. Any other way of
    // leaving Splash also shouldn't strand a frozen page behind this.
    const onBlur = () => close();
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('blur', onBlur);
    };
  }, [close]);

  const rows = popoverDownloads(downloads);
  const summary = downloadsSummary(downloads);

  return (
    <>
      <div className="absolute inset-0" aria-hidden />
      <AnchoredPanel
        width={360}
        label="Downloads"
        alignEndTo={DOWNLOADS_BUTTON_ID}
        modal
      >
        <div ref={content} className="flex min-h-0 flex-col">
          {rows.length === 0 ? (
            <PanelState
              icon={Download}
              title="No downloads yet"
              detail="Files you download show their progress here."
            />
          ) : (
            <>
              <div className="flex shrink-0 items-baseline justify-between gap-3 px-4 pt-3 pb-1.5">
                <h2 className="font-medium">Downloads</h2>
                {summary && (
                  <p className="min-w-0 truncate text-small text-fg-subtle">
                    {summary}
                  </p>
                )}
              </div>
              <ul className="flex min-h-0 flex-col gap-px overflow-y-auto overscroll-contain px-1.5 pb-1.5">
                {rows.map((download) => (
                  <DownloadRow key={download.id} download={download} />
                ))}
              </ul>
            </>
          )}
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-divider py-1.5 pr-1.5 pl-2.5">
            {rows.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  close();
                  setPanel('downloads');
                }}
                className="button button-sm"
              >
                Show all downloads
              </button>
            )}
            <button
              type="button"
              onClick={() => void api().openDownloadsFolder()}
              aria-label="Open Downloads folder"
              title="Open Downloads folder"
              className="icon-button ml-auto size-7 shrink-0"
            >
              <FolderOpen size={14} />
            </button>
          </div>
        </div>
      </AnchoredPanel>
    </>
  );
}
