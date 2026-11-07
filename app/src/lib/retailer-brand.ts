/**
 * The client-safe half of a retailer row — RETAILER-SPEC §2.
 *
 * `retailers.ts` is server-only by transitive dependency: retailer modules read
 * the catalogue off disk, so a client component that imported the registry
 * would drag `node:fs` into the browser bundle. Its header says so, and says
 * the client's half *"deals in URLs it was handed, not in retailers"*.
 *
 * That was true while the only retailer-shaped thing the client needed was a
 * URL. It stopped being true at the copy: §1's corollary is that adding a
 * retailer must not require touching a page component, and until 2026-08-20
 * `"Weee!"` was a literal in six of them — the spec failing its own test.
 *
 * So the row splits. Everything the client legitimately needs is **data with no
 * behaviour**: a name to print and a sentence explaining what the shop is. That
 * is this file, and it imports nothing. Everything that touches disk stays in
 * `retailers.ts`, which composes a full `Retailer` from a brand plus its
 * functions. The import runs one way, brand → registry, exactly as
 * registry → retailer module already does.
 */

export type RetailerBrand = {
  /** The `ATTRIBUTION-SPEC` §80 event dimension. Stable; never rename. */
  id: string;
  /**
   * User-facing, for modal copy. Data rather than derived from `id`, because
   * "Weee!" is a brand with punctuation and "sfmart" is not "SFMart".
   */
  label: string;
  /**
   * What this shop IS, in one sentence, said where someone decides whether to
   * leave. A link-out to a service never named is a door with no sign on it.
   *
   * Per-retailer rather than templated from `label` because the useful half is
   * never the name — it is *"specialises in Asian ingredients"* and *"carries
   * the items a nearby store often does not"*, which is the reason to tap and
   * is different for every shop. A generated sentence would say the name twice
   * and the reason never.
   */
  blurb: string;
};

export const WEEE_BRAND: RetailerBrand = {
  id: "weee",
  label: "Weee!",
  blurb:
    "Weee! is an online grocery that specialises in Asian ingredients and " +
    "delivers across most of the US. It carries the items a nearby store " +
    "often does not.",
};

export const INSTACART_BRAND: RetailerBrand = {
  id: "instacart",
  label: "Instacart",
  blurb:
    "Instacart delivers same-day from grocery stores near you across the US " +
    "and Canada, including Asian markets in many cities.",
};

/**
 * What a surface prints when nothing has chosen a retailer.
 *
 * The mirror of `DEFAULT_RETAILER` in the registry and it must stay in step
 * with it — a page that links to one shop and names another is worse than
 * either. Instacart since 2026-08-21 (BUSINESS-REVIEW §11: Weee! pays in
 * store credit and enrols by invitation only; Instacart pays cash through
 * Impact and enrols openly). The Weee! row survives in the registry so old
 * outbound links keep resolving, but no surface offers it.
 */
export const DEFAULT_BRAND: RetailerBrand = INSTACART_BRAND;
