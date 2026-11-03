import { z } from 'zod';
import { AI_PROVIDER_IDS } from './ai';
import { ACCENTS, FRAMES, SYMBOLS, THEMES } from './appearance';
import { SEARCH_ENGINES, TOOLBAR_ACTIONS } from './preferences';

/**
 * The single contract between the shell UI and the main process.
 * Every renderer → main message is validated against these schemas in the
 * main process; the preload script only forwards. Kept separate from
 * `api.ts` so zod is never bundled into the preload script.
 */

const pageId = z.uuid();
const addressInput = z.string().trim().min(1).max(8192);
const inset = z.number().finite().min(0).max(10_000);
const pageTitle = z.string().max(300).nullable();
const workspaceId = z.uuid();

export const preferencesSchema = z.strictObject({
  sidebarWidth: z.number().int().min(220).max(420),
  toolbarActions: z
    .array(z.enum(TOOLBAR_ACTIONS))
    .max(5)
    .refine((items) => new Set(items).size === items.length),
  collections: z
    .array(
      z.strictObject({
        id: z.uuid(),
        name: z.string().trim().min(1).max(100),
        kind: z.enum(['folder', 'group']),
        collapsed: z.boolean(),
        parentId: z.uuid().nullable().optional(),
        links: z
          .array(
            z.strictObject({
              id: z.uuid(),
              title: z.string().max(300),
              faviconUrl: z.string().max(8192).nullable().optional(),
              url: z
                .url()
                .max(8192)
                .refine((value) =>
                  ['https:', 'http:'].includes(new URL(value).protocol),
                ),
            }),
          )
          .max(1000),
      }),
    )
    .max(200)
    .refine((items) => {
      const byId = new Map(items.map((item) => [item.id, item]));
      if (byId.size !== items.length) return false;
      return items.every((item) => {
        const visited = new Set([item.id]);
        let parent = item.parentId;
        while (parent) {
          const node = byId.get(parent);
          if (!node || node.kind !== 'folder' || visited.has(parent))
            return false;
          visited.add(parent);
          parent = node.parentId;
        }
        return (
          new Set(item.links.map((link) => link.id)).size === item.links.length
        );
      });
    }, 'Collections must have unique IDs and valid folder ancestry'),
  searchEngine: z.enum(
    SEARCH_ENGINES.map((engine) => engine.id) as [
      (typeof SEARCH_ENGINES)[number]['id'],
      ...(typeof SEARCH_ENGINES)[number]['id'][],
    ],
  ),
  searchSuggestions: z.boolean(),
  theme: z.enum(['system', 'light', 'dark']),
  density: z.enum(['comfortable', 'compact']),
  showSiteNames: z.boolean(),
  showBranchLines: z.boolean(),
  reduceMotion: z.boolean(),
  addressBar: z.enum(['toolbar', 'sidebar']),
  downloads: z.enum(['folder', 'ask']),
  awakePages: z.number().int().min(2).max(100),
  startup: z.enum(['restore', 'new-page']),
  blockAds: z.boolean(),
  hideCookieNotices: z.boolean(),
  aiProvider: z.enum(AI_PROVIDER_IDS),
  aiPanelWidth: z.number().int().min(320).max(720),
});
const sitePermission = z.enum([
  'camera',
  'microphone',
  'location',
  'notifications',
  'midi',
  'clipboard',
  'sound',
  'ads',
  'apps',
]);
/** A bare web origin such as `https://example.com`. */
const siteOrigin = z
  .string()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === 'https:' || url.protocol === 'http:') &&
        url.origin === value
      );
    } catch {
      return false;
    }
  }, 'Not a web origin');

/** Must stay in step with the presets in `appearance.ts`. */
export const workspaceAppearanceSchema = z.strictObject({
  icon: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('letter') }),
    z.strictObject({
      kind: z.literal('symbol'),
      name: z.enum(SYMBOLS),
    }),
    z.strictObject({
      kind: z.literal('emoji'),
      value: z.string().trim().min(1).max(16),
    }),
    z.strictObject({
      kind: z.literal('image'),
      // A small square PNG made by the shell; 200 KB is plenty.
      dataUrl: z
        .string()
        .max(200_000)
        .regex(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/),
    }),
  ]),
  accent: z.union([
    z.enum(ACCENTS.map((accent) => accent.id) as [string, ...string[]]),
    z.string().regex(/^#[0-9a-f]{6}$/i),
  ]),
  frame: z.enum(FRAMES.map((frame) => frame.id) as [string, ...string[]]),
  gradient: z
    .enum(THEMES.map((preset) => preset.id) as [string, ...string[]])
    .optional(),
  colors: z
    .array(z.string().regex(/^#[0-9a-f]{6}$/i))
    .min(1)
    .max(3)
    .optional(),
  intensity: z.number().min(0).max(1).optional(),
  grain: z.number().min(0).max(1).optional(),
  mode: z.enum(['system', 'light', 'dark']),
});

export const invokeContract = {
  'auth:challenge': z.undefined(),
  'auth:respond': z
    .strictObject({
      username: z.string().max(4096),
      password: z.string().max(4096),
    })
    .nullable(),
  'browser:get-snapshot': z.undefined(),
  'storage:status': z.undefined(),
  'page:create': z.strictObject({ input: addressInput.optional() }),
  'page:activate': z.strictObject({ pageId }),
  'page:close': z.strictObject({ pageId, unpin: z.boolean().optional() }),
  'page:navigate': z.strictObject({ pageId, input: addressInput }),
  'page:go-back': z.strictObject({ pageId }),
  'page:go-forward': z.strictObject({ pageId }),
  'page:reload': z.strictObject({ pageId }),
  'page:stop': z.strictObject({ pageId }),
  'page:set-collapsed': z.strictObject({ pageId, collapsed: z.boolean() }),
  'page:create-child': z.strictObject({
    pageId,
    input: addressInput.optional(),
  }),
  'page:close-branch': z.strictObject({ pageId }),
  'page:close-others': z.strictObject({ pageId }),
  'page:print': z.strictObject({ pageId }),
  'page:save-as': z.strictObject({ pageId }),
  'workspace:delete': z.strictObject({ workspaceId }),
  'page:reopen-closed': z.undefined(),
  'page:move': z.strictObject({
    pageId,
    parentId: pageId.nullable(),
    afterId: pageId.nullable(),
  }),
  'page:return': z.strictObject({
    pageId,
    origin: z.strictObject({
      workspaceId,
      parentId: pageId.nullable(),
      index: z.number().int().min(0).max(100_000),
      wasActive: z.boolean(),
    }),
  }),
  'page:rename': z.strictObject({ pageId, title: pageTitle }),
  'page:set-pinned': z.strictObject({
    pageId,
    pinned: z.boolean(),
    origin: z
      .strictObject({
        parentId: pageId.nullable(),
        index: z.number().int().min(0).max(100_000),
      })
      .optional(),
  }),
  'page:duplicate': z.strictObject({ pageId }),
  'page:move-to-workspace': z.strictObject({ pageId, workspaceId }),
  'page:open-split': z.strictObject({
    pageId,
    otherId: pageId,
    side: z.enum(['left', 'right']).optional(),
  }),
  'page:toggle-split': z.strictObject({ pageId }),
  'split:close': z.undefined(),
  'page:set-note': z.strictObject({
    pageId,
    note: z.string().max(4000).nullable(),
  }),
  'workspace:switch': z.strictObject({ workspaceId }),
  'workspace:rename': z.strictObject({
    workspaceId,
    name: z.string().trim().min(1).max(80),
  }),
  'workspace:show-menu': z.undefined(),
  'workspace:create': z.strictObject({
    name: z.string().trim().min(1).max(80),
    appearance: workspaceAppearanceSchema,
  }),
  'workspace:customize': z.strictObject({
    workspaceId,
    name: z.string().trim().min(1).max(80),
    appearance: workspaceAppearanceSchema,
  }),
  'page:set-muted': z.strictObject({ pageId, muted: z.boolean() }),
  'page:zoom': z.strictObject({
    pageId,
    direction: z.enum(['in', 'out', 'reset']),
  }),
  'page:find': z.strictObject({
    pageId,
    text: z.string().max(1000),
    forward: z.boolean(),
    findNext: z.boolean(),
  }),
  'page:stop-find': z.strictObject({ pageId }),
  'page:respond-permission': z.strictObject({
    pageId,
    requestId: z.uuid(),
    granted: z.boolean(),
  }),
  'site:get-info': z.strictObject({ pageId }),
  'site:set-permission': z.strictObject({
    origin: siteOrigin,
    permission: sitePermission,
    decision: z.enum(['allow', 'block', 'ask']),
  }),
  'site:reset': z.strictObject({ origin: siteOrigin }),
  'view:freeze': z.undefined(),
  'downloads:list': z.undefined(),
  'downloads:act': z.strictObject({
    id: z.uuid(),
    action: z.enum([
      'cancel',
      'pause',
      'resume',
      'retry',
      'open',
      'show',
      'remove',
    ]),
  }),
  'downloads:clear': z.undefined(),
  'downloads:open-folder': z.undefined(),
  'history:list': z.strictObject({
    query: z.string().max(1000),
    limit: z.number().int().min(1).max(1000),
  }),
  'history:delete': z.strictObject({ url: z.string().min(1).max(8192) }),
  'history:restore': z.strictObject({
    entry: z.strictObject({
      url: z.string().min(1).max(8192),
      title: z.string().max(1000),
      visitCount: z.number().int().min(1),
      lastVisitedAt: z.number().int().min(0),
      faviconUrl: z.string().max(16_384).nullable().optional(),
    }),
  }),
  'settings:sites': z.undefined(),
  'settings:content-blocking': z.undefined(),
  'settings:update-filter-lists': z.undefined(),
  'settings:clear-data': z.strictObject({
    range: z.enum(['hour', 'day', 'week', 'all']),
    history: z.boolean(),
    cookies: z.boolean(),
    cache: z.boolean(),
    permissions: z.boolean(),
    downloads: z.boolean(),
  }),
  'settings:undo-clear': z.strictObject({ token: z.uuid() }),
  'settings:default-browser': z.undefined(),
  'settings:make-default-browser': z.undefined(),
  'settings:open-data-folder': z.undefined(),
  'settings:about': z.undefined(),
  'settings:edit-workspace': z.strictObject({
    workspaceId: workspaceId.nullable(),
  }),
  'settings:delete-workspace': z.strictObject({ workspaceId }),
  'extensions:manage': z.undefined(),
  'page:share': z.strictObject({ pageId }),
  'preferences:get': z.undefined(),
  'preferences:update': z.strictObject({ patch: preferencesSchema.partial() }),
  'app:open-settings': z.undefined(),
  'palette:query': z.strictObject({
    // Long enough for a pasted address.
    query: z.string().max(8192),
    scope: z.enum(['palette', 'location', 'address']),
    // Fill in the rest of an address from history (typing forward).
    complete: z.boolean().optional(),
  }),
  'search:suggest': z.strictObject({ query: z.string().max(8192) }),
  'ai:act': z.strictObject({
    action: z.enum(['back', 'reload', 'home', 'open-as-page']),
  }),
  'workspace:move': z.strictObject({
    workspaceId,
    index: z.number().int().min(0).max(1000),
  }),
} as const;

export const sendContract = {
  'view:set-content-insets': z.strictObject({
    top: inset,
    right: inset,
    bottom: inset,
    left: inset,
  }),
  'view:focus-page': z.undefined(),
  'view:set-overlay': z.strictObject({ active: z.boolean() }),
  'workspace:preview-mode': z.strictObject({
    mode: z.enum(['system', 'light', 'dark']).nullable(),
  }),
  'ai:place': z
    .strictObject({
      provider: z.enum(AI_PROVIDER_IDS),
      insets: z.strictObject({
        top: inset,
        right: inset,
        bottom: inset,
        left: inset,
      }),
    })
    .nullable(),
} as const;

export type InvokeChannel = keyof typeof invokeContract;
export type SendChannel = keyof typeof sendContract;
export type InvokeInput<C extends InvokeChannel> = z.input<
  (typeof invokeContract)[C]
>;
export type SendInput<C extends SendChannel> = z.input<
  (typeof sendContract)[C]
>;
