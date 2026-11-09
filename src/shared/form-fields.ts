/*
 * Works out what a form field is for, from what the page says about it. Used
 * in the page's preload, so no zod and nothing from the main process.
 */

export type FieldKind =
  | 'username'
  | 'password'
  | 'new-password'
  | 'name'
  | 'given-name'
  | 'family-name'
  | 'organization'
  | 'street'
  | 'address-line1'
  | 'address-line2'
  | 'city'
  | 'region'
  | 'postal-code'
  | 'country'
  | 'tel'
  | 'email'
  | 'cc-name'
  | 'cc-number'
  | 'cc-exp'
  | 'cc-exp-month'
  | 'cc-exp-year';

export type FieldGroup = 'login' | 'address' | 'card';

export function groupOf(kind: FieldKind): FieldGroup {
  if (kind === 'username' || kind === 'password' || kind === 'new-password')
    return 'login';
  return kind.startsWith('cc-') ? 'card' : 'address';
}

/** What a page declares about a field. */
export interface FieldHints {
  /** Lower case, as `input.type` reports it. */
  type: string;
  autocomplete: string;
  name: string;
  id: string;
  placeholder: string;
  ariaLabel: string;
  label: string;
}

const AUTOCOMPLETE: Record<string, FieldKind> = {
  username: 'username',
  'current-password': 'password',
  'new-password': 'new-password',
  name: 'name',
  'given-name': 'given-name',
  'family-name': 'family-name',
  organization: 'organization',
  'street-address': 'street',
  'address-line1': 'address-line1',
  'address-line2': 'address-line2',
  'address-level2': 'city',
  'address-level1': 'region',
  'postal-code': 'postal-code',
  country: 'country',
  'country-name': 'country',
  tel: 'tel',
  'tel-national': 'tel',
  email: 'email',
  'cc-name': 'cc-name',
  'cc-number': 'cc-number',
  'cc-exp': 'cc-exp',
  'cc-exp-month': 'cc-exp-month',
  'cc-exp-year': 'cc-exp-year',
};

/** Field types that never hold what Splash fills. */
const NEVER = new Set([
  'hidden',
  'checkbox',
  'radio',
  'file',
  'submit',
  'button',
  'reset',
  'image',
  'range',
  'color',
  'date',
  'time',
  'datetime-local',
  'week',
  'search',
]);

/** Checked in order, so the more specific come first. English and German. */
const PATTERNS: readonly [RegExp, FieldKind][] = [
  [/card.?(holder|name)|name.?on.?card|karten.?inhaber|cc.?name/, 'cc-name'],
  [
    /card.?(number|no\b|num)|cc.?(num|no\b)|karten.?(nummer|nr)|pan\b/,
    'cc-number',
  ],
  [
    /(exp|valid|ablauf|gueltig|gültig).*(month|monat|\bmm\b)|cc.?month/,
    'cc-exp-month',
  ],
  [
    /(exp|valid|ablauf|gueltig|gültig).*(year|jahr|\byy\b)|cc.?year/,
    'cc-exp-year',
  ],
  [
    /expir|exp.?date|valid.?(thru|until)|gültig.?bis|gueltig.?bis|ablaufdatum|cc.?exp/,
    'cc-exp',
  ],
  [/first.?name|given.?name|fname|vorname/, 'given-name'],
  [
    /last.?name|family.?name|surname|lname|nachname|familienname/,
    'family-name',
  ],
  [/full.?name|your.?name|^name$|^ihr.?name$|vollständiger.?name/, 'name'],
  [/company|organi[sz]ation|firma|unternehmen/, 'organization'],
  [
    /address.?(line)?.?2|addr.?2|adresszusatz|apartment|\bapt\b|suite/,
    'address-line2',
  ],
  [/address.?(line)?.?1|addr.?1/, 'address-line1'],
  [
    /street|straße|strasse|anschrift|^address$|^adresse$|billing.?address|shipping.?address/,
    'street',
  ],
  [/zip|post.?code|postal|plz|postleitzahl/, 'postal-code'],
  [/\bcity\b|town|\bort\b|stadt|wohnort/, 'city'],
  [/state|province|region|bundesland/, 'region'],
  [/country|\bland\b|staat/, 'country'],
  [/phone|mobile|\btel\b|telefon|handy/, 'tel'],
  [/e.?mail/, 'email'],
];

const USERNAME =
  /user.?(name|id)|login.?(name|id)?|benutzer|anmelde|account.?(name|id)|^id$|signin/;

function haystack({ name, id, placeholder, ariaLabel, label }: FieldHints) {
  return [name, id, placeholder, ariaLabel, label]
    .join(' ')
    .toLowerCase()
    .trim();
}

/**
 * What a field is for, or `null` if it's nothing Splash fills. `inLoginForm`
 * says whether its form also asks for a password, where an email or plain text
 * field is the account's name rather than part of an address.
 */
export function classifyField(
  hints: FieldHints,
  inLoginForm: boolean,
): FieldKind | null {
  const type = hints.type;
  if (NEVER.has(type)) return null;

  // A page's own statement beats guessing. Sections and "billing" come first.
  const tokens = hints.autocomplete.toLowerCase().trim().split(/\s+/);
  const declared = tokens[tokens.length - 1] ?? '';
  if (declared === 'off' || declared === 'one-time-code') {
    if (declared === 'one-time-code') return null;
  } else if (AUTOCOMPLETE[declared]) {
    const kind = AUTOCOMPLETE[declared];
    if (kind === 'email' && inLoginForm) return 'username';
    return kind;
  }

  const words = haystack(hints);

  if (type === 'password') {
    if (/one.?time|otp|\bpin\b|\bcvc\b|\bcvv\b|\bcsc\b/.test(words))
      return null;
    return /new|confirm|repeat|neu|wiederhol|bestätig|create|choose|sign.?up|regist/.test(
      words,
    )
      ? 'new-password'
      : 'password';
  }

  // A code the site asks for each time, and search boxes, aren't for filling.
  if (
    /\bcvc\b|\bcvv\b|\bcsc\b|security.?code|prüf(ziffer|nummer)|otp|one.?time|captcha|coupon|gutschein|\bsearch\b|\bsuche\b/.test(
      words,
    )
  ) {
    return null;
  }

  if (inLoginForm) {
    if (type === 'email' || /e.?mail/.test(words) || USERNAME.test(words))
      return 'username';
    if (type === 'text' || type === '') return 'username';
    return null;
  }
  if (type === 'email') return 'email';
  if (type === 'tel' && !/card|karte/.test(words)) return 'tel';
  if (type === 'number' && !/card|karte|exp|zip|plz|post/.test(words))
    return null;
  for (const [pattern, kind] of PATTERNS) {
    if (pattern.test(words)) return kind;
  }
  return USERNAME.test(words) ? 'username' : null;
}

/** The values a saved address gives each kind of field. */
export function addressValue(
  kind: FieldKind,
  address: {
    name: string;
    organization: string;
    street: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
    tel: string;
    email: string;
  },
): string | null {
  const parts = address.name.trim().split(/\s+/);
  const [line1 = '', ...others] = address.street.split('\n');
  switch (kind) {
    case 'name':
      return address.name;
    case 'given-name':
      return parts.slice(0, -1).join(' ') || (parts[0] ?? '');
    case 'family-name':
      return parts.length > 1 ? (parts[parts.length - 1] ?? '') : '';
    case 'organization':
      return address.organization;
    case 'street':
      return address.street;
    case 'address-line1':
      return line1;
    case 'address-line2':
      return others.join(' ');
    case 'city':
      return address.city;
    case 'region':
      return address.region;
    case 'postal-code':
      return address.postalCode;
    case 'country':
      return address.country;
    case 'tel':
      return address.tel;
    case 'email':
      return address.email;
    default:
      return null;
  }
}

/** The values a saved card gives each kind of field. */
export function cardValue(
  kind: FieldKind,
  card: { name: string; number: string; expMonth: string; expYear: string },
  maxLength: number,
): string | null {
  const month = card.expMonth.padStart(2, '0');
  const year = card.expYear.length === 2 ? `20${card.expYear}` : card.expYear;
  switch (kind) {
    case 'cc-name':
      return card.name;
    case 'cc-number':
      return card.number.replace(/[\s-]/g, '');
    case 'cc-exp-month':
      return month;
    case 'cc-exp-year':
      return maxLength === 2 ? year.slice(-2) : year;
    case 'cc-exp':
      // MM/YY unless the field has room for, or asks for, the full year.
      return maxLength >= 7 ? `${month}/${year}` : `${month}/${year.slice(-2)}`;
    default:
      return null;
  }
}

/** Finds the `<select>` option a value means, by its value or its words. */
export function matchOption(
  options: readonly { value: string; text: string }[],
  wanted: string,
): string | null {
  const target = wanted.trim().toLowerCase();
  if (!target) return null;
  const numeric = /^\d+$/.test(target) ? Number(target) : null;
  for (const option of options) {
    const value = option.value.trim().toLowerCase();
    const text = option.text.trim().toLowerCase();
    if (value === target || text === target) return option.value;
    if (numeric !== null && Number(value) === numeric && value !== '')
      return option.value;
    if (numeric !== null && Number(text) === numeric && text !== '')
      return option.value;
  }
  // "Germany" under "Germany (DE)", or a year written in full.
  for (const option of options) {
    const text = option.text.trim().toLowerCase();
    if (target.length >= 3 && text.startsWith(target)) return option.value;
  }
  return null;
}
