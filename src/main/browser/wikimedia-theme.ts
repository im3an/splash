import type { Session, WebContents } from 'electron';

/*
 * Wikipedia has a dark theme, but a reader who never picked one gets Light,
 * not Automatic, so it ignores Splash going dark. Its choice lives in a
 * cookie the page reads before it draws, named after the wiki's database
 * (`enwiki`, `dewiktionary`, `commonswiki`). Splash sets it to Automatic
 * when there's no choice yet; from then on Wikipedia follows light and dark
 * as they change, with no reload. A theme the reader picks on the site
 * replaces it and is left alone, and so is anyone signed in, whose choice is
 * kept by their account.
 */

const SISTER_PROJECTS = new Set([
  'wiktionary',
  'wikibooks',
  'wikinews',
  'wikiquote',
  'wikisource',
  'wikiversity',
  'wikivoyage',
]);
const WIKIMEDIA_WIKIS = new Set(['commons', 'meta', 'species']);
const RENAMED: Record<string, string> = { 'be-tarask': 'be_x_old' };
const AUTOMATIC = 'skin-theme-clientpref-os';
const LANGUAGE = /^[a-z][a-z0-9-]*$/;

/** The wiki an address belongs to, as Wikimedia names it, or null. */
export function wikimediaWiki(url: string): string | null {
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    host = parsed.hostname;
  } catch {
    return null;
  }
  const parts = host.split('.');
  // The mobile site keeps the same choice under the same name.
  if (parts[1] === 'm') parts.splice(1, 1);
  if (parts.length !== 3 || parts[2] !== 'org') return null;
  const [sub = '', site = ''] = parts;
  if (site === 'wikimedia')
    return WIKIMEDIA_WIKIS.has(sub) ? `${sub}wiki` : null;
  if (site !== 'wikipedia' && !SISTER_PROJECTS.has(site)) return null;
  if (sub === 'www' || !LANGUAGE.test(sub)) return null;
  const language = RENAMED[sub] ?? sub.replaceAll('-', '_');
  return `${language}${site === 'wikipedia' ? 'wiki' : site}`;
}

interface CookieLike {
  name: string;
  value: string;
}

/**
 * The preferences cookie to set so the wiki follows light and dark, or null
 * when it already has a theme or the reader is signed in.
 */
export function automaticThemeCookie(
  url: string,
  cookies: readonly CookieLike[],
): CookieLike | null {
  const wiki = wikimediaWiki(url);
  if (!wiki) return null;
  const signedIn = cookies.some(
    ({ name }) =>
      name === 'centralauth_User' ||
      name === `${wiki}UserID` ||
      name === `${wiki}UserName`,
  );
  if (signedIn) return null;
  const name = `${wiki}mwclientpreferences`;
  const existing = cookies.find((cookie) => cookie.name === name)?.value;
  if (!existing) return { name, value: AUTOMATIC };
  if (existing.includes('skin-theme-clientpref-')) return null;
  // Other choices, such as text size, share the cookie; keep them.
  return { name, value: `${existing}%2C${AUTOMATIC}` };
}

const YEAR_SECONDS = 365 * 24 * 60 * 60;

async function nudge(session: Session, url: string): Promise<void> {
  if (!wikimediaWiki(url)) return;
  const origin = new URL(url).origin;
  const cookie = automaticThemeCookie(
    url,
    await session.cookies.get({ url: origin }),
  );
  if (!cookie) return;
  // No domain: the cookie belongs to this one host, as Wikipedia's own does.
  await session.cookies.set({
    url: origin,
    path: '/',
    name: cookie.name,
    value: cookie.value,
    secure: true,
    sameSite: 'lax',
    expirationDate: Date.now() / 1000 + YEAR_SECONDS,
  });
}

/**
 * Before a Wikimedia page draws, makes sure it will follow Splash's light
 * and dark. The page's own script reads the cookie once the answer arrives,
 * which is after this has set it.
 */
export function letWikimediaFollowTheme(contents: WebContents): void {
  contents.on('did-start-navigation', (details) => {
    if (!details.isMainFrame || details.isSameDocument) return;
    nudge(contents.session, details.url).catch(() => {
      // A page that closed or a jar that refused just keeps its theme.
    });
  });
}
