/**
 * The service worker — UX-SPEC §12.
 *
 * ── What this can honestly promise ────────────────────────────────────────
 *
 * §12's offline table says the pantry, the grocery list and matching all work
 * offline. That was written against an app whose state is local. This one keeps
 * every ingredient, plan and cook in `owners.json` on the server, keyed by a
 * cookie, and renders every page there — so nothing here can make a WRITE work
 * with no signal, and no amount of caching will change that. Claiming otherwise
 * would be the exact failure §12 warns about with "cook offline": a cached
 * surface that leads to a dead tap.
 *
 * So this worker promises the smaller true thing:
 *
 *   - the app OPENS with no signal, instead of showing the browser's error page
 *   - the last version of a page you visited is readable
 *   - static assets never re-download, so a warm launch is instant
 *
 * and the page says plainly when it is offline (`Offline` component) rather
 * than letting a tap fail silently.
 *
 * ── Strategies ────────────────────────────────────────────────────────────
 *
 *   - `/_next/static/*` — cache first, forever. The filenames are content
 *     hashed, so a stale hit is impossible and a new build simply asks for new
 *     names.
 *   - navigations — network first, falling back to the cached copy of that URL,
 *     falling back to the offline page. Network first because a cached page
 *     shows a pantry that may be minutes stale, and being right matters more
 *     than being fast on a connection that works.
 *   - everything else (server actions, POSTs, the ingredient search, the
 *     hot-linked recipe photos on other people's origins) — untouched. A cached
 *     server action would be a write that lies.
 */

/**
 * Bump this on any release that changes what a cached page looks like.
 *
 * `activate` deletes every cache whose name does not end in the current
 * VERSION, so changing this string is what throws the old ones away. Leaving it
 * alone is what makes a stale page survive a deploy.
 *
 * ── The failure it actually causes ────────────────────────────────────────
 *
 * Navigations are network-first, so in the ordinary case a deploy is picked up
 * on the next load and none of this matters. The case that bites is a fetch
 * that FAILS — a restart, a dropped connection, a phone on a lift — because
 * then the fallback serves the cached copy of that URL, and the cached copy is
 * whatever the page looked like the last time it loaded. It stays served until
 * a network load succeeds AND the user reloads. Someone who reloads during a
 * restart can sit on a version of the app from an hour ago and have no way to
 * tell, which is precisely how a deploy comes to look like it did nothing.
 *
 * Changing this file at all is what triggers the browser to re-check the
 * worker, so the bump does two jobs: it installs the new worker and it clears
 * what the old one kept.
 */
/*
  v109 — `/list`, `/calendar`, `/recipe/[id]` and `/my-recipes` moved to the
  device (STATIC-SPEC §2, slice C).

  Same reason as v108's bump and the last of them: every cached copy of those
  four pages is HTML whose owner half was rendered from `owners.json`, and
  serving one to a browser that now holds its own pantry would draw a list, a
  week or a chip row computed from a state the device has since changed.

  ── `/list` stops being precached, and the precache list is now empty ──────

  The install step fetched `/list` cold WITH THIS CLIENT'S COOKIES, because the
  page was per-owner HTML and "works offline if you happened to visit it since
  the last deploy" is a promise that fails exactly in an aisle. Both halves of
  that argument are gone:

    - the page is no longer per-owner. Its owner half is `localStorage` and its
      shell is the same HTML for everyone, so a cached copy is worth exactly
      what the navigation handler's own copy is worth
    - caching a response fetched with cookies is a liability once nothing on
      the page needs them. A shared device, a signed-out session, a second
      profile — the cached bytes outlive the reason they were personal

  So `PRECACHE_PAGES` is empty. `/list` is still readable with no signal via the
  navigation fallback below once visited, the WRITES work with no signal because
  they are `localStorage` writes (`lib/queue` now parks only the server's mirror
  of them), and the offline page still covers a cold arrival. If the cold-start
  guarantee is wanted back, the honest form is precaching the SHELL — which is
  what the static build (§5) makes possible and what stage 2 should decide.
*/
const VERSION = "v109";
const SHELL = `shell-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const OFFLINE_URL = "/offline";

/**
 * Precached at INSTALL, not just after a visit — CREATORS-TAB-SPEC §8.
 *
 * Empty since v109, and the reason is in the VERSION note above: this held
 * `/list`, which was per-owner HTML fetched with the installing client's own
 * cookies. The page's owner half comes from the device now, so the copy would
 * be neither personal nor useful — and a cookie-bearing response in a cache
 * that outlives the session is a liability rather than a feature.
 *
 * Kept as a list rather than deleted: the mechanism is right and the static
 * build (STATIC-SPEC §5) is what gives it something worth holding — a SHELL,
 * identical for everyone, that a cold arrival can open with no signal.
 *
 * Best-effort, unlike the offline page: a page failing to cache (a captive
 * portal mid-install) must not fail the whole install — a worker with no
 * offline page at all is the worse outcome.
 */
const PRECACHE_PAGES = [];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.add(OFFLINE_URL))
      .then(() => caches.open(PAGES).then((c) =>
        Promise.all(PRECACHE_PAGES.map((p) => c.add(p).catch(() => {})))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GET. A cached POST is a write that lies about having happened.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Someone else's origin — recipe photos, mostly. Not ours to cache, and an
  // opaque response would poison the quota for the things that are.
  if (url.origin !== self.location.origin) return;

  // Server actions and RSC payloads carry per-owner state; never store them.
  if (url.searchParams.has("_rsc") || request.headers.get("RSC")) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((hit) =>
        hit ?? fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(request, copy));
          return res;
        })),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(PAGES).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() =>
          caches.match(request).then((hit) =>
            hit ?? caches.match(OFFLINE_URL).then((p) =>
              p ?? new Response("Offline", { status: 503 })))),
    );
  }
});

/**
 * Push, for the one thing §12 says push is for.
 *
 * *"'Use first' is the entire urgency mechanism, and a pin is the user telling
 * us something is dying. Without a way to reach them later, that signal expires
 * unused in a tab nobody reopened."* Only ever from a user-initiated pin —
 * never re-engagement, never "new recipes this week".
 *
 * The listener exists so the worker is ready; nothing sends yet. That needs a
 * push service, VAPID keys and a subscription store, none of which exist.
 */
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try { payload = event.data.json(); } catch { return; }
  if (!payload || !payload.title) return;
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: "/icons/192",
    badge: "/icons/192",
    data: { url: payload.url || "/" },
    tag: payload.tag,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      // Reuse an open window rather than stacking another copy of the app.
      const open = wins.find((w) => "focus" in w);
      if (open) { open.navigate(target); return open.focus(); }
      return self.clients.openWindow(target);
    }),
  );
});
