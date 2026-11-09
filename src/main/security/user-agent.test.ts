import { webUserAgent } from './user-agent';

describe('webUserAgent', () => {
  it('leaves what Chrome itself sends', () => {
    expect(
      webUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Splash/1.0.0 Chrome/156.0.8078.80 Electron/45.2.3 Safari/537.36',
      ),
    ).toBe(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.8078.80 Safari/537.36',
    );
  });

  it('changes nothing when neither name is there', () => {
    const chrome = 'Mozilla/5.0 Chrome/156.0.8078.80 Safari/537.36';
    expect(webUserAgent(chrome)).toBe(chrome);
  });
});
