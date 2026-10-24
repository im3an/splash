import { z } from 'zod';

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
} as const;

export const sendContract = {
  'view:set-content-insets': z.strictObject({
    top: inset,
    right: inset,
    bottom: inset,
    left: inset,
  }),
  'view:focus-page': z.undefined(),
} as const;

export type InvokeChannel = keyof typeof invokeContract;
export type SendChannel = keyof typeof sendContract;
export type InvokeInput<C extends InvokeChannel> = z.input<
  (typeof invokeContract)[C]
>;
export type SendInput<C extends SendChannel> = z.input<
  (typeof sendContract)[C]
>;
