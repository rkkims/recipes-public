/**
 * The outbound choke point — ATTRIBUTION-SPEC §§2–3.
 *
 * Every shopping link in the product points here, and this route records the
 * click and 302s onward. A redirect rather than a client beacon because a
 * beacon can lose the race with navigation and a redirect cannot: middle
 * click, open-in-new-tab, JS off — the click is recorded in every case,
 * server-side, before the user leaves.
 *
 * ── The open-redirect guard ────────────────────────────────────────────────
 *
 * A route that redirects wherever `u` says is a phishing primitive wearing
 * our hostname. The allowlist is the fix, and it is a set of exact hosts, not
 * a substring test — `weee.com.evil.example` must not pass.
 *
 * ── The click id ───────────────────────────────────────────────────────────
 *
 * Per-click, opaque, single-use (ATTRIBUTION-SPEC §3). The client mints it at
 * click time and keeps its own copy (§7's device-held mapping); a link opened
 * with no id — JS off, a shared URL — gets one minted here, so the retailer
 * side is never unkeyed. It rides the outbound URL as `sub_id` alongside the
 * affiliate tag `weee.ts` already applied. No user id: a stable per-user
 * subID is a disclosure (ATTRIBUTION-SPEC §4), and this route never learns
 * who clicked.
 */
import { type NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { appendEvent } from "@/lib/events";
import { isSearchUrl, retailerForHost } from "@/lib/retailers";

export const dynamic = "force-dynamic";

/* Every placement a link is actually built from, plus the `_all` variants
   `affiliate.tsx` derives by suffix. The old list named `chip`, which nothing
   emits, and omitted `list`, `list_row`, `list_combined` and `nearly` — so
   every real click recorded "unknown" and §c's which-placement-earns question
   had no answer. Kept identical to `workers/go.ts`, which answers the same
   request after the cutover. */
const SURFACES = new Set([
  "list", "list_all",
  "list_row",
  "list_combined", "list_combined_all",
  "nearly", "nearly_all",
  "modal_product", "modal_product_all", "modal_all",
]);

export function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;

  let url: URL;
  try {
    url = new URL(q.get("u") ?? "");
  } catch {
    return NextResponse.redirect(new URL("/", req.url));
  }
  // The registry IS the allowlist — RETAILER-SPEC §6. One lookup answers both
  // "may we redirect here" and "whose link was this", so the two can never
  // disagree.
  const retailer = retailerForHost(url.hostname);
  // Home, not an error page: the only way to hold a bad link is a crafted or
  // truncated one, and a person holding it should land somewhere real.
  if (url.protocol !== "https:" || !retailer) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const sent = q.get("cid") ?? "";
  const cid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sent)
    ? sent
    : randomUUID();

  const ingredient = q.get("i") ?? "";
  const surface = q.get("s") ?? "";
  appendEvent("outbound_click", {
    click_id: cid,
    retailer: retailer.id,
    surface: SURFACES.has(surface) ? surface : "unknown",
    // Validated, not trusted: this lands in the record, and the record's
    // discipline is canonical ids only. A malformed one becomes absence.
    ingredient_id: /^[\w-]{1,64}$/.test(ingredient) && !ingredient.startsWith("txt_")
      ? ingredient
      : "",
    had_products: q.get("p") === "1",
    // Shelf and search are the two answers `urlFor` gives; which one this click
    // got is the `resolved` flag ATTRIBUTION-SPEC §2 asks for. The shape of a
    // search path is the retailer's own fact, not this route's.
    resolved: !isSearchUrl(retailer, url),
  });

  url.searchParams.set("sub_id", cid);
  return NextResponse.redirect(url.toString(), 302);
}
