// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLinkDrag } from '../stores/drag-store';
import { useToast } from '../stores/toast-store';
import { useLinkDrop } from './use-link-drop';

function Harness() {
  useLinkDrop();
  return (
    <>
      <nav data-link-drop="trail" data-testid="trail">
        <div className="trail-row" data-page-id="a" data-testid="row" />
      </nav>
      <div data-drop="favorites" data-testid="favorites" />
      <main data-testid="elsewhere" />
    </>
  );
}

const WEB = {
  'text/uri-list': 'https://example.com/a',
  'text/plain': 'https://example.com/a',
};

function drag(type: string, over: string, data: Record<string, string> = WEB) {
  const target = document.querySelector(`[data-testid="${over}"]`)!;
  document.elementsFromPoint = () => [target, document.body];
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    clientX: 1,
    clientY: 1,
    relatedTarget: target,
    dataTransfer: {
      types: Object.keys(data),
      effectAllowed: 'all',
      dropEffect: 'none',
      getData: (name: string) => data[name] ?? '',
    },
  });
  act(() => {
    document.dispatchEvent(event);
  });
  return event;
}

describe('a link dragged onto the trail', () => {
  const splash = {
    createPage: vi.fn(async () => 'new'),
    createChildPage: vi.fn(async () => 'new'),
    focusPage: vi.fn(),
    getPreferences: vi.fn(async () => ({ collections: [] })),
    updatePreferences: vi.fn(async () => undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(window, { splash });
    useToast.setState({ toast: null });
    useLinkDrag.setState({ active: false, target: null, opening: null });
    render(<Harness />);
  });
  afterEach(cleanup);

  it('opens as a child of the row it lands on', async () => {
    const over = drag('dragover', 'row');
    expect(over.defaultPrevented).toBe(true);
    expect(useLinkDrag.getState().opening).toEqual({ kind: 'page', id: 'a' });
    drag('drop', 'row');
    expect(splash.createChildPage).toHaveBeenCalledWith(
      'a',
      'https://example.com/a',
    );
    expect(splash.createPage).not.toHaveBeenCalled();
    expect(useLinkDrag.getState().opening).toBeNull();
    await vi.waitFor(() => expect(splash.focusPage).toHaveBeenCalledOnce());
  });

  it('opens as a new page on the empty part of the trail', () => {
    expect(drag('dragover', 'trail').defaultPrevented).toBe(true);
    expect(useLinkDrag.getState().opening).toEqual({ kind: 'trail' });
    drag('drop', 'trail');
    expect(splash.createPage).toHaveBeenCalledWith('https://example.com/a');
    expect(splash.createChildPage).not.toHaveBeenCalled();
  });

  it('still files it when it lands on something that files', () => {
    drag('dragover', 'favorites');
    expect(useLinkDrag.getState().opening).toBeNull();
    expect(useLinkDrag.getState().target).toEqual({ kind: 'favorites' });
    drag('drop', 'favorites');
    expect(splash.createPage).not.toHaveBeenCalled();
  });

  it('stays refused anywhere else', () => {
    expect(drag('dragover', 'elsewhere').defaultPrevented).toBe(false);
    expect(drag('drop', 'elsewhere').defaultPrevented).toBe(false);
    expect(splash.createPage).not.toHaveBeenCalled();
  });

  it('says so when the drag isn’t a web address', () => {
    const text = { 'text/plain': 'just some words' };
    drag('dragover', 'trail', text);
    drag('drop', 'trail', text);
    expect(splash.createPage).not.toHaveBeenCalled();
    expect(useToast.getState().toast?.message).toBe(
      'That isn’t a web address, so it wasn’t opened.',
    );
  });

  it('doesn’t run other kinds of address from a drag', () => {
    const script = {
      'text/uri-list': 'javascript:alert(1)',
      'text/plain': 'file:///etc/passwd',
    };
    drag('drop', 'row', script);
    expect(splash.createChildPage).not.toHaveBeenCalled();
  });

  it('doesn’t offer to open what has no address, like a bookmark folder', () => {
    const folder = { 'application/x-splash-bookmarks': '{}' };
    expect(drag('dragover', 'trail', folder).defaultPrevented).toBe(false);
    expect(useLinkDrag.getState().opening).toBeNull();
  });
});
