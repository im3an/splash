// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_PREFERENCES } from '../../shared/preferences';
import { useShell } from '../stores/shell-store';
import { useToast } from '../stores/toast-store';
import { Toast } from './Toast';

function showToast(run = vi.fn()) {
  act(() =>
    useToast.getState().show({
      message: 'Closed “Docs”.',
      detail: '⇧⌘T also undoes it.',
      durationMs: 9000,
      actions: [{ label: 'Undo', icon: 'undo', run }],
    }),
  );
  return run;
}

beforeEach(() => {
  vi.useFakeTimers();
  useToast.setState({ toast: null });
  useShell.setState({ sidebarOpen: true });
});

afterEach(() => vi.useRealTimers());

describe('Toast', () => {
  it('gives a long button its own row in the sidebar', () => {
    render(<Toast placement="sidebar" />);
    act(() =>
      useToast.getState().show({
        message: 'a.example can’t use your location.',
        detail: null,
        durationMs: 9000,
        actions: [{ label: 'Open System Settings', run: vi.fn() }],
      }),
    );
    const button = screen.getByRole('button', {
      name: 'Open System Settings',
    });
    expect(button.parentElement?.className).toContain('justify-end');
  });

  it('sits at the top of the sidebar when the address bar is there', () => {
    act(() =>
      useShell.setState({
        preferences: { ...DEFAULT_PREFERENCES, addressBar: 'sidebar' },
      }),
    );
    render(
      <>
        <div data-testid="foot">
          <Toast placement="sidebar" />
        </div>
        <div data-testid="top">
          <Toast placement="sidebar-top" />
        </div>
      </>,
    );
    showToast();
    const status = () => screen.getByRole('status');
    expect(screen.getByTestId('top').contains(status())).toBe(true);
    // Shut, the sidebar peeks out to show it in the same place.
    act(() => useShell.setState({ sidebarOpen: false }));
    expect(screen.getByTestId('top').contains(status())).toBe(true);
    act(() => useShell.setState({ preferences: null }));
  });

  it('moves from the sidebar to the toolbar when the sidebar hides', () => {
    render(
      <>
        <div data-testid="sidebar">
          <Toast placement="sidebar" />
        </div>
        <div data-testid="toolbar">
          <Toast placement="toolbar" />
        </div>
      </>,
    );
    showToast();
    const status = () => screen.getByRole('status');
    expect(screen.getByTestId('sidebar').contains(status())).toBe(true);

    act(() => useShell.setState({ sidebarOpen: false }));
    expect(screen.getByTestId('toolbar').contains(status())).toBe(true);
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('runs an action once and gives way to its confirmation', async () => {
    render(<Toast placement="sidebar" />);
    const run = showToast();
    const message = screen.getByRole('status').textContent;
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    // The undo waits its turn in the history before it runs.
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toMatch(/^Undid: /);
    expect(screen.getByRole('status').textContent).not.toBe(message);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('stays while the pointer rests on it, then times out', () => {
    render(<Toast placement="sidebar" />);
    showToast();
    fireEvent.pointerEnter(screen.getByRole('status'));
    act(() => vi.advanceTimersByTime(20_000));
    expect(screen.getByRole('status')).toBeTruthy();

    fireEvent.pointerLeave(screen.getByRole('status'));
    act(() => vi.advanceTimersByTime(9000));
    expect(screen.queryByRole('status')).toBeNull();
  });
});

it('keeps Undo available while it has keyboard focus', () => {
  render(<Toast placement="sidebar" />);
  showToast();
  const undo = screen.getByRole('button', { name: 'Undo' });
  act(() => undo.focus());
  fireEvent.pointerLeave(screen.getByRole('status'));
  act(() => vi.advanceTimersByTime(20_000));
  expect(screen.getByRole('status')).toBeTruthy();
  act(() => undo.blur());
  act(() => vi.advanceTimersByTime(9000));
  expect(screen.queryByRole('status')).toBeNull();
});
