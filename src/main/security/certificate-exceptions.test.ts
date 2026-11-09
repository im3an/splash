import { describe, expect, it } from 'vitest';
import {
  CertificateExceptions,
  hasCertificateException,
  type CertificateStore,
} from './certificate-exceptions';

const AUTHORITY = 'net::ERR_CERT_AUTHORITY_INVALID';
const URL_A = 'https://nas.test:8443/admin';

function memoryStore(): CertificateStore & { rows: Map<string, boolean> } {
  const rows = new Map<string, boolean>();
  const values = new Map<string, string>();
  return {
    rows,
    getPermission: (origin, permission) =>
      rows.get(`${origin}|${permission}`) ?? null,
    setPermission: (origin, permission, allowed) => {
      if (allowed === null) rows.delete(`${origin}|${permission}`);
      else rows.set(`${origin}|${permission}`, allowed);
    },
    getPreference: (key) => values.get(key) ?? null,
    setPreference: (key, value) => void values.set(key, value),
  };
}

describe('CertificateExceptions', () => {
  it('refuses until the user accepts what they were warned about', () => {
    const exceptions = new CertificateExceptions();
    const store = memoryStore();
    expect(exceptions.decide([store], URL_A, AUTHORITY, 'sha256/one')).toBe(
      false,
    );
    exceptions.refuse(URL_A, 'sha256/one', false);
    expect(hasCertificateException(store, URL_A)).toBe(false);
    expect(exceptions.accept(store, URL_A)).toBe(true);
    expect(hasCertificateException(store, URL_A)).toBe(true);
    expect(exceptions.decide([store], URL_A, AUTHORITY, 'sha256/one')).toBe(
      true,
    );
  });

  it('warns again when the site shows a different certificate', () => {
    const exceptions = new CertificateExceptions();
    const store = memoryStore();
    exceptions.refuse(URL_A, 'sha256/one', false);
    exceptions.accept(store, URL_A);
    expect(exceptions.decide([store], URL_A, AUTHORITY, 'sha256/two')).toBe(
      false,
    );
  });

  it('accepts nothing the user was never shown', () => {
    const exceptions = new CertificateExceptions();
    const store = memoryStore();
    expect(exceptions.accept(store, URL_A)).toBe(false);
    expect(hasCertificateException(store, URL_A)).toBe(false);
  });

  it('covers one site: another port or name is a different one', () => {
    const exceptions = new CertificateExceptions();
    const store = memoryStore();
    exceptions.refuse(URL_A, 'sha256/one', false);
    exceptions.accept(store, URL_A);
    for (const other of ['https://nas.test/', 'https://www.nas.test:8443/']) {
      expect(exceptions.decide([store], other, AUTHORITY, 'sha256/one')).toBe(
        false,
      );
    }
  });

  it('stops applying once the site settings row is removed', () => {
    const exceptions = new CertificateExceptions();
    const store = memoryStore();
    exceptions.refuse(URL_A, 'sha256/one', false);
    exceptions.accept(store, URL_A);
    store.setPermission('https://nas.test:8443', 'certificate', null);
    expect(exceptions.decide([store], URL_A, AUTHORITY, 'sha256/one')).toBe(
      false,
    );
  });

  it('never lets a revoked certificate through, even one accepted before', () => {
    const exceptions = new CertificateExceptions();
    const store = memoryStore();
    exceptions.refuse(URL_A, 'sha256/one', false);
    exceptions.accept(store, URL_A);
    expect(
      exceptions.decide([store], URL_A, 'net::ERR_CERT_REVOKED', 'sha256/one'),
    ).toBe(false);
  });

  it('keeps a private window’s choice out of the regular store', () => {
    const exceptions = new CertificateExceptions();
    const regular = memoryStore();
    const inPrivate = memoryStore();
    exceptions.refuse(URL_A, 'sha256/one', false);
    exceptions.accept(inPrivate, URL_A);
    expect(regular.rows.size).toBe(0);
    expect(
      exceptions.decide([inPrivate, regular], URL_A, AUTHORITY, 'sha256/one'),
    ).toBe(true);
    expect(exceptions.decide([regular], URL_A, AUTHORITY, 'sha256/one')).toBe(
      false,
    );
  });

  it('accepts nothing on a site that insists on valid HTTPS', () => {
    const exceptions = new CertificateExceptions();
    const store = memoryStore();
    exceptions.refuse(URL_A, 'sha256/one', true);
    expect(exceptions.locked(URL_A)).toBe(true);
    expect(exceptions.accept(store, URL_A)).toBe(false);
    expect(hasCertificateException(store, URL_A)).toBe(false);
  });

  it('has nothing to do with plain addresses', () => {
    const exceptions = new CertificateExceptions();
    const store = memoryStore();
    expect(
      exceptions.decide([store], 'http://nas.test/', AUTHORITY, 'sha256/one'),
    ).toBe(false);
    expect(exceptions.accept(store, 'http://nas.test/')).toBe(false);
  });
});
