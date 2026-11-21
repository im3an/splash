/**
 * Rasterize each disk-image background master (assets/dmg/<channel>.svg)
 * with Chromium at 1x and 2x, and join the pair into the HiDPI TIFF Finder
 * shows behind the DMG window (assets/dmg/<channel>.tiff). The masters are
 * 660 × 420 points: the size of the window the DMG maker opens.
 *
 * Run with: npm run brand:dmg-backgrounds
 */
const { app, BrowserWindow, nativeImage } = require('electron');
const { readFileSync, readdirSync, writeFileSync, rmSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const WIDTH = 660;
const HEIGHT = 420;

app
  .whenReady()
  .then(async () => {
    const dir = path.resolve(__dirname, '..', 'assets/dmg');
    const window = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true },
    });
    await window.loadURL('data:text/html,<html><body></body></html>');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.svg'))) {
      const name = path.basename(file, '.svg');
      const svg = readFileSync(path.join(dir, file), 'utf8');
      const pngs = [];
      for (const scale of [1, 2]) {
        const data = await window.webContents.executeJavaScript(`(async () => {
          const image = new Image();
          image.src = ${JSON.stringify('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'))};
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = ${WIDTH * scale};
          canvas.height = ${HEIGHT * scale};
          canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL();
        })()`);
        const png = path.join(dir, `${name}${scale === 2 ? '@2x' : ''}.png`);
        writeFileSync(png, nativeImage.createFromDataURL(data).toPNG());
        pngs.push(png);
      }
      if (process.platform === 'darwin') {
        execFileSync('tiffutil', [
          '-cathidpicheck',
          ...pngs,
          '-out',
          path.join(dir, `${name}.tiff`),
        ]);
        for (const png of pngs) rmSync(png);
      }
    }
    window.destroy();
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
