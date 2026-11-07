/**
 * What the meal plan implies about shopping — the join between the calendar and
 * the grocery list.
 *
 * The two halves are the same fact read from opposite ends:
 *
 *   - **the list needs the calendar**: planning three dinners is a decision
 *     about shopping, and a grocery list that does not know what you planned
 *     makes you work it out yourself, recipe by recipe
 *   - **the calendar needs the list**: a planned meal you cannot cook yet is a
 *     different thing from one you can, and Thursday should say which it is
 *     while there is still time to do something about it
 *
 * Both are computed, never stored. A stored "shopping list for the week" would
 * be wrong the moment you bought something, and the pantry already knows.
 */
import type { Match, Recipe, Relations } from "./match";
import { scoreRecipe } from "./match";
/* The CORE, not the server shell — this is the one value import in the file
   and it used to name `store.ts`, which reaches `node:fs`. The drawer computes
   the plan's shopping on the device now (STATIC-SPEC §2), and one value import
   is all it would take to put the filesystem in a browser bundle. */
import { dayKey } from "./owner-core";
import type { Owner, PlanEntry } from "./owner-core";
import type { Pantry } from "./match";

/** One ingredient the plan needs and the pantry lacks. */
export type PlanNeed = {
  id: string;
  name: string;
  /** The meals waiting on it — "Thu dinner". Plural is the point: one trip. */
  forMeals: string[];
  /** Already on the grocery list, so the row is a reminder rather than a task. */
  onList: boolean;
};

/** A planned meal, with what it would take to cook it. */
export type PlanStatus = {
  plan: PlanEntry;
  recipe: Recipe;
  match: Match;
  /** Missing ingredients already on the grocery list. */
  onList: number;
};

/**
 * The plans worth shopping for: today and later, not yet cooked.
 *
 * A plan in the past that never became a cook is not a shopping need — it is a
 * dinner that did not happen, and putting its ingredients on the list would
 * have you buying for last Tuesday. It stays on the calendar, because deleting
 * the user's intention is not ours to do.
 */
export function upcomingPlans(
  owner: Owner | null, today: string, horizonDays = 7, tz?: string,
): PlanEntry[] {
  // A horizon, so "shop for this week" is literally what the button does. A
  // list that also carried a dinner planned for next month would be a list you
  // cannot take to a shop.
  const end = new Date(`${today}T12:00:00`);
  end.setDate(end.getDate() + horizonDays - 1);
  // `dayKey`, not `toISOString().slice(0,10)` — the latter converts to UTC
  // first and lands on the wrong day west of Greenwich, which would quietly
  // drop or include the last day of the horizon.
  const last = dayKey(end, tz);
  return (owner?.plans ?? [])
    .filter((p) => !p.cook_id && p.date >= today && p.date <= last)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Status for a set of plans — what the calendar renders per square. */
export function planStatuses(
  plans: PlanEntry[], byId: Map<string, Recipe>, pantry: Pantry, relations: Relations,
  onList: Set<string>,
): PlanStatus[] {
  const out: PlanStatus[] = [];
  for (const plan of plans) {
    /* A NOTE has no recipe and never will — "eat out" is a decided meal, and
       the whole point of it reaching the calendar is that it needs nothing
       bought. Skipping it here is what makes that true of `planNeeds` too. */
    const recipe = plan.recipe_id ? byId.get(plan.recipe_id) : undefined;
    // A plan pointing at a recipe the index no longer holds is a real state —
    // ids are stable, but the corpus is regenerated. The calendar still shows
    // the row; it just cannot say anything about ingredients.
    if (!recipe) continue;
    const match = scoreRecipe(recipe, pantry, relations);
    out.push({
      plan, recipe, match,
      onList: match.missing.filter((id) => onList.has(id)).length,
    });
  }
  return out;
}

/**
 * Everything the upcoming plan needs and the pantry lacks, once each.
 *
 * Deduplicated across meals, because the answer to "what do I buy" is a
 * shopping trip, not a list per dinner — and an ingredient three meals want is
 * the one you must not forget. Ordered by how many meals want it for the same
 * reason.
 *
 * Nothing here is written. Adding to the grocery list stays a decision the user
 * makes, one tap per row: silently filling someone's list from their calendar
 * would make the list something they no longer trust.
 */
/**
 * `label` receives the whole STATUS, not just the plan.
 *
 * It took a `PlanEntry`, so the only thing a caller could name was the slot —
 * every row read "Thu dinner", which says when you meant to eat and not what
 * you were going to make. A week later "gochujang — Thu dinner" is unreadable;
 * "gochujang — Korean Fried Chicken" is the reason you wrote it down.
 */
export function planNeeds(
  statuses: PlanStatus[], nameOf: (id: string) => string, onList: Set<string>,
  label: (status: PlanStatus) => string,
): PlanNeed[] {
  const needs = new Map<string, PlanNeed>();
  for (const s of statuses) {
    for (const id of s.match.missing) {
      const row = needs.get(id);
      if (row) row.forMeals.push(label(s));
      else needs.set(id, {
        id, name: nameOf(id), forMeals: [label(s)], onList: onList.has(id),
      });
    }
  }
  return [...needs.values()].sort((a, b) =>
    // Already-listed rows sink: they are settled, and the ones still to decide
    // about are what the section is for.
    Number(a.onList) - Number(b.onList) ||
    b.forMeals.length - a.forMeals.length ||
    a.name.localeCompare(b.name));
}
