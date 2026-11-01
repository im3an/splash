const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
app
  .whenReady()
  .then(async () => {
    const folder = path.resolve(__dirname, '../assets/brand');
    const svg = fs.readFileSync(
      path.join(folder, 'splash-brand-board.svg'),
      'utf8',
    );
    const win = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true },
    });
    await win.loadURL('data:text/html,<html></html>');
    const data = await win.webContents.executeJavaScript(`(async()=>{
    const img=new Image();img.src=${JSON.stringify('data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'))};await img.decode();
    const c=document.createElement('canvas');c.width=3200;c.height=3920;c.getContext('2d').drawImage(img,0,0,3200,3920);return c.toDataURL('image/png');
  })()`);
    fs.writeFileSync(
      path.join(folder, 'splash-brand-board.png'),
      Buffer.from(data.split(',')[1], 'base64'),
    );
    win.destroy();
    app.quit();
  })
  .catch((e) => {
    console.error(e);
    app.exit(1);
  });
