import { z } from 'zod';

/**
 * The single contract between the shell UI and the main process.
 * Every renderer → main message is validated against these schemas in the
 * main process; the preload script only forwards. Kept separate from
 * `api.ts` so zod is never bundled into the preload script.
 */

const pageId = z.uuid();
const workspaceId = z.uuid();
const addressInput = z.string().trim().min(1).max(8192);
const inset = z.number().finite().min(0).max(10_000);

export const PAGE_TITLE_MAX = 200;
export const WORKSPACE_NAME_MAX = 60;

const workspaceName = z.string().trim().min(1).max(WORKSPACE_NAME_MAX);

export const invokeContract = {
  'browser:get-snapshot': z.undefined(),
  'page:create': z.strictObject({
    input: addressInput.optional(),
    parentId: pageId.optional(),
  }),
  'page:activate': z.strictObject({ pageId }),
  'page:close': z.strictObject({
    pageId,
    withDescendants: z.boolean().optional(),
  }),
  'page:navigate': z.strictObject({ pageId, input: addressInput }),
  'page:go-back': z.strictObject({ pageId }),
  'page:go-forward': z.strictObject({ pageId }),
  'page:reload': z.strictObject({ pageId }),
  'page:stop': z.strictObject({ pageId }),
  'page:set-collapsed': z.strictObject({ pageId, collapsed: z.boolean() }),
  'page:rename': z.strictObject({
    pageId,
    title: z.string().trim().max(PAGE_TITLE_MAX).nullable(),
  }),
  'page:move': z.strictObject({
    pageId,
    parentId: pageId.nullable(),
    beforeId: pageId.nullable(),
  }),
  'workspace:create': z.strictObject({ name: workspaceName }),
  'workspace:activate': z.strictObject({ workspaceId }),
  'workspace:rename': z.strictObject({ workspaceId, name: workspaceName }),
  'workspace:delete': z.strictObject({ workspaceId }),
} as const;

export const sendContract = {
  'view:set-content-insets': z.strictObject({
    top: inset,
    right: inset,
    bottom: inset,
    left: inset,
  }),
  'view:focus-page': z.undefined(),
  'app:set-appearance': z.enum(['system', 'light', 'dark']),
} as const;

export type InvokeChannel = keyof typeof invokeContract;
export type SendChannel = keyof typeof sendContract;
export type InvokeInput<C extends InvokeChannel> = z.input<
  (typeof invokeContract)[C]
>;
export type SendInput<C extends SendChannel> = z.input<
  (typeof sendContract)[C]
>;
