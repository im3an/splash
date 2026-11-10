import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Keeps the design system from drifting: colours, type sizes, radii,
 * shadows and line heights come from tokens.css, never from literals in
 * components or app.css.
 */

const RENDERER = path.resolve(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(file);
    return /\.(tsx?|css)$/.test(entry.name) && !/\.test\./.test(entry.name)
      ? [file]
      : [];
  });
}

/** Files allowed a literal, and why. */
const ALLOWED: Record<string, RegExp> = {
  // The token definitions themselves.
  'styles/tokens.css': /.*/,
  // The custom-accent swatch shows a rainbow, not a theme colour.
  'components/WorkspaceEditor.tsx': /#[0-9a-f]{3}\b/i,
  // The mark's master ink, swapped for currentColor.
  'components/Brand.tsx': /#221d17/,
  'components/notes/NotesMark.tsx': /#221d17/,
};

const LITERALS = [
  { name: 'colour', pattern: /#[0-9a-f]{3,8}\b|\b(rgb|hsl)a?\(\s*\d/gi },
  { name: 'type size', pattern: /text-\[\d|font-size:\s*\d+px/g },
  { name: 'radius', pattern: /rounded-\[\d|border-radius:\s*\d+px/g },
  { name: 'shadow', pattern: /shadow-\[\d/g },
  { name: 'line height', pattern: /leading-\[\d|line-height:\s*1\.\d/g },
];

describe('design tokens', () => {
  it('are the only source of colours, type, radii, shadows and leading', () => {
    const found: string[] = [];
    for (const file of sources(RENDERER)) {
      const relative = path.relative(RENDERER, file);
      const allowed = ALLOWED[relative];
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
          for (const { name, pattern } of LITERALS) {
            for (const match of line.matchAll(pattern)) {
              if (allowed?.test(match[0])) continue;
              found.push(`${relative}:${index + 1} ${name} ${match[0]}`);
            }
          }
        });
    }
    expect(found).toEqual([]);
  });
});
