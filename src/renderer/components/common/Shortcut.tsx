import { specOf, type CommandId } from '../../../shared/commands';
import { detectMac, formatShortcut } from '../../commands/shortcuts';
import { api } from '../../splash-api';

/** A command's shortcut as the user's platform writes it, e.g. "⌥⌘↑". */
export function shortcutLabel(id: CommandId): string | null {
  const shortcut = specOf(id).shortcut;
  if (!shortcut) return null;
  return formatShortcut(shortcut, detectMac(api().platform));
}

/** "Rename Page (F2)" — for `title` tooltips. */
export function withShortcut(label: string, id: CommandId): string {
  const shortcut = shortcutLabel(id);
  return shortcut ? `${label} (${shortcut})` : label;
}

export function Shortcut({
  command,
  className = '',
}: {
  command: CommandId;
  className?: string;
}) {
  const label = shortcutLabel(command);
  if (!label) return null;
  return (
    <kbd className={`font-sans text-[11px] text-fg-subtle ${className}`}>
      {label}
    </kbd>
  );
}
