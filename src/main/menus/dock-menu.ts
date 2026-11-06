import type { MenuItemConstructorOptions } from 'electron';
import type { TrailStore } from '../storage/trail-store';
import { recentHistory, shorten, visitLabel } from './application-menu';

/** A Dock menu is read at a glance, so it lists fewer than the History menu. */
const DOCK_RECENT_LENGTH = 6;

export interface DockMenuActions {
  store: Pick<TrailStore, 'frequentHistory'>;
  newWindow(): void;
  openPage(url: string): void;
}

/** What Splash adds to its Dock menu; macOS adds the open windows itself. */
export function dockMenuTemplate(
  actions: DockMenuActions,
): MenuItemConstructorOptions[] {
  const recent = recentHistory(actions.store, null, DOCK_RECENT_LENGTH);
  return [
    { label: 'New Window', click: () => actions.newWindow() },
    ...(recent.length > 0
      ? ([
          { type: 'separator' },
          { label: 'Recent Pages', enabled: false },
          ...recent.map((match) => ({
            label: shorten(visitLabel(match)),
            click: () => actions.openPage(match.url),
          })),
        ] as MenuItemConstructorOptions[])
      : []),
  ];
}
