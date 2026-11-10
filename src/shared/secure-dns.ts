/**
 * DNS over HTTPS providers Settings offers. Each server is the provider's
 * published RFC 8484 endpoint; Chromium sends it POST requests.
 */
export const SECURE_DNS_PROVIDERS = [
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    server: 'https://cloudflare-dns.com/dns-query',
  },
  { id: 'quad9', name: 'Quad9', server: 'https://dns.quad9.net/dns-query' },
  {
    id: 'mullvad',
    name: 'Mullvad',
    server: 'https://dns.mullvad.net/dns-query',
  },
  {
    id: 'google',
    name: 'Google Public DNS',
    server: 'https://dns.google/dns-query',
  },
] as const;

export type SecureDnsProvider = (typeof SECURE_DNS_PROVIDERS)[number]['id'];

/**
 * "automatic" is Chromium's own default: the network's DNS, encrypted when
 * its provider supports it.
 */
export const SECURE_DNS_CHOICES = [
  'automatic',
  ...SECURE_DNS_PROVIDERS.map((provider) => provider.id),
  'off',
] as const satisfies readonly string[];

export type SecureDns = 'automatic' | SecureDnsProvider | 'off';

export function secureDnsProvider(choice: SecureDns) {
  return SECURE_DNS_PROVIDERS.find((provider) => provider.id === choice);
}
