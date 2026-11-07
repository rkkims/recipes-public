/**
 * The recipe modal's ingredient rows, built once.
 *
 * This block was written out three times — home, calendar, my-recipes — and had
 * to stay identical because the modal is deliberately the same component on all
 * three surfaces. Making the chips tappable meant adding two fields to every
 * row, in three places, which is exactly the shape of change that leaves one
 * copy behind.
 */
import type { DetailIngredient } from "@/components/RecipeDetail";
import type { IngredientState } from "@/components/StateWidget";
import type { Match, Recipe } from "./match";
import { dietVerdict, unexaminable, type DietFacts, type DietSelection } from "./diet";
import type { Owner } from "./store";

const NONE: IngredientState = { in_pantry: false, on_list: false, use_first: false };

/* The two owner selectors moved to `owner-core` in slice B and are re-exported
   here, so every caller keeps the address it has always used. The reason for
   the move was this file's own imports: `detailRows` called `mainsOf`, which
   reads the corpus off disk, so a client component importing `statesOf` from
   here pulled a filesystem into the browser bundle.

   Slice C finished the job the re-export started. `mainsOf` is now the
   CALLER's to supply (see `detailRows`), so this module imports nothing that
   touches a disk and the recipe surfaces can render it on the device. */
export { statesOf, extrasOf } from "./owner-core";

/**
 * A recorded cook, as `MyVersion` wants it — including what it used.
 *
 * `required` is the SNAPSHOT taken when the cook was recorded (RECIPE-SPEC §3),
 * so this asks about what that cooking actually consumed rather than about the
 * recipe as it stands today.
 *
 * Staples are dropped: nobody wants to answer "did you run out of salt?" after
 * every dinner, and a question people learn to dismiss is worse than no
 * question. `isStaple` is supplied by the caller so this file stays free of
 * vocabulary decisions.
 */
export function cookRows(
  cooks: Array<{ id: string; meal?: string; rating?: number; note?: string; required: string[] }>,
  states: Record<string, IngredientState>,
  nameOf: (id: string) => string,
  missing: string[],
  isStaple: (id: string) => boolean = () => false,
  /**
   * The dish's main ingredients — RECIPE-SPEC §4c, set by curation.
   *
   * Used for one thing here: which rows default to "used up". Cooking a
   * bulgogi consumes the beef and leaves the soy sauce, and that asymmetry is
   * true of nearly every dish. Defaulting the mains the other way asked the
   * user to correct the app on the rows it could most reliably have guessed.
   */
  mainIngredients: string[] = [],
) {
  const wanted = missing.map((id) => ({ id, name: nameOf(id) }));
  const main = new Set(mainIngredients);
  return cooks.map((c) => ({
    id: c.id,
    ...(c.meal !== undefined ? { meal: c.meal } : {}),
    ...(c.rating !== undefined ? { rating: c.rating } : {}),
    ...(c.note !== undefined ? { note: c.note } : {}),
    used: c.required
      .filter((id) => !isStaple(id))
      .map((id) => ({ id, name: nameOf(id), inPantry: states[id]?.in_pantry ?? false,
                      main: main.has(id) })),
    wanted,
  }));
}

/**
 * The diet props the modal wants, computed once for all three surfaces.
 *
 * Kept beside `detailRows` for the same reason that one exists: the modal is
 * deliberately the same component everywhere, so anything it needs must be
 * derived in one place or the copies drift.
 */
export function dietFor(
  recipe: { requires: string[]; optional?: string[]; unresolved?: string[] },
  diet: DietSelection,
  /* The facts the verdict actually reads, not the whole `Ingredient` — the
     device's index (`client-data.dietIndex`) carries provenance and allergens
     and deliberately not the parser artefacts, and it has to be able to answer
     this question. `dietVerdict` was already typed this way; this was the
     narrower one. */
  byId: Map<string, DietFacts>,
): { hiddenWhy?: string; unexaminable?: boolean; filtering?: boolean } {
  const filtering = diet.excludes.size > 0 || diet.classes.size > 0 || diet.allergens.size > 0;
  if (!filtering) return {};
  if (unexaminable(recipe, diet)) return { filtering, unexaminable: true };
  const why = dietVerdict(recipe, diet, byId);
  return { filtering, ...(why ? { hiddenWhy: why } : {}) };
}

export function detailRows(
  recipe: Recipe,
  match: Match,
  states: Record<string, IngredientState>,
  nameOf: (id: string) => string,
  buyUrlFor: (name: string) => string | null,
  /**
   * RECIPE-SPEC §4c's mains, supplied rather than derived.
   *
   * `mainsOf` falls back to corpus FREQUENCY when curation has not named them,
   * which means reading the whole recipe index — a filesystem, and the one
   * thing standing between this module and a browser. The answer is static per
   * deploy and per recipe, so the surface that knows where it is running looks
   * it up: the server pages call `mainsOf`, the device reads the curated
   * `main_ingredients` the bundle already ships. Empty is a valid answer and
   * only costs the ordering nuance below, never a wrong row.
   */
  mains: string[] = [],
): DetailIngredient[] {
  /**
   * Which pantry row a chip edits.
   *
   * For a requirement covered through a relation this is what the user actually
   * holds, not what the recipe asked for — writing to the recipe's own id would
   * touch a row they have never had. See `IngredientChips`.
   */
  const target = (need: string, holding?: string) => {
    const id = holding ?? need;
    return { targetId: id, targetName: nameOf(id), state: states[id] ?? NONE };
  };

  return [
    ...recipe.requires.map((need) => {
      const hit = match.covered.find((c) => c.need === need);
      const name = nameOf(need);
      return {
        id: need, name, have: !!hit,
        ...target(need, hit?.have),
        ...(hit?.disclose && hit.have ? { check: nameOf(hit.have) } : {}),
        ...(hit ? {} : { buyUrl: buyUrlFor(name) ?? undefined }),
      };
    }),
    // `covered` holds requirements only — an optional ingredient that IS in the
    // pantry never lands there, so its absence from `missingOptional` is what
    // says you have it.
    ...(recipe.optional ?? []).map((need) => ({
      id: need, name: nameOf(need),
      have: !match.missingOptional.includes(need), optional: true,
      ...target(need),
    })),
  ].sort(order(mains));
}

/**
 * The order the modal reads in: what you have, then what matters.
 *
 * Two keys, and which one comes first is the whole decision. **Availability
 * wins.** The modal's question is "can I cook this tonight", so the eye should
 * be able to run down the top of the list and see the kitchen it already has;
 * a main ingredient you do not own is still a gap, and a gap belongs with the
 * other gaps rather than at the top pretending to be an asset.
 *
 * Within each half, the mains come first — RECIPE-SPEC §4c, curated by a human
 * rather than inferred. That is what makes the top of "you have" read as the
 * dish (beef, gochujang) instead of whatever the source happened to list first,
 * and the top of "you need" read as what is actually stopping you.
 *
 * Stable within a tier, so anything the two keys do not separate keeps the
 * order the recipe wrote it in. `sort` is not required to be stable in the
 * spec but is in every engine this ships to; the tie-break is deliberately not
 * alphabetical, because a recipe's own order carries information (it is roughly
 * the order things go in the pan) and losing it buys nothing.
 */
function order(mainIngredients: string[]) {
  const main = new Set(mainIngredients);
  const rank = (r: DetailIngredient) => (r.have ? 0 : 2) + (main.has(r.id) ? 0 : 1);
  return (a: DetailIngredient, b: DetailIngredient) => rank(a) - rank(b);
}
