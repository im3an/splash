import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { SqliteTrailStore } from '../storage/sqlite-trail-store';
import { isValidCardNumber } from '../../shared/vault';
import { generatePassword, loginMatches, Vault, type Cipher } from './vault';

const SEAL = 'sealed:';
const cipher: Cipher = {
  available: () => true,
  seal: (text) => Buffer.from(SEAL + Buffer.from(text).toString('base64')),
  open: (sealed) => {
    const text = Buffer.from(sealed).toString();
    if (!text.startsWith(SEAL)) throw new Error('wrong key');
    return Buffer.from(text.slice(SEAL.length), 'base64').toString();
  },
};

let store: SqliteTrailStore;
let vault: Vault;

beforeEach(() => {
  store = new SqliteTrailStore(new DatabaseSync(':memory:'));
  let id = 0;
  vault = new Vault({
    store,
    cipher,
    createId: () => `id-${++id}`,
    now: () => 1000 + id,
  });
});

describe('loginMatches', () => {
  it.each([
    ['https://a.test', 'https://a.test/login', 'exact'],
    ['https://a.example.com', 'https://b.example.com/', 'site'],
    ['https://www.example.co.uk', 'https://login.example.co.uk/', 'site'],
    // An old plain-HTTP login may be offered on the secure site.
    ['http://a.test', 'https://a.test/', 'exact'],
  ])('offers %s on %s', (saved, page, match) => {
    expect(loginMatches(saved, page)).toBe(match);
  });

  it.each([
    // Never down to an unencrypted page.
    ['https://a.test', 'http://a.test/'],
    ['https://a.example.com', 'http://b.example.com/'],
    // Different sites, however alike.
    ['https://example.com', 'https://example.com.evil.test/'],
    ['https://a.co.uk', 'https://b.co.uk/'],
    // github.io pages belong to different people.
    ['https://alice.github.io', 'https://mallory.github.io/'],
    // Local names have no wider site.
    ['http://localhost:1', 'http://localhost:2/'],
    ['http://10.0.0.1', 'http://10.0.0.2/'],
    ['https://a.test', 'file:///etc/passwd'],
  ])('doesn’t offer %s on %s', (saved, page) => {
    expect(loginMatches(saved, page)).toBeNull();
  });
});

describe('Vault', () => {
  const login = {
    origin: 'https://a.test',
    username: 'me',
    password: 'secret-value',
  };

  it('keeps nothing readable in the store', () => {
    vault.saveLogin(login);
    const [row] = store.listVault('login');
    expect(row?.origin).toBe('https://a.test');
    expect(Buffer.from(row!.secret).toString()).not.toContain('secret-value');
    expect(Buffer.from(row!.secret).toString()).not.toContain('me');
    expect(vault.logins()[0]).toMatchObject(login);
  });

  it('treats one username on one site as one login', () => {
    vault.saveLogin(login);
    vault.saveLogin({ ...login, password: 'new' });
    expect(vault.logins()).toHaveLength(1);
    expect(vault.logins()[0]?.password).toBe('new');
  });

  it('lists its own site first', () => {
    vault.saveLogin({ ...login, origin: 'https://a.example.com' });
    vault.saveLogin({ ...login, origin: 'https://b.example.com' });
    vault.saveLogin({ ...login, origin: 'https://other.test' });
    expect(
      vault
        .loginsFor('https://b.example.com/x')
        .map((match) => [match.login.origin, match.exact]),
    ).toEqual([
      ['https://b.example.com', true],
      ['https://a.example.com', false],
    ]);
  });

  it('never lists a password in its listing', () => {
    vault.saveLogin(login);
    vault.saveCard({
      name: 'Me',
      number: '4242 4242 4242 4242',
      expMonth: '12',
      expYear: '2030',
    });
    const listing = JSON.stringify(vault.listing());
    expect(listing).not.toContain('secret-value');
    expect(listing).not.toContain('4242 4242');
    expect(vault.listing().cards[0]).toMatchObject({
      brand: 'Visa',
      last4: '4242',
    });
  });

  it('brings back what was deleted, once', () => {
    const { id } = vault.saveLogin(login);
    const token = vault.delete(id)!;
    expect(vault.logins()).toEqual([]);
    expect(vault.undo(token)).toBe(true);
    expect(vault.logins()[0]?.password).toBe('secret-value');
    expect(vault.undo(token)).toBe(false);
    expect(vault.delete('missing')).toBeNull();
  });

  it('counts what this copy can’t read, without failing', () => {
    vault.saveLogin(login);
    store.putVaultRow({
      id: 'other-key',
      kind: 'login',
      origin: 'https://b.test',
      secret: Buffer.from('from another key'),
      createdAt: 1,
      updatedAt: 1,
      lastUsedAt: null,
    });
    expect(vault.listing().logins).toHaveLength(1);
    expect(vault.listing().unreadable).toBe(1);
  });

  it('imports, updates, skips what’s the same, and undoes all of it', () => {
    vault.saveLogin(login);
    const other = { origin: 'https://b.test', username: 'u', password: 'p' };
    const done = vault.importLogins([
      login,
      { ...login, username: 'second' },
      other,
    ]);
    expect(done).toMatchObject({ added: 2, updated: 0, unchanged: 1 });
    const again = vault.importLogins([{ ...other, password: 'changed' }]);
    expect(again).toMatchObject({ added: 0, updated: 1, unchanged: 0 });
    expect(vault.findLogin(other.origin, 'u')?.password).toBe('changed');
    again.undo();
    expect(vault.findLogin(other.origin, 'u')?.password).toBe('p');
    done.undo();
    expect(vault.logins().map((item) => item.username)).toEqual(['me']);
  });
});

describe('generatePassword', () => {
  it('is long, varied and doesn’t repeat', () => {
    const passwords = Array.from({ length: 200 }, () =>
      generatePassword(randomBytes),
    );
    for (const password of passwords) {
      expect(password).toMatch(
        /^[A-Za-z0-9]{6}-[A-Za-z0-9]{6}-[A-Za-z0-9]{6}$/,
      );
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/\d/);
    }
    expect(new Set(passwords).size).toBe(200);
  });
});

describe('isValidCardNumber', () => {
  it('passes published test numbers and refuses typos', () => {
    expect(isValidCardNumber('4242 4242 4242 4242')).toBe(true);
    expect(isValidCardNumber('5555-5555-5555-4444')).toBe(true);
    expect(isValidCardNumber('4242 4242 4242 4241')).toBe(false);
    expect(isValidCardNumber('42')).toBe(false);
  });
});
