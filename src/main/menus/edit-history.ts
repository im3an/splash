import type { WebContents } from 'electron';

/**
 * Where Edit › Undo and Edit › Redo go. A page keeps its own typing history, so
 * with focus in a page they normally belong to it. While a toast offers Undo or
 * Redo, though, the trail change is what the person means, unless they are
 * typing in the page.
 */

export interface EditFocus {
  /** The focused window is the trail window the menu acts on. */
  inTrailWindow: boolean;
  /**
   * `other` is the AI panel or developer tools; `none` happens when the view
   * that had focus has just closed.
   */
  focus: 'shell' | 'page' | 'other' | 'none';
  /** A toast with Undo or Redo is showing in that window. */
  trailOffered: boolean;
  editingText(): Promise<boolean>;
}

/**
 * `shell` lets the shell choose between its own fields and the trail, `trail`
 * goes straight to the trail, and `focused` to whatever has focus.
 */
export async function editTarget({
  inTrailWindow,
  focus,
  trailOffered,
  editingText,
}: EditFocus): Promise<'shell' | 'trail' | 'focused'> {
  if (!inTrailWindow) return 'focused';
  if (focus === 'shell') return 'shell';
  // Nothing has focus, so a field the shell last left focused isn't in use.
  if (focus === 'none') return trailOffered ? 'trail' : 'shell';
  if (focus === 'page' && trailOffered && !(await editingText()))
    return 'trail';
  return 'focused';
}

/**
 * Asks a page whether its focus is on typing. An empty field doesn't count, since
 * many sites focus their search box on load, and that shouldn't swallow the key.
 * A frame does, since what's inside another site's frame can't be seen from here.
 * Editors drawn on a canvas can't be told apart, which only matters during a toast.
 */
export const EDITING_TEXT_SCRIPT = `(() => {
  let active = document.activeElement;
  while (active && active.shadowRoot && active.shadowRoot.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  if (document.designMode === 'on') return true;
  if (!active) return false;
  const tag = active.tagName;
  if (['IFRAME', 'FRAME', 'OBJECT', 'EMBED'].includes(tag)) return true;
  if (active.isContentEditable) return true;
  if (tag === 'TEXTAREA') return !active.readOnly && active.value !== '';
  if (tag !== 'INPUT') return false;
  const noText = ['button', 'checkbox', 'color', 'file', 'hidden', 'image',
    'radio', 'range', 'reset', 'submit'];
  return !active.readOnly && !noText.includes(active.type) && active.value !== '';
})()`;

/** Its own world, so nothing the page has done to its globals gets involved. */
const ISOLATED_WORLD = 1099;
/** A hung page can't undo anything, so there's no point in waiting for it. */
const ANSWER_MS = 150;

export async function isEditingText(contents: WebContents): Promise<boolean> {
  const late = new Promise<boolean>((resolve) => {
    setTimeout(() => resolve(false), ANSWER_MS);
  });
  try {
    const answer: unknown = await Promise.race([
      contents.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD, [
        { code: EDITING_TEXT_SCRIPT },
      ]),
      late,
    ]);
    return answer === true;
  } catch {
    return false;
  }
}
