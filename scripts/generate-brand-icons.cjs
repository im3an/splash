/** Rasterize the vector master with Chromium, then build a native macOS ICNS. */
const { app, BrowserWindow, nativeImage } = require('electron');
const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
app
  .whenReady()
  .then(async () => {
    const root = path.resolve(__dirname, '..');
    const svg = readFileSync(
      path.join(root, 'assets/brand/app-icon.svg'),
      'utf8',
    );
    const window = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true },
    });
    await window.loadURL('data:text/html,<html><body></body></html>');
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
    const iconset = path.join(root, 'assets/macos/Splash.iconset');
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
    writeFileSync(path.join(root, 'assets/macos/Splash.png'), master.toPNG());
    if (process.platform === 'darwin')
      execFileSync('iconutil', [
        '-c',
        'icns',
        iconset,
        '-o',
        path.join(root, 'assets/macos/Splash.icns'),
      ]);
    window.destroy();
    app.quit();
  })
  .catch((error) => {
    console.error(error);
    app.exit(1);
  });
