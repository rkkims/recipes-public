/**
 * Which part of the shop a list row belongs to — UX-SPEC §4d.
 *
 * A grocery list is WALKED, not read. Ungrouped, it sits in the order things
 * were added — a recipe's worth of produce, then a plan's worth of sauces, then
 * whatever you noticed at the fridge — which sends you across the shop and back
 * four times.
 *
 * ── Why the ontology's `kind`, and not the retailer's shelves ──────────────
 *
 * The obvious source was the Weee shelf taxonomy already loaded for buy-links
 * (`WEEE-SPEC` §4). It was tried and rejected on measurement: **10 of 20 common
 * produce items came out wrong or unplaced** — cabbage and lettuce filed under
 * *Canned*, green onion under *Tofu & plant-based*, garlic and onion under
 * *Dried goods*.
 *
 * That is not a bug in the catalogue. A retailer's category tree mixes the fresh
 * and preserved forms of one ingredient, and the shelf carrying the most SKUs
 * for "cabbage" really is the canned one. It makes a fine landing page for a
 * BUY link — any cabbage product answers "where do I get cabbage" — and a bad
 * answer to "where do I walk", which is the only question this function asks.
 * Sending someone to the canned aisle for a lettuce is worse than not grouping
 * at all.
 *
 * Our own `kind` places 28 of the same 29 correctly. It is machine-assigned and
 * nothing is reviewed yet (`kind_reviewed` is 0 across the corpus), so it will
 * have errors — but it is OUR data, one curation pass from being right, and it
 * is wrong in ways we can fix rather than ways we inherit.
 *
 * The example this comment used to give was `eggplant`, filed under `egg` and
 * so shelved with the dairy. Reported from the shelf, fixed at the source in
 * `src/ontology/kinds.ts` (2026-08-18), which is the loop the paragraph above
 * is describing: seven aubergines and eight egg noodles moved in one rebuild.
 */

/**
 * The walk, in order. Fresh first, packaged middle, frozen last.
 *
 * Several kinds share an aisle on purpose: nobody walks to a separate "oil-fat"
 * section, and a list with nine one-row groups is no easier to shop than a flat
 * one. The grouping is only worth doing at the granularity of a real shop.
 */
const AISLES: Array<{ label: string; kinds: string[] }> = [
  { label: "Produce",            kinds: ["produce"] },
  { label: "Meat",               kinds: ["meat"] },
  { label: "Seafood",            kinds: ["seafood"] },
  { label: "Dairy & eggs",       kinds: ["dairy", "egg"] },
  { label: "Tofu & beans",       kinds: ["legume"] },
  { label: "Grains & noodles",   kinds: ["grain"] },
  { label: "Sauces & seasoning", kinds: ["condiment", "spice", "oil-fat"] },
  { label: "Baking & nuts",      kinds: ["sweetener", "nut-seed"] },
  { label: "Drinks",             kinds: ["beverage"] },
];

/** The aisle a kind walks to, or null for one we cannot place. */
export function aisleOf(kind: string | undefined): string | null {
  if (!kind) return null;
  return AISLES.find((a) => a.kinds.includes(kind))?.label ?? null;
}

/**
 * Where an aisle sorts. Unplaced rows sink to one group at the end.
 *
 * They are NOT hidden and NOT guessed at: a free-text row the user typed —
 * "bin bags" — has no kind and never will, and it is still on the list because
 * they put it there. §4's whole argument for free-text rows is that ours has to
 * be the WHOLE list, or theirs is the one they take to the shop.
 */
export function aisleRank(label: string | null): number {
  if (!label) return AISLES.length;
  const at = AISLES.findIndex((a) => a.label === label);
  return at === -1 ? AISLES.length : at;
}

/** What to call the group holding everything we could not place. */
export const OTHER_AISLE = "Anything else";
