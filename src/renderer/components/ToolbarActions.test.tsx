// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { SplashApi } from '../../shared/api';
import { DEFAULT_PREFERENCES } from '../../shared/preferences';
import { useShell } from '../stores/shell-store';
import { useOverlay } from '../stores/overlay-store';
import { sampleSnapshot } from '../test-fixtures';
import { ToolbarActions } from './ToolbarActions';
vi.mock('./ExtensionActions', () => ({ ExtensionActions: () => null }));
vi.mock('./Toolbar', () => ({ SplitButton: () => null }));
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  );
  useShell.setState({
    preferences: DEFAULT_PREFERENCES,
    snapshot: sampleSnapshot(),
  });
  useOverlay.setState({ overlay: null, leaving: false, frozenPages: null });
});
afterEach(() => {
  cleanup();
  useOverlay.getState().close();
  vi.unstubAllGlobals();
});
function stub(freezePage = vi.fn(async () => ({}))) {
  const methods = { freezePage, setOverlayActive: vi.fn() };
  window.splash = methods as unknown as SplashApi;
  return methods;
}
it('can reopen the toolbar menu after keyboard dismissal', async () => {
  stub();
  render(<ToolbarActions />);
  fireEvent.click(screen.getByRole('button', { name: 'Customize toolbar' }));
  const menu = await screen.findByRole('menu');
  fireEvent.keyDown(menu, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Customize toolbar' }));
  const reopened = await screen.findByRole('menu');
  expect(reopened.hasAttribute('inert')).toBe(false);
  expect(screen.getByRole('menuitem', { name: 'Hide Bookmark' })).toBeTruthy();
});
it('does not leave the page hidden when unmounted during capture', async () => {
  let resolve: (value: Record<string, string>) => void = () => {};
  const capture = new Promise<Record<string, string>>((done) => {
    resolve = done;
  });
  const methods = stub(vi.fn(() => capture));
  const view = render(<ToolbarActions />);
  fireEvent.click(screen.getByRole('button', { name: 'Customize toolbar' }));
  view.unmount();
  await act(async () => {
    resolve({});
    await capture;
  });
  expect(useOverlay.getState().overlay).toBeNull();
  expect(methods.setOverlayActive).not.toHaveBeenCalledWith(true);
});
