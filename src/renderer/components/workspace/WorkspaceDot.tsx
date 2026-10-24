import type { CSSProperties } from 'react';
import type { WorkspaceColor } from '../../../shared/types';

export function WorkspaceDot({
  color,
  active = false,
  className = 'size-2.5',
}: {
  color: WorkspaceColor;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-active={active}
      className={`workspace-dot shrink-0 rounded-full ${className}`}
      style={{ '--dot-color': `var(--ws-${color})` } as CSSProperties}
    />
  );
}
