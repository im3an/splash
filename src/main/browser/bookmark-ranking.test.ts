import type { BookmarkLink } from '../../shared/bookmarks';
import type { HistoryMatch } from '../storage/trail-store';
import { rankBookmarks } from './bookmark-ranking';

const NOW = 1_000_000_000_000;

function bookmark(
  title: string,
  url: string,
  folderName: string | null = null,
): BookmarkLink {
  return {
    link: { id: `${folderName}:${url}`, title, url },
    folderId: folderName ?? 'main',
    folderName,
  };
}

function visit(url: string, visitCount: number): HistoryMatch {
  return { url, title: '', visitCount, lastVisitedAt: NOW, faviconUrl: null };
}

const titles = (query: string, bookmarks: BookmarkLink[]) =>
  rankBookmarks(query, bookmarks, [], NOW).map(({ link }) => link.title);

describe('rankBookmarks', () => {
  const LIBRARY = [
    bookmark('Quarterly budget', 'https://docs.example/q3/finance'),
    bookmark('Rust book', 'https://www.rust-lang.org/learn'),
  ];

  it('matches a title or an address', () => {
    expect(titles('budget', LIBRARY)).toEqual(['Quarterly budget']);
    expect(titles('rust-lang', LIBRARY)).toEqual(['Rust book']);
    expect(titles('finance', LIBRARY)).toEqual(['Quarterly budget']);
  });

  it('ignores case, and needs every word somewhere', () => {
    expect(titles('QUARTERLY', LIBRARY)).toEqual(['Quarterly budget']);
    expect(titles('budget finance', LIBRARY)).toEqual(['Quarterly budget']);
    expect(titles('budget rust', LIBRARY)).toEqual([]);
  });

  it('finds an address however it was typed', () => {
    for (const query of [
      'rust-lang.org/learn',
      'www.rust-lang.org',
      'https://www.rust-lang.org/learn',
    ]) {
      expect(titles(query, LIBRARY)).toEqual(['Rust book']);
    }
  });

  it('does not match every bookmark on the scheme', () => {
    expect(titles('https', LIBRARY)).toEqual([]);
    expect(titles('https://', LIBRARY)).toEqual([]);
    expect(titles('www.', LIBRARY)).toEqual([]);
  });

  it('finds nothing for no words', () => {
    expect(titles('   ', LIBRARY)).toEqual([]);
  });

  it('skips what is not an address', () => {
    expect(titles('broken', [bookmark('broken', 'not an address')])).toEqual(
      [],
    );
  });

  it('puts a match at the start ahead of one inside a word', () => {
    expect(
      titles('art', [
        bookmark('Smart homes', 'https://a.example/'),
        bookmark('Art history', 'https://b.example/'),
      ]),
    ).toEqual(['Art history', 'Smart homes']);
  });

  it('puts the site a bookmark is on ahead of a word in another title', () => {
    expect(
      titles('github', [
        bookmark('Notes on github', 'https://notes.example/'),
        bookmark('Code', 'https://github.com/'),
      ]),
    ).toEqual(['Code', 'Notes on github']);
  });

  it('shows an address saved in two folders once, naming a folder', () => {
    const found = rankBookmarks(
      'docs',
      [
        bookmark('Docs', 'https://docs.example/', 'Work'),
        bookmark('Docs', 'http://www.docs.example/'),
      ],
      [],
      NOW,
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.folderName).toBe('Work');
  });

  it('keeps the better title of an address saved twice', () => {
    const found = rankBookmarks(
      'handbook',
      [
        bookmark('Old name', 'https://docs.example/'),
        bookmark('Handbook', 'https://docs.example/', 'Work'),
      ],
      [],
      NOW,
    );
    expect(found.map(({ link }) => link.title)).toEqual(['Handbook']);
  });

  it('counts visits to the address a bookmark redirects to', () => {
    const [redirected, other] = rankBookmarks(
      'docs',
      [
        bookmark('Docs one', 'https://one.example/'),
        bookmark('Docs two', 'https://two.example/learn'),
      ],
      [visit('https://www.two.example/learn/', 200)],
      NOW,
    );
    expect(redirected?.link.title).toBe('Docs two');
    expect(other?.link.title).toBe('Docs one');
  });

  it('ranks a bookmark in daily use above one never opened', () => {
    const found = rankBookmarks(
      'docs',
      [
        bookmark('Docs one', 'https://one.example/'),
        bookmark('Docs two', 'https://two.example/'),
      ],
      [visit('https://two.example/', 200)],
      NOW,
    );
    expect(found.map(({ link }) => link.title)).toEqual([
      'Docs two',
      'Docs one',
    ]);
  });

  it('scores a match as it would an open page, whatever the visits', () => {
    const [unused] = rankBookmarks(
      'docs',
      [bookmark('Docs', 'https://one.example/')],
      [],
      NOW,
    );
    const [used] = rankBookmarks(
      'docs',
      [bookmark('Docs', 'https://one.example/')],
      [visit('https://one.example/', 200)],
      NOW,
    );
    // The title's first word, at the title's weight.
    expect(unused?.match).toBe(6);
    expect(used?.match).toBe(6);
    expect(used?.score).toBeGreaterThan(unused?.score ?? 0);
  });
});
