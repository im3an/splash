/**
 * What pages are told this browser is: Chrome's address, without the app's and
 * Electron's names. Sites refuse browsers carrying them: idealo.de answers 403
 * to `Splash/1.0.0`, which is also the name of a scraping browser.
 */
export function webUserAgent(userAgent: string): string {
  return userAgent.replace(/ (?:Splash|Electron)\/\S+/g, '');
}
