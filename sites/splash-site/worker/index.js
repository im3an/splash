// Sends www.splashbrowser.de to the bare domain; everything else is the static site.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'www.splashbrowser.de') {
      url.hostname = 'splashbrowser.de';
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
