import type { SplashApi } from '../shared/api';

declare global {
  interface Window {
    /**
     * Exposed by the preload script; the shell's only route to the main
     * process. Absent in a plain browser, where the mock backend fills in.
     */
    splash: SplashApi;
  }
}

export const api = (): SplashApi => window.splash;
