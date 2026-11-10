/**
 * A note split into the blocks the live editor shows one by one: runs of
 * non-blank lines, with headings on their own and fenced code or `$$` math
 * kept whole even across blank lines. Offsets index the note's text.
 */

export type BlockKind = 'h1' | 'h2' | 'h3' | 'code' | 'math' | 'text';

export interface Block {
  start: number;
  /** Exclusive; never includes the blank lines between blocks. */
  end: number;
  /** The block's first line in the note. */
  line: number;
  kind: BlockKind;
}

const FENCE = /^\s*(```|~~~)/;

export function blockKind(text: string): BlockKind {
  if (FENCE.test(text)) return 'code';
  if (/^\s*\$\$/.test(text)) return 'math';
  const heading = /^(#{1,6})\s/.exec(text);
  if (heading) {
    const level = heading[1]?.length ?? 3;
    return level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
  }
  return 'text';
}

export function splitBlocks(body: string, offset = 0, firstLine = 0): Block[] {
  const blocks: Block[] = [];
  const lines = body.split('\n');
  let position = 0;
  let current: { start: number; line: number } | null = null;
  let closing: RegExp | null = null;
  let lastEnd = 0;

  const finish = () => {
    if (!current) return;
    const text = body.slice(current.start, lastEnd);
    blocks.push({
      start: offset + current.start,
      end: offset + lastEnd,
      line: firstLine + current.line,
      kind: blockKind(text),
    });
    current = null;
  };

  lines.forEach((text, index) => {
    const lineStart = position;
    const lineEnd = position + text.length;
    position = lineEnd + 1;

    if (closing) {
      lastEnd = lineEnd;
      if (closing.test(text)) {
        closing = null;
        finish();
      }
      return;
    }
    if (!text.trim()) {
      finish();
      return;
    }
    const fence = FENCE.exec(text);
    const math = /^\s*\$\$/.test(text);
    const heading = /^#{1,6}\s/.test(text);
    if (fence || math || heading) finish();
    current ??= { start: lineStart, line: index };
    lastEnd = lineEnd;
    if (fence) {
      const marker = fence[1] ?? '```';
      closing = new RegExp(`^\\s*${marker === '```' ? '```' : '~~~'}\\s*$`);
    } else if (math) {
      // `$$x$$` on one line is whole; otherwise it runs to the next `$$`.
      const trimmed = text.trim();
      if (trimmed.length > 4 && trimmed.endsWith('$$')) finish();
      else closing = /\$\$\s*$/;
    }
    if (heading) finish();
  });
  finish();
  return blocks;
}
