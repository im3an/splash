import type {
  ContextMenuParams,
  MenuItemConstructorOptions,
  WebContents,
} from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { webContextMenu, type WebContextMenuActions } from './web-context-menu';

vi.mock('electron', () => ({ clipboard: { writeText: vi.fn() } }));

function menu(
  params: Partial<ContextMenuParams>,
  actions: Partial<WebContextMenuActions> = {},
) {
  const contents = {
    replaceMisspelling: vi.fn(),
  } as unknown as WebContents;
  const items = webContextMenu(
    contents,
    {
      editFlags: {},
      misspelledWord: '',
      dictionarySuggestions: [],
      linkURL: '',
      selectionText: '',
      mediaType: 'none',
      isEditable: true,
      ...params,
    } as unknown as ContextMenuParams,
    { addToDictionary: null, ...actions } as WebContextMenuActions,
  );
  const item = (label: string): MenuItemConstructorOptions | undefined =>
    items.find((entry) => entry.label === label);
  return { contents, items, item };
}

describe('a misspelled word in the page menu', () => {
  it('offers to add the word, after the suggestions', () => {
    const addToDictionary = vi.fn();
    const { items, item } = menu(
      { misspelledWord: 'Splashy', dictionarySuggestions: ['Splashes'] },
      { addToDictionary },
    );
    const labels = items.map((entry) => entry.label);
    expect(labels.indexOf('Add to Dictionary')).toBe(
      labels.indexOf('Splashes') + 1,
    );
    (item('Add to Dictionary')!.click as () => void)();
    expect(addToDictionary).toHaveBeenCalledWith('Splashy');
  });

  it('offers it when there are no suggestions too', () => {
    const { item } = menu(
      { misspelledWord: 'Qzxv' },
      { addToDictionary: vi.fn() },
    );
    expect(item('No Guesses Found')).toBeDefined();
    expect(item('Add to Dictionary')).toBeDefined();
  });

  it('doesn’t offer it where words can’t be kept, as in a private window', () => {
    const { item } = menu({
      misspelledWord: 'Splashy',
      dictionarySuggestions: ['Splashes'],
    });
    expect(item('Splashes')).toBeDefined();
    expect(item('Add to Dictionary')).toBeUndefined();
  });

  it('doesn’t offer it with nothing misspelled', () => {
    const { item } = menu({}, { addToDictionary: vi.fn() });
    expect(item('Add to Dictionary')).toBeUndefined();
  });
});
