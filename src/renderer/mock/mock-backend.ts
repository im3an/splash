import { BrowserController } from '../../engine/browser-controller';
import { resolveAddressInput } from '../../engine/url';
import type { SplashApi } from '../../shared/api';
import type { BrowserSnapshot, UiCommand } from '../../shared/types';
import { MockPageHost } from './mock-page-host';

export interface MockBackend extends SplashApi {
  /** Makes the next call reject, for exercising the shell's error handling. */
  failNextCall(): void;
}

interface SeedPage {
  input: string;
  title?: string;
  collapsed?: boolean;
  children?: SeedPage[];
}

const SEED: { name: string; pages: SeedPage[] }[] = [
  {
    name: 'Personal',
    pages: [
      {
        input: 'en.wikipedia.org/wiki/Trail',
        children: [
          {
            input: 'en.wikipedia.org/wiki/Appalachian_Trail',
            children: [{ input: 'en.wikipedia.org/wiki/Thru-hiking' }],
          },
          { input: 'en.wikipedia.org/wiki/Desire_path' },
        ],
      },
      {
        input: 'news.ycombinator.com',
        children: [{ input: 'trails.dev', title: 'Trails prototype' }],
      },
    ],
  },
  {
    name: 'Research',
    pages: [
      {
        input: 'developer.mozilla.org/en-US/docs/Web/API/History_API',
        children: [
          {
            input: 'developer.mozilla.org/en-US/docs/Web/API/History/pushState',
          },
          { input: 'developer.mozilla.org/en-US/docs/Web/API/Navigation_API' },
        ],
      },
      {
        input: 'tree outliner keyboard ux',
        collapsed: true,
        children: [
          { input: 'en.wikipedia.org/wiki/Outliner' },
          { input: 'tree-outliner-keyboard-ux.com' },
        ],
      },
    ],
  },
  { name: 'Side project', pages: [] },
];

/** Simulated round-trip so the shell's async paths behave as in the app. */
const LATENCY_MS = 12;

/**
 * A complete `SplashApi` without Electron: the real `BrowserController`
 * driving simulated pages. Used when the shell runs in a plain browser.
 */
export function createMockBackend({ seed = true } = {}): MockBackend {
  const snapshotListeners = new Set<(snapshot: BrowserSnapshot) => void>();
  let seeding = false;
  let failNext = false;

  const controller = new BrowserController({
    createHost: (events) =>
      new MockPageHost(events, { instant: () => seeding }),
    onSnapshot: (snapshot) => {
      for (const listener of snapshotListeners) listener(snapshot);
    },
  });

  if (seed) {
    seeding = true;
    const plant = (
      pages: SeedPage[],
      workspaceId: string,
      parentId: string | null,
    ) => {
      for (const page of pages) {
        const id = controller.createPage({
          url: resolveAddressInput(page.input),
          parentId,
          workspaceId,
          activate: false,
        });
        if (page.title) controller.renamePage(id, page.title);
        plant(page.children ?? [], workspaceId, id);
        if (page.collapsed) controller.setCollapsed(id, true);
      }
    };
    SEED.forEach((workspace, index) => {
      const id =
        index === 0
          ? controller.workspaceId
          : controller.createWorkspace(workspace.name);
      if (index === 0) controller.renameWorkspace(id, workspace.name);
      plant(workspace.pages, id, null);
    });
    seeding = false;
  }

  /** Every call is asynchronous and may be made to fail on purpose. */
  const call = <T>(run: () => T): Promise<T> =>
    new Promise((resolve, reject) => {
      setTimeout(() => {
        if (failNext) {
          failNext = false;
          reject(new Error('Simulated failure'));
          return;
        }
        try {
          resolve(run());
        } catch (error) {
          reject(error);
        }
      }, LATENCY_MS);
    });

  return {
    backend: 'mock',
    platform: 'web',
    failNextCall: () => {
      failNext = true;
    },
    getSnapshot: () => call(() => controller.snapshot()),
    createPage: (request = {}) =>
      call(() =>
        controller.createPage({
          input: request.input,
          parentId: request.parentId,
        }),
      ),
    activatePage: (pageId) => call(() => controller.activatePage(pageId)),
    closePage: (pageId, options) =>
      call(() => controller.closePage(pageId, options)),
    navigate: (pageId, input) => call(() => controller.navigate(pageId, input)),
    goBack: (pageId) => call(() => controller.goBack(pageId)),
    goForward: (pageId) => call(() => controller.goForward(pageId)),
    reload: (pageId) => call(() => controller.reload(pageId)),
    stop: (pageId) => call(() => controller.stop(pageId)),
    setCollapsed: (pageId, collapsed) =>
      call(() => controller.setCollapsed(pageId, collapsed)),
    renamePage: (pageId, title) =>
      call(() => controller.renamePage(pageId, title)),
    movePage: (pageId, parentId, beforeId) =>
      call(() => controller.movePage(pageId, parentId, beforeId)),
    createWorkspace: (name) =>
      call(() => controller.createWorkspace(name, { activate: true })),
    activateWorkspace: (workspaceId) =>
      call(() => controller.activateWorkspace(workspaceId)),
    renameWorkspace: (workspaceId, name) =>
      call(() => controller.renameWorkspace(workspaceId, name)),
    deleteWorkspace: (workspaceId) =>
      call(() => controller.deleteWorkspace(workspaceId)),
    setContentInsets: () => {},
    setAppearance: () => {},
    focusPage: () => {},
    onSnapshot: (listener) => {
      snapshotListeners.add(listener);
      return () => snapshotListeners.delete(listener);
    },
    // There is no app menu to send commands; shortcuts are matched in the shell.
    onUiCommand: (_listener: (command: UiCommand) => void) => () => {},
  };
}
