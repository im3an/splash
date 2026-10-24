import { invokeContract, sendContract } from './ipc';

const PAGE = '6f1c1d3e-8b7a-4c55-9d2e-0a1b2c3d4e5f';

describe('IPC contract', () => {
  it('accepts well-formed input', () => {
    expect(
      invokeContract['page:navigate'].parse({ pageId: PAGE, input: ' a.com ' }),
    ).toEqual({
      pageId: PAGE,
      input: 'a.com',
    });
    expect(invokeContract['page:create'].parse({})).toEqual({});
  });

  it.each([
    ['page:activate', { pageId: 'not-a-uuid' }],
    ['page:activate', { pageId: PAGE, extra: true }],
    ['page:navigate', { pageId: PAGE, input: '   ' }],
    ['page:navigate', { pageId: PAGE, input: 'x'.repeat(9000) }],
    ['page:set-collapsed', { pageId: PAGE, collapsed: 'yes' }],
    ['browser:get-snapshot', { anything: 1 }],
  ] as const)('rejects malformed %s input', (channel, input) => {
    expect(invokeContract[channel].safeParse(input).success).toBe(false);
  });

  it('rejects impossible content insets', () => {
    const schema = sendContract['view:set-content-insets'];
    expect(
      schema.safeParse({ top: 48, right: 8, bottom: 8, left: 260 }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ top: -1, right: 8, bottom: 8, left: 260 }).success,
    ).toBe(false);
    expect(
      schema.safeParse({ top: Number.NaN, right: 8, bottom: 8, left: 260 })
        .success,
    ).toBe(false);
  });
});
