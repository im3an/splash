/** Reads the CSV that browsers and password managers export their logins as. */

export interface ImportedLogin {
  origin: string;
  username: string;
  password: string;
}

export interface LoginCsv {
  logins: ImportedLogin[];
  /** Rows without a usable web address or password. */
  skipped: number;
}

/** RFC 4180, with quoted commas, quotes and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  // A byte-order mark at the start isn't part of the first column's name.
  const input = text.startsWith('﻿') ? text.slice(1) : text;
  for (let index = 0; index < input.length; index++) {
    const character = input[index]!;
    if (quoted) {
      if (character !== '"') {
        field += character;
      } else if (input[index + 1] === '"') {
        field += '"';
        index++;
      } else {
        quoted = false;
      }
    } else if (character === '"' && field === '') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && input[index + 1] === '\n') index++;
      row.push(field);
      field = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }
  row.push(field);
  if (row.some((value) => value !== '')) rows.push(row);
  return rows;
}

const URL_COLUMNS = ['login_uri', 'url', 'website', 'web site', 'hostname'];
const USERNAME_COLUMNS = [
  'login_username',
  'username',
  'user name',
  'user',
  'email',
  'login',
];
const PASSWORD_COLUMNS = ['login_password', 'password', 'pass'];

function column(headers: string[], names: readonly string[]): number {
  for (const name of names) {
    const found = headers.indexOf(name);
    if (found >= 0) return found;
  }
  return -1;
}

/** The web origin in an export's address column, which may be a bare host. */
export function loginOrigin(address: string): string | null {
  const trimmed = address.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.host ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Chrome (`name,url,username,password,note`), Firefox, Safari, Bitwarden and
 * 1Password all put these columns under recognisable names. Returns `null` if
 * the file doesn't look like an export of logins.
 */
export function parseLoginCsv(text: string): LoginCsv | null {
  const [header, ...rows] = parseCsv(text);
  if (!header) return null;
  const headers = header.map((name) => name.trim().toLowerCase());
  const urlColumn = column(headers, URL_COLUMNS);
  const usernameColumn = column(headers, USERNAME_COLUMNS);
  const passwordColumn = column(headers, PASSWORD_COLUMNS);
  if (urlColumn < 0 || passwordColumn < 0) return null;
  const typeColumn = headers.indexOf('type');

  const logins: ImportedLogin[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const row of rows) {
    // Bitwarden's export also lists notes and cards, as other types.
    const type = typeColumn >= 0 ? row[typeColumn]?.trim().toLowerCase() : '';
    const origin = loginOrigin(row[urlColumn] ?? '');
    const password = row[passwordColumn] ?? '';
    if (!origin || !password || (type && type !== 'login')) {
      skipped += 1;
      continue;
    }
    const username = usernameColumn >= 0 ? (row[usernameColumn] ?? '') : '';
    const key = JSON.stringify([origin, username]);
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    logins.push({ origin, username, password });
  }
  return { logins, skipped };
}

function csvField(value: string): string {
  // A leading = or + would run as a formula in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Writes Chrome's format, which every password manager can read. */
export function loginsToCsv(logins: readonly ImportedLogin[]): string {
  const rows = logins.map(({ origin, username, password }) => {
    const name = origin.replace(/^https?:\/\//, '');
    return [name, origin, username, password].map(csvField).join(',');
  });
  return ['name,url,username,password', ...rows, ''].join('\n');
}
