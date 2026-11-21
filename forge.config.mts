import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
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
 * The release channel, from SPLASH_CHANNEL: stable (the default), beta,
 * preview, nightly or dev. A channel other than stable is its own app: it
 * has its own name, bundle ID, icon and profile. Run
 * `npm run brand:channel-icons` after changing a channel master.
 */
const CHANNELS = ['stable', 'beta', 'preview', 'nightly', 'dev'];
const channel = process.env.SPLASH_CHANNEL?.trim().toLowerCase() || 'stable';
if (!CHANNELS.includes(channel)) {
  throw new Error(
    `SPLASH_CHANNEL must be one of ${CHANNELS.join(', ')}, not "${channel}"`,
  );
}
/** Every channel but stable is a separate app that installs beside it. */
const appName =
  channel === 'stable'
    ? 'Splash'
    : `Splash ${channel.charAt(0).toUpperCase()}${channel.slice(1)}`;
const iconDir =
  channel === 'stable' ? 'assets/macos' : `assets/macos/channels/${channel}`;

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
    const work = mkdtempSync(join(tmpdir(), 'splash-dmg-'));
    const staging = join(work, 'root');
    const scratch = join(work, 'layout.dmg');
    const background = `assets/dmg/${channel}.tiff`;
    try {
      mkdirSync(staging);
      execFileSync('ditto', [
        join(dir, `${appName}.app`),
        join(staging, `${appName}.app`),
      ]);
      symlinkSync('/Applications', join(staging, 'Applications'));
      copyFileSync(`${iconDir}/Splash.icns`, join(staging, '.VolumeIcon.icns'));
      if (existsSync(background)) {
        mkdirSync(join(staging, '.background'));
        copyFileSync(background, join(staging, '.background/background.tiff'));
      }
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
          'UDRW',
          '-ov',
          scratch,
        ],
        { stdio: 'inherit' },
      );
      layOutDiskImage(scratch, appName, existsSync(background));
      execFileSync(
        'hdiutil',
        ['convert', scratch, '-format', 'UDZO', '-ov', '-o', dmgPath],
        { stdio: 'inherit' },
      );
      for (const [command, args] of signing
        ? diskImageSteps(signing, dmgPath)
        : []) {
        execFileSync(command, args, { stdio: 'inherit' });
      }
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
    return [dmgPath];
  }
}

/** The DMG window, in points; assets/dmg/<channel>.svg is drawn to this size. */
const DMG_WINDOW = { width: 660, height: 420 };
/** Finder's bounds include the title bar: 32 points on macOS 26 and later. */
const DMG_TITLE_BAR = 32;
/** Icon centres, matching the burst and the ripple in the background art. */
const DMG_APP_AT = [170, 190];
const DMG_APPLICATIONS_AT = [490, 190];

/**
 * Mount the read-write image and have Finder save its window layout (size,
 * icon positions, background) into the volume's .DS_Store, and flag the
 * custom volume icon. Finder is the only writer of that file macOS supports,
 * so this needs Automation access to Finder; without it the image still
 * works, just with Finder's default window.
 */
function layOutDiskImage(
  image: string,
  appName: string,
  hasBackground: boolean,
) {
  const mount = mkdtempSync(join(tmpdir(), 'splash-dmg-mount-'));
  execFileSync('hdiutil', [
    'attach',
    image,
    '-readwrite',
    '-noverify',
    '-noautoopen',
    '-mountpoint',
    mount,
  ]);
  try {
    execFileSync('SetFile', ['-a', 'C', mount]);
    const left = 200;
    const top = 120;
    const script = `
      set volumeRoot to POSIX file ${JSON.stringify(mount)} as alias
      tell application "Finder"
        open volumeRoot
        set theWindow to container window of (item volumeRoot)
        set current view of theWindow to icon view
        set toolbar visible of theWindow to false
        set statusbar visible of theWindow to false
        set pathbar visible of theWindow to false
        set sidebar width of theWindow to 0
        set bounds of theWindow to {${left}, ${top}, ${left + DMG_WINDOW.width}, ${top + DMG_TITLE_BAR + DMG_WINDOW.height}}
        set viewOptions to icon view options of theWindow
        set arrangement of viewOptions to not arranged
        set icon size of viewOptions to 128
        set text size of viewOptions to 13
        set shows item info of viewOptions to false
        set shows icon preview of viewOptions to false
        ${hasBackground ? `set background picture of viewOptions to file ".background:background.tiff" of (item volumeRoot)` : ''}
        set extension hidden of item ${JSON.stringify(`${appName}.app`)} of (item volumeRoot) to true
        set position of item ${JSON.stringify(`${appName}.app`)} of (item volumeRoot) to {${DMG_APP_AT.join(', ')}}
        set position of item "Applications" of (item volumeRoot) to {${DMG_APPLICATIONS_AT.join(', ')}}
        update (item volumeRoot) without registering applications
        delay 1
        close theWindow
        delay 1
      end tell`;
    try {
      execFileSync('osascript', ['-e', script], { stdio: 'inherit' });
    } catch (error) {
      console.warn(
        'Finder could not lay out the disk image window (is Automation access to Finder allowed?); building it with the default window.',
        error,
      );
    }
    execFileSync('sync');
  } finally {
    execFileSync('hdiutil', ['detach', mount, '-force']);
    rmSync(mount, { recursive: true, force: true });
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
    icon: `${iconDir}/Splash`,
    // Bundled extensions load from disk, outside the asar archive.
    // So are the licence notices Settings › About shows. Chromium's licences
    // would otherwise sit beside the app and miss the disk image.
    extraResource: [
      'extensions',
      `${iconDir}/Splash.png`,
      'build/third-party-notices.txt',
      'node_modules/electron/dist/LICENSES.chromium.html',
    ],
    ...(channel === 'stable' ? {} : { name: appName }),
    appBundleId:
      channel === 'stable'
        ? 'app.splash.browser'
        : `app.splash.browser.${channel}`,
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
      execFileSync(process.execPath, ['scripts/build-helper-extension.mjs'], {
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
