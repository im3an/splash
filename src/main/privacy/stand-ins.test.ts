import {
  STAND_IN_SCHEME,
  standInBody,
  standInName,
  standInUrl,
} from './stand-ins';

describe('where a stand-in is served from', () => {
  it('names the resource under this launch’s secret', () => {
    expect(standInUrl('s3cret', 'googletagservices_gpt.js')).toBe(
      `${STAND_IN_SCHEME}://s3cret/googletagservices_gpt.js`,
    );
  });

  it('reads the name back', () => {
    const url = standInUrl('s3cret', 'google-analytics_analytics.js');
    expect(standInName(url, 's3cret')).toBe('google-analytics_analytics.js');
  });

  it('answers only under the secret, so a page can’t probe for Splash', () => {
    const url = standInUrl('s3cret', 'noop.js');
    expect(standInName(url, 'other')).toBeNull();
    expect(standInName('https://s3cret/noop.js', 's3cret')).toBeNull();
    expect(standInName('not a url', 's3cret')).toBeNull();
    expect(standInName(`${STAND_IN_SCHEME}://s3cret/`, 's3cret')).toBeNull();
  });

  it('keeps names with odd characters intact', () => {
    const url = standInUrl('s3cret', 'a b/c?.js');
    expect(standInName(url, 's3cret')).toBe('a b/c?.js');
  });
});

describe('what a stand-in answers with', () => {
  it('sends text as it is', () => {
    expect(
      standInBody({
        contentType: 'application/javascript',
        body: '(()=>{})()',
      }),
    ).toEqual({
      contentType: 'application/javascript',
      body: '(()=>{})()',
    });
  });

  it('decodes resources the lists keep in base64, such as images', () => {
    const { contentType, body } = standInBody({
      contentType: 'image/gif;base64',
      body: Buffer.from('GIF89a').toString('base64'),
    });
    expect(contentType).toBe('image/gif');
    expect(Buffer.from(body as Uint8Array).toString()).toBe('GIF89a');
  });
});
