/**
 * How a shelf is ordered once its membership is decided — the pure half.
 *
 * Extracted from `recipes.ts` (STATIC-SPEC §2, slice B) for the same reason
 * the reducers left `store.ts`: the grid runs on the device now, and
 * `recipes.ts` reads the corpus off disk. These three functions never did —
 * they take a list and a seed and hand back a list — so they move here, where
 * a browser can import them, and `recipes.ts` re-exports them so no server
 * caller changes.
 *
 * ZERO import statements, the same constraint `owner-core` and `match` keep.
 * Two shells must not be able to order one shelf differently.
 */

/**
 * A recipe with no photograph goes last — everywhere, and only last.
 *
 * ── Why a tie-break and not a score ──────────────────────────────────────
 *
 * Every shelf here already ranks on something it can defend: pantry distance,
 * what an ingredient unlocks, novelty, source rating. Folding "has a picture"
 * into any of those would let a photograph outrank a fact about your kitchen,
 * which is the one thing this product's ranking is not allowed to do.
 *
 * So it changes nothing about the order except the very last question. Within
 * the pictured and within the unpictured, the shelf's own ranking survives
 * untouched; the only claim made is that between two recipes the shelf has
 * ALREADY decided are worth showing, the one you can see is the better card.
 *
 * ── It is a small, real problem ──────────────────────────────────────────
 *
 * 13 of 4,874 recipes have no image — all from two sources whose pages carry an
 * `og:image` but no `image` in their Recipe JSON-LD. A card with no photograph
 * in a grid of photographs does not read as "this one has no photo", it reads
 * as broken, and at the head of a shelf it is the first thing a visitor sees.
 *
 * Stable: a partition preserves relative order inside each half, so this can be
 * applied on top of any ranking without knowing what that ranking was.
 */
export function picturedFirst<T>(items: T[], recipeOf: (item: T) => { image?: string }): T[] {
  const shown: T[] = [];
  const blind: T[] = [];
  for (const item of items) (recipeOf(item).image ? shown : blind).push(item);
  return blind.length ? shown.concat(blind) : items;
}

/**
 * A different order every day, the same order all day.
 *
 * ── The problem it solves ────────────────────────────────────────────────
 *
 * "Can cook now" is ranked, and a ranking over a pantry that did not change
 * overnight produces the same card at the top every morning. The shelf stops
 * being read after about a week: not because it is wrong, but because it has
 * already been seen. A recommendation you have learned to skip is wallpaper —
 * the same argument `dismissed_at` was written for, applied to the order
 * rather than to a single card.
 *
 * ── Why deterministic, and why per owner ─────────────────────────────────
 *
 * `Math.random()` would reshuffle on every render: scroll, open a recipe, close
 * it, and the grid you were reading is gone. The seed is the owner id and the
 * local day, so the order is fixed from midnight to midnight for one person and
 * different for the next — and a reload, a navigation and a `router.refresh()`
 * all produce the same page, which is what makes it feel stable rather than
 * broken.
 *
 * It is a rotation of what the ranking already chose, not a replacement for it.
 * Callers apply it to a shelf whose membership is already decided; nothing
 * unrankable gets promoted, because everything in the shelf was cookable when
 * it went in.
 */
function seedFrom(text: string): number {
  // FNV-1a. Small, dependency-free, and good enough for "not the same order".
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Per ITEM, not per position — the property Fisher–Yates lacked.
 *
 * The old shuffle drew one random sequence and dealt the array through it, so
 * the order of everything depended on the membership of everything: open one
 * recipe and Explore's novelty filter removes it from the pool, and the same
 * seed dealt a completely different page to the person who just closed that
 * recipe. Hashing seed+id gives every item its own place in line regardless of
 * who else is queuing — a card leaving the pool changes nothing but its own
 * absence.
 */
export function shuffleDaily<T>(items: T[], seedKey: string, idOf: (t: T) => string): T[] {
  if (items.length < 2) return items;
  return items
    .map((t) => [seedFrom(`${seedKey}:${idOf(t)}`), t] as const)
    .sort((a, b) => a[0] - b[0])
    .map(([, t]) => t);
}

/**
 * The three jars a Korean kitchen is built on — soy sauce, gochujang, doenjang.
 *
 * ── Why they get pinned to the top of "Almost there" ─────────────────────
 *
 * That shelf ranks by what an ingredient unlocks, then by how much it blocks,
 * which is the right answer for almost everything and understates these three.
 * They are not one purchase among many: they are the purchase that turns a
 * cupboard into a Korean cupboard. Soy sauce alone appears in 1,608 recipes of
 * 4,874, gochujang in 457, doenjang in 125 — and unlike a scallion or a
 * cucumber, they keep for a year, so buying one is a decision you make once.
 *
 * The shelf's own ranking cannot see that. It counts recipes, and by that
 * measure a fresh vegetable blocking sixty dishes this week outranks the bottle
 * that would still be working next spring. Pinning them is the product saying
 * the thing the arithmetic cannot.
 *
 * ── Only when missing, and never as a nag ────────────────────────────────
 *
 * A row only exists on that shelf if the user does not have the ingredient, so
 * this disappears the moment it is acted on and cannot become furniture. It is
 * also the only hand-placed thumb on that scale; everything below these rows is
 * still ranked on the evidence.
 *
 * Ids rather than names, resolved through the redirect map at the call site so
 * a merge in the ontology cannot silently unpin one.
 *
 * It lives here rather than in `lib/starter` because it is a rule about the
 * ORDER of a shelf, and because the shelf it orders is drawn on a device now:
 * `starter.ts` reads the ontology off disk, and the constant needs nothing.
 * `starter.ts` re-exports both, so no server caller changed.
 */
export const FOUNDATION = [
  "ing_qilrmtdf2kgm",   // soy sauce
  "ing_22rb5epght8f",   // gochujang
  "ing_76v5rgirmeq1",   // doenjang
] as const;

/** Where in the foundation order this sits, or `Infinity` if it is not one. */
export function foundationRank(id: string): number {
  const i = (FOUNDATION as readonly string[]).indexOf(id);
  return i === -1 ? Infinity : i;
}
