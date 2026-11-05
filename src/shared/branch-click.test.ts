import { canBranchLink, droppedLink } from './branch-click';
describe('ordinary link branching', () => {
  it('branches new documents without unloading their source form', () => {
    expect(
      canBranchLink(
        'https://a.example/form',
        'https://b.example/docs',
        '',
        false,
      ),
    ).toBe(true);
  });
  it('lets hash navigation, named targets and application routers behave normally', () => {
    expect(
      canBranchLink(
        'https://a.example/form',
        'https://a.example/form#notes',
        '',
        false,
      ),
    ).toBe(false);
    expect(
      canBranchLink(
        'https://a.example/form',
        'https://b.example/docs',
        '_blank',
        false,
      ),
    ).toBe(false);
    expect(
      canBranchLink(
        'https://a.example/form',
        'https://b.example/docs',
        '',
        true,
      ),
    ).toBe(false);
    expect(
      canBranchLink('https://a.example/form', 'javascript:alert(1)', '', false),
    ).toBe(false);
  });
});

describe('droppedLink', () => {
  it('takes the first address, skipping comments and blank lines', () => {
    expect(
      droppedLink('# from a page\r\n\r\nhttps://a.com/\r\nhttps://b.com/'),
    ).toBe('https://a.com/');
  });

  it('finds nothing in an empty list', () => {
    expect(droppedLink('')).toBeNull();
    expect(droppedLink('# only a comment')).toBeNull();
  });
});
