import type { Notice } from '../../shared/types';
import type { FormFieldReport, FormFill } from '../../shared/page-bridge';
import type {
  AutofillItem,
  CredentialAnswer,
  CredentialPrompt,
} from '../../shared/vault';
import type { Vault } from './vault';

/** The frame a form is in, as far as this logic needs to know it. */
export interface FormTarget {
  /** Its address right now, read from the browser rather than the page. */
  url(): string;
  alive(): boolean;
  fill(fill: FormFill): void;
  /** Tells it the field's menu has closed. */
  closed(): void;
}

/** Where a frame's offers appear. */
export interface FormSurface {
  /** Identifies the page, so a later page can withdraw an offer. */
  key: number;
  pageId: string | null;
  /** Private windows fill, but never keep anything. */
  canSave: boolean;
  prompt(prompt: CredentialPrompt | null): void;
  notify(notice: Notice): void;
}

export interface FormAssistOptions {
  vault: Vault;
  enabled(): boolean;
  /** Whether the user said never to offer on this site. */
  neverOffers(origin: string): boolean;
  neverOffer(origin: string): void;
  /** Touch ID, or the closest thing this Mac has. */
  authorize(reason: string): Promise<boolean>;
  /** The user chose to use this site despite its certificate. */
  certificateException?(address: string): boolean;
  generatePassword(): string;
  openManager(): void;
  showMenu(items: AutofillItem[]): void;
  hideMenu(): void;
  createId(): string;
  /** How long an offer waits, so a refused sign-in can withdraw it. */
  promptDelayMs?: number;
}

const MANAGE: AutofillItem = {
  id: 'manage',
  kind: 'manage',
  title: 'Manage Passwords and Autofill…',
  detail: null,
};

const GENERATE: AutofillItem = {
  id: 'generate',
  kind: 'generate',
  title: 'Suggest a Strong Password',
  detail: 'Saved here for you',
};

/** Cards go only where the connection is private. */
function isPrivateConnection(address: string): boolean {
  try {
    const { protocol, hostname } = new URL(address);
    return protocol === 'https:' || hostname === 'localhost';
  } catch {
    return false;
  }
}

function originOf(address: string): string | null {
  try {
    const { protocol, origin } = new URL(address);
    return protocol === 'https:' || protocol === 'http:' ? origin : null;
  } catch {
    return null;
  }
}

function hostOf(address: string): string {
  try {
    return new URL(address).host;
  } catch {
    return address;
  }
}

interface PendingLogin {
  prompt: CredentialPrompt;
  surface: FormSurface;
  origin: string;
  password: string;
  timer: ReturnType<typeof setTimeout> | null;
  shown: boolean;
}

/**
 * Decides what the menu under a form field offers, what choosing it fills, and
 * whether a login the user just used is worth offering to keep. A frame only
 * ever receives values after the user chose them from Splash's own menu, and
 * only if it's still at an address they belong to.
 */
export class FormAssist {
  private open: {
    target: FormTarget;
    surface: FormSurface;
    report: FormFieldReport;
    origin: string;
  } | null = null;
  private readonly pending = new Map<string, PendingLogin>();

  constructor(private readonly options: FormAssistOptions) {}

  /** Not on a site the user went to despite its certificate, either. */
  private cardsAllowed(address: string): boolean {
    return (
      isPrivateConnection(address) &&
      !this.options.certificateException?.(address)
    );
  }

  /** What to offer for a field; `null` when there's nothing. */
  private itemsFor(pageUrl: string, report: FormFieldReport): AutofillItem[] {
    const { vault } = this.options;
    if (report.group === 'login') {
      const logins = vault.loginsFor(pageUrl).map(
        ({ login, exact }): AutofillItem => ({
          id: login.id,
          kind: 'login',
          title: login.username || 'No username',
          detail: exact ? null : hostOf(login.origin),
        }),
      );
      return report.kind === 'new-password' && vault.available
        ? [...logins, GENERATE]
        : logins;
    }
    if (report.group === 'address') {
      return vault.addresses().map(
        (address): AutofillItem => ({
          id: address.id,
          kind: 'address',
          title: address.label || address.name || address.street,
          detail: [address.street.split('\n')[0], address.city]
            .filter(Boolean)
            .join(', '),
        }),
      );
    }
    if (!this.cardsAllowed(pageUrl)) return [];
    return vault.cards().map(
      (card): AutofillItem => ({
        id: card.id,
        kind: 'card',
        title: `${card.brand} ending ${card.last4}`,
        detail: `${card.name} · ${card.expMonth.padStart(2, '0')}/${card.expYear.slice(-2)}`,
      }),
    );
  }

  /** A trusted click in a field. Returns whether a menu opened. */
  ask(
    target: FormTarget,
    surface: FormSurface,
    report: FormFieldReport,
  ): boolean {
    if (!this.options.enabled()) return false;
    const pageUrl = target.url();
    const origin = originOf(pageUrl);
    if (!origin) return false;
    const items = this.itemsFor(pageUrl, report);
    if (items.length === 0) return false;
    if (this.open && this.open.target !== target) this.open.target.closed();
    this.open = { target, surface, report, origin };
    this.options.showMenu([...items, MANAGE]);
    return true;
  }

  dismiss(target?: FormTarget): void {
    if (target && this.open?.target !== target) return;
    if (!this.open) return;
    const { target: current } = this.open;
    this.open = null;
    this.options.hideMenu();
    if (current.alive()) current.closed();
  }

  /** The user picked a row of the menu. */
  async choose(itemId: string): Promise<void> {
    const open = this.open;
    if (!open) return;
    this.open = null;
    this.options.hideMenu();
    const { target, surface, report, origin } = open;
    const { vault } = this.options;
    if (itemId === MANAGE.id) {
      if (target.alive()) target.closed();
      this.options.openManager();
      return;
    }
    // The frame may have moved on while the menu was up.
    if (!target.alive() || originOf(target.url()) !== origin) return;
    if (itemId === GENERATE.id) {
      const password = this.options.generatePassword();
      if (surface.canSave) {
        vault.saveLogin({ origin, username: report.username, password });
        surface.notify({ kind: 'password-saved', host: hostOf(origin) });
      }
      target.fill({
        group: 'login',
        username: null,
        password: null,
        newPassword: password,
      });
      return;
    }
    const login = vault.login(itemId);
    if (login) {
      const offered = vault
        .loginsFor(target.url())
        .some((match) => match.login.id === login.id);
      if (!offered) return;
      vault.touch(login.id);
      target.fill({
        group: 'login',
        username: login.username,
        password: login.password,
        newPassword: null,
      });
      return;
    }
    const address = vault.address(itemId);
    if (address) {
      target.fill({ group: 'address', address });
      return;
    }
    const card = vault.card(itemId);
    if (card && this.cardsAllowed(target.url())) {
      if (!(await this.options.authorize('fill your saved card'))) {
        if (target.alive()) target.closed();
        return;
      }
      if (target.alive() && originOf(target.url()) === origin) {
        target.fill({ group: 'card', card });
      }
    }
  }

  /** Whether a login just used is new to Splash, and offers to keep it. */
  submitted(
    target: FormTarget,
    surface: FormSurface,
    credentials: { username: string; password: string },
  ): void {
    const { options } = this;
    if (!options.enabled() || !surface.canSave) return;
    if (!options.vault.available) return;
    const origin = originOf(target.url());
    if (!origin || options.neverOffers(origin) || !credentials.password) return;

    const { vault } = options;
    const existing = vault.findLogin(origin, credentials.username);
    if (existing?.password === credentials.password) {
      vault.touch(existing.id);
      return;
    }
    // A password Splash made up, saved before the name was known.
    const unnamed = vault.findLogin(origin, '');
    if (
      !existing &&
      unnamed?.password === credentials.password &&
      credentials.username
    ) {
      vault.saveLogin(
        { origin, username: credentials.username, password: unnamed.password },
        unnamed.id,
      );
      return;
    }

    this.withdraw(surface.key);
    const prompt: CredentialPrompt = {
      id: options.createId(),
      pageId: surface.pageId,
      host: hostOf(origin),
      username: credentials.username,
      update: existing !== null,
    };
    const entry: PendingLogin = {
      prompt,
      surface,
      origin,
      password: credentials.password,
      shown: false,
      timer: setTimeout(() => {
        entry.timer = null;
        entry.shown = true;
        surface.prompt(prompt);
      }, options.promptDelayMs ?? 1500),
    };
    this.pending.set(prompt.id, entry);
  }

  /** The next page asked for a password again: that sign-in didn't work. */
  stillLogin(surface: FormSurface): void {
    this.withdraw(surface.key);
  }

  private withdraw(key: number): void {
    for (const [id, entry] of this.pending) {
      if (entry.surface.key !== key) continue;
      if (entry.timer) clearTimeout(entry.timer);
      if (entry.shown) entry.surface.prompt(null);
      this.pending.delete(id);
    }
  }

  /** The user answered an offer. The password is gone from memory after this. */
  answer(id: string, answer: CredentialAnswer): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    if (entry.timer) clearTimeout(entry.timer);
    entry.surface.prompt(null);
    if (answer === 'never') {
      this.options.neverOffer(entry.origin);
    } else if (answer === 'save') {
      this.options.vault.saveLogin({
        origin: entry.origin,
        username: entry.prompt.username,
        password: entry.password,
      });
      entry.surface.notify({
        kind: 'password-saved',
        host: entry.prompt.host,
      });
    }
  }
}
