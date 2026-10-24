import { z } from 'zod';
import { ACCENTS, FRAMES, SYMBOLS } from './appearance';

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
const sitePermission = z.enum([
  'camera',
  'microphone',
  'location',
  'notifications',
  'midi',
  'clipboard',
  'sound',
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
  mode: z.enum(['system', 'light', 'dark']),
});

export const invokeContract = {
  'browser:get-snapshot': z.undefined(),
  'page:create': z.strictObject({ input: addressInput.optional() }),
  'page:activate': z.strictObject({ pageId }),
  'page:close': z.strictObject({ pageId }),
  'page:navigate': z.strictObject({ pageId, input: addressInput }),
  'page:go-back': z.strictObject({ pageId }),
  'page:go-forward': z.strictObject({ pageId }),
  'page:reload': z.strictObject({ pageId }),
  'page:stop': z.strictObject({ pageId }),
  'page:set-collapsed': z.strictObject({ pageId, collapsed: z.boolean() }),
  'page:create-child': z.strictObject({ pageId }),
  'page:close-branch': z.strictObject({ pageId }),
  'page:reopen-closed': z.undefined(),
  'page:move': z.strictObject({
    pageId,
    parentId: pageId.nullable(),
    afterId: pageId.nullable(),
  }),
  'page:rename': z.strictObject({ pageId, title: pageTitle }),
  'page:duplicate': z.strictObject({ pageId }),
  'page:show-menu': z.strictObject({ pageId }),
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
  'palette:query': z.strictObject({
    query: z.string().max(500),
    scope: z.enum(['palette', 'address']),
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
} as const;

export type InvokeChannel = keyof typeof invokeContract;
export type SendChannel = keyof typeof sendContract;
export type InvokeInput<C extends InvokeChannel> = z.input<
  (typeof invokeContract)[C]
>;
export type SendInput<C extends SendChannel> = z.input<
  (typeof sendContract)[C]
>;
