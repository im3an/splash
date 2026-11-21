import { describe, expect, it } from 'vitest';
import {
  noteOutline,
  noteSites,
  noteTitle,
  notesForSite,
  siteKey,
  type Note,
} from './notes';

const note = (body: string, sites: string[] = [], updatedAt = 0): Note => ({
  id: crypto.randomUUID(),
  body,
  sites,
  createdAt: 0,
  updatedAt,
});

describe('noteOutline', () => {
  it('lists headings with levels, lines and unique slugs, skipping code', () => {
    const outline = noteOutline(
      '# Title\n\n## Goals\n```\n# not a heading\n```\n## Goals\n### A **bold** [link](https://x.org)',
    );
    expect(outline.map((e) => [e.level, e.text, e.line, e.slug])).toEqual([
      [1, 'Title', 0, 'title'],
      [2, 'Goals', 2, 'goals'],
      [2, 'Goals', 6, 'goals-1'],
      [3, 'A bold link', 7, 'a-bold-link'],
    ]);
  });
});

describe('noteTitle', () => {
  it('takes the first heading, else the first line with words', () => {
    expect(noteTitle('intro\n# Heading')).toBe('Heading');
    expect(noteTitle('\n- **Buy** milk')).toBe('Buy milk');
    expect(noteTitle('   ')).toBe('Untitled');
  });
});

describe('sites', () => {
  it('keys by host without www, web addresses only', () => {
    expect(siteKey('https://www.Example.com/a?b')).toBe('example.com');
    expect(siteKey('file:///tmp/x')).toBeNull();
    expect(siteKey('not a url')).toBeNull();
  });

  it('ties a note to pinned sites and to sites its text links', () => {
    expect(
      noteSites(
        note('see https://www.sesame.com/research, and more', ['a.org']),
      ),
    ).toEqual(['a.org', 'sesame.com']);
  });

  it('finds a site’s notes, newest first', () => {
    const old = note('https://a.org', [], 1);
    const fresh = note('x', ['a.org'], 2);
    expect(notesForSite([old, note('b'), fresh], 'a.org')).toEqual([
      fresh,
      old,
    ]);
    expect(notesForSite([old], null)).toEqual([]);
  });
});
