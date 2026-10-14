// Forwards Gemini API calls to Google from a supported region. The prod VM is
// in Hong Kong, where Google refuses the Gemini API ("User location is not
// supported"). The backend's GEMINI_BASE_URL = https://<worker>/<PROXY_TOKEN>.
const GOOGLE = "https://generativelanguage.googleapis.com";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const prefix = `/${env.PROXY_TOKEN}/`;
    if (!env.PROXY_TOKEN || !url.pathname.startsWith(prefix)) {
      return new Response("Not found", { status: 404 });
    }
    const target = GOOGLE + url.pathname.slice(prefix.length - 1) + url.search;
    const headers = new Headers(request.headers);
    for (const h of ["host", "cf-connecting-ip", "x-forwarded-for", "x-real-ip"]) headers.delete(h);
    return fetch(target, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    });
  },
};
