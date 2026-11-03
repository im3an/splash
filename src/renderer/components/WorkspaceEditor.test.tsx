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
    previewWorkspaceMode: vi.fn(),
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

type Saved = {
  accent: string;
  gradient?: string;
  colors?: string[];
  intensity?: number;
  grain?: number;
};

function saved(splash: ReturnType<typeof stubApi>): Saved {
  fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
  const [, appearance] = splash.createWorkspace.mock.calls.at(
    -1,
  ) as unknown as [string, Saved];
  return appearance;
}

function open(workspaceId: string | null = null) {
  const splash = stubApi();
  useShell.setState({
    snapshot: sampleSnapshot(),
    sidebarPanel: 'workspace',
    appearancePreview: null,
  });
  const view = render(<WorkspaceEditor workspaceId={workspaceId} />);
  return { splash, ...view };
}

describe('WorkspaceEditor', () => {
  // Rendered against the real store: selectors that build new arrays on
  // every call make React loop and blank the whole shell.
  it('opens for a new workspace without looping', () => {
    open();
    expect(screen.getByRole('form', { name: 'New workspace' })).toBeTruthy();
  });

  it('opens while the first snapshot is still on its way', () => {
    stubApi();
    useShell.setState({ snapshot: null });
    render(<WorkspaceEditor workspaceId={null} />);
    expect(screen.getByRole('form')).toBeTruthy();
  });

  it('flags a name another workspace already uses', () => {
    open();
    fireEvent.change(screen.getByPlaceholderText(/Workspace/), {
      target: { value: 'personal' },
    });
    expect(screen.getByText(/already called/)).toBeTruthy();
  });

  it('starts a new workspace with a different accent than the default', () => {
    const { splash } = open();
    expect(saved(splash).accent).not.toBe('ember');
  });

  it('previews the look on the frame until it closes', () => {
    const { unmount } = open();
    fireEvent.click(screen.getByRole('radio', { name: 'Dusk' }));
    expect(useShell.getState().appearancePreview?.gradient).toBe('dusk');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useShell.getState().sidebarPanel).toBeNull();
    unmount();
    expect(useShell.getState().appearancePreview).toBeNull();
  });
});

it('keeps workspace edits after a failed save and allows retry', async () => {
  const { splash } = open();
  splash.createWorkspace.mockRejectedValueOnce(new Error('store unavailable'));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  fireEvent.change(screen.getByRole('textbox', { name: 'Workspace name' }), {
    target: { value: 'Research' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect(useShell.getState().sidebarPanel).toBe('workspace');
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
  expect(useShell.getState().sidebarPanel).toBeNull();
  warn.mockRestore();
});

it('prevents duplicate saves', async () => {
  const { splash } = open();
  let finish!: (value: string) => void;
  splash.createWorkspace.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const input = screen.getByRole('textbox', { name: 'Workspace name' });
  const submit = screen.getByRole('button', { name: 'Create workspace' });
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

describe('theme', () => {
  it('saves a preset in place of wheel colours, and plain clears both', () => {
    const { splash } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Add a colour' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Dusk' }));
    const preset = saved(splash);
    expect(preset).toMatchObject({ gradient: 'dusk', colors: undefined });
    expect(preset.accent).toMatch(/^#[0-9a-f]{6}$/);
    fireEvent.click(screen.getByRole('radio', { name: 'Plain' }));
    expect(useShell.getState().appearancePreview).toMatchObject({
      gradient: undefined,
      colors: undefined,
    });
  });

  it('saves the intensity and grain', () => {
    const { splash } = open();
    fireEvent.change(screen.getByRole('slider', { name: 'Intensity' }), {
      target: { value: '0.8' },
    });
    const grain = screen.getByRole('slider', { name: 'Grain' });
    expect(grain.getAttribute('aria-valuenow')).toBe('0');
    fireEvent.keyDown(grain, { key: 'End' });
    expect(saved(splash)).toMatchObject({ intensity: 0.8, grain: 1 });
  });
});

describe('light or dark', () => {
  it('previews the mode in the app and puts it back on close', () => {
    const { splash, unmount } = open();
    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(splash.previewWorkspaceMode).toHaveBeenLastCalledWith('dark');
    unmount();
    expect(splash.previewWorkspaceMode).toHaveBeenLastCalledWith(null);
  });
});

describe('colour canvas', () => {
  it('moves the colour with the keyboard and saves it as the gradient', () => {
    const { splash } = open();
    const slider = screen.getByRole('slider', { name: 'Accent colour' });
    const before = slider.getAttribute('aria-valuenow');
    fireEvent.keyDown(slider, { key: 'ArrowRight', shiftKey: true });
    expect(slider.getAttribute('aria-valuenow')).not.toBe(before);
    const appearance = saved(splash);
    expect(appearance.colors).toHaveLength(1);
    expect(appearance.accent).toBe(appearance.colors![0]);
    expect(appearance.gradient).toBeUndefined();
  });

  it('adds colours that go with it and leads with a pressed one', () => {
    const { splash } = open();
    const add = screen.getByRole('button', { name: 'Add a colour' });
    fireEvent.click(add);
    fireEvent.click(add);
    expect((add as HTMLButtonElement).disabled).toBe(true);
    expect(useShell.getState().appearancePreview?.colors).toHaveLength(3);
    const [match] = screen.getAllByRole('button', { name: /^Use #/ });
    const hex = match!.getAttribute('title');
    fireEvent.keyDown(match!, { key: 'Enter' });
    const appearance = saved(splash);
    expect(appearance.colors?.[0]).toBe(hex);
    expect(appearance.accent).toBe(hex);
  });

  it('starts from the colours of a chosen preset', () => {
    open();
    fireEvent.click(screen.getByRole('radio', { name: 'Cosmic' }));
    expect(screen.getAllByRole('button', { name: /^Use #/ })).toHaveLength(2);
  });

  it('shows one to three colours', () => {
    open();
    expect(screen.queryAllByRole('button', { name: /^Use #/ })).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Add a colour' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a colour' }));
    expect(screen.getAllByRole('button', { name: /^Use #/ })).toHaveLength(2);
    const remove = screen.getByRole('button', { name: 'Remove a colour' });
    fireEvent.click(remove);
    fireEvent.click(remove);
    expect(screen.queryAllByRole('button', { name: /^Use #/ })).toHaveLength(0);
    expect((remove as HTMLButtonElement).disabled).toBe(true);
  });
});
