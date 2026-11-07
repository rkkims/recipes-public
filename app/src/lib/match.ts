/**
 * Matching — the score function from DECISIONS §4.
 *
 * Pure functions over plain data. No framework, no database, no I/O. That is
 * deliberate: this is the part of the product that has to be right, and it
 * should be testable without booting anything and replaceable without touching
 * a component.
 *
 * The ONLY matcher. There were two — this and `src/match/score.ts`, which was
 * where the tests lived — kept in step by hand under a comment saying so. They
 * drifted the moment this one grew disclosure and the disclosed weight, and the
 * copy under test was then the copy nothing ran. The tests moved here instead.
 * (`npm run test-match` at the repo root). The app cannot import across its own
 * package boundary, and duplicating ~150 lines of pure functions is a smaller
 * problem than a build step that exists only to share them. If this file and its
 * source diverge, the tests are the arbiter.
 *
 *     score(R) = β · |use_first ∩ R| − λ · Σ friction(i)     for i ∈ R \ pantry
 *     friction(i) = w_base
 *
 * Friction is flat because `sourcing` was cut (DECISIONS §3) — every missing
 * ingredient costs the same, so the second term is just a count of what you are
 * missing.
 */
/**
 * Relations, injected rather than imported.
 *
 * `src/ontology/edges.ts` keys its relations by NAME, and everything downstream
 * of the ontology build keys by opaque id (INGREDIENT-SPEC §1). Calling that
 * module directly from here would have compiled, passed its tests against
 * hand-written names, and then silently matched nothing in production — every
 * lookup would miss, and the only symptom would be slightly worse results.
 *
 * So the matcher declares what it needs and the caller supplies it, built from
 * whichever vocabulary it is actually using.
 */
export type Relations = {
  satisfies(want: string, have: string): { ok: boolean; via?: string; disclose?: boolean };
};

/** No relations at all — exact matches only. */
export const EXACT_ONLY: Relations = {
  satisfies: (want, have) => (want === have ? { ok: true, via: "exact" } : { ok: false }),
};

export type Recipe = {
  id: string;
  title: string;
  url: string;
  source: string;
  cuisine: string;
  /**
   * ALL the cuisines this recipe sits under — a dish can be Korean AND
   * Chinese (settled 2026-08-16). Curation-owned: the pipeline still writes
   * the single `cuisine`, a curator can name several, and `load()` merges
   * them here with the first as the primary that `cuisine` keeps carrying.
   * Absent means "just the one" — read through `cuisinesOf`, never directly.
   */
  cuisines?: string[];
  /**
   * The source page's own photo. Present on 4,861 of 4,874 recipes and carried
   * through untyped until the gallery needed it — the field was always in
   * `recipe-index.json`, just never declared.
   */
  image?: string;
  /** The source's own publish date, when it declared one. Orders a creator's
      shelf newest-first; nothing else reads it. */
  datePublished?: string;
  /** The creator confirmed this ingredient list themselves — CREATOR-SPEC §5's
      badge attaches to exactly this flag. Set by the claims overlay, never by
      the pipeline. */
  confirmed?: boolean;
  requires: string[];
  /**
   * Other recipes this one uses as an ingredient — "1 cup of my anchovy
   * stock (recipe here)", a shape blog creators use constantly. Recipe ids;
   * written by curation for the corpus and by the creator add flow for their
   * own rows, never by the pipeline. `expandComponents` folds a component's
   * ingredients into `requires` at assembly (settled 2026-08-16: the pantry
   * math should know you need the stock's anchovies), and the modal links
   * the component recipe itself.
   */
  components?: string[];
  /**
   * Ingredients the recipe itself marks optional — a garnish, an "if you have
   * it". Missing one costs NOTHING: charging for a garnish would rank a dish
   * you can make below one you cannot.
   */
  optional?: string[];
  /**
   * Substitutions THIS RECIPE offers: requirement id → acceptable stand-ins.
   *
   * Not the ontology's `substitutes_for`, which is a claim about the world and
   * needs review. This is one author saying what works in one dish, and it
   * needs none — they already said it. It also counts at FULL strength: a
   * recipe that offers red chili in place of green is not making a compromise,
   * it is describing itself.
   *
   * **OR of ANDs.** Each inner array is ONE alternative, and every id in it is
   * required together: `[["sriracha"], ["egg", "ice", "flour"]]` reads "sriracha,
   * or else all three of egg, ice and flour". A flat list cannot express the
   * second — it would claim flour alone stands in for tempura mix, which is a
   * recipe reported as cookable when it is not. See RECIPE-SPEC §3a.
   */
  alternates?: Record<string, string[][]>;
  /**
   * What the dish is OF — RECIPE-SPEC §4c. At most two, ordered, curated.
   *
   * Missing one is charged `w.mainMissing` times a normal requirement: missing
   * the beef in bulgogi is not the same event as missing the sesame seeds. It
   * never filters — §4c penalises heavily and never blocks, so substitution
   * stays reachable and this field's gaps (it is curated, and incomplete for a
   * long time) cost a ranking place rather than deleting recipes.
   */
  mainIngredients?: string[];
  /**
   * How many the source says it serves — present on 4,174 of 4,874 recipes.
   *
   * In `recipe-index.json` since the index was first built, and typed here for
   * the first time; nothing had ever read it. It answers the question a card
   * cannot otherwise answer at all — *is this dinner or a side?* — and it is a
   * string because sources write "4", "4-6" and "2 servings" and normalising
   * that would be inventing precision we were not given.
   *
   * Never used in ranking. It is a fact about the dish, not a judgement.
   */
  yield?: string;
  /**
   * The SOURCE's rating, out of 5 — present on 3,932 of 4,874.
   *
   * Emphatically not the user's own stars, which live on `CookEvent` and mean
   * something different: this is a blog's aggregate from its own readers. Any
   * surface showing it has to say whose it is, because a single unlabelled ★
   * next to a dish the user has cooked twice reads as their own score.
   *
   * Not used in ranking either — DECISIONS keeps the score function to pantry
   * distance and urgency, and popularity is a different axis that would quietly
   * dominate it. It is offered as a sort and as a shelf, never mixed in.
   */
  rating?: number;
  unresolved: string[];
};

/**
 * Recipes hidden by a dietary exclusion — USER-SPEC §6.
 *
 * Split out rather than folded into `rank` because the COUNT is part of the
 * contract: §6 requires the UI to say how many were hidden and why. A filter
 * that silently shrinks the results is the one thing this must not be.
 */
export function applyExcludes<R extends { requires: string[]; optional?: string[] }>(
  recipes: R[], excludes: Set<string>,
): { kept: R[]; hidden: number } {
  if (excludes.size === 0) return { kept: recipes, hidden: 0 };
  const kept = recipes.filter((r) => {
    for (const id of r.requires) if (excludes.has(id)) return false;
    // Optional ingredients count too. "Hidden because it contains peanut" is
    // about the recipe, and a garnish is still in it.
    for (const id of r.optional ?? []) if (excludes.has(id)) return false;
    return true;
  });
  return { kept, hidden: recipes.length - kept.length };
}

export type Pantry = {
  /** Ingredient ids the user has. */
  have: Set<string>;
  /** Subset of `have`, pinned to the Use-first shelf. */
  useFirst: Set<string>;
};

export type Weights = {
  /** β — reward per Use-first ingredient the recipe uses. */
  urgency: number;
  /** λ · w_base — cost per missing ingredient. */
  missing: number;
  /** Multiplier on a missing MAIN ingredient (RECIPE-SPEC §4c). Set empirically. */
  mainMissing: number;
  /**
   * Cost of a covered-but-disclosed requirement — §3a, "ranked below exact".
   *
   * Far below `missing`: a disclosed match is a recipe you can probably cook
   * and should check, not one you cannot. It only has to break the tie against
   * an otherwise identical recipe that needs no checking.
   */
  disclosed: number;
};

export const DEFAULT_WEIGHTS: Weights = { urgency: 3, missing: 1, mainMissing: 4, disclosed: 0.15 };

export type Covered = {
  need: string;
  via: string;
  /**
   * The pantry item that covered it, when it was not an exact match. The UI
   * needs both ends to write the disclosure — "the recipe calls for basa and
   * your pantry says white fish" is unsayable from the requirement alone.
   */
  have?: string;
  /** §3a: the pantry entry is BROADER than the requirement, so ask. */
  disclose?: boolean;
};

export type Match = {
  recipe: Recipe;
  score: number;
  /** Requirements the pantry covers, and how. */
  covered: Covered[];
  missing: string[];
  /** Optional ingredients the pantry does not cover. Shown, never charged for. */
  missingOptional: string[];
  /** Use-first ingredients this recipe consumes. */
  uses: string[];
  /** True when we cannot account for every line (RECIPE-SPEC §1). */
  incomplete: boolean;
};

/**
 * Total friction, in units of w_base — RECIPE-SPEC §4c.
 *
 *     friction = Σ (i ∈ mainIngredients ? mainMissing : 1)
 *
 * A plain count until a main ingredient is missing. This is a fact about the
 * DISH, not a global prior about the ingredient, which is why it does not
 * reopen the decision that cut `sourcing`.
 */
function frictionOf(missing: string[], recipe: Recipe, w: Weights): number {
  const main = recipe.mainIngredients;
  if (!main || main.length === 0) return missing.length;
  const isMain = new Set(main);
  let total = 0;
  for (const id of missing) total += isMain.has(id) ? w.mainMissing : 1;
  return total;
}

/**
 * Does the pantry satisfy one requirement, and by what route?
 *
 * Exact first, then relations. The relation directions are the product
 * (INGREDIENT-SPEC §3): holding `chicken thigh` satisfies a recipe wanting
 * `chicken`, and holding `chicken` does NOT satisfy one wanting the thigh.
 */
function cover(
  need: string, have: Set<string>, rel: Relations, alts?: string[][],
): Covered | null {
  if (have.has(need)) return { need, via: "exact" };
  // What the recipe itself offers, before anything we inferred.
  //
  // `every`, not `some`: an alternative can be a COMBINATION — "or egg + ice +
  // flour" in place of tempura mix — and holding one part of it is holding
  // nothing. Treating the group as a flat list is how a recipe gets reported as
  // cookable on the strength of the flour alone (RECIPE-SPEC §3a).
  for (const group of alts ?? [])
    if (group.length && group.every((alt) => have.has(alt)))
      return { need, via: group.length > 1 ? "recipe-alternate-combo" : "recipe-alternate" };
  /**
   * A silent cover beats a disclosed one, so the whole pantry is searched
   * before settling. Returning the first hit would let `white fish` raise a
   * question about a recipe the `basa` two entries later answers outright.
   */
  let fallback: Covered | null = null;
  for (const held of have) {
    const r = rel.satisfies(need, held);
    if (!r.ok) continue;
    const hit: Covered = { need, via: r.via ?? "relation", have: held };
    if (!r.disclose) return hit;
    if (!fallback) fallback = { ...hit, disclose: true };
  }
  return fallback;
}

export function scoreRecipe(
  recipe: Recipe, pantry: Pantry, rel: Relations = EXACT_ONLY, w: Weights = DEFAULT_WEIGHTS,
): Match {
  const covered: Covered[] = [];
  const missing: string[] = [];
  for (const need of recipe.requires) {
    const hit = cover(need, pantry.have, rel, recipe.alternates?.[need]);
    if (hit) covered.push(hit); else missing.push(need);
  }
  const missingOptional: string[] = [];
  for (const opt of recipe.optional ?? [])
    if (!cover(opt, pantry.have, rel, recipe.alternates?.[opt])) missingOptional.push(opt);

  // A pinned ingredient counts wherever it appears, including as an optional
  // one: using up the coriander is the point, whether the recipe insists on it
  // or merely suggests it.
  const uses = [...recipe.requires, ...(recipe.optional ?? [])]
    .filter((r) => pantry.useFirst.has(r));
  return {
    recipe,
    /**
     * Disclosed covers are charged a little — §3a ranks them below exact. The
     * charge is per disclosed requirement, not per recipe, because three
     * questions to answer is a worse offer than one.
     */
    score: w.urgency * uses.length
      - w.missing * frictionOf(missing, recipe, w)
      - w.disclosed * covered.filter((c) => c.disclose).length,
    covered, missing, missingOptional, uses,
    incomplete: recipe.unresolved.length > 0,
  };
}

export type Options = {
  relations?: Relations;
  weights?: Weights;
  /** Drop recipes we cannot fully account for (RECIPE-SPEC §1). */
  requireComplete?: boolean;
  /** Never show recipes missing more than this. */
  maxMissing?: number;
  limit?: number;
};

/**
 * Rank recipes for a pantry.
 *
 * **The must-use rule** (BUILD.md Phase A): with exactly ONE Use-first pin the
 * pin is a HARD FILTER — the user is telling us what tonight is about, and a
 * list that ignores it is not an answer to the question they asked. With two or
 * more it becomes a boost, because requiring all of them would usually return
 * nothing, and a pin that empties the screen teaches people not to pin.
 */
export function rank(recipes: Recipe[], pantry: Pantry, opts: Options = {}): Match[] {
  const w = opts.weights ?? DEFAULT_WEIGHTS;
  const rel = opts.relations ?? EXACT_ONLY;
  const pins = [...pantry.useFirst];
  const hardFilter = pins.length === 1 ? pins[0]! : null;

  // A recipe with no recognised requirements is satisfied by any pantry, which
  // makes it rank first and mean nothing. "How to make Korean white rice" lists
  // only water and rice, both of which resolve away — leaving a recipe that
  // claims to need nothing.
  let out = recipes.filter((r) => r.requires.length > 0);
  if (hardFilter) out = out.filter((r) =>
    r.requires.includes(hardFilter) || (r.optional ?? []).includes(hardFilter));
  if (opts.requireComplete) out = out.filter((r) => !r.unresolved.length);

  let scored = out.map((r) => scoreRecipe(r, pantry, rel, w));
  if (opts.maxMissing !== undefined)
    scored = scored.filter((m) => m.missing.length <= opts.maxMissing!);

  scored.sort((a, b) =>
    b.score - a.score ||
    a.missing.length - b.missing.length ||
    // Deterministic tail so results do not shuffle between identical requests.
    a.recipe.id.localeCompare(b.recipe.id));

  return opts.limit ? scored.slice(0, opts.limit) : scored;
}

/**
 * "One ingredient away" — a standing section, not a zero-results fallback
 * (UX-SPEC §5). These are the recipes where buying one thing unlocks a meal,
 * which is both the most useful list in the product and the grocery list's
 * reason to exist.
 */
/**
 * Recipes you cannot quite make, nearest first.
 *
 * Was one-missing only, which hid the shape of the near-miss set: a pantry
 * with nothing in it had an empty list and no sense of how close anything was.
 * Now it takes everything short of complete and orders by HOW SHORT, so the
 * list degrades gracefully — full of one-away rows when the pantry is deep,
 * and still useful when it is not.
 *
 * Ordering is missing-count first and score second, not score alone. Score
 * mixes in urgency and main-ingredient weight, so a 3-away recipe using two
 * pinned items can outscore a 1-away one — true for ranking, wrong for a list
 * whose entire question is "what is closest".
 */
export function nearMisses(
  recipes: Recipe[], pantry: Pantry, opts: Options = {}, limit = 30, maxMissing = 5,
): Match[] {
  /**
   * Every MAIN ingredient must be covered — RECIPE-SPEC §4c.
   *
   * Reviewer's call, and it sharpens what this list means. "Two away" is only
   * an invitation if the two are garnishes; missing the beef in bulgogi is not
   * being close to bulgogi, it is not having the dish at all. §4c already
   * charges `mainMissing` for it, but a penalty only moves a row down the list
   * and this list is short — the wrong recipes were still occupying it.
   *
   * A recipe with no curated mains is NOT excluded. The field is curated and
   * incomplete by design (§4c: "never from a blank field"), so treating absence
   * as failure would empty the list for most of the corpus and make the
   * curation backlog look like a bug in matching.
   */
  const mainsCovered = (m: Match) => {
    const mains = m.recipe.mainIngredients;
    if (!mains || mains.length === 0) return true;
    const missing = new Set(m.missing);
    return mains.every((id) => !missing.has(id));
  };
  return rank(recipes, pantry, { ...opts, requireComplete: true })
    .filter(mainsCovered)
    .filter((m) => m.missing.length >= 1 && m.missing.length <= maxMissing)
    .sort((a, b) => a.missing.length - b.missing.length || b.score - a.score)
    .slice(0, limit);
}

/** One missing ingredient — what `unlocks` counts over. */
export function oneAway(recipes: Recipe[], pantry: Pantry, opts: Options = {}, limit = 20): Match[] {
  return rank(recipes, pantry, { ...opts, requireComplete: true })
    .filter((m) => m.missing.length === 1)
    .slice(0, limit);
}

/**
 * What to buy to unlock the most recipes, in order.
 *
 * Counts across the one-away set: an ingredient that appears as the single
 * missing item in nine recipes is worth more than one that appears in one.
 */
export function unlocks(recipes: Recipe[], pantry: Pantry, opts: Options = {}, limit = 10):
  Array<{ ingredient: string; unlocks: number }> {
  const count = new Map<string, number>();
  for (const m of oneAway(recipes, pantry, opts, Infinity))
    count.set(m.missing[0]!, (count.get(m.missing[0]!) ?? 0) + 1);
  return [...count.entries()]
    .map(([ingredient, n]) => ({ ingredient, unlocks: n }))
    .sort((a, b) => b.unlocks - a.unlocks || a.ingredient.localeCompare(b.ingredient))
    .slice(0, limit);
}

/** Every cuisine a recipe sits under — the one read path for the field pair
    (`cuisines` when curated, the single `cuisine` otherwise). "unresolved"
    is the absence of an answer, not a cuisine, and never comes back. */
export function cuisinesOf(r: Recipe): string[] {
  if (r.cuisines?.length) return r.cuisines.filter((c) => c !== "unresolved");
  return r.cuisine && r.cuisine !== "unresolved" ? [r.cuisine] : [];
}

/**
 * Fold each recipe's components into its `requires` — see `Recipe.components`.
 *
 * ONE level, by construction: a component contributes its own STORED
 * ingredients, never its components' — so a cycle (a stock that lists the
 * jjigae that lists the stock) costs nothing but a redundant line, instead of
 * a hang. Components are resolved within the passed list, which is the honest
 * boundary: a component that is not in the caller's pool (hidden, withdrawn,
 * unserved) contributes nothing rather than smuggling an unserved recipe's
 * list back in. Order is kept and duplicates dropped, so a recipe that names
 * gochujang itself AND uses a component that needs it still requires it once.
 */
export function expandComponents<T extends Recipe>(recipes: T[]): T[] {
  if (!recipes.some((r) => r.components?.length)) return recipes;
  const byId = new Map(recipes.map((r) => [r.id, r]));
  return recipes.map((r) => {
    if (!r.components?.length) return r;
    const merged = new Set(r.requires);
    const before = merged.size;
    /* RECURSIVE — the curator's rule (2026-08-21): a dish that uses a stock
       that uses dried anchovies requires the anchovies. Walked with a seen
       set, because two recipes may cite each other and a cycle must fold
       both once rather than forever. */
    const seen = new Set<string>([r.id]);
    const stack = [...r.components];
    while (stack.length) {
      const cid = stack.pop()!;
      if (seen.has(cid)) continue;
      seen.add(cid);
      const c = byId.get(cid);
      if (!c) continue;
      for (const ing of c.requires) merged.add(ing);
      if (c.components?.length) stack.push(...c.components);
    }
    return merged.size === before ? r : { ...r, requires: [...merged] };
  });
}
