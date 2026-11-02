// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import type { SplashApi } from '../../shared/api';
import { Authentication } from './Authentication';
it('identifies the requesting site and submits only the entered credentials', async () => {
  const respondAuth = vi.fn(async () => undefined);
  window.splash = {
    getAuthChallenge: async () => ({
      origin: 'https://private.example',
      host: 'private.example',
      secure: true,
      isProxy: false,
    }),
    respondAuth,
  } as unknown as SplashApi;
  render(<Authentication />);
  await screen.findByText('https://private.example');
  expect(document.activeElement).toBe(screen.getByLabelText('Username'));
  fireEvent.change(screen.getByLabelText('Username'), {
    target: { value: 'test-user' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'test-only' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(respondAuth).toHaveBeenCalledWith({
    username: 'test-user',
    password: 'test-only',
  });
});
