/**
 * The ranked shelves, computed once per pantry rather than once per request.
 *
 * Ranking is the expensive thing this product does, and it was being redone on
 * every single render. Measured on the real corpus:
 *
 *     rank(maxMissing: 0)   250ms
 *     nearMisses            174ms
 *     unlocks               140ms
 *
 * — roughly 560ms before a byte reaches the browser, and the same 560ms again
 * for every navigation. Opening a recipe is `?recipe=`, a server navigation
 * that re-renders the whole page, so **looking at a dish re-ranked 3,435
 * recipes to produce a grid identical to the one already on screen.** That is
 * the entire reason the modal felt slow: not the modal, the page under it.
 *
 * ── What the answer actually depends on ───────────────────────────────────
 *
 * The corpus is immutable for the life of the process (`load()` caches it), so
 * the shelves are a function of the owner's state alone: what is in the pantry,
 * what is pinned, the dietary setting, and what has been dismissed. Anything
 * that does not change those cannot change the result — which is every modal
 * open, every tab switch, every "show more".
 *
 * So the key is built from exactly those, and nothing else. Getting that list
 * wrong is the only way this can serve a stale answer, which is why the key is
 * assembled here beside the computation rather than passed in by callers who
 * would each have to remember the full set.
 *
 * ── Deliberately not `unstable_cache` ─────────────────────────────────────
 *
 * Next's cache serialises through a store and is keyed by its own rules; this
 * is a pure function of in-process data, so a Map is both faster and easier to
 * reason about. It also means the cache dies with the process, which is correct
 * — a rebuilt corpus should not be able to serve rankings from the old one.
 */
import type { DietSelection } from "./diet";
import type { Match, Pantry } from "./match";

/** Small: one person cooks at a time, and each entry holds a few thousand refs. */
const MAX = 8;
const cache = new Map<string, unknown>();

/**
 * A signature of everything the shelves depend on.
 *
 * Sorted, because set iteration order is insertion order and two identical
 * pantries built in different orders must produce the same key.
 */
export function shelfKey(
  pantry: Pantry, diet: DietSelection, dismissed: Set<string>, extra = "",
): string {
  const list = (s: Set<string> | string[]) => [...s].sort().join(",");
  return [
    list(pantry.have),
    list(pantry.useFirst),
    list(diet.excludes),
    list(diet.classes),
    list(diet.allergens),
    list(dismissed),
    extra,
  ].join("|");
}

/**
 * Memoised compute. `compute` must be pure in the things `shelfKey` covers.
 *
 * Insertion-ordered eviction rather than true LRU: with one owner and a handful
 * of pantry states in play, the difference is unmeasurable and the simpler one
 * has less to go wrong.
 */
export function shelves<T>(key: string, compute: () => T): T {
  const hit = cache.get(key);
  if (hit !== undefined) return hit as T;
  const made = compute();
  cache.set(key, made);
  if (cache.size > MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return made;
}

/** What the home page needs, in one cacheable bundle. */
export type Shelves = {
  canCook: Match[];
  nearly: Match[];
};
