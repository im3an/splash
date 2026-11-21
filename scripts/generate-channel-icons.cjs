/**
 * Rasterize each release channel's vector master (assets/brand/channels/*.svg)
 * with Chromium and build its macOS ICNS under assets/macos/channels/<name>/.
 * Stable keeps the brand icon in assets/macos, so it is not built here.
 */
const { app, BrowserWindow, nativeImage } = require('electron');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const CHANNELS = ['beta', 'preview', 'nightly', 'dev'];

app
  .whenReady()
  .then(async () => {
    const root = path.resolve(__dirname, '..');
    const window = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true },
    });
    await window.loadURL('data:text/html,<html><body></body></html>');
    for (const channel of CHANNELS) {
      const svg = readFileSync(
        path.join(root, `assets/brand/channels/${channel}.svg`),
        'utf8',
      );
      const data = await window.webContents.executeJavaScript(`(async () => {
        const image = new Image();
        image.src = ${JSON.stringify('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'))};
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1024;
        canvas.getContext('2d').drawImage(image, 0, 0, 1024, 1024);
        return canvas.toDataURL();
      })()`);
      const master = nativeImage.createFromDataURL(data);
      const out = path.join(root, 'assets/macos/channels', channel);
      const iconset = path.join(out, 'Splash.iconset');
      mkdirSync(iconset, { recursive: true });
      for (const size of [16, 32, 128, 256, 512]) {
        for (const scale of [1, 2]) {
          writeFileSync(
            path.join(
              iconset,
              `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`,
            ),
            master
              .resize({
                width: size * scale,
                height: size * scale,
                quality: 'best',
              })
              .toPNG(),
          );
        }
      }
      writeFileSync(path.join(out, 'Splash.png'), master.toPNG());
      if (process.platform === 'darwin')
        execFileSync('iconutil', [
          '-c',
          'icns',
          iconset,
          '-o',
          path.join(out, 'Splash.icns'),
        ]);
    }
    window.destroy();
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
