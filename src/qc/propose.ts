/**
 * Generate QC proposals — one CSV per artifact.
 *
 *   npm run propose
 *
 * Writes data/qc/*.csv. Every row carries a machine proposal plus the evidence
 * behind it; the reviewer's job is to correct, not to author. Decisions are
 * written separately to data/decisions/*.csv (see server.ts) so regenerating
 * proposals never clobbers reviewed work.
 *
 * Sorted by corpus frequency throughout, so a half-finished review still
 * captures most of the value — no sheet needs completing to be useful.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { headName } from "../ingest/frequency.js";
import { normalize, registerSynonyms, type Vocabulary } from "../ontology/normalize.js";
import type { RawRecipe } from "../ingest/normalize.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RAW = resolve(ROOT, "data/raw");
const OUT = resolve(ROOT, "data/qc");

/** How deep into the frequency distribution to propose nodes. */
const DEPTH = 1500;

/**
 * The synonym lexicon MOVED to src/ontology/exceptions.ts.
 *
 * It was a second copy of judgements the engine also held, and the two drifted.
 * Everything this file needs now comes from normalize().
 */

/**
 * Compound lines naming two ingredients. The reviewer's instruction is to split
 * them, which the ingest layer can't do yet — one raw string becomes one head —
 * so they are dropped rather than proposed as a node called "salt and pepper".
 *
 * Dropping loses the mentions; proposing keeps a node that can never be
 * satisfied, because no pantry contains "salt and pepper" as one item.
 */
const COMPOUND = /\b(?:salt|pepper|sesame oil|sesame seeds|oil|sugar)\s+and\s+/i;

/**
 * Words that are plural in form but not in meaning. Singularising these breaks
 * them: `greens` is not one `green`, `molasses` is not a `molasse`.
 */
const KEEP_PLURAL = new Set([
  "molasses", "hummus", "couscous", "asparagus", "greens", "sprouts", "oats",
  "grits", "glass", "swiss", "chives", "leaves", "beans",
]);

/** Crude singulariser — enough for `onions`/`onion`, not a linguistic model. */
const singular = (w: string) => {
  if (KEEP_PLURAL.has(w) || w.length < 4) return w;
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (/(?:oes|ses|xes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
};

/** Tokens that never change identity — safe to ignore when grouping. */
const NOISE = new Set([
  "fresh", "large", "medium", "small", "whole", "good", "quality", "plus",
  "your", "choice", "optional", "packed", "heaping", "about", "approx",
]);

/**
 * Grouping key: noise removed, last word singularised, tokens order-insensitive.
 *
 * Note this only affects GROUPING. The displayed canonical stays the most
 * frequent surface form, so `noodles` and `greens` keep their natural plural
 * names even though they group with any singular variant.
 */
const key = (h: string) => {
  const parts = h.split(" ").filter((w) => w.length > 1 && !NOISE.has(w));
  // Singularise EVERY token, not just the last. `brussels sprouts` and
  // `brussel sprouts` differ on the first word; `bulb garlic` / `bulbs garlic`
  // likewise. Last-word-only left those as separate groups.
  return parts.map(singular).sort().join(" ");
};
/**
 * Merge rules learned from review notes (npm run learn).
 *
 * Loaded rather than hard-coded so a note written in the UI takes effect on the
 * next `propose` without anyone transcribing it. Absent on a first run.
 */
type Learned = {
  rules: Array<{ from: string; to: string; members: string[] }>;
  renames: Array<{ from: string; to: string }>;
};
const RENAMES: Record<string, string> = {};
try {
  const raw = readFileSync(resolve(OUT, "learned-aliases.json"), "utf8");
  const learned = JSON.parse(raw) as Learned;
  // Into the ENGINE, not into a local table. Every member string, not just the
  // canonical: the canonical is only the most frequent surface form and the
  // others have to follow it.
  const extra: Record<string, string> = {};
  for (const r of learned.rules) for (const m of [...r.members, r.from]) extra[m] = r.to;
  const added = registerSynonyms(extra);
  if (added) console.log(`  ${added} synonym(s) from review notes — promote these into exceptions.ts`);
  for (const r of learned.renames ?? []) RENAMES[r.from] = r.to;
} catch {
  /* no learned rules yet */
}


/**
 * Never proposed as ontology nodes.
 *
 * Water in all its forms: universal, and nobody adds it to a pantry, so a node
 * for it can only ever be noise in the matcher (reviewer's call).
 */
const DROP = new Set(["water", "ice", "ice cubes", "fresh"]);

/**
 * Plain-water variants are dropped wholesale; genuine ingredients that merely
 * end in "water" are not. `coconut water` and `water chestnuts` are things you
 * buy; `ice cold water` and `reserved pasta water` are not.
 */
const WATER_KEEP = new Set([
  "coconut water", "sparkling water", "tonic water", "rose water",
  "orange blossom water", "water chestnuts", "watercress", "watermelon",
]);
const isPlainWater = (h: string) =>
  /\bwater$/.test(h) && !WATER_KEEP.has(h);


if (!existsSync(RAW)) { console.error("no data/raw — run: npm run crawl"); process.exit(1); }
mkdirSync(OUT, { recursive: true });

const recipes: RawRecipe[] = [];
for (const f of readdirSync(RAW).filter((f) => f.endsWith(".jsonl")))
  for (const l of readFileSync(resolve(RAW, f), "utf8").split("\n"))
    if (l.trim()) { try { recipes.push(JSON.parse(l)); } catch {} }

/**
 * Stable, content-derived row id.
 *
 * Positional ids (`alias-1`, `alias-2`) break the core promise that
 * regenerating proposals never destroys reviewed work: any change to grouping
 * shifts every subsequent row, silently re-attaching decisions to different
 * ingredients. Keying on the canonical name means a row keeps its identity as
 * long as the thing it describes does.
 */
const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((c) => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n") + "\n";

// ── head statistics ────────────────────────────────────────────────────────
/**
 * Pass 1: heads with no vocabulary, used only as evidence for pass 2.
 *
 * A handful of lines cannot be parsed in isolation. "perilla or sesame oil"
 * means perilla OIL or sesame oil, while "water or kelp broth" means water, or
 * kelp broth — same grammar, opposite readings, and the only thing that settles
 * it is whether `perilla oil` is a thing the corpus talks about elsewhere. It
 * is, 26 times; `water broth` never is. So the corpus resolves its own
 * ambiguity, and the cost is one extra sweep over data we already hold.
 */
const PASS1 = new Set<string>();
for (const r of recipes)
  for (const raw of r.rawIngredients) {
    const h = headName(raw);
    if (h) PASS1.add(h);
  }

type Stat = { n: number; cuisines: Set<string>; examples: string[] };
const heads = new Map<string, Stat>();
for (const r of recipes)
  for (const raw of r.rawIngredients) {
    const h = headName(raw, PASS1);
    if (!h) continue;
    const e = heads.get(h) ?? { n: 0, cuisines: new Set<string>(), examples: [] };
    e.n++;
    e.cuisines.add(r.cuisine ?? "unresolved");
    if (e.examples.length < 3) e.examples.push(raw);
    heads.set(h, e);
  }
const ranked = [...heads.entries()]
  .filter(([h]) => !DROP.has(h) && !isPlainWater(h) && !COMPOUND.test(h))
  .sort((a, b) => b[1].n - a[1].n)
  .slice(0, DEPTH);

/** The corpus vocabulary the engine consults for its safety conditions. */
const present = new Set(ranked.map(([h]) => h));
const vocab: Vocabulary = { has: (h) => present.has(h) };

// ── 1. alias groups ────────────────────────────────────────────────────────
//
// The ENGINE names every group. Until now this file carried its own SYNONYMS,
// DEMOTE and token-sort key — a second, quietly diverging copy of the same
// judgements, which is how `lemon zest` stayed a 49-mention node in the review
// queue while the engine had already settled it as `lemon`. One implementation,
// scored by npm run agreement, applied here.
const groups = new Map<string, { members: [string, Stat][]; n: number; names: Map<string, number> }>();
const engineNotes = new Map<string, string>();
let viaGeneral = 0, viaException = 0, untouched = 0;
for (const [h, st] of ranked) {
  const r = normalize(h, vocab);
  // A split names two ingredients and cannot be one node; a drop is not an
  // ingredient at all. Neither belongs in the alias list.
  if (r.split?.length || r.drop) continue;
  const canonical = r.canonical || h;
  if (!r.trace.length) untouched++;
  else if (r.trace.some((t) => t.kind === "exception")) viaException++;
  else viaGeneral++;
  if (r.review) engineNotes.set(canonical, r.review);

  // Group on a NUMBER- and ORDER-insensitive key, display the engine's name.
  //
  // Two different jobs. The engine decides identity and deliberately leaves
  // plurals alone, because `chicken thighs` is the right display name for a node
  // the corpus always writes plural. But `chicken thigh` and `chicken thighs`
  // are still one node, and grouping on the engine's output alone split them —
  // it pushed the list from 1,281 rows to 1,328.
  const k = key(canonical);
  const g = groups.get(k) ?? { members: [], n: 0, names: new Map<string, number>() };
  g.members.push([h, st]);
  g.n += st.n;
  g.names.set(canonical, (g.names.get(canonical) ?? 0) + st.n);
  groups.set(k, g);
}
const rawBuilt = [...groups.entries()].map(([, g]) => {
  g.members.sort((a, b) => b[1].n - a[1].n);
  // Of the engine names in this group, the one the corpus uses most.
  const canonical = [...g.names.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  return { canonical: RENAMES[canonical] ?? canonical, g };
});

/**
 * Collapse groups that ended up with the same canonical name.
 *
 * Belt and braces rather than a fix for one path. Several stages can name a
 * group — the synonym map, learned renames, the demote rule — and they don't
 * all route through the same key, so two groups could share a display name
 * while keying differently. That produced two rows both called `coarse salt`.
 *
 * Chasing every interaction between those stages is a losing game; asserting
 * the invariant at the end is not. One canonical, one row, whatever the route.
 */
const byCanonical = new Map<string, (typeof rawBuilt)[number]>();
for (const b of rawBuilt) {
  const prev = byCanonical.get(b.canonical);
  if (!prev) { byCanonical.set(b.canonical, b); continue; }
  prev.g.members.push(...b.g.members);
  prev.g.n += b.g.n;
}
const built = [...byCanonical.values()];
if (built.length !== rawBuilt.length) {
  console.log(`  collapsed ${rawBuilt.length - built.length} duplicate canonical(s)`);
}
console.log(`  named by engine: ${viaGeneral} general rule, ${viaException} exception, ${untouched} already canonical`);

/**
 * Family = the head noun, singularised.
 *
 * Grouping the REVIEW by family, without merging anything, is the safe half of
 * "aggregate by substring". Measuring which modifiers are non-distinguishing
 * failed outright — the most promiscuous modifiers turned out to be `korean`,
 * `red`, `black`, `dried`, i.e. exactly the identity words that must never
 * merge — so reasonableness can't be derived statistically.
 *
 * What can be fixed automatically is *visibility*: `sesame oil` and
 * `perilla oil` were 600 rows apart, so the reviewer had to hold the family in
 * their head and write "aliased with X" from memory. Adjacent rows turn six
 * isolated judgements into one.
 */
const lastWord = (c: string) => singular(c.split(" ").slice(-1)[0]!);
const lastTwo = (c: string) => {
  const w = c.split(" ");
  if (w.length < 2) return lastWord(c);
  return `${w[w.length - 2]} ${singular(w[w.length - 1]!)}`;
};

/**
 * Oversized families are subdivided on the last TWO words.
 *
 * A single head noun is too coarse for the big ones: `sauce` collected 44
 * members spanning unrelated product lines, and `pepper` mixed peppercorns with
 * bell peppers. Two words separate them along the lines that actually matter —
 * `soy sauce` (light/dark/soup) apart from `fish sauce`, `black pepper` apart
 * from `bell pepper` — because in English the penultimate word is usually what
 * names the product while the last names the form.
 */
const OVERSIZED = 12;

const firstPass = new Map<string, number>();
for (const b of built) firstPass.set(lastWord(b.canonical), (firstPass.get(lastWord(b.canonical)) ?? 0) + 1);

const familyOf = (canonical: string) => {
  const one = lastWord(canonical);
  return (firstPass.get(one) ?? 0) > OVERSIZED ? lastTwo(canonical) : one;
};

const familyTotals = new Map<string, number>();
const familyCount = new Map<string, number>();
for (const b of built) {
  const f = familyOf(b.canonical);
  familyTotals.set(f, (familyTotals.get(f) ?? 0) + b.g.n);
  familyCount.set(f, (familyCount.get(f) ?? 0) + 1);
}

// Families ordered by total weight; members ordered by weight within a family.
// The most-mentioned member sorts first and is what `M` merges into.
const aliasRows = built.sort((a, b) => {
  const fa = familyOf(a.canonical), fb = familyOf(b.canonical);
  if (fa !== fb) return (familyTotals.get(fb) ?? 0) - (familyTotals.get(fa) ?? 0);
  return b.g.n - a.g.n;
});

writeFileSync(resolve(OUT, "aliases.csv"), csv([
  ["id", "proposed_canonical", "family", "family_size", "members", "member_count",
   "mentions", "cuisines", "example"],
  ...aliasRows.map((a) => [
    `alias-${slug(a.canonical)}`,
    a.canonical,
    familyOf(a.canonical),
    familyCount.get(familyOf(a.canonical)) ?? 1,
    a.g.members.map(([m]) => m).join(" | "),
    a.g.members.length,
    a.g.n,
    [...new Set(a.g.members.flatMap(([, s]) => [...s.cuisines]))].join("|"),
    a.g.members[0]![1].examples[0] ?? "",
  ]),
]));

const families = [...familyCount.values()].filter((n) => n > 1).length;


// ── 3. slots ───────────────────────────────────────────────────────────────
const SLOT_TERMS = ["protein", "vegetable", "vegetables", "greens", "noodles",
  "meat", "mushrooms", "nuts", "cheese", "herbs", "broth", "stock", "oil"];
writeFileSync(resolve(OUT, "slots.csv"), csv([
  ["id", "slot", "is_slot", "mentions", "example"],
  ...SLOT_TERMS.map((t) => {
    const st = heads.get(t);
    return [`slot-${slug(t)}`, t, "yes", st?.n ?? 0, st?.examples[0] ?? ""];
  }),
]));

// ── 4. substitutions seed ──────────────────────────────────────────────────
// Seeded from ONTOLOGY-SEED.md rather than invented — §4 requires a native
// validator, so the machine's job here is transcription, not judgement.
writeFileSync(resolve(OUT, "substitutions.csv"), csv([
  ["id", "ingredient", "substitute", "endorsed", "reason"],
  ["sub-1", "oligodang", "mulyeot", "yes", "All starch syrups, genuinely interchangeable"],
  ["sub-2", "ganjang.jin", "soy_sauce.generic", "yes", "Jin-ganjang is general-purpose soy sauce"],
  ["sub-3", "mirin", "sake + sugar", "yes", "Standard swap"],
  ["sub-4", "shaoxing", "sherry.dry", "yes", "Universally endorsed in Chinese cooking"],
  ["sub-5", "korean radish", "daikon", "yes", "REVIEW — Maangchi keeps these as separate nodes"],
  ["sub-6", "starch.potato", "starch.corn", "yes", "Marginally less chewy"],
  ["sub-7", "soup soy sauce", "soy_sauce.generic", "no", "Different salt level and colour; soups come out muddy and under-seasoned"],
  ["sub-8", "gochugaru", "crushed red pepper flakes", "no", "Far hotter, no sweetness, wrong texture"],
  ["sub-9", "gochujang", "sriracha", "no", "No fermented depth, thinner and more acidic"],
  ["sub-10", "doenjang", "miso", "no", "Milder and sweeter; lacks the funk that defines the dish"],
  ["sub-11", "doenjang", "doubanjiang", "no", "Chili-based, different category"],
  ["sub-12", "sesame oil", "perilla oil", "no", "Two distinct flavours, both used deliberately"],
  ["sub-13", "cabbage.napa", "cabbage.green", "no", "Tougher and less sweet"],
  ["sub-14", "perilla leaf", "shiso", "no", "Related, distinctly different flavour"],
  ["sub-15", "buchu", "common chives", "no", "Much milder, missing the garlic note"],
]));

console.log(`wrote data/qc/
  aliases.csv        ${aliasRows.length} groups in ${families} multi-member families
  slots.csv          ${SLOT_TERMS.length}
  substitutions.csv  15 seeded from ONTOLOGY-SEED.md

next: npm run qc-ui`);
