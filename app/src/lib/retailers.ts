/**
 * The retailer registry — RETAILER-SPEC §2.
 *
 * A retailer is a **row**, not a module: the product knows about shelves,
 * offers and regions, and never about Weee!. This file is the table; each
 * retailer's own module (`weee.ts` today) stays a plain set of functions with
 * no knowledge that an interface exists.
 *
 * The import direction is deliberate and one-way — `retailers.ts` imports from
 * `weee.ts`, never the reverse. A retailer module that imported the registry
 * would make the registry uneditable without touching every retailer, which is
 * the coupling this file exists to remove.
 *
 * ── Server-only ────────────────────────────────────────────────────────────
 *
 * Retailer modules read the catalogue off disk (`node:fs`), so this module is
 * server-only by transitive dependency. Nothing here may be imported from a
 * client component; the client's half of the affiliate lives in
 * `components/affiliate.tsx` and deals in URLs it was handed, not in
 * retailers.
 */
import { INSTACART_BRAND, WEEE_BRAND, type RetailerBrand } from "./retailer-brand";
import {
  instacartHomeUrl,
  instacartPerk,
  instacartProductImage,
  instacartProductsFor,
  instacartSearchUrl,
  instacartTrackingHost,
  instacartUrlFor,
} from "./instacart";
import {
  weeeHomeUrl,
  weeePerk,
  weeeProductImage,
  weeeProductsFor,
  weeeSearchUrl,
  weeeUrlFor,
} from "./weee";

/**
 * Where a retailer can actually deliver.
 *
 * Country-coarse on purpose. Weee! is "US" here despite its fresh delivery
 * being metro-limited, because the finer fact — *which* metros — is not one we
 * hold, and a granularity we cannot populate is worse than one we can. §3's
 * region question is about how the user's region is *learned*; this type is
 * only about what a retailer can answer.
 */
export type Region = "US" | "CA" | "UK" | "AU" | "JP";

export type RetailerProduct = { id: string; title: string; url: string };

/**
 * A retailer row: its brand (client-safe data) plus everything that reads disk.
 *
 * `id`, `label` and `blurb` arrive from `RetailerBrand` rather than being
 * declared here, so the copy a page prints and the row a server surface uses
 * are the same fact and cannot drift. See `retailer-brand.ts` for why the seam
 * is where it is.
 */
export type Retailer = RetailerBrand & {
  /** Exact hosts. Feeds `/go`'s allowlist — see `allHosts`. */
  hosts: readonly string[];
  regions: readonly Region[];
  /** A URL for buying this ingredient, or null. Null is a real answer and
      callers must render nothing for it (`weee.ts`'s posture, unchanged). */
  urlFor: (name: string) => string | null;
  /**
   * A search for this name, asked for rather than fallen back to.
   *
   * `urlFor` prefers an aisle, which is right until we hold a name finer than
   * the retailer's aisles are. A retailer with no search surface may answer
   * null, and the caller keeps whatever `urlFor` gave it.
   */
  searchUrlFor: (name: string) => string | null;
  /** A few products to show, or none. Empty is a fine outcome. */
  productsFor: (name: string, limit?: number) => RetailerProduct[];
  /** Cached thumbnail for a product id, or null when the offline fetch has
      not run. Every surface must survive that. */
  imageFor: (productId: string) => string | null;
  /** The storefront itself, where no single shelf can stand for a whole list. */
  homeUrl: () => string;
  /** The retailer's promise, from config — empty string when unconfigured. */
  perk: () => string;
  /**
   * The path a search on this retailer starts with.
   *
   * `/go` records a `resolved` flag meaning "we sent them to a real shelf, not
   * a search". The test used to be `!pathname.startsWith("/search")`, which is
   * a Weee-shaped fact living in a retailer-agnostic route. Every retailer
   * knows the shape of its own search path; none of them should have to teach
   * the route about it.
   *
   * Held as DATA rather than as the predicate it used to be, because the
   * `/go` Worker (STATIC-SPEC §4) has to make the same judgement and cannot
   * import a function: `build-data.ts` writes this string into
   * `static-data/retailers.json` and the Worker reads it there. One fact, one
   * place, two readers — the same rule §6 already applies to the host list.
   */
  searchPathPrefix: string;
};

/** The predicate the surfaces have always called, over the row's own prefix. */
export const isSearchUrl = (r: Pick<Retailer, "searchPathPrefix">, url: URL) =>
  url.pathname.startsWith(r.searchPathPrefix);

const INSTACART: Retailer = {
  ...INSTACART_BRAND,
  // The Impact tracking host rides the allowlist when configured, so the
  // affiliate wrapper needs no second edit here — see `instacart.ts`.
  hosts: ["www.instacart.com", "instacart.com",
          ...(instacartTrackingHost() ? [instacartTrackingHost()!] : [])],
  regions: ["US", "CA"],
  urlFor: instacartUrlFor,
  searchUrlFor: instacartSearchUrl,
  productsFor: instacartProductsFor,
  imageFor: instacartProductImage,
  homeUrl: instacartHomeUrl,
  perk: instacartPerk,
  searchPathPrefix: "/store/s",
};

const WEEE: Retailer = {
  ...WEEE_BRAND,
  hosts: ["www.weee.com", "weee.com", "www.sayweee.com", "sayweee.com"],
  regions: ["US"],
  urlFor: weeeUrlFor,
  searchUrlFor: weeeSearchUrl,
  productsFor: weeeProductsFor,
  imageFor: weeeProductImage,
  homeUrl: weeeHomeUrl,
  perk: weeePerk,
  searchPathPrefix: "/search",
};

/** Every registered retailer. Order is not significance — see §8: we never
    rank retailers by what pays best. Weee! stays a row so `/go`'s allowlist
    keeps resolving links already in the wild, but no surface offers it. */
export const RETAILERS: readonly Retailer[] = [INSTACART, WEEE];

/**
 * The retailer a surface uses when nothing has chosen one.
 *
 * Instacart since 2026-08-21 — the business decision is written up in
 * BUSINESS-REVIEW §11: Weee!'s programme pays in store credit, enrols by
 * invitation only, and tiers from 2%; Instacart pays cash through Impact and
 * enrols openly. Mirrored by `DEFAULT_BRAND` in `retailer-brand.ts`, which
 * must stay in step.
 */
export const DEFAULT_RETAILER: Retailer = INSTACART;

/**
 * Which retailer owns this host, or null — **and therefore `/go`'s allowlist**.
 *
 * The guard and the label come from one lookup on purpose. Two mechanisms — a
 * host set to permit and a separate id to record — can disagree, and the way
 * they disagree is a host that redirects but records as the wrong retailer.
 * Derived membership also means a retailer cannot be added to the registry and
 * forgotten in the open-redirect guard; that failure would be silent in tests
 * and load-bearing in production.
 *
 * It is also better than a `r=` query parameter, which would be unvalidated
 * input deciding an analytics dimension that `ATTRIBUTION-SPEC` §c's
 * cross-retailer comparison depends on being trustworthy.
 */
export function retailerForHost(host: string): Retailer | null {
  for (const r of RETAILERS) if (r.hosts.includes(host)) return r;
  return null;
}

/** Retailers that can deliver in a region — §3's "no retailer → no link". */
export function retailersFor(region: Region): readonly Retailer[] {
  return RETAILERS.filter((r) => r.regions.includes(region));
}
