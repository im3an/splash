import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import {
  commandOnly,
  fillSearchUrl,
  keywordOnly,
  scopedInput,
  scopeEntry,
  type SearchShortcut,
} from '../../shared/search';
import {
  accentTones,
  dominantColor,
  type SiteAccent,
} from '../../shared/site-accent';
import { api } from '../splash-api';
import { useShell } from '../stores/shell-store';
import { SiteIcon } from './Favicon';

const NONE: readonly SearchShortcut[] = [];
const SAMPLE_SIZE = 32;

/** The colour of an inline icon, read from its pixels. */
async function accentOfIcon(src: string): Promise<SiteAccent | null> {
  const image = new Image();
  image.src = src;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SAMPLE_SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  const color = dominantColor(
    context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data,
  );
  return color ? accentTones(color) : null;
}

/**
 * A field that a shortcut has taken over, after `!yt` and a space: what's
 * typed from then on is a YouTube search, and the field says so in the site's
 * icon and colour. Shared by the address field and the palette's.
 */
export function useSearchScope() {
  const shortcuts = useShell(
    (state) => state.preferences?.searchShortcuts ?? NONE,
  );
  const [scope, setScope] = useState<SearchShortcut | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const [accent, setAccent] = useState<SiteAccent | null>(null);

  useEffect(() => {
    setIcon(null);
    setAccent(null);
    if (!scope) return;
    let current = true;
    void api()
      .siteIcon(scope.url)
      .then(async (found) => {
        if (!current || !found) return;
        setIcon(found);
        const tones = await accentOfIcon(found);
        if (current) setAccent(tones);
      })
      // No colour to read is fine: the workspace's accent stays.
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [scope]);

  /** Takes over if this is a keyword and a space; returns the text left. */
  const enterFrom = useCallback(
    (text: string): string | null => {
      const entry = scopeEntry(text, shortcuts);
      if (!entry) return null;
      setScope(entry.shortcut);
      return entry.rest;
    },
    [shortcuts],
  );

  /** Tab on a keyword alone takes over without the space. */
  const enterOnTab = useCallback(
    (text: string): boolean => {
      const shortcut =
        commandOnly(text, shortcuts) ?? keywordOnly(text, shortcuts);
      if (!shortcut) return false;
      setScope(shortcut);
      return true;
    },
    [shortcuts],
  );

  const clear = useCallback(() => setScope(null), []);

  /** The line this text stands for, for everything that resolves input. */
  const lineFor = useCallback(
    (text: string) => (scope ? scopedInput(scope, text) : text),
    [scope],
  );

  /** Colours for the field; the focus ring follows the site's. */
  const style = useMemo(
    () =>
      (accent
        ? {
            '--scope': `light-dark(${accent.light}, ${accent.dark})`,
            '--shadow-focus':
              '0 0 0 1.5px var(--scope), 0 0 0 4px color-mix(in oklab, var(--scope) 22%, transparent)',
          }
        : scope
          ? { '--scope': 'var(--accent)' }
          : undefined) as CSSProperties | undefined,
    [accent, scope],
  );

  return { scope, icon, style, enterFrom, enterOnTab, clear, lineFor };
}

/** The site's icon and name at the start of a field it has taken over. */
export function SearchScopeChip({
  shortcut,
  icon,
}: {
  shortcut: SearchShortcut;
  icon: string | null;
}) {
  return (
    <span
      className="flex shrink-0 items-center gap-1.5 pl-1 font-medium whitespace-nowrap text-(--scope) transition-colors duration-base"
      data-testid="search-scope"
    >
      <SiteIcon url={icon} site={fillSearchUrl(shortcut.url, '')} />
      {shortcut.name}
      <span className="ml-0.5 h-4 w-px bg-current opacity-35" aria-hidden />
    </span>
  );
}
