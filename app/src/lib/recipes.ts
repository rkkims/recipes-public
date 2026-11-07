/**
 * One place that knows a user's recipes are the corpus PLUS their own.
 *
 * `load()` caches one object shared by every owner in the process, so own
 * recipes must never go into it — that constraint is right and it stays. What
 * was missing is the other half: every caller then had to remember to merge,
 * and the ones that forgot did not fail loudly. They failed by looking up a
 * recipe the user was staring at and not finding it.
 *
 * `madeIt` was the expensive case. It resolved through `load().recipes` alone,
 * so pressing "Made it" on a recipe you added yourself answered *"that recipe is
 * no longer in the index — reload the page"*, and reloading did not help. The
 * one action that closes the cook loop was the one action own recipes could not
 * do. The calendar's plan picker had the same blind spot more quietly: you
 * simply could not find your own recipes when planning a week.
 *
 * So the merge lives here, named, and the pages and actions call it instead of
 * spelling it out. Cheap to call — `ownAsRecipes` maps a handful of rows.
 */
import { load, search, type Recipe } from "./data";
import { expandComponents } from "./match";
import { asRecipe, creatorRecipeById } from "./creator-recipes";
import { unlistedRecipeIds } from "./creators";
import { applyConfirmations, hiddenRecipeIds } from "./claims";
import { normalizeUrl } from "./requests";
import { MIN_RECIPES, MIN_TITLES, titleWordCounts } from "./dish-words";
import { ownAsRecipes, type Owner } from "./store";

/** The corpus plus this owner's own recipes. Own ones last, so ids collide toward theirs. */
export function allRecipesFor(owner: Owner | null): Recipe[] {
  // CREATOR-SPEC §6/§6a at the source: a withdrawn or removed creator's recipes leave every
  // pool built from here — the home shelves included, whose memo key is the
  // pool's length and therefore rotates the moment this filter changes it.
  // Their own saves and cook history are the OWNER's rows and stay.
  // Hidden rides the same rail: one recipe taken off the page instead of a
  // whole creator, filtered at the same source so the shelves' memo key
  // rotates the same way.
  const gone = unlistedRecipeIds();
  for (const id of hiddenRecipeIds()) gone.add(id);
  const corpus = gone.size
    ? load().recipes.filter((r) => !gone.has(r.id))
    : load().recipes;
  /* Components fold in LAST, over the confirmed lists, within this filtered
     pool — a component that was hidden or withdrawn above contributes
     nothing, which is the same promise the filter already makes. */
  return expandComponents([...applyConfirmations(corpus), ...ownAsRecipes(owner)]);
}

/**
 * Kept recipes that use this one as a component — the reverse of the
 * "uses their X" line, so the inner recipe's page can point back out
 * (curator's ask, 2026-08-21). Gated corpus only: an outer recipe that is
 * not itself servable must not be advertised from here.
 */
export function usedInOf(id: string): Array<{ id: string; title: string; image?: string }> {
  return load().recipes
    .filter((r) => r.components?.includes(id))
    .map((r) => ({ id: r.id, title: r.title, ...(r.image ? { image: r.image } : {}) }));
}

/**
 * One recipe by id, from either source.
 *
 * Checks own recipes FIRST: they are a handful against 4,874, and an id that
 * exists in both should resolve to the user's.
 */
function baseRecipe(owner: Owner | null, id: string): Recipe | undefined {
  return ownAsRecipes(owner).find((r) => r.id === id)
    ?? ((r) => r ? applyConfirmations([r])[0] : undefined)(load().recipes.find((r) => r.id === id))
    // Creator-added recipes live outside the build cache and read fresh —
    // a creator saves and the /recipe page exists on the next request.
    ?? ((r) => r && asRecipe(r))(creatorRecipeById(id));
}

export function findRecipe(owner: Owner | null, id: string): Recipe | undefined {
  const hit = baseRecipe(owner, id);
  if (!hit?.components?.length) return hit;
  /* The standalone page must count the stock's anchovies exactly as the
     shelves do — same fold, resolved through the same lookup, and now
     TRANSITIVE: a component's own components fetch too, so the recursive
     fold has every level in hand. */
  const comps: Recipe[] = [];
  const seen = new Set<string>([hit.id]);
  const stack = [...hit.components];
  while (stack.length) {
    const cid = stack.pop()!;
    if (seen.has(cid)) continue;
    seen.add(cid);
    const c = baseRecipe(owner, cid);
    if (!c) continue;
    comps.push(c);
    if (c.components?.length) stack.push(...c.components);
  }
  return expandComponents([hit, ...comps])[0];
}

/**
 * Recipes we are willing to put in front of someone.
 *
 * **A recipe whose ingredient list we could not fully read does not go out.**
 * 1,439 of 4,874 have at least one line the parser could not place, and a
 * partial reading is not a small defect here — it is a wrong answer to the only
 * question the product asks. "Have everything" is a claim about what we parsed,
 * and if two lines went unread it may be a claim about eleven ingredients out
 * of thirteen. The distance meter made this worse rather than better: a ratio
 * in tabular numerals asserts a complete denominator far more confidently than
 * "2 away" ever did.
 *
 * `rank` and `nearMisses` have always enforced this via `requireComplete`. The
 * newer surfaces — the Popular shelf, recipe search, the calendar's plan picker
 * — did not, which is how an unread recipe could still reach a user. One
 * helper now, so the next surface added inherits the rule instead of having to
 * remember it.
 *
 * ── User-added recipes are exempt, and get it for free ─────────────────────
 *
 * `ownAsRecipes` reports `unresolved: []` — "nothing was parsed, so nothing
 * failed to parse" — so they pass this test by construction. That is the right
 * exemption for the right reason: the user chose those ingredients through the
 * autosuggest, so the vocabulary agreed to every one of them. There is nothing
 * unread to hide.
 *
 * ── What this costs, stated ────────────────────────────────────────────────
 *
 * 70.5% of the corpus remains servable. 72% of what is withheld is held back
 * for a SINGLE unread line, which is worth knowing: the gap is not a broken
 * pipeline, it is a vocabulary a few hundred terms short, and the curation loop
 * is the lever that reclaims it. Every term added returns recipes in bulk.
 */
export function servable<T extends { id: string; unresolved: string[] }>(recipes: T[]): T[] {
  // CREATOR-SPEC §6/§6a: a withdrawn or removed creator's recipes drop out of matching and
  // display. This is the choke point every shelf, payoff and creator page
  // already passes through, which is what makes "everywhere" one line.
  const gone = unlistedRecipeIds();
  for (const id of hiddenRecipeIds()) gone.add(id);
  return recipes.filter((r) => r.unresolved.length === 0 && !gone.has(r.id));
}

/**
 * The corpus recipe living at a URL, if it is fit to serve — the delivery
 * half of the request queue's promise, decided 2026-08 in place of a notify
 * channel: nothing emails anyone, the product itself is the notification.
 * A pasted copy whose URL this resolves transfers into the saved shelf
 * (`transferOwnUpgrades`) with everything the user wrote carried along, and
 * the board's unlocked block says the same thing to everyone else.
 *
 * The URL index is built once per process (the corpus is static); the
 * servable check runs per call, because unlisting moves at runtime.
 */
let twinIndex: Map<string, Recipe> | null = null;
export function corpusTwin(url: string): Recipe | undefined {
  if (!twinIndex) {
    twinIndex = new Map();
    for (const r of load().recipes) {
      const u = normalizeUrl(r.url);
      if (u) twinIndex.set(u, r);
    }
  }
  const u = normalizeUrl(url);
  const hit = u ? twinIndex.get(u) : undefined;
  return hit && servable([hit]).length ? applyConfirmations([hit])[0] : undefined;
}

/**
 * Title search across the corpus AND the user's own recipes.
 *
 * `searchRecipes` in `data.ts` cannot do this — it has no owner, by design, and
 * giving it one would put user state inside the shared cache. So the corpus
 * search runs there and this tops it up, using the same tiering rule so the two
 * halves rank consistently.
 */
export function searchAllRecipes(owner: Owner | null, q: string, limit = 12): Recipe[] {
  const term = q.toLowerCase().trim();
  if (term.length < 2) return [];

  const mine = ownAsRecipes(owner).filter((r) => r.title.toLowerCase().includes(term));
  // Nothing unread goes out — see `servable`. Own recipes pass it by
  // construction, so this filters the corpus half only.
  const corpus = servable(load().recipes);

  const tier = (r: Recipe) => {
    const t = r.title.toLowerCase();
    if (t.startsWith(term)) return 0;
    if (t.includes(` ${term}`)) return 1;
    return 2;
  };

  // Own recipes come first at equal tier — you added them because you meant to
  // cook them, and there are never enough of them to crowd anything out.
  const own = new Set(mine.map((r) => r.id));
  return [...mine, ...corpus.filter((r) => r.title.toLowerCase().includes(term))]
    .map((r) => ({ r, t: tier(r) }))
    .sort((a, b) =>
      a.t - b.t ||
      Number(own.has(b.r.id)) - Number(own.has(a.r.id)) ||
      a.r.title.length - b.r.title.length ||
      a.r.title.localeCompare(b.r.title))
    .slice(0, limit)
    .map((x) => x.r);
}

/**
 * The ingredient the query is really naming, if any.
 *
 * The recipe box takes a dish name OR an ingredient now, and it has to decide
 * which without asking. Exact name or alias is not enough — nobody finishes
 * typing "gochujang" before expecting an answer — so a PREFIX of a known
 * ingredient counts too, and the ontology's own search does the alias work.
 *
 * Deliberately strict about what it accepts. A loose match here would turn a
 * title search into an ingredient search behind the user's back: "beef bulgogi"
 * must stay a dish, not become "every recipe with beef in it".
 */
export function ingredientNamed(q: string): { id: string; name: string } | undefined {
  const term = q.toLowerCase().trim();
  if (term.length < 2) return undefined;
  for (const h of search(term, 3)) {
    const hit = h.name.toLowerCase(), via = h.via?.toLowerCase();
    if (hit === term || via === term || hit.startsWith(term) || via?.startsWith(term))
      return { id: h.id, name: h.name };
  }
  return undefined;
}

/**
 * Every recipe that ingredient answers a requirement of.
 *
 * NARROWER forms count: searching `kimchi` has to find the recipe that asks for
 * `cucumber kimchi`, because a jar of kimchi on the shelf is what the person
 * typing has. The walk is over `children` — one pass, cached with the ontology
 * — rather than `satisfies` per requirement, which would run a graph search
 * thousands of times per keystroke.
 *
 * The reverse does NOT hold, and that is the point of the oil correction: a
 * recipe asking for `sesame oil` is not answered by `oil`, so searching `oil`
 * must not offer it. `children` only ever walks down.
 */
export function recipesUsing(owner: Owner | null, ingredientId: string): Recipe[] {
  const { children } = load();
  /* Iterating a Set while adding to it IS the breadth-first walk — new members
     are visited, existing ones are not re-added, so a cycle terminates. */
  const covers = new Set<string>([ingredientId]);
  for (const cur of covers) for (const kid of children.get(cur) ?? []) covers.add(kid);

  const uses = (r: Recipe) => r.requires.some((need) => covers.has(need));
  // Same exemption as `searchAllRecipes`: nothing unread from the corpus, own
  // recipes pass by construction. See `servable`.
  return [...ownAsRecipes(owner).filter(uses), ...servable(load().recipes).filter(uses)];
}

/**
 * Everything `ingredientId` covers: itself and every narrower form beneath it.
 *
 * Down the hierarchy only. `kimchi` covers `cucumber kimchi` because the jar on
 * your shelf is what you have; `oil` does NOT reach `sesame oil`, which is the
 * whole point of the correction in INGREDIENT-SPEC §3a.
 */
function coversOf(ingredientId: string): Set<string> {
  const { children } = load();
  /* Iterating a Set while adding to it IS the breadth-first walk — new members
     are visited, existing ones are not re-added, so a cycle terminates. */
  const covers = new Set<string>([ingredientId]);
  for (const cur of covers) for (const kid of children.get(cur) ?? []) covers.add(kid);
  return covers;
}

/**
 * Does this recipe answer that search term?
 *
 * Returns a PREDICATE rather than a filtered list, because the page applies it
 * to the diet-kept set before ranking — the same place and for the same reason
 * as the cuisine filter (UX-SPEC §4j). Filtering rendered cards instead would
 * leave the tabs counting one thing above a grid showing another.
 *
 * Two readings, OR'd: the title contains the word, or the recipe wants the
 * ingredient the word names. "kimchi" has to find both the dish called kimchi
 * jjigae and the stew that merely needs a jar of it.
 */
export function termFilter(term: string): (r: Recipe) => boolean {
  const t = term.toLowerCase().trim();
  if (!t) return () => true;
  const ing = ingredientNamed(t);
  const covers = ing ? coversOf(ing.id) : null;
  return (r) => r.title.toLowerCase().includes(t)
    || (covers !== null && r.requires.some((need) => covers.has(need)));
}

/* The three facts that decide what counts as a word live in `lib/dish-words`
   now — pure, importable by the device's completion, and used from here
   unchanged. See that module for why each rule exists. */

let titleWords: Map<string, number> | null = null;

/** The corpus's own title vocabulary, built once and cached beside `load()`. */
function dishWords(): Map<string, number> {
  return (titleWords ??= titleWordCounts(load().recipes.map((r) => r.title)));
}

export type Completion = { term: string; recipes: number };

/**
 * What the recipe box offers: WORDS, not recipes — UX-SPEC §4j.
 *
 * The box used to answer with twelve recipe rows, which made it a second, worse
 * gallery sitting above the real one: a different card shape, its own ordering,
 * and no tabs, saved marks or cook counts. Typing `gochu` should say
 * "gochujang? gochugaru?" and let the grid — which already knows how to show
 * recipes — show the recipes.
 *
 * The count on each row is the count the GRID will show for that word, not the
 * number of titles containing it and not the ingredient's corpus usage. Any
 * other number here would be a promise the next screen breaks.
 *
 * ── Counted in one pass, not one pass per candidate ────────────────────────
 *
 * The obvious shape — `all.filter(termFilter(t))` for each candidate — ran the
 * corpus twenty times and re-derived each ingredient from its name while doing
 * it: 362ms for `gochu`, per keystroke. Every candidate's ingredient ids go into
 * one `need -> candidates` index instead, and the corpus is walked ONCE.
 */
export function completions(owner: Owner | null, q: string, limit = 8): Completion[] {
  const term = q.toLowerCase().trim();
  if (term.length < 2) return [];

  /* The ontology first — it knows aliases, so `gochukaru` reaches `gochugaru` —
     and it hands back the id, so the covers walk needs no second lookup. */
  const cands = new Map<string, { covers: Set<string> | null; n: number }>();
  for (const h of search(term, 12))
    cands.set(h.name.toLowerCase(), { covers: coversOf(h.id), n: 0 });
  for (const [w, titles] of dishWords())
    if (titles >= MIN_TITLES && w.includes(term) && !cands.has(w))
      cands.set(w, { covers: null, n: 0 });

  /* need -> the candidates it satisfies. Built from the covers sets so the
     corpus walk below is a map lookup per requirement rather than a scan. */
  const byNeed = new Map<string, string[]>();
  for (const [t, c] of cands) for (const id of c.covers ?? [])
    (byNeed.get(id) ?? byNeed.set(id, []).get(id)!).push(t);

  for (const r of allRecipesFor(owner)) {
    const title = r.title.toLowerCase();
    const hit = new Set<string>();
    for (const t of cands.keys()) if (title.includes(t)) hit.add(t);
    for (const need of r.requires) for (const t of byNeed.get(need) ?? []) hit.add(t);
    for (const t of hit) cands.get(t)!.n++;
  }

  return [...cands]
    .map(([t, c]) => ({ term: t, recipes: c.n }))
    /* A word nothing uses is not a completion, and a word ONE recipe uses is a
       parser leftover wearing a name — `oil from the jared crab paste`. The
       exact term survives regardless: the user typed it, so it is a word. */
    .filter((c) => c.recipes >= (c.term === term ? 1 : MIN_RECIPES))
    /* Prefix beats substring — someone typing `gochu` means a word that STARTS
       with it, not `homemade gochujang sauce`. Then by what the grid will hold,
       because that is the only number on the row. */
    .sort((a, b) =>
      Number(b.term.startsWith(term)) - Number(a.term.startsWith(term)) ||
      b.recipes - a.recipes ||
      a.term.length - b.term.length)
    .slice(0, limit);
}

/* The ordering helpers live in `lib/order` now — pure, importable by the
   device's grid, and re-exported here so every server caller keeps the one
   address it has always used. See that module for why each rule exists. */
export { picturedFirst, shuffleDaily } from "./order";
