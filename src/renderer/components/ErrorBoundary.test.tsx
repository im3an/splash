// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function Broken(): never {
  throw new Error('panel bug');
}

describe('ErrorBoundary', () => {
  it('shows the fallback and reports the error instead of unmounting', () => {
    const quiet = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const onError = vi.fn();
    render(
      <div>
        <p>Sidebar still here</p>
        <ErrorBoundary onError={onError} fallback={() => <p>Panel closed</p>}>
          <Broken />
        </ErrorBoundary>
      </div>,
    );
    expect(screen.getByText('Sidebar still here')).toBeTruthy();
    expect(screen.getByText('Panel closed')).toBeTruthy();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'panel bug' }),
    );
    quiet.mockRestore();
  });
});
