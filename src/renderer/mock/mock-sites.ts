/**
 * Simulated web content for the mock backend: a title, a little text and a
 * few links for any URL, so trails can be browsed without a network.
 *
 * Hosts containing `offline` or ending in `.invalid` fail to load; hosts
 * starting with `slow.` take a few seconds, for trying Stop.
 */

export interface MockLink {
  label: string;
  url: string;
}

export interface MockSite {
  title: string;
  summary: string;
  links: MockLink[];
  faviconUrl: string;
  /** Simulated network time in milliseconds. */
  latency: number;
  failure: { code: number; description: string } | null;
}

const wiki = (topic: string) =>
  `https://en.wikipedia.org/wiki/${encodeURIComponent(topic.replaceAll(' ', '_'))}`;

const KNOWN: Record<string, Pick<MockSite, 'title' | 'summary' | 'links'>> = {
  'en.wikipedia.org/wiki/Trail': {
    title: 'Trail — Wikipedia',
    summary:
      'A trail is usually a path, track or unpaved lane or road. Trails are used for hiking, cycling, and wayfinding through unfamiliar country.',
    links: [
      { label: 'Appalachian Trail', url: wiki('Appalachian Trail') },
      { label: 'Desire path', url: wiki('Desire path') },
      { label: 'Wayfinding', url: wiki('Wayfinding') },
    ],
  },
  'en.wikipedia.org/wiki/Appalachian_Trail': {
    title: 'Appalachian Trail — Wikipedia',
    summary:
      'A hiking trail in the eastern United States, extending almost 3,500 km between Springer Mountain in Georgia and Mount Katahdin in Maine.',
    links: [
      { label: 'Thru-hiking', url: wiki('Thru-hiking') },
      { label: 'Blue Ridge Mountains', url: wiki('Blue Ridge Mountains') },
    ],
  },
  'news.ycombinator.com': {
    title: 'Hacker News',
    summary: 'Links for the intellectually curious, ranked by readers.',
    links: [
      {
        label: 'Show HN: A browser built on trails',
        url: 'https://trails.dev/',
      },
      { label: 'The history of the hyperlink', url: wiki('Hyperlink') },
      {
        label: 'Ask HN: How do you organise research?',
        url: 'https://news.ycombinator.com/item?id=4242',
      },
    ],
  },
  'developer.mozilla.org/en-US/docs/Web/API/History_API': {
    title: 'History API — MDN',
    summary:
      'The History API provides access to the browser’s session history through the history global object.',
    links: [
      {
        label: 'History.pushState()',
        url: 'https://developer.mozilla.org/en-US/docs/Web/API/History/pushState',
      },
      {
        label: 'Navigation API',
        url: 'https://developer.mozilla.org/en-US/docs/Web/API/Navigation_API',
      },
    ],
  },
};

const PALETTE = [
  '#b4542d',
  '#4f7a52',
  '#3f6f96',
  '#7a4f86',
  '#a07a2c',
  '#5c6670',
];

function hash(value: string): number {
  let result = 0;
  for (const char of value) result = (result * 31 + char.charCodeAt(0)) >>> 0;
  return result;
}

/** A letter tile standing in for the site's favicon. */
function letterIcon(host: string): string {
  const letter = (host.replace(/^www\./, '')[0] ?? '?').toUpperCase();
  const color = PALETTE[hash(host) % PALETTE.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="${color}"/><text x="8" y="11.5" font-family="-apple-system,system-ui,sans-serif" font-size="9.5" font-weight="600" fill="#fff" text-anchor="middle">${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function titleCase(value: string): string {
  return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'result'
  );
}

export function describeSite(url: string): MockSite {
  const parsed = new URL(url);
  const host = parsed.host;
  const key = (host + parsed.pathname).replace(/\/$/, '');
  const base = {
    faviconUrl: letterIcon(host),
    latency: host.startsWith('slow.') ? 4000 : 350 + (hash(url) % 500),
    failure:
      host.includes('offline') || host.endsWith('.invalid')
        ? { code: -105, description: 'ERR_NAME_NOT_RESOLVED' }
        : null,
  };

  const known = KNOWN[key];
  if (known) return { ...base, ...known };

  if (host === 'duckduckgo.com' && parsed.searchParams.has('q')) {
    const query = parsed.searchParams.get('q') ?? '';
    return {
      ...base,
      title: `${query} at DuckDuckGo`,
      summary: `Results for “${query}”.`,
      links: [
        {
          label: `${titleCase(query)} — Wikipedia`,
          url: wiki(titleCase(query)),
        },
        { label: `${slug(query)}.com`, url: `https://${slug(query)}.com/` },
        {
          label: `Discussions about ${query}`,
          url: `https://news.ycombinator.com/item?id=${hash(query) % 99999}`,
        },
      ],
    };
  }

  // The registrable name: `en.wikipedia.org` → `wikipedia`.
  const name = host.split('.').at(-2) ?? host;
  const section = parsed.pathname.split('/').filter(Boolean).at(-1);
  return {
    ...base,
    title: section
      ? `${titleCase(decodeURIComponent(section))} · ${titleCase(name)}`
      : titleCase(name),
    summary: `A simulated page at ${host}. Follow a link to continue the trail, or open it as a child page.`,
    links: ['about', 'guides', 'changelog']
      .filter((part) => part !== section)
      .map((part) => ({
        label: titleCase(part),
        url: `${parsed.origin}/${part}`,
      })),
  };
}
