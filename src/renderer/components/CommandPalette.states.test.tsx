// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { SplashApi } from '../../shared/api';
import type { PaletteItem } from '../../shared/types';
import { useOverlay } from '../stores/overlay-store';
import { useShell } from '../stores/shell-store';
import { sampleSnapshot } from '../test-fixtures';
import { CommandPalette } from './CommandPalette';
const item: PaletteItem = {
  id: 'navigate',
  title: 'Open example.org',
  subtitle: 'example.org',
  section: 'go',
  kind: 'navigate',
  input: 'https://example.org/',
};
function setup() {
  const methods = {
    queryPalette: vi.fn(async () => [item]),
    suggestSearch: vi.fn(async () => []),
    createPage: vi.fn(async () => 'new'),
    focusPage: vi.fn(),
    setOverlayActive: vi.fn(),
  };
  window.splash = methods as unknown as SplashApi;
  useShell.setState({ snapshot: sampleSnapshot() });
  useOverlay.setState({
    overlay: { kind: 'palette', scope: 'palette' },
    leaving: false,
  });
  return methods;
}
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);
it('offers retry without clearing the query after a result failure', async () => {
  const methods = setup();
  methods.queryPalette.mockRejectedValueOnce(new Error('Unavailable'));
  render(<CommandPalette scope="palette" />);
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(methods.queryPalette).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(screen.getByRole('combobox')).toBeTruthy();
});
it('keeps the palette open after an action fails', async () => {
  const methods = setup();
  methods.createPage.mockRejectedValueOnce(new Error('Failed'));
  render(<CommandPalette scope="palette" />);
  await screen.findByText('Open example.org');
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
  await screen.findByText('That action failed. Choose it again to retry.');
  expect(useOverlay.getState().leaving).toBe(false);
  expect(screen.getByRole('combobox')).toBeTruthy();
});
it('does not duplicate an operation when Return is pressed repeatedly', async () => {
  const methods = setup();
  let resolve: (id: string) => void = () => {};
  const pending = new Promise<string>((done) => {
    resolve = done;
  });
  methods.createPage.mockImplementation(() => pending);
  render(<CommandPalette scope="palette" />);
  await screen.findByText('Open example.org');
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
  expect(methods.createPage).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve('new');
    await pending;
  });
});

it('uses the newest typed address when Enter beats the suggestion response', async () => {
  const methods = setup();
  const navigate = vi.fn(async () => undefined);
  window.splash = { ...methods, navigate } as unknown as SplashApi;
  methods.queryPalette.mockImplementation(() => new Promise(() => {}));
  render(<CommandPalette scope="location" />);
  const input = screen.getByRole('combobox');
  fireEvent.change(input, { target: { value: 'http://127.0.0.1:8769/form' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  await waitFor(() =>
    expect(navigate).toHaveBeenCalledWith('a', 'http://127.0.0.1:8769/form'),
  );
});

it('shows what Return does on the selected row', async () => {
  setup();
  render(<CommandPalette scope="palette" />);
  const row = await screen.findByRole('option', { name: /Open example\.org/ });
  expect(row.getAttribute('aria-selected')).toBe('true');
  expect(row.textContent).toContain('Open in new page');
});

it('switches between everything and commands with Tab, keeping the words', async () => {
  const methods = setup();
  render(<CommandPalette scope="palette" />);
  const input = screen.getByRole<HTMLInputElement>('combobox');
  fireEvent.change(input, { target: { value: 'pin' } });
  fireEvent.keyDown(input, { key: 'Tab' });
  expect(input.value).toBe('>pin');
  expect(
    screen
      .getByRole('button', { name: 'Commands' })
      .getAttribute('aria-pressed'),
  ).toBe('true');
  await waitFor(() =>
    expect(methods.queryPalette).toHaveBeenLastCalledWith(
      '>pin',
      'palette',
      false,
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'All' }));
  expect(input.value).toBe('pin');
});
