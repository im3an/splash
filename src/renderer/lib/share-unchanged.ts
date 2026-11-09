/**
 * The main process sends the whole snapshot on every change, and each one arrives
 * as all new objects, so nothing could tell what changed: one page's new title
 * redrew every row of the trail. These keep the old object wherever the contents
 * are the same, so a selector or `memo` sees only real changes.
 *
 * They're for plain data, as it arrives over IPC.
 */

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function shareValue(old: unknown, next: unknown): unknown {
  if (Object.is(old, next)) return old;
  if (!isObject(old) || !isObject(next)) return next;
  if (Array.isArray(old) !== Array.isArray(next)) return next;

  if (Array.isArray(old) && Array.isArray(next)) {
    let same = old.length === next.length;
    const items = (next as unknown[]).map((item, index) => {
      const kept = shareValue(old[index], item);
      if (kept !== old[index]) same = false;
      return kept;
    });
    return same ? old : items;
  }

  const keys = Object.keys(next);
  let same = keys.length === Object.keys(old).length;
  const fields: Record<string, unknown> = {};
  for (const key of keys) {
    const kept = shareValue(old[key], next[key]);
    if (kept !== old[key] || !(key in old)) same = false;
    fields[key] = kept;
  }
  return same ? old : fields;
}

/** `next`, reusing every part of `old` whose contents are the same. */
export function shareUnchanged<T>(old: T | null | undefined, next: T): T {
  return shareValue(old, next) as T;
}

/**
 * The same for a list whose items move: a row opened near the top shifts all the
 * rows below it, and they haven't changed.
 */
export function shareById<T extends { id: string }>(
  old: readonly T[],
  next: readonly T[],
): T[] {
  const previous = new Map(old.map((item) => [item.id, item]));
  let same = old.length === next.length;
  const items = next.map((item, index) => {
    const kept = shareUnchanged(previous.get(item.id), item);
    if (kept !== old[index]) same = false;
    return kept;
  });
  return same ? (old as T[]) : items;
}
