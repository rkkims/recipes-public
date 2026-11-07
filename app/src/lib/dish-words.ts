/**
 * The vocabulary the recipe box completes from — UX-SPEC §4j, pure.
 *
 * Extracted from `lib/recipes.ts` for the reason `lib/order.ts` was: it is
 * judgement over plain data with no disk read in it, and the device needs the
 * same judgement. `recipes.ts` imports from here and its callers are unchanged;
 * static mode's completion (`lib/shelf-actions-static.ts`) imports the same
 * three facts, so the two shells cannot disagree about what counts as a word.
 */

/**
 * Words that appear in titles and mean nothing as a search — UX-SPEC §4j.
 *
 * Two groups. Filler is filler: `easy`, `best`, `recipe`, `video` describe how
 * a page was written, not what is in the pan. Cuisine words are excluded for a
 * different reason — `korean` heads 956 titles, so it would top every list, and
 * the chip row above the grid already answers that question better than a
 * keyword can (it reads the stored `cuisine` field rather than the title).
 */
export const NOT_A_SEARCH = new Set([
  "with", "and", "the", "for", "from", "this", "that", "your", "you", "how",
  "easy", "best", "recipe", "recipes", "video", "style", "make", "making",
  "homemade", "quick", "simple", "authentic", "delicious", "perfect", "classic",
  "traditional", "favorite", "favourite", "minute", "minutes", "ingredient",
  "ingredients", "korean", "chinese", "japanese", "thai", "vietnamese",
  "filipino", "asian", "korea", "china", "japan", "one", "two", "three",
  "all", "new", "food", "dish", "way", "ways", "day", "days", "time",
]);

/** Titles a word has to appear in before it is worth offering. */
export const MIN_TITLES = 3;

/** A word has to reach this many recipes to be offered — unless it is exactly
    what was typed, in which case the user has already decided it is a word. */
export const MIN_RECIPES = 3;

/**
 * Dish words, harvested from the corpus's own titles.
 *
 * `japchae` is not an ingredient and never will be, so the ontology cannot
 * complete it — and it is exactly the sort of thing someone types. The titles
 * are the only place the product knows dish names from, so they are where the
 * vocabulary comes from.
 */
export function titleWordCounts(titles: Iterable<string>): Map<string, number> {
  const n = new Map<string, number>();
  for (const title of titles) {
    const seen = new Set<string>();
    for (const w of title.toLowerCase().split(/[^a-z0-9']+/)) {
      if (w.length < 3 || seen.has(w) || NOT_A_SEARCH.has(w)) continue;
      seen.add(w);
      n.set(w, (n.get(w) ?? 0) + 1);
    }
  }
  return n;
}
