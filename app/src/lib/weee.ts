/**
 * Where to send someone who is missing an ingredient — WEEE-SPEC §6.
 *
 * The requirement is deliberately small: **one plausible landing URL per
 * ingredient**, not a SKU, not a basket, not per-item attribution.
 *
 * The original warrant for that was DECISIONS §513's "we earn on the referral
 * and the 6-month tail, not on the jar" — **withdrawn 2026-08-05**: that
 * structure turned out to be the consumer refer-a-friend programme, so the jar
 * is what pays and the minimum-order threshold is our problem again. The
 * conclusion survives with a weaker warrant, as §513's correction says
 * itself: per-item attribution is now a COST judgement, not a consequence of
 * the comp plan. Nothing here needed to change; only this comment did, so the
 * next reader does not build pricing on a comp structure that never existed.
 *
 * Fallback order, straight from §6:
 *
 *   1. the shelf the catalogue files this ingredient under
 *   2. a site search on the display name
 *   3. nothing — no link at all
 *
 * Step 3 matters. A link that lands somewhere useless is worse than no link:
 * it spends the one moment the user was willing to click.
 *
 * robots.txt disallows crawling the search path. That governs CRAWLING, not
 * linking: we may send a person to a search result; we may not fetch one.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { asObjects } from "./csv";

/**
 * The affiliate tag, from the environment.
 *
 * Absent by default and that is correct: DECISIONS §11 still lists the Weee!
 * terms as unverified, and the account may not exist yet. An unset tag produces
 * a working, untagged link rather than a broken one or a fake tag — the link is
 * useful to the user either way, and only the attribution waits.
 */
const TAG = process.env["WEEE_AFFILIATE_TAG"] ?? "";

function findWeeeData(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const c = resolve(dir, "data", "weee");
    if (existsSync(resolve(c, "vocabulary.csv"))) return c;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

/** node display name (lowercased) → shelf URL. Built once. */
let shelfFor: Map<string, string> | null = null;

/**
 * Shelves decided by a human, in `data/decisions/weee-shelf.csv`.
 *
 * The crawl can only file a node under a shelf it found a matching PRODUCT on,
 * and for the commonest ingredients there is no such product. Weee's Eggs shelf
 * sells quail, duck, salted duck and century eggs — nothing there parses to
 * plain `egg`, so the ingredient 1,049 recipes ask for had no aisle and fell
 * through to a site search. Same for `all-purpose flour`, `cornstarch`,
 * `kosher salt`: the shelf plainly exists, the SKUs just never spell the node.
 *
 * So the mapping is a decision, not a derivation, and it lives with the other
 * decisions rather than in a generated file that `weee-pack` would overwrite.
 * It WINS over the crawl-derived shelf: a person reading "Flour Starch" knows
 * where flour is, and a SKU-support score does not.
 */
function decided(dir: string): Map<string, string> {
  const m = new Map<string, string>();
  const f = resolve(dir, "..", "decisions", "weee-shelf.csv");
  if (!existsSync(f)) return m;
  try {
    for (const r of asObjects(readFileSync(f, "utf8"))) {
      const node = (r["node"] ?? "").trim().toLowerCase();
      const shelf = (r["shelf"] ?? "").trim();
      if (node && shelf) m.set(node, shelf);
    }
  } catch { /* a malformed decision file must not take the pantry down */ }
  return m;
}

function index(): Map<string, string> {
  if (shelfFor) return shelfFor;
  const m = new Map<string, string>();
  const dir = findWeeeData();
  if (!dir) { shelfFor = m; return m; }
  try {
    const shelfUrl = new Map<string, string>();
    const shelves = resolve(dir, "shelves.csv");
    if (existsSync(shelves)) {
      for (const r of asObjects(readFileSync(shelves, "utf8"))) {
        if (r["code"] && r["url"]) shelfUrl.set(r["code"]!, r["url"]!);
      }
    }
    // Best-supported shelf wins, not first-seen. Taking the first row put `beef`
    // on Deli-Meat, because some deli product happened to sort earlier — the
    // shelf carrying the most SKUs for a node is the aisle a shopper wants.
    const best = new Map<string, number>();
    for (const v of asObjects(readFileSync(resolve(dir, "vocabulary.csv"), "utf8"))) {
      const node = (v["node"] ?? "").trim().toLowerCase();
      if (!node) continue;
      const code = (v["shelves"] ?? "").split(" ").filter(Boolean)[0];
      const url = code ? shelfUrl.get(code) : undefined;
      if (!url) continue;
      /**
       * Rank: a shelf NAMED after the ingredient wins outright, then SKU count.
       *
       * `beef` has four SKUs parsing to plain "beef" on Deli-Meat and one on
       * the shelf actually called Beef. The catalogue is not wrong — those deli
       * products are beef — but a shopper who wants beef wants the beef aisle,
       * and a retailer naming a shelf after the ingredient is a stronger
       * statement about where it lives than four products being shelved
       * elsewhere.
       */
      const shelfName = (v["shelf_names"] ?? "").split(" | ")[0]?.trim().toLowerCase() ?? "";
      const named = shelfName === node || shelfName === node + "s";
      const score = (named ? 1_000_000 : 0) + Number(v["sku_support"] || 0);
      if (score <= (best.get(node) ?? -1)) continue;
      best.set(node, score);
      m.set(node, url);
    }
    /* Human decisions last, so they win — see `decided`. */
    for (const [node, code] of decided(dir)) {
      const url = shelfUrl.get(code);
      if (url) m.set(node, url);
    }
  } catch {
    /* A missing or malformed catalogue file must never take the pantry down.
       No links is a fine outcome; a 500 on the main page is not. */
  }
  shelfFor = m;
  return m;
}

const withTag = (url: string) => {
  if (!TAG) return url;
  return url + (url.includes("?") ? "&" : "?") + "ref=" + encodeURIComponent(TAG);
};

/**
 * A URL for buying this ingredient, or null.
 *
 * Null is a real answer and callers must render nothing for it, rather than
 * falling back to a homepage link that answers no question.
 */
export function weeeUrlFor(name: string): string | null {
  const key = (name ?? "").trim().toLowerCase();
  if (!key) return null;
  const shelf = index().get(key);
  if (shelf) return withTag(shelf);
  // Site search is the honest general answer: it lands on the thing they asked
  // for, and it is where a shopper would go anyway.
  return weeeSearchUrl(key);
}

/**
 * A site search, asked for by name rather than fallen back to.
 *
 * `weeeUrlFor` prefers a shelf, which is right when the name IS the ingredient.
 * It is wrong when we hold a resolved leaf whose shelf is the generic's shelf —
 * `short grain rice` and `rice` are both filed under `dried01/Rice`, so the
 * aisle cannot express a distinction we know. `lib/buy.ts` asks for this
 * instead in exactly that case (RETAILER-SPEC §5).
 */
export function weeeSearchUrl(name: string): string | null {
  const key = (name ?? "").trim().toLowerCase();
  if (!key) return null;
  return withTag("https://www.weee.com/search/" + encodeURIComponent(key));
}

/** How many ingredients resolve to a real shelf rather than a search. */
export const shelfCoverage = () => index().size;

/** The storefront itself, tagged — the combined block's one link-out
    (CREATORS-TAB-SPEC §7), where no single shelf can stand for a whole list. */
export const weeeHomeUrl = () => withTag("https://www.weee.com/");

/**
 * The perk line for the affiliate modal, from the environment beside the tag
 * (CREATORS-TAB-SPEC §7, O5) — e.g. a first-delivery discount. Absent by
 * default, and the modal simply has no perk line until copy arrives; the perk
 * is the retailer's promise, so it lives in config, never in source.
 */
export const weeePerk = () => process.env["WEEE_PERK"] ?? "";

/**
 * The cached thumbnail for a product, or null — CREATORS-TAB-SPEC §7.
 *
 * `scripts/weee-product-images.mjs` fills `public/cached-images/` offline, the
 * avatar cache's pattern; the catalogue CSV itself carries no images. Read as
 * a directory listing once per process: `existsSync` per render per product
 * would put the filesystem in the hot path for a block that usually renders
 * without images at all. Null renders title-only — every surface must survive
 * the fetch never having run.
 */
let productImages: Set<string> | null = null;
export function weeeProductImage(productId: string): string | null {
  if (!productImages) {
    productImages = new Set();
    try {
      const dir = resolve(process.cwd(), "public", "cached-images");
      if (existsSync(dir))
        for (const f of readdirSync(dir))
          if (f.startsWith("weee-")) productImages.add(f);
    } catch { /* no cache directory is no images */ }
  }
  const file = `weee-${productId}.jpg`;
  return productImages.has(file) ? `/cached-images/${file}` : null;
}


// ── what to show for a hard-to-find item — UX-SPEC §4h ───────────────────────
//
// `hardToFind` itself moved to `lib/findability.ts` (RETAILER-SPEC §4): whether
// an ingredient is worth offering to deliver is a fact about a market, not
// about Weee!'s taxonomy, and keying it on Weee shelf codes made it
// unanswerable for any other retailer. What stays here is the part that really
// is Weee's: which of its products to show.

let productsByShelf: Map<string, Array<{ id: string; title: string }>> | null = null;

/**
 * A few products to show for an ingredient, or none.
 *
 * The products on its shelf whose title names it. Measured at 67 of 98
 * hand-mapped nodes having at least one — and §4h settles the other 33: a shelf
 * link and no modal, because a modal headed "recommended for doenjang" listing
 * assorted pastes is a recommendation nobody made.
 */
export function weeeProductsFor(name: string, limit = 6): Array<{ id: string; title: string; url: string }> {
  const key = (name ?? "").trim().toLowerCase();
  const url = index().get(key);
  const shelf = url?.match(/category\/([a-z0-9]+)\//)?.[1];
  if (!shelf) return [];

  if (!productsByShelf) {
    productsByShelf = new Map();
    const dir = findWeeeData();
    try {
      if (dir && existsSync(resolve(dir, "products.csv")))
        for (const r of asObjects(readFileSync(resolve(dir, "products.csv"), "utf8"))) {
          const code = (r["shelf"] ?? "").trim();
          if (!code || !r["product_id"]) continue;
          (productsByShelf.get(code) ?? productsByShelf.set(code, []).get(code)!)
            .push({ id: r["product_id"]!, title: (r["title"] ?? "").trim() });
        }
    } catch { /* no catalogue is no products, and the shelf link still works */ }
  }

  /* The last word of the name is the head noun — "soup soy sauce" is matched by
     products naming "soy sauce", not by ones naming "soup". */
  const head = key.split(" ").slice(-2).join(" ");
  return (productsByShelf.get(shelf) ?? [])
    .filter((p) => { const t = p.title.toLowerCase(); return t.includes(key) || t.includes(head); })
    .slice(0, limit)
    .map((p) => ({ ...p, url: withTag(`https://www.weee.com/en/product/x/${p.id}`) }));
}
