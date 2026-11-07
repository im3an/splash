import type { WebContents } from 'electron';
import { EDITING_TEXT_SCRIPT } from './edit-history';

/**
 * ⇧⌘ and an arrow selects to the end of the line or text in every Mac text field,
 * and walks the trails everywhere else. Chromium offers a key to the menu before
 * it applies the selection, so the menu's own handler has to look at the field.
 * A site that uses the key itself never gets this far: its keydown handler has
 * already taken it.
 */

export type SelectionArrow = 'left' | 'right' | 'up' | 'down';

const EXTEND: Record<SelectionArrow, [direction: string, reach: string]> = {
  left: ['left', 'lineboundary'],
  right: ['right', 'lineboundary'],
  up: ['backward', 'documentboundary'],
  down: ['forward', 'documentboundary'],
};

/**
 * Answers whether the key was for the field. It shares the check Undo uses, so an
 * empty search box a site focused on load doesn't hold on to the key. A frame the
 * script can't see into counts as typing, so the key does nothing rather than
 * move the person away from what they were writing.
 */
export function extendSelectionScript(arrow: SelectionArrow): string {
  const [direction, reach] = EXTEND[arrow];
  return `(() => {
  if (!${EDITING_TEXT_SCRIPT}) return false;
  getSelection().modify('extend', '${direction}', '${reach}');
  return true;
})()`;
}

/** A hung page can't be typed in, so there's no point in waiting for it. */
const ANSWER_MS = 150;

/** Whether the focused field took the key, which then isn't for the trail. */
export async function selectionTookArrow(
  contents: WebContents,
  arrow: SelectionArrow,
): Promise<boolean> {
  const late = new Promise<boolean>((resolve) => {
    setTimeout(() => resolve(false), ANSWER_MS);
  });
  try {
    // The focused frame, since the field may be inside another site's frame.
    const frame = contents.focusedFrame ?? contents.mainFrame;
    const answer: unknown = await Promise.race([
      frame.executeJavaScript(extendSelectionScript(arrow)),
      late,
    ]);
    return answer === true;
  } catch {
    return false;
  }
}
