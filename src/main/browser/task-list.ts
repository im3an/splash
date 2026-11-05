import type { PageId, TaskEntry, TaskList } from '../../shared/types';

/** The parts of Electron's process metrics a task list needs. */
export interface ProcessMetrics {
  pid: number;
  cpuPercent: number;
  /** In kilobytes, as Electron reports it. */
  workingSetKb: number;
}

export interface LivePage {
  pageId: PageId;
  title: string;
  url: string | null;
  faviconUrl: string | null;
  isUnresponsive: boolean;
  pid: number;
  /** Processes of frames from other sites; their cost is this page's too. */
  framePids: number[];
}

export interface LiveExtension {
  id: string;
  name: string;
  pid: number;
}

/**
 * One row per process, since that's what memory is measured by and what ending
 * something ends: pages sharing a process share a row. Whatever is left
 * (the app itself, its interface, graphics) is one last row.
 */
export function buildTaskList(
  metrics: readonly ProcessMetrics[],
  pages: readonly LivePage[],
  extensions: readonly LiveExtension[],
  asleepPages: number,
): TaskList {
  const byPid = new Map(metrics.map((process) => [process.pid, process]));
  const counted = new Set<number>();
  const cost = (pids: readonly number[]) => {
    let memoryBytes = 0;
    let cpuPercent = 0;
    for (const pid of pids) {
      const process = byPid.get(pid);
      if (!process || counted.has(pid)) continue;
      counted.add(pid);
      memoryBytes += process.workingSetKb * 1024;
      cpuPercent += process.cpuPercent;
    }
    return { memoryBytes, cpuPercent };
  };

  const groups = new Map<number, LivePage[]>();
  for (const page of pages) {
    groups.set(page.pid, [...(groups.get(page.pid) ?? []), page]);
  }
  // Main processes first, so a frame in another page's process isn't
  // counted twice or taken from the page that really lives there.
  const mains = [...groups.keys()].map((pid) => [pid, cost([pid])] as const);
  const entries: TaskEntry[] = mains.map(([pid, own]) => {
    const group = groups.get(pid)!;
    const first = group[0]!;
    const frames = cost(group.flatMap((page) => page.framePids));
    return {
      id: `page:${first.pageId}`,
      kind: 'page',
      title: first.title,
      url: first.url,
      faviconUrl: first.faviconUrl,
      pageIds: group.map((page) => page.pageId),
      memoryBytes: own.memoryBytes + frames.memoryBytes,
      cpuPercent: own.cpuPercent + frames.cpuPercent,
      isUnresponsive: group.some((page) => page.isUnresponsive),
    };
  });
  for (const extension of extensions) {
    entries.push({
      id: `extension:${extension.id}`,
      kind: 'extension',
      title: extension.name,
      url: null,
      faviconUrl: null,
      pageIds: [],
      isUnresponsive: false,
      ...cost([extension.pid]),
    });
  }
  const rest = metrics.map((process) => process.pid);
  entries.push({
    id: 'splash',
    kind: 'splash',
    title: 'Splash',
    url: null,
    faviconUrl: null,
    pageIds: [],
    isUnresponsive: false,
    ...cost(rest),
  });
  return { entries, asleepPages };
}
