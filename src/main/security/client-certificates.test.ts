import { describe, expect, it, vi } from 'vitest';
import {
  certificateLabel,
  chooseClientCertificate,
  type CertificatePrompt,
} from './client-certificates';

const cert = (subjectName: string, issuerName = 'Acme CA') => ({
  subjectName,
  issuerName,
  validExpiry: 2_000_000_000,
});
const URL_ = 'https://bank.example:8443/login';

describe('certificateLabel', () => {
  it('says who it is and who issued it', () => {
    expect(certificateLabel(cert('Sam Doe'))).toBe('Sam Doe (Acme CA)');
    expect(certificateLabel(cert('Sam Doe', ''))).toBe('Sam Doe');
    expect(certificateLabel(cert('', ''))).toBe('Unnamed certificate');
  });
});

describe('chooseClientCertificate', () => {
  it('sends nothing, without asking, when there is nothing to send', async () => {
    const ask = vi.fn(async () => 0);
    expect(await chooseClientCertificate(URL_, [], ask)).toBeUndefined();
    expect(ask).not.toHaveBeenCalled();
  });

  it('names the site and makes sending nothing the way out', async () => {
    let prompt: CertificatePrompt | undefined;
    await chooseClientCertificate(
      URL_,
      [cert('Sam'), cert('Work')],
      async (asked) => {
        prompt = asked;
        return asked.cancelId;
      },
    );
    expect(prompt?.message).toContain('bank.example:8443');
    expect(prompt?.buttons).toEqual([
      'Sam (Acme CA)',
      'Work (Acme CA)',
      'Don’t Send',
    ]);
    expect(prompt?.cancelId).toBe(2);
  });

  it('sends only the one chosen', async () => {
    const second = cert('Work');
    const chosen = await chooseClientCertificate(
      URL_,
      [cert('Sam'), second],
      async () => 1,
    );
    expect(chosen).toBe(second);
  });

  it('sends nothing when told not to', async () => {
    const chosen = await chooseClientCertificate(
      URL_,
      [cert('Sam')],
      async ({ cancelId }) => cancelId,
    );
    expect(chosen).toBeUndefined();
  });

  it('sends nothing when asking fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const chosen = await chooseClientCertificate(
      URL_,
      [cert('Sam')],
      async () => {
        throw new Error('no window');
      },
    );
    expect(chosen).toBeUndefined();
  });

  it('keeps the alert usable with very many certificates', async () => {
    const many = Array.from({ length: 20 }, (_, index) => cert(`C${index}`));
    const ask = vi.fn(async ({ cancelId }: CertificatePrompt) => cancelId);
    await chooseClientCertificate(URL_, many, ask);
    expect(ask.mock.calls[0]![0].buttons).toHaveLength(9);
  });
});
