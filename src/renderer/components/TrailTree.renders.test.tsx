// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import type { SplashApi } from '../../shared/api';
import { pageParts } from '../lib/format';
import { useShell } from '../stores/shell-store';
import { sampleSnapshot } from '../test-fixtures';
import { TrailTree } from './TrailTree';

/** Every row works out its label once each time it draws, so this counts draws. */
vi.mock('../lib/format', async (importActual) => {
  const actual = await importActual<typeof import('../lib/format')>();
  return { ...actual, pageParts: vi.fn(actual.pageParts) };
});

const draws = vi.mocked(pageParts);

function arrive(change: (next: ReturnType<typeof sampleSnapshot>) => void) {
  const next = sampleSnapshot();
  change(next);
  draws.mockClear();
  act(() => useShell.getState().receiveSnapshot(next));
}

beforeEach(() => {
  window.splash = {
    setOverlayActive: vi.fn(),
  } as unknown as SplashApi;
  Element.prototype.scrollIntoView = vi.fn();
  useShell.setState({ snapshot: null });
  useShell.getState().receiveSnapshot(sampleSnapshot());
  render(<TrailTree />);
  // Every row draws once more after the first change: it learns the trail has
  // painted, so that later rows may grow in. That's once, not per snapshot.
  arrive((next) => {
    next.pages.a!.title = 'First change';
  });
  arrive(() => undefined);
});

describe('what a new snapshot draws', () => {
  it('draws nothing when nothing changed', () => {
    arrive(() => undefined);
    expect(draws).not.toHaveBeenCalled();
  });

  it('draws only the page whose title changed', () => {
    arrive((next) => {
      next.pages.b!.title = 'A new title';
    });
    expect(screen.getByRole('treeitem', { name: 'A new title' })).toBeTruthy();
    expect(draws).toHaveBeenCalledTimes(1);
    expect(draws.mock.calls[0]![0].id).toBe('b');
  });

  it('draws only the page whose loading state changed', () => {
    arrive((next) => {
      next.pages.c!.isLoading = true;
    });
    expect(draws).toHaveBeenCalledTimes(1);
    expect(draws.mock.calls[0]![0].id).toBe('c');
  });
});
