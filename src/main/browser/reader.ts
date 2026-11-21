import readabilitySource from '@mozilla/readability/Readability.js?raw';
import purifySource from 'dompurify/dist/purify.min.js?raw';
import type { WebContents } from 'electron';
import {
  toggleReader,
  type ReaderOptions,
  type ReaderResult,
} from './reader-page';

/** Reader's own world, so nothing the page did to its globals gets involved. */
const READER_WORLD = 1013;

/** Runs a CommonJS-style library as text and hands back what it exports. */
function asModule(source: string): string {
  return `(() => { const module = { exports: {} }; const exports = module.exports; void exports;\n${source}\n; return module.exports; })()`;
}

/**
 * The whole of Reader as one script: Readability, DOMPurify and the view.
 * They're only sent when Reader is asked for, so pages don't carry them.
 */
export function readerScript(options: ReaderOptions): string {
  return `(() => {
const Readability = ${asModule(readabilitySource)};
const DOMPurify = ${asModule(purifySource)};
return (${toggleReader.toString()})(Readability, DOMPurify, ${JSON.stringify(options)});
})()`;
}

export async function toggleReaderIn(
  contents: Pick<WebContents, 'executeJavaScriptInIsolatedWorld'>,
  options: ReaderOptions,
): Promise<ReaderResult> {
  try {
    const result: unknown = await contents.executeJavaScriptInIsolatedWorld(
      READER_WORLD,
      [{ code: readerScript(options) }],
      true,
    );
    return result === 'shown' || result === 'hidden' ? result : 'none';
  } catch {
    // A page that navigated away, or one Splash can't script.
    return 'none';
  }
}
