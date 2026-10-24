// @vitest-environment jsdom
import type { SplashApi } from '../../shared/api';
import { usePreferences } from '../stores/preferences-store';
import { useShell } from '../stores/shell-store';
import { useUi } from '../stores/ui-store';
import { sampleSnapshot } from '../test-fixtures';
import { isCommandEnabled, runCommand } from './run-command';

function stubApi(overrides: Partial<SplashApi> = {}) {
  const splash = {
    backend: 'mock',
    platform: 'darwin',
    createPage: vi.fn(async () => 'new'),
    closePage: vi.fn(async () => undefined),
    movePage: vi.fn(async () => undefined),
    activateWorkspace: vi.fn(async () => undefined),
    createWorkspace: vi.fn(async () => 'w3'),
    deleteWorkspace: vi.fn(async () => undefined),
    setCollapsed: vi.fn(async () => undefined),
    ...overrides,
  };
  window.splash = splash as unknown as SplashApi;
  return splash;
}

beforeEach(() => {
  useShell.setState({ snapshot: sampleSnapshot() });
  useUi.setState({ editing: null, contextMenu: null, sheet: null, toasts: [] });
  usePreferences.setState({ sidebarOpen: true, appearance: 'system' });
});

describe('runCommand', () => {
  it('opens a new page and asks the address bar for focus', async () => {
    const splash = stubApi();
    const before = useUi.getState().addressFocusRequest;
    await runCommand('page.new');
    expect(splash.createPage).toHaveBeenCalled();
    expect(useUi.getState().addressFocusRequest).toBe(before + 1);
  });

  it('acts on an explicit target before the active page', async () => {
    const splash = stubApi();
    await runCommand('page.close', { pageId: 'e' });
    expect(splash.closePage).toHaveBeenCalledWith('e');
  });

  it('skips disabled commands', async () => {
    const splash = stubApi();
    expect(isCommandEnabled('page.move-up', { pageId: 'a' })).toBe(false);
    await runCommand('page.move-up', { pageId: 'a' });
    expect(splash.movePage).not.toHaveBeenCalled();
  });

  it('turns failures into an error toast', async () => {
    stubApi({
      closePage: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await runCommand('page.close');
    expect(useUi.getState().toasts).toEqual([
      expect.objectContaining({
        tone: 'error',
        message: 'Couldn’t close the page.',
      }),
    ]);
    warn.mockRestore();
  });

  it('asks before closing a page with children, and respects Cancel', async () => {
    const splash = stubApi();
    const pending = runCommand('page.close-tree', { pageId: 'a' });
    await Promise.resolve();
    const sheet = useUi.getState().sheet;
    expect(sheet?.kind).toBe('confirm');
    useUi.getState().closeSheet(false);
    await pending;
    expect(splash.closePage).not.toHaveBeenCalled();

    const confirmed = runCommand('page.close-tree', { pageId: 'a' });
    await Promise.resolve();
    useUi.getState().closeSheet(true);
    await confirmed;
    expect(splash.closePage).toHaveBeenCalledWith('a', {
      withDescendants: true,
    });
  });

  it('closes a leaf with "close tree" without asking', async () => {
    const splash = stubApi();
    await runCommand('page.close-tree', { pageId: 'e' });
    expect(useUi.getState().sheet).toBeNull();
    expect(splash.closePage).toHaveBeenCalledWith('e', {
      withDescendants: true,
    });
  });

  it('opens the sidebar for confirmations', async () => {
    stubApi();
    usePreferences.setState({ sidebarOpen: false });
    void runCommand('workspace.delete');
    await Promise.resolve();
    expect(usePreferences.getState().sidebarOpen).toBe(true);
    useUi.getState().closeSheet(false);
  });

  it('cycles and selects workspaces by position', async () => {
    const splash = stubApi();
    await runCommand('workspace.next');
    expect(splash.activateWorkspace).toHaveBeenLastCalledWith('w2');
    await runCommand('workspace.previous');
    expect(splash.activateWorkspace).toHaveBeenLastCalledWith('w2');
    await runCommand('workspace.select-2');
    expect(splash.activateWorkspace).toHaveBeenCalledTimes(3);
    expect(isCommandEnabled('workspace.select-3')).toBe(false);
  });

  it('creates a workspace and starts naming it', async () => {
    const splash = stubApi();
    await runCommand('workspace.new');
    expect(splash.createWorkspace).toHaveBeenCalledWith('Workspace 3');
    expect(useUi.getState().editing).toEqual({ kind: 'workspace', id: 'w3' });
  });

  it('deletes an empty workspace without asking', async () => {
    const splash = stubApi();
    await runCommand('workspace.delete', { workspaceId: 'w2' });
    expect(splash.deleteWorkspace).toHaveBeenCalledWith('w2');
  });

  it('stores the appearance preference', async () => {
    stubApi();
    await runCommand('appearance.dark');
    expect(usePreferences.getState().appearance).toBe('dark');
  });
});
