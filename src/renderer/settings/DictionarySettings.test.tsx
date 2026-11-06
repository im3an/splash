// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SplashApi } from '../../shared/api';
import { DictionarySettings } from './DictionarySettings';

function setup(words: string[]) {
  const known = new Set(words);
  const splash = {
    listDictionaryWords: vi.fn(async () => [...known]),
    setDictionaryWord: vi.fn(async (word: string, keep: boolean) => {
      if (keep) known.add(word);
      else known.delete(word);
      return true;
    }),
  };
  window.splash = splash as unknown as SplashApi;
  render(<DictionarySettings />);
  return splash;
}

describe('words added to the dictionary', () => {
  afterEach(cleanup);

  it('says how words get there when there are none', async () => {
    setup([]);
    expect(await screen.findByText('No added words')).toBeTruthy();
  });

  it('lists them in alphabetical order, whatever the case', async () => {
    setup(['zebra', 'Apple', 'mango']);
    const remove = await screen.findAllByRole('button', { name: /^Remove/ });
    expect(remove.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Remove Apple',
      'Remove mango',
      'Remove zebra',
    ]);
  });

  it('removes a word, says so, and undoes it', async () => {
    const splash = setup(['Splashy']);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Remove Splashy' }),
    );
    expect(await screen.findByText('Removed “Splashy”.')).toBeTruthy();
    expect(splash.setDictionaryWord).toHaveBeenCalledWith('Splashy', false);
    expect(screen.queryByRole('button', { name: 'Remove Splashy' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(
      await screen.findByRole('button', { name: 'Remove Splashy' }),
    ).toBeTruthy();
    expect(splash.setDictionaryWord).toHaveBeenLastCalledWith('Splashy', true);
    expect(screen.queryByText('Removed “Splashy”.')).toBeNull();
  });

  it('says so when a word can’t be removed, and keeps it listed', async () => {
    const splash = setup(['Splashy']);
    splash.setDictionaryWord.mockResolvedValueOnce(false);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Remove Splashy' }),
    );
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Couldn’t remove “Splashy”. Try again.',
    );
    expect(screen.getByRole('button', { name: 'Remove Splashy' })).toBeTruthy();
  });

  it('offers to try again when the list can’t be read', async () => {
    const splash = setup(['Splashy']);
    cleanup();
    splash.listDictionaryWords.mockRejectedValueOnce(new Error('no'));
    render(<DictionarySettings />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('button', { name: 'Remove Splashy' }),
    ).toBeTruthy();
  });

  it('catches up when the window comes back, after adding a word from a page', async () => {
    const splash = setup([]);
    await screen.findByText('No added words');
    splash.listDictionaryWords.mockResolvedValueOnce(['Splashy']);
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(
      await screen.findByRole('button', { name: 'Remove Splashy' }),
    ).toBeTruthy();
  });
});
