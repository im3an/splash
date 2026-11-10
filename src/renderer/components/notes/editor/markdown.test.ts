// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { noteExtensions } from './extensions';

let editor: Editor | null = null;
afterEach(() => editor?.destroy());

const roundTrip = (markdown: string) => {
  editor = new Editor({
    extensions: noteExtensions({ commands: () => [] }),
    content: markdown,
    contentType: 'markdown',
  });
  return { md: editor.getMarkdown(), json: editor.getJSON() };
};

const SAMPLE = `# Title

Some **bold**, *italic*, ~~gone~~, \`code\` and a [link](https://example.com/a).

https://www.sesame.com/research

## Tasks

- [ ] open
- [x] done

:::callout {emoji="⚠️"}
Careful here.
:::

\`\`\`mermaid
graph LR
  A --> B
\`\`\`

$$
\\frac{1}{2}
$$

Euler $e^{i\\pi}$ costs $5 and $10.

| a | b |
| --- | --- |
| 1 | 2 |
`;

describe('notes Markdown', () => {
  it('reads every block type', () => {
    const { json } = roundTrip(SAMPLE);
    const types = json.content?.map((node) => node.type);
    expect(types).toEqual([
      'heading',
      'paragraph',
      'bookmark',
      'heading',
      'taskList',
      'callout',
      'codeBlock',
      'blockMath',
      'paragraph',
      'table',
    ]);
  });

  it('writes back what it read', () => {
    const { md } = roundTrip(SAMPLE);
    expect(md).toContain('# Title');
    expect(md).toContain('**bold**');
    expect(md).toContain('[link](https://example.com/a)');
    expect(md).toMatch(/^https:\/\/www\.sesame\.com\/research$/m);
    expect(md).toMatch(/- \[ \] open/);
    expect(md).toMatch(/- \[x\] done/);
    expect(md).toContain(':::callout {emoji="⚠️"}');
    expect(md).toContain('```mermaid\ngraph LR\n  A --> B\n```');
    expect(md).toContain('$$\n\\frac{1}{2}\n$$');
    expect(md).toContain('$e^{i\\pi}$');
    expect(md).toContain('$5 and $10');
    expect(md).toMatch(/\| a +\| b +\|/);
    // And once more gives the same text.
    expect(roundTrip(md).md).toBe(md);
  });

  it('keeps a link inside a sentence a link, not a card', () => {
    const { json } = roundTrip('see\nhttps://a.org here');
    expect(json.content?.map((node) => node.type)).toEqual(['paragraph']);
  });
});

describe('notes Markdown, richer blocks', () => {
  it('round-trips toggles, contents and coloured highlights', () => {
    const source =
      ':::toggle {title="Say \\"hi\\""}\nInside.\n:::\n\n:::toc\n:::\n\nA ==plain== and <mark data-color="blue">blue</mark> mark.';
    const { md, json } = roundTrip(source);
    expect(json.content?.map((node) => node.type)).toEqual([
      'toggle',
      'toc',
      'paragraph',
    ]);
    expect(json.content?.[0]?.attrs).toMatchObject({
      title: 'Say "hi"',
      open: true,
    });
    expect(md).toContain(':::toggle {title="Say \\"hi\\""}');
    expect(md).toContain(':::toc');
    expect(md).toContain('==plain==');
    expect(md).toContain('<mark data-color="blue">blue</mark>');
    expect(roundTrip(md).md).toBe(md);
  });
});
