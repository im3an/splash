// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { SplashApi } from '../../shared/api';
import type { SavedCollection } from '../../shared/preferences';
import { useShell } from '../stores/shell-store';
import { page, sampleSnapshot } from '../test-fixtures';
import { useOpenStack } from './IconStack';
import { SavedGroups } from './SavedGroups';

const link = (id: string, title: string) => ({
  id,
  title,
  url: `https://${id}.example/`,
});

const collections: SavedCollection[] = [
  {
    id: 'main',
    name: 'Bookmarks',
    kind: 'folder',
    collapsed: false,
    parentId: null,
    links: [link('linear', 'Linear')],
  },
  {
    id: 'work',
    name: 'Work',
    kind: 'folder',
    collapsed: false,
    parentId: null,
    links: [link('figma', 'Figma')],
  },
  {
    id: 'trip',
    name: 'Lisbon trip',
    kind: 'folder',
    collapsed: true,
    parentId: null,
    links: [link('maps', 'Maps'), link('hotel', 'Hotel')],
  },
];

function show() {
  window.splash = {
    updatePreferences: vi.fn(async () => undefined),
  } as unknown as SplashApi;
  useShell.setState({
    snapshot: {
      ...sampleSnapshot(),
      pages: { a: page('a', { url: 'https://figma.example/' }) },
      rootIds: ['a'],
      activePageId: 'a',
    },
    preferences: {
      ...useShell.getState().preferences,
      trailStyle: 'branches',
      collections,
    } as never,
  });
  return render(<SavedGroups />);
}

const rowOf = (name: RegExp) =>
  screen.getByRole('button', { name }).closest<HTMLElement>('.trail-row')!;

afterEach(() => useOpenStack.setState({ id: null }));

describe('the Favorites list', () => {
  it('is a separate section from the pages below it', () => {
    const { container } = show();
    expect(container.querySelector('.saved-squiggle')).not.toBeNull();
  });

  it('counts the stack only while it is folded', () => {
    show();
    const stack = screen.getByRole('button', { name: /^Bookmarks,/ });
    expect(stack.textContent).toContain('4');
    act(() => fireEvent.click(stack));
    expect(stack.textContent).not.toContain('4');
  });

  it('nests rows the way the trail does, each with its actions', () => {
    show();
    act(() =>
      fireEvent.click(screen.getByRole('button', { name: /^Bookmarks,/ })),
    );
    const folder = rowOf(/^Work,/);
    const inside = screen
      .getByRole('group', { name: 'Work' })
      .querySelector<HTMLElement>('.trail-row')!;
    expect(parseInt(folder.style.marginLeft)).toBe(17);
    expect(parseInt(inside.style.marginLeft)).toBe(31);
    expect(
      screen.getByRole('button', { name: 'Actions for Figma' }),
    ).toBeTruthy();
  });

  it('counts a folder only while it is folded', () => {
    show();
    act(() =>
      fireEvent.click(screen.getByRole('button', { name: /^Bookmarks,/ })),
    );
    expect(rowOf(/^Work,/).textContent).not.toMatch(/\d/);
    const folded = rowOf(/^Lisbon trip, 2 pages/);
    expect(folded.dataset.folded).toBe('true');
    expect(folded.textContent).toContain('2');
  });

  it('marks the link to the current page', () => {
    show();
    act(() =>
      fireEvent.click(screen.getByRole('button', { name: /^Bookmarks,/ })),
    );
    const current = screen
      .getByRole('group', { name: 'Work' })
      .querySelector<HTMLElement>('[aria-current="page"]');
    expect(current?.textContent).toContain('Figma');
  });
});
