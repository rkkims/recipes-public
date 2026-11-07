import type { CapacitorConfig } from "@capacitor/cli";

/**
 * The native shell — iOS and Android, around the site that already exists.
 *
 * ── It loads the live site, it does not bundle a copy ────────────────────
 *
 * `server.url` rather than a `webDir` of built assets, and that is the whole
 * architectural decision. jipbap is server-rendered: React Server Components,
 * server actions, a store on disk. There is no static export of it and there
 * will not be one. Bundling would mean building a second product — a JSON API
 * plus a client that talks to it — and then keeping two of everything in step.
 *
 * What that buys, beyond not doing months of work: the app updates when the
 * site does. A copy fix ships to every installed phone on the next deploy with
 * no review queue. What it costs: the app needs a network to do anything, which
 * is already true of the website and is stated plainly by the offline page the
 * service worker falls back to.
 *
 * ── Why the origin matters more than it looks ────────────────────────────
 *
 * With `server.url` set, the WebView's origin IS https://jipbap.com, so the
 * session cookie is a first-party cookie and sign-in works with no changes to
 * how auth is written. The alternative — bundled assets on `capacitor://
 * localhost` calling the server cross-origin — would need `SameSite=None` on
 * the session cookie, which weakens it everywhere including the plain website,
 * to buy something we do not want.
 *
 * This is also why the domain must exist before this can be built at all: an
 * `androidScheme` of https plus a `server.url` on a name that does not resolve
 * is an app that opens to an error.
 */
const config: CapacitorConfig = {
  appId: "app.jipbap",
  appName: "JipBap",
  /* Required by the type even though nothing is bundled. It stays empty and is
     never read while `server.url` is set — see above. */
  webDir: "public",

  server: {
    url: "https://jipbap.com",
    /* Android must use the https scheme so the WebView origin matches the site
       and cookies behave as first-party. The default `http` scheme would make
       every cookie a third-party one to itself. */
    androidScheme: "https",
    /* No cleartext, ever. If the certificate is broken the app should fail
       loudly rather than quietly downgrade — the session cookie is `secure`
       and would simply stop being sent, which presents as "sign-in does
       nothing" and is impossible to diagnose from a bug report. */
    cleartext: false,
    /* Only our own origin loads in the app frame. Anything else — a Weee
       affiliate link, a YouTube recipe, a privacy policy hosted elsewhere —
       opens in the system browser, which is both the honest behaviour and an
       App Store expectation: a user must be able to see the address of a page
       that is not ours. */
    allowNavigation: ["jipbap.com", "jipbap.app"],
  },

  ios: {
    /* The site paints its own background; a white shell flashes on launch for
       a dark-mode user before the first frame arrives. */
    backgroundColor: "#0f1a14",
    /* Links that are not ours go to Safari rather than an in-app browser we
       would then have to put chrome on. */
    limitsNavigationsToAppBoundDomains: true,
  },

  android: {
    backgroundColor: "#0f1a14",
    /* Play requires a target SDK floor that moves every year; leaving this to
       the platform's default means one less number to forget. */
    allowMixedContent: false,
  },
};

export default config;
