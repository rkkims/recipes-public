/**
 * The static site's one piece of routing (2026-11-06).
 *
 * The export prerenders KEPT recipes only; every other recipe is drawn in the
 * browser by the shell page (`app/src/app/recipe-shell`). So a `/recipe/<id>`
 * with no file is redirected to `/recipe-shell?id=<id>` instead of the 404
 * page.
 *
 * A redirect, not a rewrite: served under the recipe's own address, the shell
 * hydrates as a route that does not match the URL, Next's router asks for
 * `/recipe/<id>.txt`, gets a 404 and reloads — forever (seen 2026-11-06).
 *
 * Only bare recipe addresses fall back. Next's RSC and segment requests
 * (`/recipe/<id>.txt`, `/recipe/<id>/__next…`) must stay 404: the client
 * router then does a full navigation, which lands back here as a bare
 * address. Handing them HTML would break that fallback.
 *
 * Runs only for `/recipe/*` (`run_worker_first` in wrangler-site.toml);
 * everything else is served straight from the assets.
 */
interface Env {
  ASSETS: { fetch(req: Request | URL | string): Promise<Response> };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const res = await env.ASSETS.fetch(req);
    const url = new URL(req.url);
    if (res.status !== 404 || !/^\/recipe\/[^/.]+\/?$/.test(url.pathname)) return res;
    const id = url.pathname.split("/")[2];
    return Response.redirect(new URL(`/recipe-shell?id=${encodeURIComponent(id!)}`, url).toString(), 302);
  },
};
