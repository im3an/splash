import { useEffect, useRef, useState } from 'react';
import { Blocks, CircleAlert } from '../icons';
import type { TaskEntry, TaskList } from '../../shared/types';
import { formatBytes } from '../lib/format';
import { api } from '../splash-api';
import { BrandMark } from './Brand';
import { SiteIcon } from './Favicon';
import { PanelHeader } from './PanelHeader';
import { PanelState } from './PanelState';

const REFRESH_MS = 2000;

/**
 * Biggest first as the panel opens, then rows stay put: one that moved
 * every two seconds could put End under the pointer as it was clicked.
 */
function steady(entries: TaskEntry[], order: Map<string, number>): TaskEntry[] {
  for (const entry of [...entries].sort(
    (a, b) => b.memoryBytes - a.memoryBytes,
  )) {
    // Splash isn't something to act on, so it stays out of the way at the end.
    if (entry.kind !== 'splash' && !order.has(entry.id)) {
      order.set(entry.id, order.size);
    }
  }
  const place = (entry: TaskEntry) => order.get(entry.id) ?? Infinity;
  return [...entries].sort((a, b) => place(a) - place(b));
}

/** What each page costs in memory and processor, and a way to end one. */
export function TasksPanel() {
  const [list, setList] = useState<TaskList | null>(null);
  const [failed, setFailed] = useState(false);
  const order = useRef(new Map<string, number>());

  useEffect(() => {
    let current = true;
    const load = () =>
      api()
        .listTasks()
        .then((next) => {
          if (!current) return;
          setList(next);
          setFailed(false);
        })
        .catch(() => {
          if (current) setFailed(true);
        });
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      current = false;
      clearInterval(timer);
    };
  }, []);

  const total = list?.entries.reduce((sum, row) => sum + row.memoryBytes, 0);
  return (
    <>
      <PanelHeader title="Task Manager">
        {total !== undefined && (
          <span className="pr-2 text-small text-fg-subtle tabular-nums">
            {formatBytes(total)}
          </span>
        )}
      </PanelHeader>
      {failed && !list ? (
        <PanelState
          icon={CircleAlert}
          title="Couldn’t read what’s running"
          detail="It’ll try again in a moment."
          error
        />
      ) : list ? (
        <>
          <ul className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto">
            {steady(list.entries, order.current).map((entry) => (
              <TaskRow key={entry.id} entry={entry} />
            ))}
          </ul>
          {list.asleepPages > 0 && (
            <p className="px-2.5 py-2 text-small text-fg-subtle">
              {list.asleepPages === 1
                ? '1 page is asleep, using no memory.'
                : `${list.asleepPages} pages are asleep, using no memory.`}
            </p>
          )}
        </>
      ) : (
        <div className="h-12" role="status" aria-busy="true" />
      )}
    </>
  );
}

function TaskIcon({ entry }: { entry: TaskEntry }) {
  if (entry.kind === 'splash') {
    return <BrandMark size={16} className="shrink-0 text-fg-muted" />;
  }
  if (entry.kind === 'extension') {
    return <Blocks size={14} className="mx-px shrink-0 text-fg-subtle" />;
  }
  return <SiteIcon url={entry.faviconUrl} site={entry.url} />;
}

function TaskRow({ entry }: { entry: TaskEntry }) {
  const others = entry.pageIds.length - 1;
  const pageId = entry.pageIds[0];
  const cost = `${formatBytes(entry.memoryBytes)} · ${Math.round(entry.cpuPercent)}%`;
  return (
    <li className="group flex min-h-9 items-center gap-2 rounded-row pr-1 pl-2.5 hover:bg-row-hover">
      <TaskIcon entry={entry} />
      <button
        type="button"
        disabled={!pageId}
        onClick={() => {
          if (pageId) void api().activatePage(pageId);
        }}
        title={entry.url ?? entry.title}
        className="min-w-0 flex-1 py-1 text-left"
      >
        <span className="block truncate">{entry.title}</span>
        {entry.isUnresponsive ? (
          <span className="block text-small text-danger">Not responding</span>
        ) : others > 0 ? (
          <span className="block truncate text-small text-fg-subtle">
            and {others} more {others === 1 ? 'page' : 'pages'}
          </span>
        ) : null}
      </button>
      <span className="shrink-0 text-small text-fg-subtle tabular-nums group-focus-within:hidden group-hover:hidden">
        {cost}
      </span>
      {pageId && (
        <button
          type="button"
          onClick={() => void api().endTask(pageId)}
          aria-label={`End ${entry.title}`}
          title={others > 0 ? 'End these pages' : 'End this page'}
          className="button button-sm hidden shrink-0 group-focus-within:inline-flex group-hover:inline-flex"
        >
          End
        </button>
      )}
    </li>
  );
}
