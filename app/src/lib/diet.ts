/**
 * The dietary filter — USER-SPEC §6.
 *
 * The rule the whole file exists to hold:
 *
 *   > We can honestly say **this recipe contains peanut** — we found it. We
 *   > cannot honestly say **this recipe is peanut-free**, because that is a
 *   > claim about everything we did not find.
 *
 * So this only ever HIDES. Nothing here labels a recipe safe, and the caller is
 * required to say how many were hidden and why.
 *
 * ── Why allergens are always strict ────────────────────────────────────────
 *
 * §6: *"recipes with any `unresolved[]` entry are also hidden when `allergens`
 * is set, because we cannot account for them."* 3.9% of ingredient mentions are
 * still unresolved and every recipe carries its own `unresolved[]`, so
 * "contains no peanuts" cannot be asserted over a list with an unknown in it.
 *
 * That costs recall — a peanut-allergic user sees fewer recipes than they could
 * — and §6 says plainly that this is the correct direction to be wrong in.
 *
 * Preferences get the opposite default: a vegetarian may want to see a
 * near-miss because they can judge it, so `classes` does not hide on
 * uncertainty. They are separate settings because they are separate questions.
 */
/**
 * The three fields the filter reads off a node, and no more.
 *
 * It asked for `data.ts`'s whole `Ingredient`, which is a row of the SERVER's
 * ontology — parser counts, slots, choices — and none of that is looked at
 * here. The narrower shape is what lets the device run the same filter over
 * the shipped bundle (STATIC-SPEC §5), and a server map still satisfies it
 * structurally, so every existing caller passes exactly what it passed before.
 *
 * §6's stakes are why this matters rather than being tidiness: a vegetarian
 * setting that silently stops filtering when the grid moves to the client is
 * the hazard the spec names.
 */
export type DietFacts = {
  name: string;
  allergens?: string[];
  animal_source?: string;
};

export type DietSelection = {
  excludes: Set<string>;
  classes: Set<string>;
  allergens: Set<string>;
};

/** Provenance values each class refuses. Halal is absent — see below. */
const CLASS_FORBIDS: Record<string, Array<"meat" | "fish" | "dairy" | "egg">> = {
  vegetarian: ["meat", "fish"],
  vegan: ["meat", "fish", "dairy", "egg"],
  pescatarian: ["meat"],
};

/**
 * The classes we can honestly offer.
 *
 * Halal is deliberately not here. It needs pork and alcohol specifically, and
 * `animal_source` records only that something is meat — a halal filter built on
 * it would pass pork belly, which is the failure that makes a filter worse than
 * no filter.
 */
export const CLASSES = Object.keys(CLASS_FORBIDS);

export type Hidden = { total: number; byReason: Array<{ reason: string; count: number }> };

/**
 * A temporary lift of the standing filter — the grid's "peek".
 *
 * Two layers, deliberately:
 *
 *   - **standing** — the account setting, answered at first run, applied on
 *     every page. §6 calls exclusions a standing instruction, and one that
 *     lapses when you change page is not standing.
 *   - **peek** — this. Lift a class for one browse without changing what you
 *     told us. It lives in the URL rather than in state, so the back button
 *     undoes it, a reload keeps it, and navigating anywhere fresh drops it. The
 *     reset the user expects falls out of the address instead of a timer.
 *
 * **Allergens cannot be peeked.** Lifting `vegetarian` for a browse is
 * harmless; lifting `shellfish` is a different class of risk, and this file
 * already refuses to claim a recipe is free of anything. So `classes` are
 * liftable and `allergens` are not — they come off in settings, deliberately,
 * or not at all. The two axes are stored separately, so this costs nothing.
 */
export function peek(diet: DietSelection, allow: string | undefined): {
  diet: DietSelection; lifted: string[];
} {
  const wanted = (allow ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const lifted = wanted.filter((c) => diet.classes.has(c));
  if (!lifted.length) return { diet, lifted: [] };
  return {
    diet: {
      excludes: diet.excludes,
      classes: new Set([...diet.classes].filter((c) => !lifted.includes(c))),
      // Untouched, on purpose. See above.
      allergens: diet.allergens,
    },
    lifted,
  };
}

type R = { requires: string[]; optional?: string[]; unresolved?: string[] };

/**
 * Hide what we can see, and count it.
 *
 * `byId` is the ontology; an id missing from it is an ingredient we cannot
 * account for, which under an allergen selection is grounds to hide the recipe
 * for exactly the same reason `unresolved` is.
 */
/**
 * Why ONE recipe is hidden, or `null` if it is not — the rule, extracted.
 *
 * `applyDiet` used to hold this inline, so the only way to know a recipe's diet
 * standing was to run the whole corpus through the filter and see whether it
 * came out. That is why the modal said nothing: it opens recipes from the
 * UNFILTERED set on purpose (a link to a recipe should open it), and `page.tsx`
 * has always carried the comment *"the modal says so instead"* — describing a
 * disclosure that was never written, because there was nothing to ask.
 *
 * One rule, two callers: the filter counts these, and the modal prints this
 * one's.
 */
export function dietVerdict(
  r: R, diet: DietSelection, byId: Map<string, DietFacts>,
): string | null {
  const ids = [...r.requires, ...(r.optional ?? [])];

  for (const id of ids) {
    if (diet.excludes.has(id)) return `you excluded ${byId.get(id)?.name ?? "an ingredient"}`;
  }

  if (diet.classes.size) {
    const forbidden = new Set<string>();
    for (const c of diet.classes) for (const s of CLASS_FORBIDS[c] ?? []) forbidden.add(s);
    for (const id of ids) {
      const src = byId.get(id)?.animal_source;
      if (src && forbidden.has(src)) return `not ${[...diet.classes].join("/")}`;
    }
  }

  if (diet.allergens.size) {
    for (const id of ids) {
      const ing = byId.get(id);
      if (!ing) return "an ingredient we could not identify";
      for (const a of ing.allergens ?? []) if (diet.allergens.has(a)) return `contains ${a}`;
    }
    // The gate §6 requires: an unaccounted-for line means we cannot speak.
    if ((r.unresolved?.length ?? 0) > 0) return "an ingredient we could not identify";
  }

  return null;
}

/**
 * A recipe with NOTHING to check — UX-SPEC §6's blind spot.
 *
 * `ownAsRecipes` reports `unresolved: []` ("nothing was parsed, so nothing
 * failed to parse") and `AddRecipe` deliberately allows saving with no
 * ingredients at all. Both are right on their own terms, and together they make
 * an empty requirement list satisfy every allergen filter trivially: the §6
 * gate fires on an unaccounted-for LINE, and a recipe with no lines has none.
 *
 * So it passes as clean when in truth it was never examined, which is the one
 * distinction this file exists to preserve. Callers say so rather than filter —
 * it is the user's own bookmark and hiding it would be absurd.
 */
export function unexaminable(r: R, diet: DietSelection): boolean {
  return (diet.allergens.size > 0 || diet.classes.size > 0) && r.requires.length === 0;
}

export function applyDiet<T extends R>(
  recipes: T[], diet: DietSelection, byId: Map<string, DietFacts>,
): { kept: T[]; hidden: Hidden } {
  const anything = diet.excludes.size || diet.classes.size || diet.allergens.size;
  if (!anything) return { kept: recipes, hidden: { total: 0, byReason: [] } };

  const counts = new Map<string, number>();
  const kept = recipes.filter((r) => {
    const why = dietVerdict(r, diet, byId);
    if (!why) return true;
    counts.set(why, (counts.get(why) ?? 0) + 1);
    return false;
  });

  return {
    kept,
    hidden: {
      total: recipes.length - kept.length,
      byReason: [...counts].map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count),
    },
  };
}
