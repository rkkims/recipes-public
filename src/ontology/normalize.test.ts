/**
 * Engine regressions — the cases where a rule was WRONG, not merely arguable.
 *
 *   npm run test-normalize
 *
 * `npm run agreement` is the engine's real test suite (NORMALIZATION, "Review
 * is a test suite, not a rule source") and it stays that. This file is for the
 * narrower thing agreement cannot catch: a rule that makes a name vanish.
 *
 * A disagreement shows up in agreement as a scored row a human can read. A name
 * that normalises to nothing is dropped by `promote` as unparseable and simply
 * stops existing, with nothing to score and nothing to read.
 */
import { normalize } from "./normalize.js";

let failed = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) return;
  failed++;
  console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
};

/** The permissive vocabulary every rebuild passes — see the appositive rule. */
const V = { has: () => true };
const canon = (s: string) => {
  const r = normalize(s, V);
  return r.drop ? `DROP:${r.drop}` : r.canonical;
};

// ── the appositive rule must not eat a modifier ────────────────────────────
{
  check("`white fish` survives", canon("white fish") === "white fish",
    "the appositive rule stripped ` fish`, leaving the bare colour `white`, " +
    "which then failed to parse — so the node was silently dropped");
  check("`red fish` survives", canon("red fish") === "red fish");
  check("`white fish fillet` survives", canon("white fish fillet") === "white fish fillet");

  // The rule still has to do its job.
  check("`mackerel fish` still collapses", canon("mackerel fish") === "mackerel",
    "guarding against modifiers must not disable the rule it guards");
  // `anchovies`, not `anchovy`: the 2026-08-17 number-split merge made the
  // plural the surviving node and aliased the singular to it, so the collapse
  // now lands one synonym-hop later. The rule under test is the collapse.
  check("`anchovy fish` still collapses", canon("anchovy fish") === "anchovies");
}

// ── nothing that has a name should normalise to nothing ────────────────────
{
  for (const s of ["white fish", "red fish", "fish", "white pepper", "white rice",
                   "white onion", "green onion", "black pepper", "red pepper"]) {
    check(`\`${s}\` does not vanish`, !canon(s).startsWith("DROP:"), `got ${canon(s)}`);
  }
}

console.log(failed ? `\n${failed} normalize case(s) failed` : "\nall normalize cases pass");
if (failed) process.exit(1);
