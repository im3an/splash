import {
  clipboard,
  type ContextMenuParams,
  type MenuItemConstructorOptions,
  type WebContents,
} from 'electron';
import { markdownLink } from '../../shared/page-link';
import { isNavigableUrl } from '../browser/url';

export interface WebContextMenuActions {
  openChild(url: string, options: { background: boolean }): void;
  /** Floats the page's video above other windows, or brings it back. */
  pictureInPicture(): void;
  back(): void;
  forward(): void;
  reload(): void;
  print(): void;
  searchUrlFor(query: string): string;
  canGoBack: boolean;
  canGoForward: boolean;
  /** Confirms a copy; `subject` is the host a copied address points to. */
  copied(
    what: 'link' | 'image' | 'image-address' | 'markdown',
    subject: string | null,
  ): void;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
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
      {
        label: 'Download Linked File',
        click: () => contents.downloadURL(link),
      },
      {
        label: 'Copy Link Address',
        click: () => {
          clipboard.writeText(link);
          actions.copied('link', hostOf(link));
        },
      },
      {
        label: 'Copy Link as Markdown',
        click: () => {
          clipboard.writeText(markdownLink(params.linkText, link));
          actions.copied('markdown', params.linkText.trim() || hostOf(link));
        },
      },
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
        label: 'Download Image',
        click: () => contents.downloadURL(source),
      },
      {
        label: 'Copy Image',
        click: () => {
          contents.copyImageAt(params.x, params.y);
          actions.copied('image', null);
        },
      },
      {
        label: 'Copy Image Address',
        click: () => {
          clipboard.writeText(source);
          actions.copied('image-address', hostOf(source));
        },
      },
      separator,
    );
  }

  if (params.mediaType === 'video') {
    const source = isNavigableUrl(params.srcURL) ? params.srcURL : null;
    items.push(
      { label: 'Picture in Picture', click: actions.pictureInPicture },
      ...(source
        ? [
            {
              label: 'Open Video as Child Page',
              click: () => actions.openChild(source, { background: false }),
            },
            {
              label: 'Download Video',
              click: () => contents.downloadURL(source),
            },
            {
              label: 'Copy Video Address',
              click: () => {
                clipboard.writeText(source);
                actions.copied('link', null);
              },
            },
          ]
        : []),
      { type: 'separator' as const },
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
      ...(process.platform === 'darwin'
        ? [
            {
              label: `Look Up “${truncate(text, 28)}”`,
              click: () => contents.showDefinitionForSelection(),
            },
          ]
        : []),
      {
        label: `Search for “${truncate(text, 28)}”`,
        click: () =>
          actions.openChild(actions.searchUrlFor(truncate(text, 400)), {
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
      { label: 'Print…', click: actions.print },
      separator,
    );
  }

  items.push({
    label: 'Inspect Element',
    click: () => contents.inspectElement(params.x, params.y),
  });

  return tidy(items);
}
