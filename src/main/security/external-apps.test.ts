import { describe, expect, it, vi } from 'vitest';
import type { SitePermission } from '../../shared/types';
import { requestExternalOpen } from './external-apps';
import type { PermissionDecisions } from './permissions';

const PAGE = 'https://example.com/contact';

function decisions(initial: boolean | null = null): PermissionDecisions & {
  stored: Map<string, boolean | null>;
} {
  const stored = new Map<string, boolean | null>();
  if (initial !== null) stored.set('https://example.com apps', initial);
  return {
    stored,
    getPermission: (origin, permission) =>
      stored.get(`${origin} ${permission}`) ?? null,
    setPermission: (origin, permission, granted) =>
      void stored.set(`${origin} ${permission}`, granted),
  };
}

function target(answer: boolean) {
  return {
    request: vi.fn((_origin: string, _permissions: SitePermission[]) =>
      Promise.resolve(answer),
    ),
    blocked: vi.fn(),
    notify: vi.fn(),
  };
}

function deps(app = 'Mail') {
  return { appFor: vi.fn(() => app), open: vi.fn() };
}

describe('requestExternalOpen', () => {
  it('names the app, opens the link once allowed, and remembers it', async () => {
    const page = target(true);
    const store = decisions();
    const env = deps('Mail.app');
    await expect(
      requestExternalOpen(page, PAGE, 'mailto:hi@example.com', store, env),
    ).resolves.toBe(true);
    expect(page.request).toHaveBeenCalledWith('https://example.com', ['apps'], {
      app: 'Mail',
      scheme: 'mailto',
    });
    expect(env.open).toHaveBeenCalledWith('mailto:hi@example.com');
    expect(store.stored.get('https://example.com apps')).toBe(true);
  });

  it('does not open, and shows it blocked, when refused', async () => {
    const page = target(false);
    const env = deps();
    await requestExternalOpen(page, PAGE, 'tel:123', decisions(), env);
    expect(env.open).not.toHaveBeenCalled();
    expect(page.blocked).toHaveBeenCalledWith(['apps']);
  });

  it('follows a remembered answer without asking', async () => {
    const page = target(false);
    const env = deps();
    await requestExternalOpen(page, PAGE, 'zoommtg://x', decisions(true), env);
    expect(page.request).not.toHaveBeenCalled();
    expect(env.open).toHaveBeenCalled();
  });

  it('says so when no app handles the link', async () => {
    const page = target(true);
    const env = deps('');
    await requestExternalOpen(page, PAGE, 'Nope:thing', decisions(), env);
    expect(page.notify).toHaveBeenCalledWith({
      kind: 'no-app',
      scheme: 'nope',
    });
    expect(page.request).not.toHaveBeenCalled();
    expect(env.open).not.toHaveBeenCalled();
  });

  it('ignores pages that are not web pages', async () => {
    const page = target(true);
    const env = deps();
    await expect(
      requestExternalOpen(page, 'file:///x', 'mailto:a@b.c', decisions(), env),
    ).resolves.toBe(false);
    expect(page.request).not.toHaveBeenCalled();
  });
});
