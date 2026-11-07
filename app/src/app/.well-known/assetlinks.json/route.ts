/**
 * Digital Asset Links — the proof that jipbap.com and the Android app are us.
 *
 * ── What this unlocks ─────────────────────────────────────────────────────
 *
 * Two things, and they are the difference between an app and a browser in a
 * costume:
 *
 *   - **A TWA has no address bar.** Chrome shows one for the first few seconds
 *     of any full-screen web activity unless it can verify that the site and
 *     the APK share an owner. That verification is this file. Without it the
 *     Play Store build still runs and looks like a browser, which is the one
 *     thing a store listing must not look like.
 *   - **App Links.** A jipbap.com link tapped in a message opens the app
 *     instead of the browser, with no "open with" chooser.
 *
 * ── Why it is a route and not a static file ──────────────────────────────
 *
 * The fingerprint is a deploy-time fact, not a source-time one. Play App
 * Signing re-signs the upload with Google's own key, so the SHA-256 that ends
 * up on a user's phone is issued by Google AFTER the first upload and is not
 * knowable when this is written. Hard-coding one means a file that is wrong
 * until someone remembers to change it, and silently wrong at that: the only
 * symptom is an address bar nobody can explain.
 *
 * So it reads `ANDROID_CERT_SHA256` from the environment and serves an EMPTY
 * array when unset. Empty is the honest answer to "which apps may act as this
 * site" when the answer is "none yet", and it keeps the URL live so the
 * verifier gets a 200 with valid JSON rather than a 404 that looks like a
 * broken deploy.
 *
 * Several fingerprints are allowed, comma separated: an upload key and a Play
 * signing key are both real during a migration, and a debug build has a third.
 *
 * Set it in `app/.env.production`:
 *     ANDROID_CERT_SHA256=AB:CD:...:EF
 * The value is public by design — it is the certificate's fingerprint, not a
 * secret — which is why it can be read from a public URL at all.
 */
export const dynamic = "force-dynamic";

/** The application id the Play listing uses. Must match `twa-manifest.json`. */
const PACKAGE = process.env["ANDROID_PACKAGE"] ?? "app.jipbap.twa";

export function GET() {
  const fingerprints = (process.env["ANDROID_CERT_SHA256"] ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const body = fingerprints.length === 0 ? [] : [{
    relation: [
      "delegate_permission/common.handle_all_urls",
      /* Lets the app share this origin's cookie jar and password entries, so a
         sign-in done in the browser is already done in the app. Harmless
         without the first relation and pointless without it. */
      "delegate_permission/common.get_login_creds",
    ],
    target: {
      namespace: "android_app",
      package_name: PACKAGE,
      sha256_cert_fingerprints: fingerprints,
    },
  }];

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json",
      /* The verifier fetches this rarely and caches hard; a short max-age means
         rotating a signing key takes minutes to take effect rather than a day. */
      "cache-control": "public, max-age=300",
    },
  });
}
