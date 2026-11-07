/**
 * Direction, transitivity and the disclosure rule — INGREDIENT-SPEC §3a.
 *
 *   npm run test-relations
 *
 * Ids are spelled as readable strings here rather than `ing_...` because the
 * relation logic never parses them; what is under test is the shape of the
 * graph, and a test that reads `basa` catches a reversed direction in a way one
 * that reads `ing_7p494939tpss` does not.
 */
import assert from "node:assert/strict";
import { buildRelations } from "./relations";

const REL = {
  // [narrow, broad]
  is_a: [
    ["basa", "white fish"],
    ["cod", "white fish"],
    ["white fish", "fish"],
    ["salmon", "fish"],
    ["chicken thigh", "chicken"],
    ["chicken breast", "chicken"],
    ["meyer lemon", "lemon"],
  ],
  // [part, whole]
  derives_from: [["lemon juice", "lemon"], ["egg white", "eggs"]],
  substitutes_for: [["cheongyang chili", "serrano"]],
};

const r = buildRelations(REL);
let pass = 0, fail = 0;
const check = (label: string, fn: () => void) => {
  try { fn(); pass++; }
  catch (e) { fail++; console.error(`  FAIL  ${label}\n        ${(e as Error).message.split("\n")[0]}`); }
};
const sat = (want: string, have: string) => r.satisfies(want, have);

const matchesSilently = (want: string, have: string) =>
  check(`recipe ${want} + pantry ${have} → silent match`, () => {
    const v = sat(want, have);
    assert.equal(v.ok, true, "should match");
    assert.ok(!v.disclose, "should NOT ask the user to check");
  });
const matchesDisclosed = (want: string, have: string) =>
  check(`recipe ${want} + pantry ${have} → disclosed match`, () => {
    const v = sat(want, have);
    assert.equal(v.ok, true, "should match");
    assert.equal(v.disclose, true, "should ask the user to check");
  });
const noMatch = (want: string, have: string) =>
  check(`recipe ${want} + pantry ${have} → no match`, () => {
    assert.equal(sat(want, have).ok, false);
  });

// ── exact ──────────────────────────────────────────────────────────────────
matchesSilently("basa", "basa");

// ── the specific in the pantry answers the general, silently ───────────────
matchesSilently("white fish", "basa");
matchesSilently("chicken", "chicken thigh");
// transitive: the reason the one-hop version was not enough
matchesSilently("fish", "basa");

// ── the general in the pantry has not said which — ask ─────────────────────
matchesDisclosed("basa", "white fish");
matchesDisclosed("chicken thigh", "chicken");
matchesDisclosed("basa", "fish");

// ── siblings never match, in either direction ──────────────────────────────
noMatch("chicken breast", "chicken thigh");
noMatch("chicken thigh", "chicken breast");
noMatch("salmon", "basa");
noMatch("basa", "salmon");
noMatch("cod", "basa");

// ── derives_from is one-way ────────────────────────────────────────────────
matchesDisclosed("lemon juice", "lemon");
noMatch("lemon", "lemon juice");
matchesDisclosed("egg white", "eggs");
noMatch("eggs", "egg white");
// holding something narrower than the whole still produces the part
matchesDisclosed("lemon juice", "meyer lemon");

// ── substitutes, both ways, always disclosed ───────────────────────────────
matchesDisclosed("cheongyang chili", "serrano");
matchesDisclosed("serrano", "cheongyang chili");

// ── unrelated ──────────────────────────────────────────────────────────────
noMatch("basa", "chicken");
noMatch("lemon juice", "eggs");

// ── bad data must not hang or match ────────────────────────────────────────
check("a cycle terminates and does not match", () => {
  const c = buildRelations({ is_a: [["a", "b"], ["b", "c"], ["c", "a"]] });
  assert.equal(c.satisfies("d", "a").ok, false);
  assert.equal(c.satisfies("b", "a").ok, true);       // a genuinely belongs to b
});
check("empty relations behave like exact-only", () => {
  const e = buildRelations(undefined);
  assert.equal(e.satisfies("x", "x").ok, true);
  assert.equal(e.satisfies("x", "y").ok, false);
});
check("a malformed pair is ignored rather than trusted", () => {
  const m = buildRelations({ is_a: [["only-one-end"], [], ["x", "x"]] });
  assert.equal(m.satisfies("anything", "only-one-end").ok, false);
});


// ── a node can have MORE THAN ONE parent ──────────────────────────────────
// `broader` was a Map<string,string>, so a second edge for the same child
// silently overwrote the first — no error, no log, just an ingredient that
// quietly stopped satisfying a recipe. Invisible while every child had one
// parent, which was true when the ontology held seven edges.
{
  // beef flank steak is a kind of STEAK and a kind of BEEF. Both are true, and
  // the two derivation rules find one each: `hierarchy.ts` reads the suffix,
  // `hierarchy-prefix.ts` the prefix.
  const multi = buildRelations({
    is_a: [
      ["beef flank steak", "steak"],
      ["beef flank steak", "beef"],
      ["steak", "meat"],
      ["beef", "meat"],
    ],
  });
  check("multi-parent: the first edge survives the second", () =>
    assert.equal(multi.satisfies("steak", "beef flank steak").ok, true));
  check("multi-parent: the second edge works too", () =>
    assert.equal(multi.satisfies("beef", "beef flank steak").ok, true));
  // A diamond — both parents reach `meat`. The walk must not revisit or blow up.
  check("multi-parent: a shared ancestor is reachable", () =>
    assert.equal(multi.satisfies("meat", "beef flank steak").ok, true));
  check("multi-parent: still directional (§3a)", () =>
    assert.equal(multi.satisfies("beef flank steak", "beef").disclose, true));
  check("multi-parent: unrelated stays unrelated", () =>
    assert.equal(multi.satisfies("pork", "beef flank steak").ok, false));

  // A cycle is bad data, not a match — and must terminate.
  const cyc = buildRelations({ is_a: [["a", "b"], ["b", "c"], ["c", "a"]] });
  check("cycle: terminates without matching a stranger", () =>
    assert.equal(cyc.satisfies("z", "a").ok, false));
  check("cycle: still resolves a real ancestor", () =>
    assert.equal(cyc.satisfies("a", "c").ok, true));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
