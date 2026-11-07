/**
 * Evaluate cuisine inference against a corpus whose answer is already known.
 *
 *   npm run cuisine-eval
 *
 * Why this exists: BUILD.md's ordering rule is "build the benchmark before you
 * automate the thing it measures." Cuisine inference is exactly such a thing —
 * it will be tuned repeatedly, and without a measurement every change is a
 * guess.
 *
 * The test set is free. Recipes already crawled from single-cuisine domains
 * (Korean Bapsang → korean, The Woks of Life → chinese) carry a reliable label
 * from the domain, so accuracy can be measured with no hand-labelling at all.
 *
 * Two metrics, and they are NOT interchangeable:
 *
 *   precision  of the recipes we committed to, how many were right
 *   abstention of all recipes, how many we declined to label
 *
 * Precision is the one that matters. DECISIONS §3/§6: a wrong cuisine tag
 * misroutes ingredient mapping and corrupts the graph invisibly, while an
 * abstention just costs one recipe. Target precision ≥ 0.97 and accept
 * whatever abstention rate that requires.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inferCuisine, MIN_MARGIN, MIN_SCORE, type Cuisine } from "./cuisine.js";
import type { RawRecipe } from "./normalize.js";
import { SOURCES } from "./sources.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RAW_DIR = resolve(ROOT, "data/raw");

if (!existsSync(RAW_DIR)) {
  console.error("no data/raw — run: npm run crawl");
  process.exit(1);
}

/** Only single-cuisine sources carry a trustworthy label. */
const LABELLED = new Set(
  SOURCES.filter((s) => !s.multiCuisine).map((s) => s.id),
);

const recipes: RawRecipe[] = [];
for (const f of readdirSync(RAW_DIR).filter((f) => f.endsWith(".jsonl"))) {
  for (const line of readFileSync(resolve(RAW_DIR, f), "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line) as RawRecipe;
      // Only domain-derived labels are ground truth; inferred ones would
      // grade the classifier against itself.
      if (LABELLED.has(r.sourceId) && r.cuisineSource === "domain" && r.cuisine) recipes.push(r);
    } catch {
      /* truncated line */
    }
  }
}

if (!recipes.length) {
  console.error("no labelled recipes found");
  process.exit(1);
}

type Row = { truth: string; pred: Cuisine | null; top: Cuisine | null; conf: number; margin: number; title: string };

const rows: Row[] = recipes.map((r) => {
  const inf = inferCuisine({
    title: r.title,
    url: r.sourceUrl,
    category: r.category,
    cuisineRaw: r.cuisineRaw,
    rawIngredients: r.rawIngredients,
  });
  return {
    truth: r.cuisine!, pred: inf.cuisine, top: inf.top,
    conf: inf.confidence, margin: inf.margin, title: r.title,
  };
});

const committed = rows.filter((r) => r.pred !== null);
const correct = committed.filter((r) => r.pred === r.truth);
const wrong = committed.filter((r) => r.pred !== r.truth);

console.log(`thresholds: MIN_SCORE=${MIN_SCORE} MIN_MARGIN=${MIN_MARGIN}
labelled recipes  ${rows.length}
committed         ${committed.length} (${((committed.length / rows.length) * 100).toFixed(1)}%)
abstained         ${rows.length - committed.length} (${(((rows.length - committed.length) / rows.length) * 100).toFixed(1)}%)

PRECISION         ${(correct.length / Math.max(committed.length, 1)).toFixed(4)}  ← the metric that matters
recall (of all)   ${(correct.length / rows.length).toFixed(4)}
`);

const byTruth = new Map<string, { n: number; committed: number; correct: number }>();
for (const r of rows) {
  const e = byTruth.get(r.truth) ?? { n: 0, committed: 0, correct: 0 };
  e.n++;
  if (r.pred) { e.committed++; if (r.pred === r.truth) e.correct++; }
  byTruth.set(r.truth, e);
}
console.log("per true cuisine:");
for (const [c, e] of byTruth) {
  console.log(`  ${c.padEnd(10)} n=${String(e.n).padStart(4)}  committed=${String(e.committed).padStart(4)}  precision=${(e.correct / Math.max(e.committed, 1)).toFixed(3)}`);
}

/**
 * Adjusted precision.
 *
 * Domain labels are unreliable for EVERY food blog, not just obviously pan-Asian
 * ones: Korean blogs publish Thai salads and Japanese hamburger steak. So a
 * "mislabel" whose predicted cuisine is stated explicitly in the recipe's own
 * title is almost certainly a ground-truth error, not a classifier error.
 *
 * This matters because it inverts the usual reading: improving the classifier
 * LOWERS measured precision against domain labels, because it correctly commits
 * on more cross-cuisine recipes. Raw precision here is an anti-signal past a
 * point, and only hand labels can settle it (BUILD.md, Phase B benchmark).
 */
const ADJ = /korean|japanese|chinese|thai|vietnamese|filipino|taiwanese|cantonese|sichuan|szechuan/gi;
const labelErrors = wrong.filter((r) =>
  r.pred && new RegExp(r.pred, "i").test(r.title),
);
const genuine = wrong.length - labelErrors.length;
console.log(`mislabel breakdown:
  total                       ${wrong.length}
  predicted cuisine is IN the title (ground-truth error, not ours)  ${labelErrors.length}
  remaining (candidate real errors)                                 ${genuine}

  precision as measured        ${(correct.length / Math.max(committed.length, 1)).toFixed(4)}
  precision excl. label errors ${((correct.length + labelErrors.length) / Math.max(committed.length, 1)).toFixed(4)}
`);
void ADJ;

if (wrong.length) {
  console.log(`\nMISLABELS (${wrong.length}) — each one would corrupt ingredient mapping:`);
  for (const r of wrong.slice(0, 15)) {
    console.log(`  said ${String(r.pred).padEnd(10)} truth ${r.truth.padEnd(9)} conf=${r.conf.toFixed(1)} margin=${r.margin.toFixed(1)}  ${r.title.slice(0, 54)}`);
  }
}

// Threshold sweep: shows the precision/abstention trade directly, so the
// thresholds are a choice rather than an accident.
console.log("\nthreshold sweep (score / margin → precision, committed%):");
// Uses `top` — the highest-scoring cuisine irrespective of thresholds — which
// is exactly what would be committed at a given threshold. An earlier version
// fell back to `runnerUp` when abstaining, which is not the top choice, so its
// numbers were meaningless.
for (const score of [2, 2.5, 3, 4, 5]) {
  const cells: string[] = [];
  for (const margin of [0.5, 1.5, 2.5]) {
    const c = rows.filter((r) => r.conf >= score && r.margin >= margin);
    const ok = c.filter((r) => r.top === r.truth).length;
    cells.push(`m${margin}: p=${(ok / Math.max(c.length, 1)).toFixed(3)} c=${((c.length / rows.length) * 100).toFixed(0)}%`);
  }
  console.log(`  score>=${score}  ${cells.join("   ")}`);
}
