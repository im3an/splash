import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ForgeConfig, ForgePlatform } from '@electron-forge/shared-types';
import { MakerBase, type MakerOptions } from '@electron-forge/maker-base';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import {
  diskImageSteps,
  packagerSigning,
  signingFrom,
} from './src/build/signing';

/** Developer ID and notarisation when the environment names them; else ad hoc. */
const signing = signingFrom(process.env);

/**
 * A drag-to-Applications disk image, made with macOS's own `hdiutil`, so the
 * build needs no native modules. The app is copied with `ditto`, which keeps
 * its signature and symlinks intact.
 */
class MakerDMG extends MakerBase<Record<string, never>> {
  name = 'dmg';
  defaultPlatforms: ForgePlatform[] = ['darwin'];

  override isSupportedOnCurrentPlatform() {
    return process.platform === 'darwin';
  }

  override async make({
    dir,
    makeDir,
    appName,
    packageJSON,
    targetArch,
  }: MakerOptions): Promise<string[]> {
    const version = String(packageJSON.version);
    const dmgPath = resolve(
      makeDir,
      'dmg',
      targetArch,
      `${appName}-${version}-${targetArch}.dmg`,
    );
    await this.ensureFile(dmgPath);
    const staging = mkdtempSync(join(tmpdir(), 'splash-dmg-'));
    try {
      execFileSync('ditto', [
        join(dir, `${appName}.app`),
        join(staging, `${appName}.app`),
      ]);
      symlinkSync('/Applications', join(staging, 'Applications'));
      execFileSync(
        'hdiutil',
        [
          'create',
          '-volname',
          appName,
          '-srcfolder',
          staging,
          '-fs',
          'HFS+',
          '-format',
          'UDZO',
          '-ov',
          dmgPath,
        ],
        { stdio: 'inherit' },
      );
      for (const [command, args] of signing
        ? diskImageSteps(signing, dmgPath)
        : []) {
        execFileSync(command, args, { stdio: 'inherit' });
      }
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
    return [dmgPath];
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    // Keep Forge's Vite allowlist and include only the license/readme alongside
    // runtime bundles. Local configuration and environment files never ship.
    ignore: (file: string) =>
      Boolean(file) &&
      !file.startsWith('/.vite') &&
      !['/LICENSE', '/README.md'].includes(file),
    icon: 'assets/macos/Splash',
    // Bundled extensions load from disk, outside the asar archive.
    // So are the licence notices Settings › About shows. Chromium's licences
    // would otherwise sit beside the app and miss the disk image.
    extraResource: [
      'extensions',
      'assets/macos/Splash.png',
      'build/third-party-notices.txt',
      'node_modules/electron/dist/LICENSES.chromium.html',
    ],
    appBundleId: 'app.splash.browser',
    ...(signing ? packagerSigning(signing) : {}),
    appCategoryType: 'public.app-category.productivity',
    darwinDarkModeSupport: true,
    extendInfo: {
      // Lets macOS offer Splash as the default browser for web links.
      CFBundleURLTypes: [
        {
          CFBundleURLName: 'Web site URL',
          CFBundleURLSchemes: ['http', 'https'],
        },
      ],
      // Lists Splash under "Open With" in the Finder, without taking over
      // anything: an Alternate handler is never the default for these.
      CFBundleDocumentTypes: [
        {
          CFBundleTypeName: 'Web page',
          CFBundleTypeRole: 'Viewer',
          LSHandlerRank: 'Alternate',
          LSItemContentTypes: ['public.html', 'public.xhtml'],
        },
        {
          CFBundleTypeName: 'PDF document',
          CFBundleTypeRole: 'Viewer',
          LSHandlerRank: 'Alternate',
          LSItemContentTypes: ['com.adobe.pdf'],
        },
        {
          CFBundleTypeName: 'Image',
          CFBundleTypeRole: 'Viewer',
          LSHandlerRank: 'Alternate',
          LSItemContentTypes: ['public.image', 'public.svg-image'],
        },
        {
          CFBundleTypeName: 'Text',
          CFBundleTypeRole: 'Viewer',
          LSHandlerRank: 'Alternate',
          LSItemContentTypes: ['public.plain-text', 'public.json'],
        },
        {
          CFBundleTypeName: 'Audio or video',
          CFBundleTypeRole: 'Viewer',
          LSHandlerRank: 'Alternate',
          LSItemContentTypes: ['public.audio', 'public.movie'],
        },
      ],
      NSCameraUsageDescription:
        'Websites you allow can use your camera, for example for video calls.',
      NSMicrophoneUsageDescription:
        'Websites you allow can use your microphone, for example for calls.',
      NSLocationUsageDescription:
        'Websites you allow can see your approximate location.',
      NSLocationWhenInUseUsageDescription:
        'Websites you allow can see your approximate location.',
    },
  },
  rebuildConfig: {},
  hooks: {
    // Before `start` and `package`: make sure the bundled extensions and the
    // licence notices are there.
    generateAssets: async () => {
      execFileSync(process.execPath, ['scripts/fetch-extensions.mjs'], {
        stdio: 'inherit',
      });
      execFileSync(process.execPath, ['scripts/third-party-notices.mjs'], {
        stdio: 'inherit',
      });
    },
    // Packaging rewrites Info.plist after Electron's ad-hoc signature, which
    // leaves it invalid and under Electron's identity. Re-sign so macOS sees
    // a valid app.splash.browser, which camera, microphone and the keychain
    // depend on. A Developer ID build is signed by `osxSign` instead, and
    // re-signing it here would throw that signature away.
    postPackage: async (_config, { platform, outputPaths }) => {
      if (platform !== 'darwin' || signing) return;
      for (const outputPath of outputPaths) {
        const app = readdirSync(outputPath).find((name) =>
          name.endsWith('.app'),
        );
        if (!app) continue;
        execFileSync(
          'codesign',
          ['--force', '--deep', '--sign', '-', join(outputPath, app)],
          { stdio: 'inherit' },
        );
      }
    },
  },
  // The disk image is what testers install from; the zip is for updates.
  makers: [new MakerDMG({}), new MakerZIP({}, ['darwin'])],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main/main.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload/preload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
        {
          entry: 'src/preload/page-preload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
        {
          entry: 'src/preload/content-preload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
        {
          entry: 'src/preload/extension-preload.ts',
          config: 'vite.extension-preload.config.mts',
          target: 'preload',
        },
        {
          entry: 'src/preload/web-store-preload.ts',
          config: 'vite.web-store-preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses harden the packaged binary before code signing.
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
      // The shell is served from app://splash/, so file: needs nothing extra.
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
    }),
  ],
};

export default config;
