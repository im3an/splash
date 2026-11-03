import { beforeEach, describe, expect, it } from 'vitest';
import { useShell } from './shell-store';

describe('sidebar panels', () => {
  beforeEach(() => {
    useShell.setState({ sidebarOpen: true, sidebarPanel: null });
  });

  it('toggles a panel in place of the trail', () => {
    useShell.getState().toggleSidebarPanel('history');
    expect(useShell.getState().sidebarPanel).toBe('history');
    useShell.getState().toggleSidebarPanel('downloads');
    expect(useShell.getState().sidebarPanel).toBe('downloads');
    useShell.getState().toggleSidebarPanel('downloads');
    expect(useShell.getState().sidebarPanel).toBeNull();
  });

  it('opens a hidden sidebar to show the panel', () => {
    useShell.setState({ sidebarOpen: false, sidebarPanel: 'history' });
    useShell.getState().toggleSidebarPanel('history');
    expect(useShell.getState()).toMatchObject({
      sidebarOpen: true,
      sidebarPanel: 'history',
    });
  });
});

describe('workspace panel', () => {
  it('opens the sidebar on the workspace being edited', () => {
    useShell.setState({ sidebarOpen: false, sidebarPanel: 'history' });
    useShell.getState().editWorkspace('work');
    expect(useShell.getState()).toMatchObject({
      sidebarOpen: true,
      sidebarPanel: 'workspace',
      editingWorkspaceId: 'work',
    });
    useShell.getState().editWorkspace(null);
    expect(useShell.getState().editingWorkspaceId).toBeNull();
  });
});
