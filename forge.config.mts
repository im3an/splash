import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerZIP } from '@electron-forge/maker-zip';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
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
