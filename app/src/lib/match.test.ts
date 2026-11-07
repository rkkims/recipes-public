/**
 * Matching regression cases.
 *
 *   npm run test-match
 *
 * The score function is the product. These assert the rules DECISIONS §4 and
 * INGREDIENT-SPEC §3 actually specify — especially the asymmetries, which are
 * the ones a plausible-looking rewrite would quietly lose.
 */
import { applyExcludes, nearMisses, oneAway, rank, scoreRecipe, unlocks, type Pantry, type Recipe, type Relations } from "./match.js";

/**
 * A tiny relation set, by NAME, standing in for the id-keyed one the app builds
 * from the ontology. The matcher takes relations as a parameter precisely so
 * this substitution is possible — see the note in score.ts.
 */
const REL: Relations = {
  satisfies(want, have) {
    const isA: Array<[string, string]> = [["coarse salt", "salt"]];
    const derives: Array<[string, string]> = [["lemon juice", "lemon"]];
    if (want === have) return { ok: true, via: "exact" };
    if (isA.some(([n, b]) => n === have && b === want)) return { ok: true, via: "is_a" };
    if (derives.some(([p, w]) => p === want && w === have)) return { ok: true, via: "derives_from" };
    return { ok: false };
  },
};

let failed = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) return;
  failed++;
  console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
};

const R = (id: string, requires: string[], unresolved: string[] = [], optional: string[] = [],
           alternates: Record<string, string[][]> = {}, mainIngredients: string[] = []): Recipe =>
  ({ id, title: id, url: "", source: "t", cuisine: "korean", requires, optional, alternates,
     mainIngredients, unresolved });
const P = (have: string[], useFirst: string[] = []): Pantry =>
  ({ have: new Set(have), useFirst: new Set(useFirst) });

// ── the score ──────────────────────────────────────────────────────────────
{
  const m = scoreRecipe(R("a", ["salt", "garlic", "pork"]), P(["salt", "garlic"]), REL);
  check("covered and missing are partitioned",
    m.covered.length === 2 && m.missing.length === 1 && m.missing[0] === "pork");
  check("a missing ingredient costs 1", m.score === -1, `score ${m.score}`);
}
{
  const m = scoreRecipe(R("a", ["salt", "kimchi"]), P(["salt", "kimchi"], ["kimchi"]), REL);
  check("a use-first ingredient is worth +3", m.score === 3, `score ${m.score}`);
  check("uses lists the pin", m.uses.join() === "kimchi");
}

// ── relation directions: the part that must not regress ────────────────────
//
// INGREDIENT-SPEC §3. A specific ingredient satisfies a general requirement and
// never the reverse — "if a recipe says chicken thigh, the requirement is
// chicken thigh" (DECISIONS §3).
{
  const wantsGeneral = scoreRecipe(R("a", ["salt"]), P(["coarse salt"]), REL);
  check("specific satisfies general", wantsGeneral.missing.length === 0,
    `missing ${wantsGeneral.missing.join()}`);

  const wantsSpecific = scoreRecipe(R("b", ["coarse salt"]), P(["salt"]), REL);
  check("general does NOT satisfy specific", wantsSpecific.missing.length === 1,
    "table salt must not satisfy a recipe that asked for coarse");
}
{
  const whole = scoreRecipe(R("a", ["lemon juice"]), P(["lemon"]), REL);
  check("the whole satisfies the part", whole.missing.length === 0);
  const part = scoreRecipe(R("b", ["lemon"]), P(["lemon juice"]), REL);
  check("the part does NOT satisfy the whole", part.missing.length === 1,
    "a bottle of juice is not a lemon");
}

// ── the must-use rule ──────────────────────────────────────────────────────
//
// BUILD.md Phase A: one pin is a hard filter, two or more is a boost.
{
  const rs = [R("with", ["kimchi", "rice"]), R("without", ["rice"])];
  const one = rank(rs, P(["kimchi", "rice"], ["kimchi"]));
  check("one pin hard-filters", one.length === 1 && one[0]!.recipe.id === "with",
    `got ${one.map((m) => m.recipe.id).join()}`);

  const two = rank(rs, P(["kimchi", "rice"], ["kimchi", "rice"]));
  check("two pins do not filter", two.length === 2,
    "requiring every pin would usually return nothing, and a pin that empties " +
    "the screen teaches people not to pin");
  check("two pins still rank the fuller match first", two[0]!.recipe.id === "with");
}

// ── ordering ───────────────────────────────────────────────────────────────
{
  const rs = [R("far", ["a", "b", "c"]), R("near", ["a"]), R("mid", ["a", "b"])];
  const out = rank(rs, P(["a"]));
  check("fewer missing ranks higher",
    out.map((m) => m.recipe.id).join() === "near,mid,far",
    out.map((m) => m.recipe.id).join());
}
{
  // Identical scores must not shuffle between requests.
  const rs = [R("zzz", ["a"]), R("aaa", ["a"])];
  const a = rank(rs, P(["a"])).map((m) => m.recipe.id).join();
  const b = rank([...rs].reverse(), P(["a"])).map((m) => m.recipe.id).join();
  check("ties are deterministic", a === b, `${a} vs ${b}`);
}

// ── incompleteness is surfaced, not hidden ─────────────────────────────────
{
  const m = scoreRecipe(R("a", ["salt"], ["mystery powder"]), P(["salt"]), REL);
  check("a recipe with unresolved lines is flagged", m.incomplete);
  check("but still scores", m.missing.length === 0);

  const strict = rank([R("a", ["salt"], ["mystery"])], P(["salt"]), { requireComplete: true });
  check("requireComplete drops it", strict.length === 0);
}

// ── optional ingredients are shown, never charged for ──────────────────────
{
  const m = scoreRecipe(R("a", ["salt"], [], ["sesame seeds"]), P(["salt"]), REL);
  check("a missing optional costs nothing", m.score === 0, `score ${m.score}`);
  check("but it is reported", m.missingOptional.join() === "sesame seeds");
  check("and the recipe is still cookable", m.missing.length === 0);

  const both = rank([R("garnished", ["salt"], [], ["chives"]), R("plain", ["salt", "pork"])],
                    P(["salt"]));
  check("a garnish does not rank below a genuine gap",
    both[0]!.recipe.id === "garnished",
    "charging for a garnish would rank a dish you can make below one you cannot");
}
{
  // A pin on an optional ingredient still means "use this up".
  const one = rank([R("g", ["salt"], [], ["chives"]), R("n", ["salt"])],
                   P(["salt", "chives"], ["chives"]));
  check("a pin matches an optional ingredient too",
    one.length === 1 && one[0]!.recipe.id === "g", one.map((m) => m.recipe.id).join());
}

// ── the recipe's own substitutions count at full strength ──────────────────
//
// "green or red chili peppers" is the author saying red works HERE. It is not a
// global claim about peppers and it needs no review, because they already said
// it — so it must not be discounted the way substitutes_for is.
{
  const r = R("a", ["green chili"], [], [], { "green chili": [["red chili"]] });
  const m = scoreRecipe(r, P(["red chili"]), REL);
  check("a recipe-level alternate covers the requirement", m.missing.length === 0,
    `missing ${m.missing.join()}`);
  check("and is reported as such", m.covered[0]?.via === "recipe-alternate");

  const other = scoreRecipe(R("b", ["green chili"]), P(["red chili"]), REL);
  check("the same swap does NOT apply to a recipe that did not offer it",
    other.missing.length === 1,
    "one author offering a substitution is not a claim about every dish");
}

// ── a COMBINATION alternate ─────────────────────────────────────────────────
//
// "or egg + ice + flour" in place of tempura mix. The group is one alternative
// and all of it is required: holding part of a combination is holding nothing.
// A flat list would report this recipe as cookable on the strength of the flour.
{
  const combo = { "tempura mix": [["egg", "ice", "flour"]] };
  const all = scoreRecipe(R("a", ["tempura mix"], [], [], combo),
                          P(["egg", "ice", "flour"]), REL);
  check("a complete combination covers the requirement", all.missing.length === 0,
    `missing ${all.missing.join()}`);
  check("and is distinguishable from a single swap",
    all.covered[0]?.via === "recipe-alternate-combo");

  for (const partial of [["flour"], ["egg", "flour"], ["ice", "egg"]]) {
    const m = scoreRecipe(R("a", ["tempura mix"], [], [], combo), P(partial), REL);
    check(`a partial combination covers nothing (${partial.join("+")})`,
      m.missing.length === 1,
      "holding some of a combination must not satisfy the requirement");
  }

  // Both shapes coexist under one requirement: either the single item, or the
  // whole group.
  const either = { "tempura mix": [["twiguim garu"], ["egg", "ice", "flour"]] };
  check("an OR of groups takes whichever is satisfied",
    scoreRecipe(R("a", ["tempura mix"], [], [], either), P(["twiguim garu"]), REL)
      .missing.length === 0);
  check("an empty group never covers anything",
    scoreRecipe(R("a", ["x"], [], [], { x: [[]] }), P(["y"]), REL).missing.length === 1,
    "`every` on an empty array is true — the length guard is load-bearing");
}

// ── main ingredients: heavy penalty, never a filter (RECIPE-SPEC §4c) ──────
{
  // Bulgogi without the beef.
  const bulgogi = R("bulgogi", ["beef", "soy sauce", "sesame seeds"], [], [], {}, ["beef"]);
  const noBeef = scoreRecipe(bulgogi, P(["soy sauce", "sesame seeds"]), REL);
  check("a missing main ingredient costs mainMissing, not 1",
    noBeef.score === -4, `score ${noBeef.score}`);

  const noSeeds = scoreRecipe(bulgogi, P(["beef", "soy sauce"]), REL);
  check("a missing ordinary ingredient still costs 1",
    noSeeds.score === -1, `score ${noSeeds.score}`);

  check("one missing main outranks three missing garnishes the wrong way round",
    noBeef.score < noSeeds.score,
    "the whole point of §4c: missing the beef must sink the dish further " +
    "than missing the sesame seeds");

  // Never a filter. §4c is explicit that this penalises and does not block.
  const ranked = rank([bulgogi], P(["soy sauce", "sesame seeds"]));
  check("a recipe missing its main ingredient still appears",
    ranked.length === 1 && ranked[0]!.recipe.id === "bulgogi",
    "penalise heavily, never block — substitution has to stay reachable and " +
    "the field's gaps must not delete recipes");

  // The field is curated and will be absent for most recipes for a long time.
  const unlabelled = R("plain", ["beef", "soy sauce"]);
  check("no main_ingredients means friction is a plain count",
    scoreRecipe(unlabelled, P(["soy sauce"]), REL).score === -1);

  // A main ingredient the pantry HAS costs nothing extra.
  check("a main ingredient you have is not charged",
    scoreRecipe(bulgogi, P(["beef", "soy sauce", "sesame seeds"]), REL).score === 0);

  // Relations still apply to mains: a substitution route covers it.
  const salty = R("s", ["salt"], [], [], {}, ["salt"]);
  check("a main ingredient satisfied via is_a is not charged",
    scoreRecipe(salty, P(["coarse salt"]), REL).score === 0,
    "specific satisfies general — the main-ingredient weight must not " +
    "bypass the relation check");
}

// ── dietary excludes: hide, and say how many (USER-SPEC §6) ────────────────
{
  const rs = [
    R("peanutty", ["chicken", "peanut"]),
    R("clean", ["chicken", "rice"]),
    R("garnished", ["chicken"], [], ["peanut"]),
  ];
  const none = applyExcludes(rs, new Set<string>());
  check("no exclusions changes nothing", none.kept.length === 3 && none.hidden === 0);

  const out = applyExcludes(rs, new Set(["peanut"]));
  check("a required excluded ingredient hides the recipe",
    !out.kept.some((r) => r.id === "peanutty"));
  check("an OPTIONAL excluded ingredient also hides it",
    !out.kept.some((r) => r.id === "garnished"),
    "'contains peanut' is a fact about the recipe; a garnish is still in it");
  check("everything else survives", out.kept.length === 1 && out.kept[0]!.id === "clean");
  check("the hidden COUNT is reported", out.hidden === 2,
    "§6 requires the UI to say how many were hidden and why — a filter that " +
    "silently shrinks the result set is the one thing this must not be");
}

// ── a recipe that needs nothing is not a match ─────────────────────────────
{
  const out = rank([R("empty", []), R("real", ["salt"])], P(["salt"]));
  check("zero-requirement recipes are excluded",
    out.length === 1 && out[0]!.recipe.id === "real",
    "a recipe with no recognised requirements is satisfied by any pantry, " +
    "so it would rank first and mean nothing");
}

// ── one-away and unlocks ───────────────────────────────────────────────────
{
  const rs = [
    R("a", ["salt", "gochujang"]), R("b", ["salt", "gochujang"]),
    R("c", ["salt", "mirin"]), R("d", ["salt"]),
  ];
  const away = oneAway(rs, P(["salt"]));
  check("one-away excludes what you can already make",
    !away.some((m) => m.recipe.id === "d"));
  check("one-away finds the rest", away.length === 3);

  const u = unlocks(rs, P(["salt"]));
  check("unlocks ranks by how many recipes it opens",
    u[0]!.ingredient === "gochujang" && u[0]!.unlocks === 2,
    JSON.stringify(u));
}

// ── "nearly there" requires every MAIN ingredient ─────────────────────────
// Missing the beef in bulgogi is not being close to bulgogi. §4c charged for
// it, but a penalty only reorders — and this list is short enough that the
// wrong rows were still filling it.
{
  const bulgogi: Recipe = {
    id: "r_bulgogi", title: "Bulgogi", url: "", source: "", cuisine: "korean",
    requires: ["beef", "soy", "sugar"], mainIngredients: ["beef"], unresolved: [],
  };
  const salad: Recipe = {
    id: "r_salad", title: "Salad", url: "", source: "", cuisine: "",
    requires: ["lettuce", "oil", "salt"], mainIngredients: ["lettuce"], unresolved: [],
  };
  // No curated mains — must NOT be excluded, or the curation backlog reads as
  // a matching bug.
  const uncurated: Recipe = {
    id: "r_unk", title: "Something", url: "", source: "", cuisine: "",
    requires: ["a", "b", "c"], unresolved: [],
  };
  const pantry = { have: new Set(["soy", "lettuce", "oil", "a", "b"]), useFirst: new Set<string>() };
  const near = nearMisses([bulgogi, salad, uncurated], pantry, {}, 30);
  const ids = near.map((m) => m.recipe.id);
  check("nearly: drops a recipe missing its main ingredient", !ids.includes("r_bulgogi"), ids.join(","));
  check("nearly: keeps one whose main is covered", ids.includes("r_salad"), ids.join(","));
  check("nearly: keeps a recipe with no curated mains", ids.includes("r_unk"), ids.join(","));
}

console.log(failed ? `\n${failed} match case(s) failed` : "\nall match cases pass");
if (failed) process.exit(1);
