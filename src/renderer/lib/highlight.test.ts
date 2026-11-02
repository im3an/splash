import { highlightParts } from './highlight';

describe('highlightParts', () => {
  it('marks where each word first appears, ignoring case', () => {
    expect(highlightParts('Trail Running Guide', 'guide trail')).toEqual([
      { text: 'Trail', match: true },
      { text: ' Running ', match: false },
      { text: 'Guide', match: true },
    ]);
  });

  it('merges overlapping matches', () => {
    expect(highlightParts('Settings', 'set sett')).toEqual([
      { text: 'Sett', match: true },
      { text: 'ings', match: false },
    ]);
  });

  it('leaves text without matches whole', () => {
    expect(highlightParts('Inbox', '')).toEqual([
      { text: 'Inbox', match: false },
    ]);
    expect(highlightParts('Inbox', 'zz')).toEqual([
      { text: 'Inbox', match: false },
    ]);
  });
});
