/**
 * The outbound choke point, as a Worker — STATIC-SPEC §4, ATTRIBUTION-SPEC §§2–3.
 *
 * A faithful port of `app/src/app/go/route.ts`. Same allowlist, same click-id
 * contract, same 302, same five dimensions in the log. The route it replaces
 * stays exactly where it is: in server mode nothing is routed here, and the two
 * are meant to be interchangeable so that the cutover is a DNS act rather than
 * a behavioural one.
 *
 * Deployed by:  npx wrangler deploy -c deploy/cloudflare/wrangler-go.toml
 *
 * ── Why a redirect and not a beacon ───────────────────────────────────────
 *
 * A beacon can lose the race with navigation and a redirect cannot: middle
 * click, open-in-new-tab, JS off — the click is recorded in every case, before
 * the user leaves.
 *
 * ── The open-redirect guard ───────────────────────────────────────────────
 *
 * A URL that redirects wherever `u` says is a phishing primitive wearing our
 * hostname. The allowlist is the fix, and it is a set of EXACT hosts, never a
 * substring test — `weee.com.evil.example` must not pass, and neither must
 * `notweee.com`. The set is generated at build from the retailer registry
 * (`src/static/build-data.ts` → `static-data/retailers.json`), which is
 * RETAILER-SPEC §6's rule: the registry IS the allowlist, so a retailer cannot
 * be added to one and forgotten in the other.
 *
 * ── The click id ──────────────────────────────────────────────────────────
 *
 * Per-click, opaque, single-use. The client mints it at click time and keeps
 * its own copy (ATTRIBUTION-SPEC §7's device-held mapping); a link opened with
 * no id — JS off, a shared URL — gets one minted here, so the retailer side is
 * never unkeyed. It rides the outbound URL as `sub_id` alongside whatever
 * affiliate tag the link already carried.
 *
 * **No user id, ever.** A stable per-user subID is a disclosure
 * (ATTRIBUTION-SPEC §4). This Worker never learns who clicked: it reads no
 * cookie, sets none, and writes no identifier of any kind into the dataset.
 *
 * ── The path is ignored, deliberately ─────────────────────────────────────
 *
 * After the cutover this runs at `jipbap.com/go`; before it, at the bare root
 * of a `workers.dev` subdomain so a preview site can point at it. Both are the
 * same request as far as this is concerned — everything it needs is in the
 * query — so it answers on any path and there is no second form of the URL to
 * keep in step.
 */
import registry from "../static-data/retailers.json";

type Row = { id: string; hosts: string[]; search_path?: string };
type Env = {
  /** Workers Analytics Engine — free tier, and nothing personal in it. */
  CLICKS?: { writeDataPoint(p: {
    blobs?: string[]; doubles?: number[]; indexes?: string[];
  }): void };
};

/** Where a bad link lands. Home, not an error page — see `land`. */
const HOME = "https://jipbap.com/";

/**
 * Every placement an outbound link is actually built from, and the `_all`
 * variants `affiliate.tsx` derives by suffix.
 *
 * The old list named `chip` — a surface nothing emits — while missing `list`,
 * `list_row`, `list_combined` and `nearly`, which is all of them. So every
 * real click recorded `surface: "unknown"`, and ATTRIBUTION-SPEC §c's
 * question (which placement earns) had no answer in the record. Corrected
 * 2026-08-24, against the emitters rather than against memory; the server
 * route carries the same set for the same reason.
 */
const SURFACES = new Set([
  "list", "list_all",
  "list_row",
  "list_combined", "list_combined_all",
  "nearly", "nearly_all",
  "modal_product", "modal_product_all", "modal_all",
]);

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The record's discipline: canonical ids only, and never a free-text row. */
const ID = /^[\w-]{1,64}$/;

/**
 * Host → the retailer that owns it, or null — **and therefore the allowlist**.
 *
 * One lookup answers both "may we redirect here" and "whose link was this", the
 * same way `retailerForHost` does on the server. Two mechanisms — a host set to
 * permit and a separate id to record — can disagree, and the way they disagree
 * is a host that redirects but records as the wrong retailer.
 *
 * Built once at module scope: a Worker isolate serves many requests, and this
 * table changes when the build changes.
 */
const BY_HOST = new Map<string, Row>();
for (const r of (registry as { rows: Row[] }).rows)
  for (const host of r.hosts) BY_HOST.set(host.toLowerCase(), r);

export default {
  fetch(req: Request, env: Env): Response {
    const q = new URL(req.url).searchParams;

    let url: URL;
    try {
      url = new URL(q.get("u") ?? "");
    } catch {
      return land(HOME);
    }

    const retailer = BY_HOST.get(url.hostname.toLowerCase());
    /* https only, and a known host. The only way to hold a link that fails
       either test is a crafted or truncated one, and a person holding it
       should land somewhere real rather than on an error. */
    if (url.protocol !== "https:" || !retailer) return land(HOME);

    const sent = q.get("cid") ?? "";
    const cid = UUID_V4.test(sent) ? sent : crypto.randomUUID();

    const ingredient = q.get("i") ?? "";
    const surface = q.get("s") ?? "";
    /* Validated, not trusted: this lands in the record, and a malformed id
       becomes absence rather than a row nobody can join on. `txt_` is a
       free-text pantry row and must never reach the log (BEHAVIOR-SPEC §6). */
    const ingredientId = ID.test(ingredient) && !ingredient.startsWith("txt_")
      ? ingredient : "";
    /* Shelf or search — the `resolved` flag ATTRIBUTION-SPEC §2 asks for. The
       shape of a search path is the retailer's own fact, carried in the
       registry row rather than known here. */
    const resolved = !(retailer.search_path
      && url.pathname.startsWith(retailer.search_path));

    /**
     * One row per click, and nothing in it identifies a person.
     *
     * `indexes` is the sampling key, so the retailer goes there — the one
     * dimension every question is grouped by. The click id is a blob rather
     * than an index: it is high-cardinality by construction (one per click)
     * and indexing it would sample the dataset to uselessness.
     *
     * Wrapped, because a failure to RECORD a click must never cost the click.
     * That is ATTRIBUTION-SPEC §2's one hard rule, and it applies to a Worker
     * exactly as it applies to `lib/beacon`.
     */
    try {
      env.CLICKS?.writeDataPoint({
        indexes: [retailer.id],
        blobs: [
          "outbound_click",
          cid,
          retailer.id,
          SURFACES.has(surface) ? surface : "unknown",
          ingredientId,
        ],
        doubles: [q.get("p") === "1" ? 1 : 0, resolved ? 1 : 0],
      });
    } catch {
      /* an unrecorded click is a gap; a thrown one is a broken link */
    }

    url.searchParams.set("sub_id", cid);
    return land(url.toString());
  },
};

/**
 * 302, and no caching anywhere.
 *
 * A cached redirect would hand a second person the first person's `sub_id`,
 * which is the one thing a per-click id must never be. 302 rather than 301 for
 * the same reason: a permanent redirect is exactly what a browser is entitled
 * to remember.
 */
function land(to: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      location: to,
      "cache-control": "no-store",
      /* The retailer sees the click, not the page it came from — the same
         posture the `rel="noreferrer"` on every outbound anchor already sets,
         restated here because a redirect is where it would otherwise leak. */
      "referrer-policy": "no-referrer",
    },
  });
}
