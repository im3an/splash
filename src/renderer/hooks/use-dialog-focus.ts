import { useEffect, useRef } from 'react';

/** Keep Tab inside a modal and return to its trigger when it leaves. */
export function useDialogFocus<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !enabled) return;
    const previous = document.activeElement;
    const controls = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled):not([type="hidden"]), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
        ),
      ).filter(
        (element) =>
          element.tabIndex >= 0 && !element.closest('[hidden], [inert]'),
      );
    if (!dialog.contains(document.activeElement))
      (controls()[0] ?? dialog).focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.defaultPrevented) return;
      const items = controls();
      const first = items[0];
      const last = items.at(-1);
      if (!first) {
        event.preventDefault();
        dialog.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', onKeyDown);
    return () => {
      dialog.removeEventListener('keydown', onKeyDown);
      if (
        previous instanceof HTMLElement &&
        previous.isConnected &&
        (dialog.contains(document.activeElement) ||
          document.activeElement === document.body)
      ) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [enabled]);
  return ref;
}
