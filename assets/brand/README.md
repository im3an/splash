# Splash identity

Splash is the established product name. The mark is a ripple: a drop resting over the curve it leaves on the surface. Every trail starts with one page, and spreads from it. Both shapes are flat and solid on a 32-unit grid; the gap between drop and ripple stays open down to 16 pixels.

## Assets

- `mark.svg`: primary monochrome ink (#221d17).
- `mark-reversed.svg`: paper (#faf8f5) for dark backgrounds.
- `mark-accent.svg`: restrained terracotta (#b4542d).
- `app-icon.svg`: 1024-unit vector master, warm charcoal tile (#1a1714, Splash’s dark frame) with the mark in light terracotta (#e3906a) and transparent macOS margins.
- `../macos/Splash.iconset`: 16, 32, 128, 256 and 512-point PNGs, each at 1× and 2× (through 1024 pixels).
- `../macos/Splash.icns`: packaged macOS icon; `Splash.png` serves the development Dock and About panel.

Use the unframed monochrome mark within the application. `BrandMark` adapts it to the current text color (every `#221d17` in the master becomes `currentColor`) without changing the master geometry. Reserve the accent and tile for product assets; website favicon fallbacks remain neutral globes so they cannot be mistaken for Splash pages.

Pair the mark with **Splash**, in the system UI font, semibold, with −0.025em tracking. The reusable `Brand` component owns this lockup. Use an 8px gap at a 24px mark size. Keep at least one ripple width of clear space, do not stretch or rotate, and do not add gradients, glows, or details. At 16px use the mark alone.

## Regeneration

From the repository root, run `npm run brand:icons`. This uses the installed Electron/Chromium renderer to rasterize the SVG master. On macOS it also runs `iconutil` to regenerate the ICNS. Commit regenerated assets together with master changes. Forge reads the checked-in icon directly; packaging does not require an image conversion dependency.

The native About panel receives the real app version at runtime. The settings About section retains its existing version and engine information.

## Brand board

`splash-brand-board.svg` is the editable vector board. `splash-brand-board.png` is the 3200 × 3920 sharing preview. The `wordmark-primary.svg`, `wordmark-accent.svg`, and `wordmark-reversed.svg` files provide reusable horizontal lockups with editable system-font text. Font appearance follows the viewer’s installed fonts; the PNG preserves the macOS rendering.

Regenerate the board with `python3 scripts/create-brand-board.py` followed by `node_modules/.bin/electron scripts/render-brand-board.cjs`.
