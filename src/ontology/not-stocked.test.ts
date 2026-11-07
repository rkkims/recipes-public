/**
 * The traps, asserted.
 *
 *   npm run test-not-stocked
 *
 * Every SURVIVES case below is a real ingredient that a careless water rule
 * would have swallowed, and swallowing one is unrecoverable in a way a false
 * keep is not: an ignored line never reaches the review queue.
 */
import assert from "node:assert/strict";
import { notStocked } from "./not-stocked.js";

let pass = 0, fail = 0;
const check = (label: string, fn: () => void) => {
  try { fn(); pass++; }
  catch (e) { fail++; console.error(`  FAIL  ${label}\n        ${(e as Error).message.split("\n")[0]}`); }
};

// ── must be ignored ────────────────────────────────────────────────────────
const IGNORED: Array<[string, "assumed" | "by-product"]> = [
  ["water", "assumed"],
  ["Water", "assumed"],
  ["hot water", "assumed"],
  ["boiling water", "assumed"],
  ["hot boiling water", "assumed"],
  ["filtered water", "assumed"],
  ["ice water", "assumed"],
  ["ice-cold water", "assumed"],
  ["tepid water", "assumed"],
  ["icy water", "assumed"],
  ["lukewarm water", "assumed"],
  ["tap water", "assumed"],
  ["drinking water", "assumed"],
  ["enough water", "assumed"],
  ["qt water", "assumed"],
  ["gallons water", "assumed"],
  ["litters water", "assumed"],
  ["parts water", "assumed"],
  ["ice", "assumed"],
  ["ice cubes", "assumed"],
  ["ice cube", "assumed"],
  ["regular sized ice cubes", "assumed"],
  ["cubes ice", "assumed"],
  // Nobody stocks shaved ice; a freezer makes it. Written first as a SURVIVES
  // case, and the rule was right where the expectation was not.
  ["shaved ice", "assumed"],
  ["pasta water", "by-product"],
  ["reserved pasta water", "by-product"],
  ["noodle cooking water", "by-product"],
  ["starch water", "by-product"],
  ["mushroom soaking water", "by-product"],
  ["shitake mushroom water", "by-product"],
  ["reserved cooking water", "by-product"],
];

for (const [head, kind] of IGNORED) {
  check(`ignores "${head}"`, () => {
    const v = notStocked(head);
    assert.ok(v, `"${head}" should be ignored, got null`);
    assert.equal(v.kind, kind, `"${head}" should be ${kind}, got ${v.kind}`);
  });
}

// ── must SURVIVE — each one is a real ingredient ───────────────────────────
const SURVIVES = [
  // the repo already decided this one
  "rice water",
  // aquafaba, a confirmed node with its own recipes
  "bean water",
  // things a shop sells in a bottle
  "coconut water", "pure coconut water", "all natural coconut water",
  "sparkling water", "mineral water", "artisan mineral water",
  "sparkling natural mineral water", "tonic water", "soda water",
  "seltzer water", "carbonated water", "artesian water",
  // an alkaline solution used in noodle dough — very much an ingredient
  "lye water",
  // brewed
  "barley water", "ginger water", "yeast water",
  // FIRST word is water, and the head noun is a vegetable
  "water chestnuts", "water chestnut", "water spinach", "chinese water spinach",
  "water dropwort", "water parsley",
  // FIRST word is ice, and the head noun is food
  "ice cream", "vanilla ice cream", "green tea ice cream", "melona ice cream bar",
  // ordinary ingredients that must not be touched at all
  "garlic", "gochugaru", "basa", "heavy cream", "coconut milk", "avocado cubes",
  "pumpkin cubes", "japanese curry cube",
];

for (const head of SURVIVES) {
  check(`keeps "${head}"`, () => {
    assert.equal(notStocked(head), null, `"${head}" must not be ignored`);
  });
}

check("empty input is not a verdict", () => {
  assert.equal(notStocked(""), null);
  assert.equal(notStocked("   "), null);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
