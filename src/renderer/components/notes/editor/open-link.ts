import { api } from '../../../splash-api';
import { useOverlay } from '../../../stores/overlay-store';

/** Opens a web address as a new page in the trail; notes step aside. */
export function openLink(href: string) {
  if (!/^https?:\/\//i.test(href)) return;
  void api()
    .createPage(href)
    .then(() => useOverlay.getState().close());
}
