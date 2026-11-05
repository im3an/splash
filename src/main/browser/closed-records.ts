import type {
  ClosedSummary,
  PageId,
  WorkspaceAppearance,
  WorkspaceId,
} from '../../shared/types';
import type { PageHistory, PageRuntimeState } from './page-host';

/**
 * What it takes to undo a close. Plain data, so records can be saved and
 * survive a restart.
 */

export interface ClosedPage {
  id: PageId;
  parentId: PageId | null;
  index: number;
  collapsed: boolean;
  customTitle: string | null;
  note: string | null;
  /** Missing in records saved before pages could be pinned. */
  pinned?: boolean;
  /** The group the page was filed under, if it still exists on undo. */
  groupId?: string | null;
  state: PageRuntimeState;
  history: PageHistory | null;
  createdAt: number;
}

export interface ClosedWorkspace {
  id: WorkspaceId;
  name: string;
  /** Missing in records saved before workspaces had a look. */
  appearance?: WorkspaceAppearance;
  createdAt: number;
  activePageId: PageId | null;
  /** Position in the workspace list. */
  index: number;
}

export interface ClosedRecord {
  workspaceId: WorkspaceId;
  /** Set when a whole workspace was deleted rather than pages closed. */
  workspace: ClosedWorkspace | null;
  /** The closed page first, then (for a branch) its descendants in order. */
  pages: ClosedPage[];
  /** Children promoted when only the page itself was closed. */
  promotedChildIds: PageId[];
  summary: ClosedSummary;
}

/** Keeps only records with the shape this version understands. */
export function isClosedRecord(value: unknown): value is ClosedRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<ClosedRecord>;
  return (
    typeof record.workspaceId === 'string' &&
    Array.isArray(record.pages) &&
    Array.isArray(record.promotedChildIds) &&
    record.pages.every(
      (page) =>
        typeof page?.id === 'string' &&
        typeof page.index === 'number' &&
        typeof page.state === 'object' &&
        page.state !== null,
    ) &&
    typeof record.summary?.label === 'string' &&
    typeof record.summary.serial === 'number'
  );
}
