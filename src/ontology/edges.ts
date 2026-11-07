/**
 * Relations between nodes.
 *
 * Normalisation decides what a node IS. This file decides what a node SATISFIES,
 * which is a different question and the one the matcher actually asks:
 *
 *     the recipe wants X. the user has Y. does Y do?
 *
 * Three relations, each directional, each with its own answer to that question.
 * Directionality is the whole point — collapsing these into an undirected
 * "related" edge is what makes naive matchers tell people they can cook things
 * they cannot.
 */

/**
 * `is_a` — narrower node → broader node.  `coarse salt is_a salt`
 *
 * Reviewer's call, and the reason `salt` is NOT a slot: coarse salt and salt are
 * different entities in the tree, related by hierarchy rather than by choice. A
 * slot forces a question at pantry-entry time ("which seaweed?"); a hierarchy
 * does not, because `salt` is a perfectly good thing to own on its own.
 *
 * Matching, asymmetric:
 *   recipe wants `salt`, user has `coarse salt`        → MATCH  (specific satisfies general)
 *   recipe wants `coarse salt`, user has `salt`        → NO     (general does not satisfy specific)
 *
 * The second direction is the one that matters. Kimchi made with table salt
 * fails, so a recipe asking for coarse salt has to mean it.
 */
export const IS_A: Array<[string, string]> = [
  ["coarse salt", "salt"],
  ["gochugaru", "chili flakes"],
  ["jasmine rice", "white rice"],
  ["short grain rice", "white rice"],
  ["glutinous rice", "rice"],
  ["kewpie mayonnaise", "mayonnaise"],
  // Removed, and the build is what found them: every one named a broad node
  // that does not exist.
  //
  //   doenjang  -> soybean paste   the reviewer aliased soybean paste TO
  //                                doenjang, so this edge pointed backwards
  //   gochujang -> chili paste     `chili paste` is not a node; no recipe in
  //   heavy cream -> cream         the corpus asks for the generic term
  //   fine salt / flaky salt       both alias to `salt`, so the edge is the
  //                                alias said twice
  //   scallion  -> onion           a scallion does not satisfy a recipe wanting
  //                                onion, which is what this edge would claim
  //   kosher salt -> salt          the node itself was merged into `salt` on
  //                                2026-08-05 ("salt is salt in a pantry", 635
  //                                mentions folded in), so the CHILD stopped
  //                                existing and the rule re-added a dangling
  //                                edge every build until 2026-08-13
  //
  // A dangling edge is worse than a missing one: it reads as a rule and never
  // fires.
];

/**
 * `derives_from` — part → whole.  `lemon juice derives_from lemon`
 *
 * Reviewer approved introducing this in v1, scoped to whole→part only.
 *
 * Matching, asymmetric:
 *   recipe wants `lemon juice`, user has `lemon`   → MATCH  (squeeze it)
 *   recipe wants `lemon`, user has `lemon juice`   → NO     (a bottle is not a fruit)
 *
 * Deliberately NOT extended to `kimchi → kimchi juice`. A recipe calling for a
 * cup of brine needs more kimchi than a pantry holds, and modelling that needs a
 * quantity threshold this version does not have. Left out rather than guessed:
 * a wrong edge here tells someone a dish is cookable when it is not, which is
 * the one failure the whole product is trying to avoid.
 */
export const DERIVES_FROM: Array<{ part: string; whole: string; note?: string }> = [
  { part: "lemon juice", whole: "lemon", note: "one lemon ≈ 3 tbsp" },
  { part: "lime juice", whole: "lime", note: "one lime ≈ 2 tbsp" },
  { part: "orange juice", whole: "orange" },
  { part: "ginger juice", whole: "ginger" },
  /**
   * Not a juice, and the clearest case of the rule there is: you rinse the
   * rice you were going to cook anyway and keep the water. Filed here rather
   * than under `rice` in the hierarchy, where it was briefly placed — an is_a
   * edge runs both ways by §3a, and rice water will not cook as rice.
   */
  { part: "rice water", whole: "rice", note: "the rinse water; a cup of rice yields plenty" },

  /**
   * ── Parts the cook separates out ────────────────────────────────────────
   *
   * Migrated here from IS_A, where they were wrong in a way that only shows
   * in one direction. An is_a edge runs both ways by §3a, so `chicken bones
   * is_a chicken` told the matcher that a pantry holding bones satisfies a
   * recipe wanting chicken. It does not — bones are not meat.
   *
   * The test that sorts them, applied one at a time: does the PART on its own
   * satisfy a recipe asking for the WHOLE? `peach halves` and `leek bottoms`
   * do — halves are peaches — so they stay is_a. An egg white does not, and a
   * carcass does not, so they are one-way and live here.
   */
  { part: "egg white", whole: "eggs", note: "separate it; the yolk is left over" },
  { part: "egg yolk", whole: "eggs", note: "separate it; the white is left over" },
  { part: "chicken bones", whole: "chicken", note: "a whole bird carries them" },
  { part: "turkey carcass", whole: "turkey" },
  { part: "pork bones", whole: "pork" },
  { part: "beef bones", whole: "beef" },
  { part: "ox tail bones", whole: "oxtails" },
  { part: "pork fat", whole: "pork", note: "trimmed off the cut" },
  { part: "fennel fronds", whole: "fennel", note: "the leafy tops, not the bulb" },

  /**
   * ── Things the cook processes on the spot ───────────────────────────────
   *
   * Same asymmetry, different kitchen action: blending and grinding do not
   * run backwards. A pantry with mangoes can answer a recipe wanting mango
   * puree; a jar of puree cannot answer one wanting a mango.
   */
  { part: "mango puree", whole: "mango" },
  { part: "peach puree", whole: "peaches" },
  { part: "strawberry puree", whole: "strawberries" },
  { part: "onion puree", whole: "onion" },
  // `breadcrumbs` was here and is not. Reviewer: "breadcrumb is made from
  // specific part of bread and usually needs specific process to be used for
  // cooking." Both halves disqualify it — a fresh loaf is the wrong part, and
  // drying and grinding is not something done in the middle of a recipe. It
  // fails for the same reason tofu does, which is the line this list holds.
  // The ZEST edges are gone. Zest is not a node any more — the parts rule folds
  // `lemon zest` into `lemon` outright, because nobody sells zest. An edge
  // between a node and something that no longer exists is not a relation.
  // Juice stays: `lemon juice` IS a bottle you buy, so both ends are real.
];

/**
 * `substitutes_for` — an acceptable stand-in, not the same thing.
 *
 * Kept separate from IS_A so the distinction survives. The reviewer mapped
 * `cheongyang chili pepper` to `serrano pepper`, but cheongyang is not a
 * serrano — the instruction was "an American shopper should buy serrano." Filing
 * that as identity would make `cheongyang` unsearchable and silently rewrite
 * what the recipe said. Recorded as substitution, the recipe keeps its word and
 * the pantry still matches.
 *
 * Symmetric in matching, but weighted below an exact hit so the matcher can
 * prefer a real match when one exists.
 */
export const SUBSTITUTES_FOR: Array<{ a: string; b: string; why: string }> = [
  { a: "thai chili pepper", b: "serrano pepper", why: "hotter, but the usual stand-in" },
  { a: "mirin", b: "sake", why: "sake plus sugar; not interchangeable in reverse" },
  // The powder DISSOLVES INTO the liquid — different purchases (the form rule
  // from the stock cluster), but a pantry holding the concentrate can honestly
  // cook the recipe. Recorded here, not as identity (curator, 2026-08-20).
  { a: "chicken bouillon powder", b: "chicken stock",
    why: "powder plus water is stock; not interchangeable in reverse" },
  { a: "beef bouillon powder", b: "beef stock",
    why: "same law as the chicken pair (curator, 2026-08-20)" },
  // Dashida IS korean beef stock powder — the corpus glosses it so itself:
  // "beef bouillon powder ((I use Korean beef Dashi))".
  { a: "dashida", b: "beef stock",
    why: "korean beef soup stock powder; powder plus water is stock" },
  // `cheongyang -> serrano` is gone from HERE because the reviewer made it an
  // ALIAS. I had argued for substitution so the recipe could keep its own word;
  // they decided identity, and a fact recorded twice in two strengths is worse
  // than either. `shaoxing -> dry sherry` is gone because dry sherry is not in
  // this corpus at all — a substitution nobody can act on.
];

/** Does a pantry holding `have` satisfy a recipe asking for `want`? */
export function satisfies(want: string, have: string): { ok: boolean; via?: string } {
  if (want === have) return { ok: true, via: "exact" };
  // Specific satisfies general: `salt` is satisfied by `coarse salt`.
  if (IS_A.some(([narrow, broad]) => narrow === have && broad === want))
    return { ok: true, via: "is_a" };
  // Whole satisfies part: `lemon juice` is satisfied by `lemon`.
  if (DERIVES_FROM.some((d) => d.part === want && d.whole === have))
    return { ok: true, via: "derives_from" };
  if (SUBSTITUTES_FOR.some((s) =>
    (s.a === want && s.b === have) || (s.b === want && s.a === have)))
    return { ok: true, via: "substitutes_for" };
  return { ok: false };
}
