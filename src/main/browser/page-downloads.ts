/** What a download that just started means for its page. */
export interface PageDownloadVerdict {
  /** The page came back by itself: this download doesn't go ahead. */
  held: boolean;
  /** The page shows a document of its own, which a download doesn't replace. */
  hasDocument: boolean;
  /** The user hasn't been told about a download held on this view yet. */
  firstHeld: boolean;
}

/**
 * Tells apart the downloads someone asked for from the ones a page starts by
 * coming back. Restoring a session, waking a page and undoing a close all load
 * an address nobody just asked for, which may answer with a file, or be a
 * "your download starts now" page. Those wait until the user acts on the page.
 */
export class PageDownloads {
  private document = false;
  private holding = false;
  private told = false;

  /** A load is starting that nobody asked for just now. */
  comingBack(): void {
    this.holding = true;
  }

  /** The user reloaded, went back, typed an address or used the page. */
  userActed(): void {
    this.holding = false;
  }

  /** The view now shows a document. */
  committed(): void {
    this.document = true;
  }

  get isHolding(): boolean {
    return this.holding;
  }

  starting(): PageDownloadVerdict {
    const held = this.holding;
    const firstHeld = held && !this.told;
    if (held) this.told = true;
    return { held, hasDocument: this.document, firstHeld };
  }
}
