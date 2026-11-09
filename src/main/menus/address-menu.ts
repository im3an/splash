import type { MenuItemConstructorOptions } from 'electron';
import type { CopyFormat } from '../../shared/page-link';

/** The right-click menu of the address field. */
export function addressMenuItems(actions: {
  /** The active page has an address to copy. */
  hasAddress: boolean;
  pasteAndGo(): void;
  copyAs(format: CopyFormat): void;
}): MenuItemConstructorOptions[] {
  return [
    { role: 'cut' },
    { role: 'copy' },
    { role: 'paste' },
    { label: 'Paste and Go', click: actions.pasteAndGo },
    { type: 'separator' },
    {
      label: 'Copy as Markdown',
      enabled: actions.hasAddress,
      click: () => actions.copyAs('markdown'),
    },
    {
      label: 'Copy as Plain Text',
      enabled: actions.hasAddress,
      click: () => actions.copyAs('text'),
    },
    { type: 'separator' },
    { role: 'selectAll' },
  ];
}
