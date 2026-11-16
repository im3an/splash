import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type ReactNodeViewProps,
} from '@tiptap/react';
import { common, createLowlight } from 'lowlight';
import { Check, Copy, Pencil } from '../../../icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  parseSketch,
  prefersDark,
  renderMermaid,
  strokeInk,
  strokePath,
  strokeWidth,
} from './draw';
import { useNoteUi } from './ui-store';

/** Languages offered in the picker; anything else typed after ``` still works. */
export const CODE_LANGUAGES: { id: string; label: string }[] = [
  { id: '', label: 'Plain text' },
  { id: 'mermaid', label: 'Mermaid diagram' },
  { id: 'sketch', label: 'Sketch' },
  { id: 'bash', label: 'Shell' },
  { id: 'css', label: 'CSS' },
  { id: 'go', label: 'Go' },
  { id: 'html', label: 'HTML' },
  { id: 'java', label: 'Java' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'json', label: 'JSON' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'python', label: 'Python' },
  { id: 'rust', label: 'Rust' },
  { id: 'sql', label: 'SQL' },
  { id: 'swift', label: 'Swift' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'yaml', label: 'YAML' },
];

const lowlight = createLowlight(common);

export const CodeBlock = CodeBlockLowlight.extend({
  draggable: true,
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
}).configure({ lowlight, defaultLanguage: null });

function CodeBlockView({
  node,
  updateAttributes,
  selected,
  editor,
  getPos,
}: ReactNodeViewProps) {
  const language = String(node.attrs.language ?? '');
  const source = node.textContent;
  const visual = language === 'mermaid' || language === 'sketch';
  // Diagrams and sketches show drawn; their source opens on request.
  const [showSource, setShowSource] = useState(!visual || !source.trim());
  const [copied, setCopied] = useState(false);
  const known = CODE_LANGUAGES.some((item) => item.id === language);

  // Typing in a diagram's source keeps it open.
  const focusedInside = editor.isFocused && selected;
  useEffect(() => {
    if (!visual) setShowSource(true);
  }, [visual]);

  return (
    <NodeViewWrapper
      className="note-code"
      data-language={language || 'text'}
      data-visual={visual}
      data-source={showSource || focusedInside}
    >
      <div className="note-code-bar" contentEditable={false}>
        <select
          aria-label="Language"
          value={language}
          onChange={(event) => {
            updateAttributes({ language: event.target.value || null });
            setShowSource(!['mermaid', 'sketch'].includes(event.target.value));
          }}
        >
          {!known && <option value={language}>{language}</option>}
          {CODE_LANGUAGES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <span className="note-code-gap" />
        {language === 'sketch' && (
          <button
            type="button"
            className="note-chip"
            onClick={() => {
              const pos = typeof getPos === 'function' ? getPos() : null;
              useNoteUi.getState().set({
                sketch: { pos: pos ?? null, source },
              });
            }}
          >
            <Pencil size={12} aria-hidden /> Draw
          </button>
        )}
        {visual && (
          <button
            type="button"
            className="note-chip"
            aria-pressed={showSource}
            onClick={() => setShowSource((open) => !open)}
          >
            {showSource ? 'Hide source' : 'Source'}
          </button>
        )}
        <button
          type="button"
          className="note-chip"
          aria-label="Copy code"
          onClick={() => {
            void navigator.clipboard.writeText(source).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            });
          }}
        >
          {copied ? (
            <Check size={12} aria-hidden />
          ) : (
            <Copy size={12} aria-hidden />
          )}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="note-code-source" spellCheck={false}>
        <NodeViewContent<'code'> as="code" />
      </pre>
      {language === 'mermaid' && <MermaidPreview source={source} />}
      {language === 'sketch' && <SketchPreview source={source} />}
    </NodeViewWrapper>
  );
}

/** The diagram, redrawn a moment after typing stops. */
function MermaidPreview({ source }: { source: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!source.trim()) return;
    let current = true;
    const timer = setTimeout(() => {
      const root = ref.current;
      if (!root) return;
      renderMermaid(source, prefersDark(), getComputedStyle(root).fontFamily)
        .then((svg) => {
          if (!current) return;
          root.innerHTML = svg;
          setError(null);
        })
        .catch((reason: Error) => {
          if (current)
            setError(reason.message?.split('\n')[0] ?? 'Could not draw');
        });
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [source]);
  return (
    <div className="note-code-preview" contentEditable={false}>
      <div ref={ref} className="note-diagram" />
      {!source.trim() && (
        <p className="note-code-hint">
          Write a diagram, like graph LR; A --&gt; B
        </p>
      )}
      {error && <p className="note-code-error">{error}</p>}
    </div>
  );
}

export function SketchSvg({ source }: { source: string }) {
  const sketch = useMemo(() => parseSketch(source), [source]);
  if (!sketch) return null;
  return (
    <svg
      className="note-sketch"
      viewBox={`0 0 ${sketch.w} ${sketch.h}`}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Sketch"
    >
      {sketch.s.map((stroke, index) => (
        <path
          key={index}
          d={strokePath(stroke)}
          stroke={strokeInk(sketch, index)}
          strokeWidth={strokeWidth(sketch, index)}
        />
      ))}
    </svg>
  );
}

function SketchPreview({ source }: { source: string }) {
  const valid = parseSketch(source) !== null;
  return (
    <div className="note-code-preview" contentEditable={false}>
      {valid ? (
        <SketchSvg source={source} />
      ) : (
        <p className="note-code-hint">Choose Draw to sketch here.</p>
      )}
    </div>
  );
}
