// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { parseSketch, renderNote, strokePath } from './render-note';

describe('renderNote', () => {
  it('gives headings ids the outline can jump to', () => {
    const html = renderNote('# Hello world\n\n## Goals\n\n## Goals');
    expect(html).toContain('id="note-hello-world"');
    expect(html).toContain('id="note-goals"');
    expect(html).toContain('id="note-goals-1"');
  });

  it('typesets inline and block math', () => {
    const html = renderNote('Euler $e^{i\\pi}$\n\n$$\n\\frac{1}{2}\n$$');
    expect(html).toContain('class="katex"');
    expect(html).toContain('katex-display');
  });

  it('leaves money alone', () => {
    expect(renderNote('It cost $5 and $10.')).not.toContain('katex');
  });

  it('turns a lone link into a card and keeps inline links as links', () => {
    const card = renderNote('https://www.sesame.com/research');
    expect(card).toContain('class="note-card"');
    expect(card).toContain('sesame.com');
    expect(renderNote('see https://a.org here')).not.toContain('note-card');
  });

  it('leaves mermaid as a placeholder with its source', () => {
    const html = renderNote('```mermaid\ngraph LR\n  A --> B\n```');
    expect(html).toContain('class="note-mermaid"');
    expect(html).toContain('<pre>graph LR\n  A --&gt; B</pre>');
  });

  it('draws sketches from numbers only', () => {
    const html = renderNote(
      '```sketch\n{"w":10,"h":10,"s":[[0,0,5,5,9,9]]}\n```',
    );
    expect(html).toContain('<svg');
    expect(html).toContain('<path d="M0 0');
    expect(parseSketch('{"w":1,"h":1,"s":[["<script>"]]}')).toBeNull();
  });

  it('strips script and handlers from pasted HTML', () => {
    const html = renderNote(
      '<img src=x onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a>',
    );
    expect(html).not.toMatch(/onerror|<script|javascript:/);
  });
});

describe('strokePath', () => {
  it('draws a dot for a single point and curves for more', () => {
    expect(strokePath([1, 2])).toBe('M1 2L1.01 2');
    expect(strokePath([0, 0, 2, 2, 4, 0, 6, 2])).toContain('Q');
  });
});
