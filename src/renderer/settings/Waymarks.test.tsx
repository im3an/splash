// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { SplashApi } from '../../shared/api';
import {
  DEFAULT_PREFERENCES,
  type Preferences,
} from '../../shared/preferences';
import { WAYMARKS } from '../../shared/waymarks';
import { useShell } from '../stores/shell-store';
import { WaymarksSettings } from './Waymarks';

function setup(patch: Partial<Preferences> = {}) {
  useShell.setState({ preferences: { ...DEFAULT_PREFERENCES, ...patch } });
  const updatePreferences = vi.fn(
    async (_patch: Partial<Preferences>) => DEFAULT_PREFERENCES,
  );
  window.splash = { updatePreferences } as unknown as SplashApi;
  render(<WaymarksSettings />);
  return updatePreferences;
}

const search = (text: string) =>
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: text },
  });

describe('WaymarksSettings', () => {
  it('lists the whole catalog', () => {
    setup();
    expect(
      screen.getByPlaceholderText(`Search ${WAYMARKS.length} sites`),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add IMDb' })).toBeTruthy();
  });

  it('adds a site as a search shortcut', () => {
    const updatePreferences = setup();
    search('imdb');
    fireEvent.click(screen.getByRole('button', { name: 'Add IMDb' }));
    const saved = updatePreferences.mock.calls[0]![0] as Preferences;
    expect(saved.searchShortcuts.at(-1)).toMatchObject({
      name: 'IMDb',
      keyword: 'imdb',
      url: 'https://www.imdb.com/find/?q=%s',
    });
  });

  it('shows what’s already added, and takes it off with the same button', () => {
    const updatePreferences = setup();
    search('youtube');
    fireEvent.click(screen.getByRole('button', { name: 'Remove YouTube' }));
    const saved = updatePreferences.mock.calls[0]![0] as Preferences;
    expect(saved.searchShortcuts.map((item) => item.keyword)).not.toContain(
      'yt',
    );
  });

  it('moves the default engine off a shortcut when that one is removed', () => {
    const updatePreferences = setup({ searchEngine: 'youtube' });
    search('youtube');
    fireEvent.click(screen.getByRole('button', { name: 'Remove YouTube' }));
    const saved = updatePreferences.mock.calls[0]![0] as Preferences;
    expect(saved.searchEngine).toBe('duckduckgo');
  });

  it('asks for another keyword when one is taken, instead of overwriting', () => {
    const updatePreferences = setup({
      searchShortcuts: [
        {
          id: 'mine',
          name: 'My movies',
          keyword: 'imdb',
          url: 'https://movies.example/?q=%s',
        },
      ],
    });
    search('imdb.com');
    fireEvent.click(screen.getByRole('button', { name: 'Add IMDb' }));
    expect(updatePreferences).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain(
      '“imdb” already searches My movies.',
    );
    fireEvent.change(screen.getByLabelText('Keyword'), {
      target: { value: 'film' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const saved = updatePreferences.mock.calls[0]![0] as Preferences;
    expect(saved.searchShortcuts.map((item) => item.keyword)).toEqual([
      'imdb',
      'film',
    ]);
  });

  it('narrows by category and says when nothing matches', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'Germany' },
    });
    expect(screen.queryByRole('button', { name: 'Add IMDb' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add Duden' })).toBeTruthy();
    search('no such site anywhere');
    expect(within(screen.getByRole('status')).getByRole('button')).toBeTruthy();
  });
});
