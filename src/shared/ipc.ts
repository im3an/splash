import { z } from 'zod';
import { AI_PROVIDER_IDS } from './ai';
import { ACCENTS, FRAMES, SYMBOLS, THEMES } from './appearance';
import {
  MAX_COLLECTIONS,
  MAX_LINKS_PER_FOLDER,
  SPELLING_LANGUAGES,
  TOOLBAR_ACTIONS,
  type SpellingLanguage,
} from './preferences';
import { MAX_NOTE_LENGTH, MAX_NOTE_SITES } from './notes';
import { SECURE_DNS_CHOICES } from './secure-dns';
import {
  isSearchKeyword,
  isSearchTemplate,
  MAX_SEARCH_SHORTCUTS,
} from './search';

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

const zoomPercent = z.number().min(25).max(500);
/** Chromium's extension ids: 32 letters from a to p. */
const extensionId = z.string().regex(/^[a-p]{32}$/);

/** Goes into page settings, so it stays a plain name. */
const fontName = z
  .string()
  .max(64)
  .regex(/^[\p{L}\p{N} -]*$/u);

export const preferencesSchema = z.strictObject({
  sidebarWidth: z.number().int().min(220).max(420),
  toolbarActions: z
    .array(z.enum(TOOLBAR_ACTIONS))
    .max(TOOLBAR_ACTIONS.length)
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
          .max(MAX_LINKS_PER_FOLDER),
      }),
    )
    .max(MAX_COLLECTIONS)
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
  searchEngine: z.string().min(1).max(64),
  searchShortcuts: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(64),
        name: z.string().trim().min(1).max(60),
        keyword: z.string().refine(isSearchKeyword),
        url: z.string().max(2048).refine(isSearchTemplate),
      }),
    )
    .max(MAX_SEARCH_SHORTCUTS)
    .refine(
      (items) =>
        new Set(items.map((item) => item.id)).size === items.length &&
        new Set(items.map((item) => item.keyword)).size === items.length,
      'Search shortcuts must have unique IDs and keywords',
    ),
  searchSuggestions: z.boolean(),
  theme: z.enum(['system', 'light', 'dark']),
  density: z.enum(['comfortable', 'compact']),
  showSiteNames: z.boolean(),
  bookmarksBar: z.boolean(),
  almaViewButton: z.boolean(),
  showBranchLines: z.boolean(),
  trailStyle: z.enum(['branches', 'minimal']),
  reduceMotion: z.boolean(),
  addressBar: z.enum(['toolbar', 'sidebar']),
  downloads: z.enum(['folder', 'ask']),
  awakePages: z.number().int().min(2).max(100),
  autoPictureInPicture: z.boolean(),
  newPage: z.enum(['search', 'start', 'homepage']),
  homepage: z
    .url()
    .max(8192)
    .refine((value) => ['https:', 'http:'].includes(new URL(value).protocol))
    .nullable(),
  startup: z.enum(['restore', 'new-page']),
  httpsOnly: z.boolean(),
  passwordAutofill: z.boolean(),
  blockAds: z.boolean(),
  hideCookieNotices: z.boolean(),
  warnDangerousSites: z.boolean(),
  privacySignal: z.boolean(),
  blockThirdPartyCookies: z.boolean(),
  secureDns: z.enum(SECURE_DNS_CHOICES),
  secureDnsStrict: z.boolean(),
  clearOnQuit: z.strictObject({
    history: z.boolean(),
    cookies: z.boolean(),
    cache: z.boolean(),
    downloads: z.boolean(),
  }),
  aiProvider: z.enum(AI_PROVIDER_IDS),
  aiPanelWidth: z.number().int().min(320).max(720),
  defaultZoom: zoomPercent,
  siteZoom: z.record(z.string().min(1).max(255), zoomPercent),
  standardFont: fontName,
  monospaceFont: fontName,
  defaultFontSize: z.number().int().min(6).max(72),
  minimumFontSize: z.number().int().min(0).max(24),
  spellingLanguage: z.enum([
    'automatic',
    'off',
    ...SPELLING_LANGUAGES.map(([id]) => id),
  ] as [SpellingLanguage, ...SpellingLanguage[]]),
});
const sitePermission = z.enum([
  'camera',
  'microphone',
  'location',
  'notifications',
  'popups',
  'midi',
  'clipboard',
  'sound',
  'ads',
  'apps',
  'insecure',
  'javascript',
  'images',
  'autoplay',
  'third-party-cookies',
  'dangerous',
  'certificate',
  'save-passwords',
  'picture-in-picture',
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

const vaultId = z.string().min(1).max(64);
const secretText = z.string().max(4096);
const shortText = z.string().max(300);
const addressFields = z.strictObject({
  label: shortText,
  name: shortText,
  organization: shortText,
  street: z.string().max(1000),
  city: shortText,
  region: shortText,
  postalCode: shortText,
  country: shortText,
  tel: shortText,
  email: shortText,
});
const cardFields = z.strictObject({
  name: shortText,
  number: z
    .string()
    .max(32)
    .regex(/^[\d\s-]+$/),
  expMonth: z.string().regex(/^(0?[1-9]|1[0-2])$/),
  expYear: z.string().regex(/^\d{2}(\d{2})?$/),
});
/** Sections Settings can be opened to from elsewhere. */
const settingsSection = z.enum(['passwords', 'transfer']);

export const invokeContract = {
  'vault:list': z.undefined(),
  'vault:save-login': z.strictObject({
    id: vaultId.optional(),
    origin: siteOrigin,
    username: secretText,
    password: secretText.min(1),
  }),
  'vault:save-address': z.strictObject({
    id: vaultId.optional(),
    fields: addressFields,
  }),
  'vault:save-card': z.strictObject({
    id: vaultId.optional(),
    fields: cardFields,
  }),
  'vault:delete': z.strictObject({ id: vaultId }),
  'vault:undo': z.strictObject({ token: vaultId }),
  'vault:reveal': z.strictObject({ id: vaultId }),
  'vault:copy': z.strictObject({ id: vaultId }),
  'vault:export': z.undefined(),
  'transfer:sources': z.undefined(),
  'transfer:import': z.strictObject({
    id: z.string().min(1).max(512),
    bookmarks: z.boolean(),
    history: z.boolean(),
  }),
  'transfer:import-file': z.undefined(),
  'transfer:undo': z.strictObject({ token: vaultId }),
  'transfer:trash': z.strictObject({ token: vaultId }),
  'transfer:export-bookmarks': z.undefined(),
  'transfer:export-trail': z.undefined(),
  'autofill:current': z.undefined(),
  'autofill:choose': z.strictObject({ id: vaultId }),
  'credential:respond': z.strictObject({
    id: vaultId,
    answer: z.enum(['save', 'never', 'dismiss']),
  }),
  'window:info': z.undefined(),
  'window:new-private': z.undefined(),
  'file:choose': z.undefined(),
  'file:open-dropped': z.strictObject({
    paths: z.array(z.string().min(1).max(4096)).min(1).max(50),
  }),
  'app:open-settings-section': z.strictObject({ section: settingsSection }),
  'app:make-default-browser': z.undefined(),
  'page:picture-in-picture': z.strictObject({ pageId }),
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
  'page:continue-over-http': z.strictObject({ pageId }),
  'page:continue-to-dangerous-site': z.strictObject({ pageId }),
  'page:continue-past-certificate': z.strictObject({ pageId }),
  'page:stop': z.strictObject({ pageId }),
  'page:set-collapsed': z.strictObject({ pageId, collapsed: z.boolean() }),
  'page:create-child': z.strictObject({
    pageId,
    input: addressInput.optional(),
  }),
  'page:create-sibling': z.strictObject({
    pageId,
    input: addressInput.optional(),
  }),
  'page:set-emoji': z.strictObject({
    pageId,
    emoji: z.string().min(1).max(16).nullable(),
  }),
  'trail:collapse-others': z.strictObject({ pageId }),
  'trail:set-collapsed': z.strictObject({
    pageIds: z.array(pageId).max(5000),
    groupIds: z.array(z.uuid()).max(500),
    collapsed: z.boolean(),
  }),
  'trail:import-file': z.undefined(),
  'trail:paste-outline': z.strictObject({ parentId: pageId.nullable() }),
  'trail:undo-import': z.strictObject({
    pageIds: z.array(pageId).max(5000),
    groupId: z.uuid().nullable(),
  }),
  'trail:drag-out': z.union([
    z.strictObject({ pageId }),
    z.strictObject({ groupId: z.uuid() }),
  ]),
  'page:close-branch': z.strictObject({ pageId }),
  'page:close-others': z.strictObject({ pageId }),
  'page:close-below': z.strictObject({ pageId }),
  'spelling:words': z.undefined(),
  'spelling:set-word': z.strictObject({
    word: z.string().min(1).max(200),
    known: z.boolean(),
  }),
  'page:view-source': z.strictObject({ pageId }),
  'page:toggle-devtools': z.strictObject({ pageId }),
  'page:print': z.strictObject({ pageId }),
  'page:save-as': z.strictObject({ pageId }),
  'workspace:delete': z.strictObject({ workspaceId }),
  'page:reopen-closed': z.undefined(),
  'page:reopen-closed-item': z.strictObject({
    serial: z.number().int().nonnegative(),
  }),
  'page:recently-closed': z.undefined(),
  'page:undo-close': z.strictObject({
    serial: z.number().int().nonnegative(),
  }),
  'page:close-again': z.strictObject({
    serial: z.number().int().nonnegative(),
  }),
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
  'group:create': z.strictObject({
    name: z.string().trim().min(1).max(100).optional(),
    pageId: pageId.optional(),
  }),
  'group:rename': z.strictObject({
    groupId: z.uuid(),
    name: z.string().trim().min(1).max(100),
  }),
  'group:set-collapsed': z.strictObject({
    groupId: z.uuid(),
    collapsed: z.boolean(),
  }),
  'group:set-icon': z.strictObject({
    groupId: z.uuid(),
    icon: z
      .strictObject({
        kind: z.literal('emoji'),
        value: z.string().trim().min(1).max(16),
      })
      .nullable(),
  }),
  'group:delete': z.strictObject({ groupId: z.uuid() }),
  'group:delete-with-pages': z.strictObject({ groupId: z.uuid() }),
  'page:set-group': z.strictObject({ pageId, groupId: z.uuid().nullable() }),
  'page:duplicate': z.strictObject({ pageId }),
  'page:move-to-workspace': z.strictObject({ pageId, workspaceId }),
  'page:move-to-window': z.strictObject({
    pageId,
    /** `null` opens a new window for it. */
    windowId: z.string().min(1).max(64).nullable(),
  }),
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
  'notes:list': z.undefined(),
  'notes:save': z.strictObject({
    id: z.uuid().optional(),
    body: z.string().max(MAX_NOTE_LENGTH),
    sites: z
      .array(
        z
          .string()
          .min(1)
          .max(253)
          .regex(/^[\p{L}\p{N}.-]+$/u),
      )
      .max(MAX_NOTE_SITES),
  }),
  'notes:delete': z.strictObject({ id: z.uuid() }),
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
  'page:open-blocked-popup': z.strictObject({
    pageId,
    url: z.string().min(1).max(8192),
  }),
  'site:get-info': z.strictObject({ pageId }),
  'site:set-permission': z.strictObject({
    origin: siteOrigin,
    permission: sitePermission,
    decision: z.enum(['allow', 'block', 'ask']),
  }),
  'site:reset': z.strictObject({ origin: siteOrigin }),
  'system:open-permission-settings': z.strictObject({
    permission: z.enum(['camera', 'microphone', 'location']),
  }),
  'view:freeze': z.undefined(),
  'tasks:list': z.undefined(),
  'tasks:end': z.strictObject({ pageId }),
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
  'cookies:list': z.strictObject({ host: z.string().max(255).optional() }),
  'cookies:delete': z.strictObject({
    site: z.string().min(1).max(255),
    only: z
      .strictObject({
        name: z.string().max(4096),
        domain: z.string().max(255),
        path: z.string().max(4096),
      })
      .optional(),
  }),
  'cookies:undo': z.strictObject({ token: z.uuid() }),
  'settings:content-blocking': z.undefined(),
  'settings:threat-list': z.undefined(),
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
  'settings:licence': z.strictObject({
    name: z.enum(['splash', 'third-party']),
  }),
  'settings:open-chromium-licences': z.undefined(),
  'settings:open-about-link': z.strictObject({
    link: z.enum(['source', 'ublock-source', 'gpl']),
  }),
  'settings:export-diagnostics': z.undefined(),
  'settings:show-crash-reports': z.undefined(),
  'settings:edit-workspace': z.strictObject({
    workspaceId: workspaceId.nullable(),
  }),
  'settings:delete-workspace': z.strictObject({ workspaceId }),
  'extensions:manage': z.undefined(),
  'extensions:list': z.undefined(),
  'extensions:set-enabled': z.strictObject({
    id: extensionId,
    enabled: z.boolean(),
  }),
  'extensions:remove': z.strictObject({ id: extensionId }),
  'extensions:open-store': z.undefined(),
  'extensions:open-page': z.strictObject({ url: z.string().max(2048) }),
  'extensions:load-unpacked': z.undefined(),
  'settings:take-section': z.undefined(),
  'page:share': z.strictObject({ pageId }),
  'page:copy-as': z.strictObject({
    pageId,
    format: z.enum(['markdown', 'text']),
  }),
  'page:paste-and-go': z.undefined(),
  'page:go-home': z.undefined(),
  'address:show-menu': z.undefined(),
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
  'search:site-icon': z.strictObject({
    url: z.string().max(2048).refine(isSearchTemplate),
  }),
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
  'view:set-trail-undo-offered': z.strictObject({ offered: z.boolean() }),
  'workspace:preview-mode': z.strictObject({
    mode: z.enum(['system', 'light', 'dark']).nullable(),
  }),
  'autofill:resize': z.strictObject({
    height: z.number().int().min(0).max(800),
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
