import type { PageHost, PageHostEvents } from '../../engine/page-host';
import { describeSite } from './mock-sites';

export interface MockPageHostOptions {
  /** Finish loads synchronously; used while seeding the initial trails. */
  instant?: () => boolean;
  /** Network time for revisiting history entries, which are "cached". */
  historyLatency?: number;
}

/**
 * A page with simulated loading and its own back/forward history, standing
 * in for a Chromium view. It reports state exactly as the real host does, so
 * the controller and shell cannot tell the difference.
 */
export class MockPageHost implements PageHost {
  private entries: string[] = [];
  private index = -1;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly events: PageHostEvents,
    private readonly options: MockPageHostOptions = {},
  ) {}

  load(url: string): void {
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push(url);
    this.index = this.entries.length - 1;
    this.visit(describeSite(url).latency);
  }

  goBack(): void {
    if (this.index <= 0) return;
    this.index--;
    this.visit(this.options.historyLatency ?? 160);
  }

  goForward(): void {
    if (this.index >= this.entries.length - 1) return;
    this.index++;
    this.visit(this.options.historyLatency ?? 160);
  }

  reload(): void {
    if (this.index >= 0) this.visit(describeSite(this.current()).latency);
  }

  stop(): void {
    if (this.timer === null) return;
    this.cancel();
    this.events.onStateChange({ isLoading: false });
  }

  show(): void {}
  hide(): void {}
  focus(): void {}
  toggleDevTools(): void {}

  destroy(): void {
    this.cancel();
  }

  private current(): string {
    return this.entries[this.index]!;
  }

  private visit(latency: number): void {
    this.cancel();
    const url = this.current();
    this.events.onStateChange({
      url,
      isLoading: true,
      error: null,
      canGoBack: this.index > 0,
      canGoForward: this.index < this.entries.length - 1,
    });
    const finish = () => {
      this.timer = null;
      const site = describeSite(url);
      if (site.failure) {
        this.events.onStateChange({
          isLoading: false,
          title: '',
          faviconUrl: null,
          error: { kind: 'load-failed', url, ...site.failure },
        });
      } else {
        this.events.onStateChange({
          isLoading: false,
          title: site.title,
          faviconUrl: site.faviconUrl,
        });
      }
    };
    if (this.options.instant?.()) finish();
    else this.timer = setTimeout(finish, latency);
  }

  private cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
