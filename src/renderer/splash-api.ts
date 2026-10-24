import type { SplashApi } from '../shared/api';

declare global {
  interface Window {
    /** Exposed by the preload script; the shell's only route to the main process. */
    splash: SplashApi;
  }
}

let guarded: { source: SplashApi; api: SplashApi } | null = null;

/**
 * The browser API. Calls that fail — typically acting on a page that a
 * double click already closed — are logged rather than surfacing as
 * unhandled rejections; callers that await them still see the error.
 *
 * `contextBridge` exposes a frozen object, so this builds a plain wrapper
 * rather than a Proxy (which may not alter frozen properties).
 */
export function api(): SplashApi {
  const source = window.splash;
  if (guarded?.source === source) return guarded.api;
  const wrapped: Record<string, unknown> = {};
  for (const key of Object.keys(source) as (keyof SplashApi)[]) {
    const value: unknown = source[key];
    wrapped[key] =
      typeof value === 'function'
        ? (...args: unknown[]) => {
            const result: unknown = value.apply(source, args);
            if (result instanceof Promise) {
              result.catch((error: unknown) =>
                console.warn(`splash.${key} failed`, error),
              );
            }
            return result;
          }
        : value;
  }
  guarded = { source, api: wrapped as unknown as SplashApi };
  return guarded.api;
}
