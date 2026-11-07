/**
 * Clarifications — the questions the system asks instead of guessing.
 *
 * INGREDIENT-SPEC §6. Where we cannot know, we ask, at the moment the answer
 * matters, once, with the reason attached.
 *
 * The seed list is YIELD_LIMITED: the cases where owning the whole MAY supply
 * the part and may not. Those were modelled as "no edge", which is a silent no —
 * a user who owns kimchi juice was told they could not make a dish needing it.
 *
 * `because` is COMPUTED from the corpus, never written by hand. "Called for in
 * 34 recipes" is the difference between a question and an interruption, and a
 * clarification that unlocks nothing should not be asked at all — the count is
 * what proves it does.
 */
import { load, nameOf } from "./data";

export type Clarification = {
  id: string;
  /** Asking is prompted when this enters the pantry. */
  trigger: string;
  /** What a yes adds. */
  grants: string;
  question: string;
  because: string;
  /** Recipes the granted ingredient appears in. Zero means do not ask. */
  unlocks: number;
};

/** whole → part, where the yield is genuinely uncertain. */
const PAIRS: Array<[whole: string, part: string, question: string]> = [
  ["kimchi", "kimchi juice", "Does your kimchi have enough juice to cook with?"],
  ["pickles", "pickle juice", "Do you have the pickle brine too?"],
  ["olives", "olive brine", "Do you have the olive brine too?"],
];

let cache: Clarification[] | null = null;

export function clarifications(): Clarification[] {
  if (cache) return cache;
  const { ingredients, recipes } = load();
  const byName = new Map(ingredients.map((i) => [i.name.toLowerCase(), i.id]));
  const uses = new Map<string, number>();
  for (const r of recipes)
    for (const id of [...r.requires, ...(r.optional ?? [])])
      uses.set(id, (uses.get(id) ?? 0) + 1);

  cache = PAIRS.flatMap(([whole, part, question]) => {
    const trigger = byName.get(whole), grants = byName.get(part);
    if (!trigger || !grants) return [];
    const unlocks = uses.get(grants) ?? 0;
    // "Only where the answer changes something" — a question that unlocks
    // nothing is noise, and the corpus is what decides.
    if (unlocks === 0) return [];
    return [{
      id: `clar_${trigger}_${grants}`, trigger, grants, question,
      because: `${nameOf(grants)} is called for in ${unlocks} recipe${unlocks === 1 ? "" : "s"}`,
      unlocks,
    }];
  });
  return cache;
}

export const clarificationsFor = (ingredientId: string) =>
  clarifications().filter((c) => c.trigger === ingredientId);
