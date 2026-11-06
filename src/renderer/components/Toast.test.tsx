// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
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
