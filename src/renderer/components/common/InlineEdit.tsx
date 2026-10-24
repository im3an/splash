import { useLayoutEffect, useRef, useState } from 'react';

/**
 * A text field that replaces a label while renaming. Enter or leaving the
 * field commits; Escape cancels. Exactly one of the callbacks runs.
 */
export function InlineEdit({
  initial,
  label,
  maxLength,
  onCommit,
  onCancel,
  className = '',
}: {
  initial: string;
  label: string;
  maxLength: number;
  onCommit(value: string): void;
  onCancel(): void;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);
  const finished = useRef(false);

  useLayoutEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const finish = (commit: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (commit) onCommit(value);
    else onCancel();
  };

  return (
    <input
      ref={inputRef}
      value={value}
      aria-label={label}
      maxLength={maxLength}
      spellCheck={false}
      autoComplete="off"
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={(event) => {
        // Keys typed here belong to the field, not the tree or shortcuts.
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          finish(true);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      className={`h-[22px] min-w-0 flex-1 rounded-[4px] bg-field-focus px-1.5 text-fg shadow-[0_0_0_1px_var(--hairline),0_0_0_3px_var(--accent-soft)] outline-none select-text ${className}`}
    />
  );
}
