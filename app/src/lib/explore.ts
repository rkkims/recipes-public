/**
 * Explore — "what should I cook that I have not seen?"
 *
 * ── What this tab is, and what it replaced ────────────────────────────────
 *
 * It was "Popular": the servable corpus sorted by the source's rating. That is
 * a leaderboard, and a leaderboard is the same on Tuesday as it was on Monday.
 * A person who opened it twice had already seen everything it would ever offer,
 * which makes it a page you stop opening.
 *
 * Explore is the same shelf with memory. The rule underneath is one sentence:
 * **show good recipes this person has not already been shown, weighted toward
 * ones they could plausibly cook.**
 *
 * ── Four layers, in order of authority ───────────────────────────────────
 *
 * **1. Novelty — a hard filter.** Anything opened, saved, cooked, planned or
 * dismissed drops out. Opening is the signal that matters and the one that did
 * not exist before: you looked, so we do not need to offer it again.
 *
 * It DECAYS. A recipe you glanced at nine weeks ago is a fair suggestion again,
 * and a permanent exclusion would shrink the corpus monotonically until the tab
 * is empty for the product's best user. `SEEN_DAYS` is that window.
 *
 * **2. Reach — a soft score.** Prefer what is 2 to 6 ingredients away. Nearer
 * than that belongs to the other two tabs and would make three shelves that all
 * say the same thing; further than about six is a shopping trip rather than a
 * suggestion, and a wall of those teaches people the tab is not about them.
 * This is what stops Explore being a random corpus dump.
 *
 * **3. Affinity — a soft score.** Cuisines you have saved or cooked, and
 * ingredients you already own. On a cold start there is nothing here and the
 * term is simply zero, which is correct: a stranger gets quality and reach.
 *
 * **4. Quality — the tie-break.** The source's rating, believable ones only.
 *
 * ── Where the cook-based engine plugs in ─────────────────────────────────
 *
 * `affinity` is the seam. It takes cuisines and ingredient ids and knows
 * nothing about where they came from — today `savedOrCooked` is assembled from
 * saves and the cook log with cooks weighted double. When there is enough
 * history to learn from, that function is the only thing that changes: the
 * filter, the reach curve, the diversity caps and the page all stay as they
 * are. A cooked dish is worth more than a saved one because saving is a wish
 * and cooking is a fact, which is the whole premise of the future engine and
 * is already the weighting here.
 *
 * ── Diversity, because a good score is not a good page ───────────────────
 *
 * Ranking alone puts eleven recipes from one blog at the top, since a strong
 * source rates well across its whole catalogue. Caps are applied after scoring:
 * a page is a set, and a set of near-identical things is worse than the sum of
 * its rows however well each one scores.
 */
import { cuisinesOf, type Recipe } from "./match";
/* From the CORE, not the server shell: this file runs on the device now (the
   Explore tab is client-rendered), and a type import that names `store.ts`
   invites the day someone adds a value import beside it and pulls `node:fs`
   into the browser bundle. */
import type { Owner } from "./owner-core";

/** How long an opened recipe stays out of Explore. Nine weeks, then it returns. */
export const SEEN_DAYS = 63;

/** The band Explore aims at. Below `NEAR` is another tab's job. */
const NEAR = 2;
const FAR = 6;

/** No more than this many from one blog on a page, however well it rates. */
const PER_SOURCE = 3;

export type Seen = { ids: Set<string> };

/**
 * Everything this owner has already been shown or acted on.
 *
 * Saves and cooks are included as well as opens: a recipe in your library is
 * not a discovery, and re-suggesting something you cooked last week reads as
 * the app having forgotten. Dismissals are honoured here too — `dismissed_at`
 * already means "not this one" everywhere else that recommends.
 */
export function seenBy(owner: Owner | null, now = Date.now(), arrivedAt = now): Seen {
  const ids = new Set<string>();
  if (!owner) return { ids };

  const cutoff = now - SEEN_DAYS * 24 * 60 * 60 * 1000;
  for (const r of Object.values(owner.recipes ?? {})) {
    if (r.saved) { ids.add(r.recipe_id); continue; }
    if (r.dismissed_at) { ids.add(r.recipe_id); continue; }
    /* The new signal. Older than the window is not "seen" any more — see the
       note on decay above. AND newer than the ARRIVAL is not "seen" YET:
       opening a card mid-browse re-renders the page, and if the click's own
       mark filtered the pool, the grid reshuffled under the modal (curator
       report, 2026-08-21). A mark made during this visit waits for the next
       arrival — reload or fresh navigation — to take effect. */
    const opened = r.opened_at ? Date.parse(r.opened_at) : NaN;
    if (Number.isFinite(opened) && opened > cutoff && opened <= arrivedAt)
      ids.add(r.recipe_id);
  }
  for (const c of owner.cooks ?? []) ids.add(c.recipe_id);
  for (const p of owner.plans ?? []) if (p.recipe_id) ids.add(p.recipe_id);
  return { ids };
}

/**
 * What this owner has shown a taste for — the seam the cook engine replaces.
 *
 * A cook counts double a save, because saving is a wish and cooking is a fact.
 * That ratio is the entire premise of the future engine, stated early and
 * cheaply so that switching to it is a change of weights rather than a change
 * of shape.
 */
export function tasteOf(owner: Owner | null, byId: Map<string, Recipe>): {
  cuisines: Map<string, number>; ingredients: Map<string, number>;
} {
  const cuisines = new Map<string, number>();
  const ingredients = new Map<string, number>();
  if (!owner) return { cuisines, ingredients };

  const add = (r: Recipe | undefined, weight: number) => {
    if (!r) return;
    for (const c of cuisinesOf(r))
      cuisines.set(c, (cuisines.get(c) ?? 0) + weight);
    for (const id of r.requires) ingredients.set(id, (ingredients.get(id) ?? 0) + weight);
  };

  for (const r of Object.values(owner.recipes ?? {})) {
    if (r.saved) add(byId.get(r.recipe_id), 1);
  }
  for (const c of owner.cooks ?? []) add(byId.get(c.recipe_id), 2);
  return { cuisines, ingredients };
}

/**
 * How far outside the pantry this recipe is, counting only what it requires.
 *
 * Deliberately not `scoreRecipe`: that resolves substitutions and relations and
 * is the right answer for "can I cook this", which is a different question from
 * "is this a reasonable thing to suggest". Explore only needs the shape of the
 * gap, and asking the expensive question 3,000 times to sort a browse tab is
 * how a page becomes slow.
 */
function distance(r: Recipe, have: Set<string>): number {
  let missing = 0;
  for (const id of r.requires) if (!have.has(id)) missing += 1;
  return missing;
}

/** 1 at the middle of the band, falling off on both sides, never below 0. */
function reachScore(d: number): number {
  if (d < NEAR) return 0.35;               // the other tabs already say this
  if (d <= FAR) return 1;
  return Math.max(0, 1 - (d - FAR) / 10);  // gone by about sixteen away
}

export type Scored = { recipe: Recipe; score: number };

/**
 * The ranking itself. Pure, so it can be reasoned about without a request.
 *
 * `rating` is passed through a caller-supplied believability check rather than
 * read directly: two rows in the corpus carry a review COUNT in the rating
 * field, and the shelf that sorts by rating is exactly where that surfaces.
 */
export function scoreExplore(recipes: Recipe[], opts: {
  have: Set<string>;
  taste: ReturnType<typeof tasteOf>;
  ratingOf: (r: Recipe) => number | null;
  /**
   * Recipes by creators this owner follows — CREATORS-TAB-SPEC §4's payoff,
   * settled 2026-08-16 as a boost and only a boost. A follow is the loudest
   * affinity signal there is (a cook saying "more from this person",
   * unprompted), so it outweighs the inferred terms — but it stays a term:
   * novelty still filters, reach still gates, and a followed creator's
   * eleventh stew still loses to a cookable one from anyone. A set of recipe
   * ids, precomputed by the caller from the handful of followed creators,
   * because resolving creator-of-recipe per row would put a fresh claims read
   * under every score.
   */
  followedIds?: Set<string>;
}): Scored[] {
  const { have, taste, ratingOf, followedIds } = opts;

  /* Normalised, so a user with 40 cooks does not have an affinity term forty
     times heavier than a user with one. Taste says WHICH, not how loudly. */
  const topCuisine = Math.max(1, ...taste.cuisines.values());
  const topIngredient = Math.max(1, ...taste.ingredients.values());

  return recipes.map((r) => {
    const d = distance(r, have);

    /* The best-fitting of its cuisines — a Korean-Chinese dish fits a
       Korean-loving kitchen exactly as well as a plain Korean one. */
    const cuisineFit = Math.max(0,
      ...cuisinesOf(r).map((c) => (taste.cuisines.get(c) ?? 0) / topCuisine));

    let ingredientFit = 0;
    if (r.requires.length) {
      let hit = 0;
      for (const id of r.requires) hit += (taste.ingredients.get(id) ?? 0) / topIngredient;
      ingredientFit = Math.min(1, hit / r.requires.length * 2);
    }

    const rating = ratingOf(r);
    /* Unrated is not bad, it is unknown. Scoring it zero would empty the shelf
       of everything from a source we have no rating for, which is a fact about
       our data rather than about the recipe. The middle of the scale is the
       honest placeholder. */
    const quality = rating === null ? 0.6 : Math.min(1, Math.max(0, (rating - 3) / 2));

    const score =
      reachScore(d) * 1.0
      + cuisineFit * 0.6
      + ingredientFit * 0.5
      + quality * 0.8
      + (followedIds?.has(r.id) ? 0.7 : 0);

    return { recipe: r, score };
  }).sort((a, b) => b.score - a.score);
}

/**
 * Turn a ranked list into a page worth looking at.
 *
 * Applied after scoring rather than inside it, because this is a property of
 * the SET: no individual recipe is wrong for being the fourth from its blog.
 * Skipped rows are not dropped, they fall to the end — running out of variety
 * is not a reason to show a shorter page.
 */
export function diversify(scored: Scored[], perSource = PER_SOURCE): Recipe[] {
  const used = new Map<string, number>();
  const kept: Recipe[] = [];
  const held: Recipe[] = [];

  for (const { recipe } of scored) {
    const n = used.get(recipe.source) ?? 0;
    if (n >= perSource) { held.push(recipe); continue; }
    used.set(recipe.source, n + 1);
    kept.push(recipe);
  }
  return kept.concat(held);
}

/** The whole tab, in one call. */
export function explore(recipes: Recipe[], owner: Owner | null, opts: {
  have: Set<string>;
  byId: Map<string, Recipe>;
  ratingOf: (r: Recipe) => number | null;
  /** See `scoreExplore.followedIds`. */
  followedIds?: Set<string>;
  now?: number;
  /** When this VISIT began (minted into the shuffle seed) — marks made after
      it do not filter, so the page holds still while it is being browsed. */
  arrivedAt?: number;
}): Recipe[] {
  const now = opts.now ?? Date.now();
  const seen = seenBy(owner, now, opts.arrivedAt ?? now);
  const fresh = recipes.filter((r) => !seen.ids.has(r.id));
  const taste = tasteOf(owner, opts.byId);
  return diversify(scoreExplore(fresh, {
    have: opts.have, taste, ratingOf: opts.ratingOf,
    ...(opts.followedIds ? { followedIds: opts.followedIds } : {}),
  }));
}
