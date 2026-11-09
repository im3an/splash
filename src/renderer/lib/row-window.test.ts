// @vitest-environment jsdom
import { RowWindow } from './row-window';

type Callback = (
  entries: { target: Element; isIntersecting: boolean }[],
) => void;

class FakeObserver {
  static last: FakeObserver;
  readonly observed = new Set<Element>();
  constructor(
    readonly callback: Callback,
    readonly options: IntersectionObserverInit,
  ) {
    FakeObserver.last = this;
  }
  observe(element: Element) {
    this.observed.add(element);
  }
  unobserve(element: Element) {
    this.observed.delete(element);
  }
  disconnect() {
    this.observed.clear();
  }
}

function placed(top: number, height: number): DOMRect {
  return { top, bottom: top + height, height } as DOMRect;
}

function setup() {
  const root = document.createElement('nav');
  root.className = 'scroller';
  root.getBoundingClientRect = () => placed(0, 500);
  document.body.append(root);
  const slot = (top: number) => {
    const element = document.createElement('div');
    element.getBoundingClientRect = () => placed(top, 30);
    root.append(element);
    return element;
  };
  return { root, slot, rows: new RowWindow('.scroller') };
}

beforeEach(() => {
  document.body.replaceChildren();
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});

afterEach(() => vi.unstubAllGlobals());

describe('RowWindow', () => {
  it('knows at once which rows are near, before the observer has answered', () => {
    const { rows, slot } = setup();
    rows.watch('on-screen', slot(100));
    rows.watch('just-below', slot(900));
    rows.watch('far-below', slot(5000));
    expect(rows.isNear('on-screen')).toBe(true);
    expect(rows.isNear('just-below')).toBe(true);
    expect(rows.isNear('far-below')).toBe(false);
  });

  it('follows the observer and tells only the row that changed', () => {
    const { rows, slot } = setup();
    const far = slot(5000);
    rows.watch('far', far);
    const onFar = vi.fn();
    rows.subscribe('far', onFar);
    const near = slot(0);
    rows.watch('near', near);
    const onNear = vi.fn();
    rows.subscribe('near', onNear);
    Object.defineProperty(far.parentElement, 'clientHeight', { value: 500 });
    FakeObserver.last.callback([{ target: far, isIntersecting: true }]);
    expect(rows.isNear('far')).toBe(true);
    expect(onFar).toHaveBeenCalledTimes(1);
    expect(onNear).not.toHaveBeenCalled();
    FakeObserver.last.callback([{ target: near, isIntersecting: true }]);
    expect(onNear).not.toHaveBeenCalled();
  });

  it('scrolls with the trail, reaching far sideways for the workspace slide', () => {
    const { root, rows, slot } = setup();
    rows.watch('a', slot(0));
    expect(FakeObserver.last.options.root).toBe(root);
    expect(FakeObserver.last.options.rootMargin).toMatch(/^\d+px 4000px$/);
  });

  it('draws nothing while hidden under a panel', () => {
    const { root, rows, slot } = setup();
    root.getBoundingClientRect = () => placed(0, 0);
    rows.watch('a', slot(0));
    expect(rows.isNear('a')).toBe(false);
  });

  it('keeps drawn rows while hidden under a panel', () => {
    const { root, rows, slot } = setup();
    const element = slot(0);
    Object.defineProperty(root, 'clientHeight', { value: 500, writable: true });
    rows.watch('a', element);
    Object.defineProperty(root, 'clientHeight', { value: 0 });
    FakeObserver.last.callback([{ target: element, isIntersecting: false }]);
    expect(rows.isNear('a')).toBe(true);
  });

  it('forgets a row once it is gone, and lets go of the scroller with the last', () => {
    const { rows, slot } = setup();
    const first = slot(0);
    const stopFirst = rows.watch('first', first);
    const observer = FakeObserver.last;
    const stopSecond = rows.watch('second', slot(30));
    stopFirst();
    expect(rows.isNear('first')).toBe(false);
    expect(observer.observed.has(first)).toBe(false);
    expect(observer.observed.size).toBe(1);
    stopSecond();
    expect(observer.observed.size).toBe(0);
  });

  it('draws everything outside a scroller, or with no observer to ask', () => {
    const { rows } = setup();
    const loose = document.createElement('div');
    rows.watch('loose', loose);
    expect(rows.isNear('loose')).toBe(true);
    vi.unstubAllGlobals();
    expect(new RowWindow('.scroller').isNear('anything')).toBe(true);
  });
});
