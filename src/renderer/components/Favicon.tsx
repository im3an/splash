import { useState, type ReactNode } from 'react';
import { CircleAlert, Code2, Globe, Hourglass } from 'lucide-react';
import { BrandMark } from './Brand';
import type { PageSnapshot } from '../../shared/types';

/** Images Splash will show as a site icon: web addresses or inline images. */
const SAFE_ICON =
  /^(https?:\/\/|data:image\/(png|jpeg|webp|gif|x-icon|svg\+xml);base64,)/i;

/**
 * A site's icon, or a neutral globe when it has none or it won't load. The
 * one place site artwork is drawn: trail rows, palette, history, bookmarks.
 * The fallback is never Splash's mark, so a site can't pass for Splash.
 */
export function SiteIcon({
  url,
  fallback,
}: {
  url: string | null | undefined;
  fallback?: ReactNode;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || url === failedUrl || !SAFE_ICON.test(url)) {
    return (
      fallback ?? (
        <Globe
          size={14}
          strokeWidth={1.75}
          className="shrink-0 text-fg-subtle"
          aria-hidden
        />
      )
    );
  }
  return (
    <img
      src={url}
      alt=""
      width={16}
      height={16}
      referrerPolicy="no-referrer"
      loading="lazy"
      draggable={false}
      className="size-4 shrink-0 rounded-mark object-contain"
      onError={() => setFailedUrl(url)}
    />
  );
}

/** A trail row's icon: the page's state when it has one, else its site. */
export function Favicon({ page }: { page: PageSnapshot }) {
  let content;
  if (page.isUnresponsive) {
    content = (
      <Hourglass size={13} strokeWidth={1.75} className="text-danger" />
    );
  } else if (page.isLoading) {
    content = <span className="spinner" aria-hidden />;
  } else if (page.error) {
    content = (
      <CircleAlert size={14} strokeWidth={1.75} className="text-danger" />
    );
  } else if (page.url?.startsWith('view-source:')) {
    content = <Code2 size={14} strokeWidth={1.75} className="text-fg-subtle" />;
  } else if (page.url === null) {
    content = <BrandMark size={16} className="text-fg-muted" />;
  } else {
    content = <SiteIcon url={page.faviconUrl} />;
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
