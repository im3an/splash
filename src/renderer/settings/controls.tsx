import type { ReactNode } from 'react';

/** A titled group of settings. */
export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-body font-semibold">{title}</h2>
        {description && (
          <p className="mt-0.5 text-small leading-[1.45] text-fg-subtle">
            {description}
          </p>
        )}
      </div>
      <div className="flex flex-col divide-y divide-divider rounded-[var(--radius-content)] bg-elevated shadow-[var(--shadow-row)]">
        {children}
      </div>
    </section>
  );
}

/** One setting: label and help on the left, the control on the right. */
export function Row({
  label,
  help,
  children,
}: {
  label: string;
  help?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-6 px-4 py-2.5">
      <div className="min-w-0">
        <p>{label}</p>
        {help && (
          <p className="mt-0.5 text-small leading-[1.45] text-fg-subtle">
            {help}
          </p>
        )}
      </div>
      {children && (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      )}
    </div>
  );
}

export function Choice<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange(value: T): void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex rounded-[var(--radius-control)] bg-field p-0.5"
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className="h-7 rounded-[var(--radius-inner)] px-2.5 text-small text-fg-muted transition-colors duration-[var(--duration-fast)] hover:text-fg aria-checked:bg-elevated aria-checked:text-fg aria-checked:shadow-[var(--shadow-row)]"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Button({
  children,
  onClick,
  tone = 'plain',
  disabled,
}: {
  children: ReactNode;
  onClick(): void;
  tone?: 'plain' | 'primary' | 'danger';
  disabled?: boolean;
}) {
  const tones = {
    plain: 'bg-field text-fg hover:bg-pressed',
    primary: 'button-primary',
    danger: 'bg-field text-danger hover:bg-pressed',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`button text-small font-medium ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative h-[22px] w-[38px] shrink-0 rounded-full bg-pressed transition-colors duration-[var(--duration-fast)] aria-checked:bg-accent"
    >
      <span
        className="absolute top-[3px] left-[3px] size-4 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out)]"
        style={{ transform: checked ? 'translateX(16px)' : undefined }}
      />
    </button>
  );
}
