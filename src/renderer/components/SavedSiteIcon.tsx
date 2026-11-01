import { useState } from 'react';

/** Use stored site artwork; fall back locally without sending bookmarks to a favicon service. */
export function SavedSiteIcon({
  url,
  faviconUrl,
}: {
  url: string;
  faviconUrl?: string | null;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  let host = '';
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    /* Validated at storage boundary. */
  }
  const safeImage =
    faviconUrl &&
    (/^https?:\/\//i.test(faviconUrl) ||
      /^data:image\/(png|jpeg|webp|gif|x-icon);base64,/i.test(faviconUrl));
  return (
    <span className="saved-site-icon" aria-hidden>
      {safeImage && failed !== faviconUrl ? (
        <img
          src={faviconUrl}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          draggable={false}
          onError={() => setFailed(faviconUrl)}
        />
      ) : (
        <span>{host.charAt(0).toUpperCase() || '•'}</span>
      )}
    </span>
  );
}
