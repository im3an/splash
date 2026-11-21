import { ExternalLink, ShieldQuestion } from '../icons';
import { hostOf, permissionNames } from '../lib/format';
import { api } from '../splash-api';
import { selectActivePage, useShell } from '../stores/shell-store';
import { Reveal } from './Reveal';

/**
 * Asks about a permission the active page wants, right under the address
 * bar. The page keeps running; the answer is remembered for the site.
 * A link meant for another app (mailto:, zoommtg: …) asks the same way,
 * naming the app it would open.
 */
export function PermissionBar() {
  const page = useShell(selectActivePage);
  const request = page?.permissionRequest;
  if (!page || !request) return <Reveal show={false}>{null}</Reveal>;

  const answer = (granted: boolean) =>
    void api().respondToPermission(page.id, request.id, granted);
  const { opens } = request;
  const Icon = opens ? ExternalLink : ShieldQuestion;

  return (
    <Reveal show>
      <div
        role="alertdialog"
        aria-label="Permission request"
        className="shell-bar"
      >
        <Icon size={15} className="shrink-0 text-accent" />
        <p className="min-w-0 flex-1 truncate">
          <span className="font-medium">{hostOf(request.origin)}</span>
          <span className="text-fg-muted">
            {' '}
            {opens
              ? `wants to open ${opens.app}`
              : `wants to use your ${permissionNames(request.permissions)}`}
          </span>
        </p>
        <span className="hidden shrink-0 text-small text-fg-subtle md:inline">
          Remembered for this site
        </span>
        <button type="button" onClick={() => answer(false)} className="button">
          {opens ? 'Don’t open' : 'Block'}
        </button>
        <button
          type="button"
          onClick={() => answer(true)}
          className="button button-primary"
        >
          {opens ? 'Open' : 'Allow'}
        </button>
      </div>
    </Reveal>
  );
}
