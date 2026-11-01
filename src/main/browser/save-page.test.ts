import type { BaseWindow, WebContents } from 'electron';
import { savePage } from './save-page';
const dialogs = vi.hoisted(() => ({ save: vi.fn(), message: vi.fn() }));
vi.mock('electron', () => ({
  dialog: { showSaveDialog: dialogs.save, showMessageBox: dialogs.message },
}));
function setup() {
  const page = {
    id: 7,
    isDestroyed: () => false,
    getTitle: () => 'Design / notes',
    savePage: vi.fn(async () => undefined),
  };
  const window = { isDestroyed: () => false } as BaseWindow;
  const saved = vi.fn();
  return {
    page,
    saved,
    run: () => savePage(window, page as unknown as WebContents, saved),
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  dialogs.save.mockResolvedValue({
    canceled: false,
    filePath: '/tmp/notes.mhtml',
  });
});
it('saves an archive and confirms only after completion', async () => {
  const { page, saved, run } = setup();
  await run();
  expect(page.savePage).toHaveBeenCalledWith('/tmp/notes.mhtml', 'MHTML');
  expect(saved).toHaveBeenCalledWith('notes.mhtml');
});
it('cancels without saving or reporting success', async () => {
  dialogs.save.mockResolvedValue({ canceled: true });
  const { page, saved, run } = setup();
  await run();
  expect(page.savePage).not.toHaveBeenCalled();
  expect(saved).not.toHaveBeenCalled();
});
it('retries a failed write without duplicating the save dialog', async () => {
  const { page, saved, run } = setup();
  page.savePage.mockRejectedValueOnce(new Error('full'));
  dialogs.message.mockResolvedValue({ response: 0 });
  await run();
  expect(page.savePage).toHaveBeenCalledTimes(2);
  expect(dialogs.save).toHaveBeenCalledOnce();
  expect(saved).toHaveBeenCalledOnce();
});
it('ignores a repeated shortcut while the save dialog is open', async () => {
  let finish!: (value: { canceled: boolean }) => void;
  dialogs.save.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { run } = setup();
  const first = run();
  await run();
  expect(dialogs.save).toHaveBeenCalledOnce();
  finish({ canceled: true });
  await first;
});
