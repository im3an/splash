import { useState } from 'react';
import { CircleAlert, Globe, Search } from 'lucide-react';
import type { PageSnapshot } from '../../shared/types';

export function Favicon({ page }: { page: PageSnapshot }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  let content;
  if (page.isLoading) {
    content = <span className="spinner" aria-hidden />;
  } else if (page.error) {
    content = (
      <CircleAlert size={14} strokeWidth={1.75} className="text-danger" />
    );
  } else if (page.url === null) {
    content = (
      <Search size={13} strokeWidth={1.75} className="text-fg-subtle" />
    );
  } else if (page.faviconUrl && page.faviconUrl !== failedUrl) {
    content = (
      <img
        src={page.faviconUrl}
        alt=""
        width={16}
        height={16}
        referrerPolicy="no-referrer"
        draggable={false}
        className="size-4 rounded-[3px] object-contain"
        onError={() => setFailedUrl(page.faviconUrl)}
      />
    );
  } else {
    content = <Globe size={14} strokeWidth={1.75} className="text-fg-subtle" />;
  }

  return (
    <span className="grid size-4 shrink-0 place-items-center" aria-hidden>
      {content}
    </span>
  );
}
