import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from 'react';
import type { PaletteItem } from '../../shared/types';

/** Whether `completion` still extends what's typed, ignoring case. */
export function fits(completion: string | null, typed: string): boolean {
  return (
    completion !== null &&
    completion.length > typed.length &&
    completion.toLowerCase().startsWith(typed.toLowerCase())
  );
}

/** The address the leading row fills in after `typed`, if it fits. */
export function completionFor(
  items: readonly PaletteItem[],
  typed: string,
): string | null {
  const lead = items[0];
  if (lead?.kind !== 'navigate' || !lead.completion) return null;
  return fits(lead.completion, typed) ? lead.completion : null;
}

/**
 * Puts the engine's suggestions among the local results: after the rows
 * Enter acts on and `after` more, replacing any earlier suggestions.
 */
export function withSearchSuggestions(
  items: readonly PaletteItem[],
  search: readonly PaletteItem[],
  after: number,
): PaletteItem[] {
  const local = items.filter((item) => item.kind !== 'search');
  const firstOther = local.findIndex((item) => item.section !== 'go');
  const leads = firstOther === -1 ? local.length : firstOther;
  const at = Math.min(local.length, leads + after);
  return [...local.slice(0, at), ...search, ...local.slice(at)];
}

/**
 * Fills in the rest of an address as it's typed, selected so the next key
 * replaces it, the way "gi" becomes "gi|thub.com". It completes only while
 * the user types forward at the end; deleting, pasting or editing in the
 * middle leaves the text as typed.
 */
export function useInlineCompletion(
  inputRef: RefObject<HTMLInputElement | null>,
  typed: string,
) {
  const [completion, setCompletion] = useState<string | null>(null);
  const [forward, setForward] = useState(false);
  const active = fits(completion, typed) ? completion : null;
  // Keep the letters as typed; only the filled-in rest comes from history.
  const shown = active ? typed + active.slice(typed.length) : typed;

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (active && input && document.activeElement === input) {
      input.setSelectionRange(typed.length, active.length);
    }
  }, [active, typed, inputRef]);

  // Answers can arrive after the next key, so this reads the latest state.
  const forwardRef = useRef(forward);
  forwardRef.current = forward;

  /** Call from `onChange`; says whether the next answer may complete. */
  const onInput = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const next =
      (event.nativeEvent as InputEvent).inputType === 'insertText' &&
      input.selectionStart === input.value.length;
    forwardRef.current = next;
    setForward(next);
    if (!next) setCompletion(null);
    return next;
  }, []);

  /** Offers the results that answered `text`. */
  const offer = useCallback((items: readonly PaletteItem[], text: string) => {
    setCompletion(forwardRef.current ? completionFor(items, text) : null);
  }, []);

  const clear = useCallback(() => {
    forwardRef.current = false;
    setForward(false);
    setCompletion(null);
  }, []);

  return { shown, active, forward, onInput, offer, clear };
}
