import { describe, expect, it } from 'vitest';
import { buildTaskList, type LivePage } from './task-list';

function page(overrides: Partial<LivePage>): LivePage {
  return {
    pageId: 'a',
    title: 'A',
    url: 'https://a.com/',
    faviconUrl: null,
    isUnresponsive: false,
    pid: 1,
    framePids: [],
    ...overrides,
  };
}

const process = (pid: number, kb: number, cpuPercent = 1) => ({
  pid,
  workingSetKb: kb,
  cpuPercent,
});

describe('buildTaskList', () => {
  it('gives each page its process, and the rest to Splash', () => {
    const { entries } = buildTaskList(
      [process(1, 100), process(2, 200), process(9, 50), process(10, 50)],
      [page({ pageId: 'a', pid: 1 }), page({ pageId: 'b', pid: 2 })],
      [],
      0,
    );
    expect(entries.map((entry) => [entry.id, entry.memoryBytes])).toEqual([
      ['page:a', 100 * 1024],
      ['page:b', 200 * 1024],
      ['splash', 100 * 1024],
    ]);
  });

  it('puts pages sharing a process on one row', () => {
    const { entries } = buildTaskList(
      [process(1, 100)],
      [page({ pageId: 'a' }), page({ pageId: 'b', title: 'B' })],
      [],
      0,
    );
    expect(entries[0]).toMatchObject({
      title: 'A',
      pageIds: ['a', 'b'],
      memoryBytes: 100 * 1024,
    });
  });

  it('charges a page for frames from other sites', () => {
    const { entries } = buildTaskList(
      [process(1, 100, 2), process(5, 40, 3)],
      [page({ framePids: [1, 5] })],
      [],
      0,
    );
    expect(entries[0]).toMatchObject({
      memoryBytes: 140 * 1024,
      cpuPercent: 5,
    });
  });

  it('never counts a process twice', () => {
    const { entries } = buildTaskList(
      [process(1, 100), process(2, 200)],
      // The frame in b's process stays with b, whichever page comes first.
      [
        page({ pageId: 'a', pid: 1, framePids: [2] }),
        page({ pageId: 'b', pid: 2 }),
      ],
      [],
      0,
    );
    const total = entries.reduce((sum, entry) => sum + entry.memoryBytes, 0);
    expect(total).toBe(300 * 1024);
    expect(entries[1]!.memoryBytes).toBe(200 * 1024);
  });

  it('names extensions, which can’t be ended from here', () => {
    const { entries, asleepPages } = buildTaskList(
      [process(3, 80)],
      [],
      [{ id: 'x', name: 'uBlock Origin', pid: 3 }],
      4,
    );
    expect(entries[0]).toMatchObject({
      kind: 'extension',
      title: 'uBlock Origin',
      pageIds: [],
    });
    expect(asleepPages).toBe(4);
  });

  it('skips a page whose process has already gone', () => {
    const { entries } = buildTaskList([], [page({ pid: 7 })], [], 0);
    expect(entries[0]!.memoryBytes).toBe(0);
  });
});
