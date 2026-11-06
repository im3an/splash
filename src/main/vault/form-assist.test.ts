import { DatabaseSync } from 'node:sqlite';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import { SqliteTrailStore } from '../storage/sqlite-trail-store';
import type { FormFieldReport, FormFill } from '../../shared/page-bridge';
import type { AutofillItem, CredentialPrompt } from '../../shared/vault';
import {
  FormAssist,
  type FormAssistOptions,
  type FormSurface,
  type FormTarget,
} from './form-assist';
import { Vault, type Cipher } from './vault';

const cipher: Cipher = {
  available: () => true,
  seal: (text) => Buffer.from(text),
  open: (sealed) => Buffer.from(sealed).toString(),
};

let vault: Vault;
let assist: FormAssist;
let options: FormAssistOptions & {
  showMenu: ReturnType<typeof vi.fn>;
  hideMenu: ReturnType<typeof vi.fn>;
  authorize: ReturnType<typeof vi.fn>;
  neverOffer: ReturnType<typeof vi.fn>;
};
let blocked: Set<string>;

function target(address = 'https://a.test/login') {
  let url = address;
  const fills: FormFill[] = [];
  return {
    fills,
    moveTo: (next: string) => {
      url = next;
    },
    frame: {
      url: () => url,
      alive: () => true,
      fill: (fill: FormFill) => fills.push(fill),
      closed: vi.fn(),
    } satisfies FormTarget,
  };
}

function surface(
  over: Partial<Omit<FormSurface, 'prompt'>> = {},
): FormSurface & {
  prompt: Mock<(prompt: CredentialPrompt | null) => void>;
} {
  return {
    key: 1,
    pageId: 'page',
    canSave: true,
    prompt: vi.fn<(prompt: CredentialPrompt | null) => void>() as never,
    notify: vi.fn(),
    ...over,
  };
}

const field = (over: Partial<FormFieldReport> = {}): FormFieldReport => ({
  group: 'login',
  kind: 'password',
  rect: null,
  username: '',
  ...over,
});

const itemIds = () =>
  (options.showMenu.mock.lastCall?.[0] as { id: string; kind: string }[]).map(
    (item) => item.kind,
  );

beforeEach(() => {
  vi.useFakeTimers();
  let id = 0;
  blocked = new Set();
  vault = new Vault({
    store: new SqliteTrailStore(new DatabaseSync(':memory:')),
    cipher,
    createId: () => `id-${++id}`,
    now: () => 1,
  });
  options = {
    vault,
    enabled: () => true,
    neverOffers: (origin) => blocked.has(origin),
    neverOffer: vi.fn((origin: string) => blocked.add(origin)),
    authorize: vi.fn(async () => true),
    generatePassword: () => 'made-up-password',
    openManager: vi.fn(),
    showMenu: vi.fn<(items: AutofillItem[]) => void>(),
    hideMenu: vi.fn<() => void>(),
    createId: () => `prompt-${++id}`,
  };
  assist = new FormAssist(options);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the menu under a field', () => {
  it('stays shut with nothing to offer', () => {
    expect(assist.ask(target().frame, surface(), field())).toBe(false);
    expect(options.showMenu).not.toHaveBeenCalled();
  });

  it('stays shut when switched off', () => {
    vault.saveLogin({
      origin: 'https://a.test',
      username: 'me',
      password: 'p',
    });
    options.enabled = () => false;
    expect(assist.ask(target().frame, surface(), field())).toBe(false);
  });

  it('offers a site’s logins, not another’s', () => {
    vault.saveLogin({
      origin: 'https://a.test',
      username: 'me',
      password: 'p',
    });
    vault.saveLogin({
      origin: 'https://b.test',
      username: 'other',
      password: 'q',
    });
    expect(assist.ask(target().frame, surface(), field())).toBe(true);
    expect(itemIds()).toEqual(['login', 'manage']);
    expect(JSON.stringify(options.showMenu.mock.lastCall)).not.toContain('"p"');
  });

  it('never shows a password in the menu', () => {
    vault.saveLogin({
      origin: 'https://a.test',
      username: 'me',
      password: 'hunter2',
    });
    assist.ask(target().frame, surface(), field());
    expect(JSON.stringify(options.showMenu.mock.calls)).not.toContain(
      'hunter2',
    );
  });

  it('offers a made-up password on new-password fields', () => {
    assist.ask(target().frame, surface(), field({ kind: 'new-password' }));
    expect(itemIds()).toEqual(['generate', 'manage']);
  });

  it('fills the chosen login', async () => {
    const { id } = vault.saveLogin({
      origin: 'https://a.test',
      username: 'me',
      password: 'secret',
    });
    const t = target();
    assist.ask(t.frame, surface(), field());
    await assist.choose(id);
    expect(t.fills).toEqual([
      { group: 'login', username: 'me', password: 'secret', newPassword: null },
    ]);
    expect(options.hideMenu).toHaveBeenCalled();
  });

  it('fills nothing if the frame moved to another site meanwhile', async () => {
    const { id } = vault.saveLogin({
      origin: 'https://a.test',
      username: 'me',
      password: 'secret',
    });
    const t = target();
    assist.ask(t.frame, surface(), field());
    t.moveTo('https://evil.test/');
    await assist.choose(id);
    expect(t.fills).toEqual([]);
  });

  it('won’t fill an item the page wasn’t offered', async () => {
    const { id } = vault.saveLogin({
      origin: 'https://other.test',
      username: 'me',
      password: 'secret',
    });
    const t = target();
    vault.saveLogin({ origin: 'https://a.test', username: 'x', password: 'y' });
    assist.ask(t.frame, surface(), field());
    await assist.choose(id);
    expect(t.fills).toEqual([]);
  });

  it('ignores a choice with no menu open', async () => {
    const { id } = vault.saveLogin({
      origin: 'https://a.test',
      username: 'me',
      password: 'p',
    });
    await assist.choose(id);
    expect(options.hideMenu).not.toHaveBeenCalled();
  });

  it('saves a made-up password before filling it', async () => {
    const t = target();
    const s = surface();
    assist.ask(t.frame, s, field({ kind: 'new-password', username: 'me' }));
    await assist.choose('generate');
    expect(vault.findLogin('https://a.test', 'me')?.password).toBe(
      'made-up-password',
    );
    expect(t.fills[0]).toMatchObject({ newPassword: 'made-up-password' });
    expect(s.notify).toHaveBeenCalledWith({
      kind: 'password-saved',
      host: 'a.test',
    });
  });

  it('keeps nothing from a private window', async () => {
    const t = target();
    assist.ask(
      t.frame,
      surface({ canSave: false }),
      field({ kind: 'new-password' }),
    );
    await assist.choose('generate');
    expect(vault.logins()).toEqual([]);
    expect(t.fills[0]).toMatchObject({ newPassword: 'made-up-password' });
  });

  it('asks before filling a card, and refuses on plain HTTP', async () => {
    const id = vault.saveCard({
      name: 'A',
      number: '4242424242424242',
      expMonth: '12',
      expYear: '2030',
    });
    const report = field({ group: 'card', kind: 'cc-number' });
    expect(assist.ask(target('http://a.test/').frame, surface(), report)).toBe(
      false,
    );
    const t = target();
    assist.ask(t.frame, surface(), report);
    options.authorize.mockResolvedValueOnce(false);
    await assist.choose(id);
    expect(t.fills).toEqual([]);
    assist.ask(t.frame, surface(), report);
    await assist.choose(id);
    expect(t.fills).toHaveLength(1);
  });

  it('offers no card on a site used despite its certificate', async () => {
    const id = vault.saveCard({
      name: 'A',
      number: '4242424242424242',
      expMonth: '12',
      expYear: '2030',
    });
    const report = field({ group: 'card', kind: 'cc-number' });
    const t = target();
    assist.ask(t.frame, surface(), report);
    // The exception arrives while the menu is up: choosing still fills nothing.
    Object.assign(options, { certificateException: () => true });
    await assist.choose(id);
    expect(t.fills).toEqual([]);
    expect(assist.ask(t.frame, surface(), report)).toBe(false);
  });

  it('fills an address', async () => {
    const id = vault.saveAddress({
      label: 'Home',
      name: 'A',
      organization: '',
      street: '1 Main',
      city: 'Berlin',
      region: '',
      postalCode: '1',
      country: 'DE',
      tel: '',
      email: '',
    });
    const t = target();
    assist.ask(t.frame, surface(), field({ group: 'address', kind: 'city' }));
    await assist.choose(id);
    expect(t.fills[0]).toMatchObject({ group: 'address' });
  });

  it('sends Manage to Settings', async () => {
    vault.saveLogin({
      origin: 'https://a.test',
      username: 'me',
      password: 'p',
    });
    const t = target();
    assist.ask(t.frame, surface(), field());
    await assist.choose('manage');
    expect(options.openManager).toHaveBeenCalled();
    expect(t.frame.closed).toHaveBeenCalled();
    expect(t.fills).toEqual([]);
  });
});

describe('offering to keep a login', () => {
  const credentials = { username: 'me', password: 'secret' };

  it('waits, then asks; Save keeps it', () => {
    const s = surface();
    assist.submitted(target().frame, s, credentials);
    expect(s.prompt).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1600);
    const prompt = s.prompt.mock.lastCall?.[0];
    expect(prompt).toMatchObject({
      host: 'a.test',
      username: 'me',
      update: false,
    });
    expect(JSON.stringify(prompt)).not.toContain('secret');
    assist.answer(prompt!.id, 'save');
    expect(vault.findLogin('https://a.test', 'me')?.password).toBe('secret');
    expect(s.notify).toHaveBeenCalled();
    expect(s.prompt).toHaveBeenLastCalledWith(null);
  });

  it('doesn’t ask when a refused sign-in brought the form back', () => {
    const s = surface();
    assist.submitted(target().frame, s, credentials);
    assist.stillLogin(s);
    vi.advanceTimersByTime(5000);
    expect(s.prompt).not.toHaveBeenCalled();
  });

  it('takes the offer back if it was showing', () => {
    const s = surface();
    assist.submitted(target().frame, s, credentials);
    vi.advanceTimersByTime(1600);
    assist.stillLogin(s);
    expect(s.prompt).toHaveBeenLastCalledWith(null);
    expect(vault.logins()).toEqual([]);
  });

  it('says nothing when it’s already saved', () => {
    vault.saveLogin({ origin: 'https://a.test', ...credentials });
    const s = surface();
    assist.submitted(target().frame, s, credentials);
    vi.advanceTimersByTime(5000);
    expect(s.prompt).not.toHaveBeenCalled();
  });

  it('offers to update a changed password', () => {
    vault.saveLogin({
      origin: 'https://a.test',
      ...credentials,
      password: 'old',
    });
    const s = surface();
    assist.submitted(target().frame, s, credentials);
    vi.advanceTimersByTime(1600);
    expect(s.prompt.mock.lastCall?.[0]).toMatchObject({ update: true });
  });

  it('names a made-up password saved before the name was known', () => {
    vault.saveLogin({
      origin: 'https://a.test',
      username: '',
      password: 'secret',
    });
    const s = surface();
    assist.submitted(target().frame, s, credentials);
    vi.advanceTimersByTime(5000);
    expect(s.prompt).not.toHaveBeenCalled();
    expect(vault.logins().map((login) => login.username)).toEqual(['me']);
  });

  it('never again means never again', () => {
    const s = surface();
    assist.submitted(target().frame, s, credentials);
    vi.advanceTimersByTime(1600);
    assist.answer(s.prompt.mock.lastCall![0]!.id, 'never');
    expect(options.neverOffer).toHaveBeenCalledWith('https://a.test');
    expect(vault.logins()).toEqual([]);
    const later = surface();
    assist.submitted(target().frame, later, credentials);
    vi.advanceTimersByTime(5000);
    expect(later.prompt).not.toHaveBeenCalled();
  });

  it('forgets it on Not Now', () => {
    const s = surface();
    assist.submitted(target().frame, s, credentials);
    vi.advanceTimersByTime(1600);
    const { id } = s.prompt.mock.lastCall![0]!;
    assist.answer(id, 'dismiss');
    assist.answer(id, 'save');
    expect(vault.logins()).toEqual([]);
  });

  it('doesn’t ask in a private window, or for a local page', () => {
    const quiet = surface({ canSave: false });
    assist.submitted(target().frame, quiet, credentials);
    const local = surface();
    assist.submitted(target('file:///x.html').frame, local, credentials);
    vi.advanceTimersByTime(5000);
    expect(quiet.prompt).not.toHaveBeenCalled();
    expect(local.prompt).not.toHaveBeenCalled();
  });
});
