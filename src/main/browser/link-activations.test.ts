import { isSameDocumentUrl, LinkActivations } from './link-activations';

function setup() {
  let now = 1_000;
  const links = new LinkActivations(() => now);
  return { links, advance: (ms: number) => (now += ms) };
}

describe('LinkActivations', () => {
  it('matches the navigation a click started, once', () => {
    const { links } = setup();
    links.record('https://a.com/x');
    expect(links.take('https://a.com/x')).toBe(true);
    expect(links.take('https://a.com/x')).toBe(false);
  });

  it('normalises URLs before comparing', () => {
    const { links } = setup();
    links.record('HTTPS://A.com/x');
    expect(links.take('https://a.com/x')).toBe(true);
  });

  it('ignores navigations to other addresses', () => {
    const { links } = setup();
    links.record('https://a.com/x');
    expect(links.take('https://a.com/other')).toBe(false);
    // The click is still pending for its own navigation.
    expect(links.take('https://a.com/x')).toBe(true);
  });

  it('forgets clicks that are too old', () => {
    const { links, advance } = setup();
    links.record('https://a.com/x');
    advance(2_500);
    expect(links.take('https://a.com/x')).toBe(false);
  });

  it('ignores unparseable input', () => {
    const { links } = setup();
    links.record('not a url');
    expect(links.take('not a url')).toBe(false);
  });
});

describe('isSameDocumentUrl', () => {
  it('ignores fragments only', () => {
    expect(isSameDocumentUrl('https://a.com/x#1', 'https://a.com/x#2')).toBe(
      true,
    );
    expect(isSameDocumentUrl('https://a.com/x', 'https://a.com/y')).toBe(false);
    expect(isSameDocumentUrl('https://a.com/x?q=1', 'https://a.com/x')).toBe(
      false,
    );
  });
});
