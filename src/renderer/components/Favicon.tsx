import { useState, type ReactNode } from 'react';
import { CircleAlert, Code2, Globe, Hourglass } from 'lucide-react';
import { BrandMark } from './Brand';
import type { PageSnapshot } from '../../shared/types';

/**
 * Images Splash will show as a site icon: web addresses or inline images.
 * An `<img>` never runs script, so any raster or SVG data is fine.
 */
const SAFE_ICON =
  /^(https?:\/\/|data:image\/(png|jpeg|webp|gif|avif|bmp|x-icon|vnd\.microsoft\.icon|svg\+xml)[;,])/i;

/** Where a site keeps its icon when its page doesn't say. */
export function defaultIconFor(site: string | null | undefined): string | null {
  if (!site) return null;
  try {
    const { protocol, origin } = new URL(site);
    return protocol === 'https:' || protocol === 'http:'
      ? `${origin}/favicon.ico`
      : null;
  } catch {
    return null;
  }
}

/**
 * A site's icon, or a neutral globe when it has none or it won't load. The
 * one place site artwork is drawn: trail rows, palette, history, bookmarks.
 * The fallback is never Splash's mark, so a site can't pass for Splash.
 *
 * `site` is the address the icon stands for. When the icon is unknown (a
 * page that slept before it loaded) or fails (an address a site has since
 * replaced, a server refusing it), the site's `/favicon.ico` is tried next.
 */
export function SiteIcon({
  url,
  site,
  fallback,
}: {
  url: string | null | undefined;
  site?: string | null;
  fallback?: ReactNode;
}) {
  const [failed, setFailed] = useState<readonly string[]>([]);
  const src = [url, defaultIconFor(site)].find(
    (candidate): candidate is string =>
      !!candidate && SAFE_ICON.test(candidate) && !failed.includes(candidate),
  );
  if (!src) {
    return (
      fallback ?? (
        <Globe size={14} className="shrink-0 text-fg-subtle" aria-hidden />
      )
    );
  }
  return (
    // Not lazy: lazy images wait until the window is on screen, so pages
    // opened while Splash is behind other windows showed no icon.
    <img
      key={src}
      src={src}
      alt=""
      width={16}
      height={16}
      referrerPolicy="no-referrer"
      draggable={false}
      className="size-4 shrink-0 rounded-inner object-contain"
      onError={() => setFailed((list) => [...list, src])}
    />
  );
}

/** A trail row's icon: the page's state when it has one, else its site. */
export function Favicon({ page }: { page: PageSnapshot }) {
  let content;
  if (page.isUnresponsive) {
    content = <Hourglass size={13} className="text-danger" />;
  } else if (page.isLoading) {
    content = <span className="spinner" aria-hidden />;
  } else if (page.error) {
    content = <CircleAlert size={14} className="text-danger" />;
  } else if (page.emoji && page.parentId === null) {
    // Named for the trail; the states above still show on its row.
    content = <span className="trail-emoji">{page.emoji}</span>;
  } else if (page.url?.startsWith('view-source:')) {
    content = <Code2 size={14} className="text-fg-subtle" />;
  } else if (page.url === null) {
    content = <BrandMark size={16} className="text-fg-muted" />;
  } else {
    content = <SiteIcon url={page.faviconUrl} site={page.url} />;
  }

  return (
    <span
      className="grid size-4 shrink-0 place-items-center transition-opacity duration-base data-[asleep=true]:opacity-50"
      data-asleep={page.isDiscarded}
      aria-hidden
    >
      {content}
    </span>
  );
}
