import { describe, expect, it } from 'vitest';
import {
  addressValue,
  cardValue,
  classifyField,
  groupOf,
  matchOption,
  type FieldHints,
} from './form-fields';

const field = (hints: Partial<FieldHints>): FieldHints => ({
  type: 'text',
  autocomplete: '',
  name: '',
  id: '',
  placeholder: '',
  ariaLabel: '',
  label: '',
  ...hints,
});

describe('classifyField', () => {
  it.each([
    [{ autocomplete: 'section-a shipping postal-code' }, 'postal-code'],
    [{ autocomplete: 'cc-number' }, 'cc-number'],
    [{ autocomplete: 'new-password', type: 'password' }, 'new-password'],
    [{ name: 'plz' }, 'postal-code'],
    [{ name: 'vorname' }, 'given-name'],
    [{ label: 'Nachname' }, 'family-name'],
    [{ name: 'strasse' }, 'street'],
    [{ label: 'Straße und Hausnummer' }, 'street'],
    [{ name: 'billing_address_1' }, 'address-line1'],
    [{ label: 'Stadt' }, 'city'],
    [{ placeholder: 'Telefon' }, 'tel'],
    [{ type: 'tel' }, 'tel'],
    [{ type: 'email' }, 'email'],
    [{ name: 'cardNumber' }, 'cc-number'],
    [{ label: 'Kartennummer' }, 'cc-number'],
    [{ name: 'card_holder' }, 'cc-name'],
    [{ name: 'expiry' }, 'cc-exp'],
    [{ name: 'exp-month' }, 'cc-exp-month'],
    [{ name: 'exp_year' }, 'cc-exp-year'],
    [{ type: 'password', name: 'pwd' }, 'password'],
    [{ type: 'password', name: 'confirm_password' }, 'new-password'],
    [{ name: 'username' }, 'username'],
  ])('reads %j as %s', (hints, kind) => {
    expect(classifyField(field(hints), false)).toBe(kind);
  });

  it('takes an email or text field in a login form for the account name', () => {
    expect(classifyField(field({ type: 'email' }), true)).toBe('username');
    expect(classifyField(field({ autocomplete: 'email' }), true)).toBe(
      'username',
    );
    expect(classifyField(field({ name: 'whatever' }), true)).toBe('username');
  });

  it.each([
    [{ type: 'hidden', name: 'email' }],
    [{ type: 'checkbox', name: 'email' }],
    [{ type: 'search', name: 'city' }],
    [{ name: 'cvv' }],
    [{ type: 'password', name: 'cvc' }],
    [{ label: 'Security code' }],
    [{ autocomplete: 'one-time-code' }],
    [{ name: 'otp' }],
    [{ name: 'q', label: 'Search' }],
    [{ name: 'comment' }],
    [{ type: 'number', name: 'quantity' }],
  ])('leaves %j alone', (hints) => {
    expect(classifyField(field(hints), false)).toBeNull();
  });

  it('groups kinds', () => {
    expect(groupOf('new-password')).toBe('login');
    expect(groupOf('cc-exp')).toBe('card');
    expect(groupOf('city')).toBe('address');
  });
});

describe('values', () => {
  const address = {
    name: 'Ada Maria Lovelace',
    organization: 'Org',
    street: '1 Main St\nFloor 2',
    city: 'Berlin',
    region: 'BE',
    postalCode: '10115',
    country: 'Germany',
    tel: '+49',
    email: 'a@b.test',
  };

  it('splits names and streets', () => {
    expect(addressValue('given-name', address)).toBe('Ada Maria');
    expect(addressValue('family-name', address)).toBe('Lovelace');
    expect(addressValue('address-line1', address)).toBe('1 Main St');
    expect(addressValue('address-line2', address)).toBe('Floor 2');
    expect(addressValue('cc-number', address)).toBeNull();
  });

  it('writes expiry dates as the field wants them', () => {
    const card = {
      name: 'A',
      number: '4242 4242-4242 4242',
      expMonth: '3',
      expYear: '2030',
    };
    expect(cardValue('cc-number', card, -1)).toBe('4242424242424242');
    expect(cardValue('cc-exp', card, 5)).toBe('03/30');
    expect(cardValue('cc-exp', card, -1)).toBe('03/30');
    expect(cardValue('cc-exp', card, 7)).toBe('03/2030');
    expect(cardValue('cc-exp-year', card, 2)).toBe('30');
    expect(cardValue('cc-exp-year', card, -1)).toBe('2030');
    expect(cardValue('cc-exp-month', card, -1)).toBe('03');
    expect(cardValue('city', card, -1)).toBeNull();
  });
});

describe('matchOption', () => {
  const countries = [
    { value: '', text: 'Choose' },
    { value: 'DE', text: 'Germany' },
    { value: 'FR', text: 'France (FR)' },
  ];

  it('finds by value, text and start of text', () => {
    expect(matchOption(countries, 'de')).toBe('DE');
    expect(matchOption(countries, 'Germany')).toBe('DE');
    expect(matchOption(countries, 'france')).toBe('FR');
    expect(matchOption(countries, 'Spain')).toBeNull();
    expect(matchOption(countries, '')).toBeNull();
  });

  it('finds months however they’re numbered', () => {
    const months = [
      { value: '1', text: 'January' },
      { value: '3', text: 'March' },
    ];
    expect(matchOption(months, '03')).toBe('3');
  });
});
