import { AUTOCONSENT_CONFIG, autoconsentReply } from './autoconsent';

function frame({ isMainFrame = true, enabled = true } = {}) {
  return {
    frameUrl: 'https://news.example/',
    isMainFrame,
    enabled,
    evaluate: vi.fn(async (_code: string): Promise<unknown> => true),
  };
}

describe('AUTOCONSENT_CONFIG', () => {
  it('only ever rejects', () => {
    expect(AUTOCONSENT_CONFIG.autoAction).toBe('optOut');
    expect(AUTOCONSENT_CONFIG.heuristicMode).toBe('reject');
  });

  it('leaves "consent or pay" walls visible', () => {
    expect(AUTOCONSENT_CONFIG.disabledCmps).toContain('sourcepoint-top');
  });
});

describe('autoconsentReply', () => {
  it('sends the rules for the frame when cookie notices are handled', async () => {
    const reply = (await autoconsentReply(
      { type: 'init', url: 'https://news.example/' },
      frame(),
    )) as { type: string; config: { enabled: boolean }; rules: object };
    expect(reply.type).toBe('initResp');
    expect(reply.config.enabled).toBe(true);
    expect(reply.rules).toHaveProperty('compact.r');
  });

  it('sends fewer rules to an iframe than to the page', async () => {
    const size = async (isMainFrame: boolean) =>
      JSON.stringify(
        await autoconsentReply({ type: 'init' }, frame({ isMainFrame })),
      ).length;
    expect(await size(false)).toBeLessThan(await size(true));
  });

  it('turns autoconsent off where cookie notices aren’t handled', async () => {
    const reply = await autoconsentReply(
      { type: 'init' },
      frame({ enabled: false }),
    );
    expect(reply).toMatchObject({
      type: 'initResp',
      config: { enabled: false },
      rules: { autoconsent: [] },
    });
  });

  it('runs rule steps in the frame and answers with the result', async () => {
    const context = frame();
    context.evaluate.mockResolvedValue(true);
    expect(
      await autoconsentReply({ type: 'eval', id: 'a1', code: '1' }, context),
    ).toEqual({ type: 'evalResp', id: 'a1', result: true });
    expect(context.evaluate).toHaveBeenCalledWith('1');

    context.evaluate.mockRejectedValue(new Error('page threw'));
    expect(
      await autoconsentReply({ type: 'eval', id: 'a2', code: 'x' }, context),
    ).toEqual({ type: 'evalResp', id: 'a2', result: false });
  });

  it('runs nothing where cookie notices aren’t handled', async () => {
    const context = frame({ enabled: false });
    expect(
      await autoconsentReply({ type: 'eval', id: 'a1', code: '1' }, context),
    ).toBeNull();
    expect(context.evaluate).not.toHaveBeenCalled();
  });

  it('ignores reports and malformed messages', async () => {
    const context = frame();
    for (const message of [
      null,
      'init',
      { type: 'popupFound', cmp: 'x' },
      { type: 'eval', id: 1, code: '1' },
      { type: 'optIn' },
    ]) {
      expect(await autoconsentReply(message, context)).toBeNull();
    }
    expect(context.evaluate).not.toHaveBeenCalled();
  });
});
