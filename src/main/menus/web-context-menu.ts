import {
  clipboard,
  type ContextMenuParams,
  type MenuItemConstructorOptions,
  type WebContents,
} from 'electron';
import { isNavigableUrl, searchUrl } from '../browser/url';

export interface WebContextMenuActions {
  openChild(url: string, options: { background: boolean }): void;
  back(): void;
  forward(): void;
  reload(): void;
  canGoBack: boolean;
  canGoForward: boolean;
}

const separator: MenuItemConstructorOptions = { type: 'separator' };

function truncate(text: string, length: number): string {
  const single = text.replace(/\s+/g, ' ').trim();
  return single.length > length ? `${single.slice(0, length - 1)}…` : single;
}

/** Drops leading, trailing and doubled separators. */
function tidy(
  items: MenuItemConstructorOptions[],
): MenuItemConstructorOptions[] {
  return items.filter((item, index, all) => {
    if (item.type !== 'separator') return true;
    const previous = all[index - 1];
    return (
      index > 0 && index < all.length - 1 && previous?.type !== 'separator'
    );
  });
}

/** The right-click menu inside a web page, shaped by what was clicked. */
export function webContextMenu(
  contents: WebContents,
  params: ContextMenuParams,
  actions: WebContextMenuActions,
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [];
  const { editFlags } = params;

  if (params.misspelledWord) {
    const suggestions = params.dictionarySuggestions.slice(0, 4);
    for (const suggestion of suggestions) {
      items.push({
        label: suggestion,
        click: () => contents.replaceMisspelling(suggestion),
      });
    }
    if (suggestions.length === 0) {
      items.push({ label: 'No Guesses Found', enabled: false });
    }
    items.push(separator);
  }

  if (params.linkURL && isNavigableUrl(params.linkURL)) {
    const link = params.linkURL;
    items.push(
      {
        label: 'Open Link as Child Page',
        click: () => actions.openChild(link, { background: false }),
      },
      {
        label: 'Open Link in Background',
        click: () => actions.openChild(link, { background: true }),
      },
      { label: 'Copy Link Address', click: () => clipboard.writeText(link) },
      separator,
    );
  }

  if (params.mediaType === 'image' && isNavigableUrl(params.srcURL)) {
    const source = params.srcURL;
    items.push(
      {
        label: 'Open Image as Child Page',
        click: () => actions.openChild(source, { background: false }),
      },
      {
        label: 'Copy Image',
        click: () => contents.copyImageAt(params.x, params.y),
      },
      {
        label: 'Copy Image Address',
        click: () => clipboard.writeText(source),
      },
      separator,
    );
  }

  if (params.isEditable) {
    items.push(
      {
        label: 'Undo',
        enabled: editFlags.canUndo,
        click: () => contents.undo(),
      },
      {
        label: 'Redo',
        enabled: editFlags.canRedo,
        click: () => contents.redo(),
      },
      separator,
      { label: 'Cut', enabled: editFlags.canCut, click: () => contents.cut() },
      {
        label: 'Copy',
        enabled: editFlags.canCopy,
        click: () => contents.copy(),
      },
      {
        label: 'Paste',
        enabled: editFlags.canPaste,
        click: () => contents.paste(),
      },
      {
        label: 'Select All',
        enabled: editFlags.canSelectAll,
        click: () => contents.selectAll(),
      },
      separator,
    );
  } else if (params.selectionText.trim()) {
    const text = params.selectionText;
    items.push(
      { label: 'Copy', click: () => contents.copy() },
      {
        label: `Search for “${truncate(text, 28)}”`,
        click: () =>
          actions.openChild(searchUrl(truncate(text, 400)), {
            background: false,
          }),
      },
      separator,
    );
  }

  const onPlainPage =
    !params.linkURL &&
    !params.isEditable &&
    !params.selectionText.trim() &&
    params.mediaType === 'none';
  if (onPlainPage) {
    items.push(
      { label: 'Back', enabled: actions.canGoBack, click: actions.back },
      {
        label: 'Forward',
        enabled: actions.canGoForward,
        click: actions.forward,
      },
      { label: 'Reload', click: actions.reload },
      separator,
    );
  }

  items.push({
    label: 'Inspect Element',
    click: () => contents.inspectElement(params.x, params.y),
  });

  return tidy(items);
}
