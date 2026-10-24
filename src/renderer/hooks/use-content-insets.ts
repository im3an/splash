import { useLayoutEffect, type RefObject } from 'react';
import type { ContentInsets } from '../../shared/types';

/**
 * Reports where the page content area sits inside the window, so the main
 * process can position the Chromium view over it. Insets rather than a
 * rectangle let the main process follow live window resizes on its own.
 */
export function useContentInsets(
  ref: RefObject<HTMLElement | null>,
  report: (insets: ContentInsets) => void,
): void {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let last = '';

    const measure = () => {
      const rect = element.getBoundingClientRect();
      const insets: ContentInsets = {
        top: Math.round(rect.top),
        left: Math.round(rect.left),
        right: Math.max(0, Math.round(window.innerWidth - rect.right)),
        bottom: Math.max(0, Math.round(window.innerHeight - rect.bottom)),
      };
      const key = `${insets.top},${insets.right},${insets.bottom},${insets.left}`;
      if (key === last) return;
      last = key;
      report(insets);
    };

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ref, report]);
}
