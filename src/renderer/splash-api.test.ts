// @vitest-environment jsdom
import type { SplashApi } from '../shared/api';
import { api } from './splash-api';

describe('api', () => {
  it('works with the frozen object contextBridge exposes', async () => {
    const closePage = vi.fn(async () => undefined);
    window.splash = Object.freeze({
      platform: 'darwin',
      closePage,
    }) as unknown as SplashApi;
    await api().closePage('p');
    expect(closePage).toHaveBeenCalledWith('p');
    expect(api().platform).toBe('darwin');
  });

  it('logs failed calls instead of leaving them unhandled', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    window.splash = Object.freeze({
      closePage: () => Promise.reject(new Error('gone')),
    }) as unknown as SplashApi;
    const call = api().closePage('p');
    await expect(call).rejects.toThrow('gone');
    await Promise.resolve();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
