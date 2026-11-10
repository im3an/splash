import { Extension, type Editor, type Range } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, {
  type SuggestionKeyDownProps,
  type SuggestionProps,
} from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { filterCommands, runCommand, type BlockCommand } from './commands';

export interface SlashMenuOptions {
  /** The commands on offer; read on every `/`, so it can follow the page. */
  commands: () => BlockCommand[];
}

/** `/` at the start of a word opens the block menu. */
export const SlashCommand = Extension.create<SlashMenuOptions>({
  name: 'slashCommand',
  addOptions() {
    return { commands: () => [] };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion<BlockCommand, BlockCommand>({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommand'),
        char: '/',
        allowSpaces: false,
        allow: ({ state, range }) => {
          // Not inside code, where a slash is just a slash.
          const $from = state.doc.resolve(range.from);
          return !$from.parent.type.spec.code;
        },
        items: ({ query }) => filterCommands(this.options.commands(), query),
        command: ({ editor, range, props }) => runCommand(editor, range, props),
        render: slashRenderer,
      }),
    ];
  },
});

interface MenuHandle {
  onKeyDown(event: KeyboardEvent): boolean;
}

function slashRenderer() {
  let renderer: ReactRenderer<MenuHandle, MenuProps> | null = null;
  const place = (props: SuggestionProps<BlockCommand, BlockCommand>) => {
    const element = renderer?.element as HTMLElement | undefined;
    const rect = props.clientRect?.();
    if (!element || !rect) return;
    const height = element.offsetHeight || 360;
    const below = rect.bottom + 6 + height < window.innerHeight - 12;
    element.style.left = `${Math.min(rect.left, window.innerWidth - 320)}px`;
    element.style.top = below
      ? `${rect.bottom + 6}px`
      : `${Math.max(12, rect.top - 6 - height)}px`;
  };
  return {
    onStart(props: SuggestionProps<BlockCommand, BlockCommand>) {
      renderer = new ReactRenderer(SlashMenu, {
        editor: props.editor,
        props: toMenuProps(props),
      });
      const element = renderer.element as HTMLElement;
      element.classList.add('note-slash-host');
      document.body.append(element);
      requestAnimationFrame(() => place(props));
    },
    onUpdate(props: SuggestionProps<BlockCommand, BlockCommand>) {
      renderer?.updateProps(toMenuProps(props));
      requestAnimationFrame(() => place(props));
    },
    onKeyDown({ event }: SuggestionKeyDownProps) {
      if (event.key === 'Escape') {
        renderer?.destroy();
        renderer?.element.remove();
        renderer = null;
        return true;
      }
      return renderer?.ref?.onKeyDown(event) ?? false;
    },
    onExit() {
      renderer?.destroy();
      renderer?.element.remove();
      renderer = null;
    },
  };
}

interface MenuProps {
  items: BlockCommand[];
  query: string;
  choose(command: BlockCommand): void;
}

const toMenuProps = (
  props: SuggestionProps<BlockCommand, BlockCommand>,
): MenuProps => ({
  items: props.items,
  query: props.query,
  choose: (command) => props.command(command),
});

const SlashMenu = forwardRef<MenuHandle, MenuProps>(function SlashMenu(
  { items, query, choose },
  ref,
) {
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => setIndex(0), [items]);
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (!items.length) return false;
      if (event.key === 'ArrowDown') {
        setIndex((value) => (value + 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowUp') {
        setIndex((value) => (value - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = items[index];
        if (item) choose(item);
        return true;
      }
      return false;
    },
  }));

  if (!items.length) {
    return (
      <div className="note-pop note-slash" role="listbox">
        <p className="note-slash-empty">No blocks match “{query}”</p>
      </div>
    );
  }

  let lastGroup = '';
  return (
    <div
      ref={listRef}
      className="note-pop note-slash"
      role="listbox"
      aria-label="Insert a block"
    >
      {items.map((item, i) => {
        const header = !query && item.group !== lastGroup ? item.group : null;
        lastGroup = item.group;
        const Icon = item.icon;
        return (
          <div key={item.id}>
            {header && <p className="note-slash-group">{header}</p>}
            <button
              type="button"
              role="option"
              data-index={i}
              aria-selected={i === index}
              className="note-slash-item"
              onMouseEnter={() => setIndex(i)}
              onMouseDown={(event) => {
                event.preventDefault();
                choose(item);
              }}
            >
              <span className="note-slash-icon">
                <Icon size={18} aria-hidden />
              </span>
              <span className="note-slash-text">
                <span className="note-slash-title">{item.title}</span>
                <span className="note-slash-hint">{item.hint}</span>
              </span>
              {item.markdown && (
                <kbd className="note-slash-md">{item.markdown.trim()}</kbd>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
});

export type { Editor, Range };
