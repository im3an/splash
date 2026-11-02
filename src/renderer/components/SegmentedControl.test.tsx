// @vitest-environment jsdom
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { SegmentedControl } from './SegmentedControl';

function Choice({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState('system');
  return (
    <SegmentedControl<string>
      label="Appearance"
      options={[
        { value: 'system', label: 'System' },
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ]}
      value={value}
      onChange={setValue}
      disabled={disabled}
    />
  );
}

it('has one tab stop and follows arrow keys, including wraparound', () => {
  render(<Choice />);
  const system = screen.getByRole('radio', { name: 'System' });
  const dark = screen.getByRole('radio', { name: 'Dark' });
  expect(system.tabIndex).toBe(0);
  expect(dark.tabIndex).toBe(-1);
  system.focus();
  fireEvent.keyDown(system, { key: 'ArrowLeft' });
  expect(document.activeElement).toBe(dark);
  expect(dark.getAttribute('aria-checked')).toBe('true');
  expect(dark.tabIndex).toBe(0);
  expect(system.tabIndex).toBe(-1);
  fireEvent.keyDown(dark, { key: 'Home' });
  expect(document.activeElement).toBe(system);
  expect(system.getAttribute('aria-checked')).toBe('true');
});

it('keeps a disabled choice unchanged', () => {
  render(<Choice disabled />);
  fireEvent.keyDown(screen.getByRole('radiogroup'), { key: 'ArrowRight' });
  expect(
    screen.getByRole('radio', { name: 'System' }).getAttribute('aria-checked'),
  ).toBe('true');
  expect(
    (screen.getByRole('radio', { name: 'Light' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
