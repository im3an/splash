// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  credentialsIn,
  fillScope,
  installFormAssist,
  isVisibleField,
  type FormAssistBridge,
} from './form-assist';
import type { FormFill } from '../shared/page-bridge';

/** jsdom lays nothing out, so everything needs a size to count as visible. */
beforeEach(() => {
  document.body.innerHTML = '';
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(
    () => [{}] as unknown as DOMRectList,
  );
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () => ({ x: 1, y: 2, width: 100, height: 20 }) as DOMRect,
  );
});

const LOGIN = `<form id="f">
  <input id="u" name="email" type="email">
  <input id="p" name="password" type="password">
  <button id="b">Sign in</button>
</form>`;

const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const scope = () => document.getElementById('f') as HTMLFormElement;

const login = (over: Partial<Extract<FormFill, { group: 'login' }>> = {}) =>
  ({
    group: 'login',
    username: 'me@a.test',
    password: 'secret',
    newPassword: null,
    ...over,
  }) satisfies FormFill;

describe('fillScope', () => {
  it('fills a login and tells the page’s scripts', () => {
    document.body.innerHTML = LOGIN;
    const seen: string[] = [];
    input('p').addEventListener('input', () => seen.push('input'));
    input('p').addEventListener('change', () => seen.push('change'));
    expect(fillScope(scope(), login(), null)).toBe(2);
    expect(input('u').value).toBe('me@a.test');
    expect(input('p').value).toBe('secret');
    expect(seen).toEqual(['input', 'change']);
  });

  it('never fills a field a person can’t see', () => {
    document.body.innerHTML = `<form id="f">
      <input id="u" type="email">
      <input id="p" type="password">
      <input id="hide1" type="password" name="p2" style="display:none">
      <input id="hide2" type="text" name="username" style="visibility:hidden">
      <div style="opacity:0"><input id="hide3" type="password" name="p3"></div>
      <input id="ro" type="password" name="p4" readonly>
      <input id="off" type="password" name="p5" disabled>
    </form>`;
    fillScope(scope(), login(), null);
    for (const id of ['hide1', 'hide2', 'hide3', 'ro', 'off']) {
      expect(input(id).value).toBe('');
    }
    expect(input('p').value).toBe('secret');
  });

  it('puts a made-up password only in fields asking for a new one', () => {
    document.body.innerHTML = `<form id="f">
      <input id="old" type="password" autocomplete="current-password">
      <input id="n1" type="password" autocomplete="new-password">
      <input id="n2" type="password" name="confirm_password">
    </form>`;
    fillScope(
      scope(),
      login({ username: null, password: null, newPassword: 'generated' }),
      null,
    );
    expect(input('old').value).toBe('');
    expect(input('n1').value).toBe('generated');
    expect(input('n2').value).toBe('generated');
  });

  const address = {
    name: 'Ada Lovelace',
    organization: 'Org',
    street: 'Hauptstr. 1',
    city: 'Berlin',
    region: 'BE',
    postalCode: '10115',
    country: 'Germany',
    tel: '+49 30 1',
    email: 'ada@a.test',
  };

  it('fills an address, leaves what’s typed, and picks the country', () => {
    document.body.innerHTML = `<form id="f">
      <input id="first" name="vorname">
      <input id="last" name="nachname">
      <input id="street" name="strasse" value="typed already">
      <input id="zip" name="plz">
      <input id="city" name="ort">
      <input id="pw" type="text" name="comment">
      <select id="country" name="land">
        <option value="">-</option><option value="FR">France</option><option value="DE">Germany</option>
      </select>
    </form>`;
    fillScope(scope(), { group: 'address', address }, null);
    expect(input('first').value).toBe('Ada');
    expect(input('last').value).toBe('Lovelace');
    expect(input('street').value).toBe('typed already');
    expect(input('zip').value).toBe('10115');
    expect(input('city').value).toBe('Berlin');
    expect(input('pw').value).toBe('');
    expect(
      (document.getElementById('country') as HTMLSelectElement).value,
    ).toBe('DE');
  });

  it('keeps an address out of a login form and a card out of an address', () => {
    document.body.innerHTML = LOGIN;
    expect(fillScope(scope(), { group: 'address', address }, null)).toBe(0);
    document.body.innerHTML = `<form id="f"><input id="city" name="city"></form>`;
    expect(
      fillScope(
        scope(),
        {
          group: 'card',
          card: {
            name: 'A',
            number: '4242424242424242',
            expMonth: '12',
            expYear: '2030',
          },
        },
        null,
      ),
    ).toBe(0);
  });

  it('fills a card but never the security code', () => {
    document.body.innerHTML = `<form id="f">
      <input id="num" autocomplete="cc-number">
      <input id="exp" name="expiry" maxlength="5">
      <input id="cvc" name="cvc">
    </form>`;
    fillScope(
      scope(),
      {
        group: 'card',
        card: {
          name: 'A',
          number: '4242 4242 4242 4242',
          expMonth: '3',
          expYear: '2030',
        },
      },
      null,
    );
    expect(input('num').value).toBe('4242424242424242');
    expect(input('exp').value).toBe('03/30');
    expect(input('cvc').value).toBe('');
  });
});

describe('credentialsIn', () => {
  it('finds the name and the password', () => {
    document.body.innerHTML = LOGIN;
    input('u').value = 'me@a.test';
    input('p').value = 'secret';
    expect(credentialsIn(scope(), '')).toMatchObject({
      username: 'me@a.test',
      password: 'secret',
    });
  });

  it('uses the name from an earlier step', () => {
    document.body.innerHTML = `<form id="f"><input id="p" type="password"></form>`;
    input('p').value = 'secret';
    expect(credentialsIn(scope(), 'earlier')?.username).toBe('earlier');
  });

  it('takes the new password when changing one', () => {
    document.body.innerHTML = `<form id="f">
      <input id="a" type="password"><input id="b" type="password"><input id="c" type="password">
    </form>`;
    input('a').value = 'old';
    input('b').value = 'new';
    input('c').value = 'new';
    expect(credentialsIn(scope(), '')?.password).toBe('new');
  });

  it('has nothing to say about a form with no password', () => {
    document.body.innerHTML = `<form id="f"><input id="q" value="x"></form>`;
    expect(credentialsIn(scope(), '')).toBeNull();
  });
});

describe('isVisibleField', () => {
  it('refuses a tiny field', () => {
    document.body.innerHTML = LOGIN;
    vi.spyOn(input('u'), 'getBoundingClientRect').mockReturnValue({
      width: 1,
      height: 1,
    } as DOMRect);
    expect(isVisibleField(input('u'))).toBe(false);
  });
});

describe('installFormAssist', () => {
  const bridge = (): FormAssistBridge & {
    [K in keyof FormAssistBridge]: ReturnType<typeof vi.fn>;
  } => ({
    ask: vi.fn(async () => true),
    dismiss: vi.fn<() => void>(),
    key: vi.fn<(key: 'up' | 'down' | 'enter') => void>(),
    submitted:
      vi.fn<(credentials: { username: string; password: string }) => void>(),
    stillLogin: vi.fn<() => void>(),
  });

  /** jsdom can't make a trusted event, so these tests count them all as real. */
  const real = () => true;
  const click = (target: EventTarget) =>
    target.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );

  it('ignores clicks a page made up', async () => {
    document.body.innerHTML = LOGIN;
    const b = bridge();
    installFormAssist(b);
    input('u').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(b.ask).not.toHaveBeenCalled();
  });

  it('asks once per visit to a field, with no field values but the name', async () => {
    document.body.innerHTML = LOGIN;
    const b = bridge();
    installFormAssist(b, document, real);
    input('u').value = 'me';
    click(input('p'));
    expect(b.ask).toHaveBeenCalledTimes(1);
    expect(b.ask.mock.calls[0]?.[0]).toMatchObject({
      group: 'login',
      kind: 'password',
      username: 'me',
    });
    await Promise.resolve();
    await Promise.resolve();
    // Open: the same field doesn't ask again, and keys go to the menu.
    click(input('p'));
    expect(b.ask).toHaveBeenCalledTimes(1);
    const down = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      cancelable: true,
      bubbles: true,
    });
    input('p').dispatchEvent(down);
    expect(b.key).toHaveBeenCalledWith('down');
    expect(down.defaultPrevented).toBe(true);
    input('p').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    expect(b.dismiss).toHaveBeenCalledTimes(1);
  });

  it('asks nothing of a filled field or one it doesn’t understand', () => {
    document.body.innerHTML = `<form id="f"><input id="c" name="comment"><input id="e" type="email" value="x"></form>`;
    const b = bridge();
    installFormAssist(b, document, real);
    click(input('c'));
    click(input('e'));
    expect(b.ask).not.toHaveBeenCalled();
  });

  it('reports a sign-in only once its form has gone', () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML = LOGIN;
      const b = bridge();
      installFormAssist(b);
      input('u').value = 'me';
      input('p').value = 'secret';
      scope().dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
      expect(b.submitted).not.toHaveBeenCalled();
      scope().remove();
      vi.advanceTimersByTime(1300);
      expect(b.submitted).toHaveBeenCalledWith({
        username: 'me',
        password: 'secret',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('says nothing when the form is still there, filled in', () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML = LOGIN;
      const b = bridge();
      installFormAssist(b);
      input('p').value = 'wrong';
      scope().dispatchEvent(new Event('submit', { bubbles: true }));
      vi.advanceTimersByTime(1300);
      expect(b.submitted).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports at once when leaving the page', () => {
    document.body.innerHTML = LOGIN;
    const b = bridge();
    installFormAssist(b);
    input('p').value = 'secret';
    scope().dispatchEvent(new Event('submit', { bubbles: true }));
    window.dispatchEvent(new Event('pagehide'));
    expect(b.submitted).toHaveBeenCalledOnce();
    window.dispatchEvent(new Event('pagehide'));
    expect(b.submitted).toHaveBeenCalledOnce();
  });

  it('remembers the name from a first screen for the next', () => {
    document.body.innerHTML = `<form id="f"><input id="u" type="email" autocomplete="username"></form>`;
    const b = bridge();
    installFormAssist(b);
    input('u').value = 'first@step.test';
    scope().dispatchEvent(new Event('submit', { bubbles: true }));
    document.body.innerHTML = `<form id="f"><input id="p" type="password"></form>`;
    input('p').value = 'secret';
    scope().dispatchEvent(new Event('submit', { bubbles: true }));
    window.dispatchEvent(new Event('pagehide'));
    expect(b.submitted).toHaveBeenCalledWith({
      username: 'first@step.test',
      password: 'secret',
    });
  });

  it('fills the field it asked about, and only its form', () => {
    document.body.innerHTML = `${LOGIN}<form id="other"><input id="u2" type="email"><input id="p2" type="password"></form>`;
    const b = bridge();
    const assist = installFormAssist(b, document, real);
    click(input('p'));
    assist.fill(login());
    expect(input('p').value).toBe('secret');
    expect(input('p2').value).toBe('');
  });
});
