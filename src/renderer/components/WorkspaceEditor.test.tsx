// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { SplashApi } from '../../shared/api';
import { useShell } from '../stores/shell-store';
import { sampleSnapshot } from '../test-fixtures';
import { WorkspaceEditor } from './WorkspaceEditor';

function stubApi() {
  const splash = {
    createWorkspace: vi.fn(async () => 'new'),
    customizeWorkspace: vi.fn(async () => undefined),
    setOverlayActive: vi.fn(),
  };
  window.splash = splash as unknown as SplashApi;
  return splash;
}

beforeAll(() => {
  // jsdom has no matchMedia; the editor previews light and dark.
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

describe('WorkspaceEditor', () => {
  // Rendered against the real store: selectors that build new arrays on
  // every call make React loop and blank the whole shell.
  it('opens for a new workspace without looping', () => {
    stubApi();
    useShell.setState({ snapshot: sampleSnapshot() });
    render(<WorkspaceEditor workspaceId={null} />);
    expect(screen.getByRole('dialog', { name: 'New workspace' })).toBeTruthy();
  });

  it('opens while the first snapshot is still on its way', () => {
    stubApi();
    useShell.setState({ snapshot: null });
    render(<WorkspaceEditor workspaceId={null} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('flags a name another workspace already uses', () => {
    stubApi();
    useShell.setState({ snapshot: sampleSnapshot() });
    render(<WorkspaceEditor workspaceId={null} />);
    fireEvent.change(screen.getByPlaceholderText(/Workspace/), {
      target: { value: 'personal' },
    });
    expect(screen.getByText(/already called/)).toBeTruthy();
  });

  it('starts a new workspace with a different accent than the default', () => {
    const splash = stubApi();
    useShell.setState({ snapshot: sampleSnapshot() });
    render(<WorkspaceEditor workspaceId={null} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    const [, appearance] = splash.createWorkspace.mock.calls[0] as unknown as [
      string,
      { accent: string },
    ];
    expect(appearance.accent).not.toBe('ember');
  });
});

it('keeps workspace edits after a failed save and allows retry', async () => {
  const splash = stubApi();
  splash.createWorkspace.mockRejectedValueOnce(new Error('store unavailable'));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  useShell.setState({ snapshot: sampleSnapshot() });
  render(<WorkspaceEditor workspaceId={null} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Workspace name' }), {
    target: { value: 'Research' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(
    (
      screen.getByRole('textbox', {
        name: 'Workspace name',
      }) as HTMLInputElement
    ).value,
  ).toBe('Research');
  await act(async () =>
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' })),
  );
  expect(splash.createWorkspace).toHaveBeenCalledTimes(2);
  warn.mockRestore();
});

it('prevents duplicate saves and keeps Tab inside the workspace dialog', async () => {
  const splash = stubApi();
  let finish!: (value: string) => void;
  splash.createWorkspace.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  useShell.setState({ snapshot: sampleSnapshot() });
  render(<WorkspaceEditor workspaceId={null} />);
  const input = screen.getByRole('textbox', { name: 'Workspace name' });
  const submit = screen.getByRole('button', { name: 'Create workspace' });
  submit.focus();
  fireEvent.keyDown(submit, { key: 'Tab' });
  expect(document.activeElement).toBe(input);
  fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(submit);
  fireEvent.click(submit);
  fireEvent.submit(submit.closest('form')!);
  expect(splash.createWorkspace).toHaveBeenCalledTimes(1);
  expect(
    (screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect((input as HTMLInputElement).matches(':disabled')).toBe(true);
  await act(async () => finish('new'));
});
