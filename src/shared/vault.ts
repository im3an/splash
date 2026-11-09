/** Saved logins, addresses and cards, as the shell and the main process know them. */

export interface AddressFields {
  label: string;
  name: string;
  organization: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  tel: string;
  email: string;
}

/** A security code is never saved: card rules forbid it, and sites ask each time. */
export interface CardFields {
  name: string;
  number: string;
  expMonth: string;
  expYear: string;
}

/** A login as Settings lists it. Its password stays behind until asked for. */
export interface LoginSummary {
  id: string;
  origin: string;
  username: string;
  updatedAt: number;
}

export interface CardSummary {
  id: string;
  name: string;
  brand: string;
  last4: string;
  expMonth: string;
  expYear: string;
}

export interface VaultListing {
  /** False when macOS's Keychain can't protect them; nothing can be saved. */
  available: boolean;
  logins: LoginSummary[];
  addresses: (AddressFields & { id: string })[];
  cards: CardSummary[];
  /** Saved under a Keychain key this copy of Splash can't get at. */
  unreadable: number;
}

/** One row of the menu under a form field. */
export interface AutofillItem {
  id: string;
  kind: 'login' | 'address' | 'card' | 'generate' | 'manage';
  title: string;
  /** The account's site when it differs from the page, or a detail. */
  detail: string | null;
}

/** What the menu under a form field is told. */
export type AutofillMessage =
  | { type: 'show'; items: AutofillItem[] }
  | { type: 'key'; key: 'up' | 'down' | 'enter' };

/** The offer to keep a login the user just used, shown above the page. */
export interface CredentialPrompt {
  id: string;
  pageId: string | null;
  host: string;
  username: string;
  /** A new password for a login already saved. */
  update: boolean;
}

export type CredentialAnswer = 'save' | 'never' | 'dismiss';

export function cardBrand(number: string): string {
  const digits = number.replace(/\D/g, '');
  if (digits.startsWith('4')) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'American Express';
  if (/^6(011|5)/.test(digits)) return 'Discover';
  if (/^3(0[0-5]|[68])/.test(digits)) return 'Diners Club';
  if (digits.startsWith('35')) return 'JCB';
  return 'Card';
}

/** The check that catches a mistyped card number. */
export function isValidCardNumber(number: string): boolean {
  const digits = number.replace(/[\s-]/g, '');
  if (!/^\d{12,19}$/.test(digits)) return false;
  let sum = 0;
  for (let index = 0; index < digits.length; index++) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}
