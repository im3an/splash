import { useRef, useState, type MouseEvent } from 'react';
import {
  ChevronRight,
  Copy,
  Folder,
  FolderOpen,
  FolderPlus,
  Layers,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import type { SavedCollection } from '../../shared/preferences';
import { api } from '../splash-api';
import {
  bookmarkPage,
  collectionBranch,
  collectionNotice,
  updateLibrary,
  webLink,
} from '../lib/collections';
import { useToast } from '../stores/toast-store';
import { selectActivePage, useShell } from '../stores/shell-store';
import { ContextMenu, type MenuEntry } from './ContextMenu';
import { SavedSiteIcon } from './SavedSiteIcon';

const EMPTY: SavedCollection[] = [];
type Editor = {
  kind: 'folder' | 'group';
  id?: string;
  parentId?: string | null;
  name: string;
};
type SavedLink = SavedCollection['links'][number];

export function BookmarkLibrary() {
  const collections = useShell(
    (state) => state.preferences?.collections ?? EMPTY,
  );
  const page = useShell(selectActivePage);
  const ready = useShell((state) => state.preferences !== null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const editorReturnFocus = useRef<HTMLElement | null>(null);
  const [menu, setMenu] = useState<{
    entries: MenuEntry[];
    x: number;
    y: number;
    element: HTMLElement;
    left: number;
    right: number;
    keyboard: boolean;
    serial: number;
  } | null>(null);
  const serial = useRef(0);
  const openingRef = useRef(false);
  const [progress, setProgress] = useState<{
    id: string;
    done: number;
    total: number;
  } | null>(null);
  const [retry, setRetry] = useState<{
    item: SavedCollection;
    links: SavedLink[];
    root?: string;
  } | null>(null);
  const [openingLink, setOpeningLink] = useState<string | null>(null);
  const beginEdit = (next: Editor) => {
    if (savingRef.current) return;
    editorReturnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setError('');
    setEditor(next);
  };
  const closeEditor = () => {
    if (savingRef.current) return;
    setEditor(null);
    requestAnimationFrame(() => {
      if (editorReturnFocus.current?.isConnected)
        editorReturnFocus.current.focus({ preventScroll: true });
    });
  };
  const openAll = async (
    item: SavedCollection,
    remaining?: SavedLink[],
    previousRoot?: string,
  ) => {
    if (openingRef.current) return;
    const links =
      remaining ??
      collections
        .filter((saved) => collectionBranch(collections, item.id).has(saved.id))
        .flatMap((saved) => saved.links);
    if (!links.length) return;
    openingRef.current = true;
    setRetry(null);
    let root = previousRoot;
    let done = 0;
    try {
      setProgress({ id: item.id, done: 0, total: links.length });
      for (const link of links) {
        if (!root) root = await api().createPage(link.url);
        else {
          await api().createChildPage(root, link.url);
        }
        done++;
        setProgress({ id: item.id, done, total: links.length });
      }
      if (root) await api().activatePage(root);
      collectionNotice(
        `Opened ${done} ${done === 1 ? 'page' : 'pages'} from ${item.name}.`,
      );
    } catch {
      if (done < links.length)
        setRetry({ item, links: links.slice(done), root });
      else
        collectionNotice(
          'Pages opened, but the group could not be selected. Select it in Open pages.',
        );
    } finally {
      openingRef.current = false;
      setProgress(null);
    }
  };
  const show = (
    event: MouseEvent<HTMLElement>,
    entries: MenuEntry[],
    anchored = false,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>('button')
        : null;
    const element =
      target ??
      (document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
        ? document.activeElement
        : event.currentTarget);
    const rect = element.getBoundingClientRect();
    const sidebar = element.closest('aside')?.getBoundingClientRect();
    const keyboard = event.clientX === 0 && event.clientY === 0;
    setMenu({
      entries,
      x: anchored || keyboard ? rect.left : event.clientX,
      y: anchored || keyboard ? rect.bottom : event.clientY,
      element,
      left: sidebar?.left ?? 0,
      right: sidebar?.right ?? 260,
      keyboard,
      serial: ++serial.current,
    });
  };
  const save = async () => {
    if (!editor?.name.trim() || savingRef.current) return;
    const draft = editor;
    savingRef.current = true;
    setSaving(true);
    setError('');
    const snapshot = useShell.getState().snapshot;
    const links =
      draft.kind === 'group' && !draft.id && snapshot
        ? Object.values(snapshot.pages)
            .map(webLink)
            .filter((link): link is NonNullable<typeof link> => link !== null)
        : [];
    const saved = await updateLibrary((items) =>
      draft.id
        ? items.map((item) =>
            item.id === draft.id ? { ...item, name: draft.name.trim() } : item,
          )
        : [
            ...items,
            {
              id: crypto.randomUUID(),
              name: draft.name.trim(),
              kind: draft.kind,
              parentId: draft.parentId ?? null,
              collapsed: false,
              links,
            },
          ].map((item) =>
            item.id === draft.parentId ? { ...item, collapsed: false } : item,
          ),
    );
    savingRef.current = false;
    setSaving(false);
    if (saved) {
      closeEditor();
      collectionNotice(
        draft.id
          ? 'Name updated.'
          : draft.kind === 'group'
            ? `Saved ${links.length} pages as ${draft.name.trim()}.`
            : `Created ${draft.name.trim()}.`,
      );
    } else {
      setError('Could not save. Your name is kept here. Try again.');
      requestAnimationFrame(() =>
        document.getElementById('collection-name')?.focus(),
      );
    }
  };
  const createEntries: MenuEntry[] = [
    {
      kind: 'action',
      label: 'New Bookmark Folder…',
      icon: <FolderPlus size={14} />,
      run: () => beginEdit({ kind: 'folder', name: '' }),
    },
    {
      kind: 'action',
      label: 'Save Open Pages as Group…',
      icon: <Layers size={14} />,
      run: () => beginEdit({ kind: 'group', name: '' }),
    },
  ];
  const undo = (
    message: string,
    restore: (items: SavedCollection[]) => SavedCollection[],
  ) =>
    useToast.getState().show({
      message,
      detail: null,
      durationMs: 7000,
      actions: [
        {
          label: 'Undo',
          icon: 'undo',
          run: () => {
            void updateLibrary(restore);
          },
        },
      ],
    });
  const deleteCollection = (item: SavedCollection) => {
    let branch = new Set<string>();
    let removed: SavedCollection[] = [];
    void updateLibrary((items) => {
      branch = collectionBranch(items, item.id);
      removed = items.filter((saved) => branch.has(saved.id));
      return items.filter((saved) => !branch.has(saved.id));
    }).then((saved) => {
      if (saved)
        undo(`Deleted ${item.name}`, (items) => {
          const ids = new Set(items.map((saved) => saved.id));
          return [
            ...items,
            ...removed
              .filter((saved) => !ids.has(saved.id))
              .map((saved) => ({
                ...saved,
                parentId:
                  saved.parentId &&
                  (ids.has(saved.parentId) || branch.has(saved.parentId))
                    ? saved.parentId
                    : null,
              })),
          ];
        });
    });
  };

  const copy = (links: SavedLink[]) => {
    void navigator.clipboard
      .writeText(links.map((link) => `${link.title}\n${link.url}`).join('\n\n'))
      .then(() => collectionNotice('Links copied to share.'))
      .catch(() => collectionNotice('Could not copy links. Try again.'));
  };
  const folderDestinations = (item: SavedCollection) => {
    const branch = collectionBranch(collections, item.id);
    return collections.filter(
      (target) => target.kind === 'folder' && !branch.has(target.id),
    );
  };
  const collectionEntries = (item: SavedCollection): MenuEntry[] => {
    const branchLinks = collections
      .filter((saved) => collectionBranch(collections, item.id).has(saved.id))
      .flatMap((saved) => saved.links);
    return [
      {
        kind: 'action',
        label: `Open All (${branchLinks.length})`,
        icon: <Play size={14} />,
        disabled: !branchLinks.length || Boolean(progress),
        run: () => {
          void openAll(item);
        },
      },
      {
        kind: 'action',
        label: 'Add Current Page',
        icon: <Plus size={14} />,
        disabled: !page?.url || !/^https?:\/\//i.test(page.url),
        run: () => {
          if (page) void bookmarkPage(page, item.id);
        },
      },
      ...(item.kind === 'folder'
        ? [
            {
              kind: 'action' as const,
              label: 'New Subfolder…',
              icon: <FolderPlus size={14} />,
              run: () =>
                beginEdit({ kind: 'folder', name: '', parentId: item.id }),
            },
          ]
        : []),
      {
        kind: 'action',
        label: 'Rename…',
        icon: <Pencil size={14} />,
        run: () => beginEdit({ id: item.id, kind: item.kind, name: item.name }),
      },
      {
        kind: 'submenu',
        label: 'Move Collection',
        icon: <Folder size={14} />,
        entries: [
          {
            kind: 'action',
            label: 'Top Level',
            icon: <Layers size={14} />,
            disabled: !item.parentId,
            run: () => {
              void updateLibrary((items) =>
                items.map((saved) =>
                  saved.id === item.id ? { ...saved, parentId: null } : saved,
                ),
              );
            },
          },
          ...folderDestinations(item).map((target) => ({
            kind: 'action' as const,
            label: target.name,
            icon: <Folder size={14} />,
            disabled: item.parentId === target.id,
            run: () => {
              void updateLibrary((items) =>
                items.map((saved) =>
                  saved.id === item.id
                    ? { ...saved, parentId: target.id }
                    : saved.id === target.id
                      ? { ...saved, collapsed: false }
                      : saved,
                ),
              );
            },
          })),
        ],
      },
      {
        kind: 'action',
        label: 'Copy Links to Share',
        icon: <Copy size={14} />,
        disabled: !branchLinks.length,
        run: () => copy(branchLinks),
      },
      { kind: 'separator' },
      {
        kind: 'action',
        label: 'Delete Collection',
        icon: <Trash2 size={14} />,
        run: () => deleteCollection(item),
      },
    ];
  };
  const linkEntries = (item: SavedCollection, link: SavedLink): MenuEntry[] => [
    {
      kind: 'action',
      label: 'Open in New Page',
      icon: <Plus size={14} />,
      run: () => {
        void openLink(link);
      },
    },
    {
      kind: 'action',
      label: 'Copy Link',
      icon: <Copy size={14} />,
      run: () => copy([link]),
    },
    {
      kind: 'submenu',
      label: 'Move to Folder',
      icon: <Folder size={14} />,
      entries: collections
        .filter((target) => target.kind === 'folder' && target.id !== item.id)
        .map((target) => ({
          kind: 'action',
          label: target.name,
          icon: <Folder size={14} />,
          run: () => {
            void updateLibrary((items) =>
              items.map((saved) =>
                saved.id === item.id
                  ? {
                      ...saved,
                      links: saved.links.filter(
                        (value) => value.id !== link.id,
                      ),
                    }
                  : saved.id === target.id
                    ? {
                        ...saved,
                        collapsed: false,
                        links: saved.links.some(
                          (value) => value.url === link.url,
                        )
                          ? saved.links
                          : [...saved.links, link],
                      }
                    : saved,
              ),
            );
          },
        })),
    },
    { kind: 'separator' },
    {
      kind: 'action',
      label: 'Remove Saved Link',
      icon: <Trash2 size={14} />,
      run: () => {
        void updateLibrary((items) =>
          items.map((saved) =>
            saved.id === item.id
              ? {
                  ...saved,
                  links: saved.links.filter((value) => value.id !== link.id),
                }
              : saved,
          ),
        ).then((saved) => {
          if (saved)
            undo('Removed saved link', (items) =>
              items.map((saved) =>
                saved.id === item.id &&
                !saved.links.some((value) => value.id === link.id)
                  ? { ...saved, links: [...saved.links, link] }
                  : saved,
              ),
            );
        });
      },
    },
  ];
  const openLink = async (link: SavedLink) => {
    if (openingLink) return;
    setOpeningLink(link.id);
    try {
      const snapshot = useShell.getState().snapshot;
      const existing =
        snapshot &&
        Object.values(snapshot.pages).find((page) => page.url === link.url);
      if (existing) await api().activatePage(existing.id);
      else await api().createPage(link.url);
    } catch {
      collectionNotice('Could not open saved link. Try again.');
    } finally {
      setOpeningLink(null);
    }
  };
  const renderCollection = (
    item: SavedCollection,
    depth = 0,
    flattened = false,
  ): React.ReactNode => {
    const children = collections.filter((saved) => saved.parentId === item.id);
    const busy = progress?.id === item.id;
    return (
      <div
        key={item.id}
        className="library-branch"
        data-flattened={flattened}
        data-deep={depth >= 4}
        style={{ '--library-depth': depth } as React.CSSProperties}
      >
        {!flattened && (
          <div
            className="library-folder group"
            data-collapsed={item.collapsed}
            data-menu-open={menu?.element.dataset.collectionId === item.id}
            onContextMenu={(event) => show(event, collectionEntries(item))}
          >
            <button
              className="library-folder-toggle"
              aria-label={`${item.name}, ${item.links.length + children.length} items`}
              aria-expanded={!item.collapsed}
              onClick={() => {
                void updateLibrary((items) =>
                  items.map((saved) =>
                    saved.id === item.id
                      ? { ...saved, collapsed: !saved.collapsed }
                      : saved,
                  ),
                );
              }}
            >
              <ChevronRight
                size={12}
                className="library-chevron"
                style={{
                  transform: item.collapsed ? undefined : 'rotate(90deg)',
                }}
              />
              {item.kind === 'group' ? (
                <Layers size={15} className="text-fg-muted" />
              ) : item.collapsed ? (
                <Folder size={15} className="text-fg-muted" />
              ) : (
                <FolderOpen size={15} className="text-fg-muted" />
              )}
              <span className="min-w-0 flex-1 truncate font-medium">
                {item.name}
              </span>
            </button>
            {item.collapsed && item.links.length + children.length > 0 && (
              <span className="library-count">
                {item.links.length + children.length}
              </span>
            )}
            <button
              className="library-more icon-button size-6"
              data-collection-id={item.id}
              aria-label={`Actions for ${item.name}`}
              title={`Actions for ${item.name}`}
              onClick={(event) => show(event, collectionEntries(item), true)}
            >
              <MoreHorizontal size={14} />
            </button>
          </div>
        )}
        {busy && (
          <div className="library-status" role="status">
            Opening {progress.done} of {progress.total} pages…
          </div>
        )}
        {(flattened || !item.collapsed) && (
          <div className="library-children">
            {item.links.map((link) => (
              <div
                key={link.id}
                className="library-link group"
                data-current={page?.url === link.url}
              >
                <button
                  className="library-link-main"
                  disabled={openingLink === link.id}
                  aria-current={page?.url === link.url ? 'page' : undefined}
                  title={`${link.title}\n${link.url}`}
                  onClick={() => {
                    void openLink(link);
                  }}
                  onContextMenu={(event) =>
                    show(event, linkEntries(item, link))
                  }
                >
                  {openingLink === link.id ? (
                    <span className="spinner" />
                  ) : (
                    <SavedSiteIcon
                      url={link.url}
                      faviconUrl={link.faviconUrl}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {link.title || new URL(link.url).hostname}
                  </span>
                </button>
                <button
                  className="library-more icon-button size-6"
                  aria-label={`Actions for ${link.title || link.url}`}
                  title="Saved link actions"
                  onClick={(event) =>
                    show(event, linkEntries(item, link), true)
                  }
                >
                  <MoreHorizontal size={13} />
                </button>
              </div>
            ))}
            {children.map((child) => renderCollection(child, depth + 1))}
            {!item.links.length && !children.length && (
              <button
                className="library-empty-add"
                disabled={!page?.url || !/^https?:\/\//i.test(page.url)}
                onClick={() => {
                  if (page) void bookmarkPage(page, item.id);
                }}
              >
                <Plus size={12} />
                Add current page
              </button>
            )}
          </div>
        )}
      </div>
    );
  };
  const roots = collections.filter((item) => !item.parentId);
  return (
    <section
      aria-label="Bookmarks and tab groups"
      className="library"
      onContextMenu={(event) => show(event, createEntries)}
    >
      {editor && (
        <form
          className="library-editor"
          aria-label={editor.id ? 'Rename collection' : 'New collection'}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label
            className="text-caption font-medium text-fg-muted"
            htmlFor="collection-name"
          >
            {editor.id
              ? 'Rename collection'
              : editor.kind === 'folder'
                ? editor.parentId
                  ? 'New subfolder'
                  : 'New bookmark folder'
                : 'Save open pages as group'}
          </label>
          <input
            id="collection-name"
            autoFocus
            maxLength={100}
            disabled={saving}
            value={editor.name}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'collection-error' : undefined}
            onChange={(event) =>
              setEditor({ ...editor, name: event.target.value })
            }
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !saving) closeEditor();
            }}
          />
          {error && (
            <p
              id="collection-error"
              role="alert"
              className="text-small text-danger"
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="library-editor-button"
              disabled={saving}
              onClick={closeEditor}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="library-editor-button"
              data-primary
              disabled={!editor.name.trim() || saving}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}
      {(['folder', 'group'] as const).map((kind) => (
        <details
          key={kind}
          className="library-section"
          data-empty={!roots.some((item) => item.kind === kind)}
          open={roots.some((item) => item.kind === kind)}
        >
          <summary className="sidebar-section-heading">
            <span className="sidebar-section-label">
              <ChevronRight size={12} />
              {kind === 'folder' ? 'Bookmarks' : 'Saved groups'}
              <span className="sidebar-folded-count">
                {collections
                  .filter((item) =>
                    roots.some(
                      (root) =>
                        root.kind === kind &&
                        collectionBranch(collections, root.id).has(item.id),
                    ),
                  )
                  .reduce((total, item) => total + item.links.length, 0) || ''}
              </span>
            </span>
            <button
              className="icon-button size-6"
              title={
                kind === 'folder'
                  ? 'New bookmark folder'
                  : 'Save open pages as group'
              }
              aria-label={
                kind === 'folder'
                  ? 'New bookmark folder'
                  : 'Save open pages as group'
              }
              disabled={!ready || saving}
              onClick={(event) => {
                event.preventDefault();
                beginEdit({ kind, name: '' });
              }}
            >
              {kind === 'folder' ? (
                <FolderPlus size={13} />
              ) : (
                <Plus size={13} />
              )}
            </button>
          </summary>
          <div className="sidebar-section-content">
            {!ready ? (
              <div className="library-status" role="status">
                Loading library…
              </div>
            ) : roots.some((item) => item.kind === kind) ? (
              roots
                .filter((item) => item.kind === kind)
                .map((item) =>
                  renderCollection(
                    item,
                    0,
                    kind === 'folder' &&
                      item.name.trim().toLowerCase() === 'bookmarks',
                  ),
                )
            ) : (
              <p className="library-empty">
                {kind === 'folder'
                  ? 'Star a page to save it for later.'
                  : 'Keep a set of pages together.'}
              </p>
            )}
          </div>
        </details>
      ))}
      {retry && (
        <div className="library-recovery" role="alert">
          <p>
            Some pages couldn’t open. {retry.links.length} remaining. Your saved
            group is safe.
          </p>
          <button
            className="library-editor-button"
            disabled={Boolean(progress)}
            onClick={() => {
              void openAll(retry.item, retry.links, retry.root);
            }}
          >
            Retry remaining
          </button>
          <button
            className="library-editor-button"
            onClick={() => setRetry(null)}
          >
            Dismiss
          </button>
        </div>
      )}
      {menu && (
        <ContextMenu
          key={menu.serial}
          label="Library menu"
          entries={menu.entries}
          x={menu.x}
          y={menu.y}
          bounds={{ left: menu.left, right: menu.right }}
          fromKeyboard={menu.keyboard}
          returnFocus={menu.element}
          onClose={() => setMenu(null)}
        />
      )}
    </section>
  );
}
