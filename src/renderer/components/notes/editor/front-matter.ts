/**
 * Per-note presentation, kept in the note's own YAML front matter so it
 * travels with the Markdown: `font`, `small`, `wide` and `icon`.
 */

export type NoteFont = 'default' | 'serif' | 'mono';

export interface NoteLook {
  font: NoteFont;
  small: boolean;
  wide: boolean;
  icon: string | null;
  pinned: boolean;
}

export const DEFAULT_LOOK: NoteLook = {
  font: 'default',
  small: false,
  wide: false,
  icon: null,
  pinned: false,
};

const BLOCK = /^---\n([\s\S]*?)\n---\n?/;

/** Splits a note into its look and its Markdown. Unknown keys are kept. */
export function readFrontMatter(body: string): {
  look: NoteLook;
  extra: string[];
  markdown: string;
} {
  const match = BLOCK.exec(body);
  if (!match) return { look: { ...DEFAULT_LOOK }, extra: [], markdown: body };
  const look = { ...DEFAULT_LOOK };
  const extra: string[] = [];
  for (const line of (match[1] ?? '').split('\n')) {
    const pair = /^([\w-]+):\s*(.*)$/.exec(line);
    const key = pair?.[1];
    const value = (pair?.[2] ?? '').trim().replace(/^["']|["']$/g, '');
    if (
      key === 'font' &&
      (value === 'serif' || value === 'mono' || value === 'default')
    )
      look.font = value;
    else if (key === 'small') look.small = value === 'true';
    else if (key === 'wide') look.wide = value === 'true';
    else if (key === 'pinned') look.pinned = value === 'true';
    else if (key === 'icon' && value)
      look.icon = [...value].slice(0, 4).join('');
    else if (line.trim()) extra.push(line);
  }
  return {
    look,
    extra,
    markdown: body.slice(match[0].length).replace(/^\n+/, ''),
  };
}

/** Puts the look back in front of the Markdown; nothing when it's all default. */
export function writeFrontMatter(
  look: NoteLook,
  markdown: string,
  extra: string[] = [],
): string {
  const lines = [...extra];
  if (look.font !== 'default') lines.push(`font: ${look.font}`);
  if (look.small) lines.push('small: true');
  if (look.wide) lines.push('wide: true');
  if (look.icon) lines.push(`icon: ${look.icon}`);
  if (look.pinned) lines.push('pinned: true');
  return lines.length
    ? `---\n${lines.join('\n')}\n---\n\n${markdown}`
    : markdown;
}
