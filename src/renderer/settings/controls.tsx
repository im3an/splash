import type { ComponentProps, ReactNode } from 'react';
import { ChevronDown } from '../icons';
import { SegmentedControl } from '../components/SegmentedControl';

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
          <p className="mt-0.5 text-small leading-copy text-fg-subtle">
            {description}
          </p>
        )}
      </div>
      <div className="flex flex-col divide-y divide-divider rounded-content bg-elevated shadow-row">
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
          <p className="mt-0.5 text-small leading-copy text-fg-subtle">
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
    <SegmentedControl
      label={label}
      options={options}
      value={value}
      onChange={onChange}
    />
  );
}

/**
 * A dropdown, always the same width so a section's left edges line up. The
 * value and chevron sit the same distance from their edges; the list that
 * opens is still the system's own.
 */
export function Select(props: ComponentProps<'select'>) {
  return (
    <span className="relative inline-flex w-42 shrink-0">
      <select
        {...props}
        className="h-7 w-full appearance-none truncate rounded-control bg-field pr-6 pl-2.5 text-small text-fg transition-colors duration-fast hover:bg-field-hover"
      />
      <ChevronDown
        size={14}
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-fg-subtle"
      />
    </span>
  );
}

export function Button({
  children,
  onClick,
  tone = 'plain',
  disabled,
  type = 'button',
  'aria-label': ariaLabel,
}: {
  children: ReactNode;
  onClick?(): void;
  tone?: 'plain' | 'primary' | 'danger';
  disabled?: boolean;
  type?: 'button' | 'submit';
  'aria-label'?: string;
}) {
  const tones = {
    plain: 'button-raised',
    primary: 'button-primary',
    danger: 'button-raised button-danger',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
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
      className="switch"
    >
      <span className="switch-knob" />
    </button>
  );
}
