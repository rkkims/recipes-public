/**
 * QC pack — everything a human needs to review, ordered so the risky rows come
 * first and reviewing can stop when it stops being productive.
 *
 *   npm run qc
 *
 * Writes to data/reports/:
 *   qc-summary.md          read this first — what to review, in what order
 *   qc-cuisine.csv         every inferred cuisine label, least confident first
 *   qc-contradictions.csv  recipes whose ingredients disagree with their label
 *   qc-ingredients.csv     the ontology curation worklist
 *
 * Design intent: the machine commits to decisions and shows its work, rather
 * than abstaining to stay safe. Abstaining moves work to the same reviewer who
 * would catch a mislabel, so it removes nothing — it just hides the decision.
 * Every row here carries the evidence that produced it.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inferCuisine } from "./cuisine.js";
import { headName } from "./frequency.js";
import type { RawRecipe } from "./normalize.js";
import { SOURCES } from "./sources.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RAW = resolve(ROOT, "data/raw");
const OUT = resolve(ROOT, "data/reports");

/** Ontology curation budget — see DECISIONS §3. Not a coverage goal. */
const ONTOLOGY_TARGET = 337;

if (!existsSync(RAW)) { console.error("no data/raw — run: npm run crawl"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const recipes: RawRecipe[] = [];
for (const f of readdirSync(RAW).filter((f) => f.endsWith(".jsonl")))
  for (const line of readFileSync(resolve(RAW, f), "utf8").split("\n"))
    if (line.trim()) { try { recipes.push(JSON.parse(line)); } catch {} }

const csv = (rows: (string | number | null)[][]) =>
  rows.map((r) => r.map((c) => {
    const s = c === null ? "" : String(c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");

// ── 0. data integrity ──────────────────────────────────────────────────────
/**
 * Duplicate ingredient lists per source.
 *
 * This exists because of a bug that passed every other check. Pages on
 * seonkyounglongest.com embed a 10-recipe "popular recipes" carousel in JSON-LD
 * with no @id on any node, so the extractor took a carousel entry instead of the
 * page's own recipe — producing 611 "recipes" that shared one identical Thai
 * noodle ingredient list. Valid JSON-LD, real ingredient strings, >3 items:
 * nothing downstream could tell. It only surfaced because four implausible
 * ingredients appeared adjacent in the frequency report with near-identical
 * counts.
 *
 * A high duplicate rate is the cheapest possible detector for "we extracted the
 * wrong node", so it runs on every QC build rather than waiting to be noticed.
 */
const integrity = [...new Set(recipes.map((r) => r.sourceId))].map((id) => {
  const rows = recipes.filter((r) => r.sourceId === id);
  const sigs = new Set(rows.map((r) => JSON.stringify(r.rawIngredients)));
  return { id, n: rows.length, distinct: sigs.size, dupRate: 1 - sigs.size / rows.length };
}).sort((a, b) => b.dupRate - a.dupRate);

const SUSPECT = 0.05;
const suspect = integrity.filter((i) => i.dupRate > SUSPECT);

writeFileSync(resolve(OUT, "qc-integrity.csv"), csv([
  ["source", "recipes", "distinct_ingredient_lists", "duplicate_rate", "verdict"],
  ...integrity.map((i) => [
    i.id, i.n, i.distinct, i.dupRate.toFixed(3),
    i.dupRate > SUSPECT ? "SUSPECT — likely extracting the wrong JSON-LD node" : "ok",
  ]),
]));

// ── 1. cuisine review ──────────────────────────────────────────────────────
const multi = new Set(SOURCES.filter((s) => s.multiCuisine).map((s) => s.id));
const cuisineRows = recipes
  .filter((r) => multi.has(r.sourceId))
  .map((r) => {
    const inf = inferCuisine({
      title: r.title, url: r.sourceUrl, category: r.category,
      cuisineRaw: r.cuisineRaw, rawIngredients: r.rawIngredients,
    });
    const top3 = [...inf.evidence].sort((a, b) => b.weight - a.weight).slice(0, 3)
      .map((e) => `${e.signal}(${e.cuisine} +${e.weight})`).join("  ");
    return {
      // Unresolved first, then ascending confidence: review stops naturally.
      sortKey: r.cuisineSource === "unresolved" ? -1 : inf.confidence,
      row: [
        r.cuisineSource === "unresolved" ? "UNRESOLVED" : "inferred",
        r.cuisine, inf.confidence, inf.margin, inf.runnerUp,
        r.title, top3, r.cuisineRaw, r.sourceUrl,
      ] as (string | number | null)[],
    };
  })
  .sort((a, b) => a.sortKey - b.sortKey);

writeFileSync(resolve(OUT, "qc-cuisine.csv"), csv([
  ["status", "cuisine", "confidence", "margin", "runner_up", "title", "top_evidence", "recipeCuisine_raw", "url"],
  ...cuisineRows.map((r) => r.row),
]));

// ── 2. contradictions ──────────────────────────────────────────────────────
// A recipe labelled korean that contains shaoxing wine is either a mislabel or
// a genuinely fusion recipe. Either way it's the highest-value thing to eyeball,
// and it needs no ground truth to find — the evidence disagrees with itself.
const contradictions = recipes
  .filter((r) => r.cuisine)
  .map((r) => {
    const inf = inferCuisine({
      title: r.title, url: r.sourceUrl, category: r.category,
      cuisineRaw: r.cuisineRaw, rawIngredients: r.rawIngredients,
    });
    const against = inf.evidence.filter(
      (e) => e.cuisine !== r.cuisine && e.weight >= 3 && e.signal.startsWith("ingredient:"),
    );
    return { r, against, strength: against.reduce((a, e) => a + e.weight, 0) };
  })
  .filter((c) => c.against.length > 0)
  .sort((a, b) => b.strength - a.strength);

writeFileSync(resolve(OUT, "qc-contradictions.csv"), csv([
  ["strength", "assigned", "conflicting_evidence", "source", "title", "url"],
  ...contradictions.map((c) => [
    c.strength, c.r.cuisine,
    c.against.map((e) => `${e.signal.replace("ingredient:", "")}→${e.cuisine}`).join(" "),
    c.r.sourceId, c.r.title, c.r.sourceUrl,
  ]),
]));

// ── 3. ontology worklist ───────────────────────────────────────────────────
const heads = new Map<string, { n: number; ex: string[]; cuisines: Set<string> }>();
let lines = 0;
for (const r of recipes) for (const raw of r.rawIngredients) {
  const h = headName(raw);
  if (!h) continue;
  lines++;
  const e = heads.get(h) ?? { n: 0, ex: [], cuisines: new Set() };
  e.n++;
  if (e.ex.length < 2) e.ex.push(raw);
  e.cuisines.add(r.cuisine ?? "unresolved");
  heads.set(h, e);
}
const ranked = [...heads.entries()].sort((a, b) => b[1].n - a[1].n);
const totalMentions = ranked.reduce((a, [, v]) => a + v.n, 0);
let cum = 0;
writeFileSync(resolve(OUT, "qc-ingredients.csv"), csv([
  ["rank", "name", "count", "cumulative_coverage", "in_curation_budget", "cuisines", "example"],
  ...ranked.map(([name, v], i) => {
    cum += v.n;
    return [i + 1, name, v.n, (cum / totalMentions).toFixed(4),
            i < ONTOLOGY_TARGET ? "YES" : "", [...v.cuisines].join("|"), v.ex[0] ?? ""];
  }),
]));

// ── 3b. alias → canonical evidence ─────────────────────────────────────────
// Maangchi links every ingredient to her own glossary slug, so each line is a
// ready-made alias-table row authored by a native cook (extractors.ts). This is
// the highest-value curation input in the pack: it is the ontology work, already
// done, and only needs checking rather than deciding.
const aliasMap = new Map<string, Map<string, number>>();
for (const r of recipes)
  for (const { raw, slug } of r.canonicalPairs ?? []) {
    const m = aliasMap.get(slug) ?? new Map<string, number>();
    m.set(raw, (m.get(raw) ?? 0) + 1);
    aliasMap.set(slug, m);
  }
const aliasRows = [...aliasMap.entries()]
  .map(([slug, m]) => ({
    slug,
    total: [...m.values()].reduce((a, b) => a + b, 0),
    variants: [...m.entries()].sort((a, b) => b[1] - a[1]),
  }))
  .sort((a, b) => b.total - a.total);

writeFileSync(resolve(OUT, "qc-aliases.csv"), csv([
  ["canonical_slug", "mentions", "distinct_strings", "head_variants", "example_line"],
  ...aliasRows.map((a) => [
    a.slug, a.total, a.variants.length,
    [...new Set(a.variants.map(([v]) => headName(v)))].slice(0, 4).join(" | "),
    a.variants[0]?.[0] ?? "",
  ]),
]));

// ── 3c. domain-label disagreements ─────────────────────────────────────────
// Single-cuisine sources where inference disagrees with the domain label. Each
// row is either the blog publishing off-cuisine content (common — Korean blogs
// post Thai salads) or a real classifier error. Only a human can tell, and this
// is the shortest list that contains all of them.
const single = SOURCES.filter((s) => !s.multiCuisine).map((s) => s.id);
const singleSet = new Set(single);
const disagreements = recipes
  .filter((r) => singleSet.has(r.sourceId) && r.cuisineSource === "domain")
  .map((r) => {
    const inf = inferCuisine({
      title: r.title, url: r.sourceUrl, category: r.category,
      cuisineRaw: r.cuisineRaw, rawIngredients: r.rawIngredients,
    });
    return { r, inf };
  })
  .filter((d) => d.inf.cuisine && d.inf.cuisine !== d.r.cuisine)
  .map((d) => ({
    ...d,
    // Predicted cuisine named in the title = almost certainly the blog, not us.
    titleSaysSo: new RegExp(d.inf.cuisine!, "i").test(d.r.title),
  }))
  .sort((a, b) => Number(a.titleSaysSo) - Number(b.titleSaysSo) || b.inf.confidence - a.inf.confidence);

writeFileSync(resolve(OUT, "qc-disagreements.csv"), csv([
  ["likely_cause", "blog_says", "we_say", "confidence", "title", "evidence", "url"],
  ...disagreements.map((d) => [
    d.titleSaysSo ? "blog mislabelled (title names it)" : "REVIEW",
    d.r.cuisine, d.inf.cuisine, d.inf.confidence, d.r.title,
    [...d.inf.evidence].sort((a, b) => b.weight - a.weight).slice(0, 3)
      .map((e) => `${e.signal}(${e.cuisine} +${e.weight})`).join("  "),
    d.r.sourceUrl,
  ]),
]));

// ── 4. the index ───────────────────────────────────────────────────────────
const unresolved = cuisineRows.filter((r) => r.row[0] === "UNRESOLVED").length;
const inferred = cuisineRows.length - unresolved;
const bySource = new Map<string, number>();
for (const r of recipes) bySource.set(r.sourceId, (bySource.get(r.sourceId) ?? 0) + 1);

writeFileSync(resolve(OUT, "qc-summary.md"), `# QC pack

Corpus: **${recipes.length} recipes**, ${lines} ingredient lines, ${heads.size} distinct heads.

| Source | Recipes |
|---|---|
${[...bySource].sort((a, b) => b[1] - a[1]).map(([s, n]) => `| ${s} | ${n} |`).join("\n")}

${suspect.length ? `## ⚠ Data integrity — read before anything else

${suspect.length} source(s) have a duplicate ingredient-list rate above ${(SUSPECT * 100).toFixed(0)}%:

${suspect.map((i) => `- **${i.id}** — ${i.n} recipes, only ${i.distinct} distinct lists (${(i.dupRate * 100).toFixed(0)}% duplicated)`).join("\n")}

That usually means the extractor is picking a carousel or "related recipe" node
instead of the page's own. Fix before curating anything downstream — duplicated
lists silently skew the ingredient frequency distribution. See qc-integrity.csv.
` : "All sources pass the duplicate-ingredient-list check (see qc-integrity.csv).\n"}
## Review in this order

**1. \`qc-contradictions.csv\` — ${contradictions.length} rows. Start here.**
Recipes whose marker ingredients point at a different cuisine than the one
assigned. Sorted by how strong the disagreement is. These need no ground truth
to find and are where mislabels concentrate. A row is not automatically wrong —
a Chinese-American blog writing a Korean dish with Shaoxing wine is genuine
fusion — but each is worth ten seconds.

**2. \`qc-cuisine.csv\` — ${cuisineRows.length} rows (${unresolved} unresolved, ${inferred} inferred).**
Every cuisine decision on a multi-cuisine source, with the top three pieces of
evidence. Ordered: unresolved first, then ascending confidence. **Stop when the
labels stop looking arguable** — the tail is high-confidence and dull by design.

**3. \`qc-aliases.csv\` — ${aliasRows.length} canonical slugs.**
alias → canonical mappings harvested from Maangchi's own ingredient glossary.
Each row is a canonical ID a native Korean cook chose, plus the raw strings that
linked to it. **Curate these first** — they're the Korean core of the ontology
with the naming decisions already made. Note she distinguishes
\`korean-radish\` from \`daikon-radish\`, which \`ONTOLOGY-SEED.md\` currently
lists as substitutes; worth a second look.

**4. \`qc-disagreements.csv\` — ${disagreements.length} rows, ${disagreements.filter((d) => !d.titleSaysSo).length} marked \`REVIEW\`.**
Recipes on single-cuisine blogs where inference disagrees with the blog. Rows
where the title itself names the predicted cuisine ("Authentic Thai Pomelo Prawn
Salad" on a Korean blog) are the blog publishing off-cuisine content, not our
error — they sort last. **The \`REVIEW\` rows at the top are the only real
open question about cuisine accuracy in the whole corpus.**

**5. \`qc-ingredients.csv\` — ${heads.size} rows, top ${ONTOLOGY_TARGET} flagged \`in_curation_budget\`.**
The ontology worklist. Curate the flagged rows into \`ontology/*.yaml\`; ignore
the rest for now. ${((ranked.slice(0, ONTOLOGY_TARGET).reduce((a, [, v]) => a + v.n, 0) / totalMentions) * 100).toFixed(0)}% of ingredient mentions are in the budget.

## What is deliberately not gated

Cuisine labels are committed at MIN_SCORE 2.5 rather than 3.0 — measured
precision 1.000 either way, 90% vs 84% committed. The stricter setting bought no
measured accuracy and cost 6% of the corpus.

Known blind spot: the control set behind that number is Korean-only, so it
demonstrates the classifier finds Korean reliably and says nothing about false
positives toward Thai or Japanese. \`qc-contradictions.csv\` is the compensating
control — check it rather than trusting the 1.000.
`);

console.log(`wrote data/reports/
  qc-summary.md           ← read first\n  qc-integrity.csv        ${suspect.length ? `⚠ ${suspect.length} SUSPECT source(s)` : "all sources ok"}
  qc-contradictions.csv   ${contradictions.length} rows
  qc-cuisine.csv          ${cuisineRows.length} rows (${unresolved} unresolved)
  qc-aliases.csv          ${aliasRows.length} canonical slugs from Maangchi\n  qc-disagreements.csv    ${disagreements.length} rows (${disagreements.filter((d) => !d.titleSaysSo).length} need review)\n  qc-ingredients.csv      ${heads.size} rows, top ${ONTOLOGY_TARGET} flagged`);
