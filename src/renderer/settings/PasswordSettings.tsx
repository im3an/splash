import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Copy, Eye, EyeOff, Pencil, Plus, Trash2 } from '../icons';
import {
  isValidCardNumber,
  type AddressFields,
  type CardFields,
  type CardSummary,
  type LoginSummary,
  type VaultListing,
} from '../../shared/vault';
import { api } from '../splash-api';
import { hostOf } from '../lib/format';
import { Button, Row, Section, Toggle } from './controls';
import { useSettingsNavigation } from './navigation';
import { usePreferences } from './sections';

const FIELD =
  'h-7 w-full min-w-0 rounded-control bg-field px-2 text-small text-fg outline-none placeholder:text-fg-subtle focus-visible:shadow-focus';

function TextField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  autoFocus,
  monospace,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  type?: string;
  placeholder?: string;
  autoFocus?: boolean;
  monospace?: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-small text-fg-muted">
      {label}
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
        className={monospace ? `${FIELD} font-mono` : FIELD}
      />
    </label>
  );
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** A form's own buttons and what stopped it, along its foot. */
function FormFoot({
  problem,
  onCancel,
  saveLabel = 'Save',
}: {
  problem: string | null;
  onCancel(): void;
  saveLabel?: string;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      {problem && (
        <p role="alert" className="mr-auto text-small text-danger">
          {problem}
        </p>
      )}
      <Button onClick={onCancel}>Cancel</Button>
      <Button tone="primary" type="submit">
        {saveLabel}
      </Button>
    </div>
  );
}

const webOriginOf = (typed: string): string | null => {
  const text = typed.trim();
  if (!text) return null;
  try {
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`,
    );
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.origin
      : null;
  } catch {
    return null;
  }
};

function LoginForm({
  initial,
  password: known,
  onDone,
}: {
  initial: LoginSummary | null;
  password: string;
  onDone(saved: boolean): void;
}) {
  const [site, setSite] = useState(initial?.origin ?? '');
  const [username, setUsername] = useState(initial?.username ?? '');
  const [password, setPassword] = useState(known);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const origin = webOriginOf(site);
    if (!origin) return setProblem('Enter the site’s address.');
    if (!password) return setProblem('Enter a password.');
    try {
      await api().saveLogin({
        ...(initial ? { id: initial.id } : {}),
        origin,
        username,
        password,
      });
      onDone(true);
    } catch {
      setProblem('It couldn’t be saved.');
    }
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-3 px-4 py-3"
    >
      <div className="grid grid-cols-3 gap-3">
        <TextField
          label="Site"
          value={site}
          onChange={setSite}
          placeholder="example.com"
          autoFocus={!initial}
        />
        <TextField label="Username" value={username} onChange={setUsername} />
        <TextField
          label="Password"
          type="password"
          value={password}
          onChange={setPassword}
          autoFocus={!!initial}
        />
      </div>
      <FormFoot problem={problem} onCancel={() => onDone(false)} />
    </form>
  );
}

function LoginRow({
  login,
  onEdit,
  onDelete,
  say,
}: {
  login: LoginSummary;
  onEdit(password: string): void;
  onDelete(): void;
  say(message: string): void;
}) {
  const [shown, setShown] = useState<string | null>(null);
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 px-4 py-2">
      <div className="min-w-0">
        <p className="truncate">{hostOf(login.origin)}</p>
        <p className="truncate text-small text-fg-subtle">
          {login.username || 'No username'}
          {shown !== null && (
            <>
              {' · '}
              <span className="font-mono text-fg-muted select-text">
                {shown}
              </span>
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <IconAction
          label={shown === null ? 'Show password' : 'Hide password'}
          onClick={() => {
            if (shown !== null) return setShown(null);
            void api()
              .revealPassword(login.id)
              .then((password) => {
                if (password !== null) setShown(password);
              });
          }}
        >
          {shown === null ? <Eye size={16} /> : <EyeOff size={16} />}
        </IconAction>
        <IconAction
          label="Copy password"
          onClick={() =>
            void api()
              .copyPassword(login.id)
              .then((copied) => {
                if (copied)
                  say(`Copied the password for ${hostOf(login.origin)}.`);
              })
          }
        >
          <Copy size={16} />
        </IconAction>
        <IconAction
          label="Edit"
          onClick={() =>
            void api()
              .revealPassword(login.id)
              .then((password) => {
                if (password !== null) onEdit(password);
              })
          }
        >
          <Pencil size={16} />
        </IconAction>
        <IconAction label="Remove" onClick={onDelete}>
          <Trash2 size={16} />
        </IconAction>
      </div>
    </div>
  );
}

const EMPTY_ADDRESS: AddressFields = {
  label: '',
  name: '',
  organization: '',
  street: '',
  city: '',
  region: '',
  postalCode: '',
  country: '',
  tel: '',
  email: '',
};

function AddressForm({
  initial,
  id,
  onDone,
}: {
  initial: AddressFields;
  id?: string;
  onDone(saved: boolean): void;
}) {
  const [fields, setFields] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const field = (key: keyof AddressFields) => ({
    value: fields[key],
    onChange: (value: string) => setFields({ ...fields, [key]: value }),
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!fields.name.trim() && !fields.street.trim()) {
      return setProblem('Enter at least a name or a street.');
    }
    try {
      await api().saveAddress(fields, id);
      onDone(true);
    } catch {
      setProblem('It couldn’t be saved.');
    }
  };
  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-3 px-4 py-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <TextField label="Full name" autoFocus {...field('name')} />
        <TextField label="Organization" {...field('organization')} />
        <TextField label="Street" {...field('street')} />
        <TextField label="City" {...field('city')} />
        <TextField label="State or region" {...field('region')} />
        <TextField label="Postal code" {...field('postalCode')} />
        <TextField label="Country" {...field('country')} />
        <TextField label="Phone" type="tel" {...field('tel')} />
        <TextField label="Email" type="email" {...field('email')} />
        <TextField
          label="Name for this address"
          placeholder="Home"
          {...field('label')}
        />
      </div>
      <FormFoot problem={problem} onCancel={() => onDone(false)} />
    </form>
  );
}

function CardForm({
  summary,
  onDone,
}: {
  summary: CardSummary | null;
  onDone(saved: boolean): void;
}) {
  const [name, setName] = useState(summary?.name ?? '');
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState(
    summary
      ? `${summary.expMonth.padStart(2, '0')}/${summary.expYear.slice(-2)}`
      : '',
  );
  const [problem, setProblem] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isValidCardNumber(number)) {
      return setProblem('Check the card number.');
    }
    const match = /^\s*(\d{1,2})\s*\/\s*(\d{2}|\d{4})\s*$/.exec(expiry);
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 12) {
      return setProblem('Enter the expiry as MM/YY.');
    }
    const fields: CardFields = {
      name,
      number,
      expMonth: match[1]!,
      expYear: match[2]!.length === 2 ? `20${match[2]}` : match[2]!,
    };
    try {
      await api().saveCard(fields, summary?.id);
      onDone(true);
    } catch {
      setProblem('It couldn’t be saved.');
    }
  };
  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="flex flex-col gap-3 px-4 py-3"
    >
      <div className="grid grid-cols-[2fr_2fr_1fr] gap-3">
        <TextField
          label="Card number"
          value={number}
          onChange={setNumber}
          autoFocus
          monospace
        />
        <TextField label="Name on card" value={name} onChange={setName} />
        <TextField
          label="Expires"
          value={expiry}
          onChange={setExpiry}
          placeholder="MM/YY"
        />
      </div>
      <p className="text-small leading-copy text-fg-subtle">
        The security code isn’t kept. You type it at each checkout.
      </p>
      <FormFoot problem={problem} onCancel={() => onDone(false)} />
    </form>
  );
}

type Editing =
  | { kind: 'login'; login: LoginSummary | null; password: string }
  | { kind: 'address'; id?: string; fields: AddressFields }
  | { kind: 'card'; card: CardSummary | null }
  | null;

/** Logins, addresses and cards, sealed with a key the Keychain holds. */
export function PasswordSettings() {
  const [preferences, update] = usePreferences();
  const go = useSettingsNavigation();
  const [listing, setListing] = useState<VaultListing | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Editing>(null);
  const [status, setStatus] = useState<{
    message: string;
    undo?: string;
  } | null>(null);

  const reload = useCallback(() => {
    void api().listVault().then(setListing);
  }, []);
  useEffect(reload, [reload]);

  const logins = useMemo(() => {
    const words = search.trim().toLowerCase();
    if (!listing) return [];
    return words
      ? listing.logins.filter((login) =>
          `${login.origin} ${login.username}`.toLowerCase().includes(words),
        )
      : listing.logins;
  }, [listing, search]);

  const remove = async (id: string, what: string) => {
    const token = await api().deleteVaultItem(id);
    reload();
    setStatus({
      message: `Removed ${what}.`,
      ...(token ? { undo: token } : {}),
    });
  };
  const done = (saved: boolean) => {
    setEditing(null);
    if (saved) reload();
  };
  const exportAll = async () => {
    try {
      const filename = await api().exportPasswords();
      if (filename) {
        setStatus({
          message: `Saved “${filename}”. Delete it once you’ve used it: its passwords aren’t protected.`,
        });
      }
    } catch {
      setStatus({ message: 'The file couldn’t be saved.' });
    }
  };

  if (!preferences || !listing) return null;
  const { available } = listing;

  return (
    <>
      <Section title="Autofill">
        <Row
          label="Offer to fill forms and save passwords"
          help="A menu appears when you click a field that Splash knows how to fill. Nothing reaches a page until you choose it."
        >
          <Toggle
            label="Offer to fill forms and save passwords"
            checked={preferences.passwordAutofill}
            onChange={(passwordAutofill) => update({ passwordAutofill })}
          />
        </Row>
        {!available && (
          <Row
            label="Saving is off on this Mac"
            help="macOS’s Keychain isn’t available to Splash, and Splash won’t keep these without it. What’s already saved stays as it is."
          />
        )}
        {listing.unreadable > 0 && (
          <Row
            label={`${listing.unreadable} saved item${listing.unreadable === 1 ? '' : 's'} can’t be read`}
            help="They were sealed with a Keychain key this copy of Splash can’t get at, usually after moving to a new Mac or restoring the Keychain. They’re kept in case the key comes back."
          />
        )}
      </Section>

      {status && (
        <p
          role="status"
          className="-mb-4 flex items-center gap-2 text-small text-fg-muted"
        >
          {status.message}
          {status.undo && (
            <button
              type="button"
              className="font-medium text-fg underline-offset-2 hover:underline"
              onClick={() => {
                void api()
                  .undoVaultDelete(status.undo!)
                  .then((restored) => {
                    reload();
                    setStatus(
                      restored
                        ? null
                        : { message: 'Too late to undo; it’s gone.' },
                    );
                  });
              }}
            >
              Undo
            </button>
          )}
        </p>
      )}

      <Section
        title="Passwords"
        description="Encrypted with a key in your Keychain. Showing, copying or exporting one asks for Touch ID."
      >
        {listing.logins.length > 5 && (
          <div className="px-4 py-2.5">
            <input
              type="search"
              aria-label="Search saved passwords"
              placeholder="Search by site or username"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className={FIELD}
            />
          </div>
        )}
        {listing.logins.length === 0 && (
          <Row
            label="No saved passwords yet"
            help="Splash offers to save one after you sign in to a site, or you can bring them from another browser."
          >
            <Button onClick={() => go('transfer')}>Import…</Button>
          </Row>
        )}
        {listing.logins.length > 0 && logins.length === 0 && (
          <Row label={`Nothing matches “${search.trim()}”`} />
        )}
        {logins.map((login) =>
          editing?.kind === 'login' && editing.login?.id === login.id ? (
            <LoginForm
              key={login.id}
              initial={login}
              password={editing.password}
              onDone={done}
            />
          ) : (
            <LoginRow
              key={login.id}
              login={login}
              say={(message) => setStatus({ message })}
              onEdit={(password) =>
                setEditing({ kind: 'login', login, password })
              }
              onDelete={() =>
                void remove(
                  login.id,
                  `the password for ${hostOf(login.origin)}`,
                )
              }
            />
          ),
        )}
        {editing?.kind === 'login' && !editing.login ? (
          <LoginForm initial={null} password="" onDone={done} />
        ) : (
          <div className="flex items-center justify-end gap-2 px-4 py-2.5">
            <Button
              disabled={listing.logins.length === 0}
              onClick={() => void exportAll()}
            >
              Export…
            </Button>
            <Button
              disabled={!available}
              onClick={() =>
                setEditing({ kind: 'login', login: null, password: '' })
              }
            >
              <Plus size={13} />
              Add password
            </Button>
          </div>
        )}
      </Section>

      <Section title="Addresses" description="For shipping and contact forms.">
        {listing.addresses.map((address) =>
          editing?.kind === 'address' && editing.id === address.id ? (
            <AddressForm
              key={address.id}
              id={address.id}
              initial={editing.fields}
              onDone={done}
            />
          ) : (
            <div
              key={address.id}
              className="flex min-h-12 items-center justify-between gap-4 px-4 py-2"
            >
              <div className="min-w-0">
                <p className="truncate">
                  {address.label || address.name || address.street}
                </p>
                <p className="truncate text-small text-fg-subtle">
                  {[
                    address.street.split('\n')[0],
                    address.city,
                    address.country,
                  ]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <IconAction
                  label="Edit"
                  onClick={() => {
                    const { id, ...fields } = address;
                    setEditing({ kind: 'address', id, fields });
                  }}
                >
                  <Pencil size={16} />
                </IconAction>
                <IconAction
                  label="Remove"
                  onClick={() => void remove(address.id, 'the address')}
                >
                  <Trash2 size={16} />
                </IconAction>
              </div>
            </div>
          ),
        )}
        {editing?.kind === 'address' && !editing.id ? (
          <AddressForm initial={EMPTY_ADDRESS} onDone={done} />
        ) : (
          <div className="flex items-center justify-end px-4 py-2.5">
            <Button
              disabled={!available}
              onClick={() =>
                setEditing({ kind: 'address', fields: EMPTY_ADDRESS })
              }
            >
              <Plus size={13} />
              Add address
            </Button>
          </div>
        )}
      </Section>

      <Section
        title="Cards"
        description="Filling a card asks for Touch ID, and only happens on secure sites."
      >
        {listing.cards.map((card) =>
          editing?.kind === 'card' && editing.card?.id === card.id ? (
            <CardForm key={card.id} summary={card} onDone={done} />
          ) : (
            <div
              key={card.id}
              className="flex min-h-12 items-center justify-between gap-4 px-4 py-2"
            >
              <div className="min-w-0">
                <p className="truncate">
                  {card.brand} ending {card.last4}
                </p>
                <p className="truncate text-small text-fg-subtle">
                  {card.name ? `${card.name} · ` : ''}
                  Expires {card.expMonth.padStart(2, '0')}/
                  {card.expYear.slice(-2)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <IconAction
                  label="Edit"
                  onClick={() => setEditing({ kind: 'card', card })}
                >
                  <Pencil size={16} />
                </IconAction>
                <IconAction
                  label="Remove"
                  onClick={() =>
                    void remove(card.id, `the card ending ${card.last4}`)
                  }
                >
                  <Trash2 size={16} />
                </IconAction>
              </div>
            </div>
          ),
        )}
        {editing?.kind === 'card' && !editing.card ? (
          <CardForm summary={null} onDone={done} />
        ) : (
          <div className="flex items-center justify-end px-4 py-2.5">
            <Button
              disabled={!available}
              onClick={() => setEditing({ kind: 'card', card: null })}
            >
              <Plus size={13} />
              Add card
            </Button>
          </div>
        )}
      </Section>
    </>
  );
}
