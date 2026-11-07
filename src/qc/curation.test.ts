/**
 * Curation invariants — RECIPE-SPEC §4c.
 *
 *   npm run test-curation
 *
 * `staleMains` lives in the app package because it is about curated
 * judgements, but its test lives here with every other test, run by the same
 * tsx the rest of the suite uses. Importing across the boundary is fine: the
 * module is pure and takes only relative imports.
 *
 * The rule under test is small and the reason it matters is not: a main
 * ingredient that falls out of `requires` must be REPORTED, never dropped.
 * Dropping it would erase a human judgement silently, which is the one outcome
 * data/curation exists to prevent.
 */
import { staleMains } from "../../app/src/lib/curation.js";

let failed = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) return;
  failed++;
  console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
};

/** A curation row carrying only what this function reads. */
const C = (main?: string[]) =>
  main
    ? { recipe_id: "r", verdict: "keep" as const, curated_at: "", main_ingredients: main }
    : { recipe_id: "r", verdict: "keep" as const, curated_at: "" };

check("no curation at all is not a flag", staleMains(null, ["a"]).length === 0);
check("a curation with no mains is not a flag", staleMains(C(), ["a"]).length === 0);

check("a main still required is not a flag",
  staleMains(C(["a"]), ["a", "b"]).length === 0);

check("a main that fell out of requires is flagged",
  staleMains(C(["a"]), ["b"]).join() === "a",
  "the parse moved underneath a saved judgement — RECIPE-SPEC §3");

check("only the missing one is flagged, not both",
  staleMains(C(["a", "b"]), ["b"]).join() === "a",
  "flagging a main that is still present would train the reviewer to ignore it");

check("an empty requires flags every main",
  staleMains(C(["a", "b"]), []).length === 2);

/**
 * The load-bearing one. `staleMains` REPORTS; it must never be mistaken for a
 * filter that returns the surviving ids, because a caller wiring it up that way
 * would delete exactly the judgement §4c protects.
 */
check("it returns what is MISSING, never what survives",
  staleMains(C(["a", "b"]), ["a"]).join() === "b",
  "returned the survivors instead of the losses — inverted, this silently " +
  "erases curated judgements");

console.log(failed ? `\n${failed} curation case(s) failed` : "\nall curation cases pass");
if (failed) process.exit(1);
