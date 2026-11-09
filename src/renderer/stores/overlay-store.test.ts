import type { SplashApi } from '../../shared/api';
import { useOverlay } from './overlay-store';

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('window', {});
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  );
  useOverlay.setState({ overlay: null, leaving: false, frozenPages: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function stub(freezePage: () => Promise<Record<string, string>>) {
  const setOverlayActive = vi.fn();
  (window as unknown as { splash: SplashApi }).splash = {
    freezePage,
    setOverlayActive,
  } as unknown as SplashApi;
  return setOverlayActive;
}

it('opens without a still when a page never answers the capture', async () => {
  const setOverlayActive = stub(() => new Promise(() => undefined));
  const opening = useOverlay.getState().open({ kind: 'downloads' });
  await vi.advanceTimersByTimeAsync(1000);
  await opening;
  expect(useOverlay.getState().overlay).toEqual({ kind: 'downloads' });
  expect(useOverlay.getState().frozenPages).toEqual({});
  expect(setOverlayActive).toHaveBeenCalledWith(true);
});

it('shows the still when the capture answers in time', async () => {
  stub(async () => ({ page: 'data:image/jpeg;base64,x' }));
  const opening = useOverlay.getState().open({ kind: 'downloads' });
  await vi.advanceTimersByTimeAsync(100);
  await opening;
  expect(useOverlay.getState().frozenPages).toEqual({
    page: 'data:image/jpeg;base64,x',
  });
});
