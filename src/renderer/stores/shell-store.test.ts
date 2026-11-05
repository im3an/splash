import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from '../../shared/preferences';
import type { PageSnapshot } from '../../shared/types';
import { sampleSnapshot } from '../test-fixtures';
import { selectStartPageFocus, useShell } from './shell-store';

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

describe('selectStartPageFocus', () => {
  const state = (newPage: 'search' | 'start', page: Partial<PageSnapshot>) => {
    const snapshot = sampleSnapshot();
    snapshot.pages[snapshot.activePageId!] = {
      ...snapshot.pages[snapshot.activePageId!]!,
      ...page,
    };
    return {
      ...useShell.getState(),
      snapshot,
      preferences: { ...DEFAULT_PREFERENCES, newPage },
    };
  };

  it('asks for the field on an empty page, once per page', () => {
    const blank = state('start', { url: null, error: null, isLoading: false });
    expect(selectStartPageFocus(blank)).toBe(blank.snapshot.activePageId);
  });

  it('asks for the field in an empty workspace', () => {
    const blank = state('start', {});
    expect(
      selectStartPageFocus({
        ...blank,
        snapshot: { ...blank.snapshot, activePageId: null },
      }),
    ).toBe('none');
  });

  it('leaves a page with content alone, and the Search setting', () => {
    expect(
      selectStartPageFocus(state('start', { url: 'https://example.com/' })),
    ).toBeNull();
    expect(
      selectStartPageFocus(state('search', { url: null, error: null })),
    ).toBeNull();
    expect(
      selectStartPageFocus(state('start', { url: null, isLoading: true })),
    ).toBeNull();
  });
});
