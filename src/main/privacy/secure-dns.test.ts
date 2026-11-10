import {
  SECURE_DNS_CHOICES,
  SECURE_DNS_PROVIDERS,
} from '../../shared/secure-dns';
import { hostResolverOptions, secureDnsFollower } from './secure-dns';

describe('which resolver a choice asks for', () => {
  it('keeps Chromium’s default: the network’s own DNS, encrypted when it can be', () => {
    expect(hostResolverOptions('automatic', false)).toEqual({
      secureDnsMode: 'automatic',
      secureDnsServers: [],
    });
    // Splash can’t know whether the network’s provider speaks DoH, so “only
    // secure DNS” would break every lookup on most networks.
    expect(hostResolverOptions('automatic', true)).toEqual({
      secureDnsMode: 'automatic',
      secureDnsServers: [],
    });
  });

  it('asks a chosen provider first and falls back, so sign-in pages on hotel networks still load', () => {
    expect(hostResolverOptions('quad9', false)).toEqual({
      secureDnsMode: 'automatic',
      secureDnsServers: ['https://dns.quad9.net/dns-query'],
    });
  });

  it('never falls back to plain DNS when that’s asked for', () => {
    expect(hostResolverOptions('cloudflare', true)).toEqual({
      secureDnsMode: 'secure',
      secureDnsServers: ['https://cloudflare-dns.com/dns-query'],
    });
  });

  it('turns encrypted DNS off', () => {
    expect(hostResolverOptions('off', true)).toEqual({
      secureDnsMode: 'off',
      secureDnsServers: [],
    });
  });

  it('offers every provider as a choice, each with an HTTPS server', () => {
    for (const provider of SECURE_DNS_PROVIDERS) {
      expect(SECURE_DNS_CHOICES).toContain(provider.id);
      expect(new URL(provider.server).protocol).toBe('https:');
    }
    expect(SECURE_DNS_CHOICES[0]).toBe('automatic');
    expect(SECURE_DNS_CHOICES.at(-1)).toBe('off');
  });
});

describe('following the setting', () => {
  it('configures the resolver at once, then only when the choice changes', () => {
    const configure = vi.fn();
    const follow = secureDnsFollower(configure);
    follow({ secureDns: 'automatic', secureDnsStrict: false });
    expect(configure).toHaveBeenCalledTimes(1);
    // Other preferences change all the time; the resolver isn’t touched.
    follow({ secureDns: 'automatic', secureDnsStrict: false });
    follow({ secureDns: 'automatic', secureDnsStrict: true });
    expect(configure).toHaveBeenCalledTimes(1);
    follow({ secureDns: 'mullvad', secureDnsStrict: true });
    expect(configure).toHaveBeenLastCalledWith({
      secureDnsMode: 'secure',
      secureDnsServers: ['https://dns.mullvad.net/dns-query'],
    });
    expect(configure).toHaveBeenCalledTimes(2);
  });

  it('keeps browsing when the resolver refuses a setting', () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const follow = secureDnsFollower(() => {
      throw new Error('not ready');
    });
    expect(() =>
      follow({ secureDns: 'google', secureDnsStrict: false }),
    ).not.toThrow();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
