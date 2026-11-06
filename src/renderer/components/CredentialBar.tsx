import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import type { CredentialPrompt } from '../../shared/vault';
import { api } from '../splash-api';
import { selectActivePage, useShell } from '../stores/shell-store';
import { Reveal } from './Reveal';

/**
 * Offers to keep a login the user just used, once it looks like it worked. It
 * stays out of the page, and goes away if the site asks for the password again.
 */
export function CredentialBar() {
  const page = useShell(selectActivePage);
  const [prompt, setPrompt] = useState<CredentialPrompt | null>(null);
  useEffect(() => api().onCredentialPrompt(setPrompt), []);

  const showing = prompt && (!prompt.pageId || prompt.pageId === page?.id);
  if (!showing) return <Reveal show={false}>{null}</Reveal>;

  const answer = (choice: 'save' | 'never' | 'dismiss') => {
    setPrompt(null);
    void api().answerCredentialPrompt(prompt.id, choice);
  };

  return (
    <Reveal show>
      <div
        role="alertdialog"
        aria-label={prompt.update ? 'Update password' : 'Save password'}
        className="shell-bar"
      >
        <KeyRound size={15} className="shrink-0 text-accent" />
        <p className="min-w-0 flex-1 truncate">
          <span className="font-medium">
            {prompt.update ? 'Update the password' : 'Save the password'}
          </span>
          <span className="text-fg-muted">
            {prompt.username ? ` for ${prompt.username}` : ''} on {prompt.host}?
          </span>
        </p>
        {!prompt.update && (
          <button
            type="button"
            onClick={() => answer('never')}
            className="button"
          >
            Never for This Site
          </button>
        )}
        <button
          type="button"
          onClick={() => answer('dismiss')}
          className="button"
        >
          Not Now
        </button>
        <button
          type="button"
          onClick={() => answer('save')}
          className="button button-primary"
        >
          {prompt.update ? 'Update' : 'Save'}
        </button>
      </div>
    </Reveal>
  );
}
