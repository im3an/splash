interface Resizable {
  resize(size: { width: number; height: number }): unknown;
}

/**
 * A packaged Splash has its icon in the bundle, so the Dock already shows it.
 * Setting it again keeps the 1024-pixel image as a 32 MB bitmap in the main
 * process, about 38 MB of its footprint. A development run is Electron's
 * bundle, so it still needs the icon, at the most the Dock draws: 512 pixels.
 */
export function showBrandInDock({
  isPackaged,
  dock,
  load,
  iconPath,
}: {
  isPackaged: boolean;
  dock: { setIcon(image: never): void } | undefined;
  load: (path: string) => Resizable;
  iconPath: string;
}): void {
  if (isPackaged || !dock) return;
  dock.setIcon(load(iconPath).resize({ width: 512, height: 512 }) as never);
}
