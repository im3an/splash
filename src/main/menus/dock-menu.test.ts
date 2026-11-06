import type { HistoryMatch } from '../storage/trail-store';
import { dockMenuTemplate } from './dock-menu';

vi.mock('../browser/electron-page-host', () => ({ contentsForPage: vi.fn() }));
vi.mock('electron', () => ({
  app: { name: 'Splash', isPackaged: true },
  BrowserWindow: { getFocusedWindow: vi.fn() },
  clipboard: {},
  nativeTheme: { themeSource: 'system' },
  Menu: { buildFromTemplate: vi.fn(), setApplicationMenu: vi.fn() },
}));

function visit(url: string, title: string, lastVisitedAt = 1): HistoryMatch {
  return { url, title, visitCount: 1, lastVisitedAt };
}

function setup(history: HistoryMatch[] = []) {
  const newWindow = vi.fn();
  const openPage = vi.fn();
  const items = dockMenuTemplate({
    store: { frequentHistory: () => history },
    newWindow,
    openPage,
  });
  const pages = items.slice(3);
  return { items, pages, newWindow, openPage };
}

describe('dockMenuTemplate', () => {
  it('offers only New Window when there is no history', () => {
    const { items, newWindow } = setup();
    expect(items.map((item) => item.label)).toEqual(['New Window']);
    items[0]!.click!(null as never, undefined, null as never);
    expect(newWindow).toHaveBeenCalledOnce();
  });

  it('lists recent pages under a header, newest first', () => {
    const { items, pages } = setup([
      visit('https://old.example/', 'Old', 1),
      visit('https://new.example/', 'New', 2),
    ]);
    expect(items[1]!.type).toBe('separator');
    expect(items[2]).toMatchObject({ label: 'Recent Pages', enabled: false });
    expect(pages.map((item) => item.label)).toEqual(['New', 'Old']);
  });

  it('opens the page a row names', () => {
    const { pages, openPage } = setup([visit('https://a.example/', 'A')]);
    pages[0]!.click!(null as never, undefined, null as never);
    expect(openPage).toHaveBeenCalledWith('https://a.example/');
  });

  it('keeps an ampersand from becoming a mnemonic', () => {
    const { pages } = setup([visit('https://a.example/', 'Salt & Pepper')]);
    expect(pages[0]!.label).toBe('Salt && Pepper');
  });

  it('names an untitled page by its address', () => {
    const { pages } = setup([visit('https://www.a.example/docs', '')]);
    expect(pages[0]!.label).toBe('a.example/docs');
  });

  it('shows six pages at most', () => {
    const history = Array.from({ length: 12 }, (_, index) =>
      visit(`https://${index}.example/`, `Page ${index}`, index),
    );
    expect(setup(history).pages).toHaveLength(6);
  });

  it('leaves out local files', () => {
    const { items } = setup([visit('file:///Users/me/secret.pdf', 'Secret')]);
    expect(items.map((item) => item.label)).toEqual(['New Window']);
  });
});
