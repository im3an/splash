import {
  isWorthKeeping,
  MAX_PLACES_PER_PAGE,
  offersPlace,
  type NavigationKind,
  type PagePlace,
} from '../../shared/page-place';

/**
 * One trail page's remembered places, by address, most recent last. They
 * travel with the page's history, so they outlive its view (sleep) and the
 * app (relaunch); a private window's history never reaches the disk.
 */
export class PagePlaces {
  private readonly byUrl = new Map<string, PagePlace>();
  /** The address this page is coming back to: reloaded, or woken. */
  private returningTo: string | null = null;

  /** The page reported where it is now. */
  remember(place: PagePlace): void {
    this.byUrl.delete(place.url);
    if (!isWorthKeeping(place)) return;
    this.byUrl.set(place.url, place);
    while (this.byUrl.size > MAX_PLACES_PER_PAGE) {
      const oldest = this.byUrl.keys().next().value;
      if (oldest === undefined) break;
      this.byUrl.delete(oldest);
    }
  }

  /** The page is reloading, or waking at `url`: its place comes back. */
  returnTo(url: string | null): void {
    this.returningTo = url;
  }

  /** The user sent the page somewhere new. */
  leave(): void {
    this.returningTo = null;
  }

  /** A new document at `url` asks where it was; `null` starts it afresh. */
  ask(url: string, kind: NavigationKind): PagePlace | null {
    const offer = offersPlace(kind, this.returningTo, url);
    this.returningTo = null;
    return offer ? (this.byUrl.get(url) ?? null) : null;
  }

  /** What to keep with a history of these addresses. */
  export(urls: readonly string[]): PagePlace[] {
    const kept = new Set(urls);
    return [...this.byUrl.values()].filter((place) => kept.has(place.url));
  }

  /** Places kept with a history, as the page wakes or the app relaunches. */
  seed(places: readonly PagePlace[] | undefined): void {
    for (const place of places ?? []) this.remember(place);
  }
}
