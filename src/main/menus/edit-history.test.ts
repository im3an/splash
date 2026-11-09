// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  EDITING_TEXT_SCRIPT,
  editTarget,
  isEditingText,
  type EditFocus,
} from './edit-history';

function focus(overrides: Partial<EditFocus> = {}): EditFocus {
  return {
    inTrailWindow: true,
    focus: 'page',
    trailOffered: true,
    editingText: async () => false,
    ...overrides,
  };
}

describe('where ⌘Z and ⇧⌘Z go', () => {
  it('goes to the trail from a page while the toast offers it', async () => {
    expect(await editTarget(focus())).toBe('trail');
  });

  it('stays with the page once the toast has gone', async () => {
    const editingText = vi.fn(async () => false);
    expect(await editTarget(focus({ trailOffered: false, editingText }))).toBe(
      'focused',
    );
    // Nothing runs in the page unless the answer matters.
    expect(editingText).not.toHaveBeenCalled();
  });

  it('stays with a page field being typed in, toast or not', async () => {
    expect(await editTarget(focus({ editingText: async () => true }))).toBe(
      'focused',
    );
  });

  it('lets the shell decide when focus is in the shell', async () => {
    expect(await editTarget(focus({ focus: 'shell' }))).toBe('shell');
    expect(
      await editTarget(focus({ focus: 'shell', trailOffered: false })),
    ).toBe('shell');
  });

  it('goes to the trail when the view that had focus has just closed', async () => {
    expect(await editTarget(focus({ focus: 'none' }))).toBe('trail');
    expect(
      await editTarget(focus({ focus: 'none', trailOffered: false })),
    ).toBe('shell');
  });

  it('leaves other windows and other views alone', async () => {
    expect(await editTarget(focus({ inTrailWindow: false }))).toBe('focused');
    // The AI panel or developer tools: focused, in this window, but no page.
    expect(await editTarget(focus({ focus: 'other' }))).toBe('focused');
  });
});

describe('whether a page is taking typing', () => {
  const editing = () => window.eval(EDITING_TEXT_SCRIPT) as boolean;
  const focused = (html: string): boolean => {
    document.body.innerHTML = html;
    document.body.querySelector<HTMLElement>('[data-focus]')?.focus();
    return editing();
  };

  it('says yes in text fields with something typed', () => {
    expect(focused('<input value="a" data-focus>')).toBe(true);
    expect(focused('<input type="search" value="a" data-focus>')).toBe(true);
    expect(focused('<textarea data-focus>a</textarea>')).toBe(true);
  });

  it('says no in an empty field, like a search box focused on load', () => {
    expect(focused('<input data-focus>')).toBe(false);
    expect(focused('<input type="search" autofocus data-focus>')).toBe(false);
    expect(focused('<textarea data-focus></textarea>')).toBe(false);
  });

  it('says no on the page itself and on controls with no text', () => {
    expect(focused('<p>Reading</p>')).toBe(false);
    expect(focused('<button data-focus>Go</button>')).toBe(false);
    expect(focused('<input type="checkbox" data-focus>')).toBe(false);
    expect(focused('<a href="#x" data-focus>Link</a>')).toBe(false);
  });

  it('says no in a read-only field, which has no typing to undo', () => {
    expect(focused('<input readonly value="a" data-focus>')).toBe(false);
    expect(focused('<textarea readonly data-focus>a</textarea>')).toBe(false);
  });

  it('can’t see into a frame, so a focused frame counts as typing', () => {
    expect(focused('<iframe data-focus tabindex="0"></iframe>')).toBe(true);
  });

  it('looks inside open shadow roots', () => {
    document.body.innerHTML = '<div id="host"></div>';
    const root = document
      .getElementById('host')!
      .attachShadow({ mode: 'open' });
    root.innerHTML = '<input value="a" data-focus>';
    root.querySelector('input')!.focus();
    expect(editing()).toBe(true);
  });
});

describe('asking a page', () => {
  const page = (answer: () => Promise<unknown>) =>
    ({
      executeJavaScriptInIsolatedWorld: vi.fn(answer),
    }) as unknown as Parameters<typeof isEditingText>[0];

  it('runs apart from the page’s own scripts', async () => {
    const contents = page(async () => true);
    expect(await isEditingText(contents)).toBe(true);
    const ask = vi.mocked(contents.executeJavaScriptInIsolatedWorld);
    expect(ask.mock.calls[0]![0]).toBeGreaterThan(0);
    expect(ask.mock.calls[0]![1]).toEqual([{ code: EDITING_TEXT_SCRIPT }]);
  });

  it('counts a page that can’t answer as not typing', async () => {
    expect(await isEditingText(page(() => Promise.reject(new Error())))).toBe(
      false,
    );
  });

  it('doesn’t wait for a hung page', async () => {
    vi.useFakeTimers();
    const answer = isEditingText(page(() => new Promise(() => undefined)));
    await vi.advanceTimersByTimeAsync(1000);
    expect(await answer).toBe(false);
    vi.useRealTimers();
  });
});
