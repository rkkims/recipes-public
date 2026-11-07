/**
 * What a dish is actually made of — curated where we have it, inferred where we
 * do not.
 *
 * ── Why the fallback exists ───────────────────────────────────────────────
 *
 * RECIPE-SPEC §4c says main ingredients are a human judgement, and they are:
 * `data/curation/recipes.json` holds them and curation is deliberately slow.
 * Thirty recipes carry them today, out of 4,874.
 *
 * Two features now depend on knowing them — the order of the modal's ingredient
 * list, and which rows default to "used up" after a cook — and both would be
 * silent no-ops on 99.4% of the corpus. A feature that does nothing for all but
 * thirty recipes is not a feature; it is a plan.
 *
 * ── The inference, and why it is defensible ──────────────────────────────
 *
 * The rarest ingredients in a recipe are what make it that recipe. Measured
 * against the corpus, "Banana Bulgogi" requires garlic (2,394 recipes), soy
 * sauce (1,608), scallion (1,848) — and paper thin beef sirloin (1) and ripe
 * banana (14). The two rare ones are the dish. The common ones are the pantry.
 *
 * That is not a coincidence of one example: it is the same signal `isStaple`
 * encodes by hand, generalised. Staples are excluded first anyway, so this is
 * ranking what is left by how much it distinguishes the dish.
 *
 * ── Curation always wins ─────────────────────────────────────────────────
 *
 * Where a human has said, that is the answer and this file does not get a
 * vote. The inference is the floor, not a competitor — which also means every
 * hour of curation quietly improves both features rather than fighting them.
 *
 * Two, matching what curation stores (`main_ingredients` is sliced to two in
 * `lib/data`). More than two stops being "the main ingredients" and starts
 * being "most of the recipe".
 */
import { load } from "./data";
import { isStaple } from "./starter";
import type { Recipe } from "./match";

/** How many recipes in the corpus require each ingredient. Built once. */
let corpusFrequency: Map<string, number> | null = null;

function frequency(): Map<string, number> {
  if (corpusFrequency) return corpusFrequency;
  const f = new Map<string, number>();
  for (const r of load().recipes) {
    // `new Set` because a recipe listing something twice is one recipe, not two.
    for (const id of new Set(r.requires)) f.set(id, (f.get(id) ?? 0) + 1);
  }
  corpusFrequency = f;
  return f;
}

export function mainsOf(recipe: Pick<Recipe, "requires"> & { mainIngredients?: string[] }): string[] {
  if (recipe.mainIngredients?.length) return recipe.mainIngredients;

  const f = frequency();
  return [...new Set(recipe.requires)]
    .filter((id) => !isStaple(id))
    .sort((a, b) => (f.get(a) ?? 0) - (f.get(b) ?? 0)
                    // Stable and deterministic when two are equally rare, so the
                    // same recipe orders the same way on every render.
                    || a.localeCompare(b))
    .slice(0, 2);
}
