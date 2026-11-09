/*
 * Chromium's `chrome.sidePanel`, which neither Electron nor the extensions
 * library has. Splash has no panels for extensions, so the panel opens as a
 * page, which is how a password manager's vault is usable at all. It's there
 * for any extension: one without the permission never calls it.
 *
 * Runs in the main world, so it must not use anything from outside the function.
 */
export function addSidePanel(): void {
  if (location.protocol !== 'chrome-extension:') return;
  const current: Record<string, unknown> | undefined = Reflect.get(
    globalThis,
    'chrome',
  );
  if (!current || current.sidePanel) return;

  interface Chrome {
    runtime: {
      getManifest(): { side_panel?: { default_path?: string } };
      getURL(path: string): string;
    };
    tabs: { create(details: { url: string }): unknown };
    action?: { onClicked?: { addListener(listener: () => void): void } };
  }
  // Read at each call: Electron replaces `chrome` after preloads run.
  const live = (): Chrome => Reflect.get(globalThis, 'chrome') as Chrome;
  let path: string | undefined;
  const panelPath = () =>
    path ?? live().runtime.getManifest().side_panel?.default_path;
  const open = async () => {
    const target = panelPath();
    if (target)
      await live().tabs.create({ url: live().runtime.getURL(target) });
  };
  let opensOnClick = false;
  let listening = false;

  // The library freezes `chrome` once it has added its APIs, so this one goes
  // on a copy.
  const next = Object.defineProperties(
    {},
    Object.getOwnPropertyDescriptors(current),
  );
  Object.defineProperty(next, 'sidePanel', {
    enumerable: true,
    configurable: true,
    value: {
      open,
      setOptions: async (options: { path?: string } = {}) => {
        if (options.path) path = options.path;
      },
      getOptions: async () => ({ enabled: true, path: panelPath() }),
      setPanelBehavior: async (behavior: {
        openPanelOnActionClick?: boolean;
      }) => {
        opensOnClick = behavior.openPanelOnActionClick === true;
        if (opensOnClick && !listening) {
          listening = true;
          live().action?.onClicked?.addListener(() => {
            if (opensOnClick) void open();
          });
        }
      },
      getPanelBehavior: async () => ({ openPanelOnActionClick: opensOnClick }),
    },
  });
  Reflect.set(globalThis, 'chrome', next);
}
