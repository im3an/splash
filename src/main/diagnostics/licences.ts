import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { app, shell } from 'electron';
import type { LicenceName } from '../../shared/types';

/** Where each notice is: inside the app when packaged, the checkout in development. */
function licenceFile(name: LicenceName | 'chromium'): string {
  switch (name) {
    case 'splash':
      // Packaging keeps LICENSE beside the app's code.
      return path.join(app.getAppPath(), 'LICENSE');
    case 'third-party':
      return app.isPackaged
        ? path.join(process.resourcesPath, 'third-party-notices.txt')
        : path.join(app.getAppPath(), 'build', 'third-party-notices.txt');
    case 'chromium':
      return app.isPackaged
        ? path.join(process.resourcesPath, 'LICENSES.chromium.html')
        : path.join(
            app.getAppPath(),
            'node_modules/electron/dist/LICENSES.chromium.html',
          );
  }
}

export async function readLicence(name: LicenceName): Promise<string> {
  try {
    return await readFile(licenceFile(name), 'utf8');
  } catch (error) {
    console.error(`Could not read the ${name} licence`, error);
    return '';
  }
}

/** Chromium's licences are a 15 MB page; the Mac's default app shows it. */
export function openChromiumLicences(): void {
  void shell.openPath(licenceFile('chromium'));
}
