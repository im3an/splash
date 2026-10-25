import { undoMessage } from './UndoToast';

describe('undoMessage', () => {
  it('shortens long names so the page count always shows', () => {
    const message = undoMessage({
      kind: 'workspace',
      label: 'Research and reading for the long project',
      pageCount: 2,
      serial: 1,
    });
    expect(message).toBe(
      'Deleted workspace “Research and reading fo…” and its 2 pages.',
    );
  });

  it('describes pages and empty workspaces', () => {
    expect(
      undoMessage({ kind: 'pages', label: 'Docs', pageCount: 1, serial: 1 }),
    ).toBe('Closed “Docs”.');
    expect(
      undoMessage({ kind: 'pages', label: 'Docs', pageCount: 3, serial: 1 }),
    ).toBe('Closed “Docs” and 2 more.');
    expect(
      undoMessage({
        kind: 'workspace',
        label: 'Work',
        pageCount: 0,
        serial: 1,
      }),
    ).toBe('Deleted workspace “Work”.');
  });
});
