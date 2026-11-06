// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SplashApi } from '../../shared/api';
import { DEFAULT_PREFERENCES } from '../../shared/preferences';
import type { PageSnapshot, UiCommand } from '../../shared/types';
import { offerUndo, resetTrailUndo } from '../lib/trail-undo';
import { sampleSnapshot } from '../test-fixtures';
import { connectShell, selectStartPageFocus, useShell } from './shell-store';
import { useToast } from './toast-store';

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

describe('Undo and Redo sent to the trail', () => {
  function connect() {
    let send: (command: UiCommand) => void = () => undefined;
    const setTrailUndoOffered = vi.fn();
    const focusPage = vi.fn();
    const splash = {
      onSnapshot: () => () => undefined,
      onUiCommand: (listener: (command: UiCommand) => void) => {
        send = listener;
        return () => undefined;
      },
      onNotice: () => () => undefined,
      onPreferences: () => () => undefined,
      getPreferences: async () => null,
      getSnapshot: async () => null,
      setTrailUndoOffered,
      focusPage,
    } as unknown as SplashApi;
    const disconnect = connectShell(splash);
    return {
      send: (command: UiCommand) => send(command),
      setTrailUndoOffered,
      focusPage,
      disconnect,
    };
  }
  const toast = (icon?: 'undo' | 'redo') => ({
    message: 'Closed “Atlas”.',
    detail: null,
    durationMs: 1000,
    actions: icon
      ? [{ label: icon, icon, inHistory: true, run: () => undefined }]
      : [],
  });

  beforeEach(() => {
    resetTrailUndo();
    useToast.setState({ toast: null });
  });

  it('skips the shell’s own field, which focus has only left behind', async () => {
    const { send, focusPage, disconnect } = connect();
    const undo = vi.fn();
    const redo = vi.fn();
    offerUndo('closed', undo, redo);
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    send({ type: 'undo', trail: true });
    await vi.waitFor(() => expect(undo).toHaveBeenCalledOnce());
    send({ type: 'redo', trail: true });
    await vi.waitFor(() => expect(redo).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(focusPage).toHaveBeenCalledTimes(2));
    field.remove();
    disconnect();
  });

  it('edits the shell’s field when focus really is in it', () => {
    const { send, disconnect } = connect();
    const undo = vi.fn();
    offerUndo('closed', undo);
    const exec = vi.fn();
    document.execCommand = exec;
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    send({ type: 'undo' });
    expect(exec).toHaveBeenCalledWith('undo');
    expect(undo).not.toHaveBeenCalled();
    field.remove();
    disconnect();
  });

  it('tells the main process only when an offer starts or ends', () => {
    const { setTrailUndoOffered, disconnect } = connect();
    useToast.getState().show(toast());
    expect(setTrailUndoOffered).not.toHaveBeenCalled();
    useToast.getState().show(toast('undo'));
    expect(setTrailUndoOffered).toHaveBeenLastCalledWith(true);
    useToast.getState().show(toast('redo'));
    expect(setTrailUndoOffered).toHaveBeenCalledTimes(1);
    useToast.getState().dismiss(useToast.getState().toast!.id);
    expect(setTrailUndoOffered).toHaveBeenLastCalledWith(false);
    disconnect();
  });
});
