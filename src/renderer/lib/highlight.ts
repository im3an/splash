export interface TextPart {
  text: string;
  match: boolean;
}

/**
 * Splits `text` so the first place each query word appears can be marked,
 * the way the palette shows why a row matched. Case doesn't matter;
 * overlapping matches merge.
 */
export function highlightParts(text: string, query: string): TextPart[] {
  const lower = text.toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const ranges: [number, number][] = [];
  for (const word of words) {
    const start = lower.indexOf(word);
    if (start !== -1) ranges.push([start, start + word.length]);
  }
  if (ranges.length === 0) return [{ text, match: false }];

  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }

  const parts: TextPart[] = [];
  let at = 0;
  for (const [start, end] of merged) {
    if (start > at) parts.push({ text: text.slice(at, start), match: false });
    parts.push({ text: text.slice(start, end), match: true });
    at = end;
  }
  if (at < text.length) parts.push({ text: text.slice(at), match: false });
  return parts;
}
