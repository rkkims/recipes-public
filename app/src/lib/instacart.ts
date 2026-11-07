/**
 * Where to send someone who is missing an ingredient — the Instacart row.
 *
 * The switch from Weee! is a business decision (BUSINESS-REVIEW §11,
 * 2026-08-21): Weee!'s affiliate programme pays in store credit, is
 * invite-only, and starts at 2% — Instacart pays cash through Impact, enrols
 * openly, and covers the US and Canada. The catalogue asymmetry is accepted:
 * we hold no Instacart shelf or product data, so every answer here is the
 * honest general one — a site search on the display name — and the product
 * shelves the Weee! catalogue powered simply do not render. WEEE-SPEC §6's
 * rule survives the retailer: a link that lands somewhere useless is worse
 * than no link, and an Instacart search lands on the thing they asked for.
 *
 * ── Impact link wrapping ───────────────────────────────────────────────────
 *
 * Instacart's programme runs through Impact, which attributes by a tracking
 * redirect, not a URL parameter: the outbound link must be
 * `<tracking base><encoded destination>`. Until the account is approved the
 * base is unknown, so it lives in the environment as `IMPACT_INSTACART_BASE`
 * (everything up to and including `?u=`), and an unset base produces a
 * working, untracked link — the same posture `weee.ts` took while ITS
 * account did not exist. The tracking host is derived from the base and
 * joins the row's hosts, so `/go`'s allowlist follows the config instead of
 * needing a second edit.
 */

/** Everything up to and including `?u=`, e.g. `https://instacart.xyz123.net/c/1/2/3?u=`. */
const IMPACT_BASE = process.env["IMPACT_INSTACART_BASE"] ?? "";

const withImpact = (url: string) =>
  IMPACT_BASE ? IMPACT_BASE + encodeURIComponent(url) : url;

/** The tracking host, for the registry's allowlist. Empty when unconfigured. */
export function instacartTrackingHost(): string | null {
  if (!IMPACT_BASE) return null;
  try { return new URL(IMPACT_BASE).hostname; } catch { return null; }
}

/**
 * A URL for buying this ingredient, or null.
 *
 * With no catalogue, the search IS the shelf: Instacart is a general grocer,
 * so a search for any real ingredient lands on purchasable results. Null only
 * for an empty name — the "no link is a real answer" posture stays, it just
 * has nothing to trigger on yet.
 */
export function instacartUrlFor(name: string): string | null {
  return instacartSearchUrl(name);
}

export function instacartSearchUrl(name: string): string | null {
  const key = (name ?? "").trim().toLowerCase();
  if (!key) return null;
  return withImpact("https://www.instacart.com/store/s?k=" + encodeURIComponent(key));
}

/** The storefront, where no single search can stand for a whole list. */
export const instacartHomeUrl = () => withImpact("https://www.instacart.com/");

/** The perk line, from config beside the tracking base — never in source. */
export const instacartPerk = () => process.env["INSTACART_PERK"] ?? "";

/** No catalogue, no products, no images — empty is the honest answer, and
    every surface already survives it (that was Weee!'s contract too). */
export const instacartProductsFor = (): Array<{ id: string; title: string; url: string }> => [];
export const instacartProductImage = (): string | null => null;
