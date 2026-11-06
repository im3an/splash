import { getDomain } from 'tldts';
import {
  cardBrand,
  type AddressFields,
  type CardFields,
  type CardSummary,
  type LoginSummary,
  type VaultListing,
} from '../../shared/vault';
import type { TrailStore, VaultRow } from '../storage/trail-store';

/** Seals with a key the Keychain holds; a copy of the database reveals nothing. */
export interface Cipher {
  available(): boolean;
  seal(text: string): Uint8Array;
  open(sealed: Uint8Array): string;
}

export type VaultStore = Pick<
  TrailStore,
  | 'listVault'
  | 'getVaultRow'
  | 'putVaultRow'
  | 'putVaultRows'
  | 'deleteVaultRow'
  | 'deleteVaultRows'
  | 'touchVaultRow'
>;

export interface SavedLogin extends LoginSummary {
  password: string;
}

export interface LoginMatch {
  login: SavedLogin;
  /** Saved for this exact site, rather than another part of it. */
  exact: boolean;
}

export interface LoginImport {
  added: number;
  updated: number;
  unchanged: number;
  undo(): void;
}

const MAX_UNDO = 20;

function parseWebUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

/** Local names and bare addresses have no wider site to belong to. */
function siteOfHost(hostname: string): string | null {
  return getDomain(hostname, { allowPrivateDomains: true });
}

/**
 * Whether a login saved for `saved` may be offered on the page at `page`. A
 * secure site's password never goes to its unencrypted address, or to another
 * site; other parts of the same site are offered, by name.
 */
export function loginMatches(
  saved: string,
  page: string,
): 'exact' | 'site' | null {
  const from = parseWebUrl(saved);
  const to = parseWebUrl(page);
  if (!from || !to) return null;
  if (from.origin === to.origin) return 'exact';
  if (from.protocol === 'https:' && to.protocol !== 'https:') return null;
  if (from.host === to.host) return 'exact';
  const site = siteOfHost(to.hostname);
  return site !== null && site === siteOfHost(from.hostname) ? 'site' : null;
}

/** The saved logins, addresses and cards, sealed on the way into the store. */
export class Vault {
  private readonly undos = new Map<string, () => void>();

  constructor(
    private readonly options: {
      store: VaultStore;
      cipher: Cipher;
      createId(): string;
      now(): number;
    },
  ) {}

  get available(): boolean {
    return this.options.cipher.available();
  }

  private sealed<T>(row: VaultRow): T | null {
    try {
      return JSON.parse(this.options.cipher.open(row.secret)) as T;
    } catch {
      return null;
    }
  }

  private seal(value: unknown): Uint8Array {
    return this.options.cipher.seal(JSON.stringify(value));
  }

  private readable<T>(kind: VaultRow['kind']): {
    row: VaultRow;
    value: T;
  }[] {
    return this.options.store.listVault(kind).flatMap((row) => {
      const value = this.sealed<T>(row);
      return value === null ? [] : [{ row, value }];
    });
  }

  private toLogin(
    row: VaultRow,
    value: { username: string; password: string },
  ): SavedLogin {
    return {
      id: row.id,
      origin: row.origin ?? '',
      username: value.username,
      password: value.password,
      updatedAt: row.updatedAt,
    };
  }

  logins(): SavedLogin[] {
    return this.readable<{ username: string; password: string }>('login').map(
      ({ row, value }) => this.toLogin(row, value),
    );
  }

  login(id: string): SavedLogin | null {
    const row = this.options.store.getVaultRow(id);
    if (row?.kind !== 'login') return null;
    const value = this.sealed<{ username: string; password: string }>(row);
    return value && this.toLogin(row, value);
  }

  /** What can be offered on a page: its own logins first. */
  loginsFor(pageUrl: string): LoginMatch[] {
    return this.logins()
      .flatMap((login): LoginMatch[] => {
        const match = loginMatches(login.origin, pageUrl);
        return match ? [{ login, exact: match === 'exact' }] : [];
      })
      .sort((a, b) => Number(b.exact) - Number(a.exact));
  }

  /** The login with this username for this exact site. */
  findLogin(origin: string, username: string): SavedLogin | null {
    return (
      this.logins().find(
        (login) => login.origin === origin && login.username === username,
      ) ?? null
    );
  }

  /**
   * Keeps a login. One username on one site is one login, so this replaces the
   * password of a login that already exists.
   */
  saveLogin(
    fields: { origin: string; username: string; password: string },
    id?: string,
  ): SavedLogin {
    const { store, createId, now } = this.options;
    const existing = id
      ? store.getVaultRow(id)
      : (() => {
          const found = this.findLogin(fields.origin, fields.username);
          return found ? store.getVaultRow(found.id) : null;
        })();
    const at = now();
    const row: VaultRow = {
      id: existing?.id ?? createId(),
      kind: 'login',
      origin: fields.origin,
      secret: this.seal({
        username: fields.username,
        password: fields.password,
      }),
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
      lastUsedAt: existing?.lastUsedAt ?? null,
    };
    store.putVaultRow(row);
    return this.toLogin(row, fields);
  }

  /** A login was just used; its order and date say so. */
  touch(id: string): void {
    this.options.store.touchVaultRow(id, this.options.now());
  }

  /** Adds an export's logins, updating passwords that changed. */
  importLogins(
    logins: readonly { origin: string; username: string; password: string }[],
  ): LoginImport {
    const { store, createId, now } = this.options;
    const existing = new Map(
      this.logins().map((login) => [
        JSON.stringify([login.origin, login.username]),
        login,
      ]),
    );
    const at = now();
    const added: VaultRow[] = [];
    const updated: VaultRow[] = [];
    const replaced: VaultRow[] = [];
    let unchanged = 0;
    for (const { origin, username, password } of logins) {
      const previous = existing.get(JSON.stringify([origin, username]));
      if (previous?.password === password) {
        unchanged += 1;
        continue;
      }
      const row: VaultRow = {
        id: previous?.id ?? createId(),
        kind: 'login',
        origin,
        secret: this.seal({ username, password }),
        createdAt: at,
        updatedAt: at,
        lastUsedAt: null,
      };
      if (previous) {
        const old = store.getVaultRow(previous.id);
        if (old) replaced.push(old);
        updated.push(row);
      } else {
        added.push(row);
      }
    }
    store.putVaultRows([...added, ...updated]);
    return {
      added: added.length,
      updated: updated.length,
      unchanged,
      undo: () => {
        store.deleteVaultRows(added.map((row) => row.id));
        store.putVaultRows(replaced);
      },
    };
  }

  addresses(): (AddressFields & { id: string })[] {
    return this.readable<AddressFields>('address').map(({ row, value }) => ({
      ...value,
      id: row.id,
    }));
  }

  address(id: string): AddressFields | null {
    const row = this.options.store.getVaultRow(id);
    return row?.kind === 'address' ? this.sealed<AddressFields>(row) : null;
  }

  saveAddress(fields: AddressFields, id?: string): string {
    return this.saveOther('address', fields, id);
  }

  private cardSummary(row: VaultRow, value: CardFields): CardSummary {
    const digits = value.number.replace(/\D/g, '');
    return {
      id: row.id,
      name: value.name,
      brand: cardBrand(digits),
      last4: digits.slice(-4),
      expMonth: value.expMonth,
      expYear: value.expYear,
    };
  }

  cards(): CardSummary[] {
    return this.readable<CardFields>('card').map(({ row, value }) =>
      this.cardSummary(row, value),
    );
  }

  card(id: string): CardFields | null {
    const row = this.options.store.getVaultRow(id);
    return row?.kind === 'card' ? this.sealed<CardFields>(row) : null;
  }

  saveCard(fields: CardFields, id?: string): string {
    return this.saveOther('card', fields, id);
  }

  private saveOther(
    kind: 'address' | 'card',
    fields: AddressFields | CardFields,
    id?: string,
  ): string {
    const { store, createId, now } = this.options;
    const existing = id ? store.getVaultRow(id) : null;
    const at = now();
    const row: VaultRow = {
      id: existing?.id ?? createId(),
      kind,
      origin: null,
      secret: this.seal(fields),
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
      lastUsedAt: existing?.lastUsedAt ?? null,
    };
    store.putVaultRow(row);
    return row.id;
  }

  /** Removes an item; the token brings it back for as long as Splash runs. */
  delete(id: string): string | null {
    const { store, createId } = this.options;
    const row = store.getVaultRow(id);
    if (!row) return null;
    store.deleteVaultRow(id);
    return this.offerUndo(createId(), () => store.putVaultRow(row));
  }

  offerUndo(token: string, undo: () => void): string {
    this.undos.set(token, undo);
    for (const key of this.undos.keys()) {
      if (this.undos.size <= MAX_UNDO) break;
      this.undos.delete(key);
    }
    return token;
  }

  undo(token: string): boolean {
    const undo = this.undos.get(token);
    if (!undo) return false;
    this.undos.delete(token);
    undo();
    return true;
  }

  /** Everything saved, without passwords or full card numbers. */
  listing(): VaultListing {
    const { store } = this.options;
    const logins = this.logins();
    const addresses = this.addresses();
    const cards = this.cards();
    const total = (['login', 'address', 'card'] as const).reduce(
      (sum, kind) => sum + store.listVault(kind).length,
      0,
    );
    return {
      available: this.available,
      logins: logins.map(({ password: _password, ...login }) => login),
      addresses,
      cards,
      unreadable: total - logins.length - addresses.length - cards.length,
    };
  }
}

const PASSWORD_ALPHABET =
  'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * A password like `kQ7nTz-w4LmPb-Xh2sRf`: about 95 bits, three groups so it can
 * be read aloud, and a dash, a capital and a digit so sites accept it.
 */
export function generatePassword(random: (size: number) => Uint8Array): string {
  const pick = () => {
    // Drawing again above the last whole multiple keeps every letter equally likely.
    const limit = 256 - (256 % PASSWORD_ALPHABET.length);
    for (;;) {
      const [value = 255] = random(1);
      if (value < limit)
        return PASSWORD_ALPHABET[value % PASSWORD_ALPHABET.length]!;
    }
  };
  for (;;) {
    const password = Array.from({ length: 3 }, () =>
      Array.from({ length: 6 }, pick).join(''),
    ).join('-');
    if (/[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password))
      return password;
  }
}
