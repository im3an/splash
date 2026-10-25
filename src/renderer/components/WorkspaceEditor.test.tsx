// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
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
