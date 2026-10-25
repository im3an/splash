import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    // Bundled extensions load from disk, outside the asar archive.
    extraResource: ['extensions'],
    appBundleId: 'app.splash.browser',
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
    // Before `start` and `package`: make sure the bundled extensions are there.
    generateAssets: async () => {
      execFileSync(process.execPath, ['scripts/fetch-extensions.mjs'], {
        stdio: 'inherit',
      });
    },
    // Packaging rewrites Info.plist after Electron's ad-hoc signature, which
    // leaves it invalid and under Electron's identity. Re-sign so macOS sees
    // a valid app.splash.browser, which camera, microphone and the keychain
    // depend on. Replace this with `osxSign` once there's a Developer ID.
    postPackage: async (_config, { platform, outputPaths }) => {
      if (platform !== 'darwin') return;
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
  makers: [new MakerZIP({}, ['darwin'])],
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
    }),
  ],
};

export default config;
