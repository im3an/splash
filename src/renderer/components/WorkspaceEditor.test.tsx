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

describe('custom accent wheel', () => {
  function saved(splash: ReturnType<typeof stubApi>) {
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    const [, appearance] = splash.createWorkspace.mock.calls.at(
      -1,
    ) as unknown as [string, { accent: string }];
    return appearance.accent;
  }

  it('opens from the chosen preset and saves a typed colour', () => {
    const splash = stubApi();
    useShell.setState({ snapshot: sampleSnapshot() });
    render(<WorkspaceEditor workspaceId={null} />);
    expect(screen.queryByRole('slider', { name: 'Accent colour' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Custom colour' }));
    const hex = screen.getByRole('textbox', {
      name: 'Accent hex colour',
    }) as HTMLInputElement;
    expect(hex.value).toMatch(/^#[0-9a-f]{6}$/);
    fireEvent.change(hex, { target: { value: '1D77' } });
    fireEvent.change(hex, { target: { value: '1D7770' } });
    expect(saved(splash)).toBe('#1d7770');
  });

  it('moves the colour with the keyboard and uses a matching colour', () => {
    const splash = stubApi();
    useShell.setState({ snapshot: sampleSnapshot() });
    render(<WorkspaceEditor workspaceId={null} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Custom colour' }));
    const slider = screen.getByRole('slider', { name: 'Accent colour' });
    const before = slider.getAttribute('aria-valuenow');
    fireEvent.keyDown(slider, { key: 'ArrowRight', shiftKey: true });
    expect(slider.getAttribute('aria-valuenow')).not.toBe(before);
    const [match] = screen.getAllByRole('button', { name: /^Use #/ });
    const hex = match!.getAttribute('title');
    fireEvent.keyDown(match!, { key: 'Enter' });
    expect(saved(splash)).toBe(hex);
  });

  it('shows one to three colours', () => {
    stubApi();
    useShell.setState({ snapshot: sampleSnapshot() });
    render(<WorkspaceEditor workspaceId={null} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Custom colour' }));
    const fewer = screen.getByRole('button', {
      name: 'Show fewer matching colours',
    });
    expect(screen.getAllByRole('button', { name: /^Use #/ })).toHaveLength(2);
    fireEvent.click(fewer);
    fireEvent.click(fewer);
    expect(screen.queryAllByRole('button', { name: /^Use #/ })).toHaveLength(0);
    expect((fewer as HTMLButtonElement).disabled).toBe(true);
  });
});
