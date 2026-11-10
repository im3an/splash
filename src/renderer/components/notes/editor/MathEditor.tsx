import type { Editor } from '@tiptap/core';
import katex from 'katex';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNoteUi } from './ui-store';

const EXAMPLES = [
  '\\frac{a}{b}',
  'x^{2}',
  '\\sqrt{x}',
  '\\sum_{i=1}^{n}',
  '\\int_a^b',
  '\\alpha \\beta \\gamma',
];

/** Writes or rewrites a formula, typeset live as you type. */
export function MathEditor({ editor }: { editor: Editor }) {
  const math = useNoteUi((state) => state.math);
  const close = () => {
    useNoteUi.getState().set({ math: null });
    editor.commands.focus();
  };
  if (!math) return null;
  return (
    <MathSheet
      key={`${math.pos}-${math.inline}`}
      editor={editor}
      math={math}
      onClose={close}
    />
  );
}

function MathSheet({
  editor,
  math,
  onClose,
}: {
  editor: Editor;
  math: { pos: number | null; latex: string; inline: boolean };
  onClose: () => void;
}) {
  const [latex, setLatex] = useState(math.latex);
  const field = useRef<HTMLTextAreaElement>(null);
  useEffect(() => field.current?.focus(), []);
  const preview = useMemo(
    () =>
      latex.trim()
        ? katex.renderToString(latex, {
            displayMode: !math.inline,
            throwOnError: false,
            output: 'htmlAndMathml',
          })
        : '',
    [latex, math.inline],
  );

  const save = () => {
    const value = latex.trim();
    const chain = editor.chain().focus();
    if (math.pos !== null) {
      if (!value) {
        (math.inline
          ? chain.deleteInlineMath({ pos: math.pos })
          : chain.deleteBlockMath({ pos: math.pos })
        ).run();
      } else if (math.inline) {
        chain.updateInlineMath({ latex: value, pos: math.pos }).run();
      } else {
        chain.updateBlockMath({ latex: value, pos: math.pos }).run();
      }
    } else if (value) {
      (math.inline
        ? chain.insertInlineMath({ latex: value })
        : chain.insertBlockMath({ latex: value })
      ).run();
    }
    onClose();
  };

  return (
    <div className="note-scrim" onPointerDown={onClose}>
      <div
        role="dialog"
        aria-label={math.inline ? 'Inline math' : 'Math block'}
        className="note-pop note-sheet note-math-sheet"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <p className="note-sheet-title">
          {math.inline ? 'Inline math' : 'Math block'}
        </p>
        <div
          className="note-math-preview"
          aria-live="polite"
          // KaTeX output, from text typed here; trust stays off.
          dangerouslySetInnerHTML={{
            __html:
              preview ||
              '<span class="note-code-hint">The formula shows here</span>',
          }}
        />
        <textarea
          ref={field}
          value={latex}
          rows={3}
          spellCheck={false}
          aria-label="LaTeX"
          placeholder="E = mc^2"
          className="note-math-field"
          onChange={(event) => setLatex(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              onClose();
            }
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              save();
            }
          }}
        />
        <div className="note-math-examples">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              className="note-chip"
              onClick={() => {
                setLatex(
                  (value) =>
                    `${value}${value && !value.endsWith(' ') ? ' ' : ''}${example}`,
                );
                field.current?.focus();
              }}
            >
              {example}
            </button>
          ))}
        </div>
        <div className="note-sheet-actions">
          <span className="note-sheet-hint">↵ to save · ⇧↵ new line</span>
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="button button-raised" onClick={save}>
            {math.pos === null ? 'Insert' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
