import { secureDnsProvider, type SecureDns } from '../../shared/secure-dns';

/** The part of Electron's `ConfigureHostResolverOptions` Splash sets. */
export interface HostResolverOptions {
  secureDnsMode: 'off' | 'automatic' | 'secure';
  secureDnsServers: string[];
}

/**
 * What `app.configureHostResolver` gets for a Settings choice. A chosen
 * provider is asked first; plain DNS is the fallback unless `strict`, so a
 * network that blocks the provider, or a hotel's sign-in page, still works.
 * Strict means nothing for "automatic": Splash can't know whether the
 * network's provider speaks DNS over HTTPS.
 */
export function hostResolverOptions(
  choice: SecureDns,
  strict: boolean,
): HostResolverOptions {
  if (choice === 'off') return { secureDnsMode: 'off', secureDnsServers: [] };
  const provider = secureDnsProvider(choice);
  if (!provider) return { secureDnsMode: 'automatic', secureDnsServers: [] };
  return {
    secureDnsMode: strict ? 'secure' : 'automatic',
    secureDnsServers: [provider.server],
  };
}

/**
 * Applies the setting now and again whenever the resolver it asks for
 * changes. Preferences change often; the network service is only told when
 * it matters.
 */
export function secureDnsFollower(
  configure: (options: HostResolverOptions) => void,
) {
  let applied: string | null = null;
  return (preferences: { secureDns: SecureDns; secureDnsStrict: boolean }) => {
    const options = hostResolverOptions(
      preferences.secureDns,
      preferences.secureDnsStrict,
    );
    const key = JSON.stringify(options);
    if (key === applied) return;
    try {
      configure(options);
      applied = key;
    } catch (error) {
      console.error('Couldn’t configure secure DNS', error);
    }
  };
}
