"use client";

/**
 * The corpus and vocabulary on the DEVICE — the client's `lib/data.ts`.
 *
 * `data.ts` reads the pipeline tables off disk and cannot run in a browser;
 * this reads the build-generated bundle (`src/static/build-data.ts` →
 * `/static-data/*.json`) that the same tables produce, so the two views
 * cannot disagree about content — only about breadth: the bundle ships the
 * CURATED shelf and its relation closure, nothing else (STATIC-SPEC §3).
 *
 * Relations are compiled by the SAME `buildRelations` the server uses
 * (`lib/relations.ts`, pure by construction) — the matcher's direction and
 * disclosure rules must not fork between shells any more than the reducers
 * do. No node imports anywhere on this path.
 *
 * Nothing imports this module yet (Slice A is foundation); the grid converts
 * to it when matching moves client-side.
 */

import type { Recipe, Relations } from "./match";
import { buildRelations } from "./relations";

/**
 * The bundle's ingredient row — `data.ts`'s `Ingredient` minus the fields the
 * bundle deliberately leaves behind (`mentions`, `slot`, `choices`,
 * `animal_source`): parser artefacts and diet tags the curated shelf's
 * client surfaces do not read. Narrower on purpose; widening the bundle is a
 * `build-data.ts` decision, not a cast here.
 */
export type ClientIngredient = {
  id: string;
  slug: string;
  name: string;
  /** English explanation of a native-named node — display and search only. */
  gloss?: string;
  kind?: string;
  allergens?: string[];
  /**
   * USER-SPEC §6's provenance axis, shipped because the FILTER runs here now.
   *
   * It was left out of the bundle on the reading that client surfaces only
   * display names. `applyDiet` moved to the device with the grid, and without
   * this a vegetarian's setting would quietly stop hiding anything — §6 calls
   * that direction of wrongness a hazard, so the field travels.
   */
  animal_source?: "meat" | "fish" | "dairy" | "egg";
  aliases: string[];
  /**
   * Where to buy this, when it is worth offering at all — §4h, decided at build.
   *
   * Present on the marked minority only. The judgement (`hardToFind`, its kind
   * veto and its always-link list) and the address (the default retailer's
   * `urlFor`) are both server files, so `build-data.ts` runs them and ships the
   * ANSWER. A device with no link for a row is the ordinary case and every
   * surface already draws it: a shop does not stock everything.
   */
  buy_url?: string;
};

export type ClientData = {
  ingredients: ClientIngredient[];
  byId: Map<string, ClientIngredient>;
  /** Retired id → live id (INGREDIENT-SPEC §1), pruned to shipped targets. */
  redirects: Map<string, string>;
  /**
   * broad → narrow[], one hop — `data.ts`'s `children`, built from the same
   * `is_a` edges. The search shelf walks it to answer "and everything this
   * word covers": a jar of kimchi answers a recipe asking for cucumber
   * kimchi, and never the reverse (INGREDIENT-SPEC §3a's oil correction).
   */
  children: Map<string, string[]>;
  relations: Relations;
  /** The raw edges `relations` was built from — `RecipeShell` cuts one
      recipe's closure out of them, as `recipeProps` does on the server. */
  edges: { is_a: string[][]; derives_from: string[][] };
  /** Every recipe not dropped (gate lifted 2026-11-06). */
  recipes: Recipe[];
  retailers: {
    default: string;
    rows: Array<{ id: string; label: string; blurb: string;
                  hosts: string[]; regions: string[];
                  /* The `/go` Worker's copy of `searchPathPrefix` — see
                     `build-data.ts`. Nothing on the device reads it; it rides
                     here because the Worker and the app must not keep two
                     retailer tables. */
                  search_path?: string }>;
  };
};

type OntologyFile = {
  schema: number;
  ingredients: ClientIngredient[];
  redirects?: Record<string, string>;
  relations: { is_a: string[][]; derives_from: string[][] };
};

type RecipesFile = {
  generated_at: string;
  count: number;
  recipes: Array<{
    id: string; title: string; url: string; source: string; cuisine: string;
    cuisines?: string[];
    image?: string; yield?: string; rating?: number;
    requires: string[]; optional?: string[];
    alternates?: Record<string, string[][]>;
    make_ahead?: boolean; main_ingredients?: string[]; components?: string[];
  }>;
};

/* Module-level, like `data.ts`'s cache: the bundle is one object per page
   lifetime. The PROMISE is cached rather than the value so concurrent first
   callers share one set of fetches instead of racing three each. */
let cache: ClientData | null = null;
let inflight: Promise<ClientData> | null = null;

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function load(): Promise<ClientData> {
  if (cache) return cache;
  inflight ??= (async () => {
    const [ont, rec, retailers] = await Promise.all([
      fetchJson<OntologyFile>("/static-data/ontology.json"),
      fetchJson<RecipesFile>("/static-data/recipes.json"),
      fetchJson<ClientData["retailers"]>("/static-data/retailers.json"),
    ]);
    const recipes: Recipe[] = rec.recipes.map((r) => ({
      id: r.id, title: r.title, url: r.url, source: r.source, cuisine: r.cuisine,
      ...(r.cuisines?.length ? { cuisines: r.cuisines } : {}),
      ...(r.image ? { image: r.image } : {}),
      ...(r.yield ? { yield: r.yield } : {}),
      /* Read through `sourceRating` wherever it is used, never raw — two rows
         in the corpus carry a review count in this field. */
      ...(typeof r.rating === "number" ? { rating: r.rating } : {}),
      requires: r.requires,
      ...(r.optional ? { optional: r.optional } : {}),
      ...(r.alternates ? { alternates: r.alternates } : {}),
      ...(r.main_ingredients ? { mainIngredients: r.main_ingredients } : {}),
      ...(r.components ? { components: r.components } : {}),
      // The bundle ships resolved lists only, so there is nothing unaccounted
      // for — the same claim `ownAsRecipes` makes for hand-entered rows.
      unresolved: [],
    }));
    const children = new Map<string, string[]>();
    for (const [narrow, broad] of ont.relations.is_a ?? []) {
      if (!narrow || !broad || narrow === broad) continue;
      const at = children.get(broad);
      if (at) at.push(narrow); else children.set(broad, [narrow]);
    }
    cache = {
      ingredients: ont.ingredients,
      byId: new Map(ont.ingredients.map((i) => [i.id, i])),
      redirects: new Map(Object.entries(ont.redirects ?? {})),
      children,
      relations: buildRelations(ont.relations),
      edges: { is_a: ont.relations.is_a ?? [], derives_from: ont.relations.derives_from ?? [] },
      recipes,
      retailers,
    };
    return cache;
  })();
  try {
    return await inflight;
  } catch (e) {
    // A failed fetch must not poison every later call with the same
    // rejection — the next caller retries.
    inflight = null;
    throw e;
  }
}

/**
 * Follow a retired id to the one that replaced it — INGREDIENT-SPEC §1,
 * same bounded walk as `data.ts`. Unknown ids come back unchanged, which is
 * also what keeps `txt_` free-text rows passing through untouched; before
 * `load()` resolves there are no redirects yet and every id is "unknown",
 * the honest answer for a vocabulary that has not arrived.
 */
export function resolveId(id: string): string {
  const redirects = cache?.redirects;
  if (!redirects) return id;
  let x = id;
  for (let n = 0; redirects.has(x) && n < 5; n++) x = redirects.get(x)!;
  return x;
}

/** The display name, or the id itself for anything the bundle does not hold. */
export function nameOf(id: string): string {
  return cache?.byId.get(resolveId(id))?.name ?? id;
}

/**
 * The seaweed-slot pattern, same as `data.ts`: a native-named node renders as
 * "korean red pepper paste - gochujang" wherever a DISPLAY string is wanted.
 * Never fed back into saves or lookups — those stay on the canonical name.
 */
export function displayOf(id: string): string {
  const i = cache?.byId.get(resolveId(id));
  if (!i) return id;
  return i.gloss ? `${i.gloss} - ${i.name}` : i.name;
}

/**
 * What sort of thing it is — the aisle grouping's only input (`lib/aisle`).
 *
 * Undefined for a `txt_` row and for anything the bundle does not hold, which
 * both read as "we cannot place it" and sink to the one group at the end. That
 * is the same answer `data.ts` gives, and the same one the list has always
 * wanted: a typed row belongs on the list because the user put it there.
 */
export function kindOf(id: string): string | undefined {
  return cache?.byId.get(resolveId(id))?.kind;
}

/**
 * The nodes as the dietary filter reads them — `applyDiet`'s `byId`.
 *
 * The map itself, not a copy: the filter only reads, and rebuilding a
 * thousand-entry map per render of the grid would be work done sixty times a
 * session for a table that changes when the build changes.
 */
export function dietIndex(): Map<string, ClientIngredient> {
  return cache?.byId ?? new Map();
}

/**
 * Everything `ingredientId` covers: itself and every narrower form beneath it.
 *
 * Down the hierarchy only, exactly as `lib/recipes` does it on the server —
 * `kimchi` covers `cucumber kimchi` because the jar on your shelf is what you
 * have, and `oil` does NOT reach `sesame oil`. Iterating a Set while adding to
 * it IS the breadth-first walk, so a cycle terminates.
 */
export function coversOf(ingredientId: string): Set<string> {
  const children = cache?.children;
  const covers = new Set<string>([ingredientId]);
  if (!children) return covers;
  for (const cur of covers) for (const kid of children.get(cur) ?? []) covers.add(kid);
  return covers;
}

/**
 * The ingredient a search term is really naming, if any — `ingredientNamed`
 * for the device.
 *
 * The server asks its ranked ontology search and accepts an exact name, an
 * exact alias, or a PREFIX of either: nobody finishes typing "gochujang"
 * before expecting an answer. The bundle has the same names and aliases, so
 * the same three tests run here over them, in one pass.
 *
 * Deliberately strict in the same direction: a loose match would turn a title
 * search into an ingredient search behind the user's back, and "beef bulgogi"
 * has to stay a dish. Where the two can differ is WHICH of several prefix
 * matches wins — the server orders its candidates by corpus usage and this
 * takes the shortest name, which is the same answer whenever one word is a
 * prefix of one node, and the honest tie-break when it is not.
 */
export function ingredientNamed(q: string): { id: string; name: string } | undefined {
  const term = q.toLowerCase().trim();
  if (term.length < 2 || !cache) return undefined;
  let best: ClientIngredient | undefined;
  for (const i of cache.ingredients) {
    const name = i.name.toLowerCase();
    const exact = name === term || i.aliases.some((a) => a.toLowerCase() === term);
    if (exact) return { id: i.id, name: i.name };
    const prefix = name.startsWith(term) || i.aliases.some((a) => a.toLowerCase().startsWith(term));
    if (prefix && (!best || i.name.length < best.name.length)) best = i;
  }
  return best ? { id: best.id, name: best.name } : undefined;
}
