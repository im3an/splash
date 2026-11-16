import { useEffect, useState, useRef } from 'react';
import { LockKeyhole } from '../icons';
import type { InvokeOutputs } from '../../shared/api';
import { api } from '../splash-api';

/** A native modal owns this form, separate from untrusted page content. */
export function Authentication() {
  const [challenge, setChallenge] = useState<
    InvokeOutputs['auth:challenge'] | null
  >(null);
  const usernameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!challenge) return;
    const focus = () => {
      if (!(document.activeElement instanceof HTMLInputElement))
        usernameInput.current?.focus();
    };
    focus();
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, [challenge]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    document.title = 'Sign in to site';
    void api()
      .getAuthChallenge()
      .then(setChallenge)
      .catch(() =>
        setError(
          'This sign-in request is no longer available. Close this window and reload the page.',
        ),
      );
  }, []);
  async function respond(
    credentials: { username: string; password: string } | null,
  ) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api().respondAuth(credentials);
    } catch {
      setBusy(false);
      setError(
        'The response couldn’t be sent. Try again, or close this window to cancel.',
      );
    }
  }
  return (
    <main
      className="h-full overflow-auto bg-surface p-6 text-fg"
      onKeyDown={(event) => {
        if (event.key === 'Escape') void respond(null);
      }}
    >
      <LockKeyhole size={24} className="mb-3 text-fg-muted" aria-hidden />
      <h1 className="text-title font-semibold">
        {challenge?.isProxy ? 'Sign in to proxy' : 'Sign in to site'}
      </h1>
      <p className="mt-1 break-all text-small text-fg-muted">
        {challenge
          ? challenge.isProxy
            ? challenge.host
            : challenge.origin
          : 'Loading sign-in request…'}
      </p>
      {challenge && !challenge.secure && (
        <p className="mt-2 text-caption text-danger">
          {challenge.isProxy
            ? 'The proxy connection’s security could not be verified.'
            : 'This connection is not encrypted. Your credentials could be visible on the network.'}
        </p>
      )}
      <form
        className="mt-4"
        onSubmit={(event) => {
          event.preventDefault();
          void respond({ username, password });
        }}
      >
        <fieldset disabled={busy || !challenge} className="space-y-3">
          <label className="block text-small font-medium">
            Username
            <input
              ref={usernameInput}
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-1 block h-9 w-full rounded-control bg-field px-3 font-normal"
            />
          </label>
          <label className="block text-small font-medium">
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 block h-9 w-full rounded-control bg-field px-3 font-normal"
            />
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="mt-3 text-small text-danger">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void respond(null)}
            className="button button-lg text-small"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !challenge}
            className="button button-lg button-primary text-small"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </div>
      </form>
    </main>
  );
}
