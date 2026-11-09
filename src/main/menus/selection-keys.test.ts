// @vitest-environment jsdom
import type { WebContents } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { extendSelectionScript, selectionTookArrow } from './selection-keys';

/** jsdom has no `Selection.modify`, so this records what the script asks for. */
function runScript(arrow: 'left' | 'right' | 'up' | 'down') {
  const modify = vi.fn();
  vi.spyOn(window, 'getSelection').mockReturnValue({
    modify,
  } as unknown as Selection);
  // eslint-disable-next-line no-eval -- the script's text is what a page runs.
  const answer: unknown = (0, eval)(extendSelectionScript(arrow));
  return { answer, modify };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('⇧⌘ and an arrow in a page', () => {
  it('selects to the end of the line in a field with text', () => {
    document.body.innerHTML = '<input value="hello world">';
    document.querySelector('input')!.focus();
    const { answer, modify } = runScript('right');
    expect(answer).toBe(true);
    expect(modify).toHaveBeenCalledWith('extend', 'right', 'lineboundary');
  });

  it('selects to the start of the text with the up arrow', () => {
    document.body.innerHTML = '<textarea>one\ntwo</textarea>';
    document.querySelector('textarea')!.focus();
    const { answer, modify } = runScript('up');
    expect(answer).toBe(true);
    expect(modify).toHaveBeenCalledWith(
      'extend',
      'backward',
      'documentboundary',
    );
  });

  it('leaves the key for the trail with no field focused', () => {
    document.body.innerHTML = '<p>Reading</p>';
    const { answer, modify } = runScript('down');
    expect(answer).toBe(false);
    expect(modify).not.toHaveBeenCalled();
  });

  it('leaves the key for the trail in an empty search box', () => {
    document.body.innerHTML = '<input value="">';
    document.querySelector('input')!.focus();
    const { answer, modify } = runScript('down');
    expect(answer).toBe(false);
    expect(modify).not.toHaveBeenCalled();
  });
});

describe('asking the focused frame', () => {
  const contents = (run: () => Promise<unknown>, focused = true) => {
    const frame = { executeJavaScript: vi.fn(run) };
    return {
      frame,
      contents: {
        focusedFrame: focused ? frame : undefined,
        mainFrame: focused ? { executeJavaScript: vi.fn() } : frame,
      } as unknown as WebContents,
    };
  };

  it('asks the frame with focus, which may be inside another site', async () => {
    const { contents: page, frame } = contents(async () => true);
    expect(await selectionTookArrow(page, 'left')).toBe(true);
    expect(frame.executeJavaScript).toHaveBeenCalledOnce();
    expect(page.mainFrame.executeJavaScript).not.toHaveBeenCalled();
  });

  it('falls back to the main frame', async () => {
    const { contents: page, frame } = contents(async () => false, false);
    expect(await selectionTookArrow(page, 'left')).toBe(false);
    expect(frame.executeJavaScript).toHaveBeenCalledOnce();
  });

  it('gives the key to the trail when a page can’t answer', async () => {
    const { contents: page } = contents(() => Promise.reject(new Error()));
    expect(await selectionTookArrow(page, 'up')).toBe(false);
  });

  it('doesn’t wait for a hung page', async () => {
    vi.useFakeTimers();
    const { contents: page } = contents(() => new Promise(() => undefined));
    const answer = selectionTookArrow(page, 'down');
    await vi.advanceTimersByTimeAsync(1000);
    expect(await answer).toBe(false);
    vi.useRealTimers();
  });
});
