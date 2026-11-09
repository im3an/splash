import path from 'node:path';
import { z } from 'zod';
import type { ExtensionInfo, ExtensionSource } from '../../shared/types';
import { entryPath } from './safe-zip';
import {
  permissionWarnings,
  WEB_STORE_ORIGIN,
  type StoreManifest,
} from './web-store';

/** What Electron knows about a loaded extension, as far as this file cares. */
export interface LoadedExtension {
  id: string;
  name: string;
  version: string;
  path: string;
  manifest: StoreManifest & {
    description?: unknown;
    icons?: unknown;
    options_page?: unknown;
    options_ui?: { page?: unknown } | null;
  };
}

/** The icon file to draw at about 48 pixels; `null` if it has none usable. */
export function iconFile(extension: LoadedExtension): string | null {
  const { icons } = extension.manifest;
  if (!icons || typeof icons !== 'object') return null;
  const sizes = Object.entries(icons)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([size, file]) => ({ size: Number(size), file }))
    .filter(({ size }) => size > 0)
    .sort((a, b) => a.size - b.size);
  const best = sizes.find(({ size }) => size >= 48) ?? sizes.at(-1);
  // Manifests may write the path from the extension's root, with a slash.
  return best ? entryPath(extension.path, best.file.replace(/^\/+/, '')) : null;
}

function optionsUrl(extension: LoadedExtension): string | null {
  const { options_page: page, options_ui: ui } = extension.manifest;
  const file = typeof ui?.page === 'string' ? ui.page : page;
  return typeof file === 'string' && file
    ? `chrome-extension://${extension.id}/${file.replace(/^\/+/, '')}`
    : null;
}

/** A row of the Extensions settings. */
export function describeExtension(
  extension: LoadedExtension,
  source: ExtensionSource,
  iconUrl: string | null,
): ExtensionInfo {
  const { description } = extension.manifest;
  return {
    id: extension.id,
    name: extension.name,
    version: extension.version,
    // An untranslated `__MSG_name__` says nothing to a person.
    description:
      typeof description === 'string' && !description.startsWith('__MSG_')
        ? description
        : '',
    source,
    enabled: true,
    iconUrl,
    optionsUrl: optionsUrl(extension),
    storeUrl:
      source === 'store' ? `${WEB_STORE_ORIGIN}/detail/${extension.id}` : null,
    warnings: permissionWarnings(extension.manifest),
  };
}

/** Chromium's reason a folder wouldn't load, without the path it repeats. */
export function loadProblem(error: unknown): string {
  return error instanceof Error
    ? error.message.replace(/^Loading extension at .* failed with: /s, '')
    : 'That folder couldn’t be loaded.';
}

const disabledSchema = z.record(
  // Becomes a folder name for store extensions, so only ever an id.
  z.string().regex(/^[a-p]{32}$/),
  z.object({
    path: z.string().refine((value) => path.isAbsolute(value)),
    info: z.object({
      id: z.string(),
      name: z.string(),
      version: z.string(),
      description: z.string(),
      source: z.enum(['bundled', 'store', 'unpacked']),
      enabled: z.boolean(),
      iconUrl: z.string().nullable(),
      optionsUrl: z.string().nullable(),
      storeUrl: z.string().nullable(),
      warnings: z.array(z.string()),
    }),
  }),
);

/**
 * Extensions turned off, by id. Electron has no "off" state: an extension is
 * either loaded or not, so this keeps what the row needs and where to find it.
 */
export type DisabledExtensions = z.infer<typeof disabledSchema>;

/** The saved list; a damaged file just means nothing is turned off. */
export function parseDisabled(text: string): DisabledExtensions {
  try {
    return disabledSchema.parse(JSON.parse(text));
  } catch {
    return {};
  }
}
