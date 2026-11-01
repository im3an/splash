/** A shared, keyboard-operable choice for settings and workspace controls. */
export function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
  compact = false,
  stretch = false,
  disabled = false,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange(value: T): void;
  compact?: boolean;
  stretch?: boolean;
  disabled?: boolean;
}) {
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={`flex rounded-control bg-field p-0.5 ${stretch ? 'w-full' : ''}`}
      onKeyDown={(event) => {
        if (disabled || !options.length) return;
        let next: number;
        switch (event.key) {
          case 'ArrowRight':
          case 'ArrowDown':
            next = (selected + 1) % options.length;
            break;
          case 'ArrowLeft':
          case 'ArrowUp':
            next = (selected - 1 + options.length) % options.length;
            break;
          case 'Home':
            next = 0;
            break;
          case 'End':
            next = options.length - 1;
            break;
          default:
            return;
        }
        event.preventDefault();
        event.currentTarget
          .querySelectorAll<HTMLButtonElement>('button')
          [next]?.focus();
        onChange(options[next]!.value);
      }}
    >
      {options.map((option, index) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={index === selected ? 0 : -1}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={`rounded-inner text-fg-muted transition-colors duration-fast hover:text-fg active:bg-pressed aria-checked:bg-elevated aria-checked:text-fg aria-checked:shadow-row disabled:opacity-50 ${compact ? 'h-6 px-2 text-caption' : 'h-7 px-2.5 text-small'} ${stretch ? 'min-w-0 flex-1' : ''}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
