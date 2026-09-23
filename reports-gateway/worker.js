/**
 * Public report gateway.
 *
 * The workbench itself sits behind Cloudflare Access: only signed-in researchers reach it.
 * Shared client reports must open without a login, so this worker exposes a deliberately tiny
 * surface — the report page, its assets, and the review endpoint — and forwards those requests
 * to the workbench over a service binding. Everything else is refused here, so a mistake in this
 * file cannot expose the authenticated application.
 *
 * Report links carry their own expiring, revocable token; the workbench validates it.
 */

const ALLOWED = [
  { method: "GET", prefix: "/r/" },                 // the shared report page
  { method: "GET", prefix: "/_next/" },             // its stylesheet and client bundle
  { method: "GET", prefix: "/favicon" },
  { method: "POST", exact: "/api/report-review" },  // a client comment on a finding
];

// Identity headers are stripped: a request arriving here is anonymous by definition, and must
// never be able to present itself to the workbench as a signed-in researcher.
const STRIPPED = ["cf-access-jwt-assertion", "cf-access-authenticated-user-email", "cookie"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const permitted = ALLOWED.some(rule =>
      rule.method === request.method &&
      (rule.exact ? url.pathname === rule.exact : url.pathname.startsWith(rule.prefix)));

    if (!permitted) {
      return new Response("Not found. This address serves shared brand research reports only.", {
        status: 404,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
      });
    }

    const headers = new Headers(request.headers);
    for (const name of STRIPPED) headers.delete(name);
    for (const name of [...headers.keys()]) if (name.startsWith("oai-authenticated-user")) headers.delete(name);

    const response = await env.WORKBENCH.fetch(new Request(request, { headers }));
    const out = new Response(response.body, response);
    out.headers.set("X-Robots-Tag", "noindex, nofollow");
    return out;
  },
};
