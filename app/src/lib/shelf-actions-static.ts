"use client";

/**
 * The same four reads, answered from the bundle — STATIC-SPEC §1 and §9.
 *
 * `next.config.mjs` aliases `@/app/shelf-actions` to this file in static mode.
 * Same four names, same signatures, same return shapes, so every call site is
 * untouched and the swap is invisible above this line. They stay `async` for
 * the same reason: the callers `await` them because they used to be round
 * trips, and a synchronous answer would be a change of shape for no gain.
 *
 * ── Why answering from the shipped shelf is ENOUGH, not a compromise ──────
 *
 * Both searches narrow to what the bundle holds, and in both cases the
 * narrowing costs nothing that could have mattered:
 *
 *   - **Ingredients.** The server's autosuggest ranks the WHOLE ontology, which
 *     is wider than the curated closure. But an ingredient outside the closure
 *     is one no shipped recipe references — so ticking it into a pantry cannot
 *     change a single match on this site. Offering it would be offering a word
 *     that does nothing, which is worse than not offering it.
 *   - **Recipes.** The corpus search reaches 4,874 rows; the static site is the
 *     curated shelf and nothing else (§3). A recipe absent from the shelf is
 *     not ON the site — there is no page to plan, open or cook. Finding it
 *     would produce a card pointing at a 404.
 *
 * §9 left open whether recipe-title search ships client-side "depending on
 * bundle weight at the time". It does: the titles are already in
 * `recipes.json`, which the grid loads anyway, so this adds no bytes at all.
 *
 * ── The affiliate survives, by baking rather than fetching ────────────────
 *
 * Both offer lookups are server reads on the live site — a decisions CSV for
 * whether a row is worth a link, and the retailer registry for where it points.
 * Static mode does not drop them and does not ship their inputs either: the
 * ANSWER rides on the ingredient row (`buy_url`, see `build-data.ts`). That is
 * what keeps an outbound `/go` link on the site at all, which is what makes the
 * Worker in §4 attribution for something rather than for nothing.
 */
import { coversOf, load, resolveId } from "./client-data";
import { MIN_RECIPES, MIN_TITLES, titleWordCounts } from "./dish-words";
import { ownAsRecipes } from "./owner-core";
import { current } from "./client-store";

/**
 * `data.ts`'s singular/number fold, copied because it is four lines of pure
 * string work and importing `lib/data` would drag `node:fs` into a browser.
 */
const sing = (w: string) => {
  if (w.endsWith("ies") && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith("ses") || w.endsWith("xes") || w.endsWith("zes")) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
};
const numberKey = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    .split(" ").filter(Boolean).map(sing).join(" ");

export type StaticHit = {
  id: string; name: string; slug: string; aliases: string[]; gloss?: string;
  kind?: string; allergens?: string[];
  recipes: number;
  via?: string;
  children?: Array<{ id: string; name: string; recipes: number }>;
};

/**
 * The autosuggest, over the closure — `data.ts`'s `search`, tier for tier.
 *
 * The tiers are copied rather than approximated: exact name or exact alias
 * first, then prefix, then contains, then an alias or gloss that merely
 * contains the term, with recipe COUNT breaking ties. That last rule is the one
 * that matters and the one a looser port would lose — someone typing "onion"
 * means the node a thousand recipes call for, not a near-namesake used twice.
 */
export async function searchIngredients(q: string, limit = 12): Promise<StaticHit[]> {
  const term = q.toLowerCase().trim();
  if (!term) return [];
  const key = numberKey(term);
  const bundle = await load();

  /* Recipe counts, from the shelf the bundle ships. The server reads them off
     a precomputed index; here the shelf is small enough to count directly, and
     counting the thing actually on the site is the more honest number. */
  const recipeCount = new Map<string, number>();
  for (const r of bundle.recipes)
    for (const id of [...r.requires, ...(r.optional ?? [])])
      recipeCount.set(id, (recipeCount.get(id) ?? 0) + 1);

  const aliasHit = (i: { aliases: string[]; gloss?: string }) =>
    i.aliases.find((a) => {
      const al = a.toLowerCase();
      return al.includes(term) || numberKey(a).includes(key);
    }) ?? (i.gloss?.includes(term) ? i.gloss : undefined);

  const exactAlias = (i: { aliases: string[] }) =>
    i.aliases.some((a) => a.toLowerCase() === term || numberKey(a) === key);

  const tier = (i: { name: string; aliases: string[]; gloss?: string }) => {
    const name = i.name.toLowerCase();
    const nk = numberKey(i.name);
    if (name === term || nk === key || exactAlias(i)) return 0;
    if (name.startsWith(term) || nk.startsWith(key)) return 1;
    if (name.includes(term) || nk.includes(key)) return 2;
    if (aliasHit(i)) return 3;
    return 4;
  };

  return bundle.ingredients
    .map((i) => ({ i, t: tier(i), n: recipeCount.get(i.id) ?? 0 }))
    .filter((x) => x.t < 4)
    .sort((a, b) => a.t - b.t || b.n - a.n || a.i.name.localeCompare(b.i.name))
    .slice(0, limit)
    .map((x) => {
      const kids = (bundle.children.get(x.i.id) ?? [])
        .map((id) => ({ id, name: bundle.byId.get(id)?.name ?? id,
                        recipes: recipeCount.get(id) ?? 0 }))
        .sort((a, b) => b.recipes - a.recipes || a.name.localeCompare(b.name))
        .slice(0, 6);
      const via = !x.i.name.toLowerCase().includes(term) ? aliasHit(x.i) : undefined;
      return {
        ...x.i, recipes: x.n,
        ...(via ? { via } : {}),
        ...(kids.length ? { children: kids } : {}),
      };
    });
}

/**
 * Complete the WORD being typed — `completions`, over the shelf.
 *
 * The same two sources of vocabulary and the same three rules: ontology names
 * (which know aliases, so `gochukaru` reaches `gochugaru`), plus words the
 * corpus's own titles use often enough to be dish names, counted by what the
 * GRID will actually show for that word. `lib/dish-words` holds the filler list
 * and both thresholds, imported here rather than copied, so the device and the
 * server agree about what counts as a word.
 *
 * The user's own recipes are read straight off the device, which is where they
 * live — the server version takes an owner for exactly this and gets it from a
 * cookie.
 */
export async function completeSearch(
  q: string, limit = 8,
): Promise<Array<{ term: string; recipes: number }>> {
  const term = q.toLowerCase().trim();
  if (term.length < 2) return [];
  const bundle = await load();

  const cands = new Map<string, { covers: Set<string> | null; n: number }>();
  for (const h of await searchIngredients(term, 12))
    cands.set(h.name.toLowerCase(), { covers: coversOf(h.id), n: 0 });
  for (const [w, titles] of titleWordCounts(bundle.recipes.map((r) => r.title)))
    if (titles >= MIN_TITLES && w.includes(term) && !cands.has(w))
      cands.set(w, { covers: null, n: 0 });

  const byNeed = new Map<string, string[]>();
  for (const [t, c] of cands) for (const id of c.covers ?? [])
    (byNeed.get(id) ?? byNeed.set(id, []).get(id)!).push(t);

  const all = [...bundle.recipes, ...ownAsRecipes(current())];
  for (const r of all) {
    const title = r.title.toLowerCase();
    const hit = new Set<string>();
    for (const t of cands.keys()) if (title.includes(t)) hit.add(t);
    for (const need of r.requires) for (const t of byNeed.get(need) ?? []) hit.add(t);
    for (const t of hit) cands.get(t)!.n++;
  }

  return [...cands]
    .map(([t, c]) => ({ term: t, recipes: c.n }))
    .filter((c) => c.recipes >= (c.term === term ? 1 : MIN_RECIPES))
    .sort((a, b) =>
      Number(b.term.startsWith(term)) - Number(a.term.startsWith(term)) ||
      b.recipes - a.recipes ||
      a.term.length - b.term.length)
    .slice(0, limit);
}

type Offer = { url: string;
  products: Array<{ id: string; title: string; url: string; image?: string }> };

/**
 * The buy links, from the bundle — and the reason the `/go` Worker has traffic.
 *
 * On a server both of these read files: `hardToFind` for whether a row deserves
 * a link at all, and the retailer's `urlFor` for where it points. Neither can
 * run in a browser, so `build-data.ts` runs BOTH at build and ships the answer
 * on the ingredient row (`buy_url`, present on the marked minority). What is
 * left here is a lookup.
 *
 * `products` is empty in both modes and always has been for the default
 * retailer: we hold no Instacart catalogue, so the search IS the shelf
 * (`instacart.ts`). Nothing is lost by the bundle not carrying products,
 * because there are none to carry — the surfaces render a link without them,
 * which is what they already do on the server.
 */
export async function offersForBlocking(
  ingredientIds: string[],
): Promise<Record<string, Offer>> {
  const bundle = await load();
  const out: Record<string, Offer> = {};
  for (const id of ingredientIds.slice(0, 12)) {
    const url = bundle.byId.get(resolveId(id))?.buy_url;
    if (url) out[id] = { url, products: [] };
  }
  return out;
}

/**
 * The same lookup keyed by NAME, because the grocery list asks by name — its
 * rows include free text the ontology has never heard of, which is exactly the
 * case that must answer "no link" rather than guess.
 */
export async function offersForListRows(
  rows: Array<{ name: string; kind?: string }>,
): Promise<Record<string, Offer>> {
  const bundle = await load();
  const byName = new Map<string, string>();
  for (const i of bundle.ingredients)
    if (i.buy_url) byName.set(i.name.toLowerCase(), i.buy_url);
  const out: Record<string, Offer> = {};
  for (const { name } of rows) {
    const url = byName.get((name ?? "").trim().toLowerCase());
    if (url) out[name] = { url, products: [] };
  }
  return out;
}

/**
 * Recipe search for the calendar's "+", over the shipped shelf.
 *
 * `searchAllRecipes`'s tiers, minus the own-recipes half — `CalendarLive`
 * already folds the device's own rows in on top of whatever comes back, so
 * doing it here too would list them twice.
 */
export async function searchRecipes(q: string, limit = 12): Promise<Array<{
  id: string; title: string; source: string; requires: string[]; image?: string;
}>> {
  const term = q.toLowerCase().trim();
  if (term.length < 2) return [];
  const bundle = await load();

  const tier = (t: string) => {
    if (t.startsWith(term)) return 0;
    if (t.includes(` ${term}`)) return 1;
    return 2;
  };

  return bundle.recipes
    .filter((r) => r.title.toLowerCase().includes(term))
    .map((r) => ({ r, t: tier(r.title.toLowerCase()) }))
    .sort((a, b) => a.t - b.t ||
      a.r.title.length - b.r.title.length ||
      a.r.title.localeCompare(b.r.title))
    .slice(0, limit)
    .map(({ r }) => ({
      id: r.id, title: r.title, source: r.source,
      requires: r.requires.map(resolveId),
      ...(r.image ? { image: r.image } : {}),
    }));
}
