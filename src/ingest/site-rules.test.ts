/**
 * Site rules, scored against the reviewer's own corrections.
 *
 *   npm run test-site-rules
 *
 * The curation file IS the benchmark. Every flagged line carries what the
 * reviewer said it should have been, so this reads `data/curation/recipes.json`,
 * runs each line through `site-rules.ts` plus the general parser, and reports how
 * many corrections are now satisfied.
 *
 * This is the same argument BUILD.md makes for the mapping benchmark: without an
 * instrument, a rule change is a guess. It differs in one way that matters — the
 * cases are not hand-copied into this file, so they cannot drift from the
 * curation record, and curating more koreanbapsang recipes automatically widens
 * the test.
 *
 * Scoring is deliberately coarse. Some notes are prose ("correct. aliased as
 * maneuljjong") and some are judgements the parser cannot reach ("skip it"). Those
 * are reported UNSCORED rather than counted as passes, because a benchmark that
 * flatters itself is worse than none.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { headName } from "./frequency.js";
import { applySiteRules } from "./site-rules.js";
import { UNIVERSAL, NOT_INGREDIENT } from "../ontology/rules.js";

function findData(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, "data", "curation", "recipes.json")))
      return resolve(dir, "data");
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error("cannot find data/curation/recipes.json");
}

const DATA = findData();
type Curation = {
  recipe_id: string;
  bad_lines?: string[];
  line_notes?: Array<{ raw: string; note: string }>;
};
const curations: Record<string, Curation> =
  JSON.parse(readFileSync(resolve(DATA, "curation", "recipes.json"), "utf8"));
const index = JSON.parse(readFileSync(resolve(DATA, "ontology", "recipe-index.json"), "utf8")) as
  { recipes: Array<{ id: string; source: string }> };
const sourceOf = new Map(index.recipes.map((r) => [r.id, r.source]));

/**
 * The corpus head vocabulary, rebuilt the way `recipe-index.ts` builds it.
 *
 * Not optional. `headName` has a second pass that needs the vocabulary to settle
 * "X or Y" lines, and scoring without it measures a parser the pipeline never
 * runs — the first version of this file reported `potato` for a line the real
 * pipeline already resolves to `potato starch`.
 */
const allLines = JSON.parse(
  readFileSync(resolve(DATA, "ontology", "recipe-lines.json"), "utf8"),
) as Record<string, Array<{ raw: string }>>;
const HEADS = new Set<string>();
for (const ls of Object.values(allLines))
  for (const l of ls) { const h = headName(l.raw); if (h) HEADS.add(h); }
const head2 = (raw: string) => headName(raw, HEADS);

/** A note the parser cannot be scored against — recorded, never counted. */
const UNSCORABLE = /^(?:skip it|correct\b)/i;

type Case = { source: string; raw: string; note: string };
const cases: Case[] = [];
for (const [rid, c] of Object.entries(curations)) {
  const source = sourceOf.get(rid);
  if (!source) continue;
  for (const { raw, note } of c.line_notes ?? []) cases.push({ source, raw, note });
}

/** Loose match: the reviewer types a name, not a canonical id. */
const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const singularish = (s: string) => norm(s).split(" ").map((w) => w.replace(/s$/, "")).join(" ");

/**
 * Levenshtein, for the reviewer's typos.
 *
 * Not slack in the rules — slack in the *expectation*. "nappa cabage" is what was
 * typed and `napa cabbage` is what the parser produced, and scoring that as a
 * failure would send someone to fix a rule that is already right. Two edits is
 * enough for a typo and far too few to conflate two ingredients.
 */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j]! + 1, cur[j - 1]! + 1,
        prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n]!;
}

const alike = (a: string, b: string) => {
  const [x, y] = [singularish(a), singularish(b)];
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x) || editDistance(x, y) <= 2) return true;
  // Every word the reviewer wrote appears in what we produced: they write the
  // short form ("tempura mix") of a name the page spells out ("tempura batter
  // mix"). Requiring ALL of their words keeps this from matching loosely.
  const got = new Set(x.split(" "));
  return y.split(" ").every((w) => got.has(w));
};

let pass = 0, fail = 0, unscored = 0;
const failures: string[] = [];

/**
 * One note can assert several things at once — "jajangmyeon noodle aliased as
 * jjajangmyeon noodle subs: udon noodle" is a head, an alias and an alternative.
 * Scoring only the first would hide two thirds of the specification, so every
 * assertion in a note is scored separately.
 */
type Assertion = { want: string; ok: boolean };

for (const { source, raw, note } of cases) {
  const v = applySiteRules(source, raw);
  const head = v.kind === "keep" ? head2(v.raw) : "";
  // Alternatives go through the parser in the real pipeline (recipe-index's
  // `alternatives()`), so they must here too — otherwise "3 ounces fresh
  // shiitake" is scored as a name when the pipeline would store `shiitake`.
  const alts = v.kind === "keep" ? v.alternates.map(head2).filter(Boolean) : [];
  const aliases = v.kind === "keep" ? v.aliases.map((a) => a.alias) : [];
  const dropped =
    v.kind === "drop" || UNIVERSAL.has(head) || NOT_INGREDIENT.has(head) || !head;

  const trimmed = note.trim();
  if (UNSCORABLE.test(trimmed)) { unscored++; continue; }

  const asserts: Assertion[] = [];

  if (/not\s+(?:an?\s+)?ingredient/i.test(note)) {
    asserts.push({ want: "dropped", ok: dropped });
  } else if (/^staple$/i.test(trimmed)) {
    asserts.push({ want: "dropped as a staple", ok: dropped });
  } else {
    if (/\baliased as\b/i.test(note)) {
      const wanted = note.replace(/^.*\baliased as\b/i, "")
        .replace(/\bsubs:.*$/i, "")
        .split(/\s+and\s+|,/).map((s) => s.trim()).filter(Boolean);
      // The HEAD counts as satisfying an alias assertion. "aliased as chunjang
      // and jjajang" names both spellings without saying which becomes canonical;
      // producing one as the head and the other as an alias is the right outcome,
      // and scoring it as a miss would send someone to fix a rule that works.
      for (const w of wanted)
        asserts.push({
          want: `alias ${JSON.stringify(w)}`,
          ok: aliases.some((a) => alike(a, w)) || alike(head, w),
        });
    }
    if (/\bsubs:/i.test(note)) {
      const wanted = note.replace(/^.*\bsubs:/i, "")
        .split(/\s+or\s+|,/).map((s) => s.trim()).filter(Boolean);
      for (const w of wanted)
        asserts.push({ want: `alternate ${JSON.stringify(w)}`, ok: alts.some((a) => alike(a, w)) });
    }
    // A leading bare name is the head the line should have produced. Only when
    // the note starts with it — "subs: mirin" asserts nothing about the head.
    const leading = trimmed.replace(/\b(?:aliased as|subs:).*$/i, "").trim();
    if (leading && !/^(?:aliased|subs)/i.test(trimmed))
      asserts.push({ want: `head ≈ ${JSON.stringify(leading)}`, ok: alike(head, leading) });
  }

  const bad = asserts.filter((a) => !a.ok);
  pass += asserts.length - bad.length;
  fail += bad.length;
  if (bad.length) {
    failures.push(
      `MISS  ${JSON.stringify(raw)}\n` +
      bad.map((a) => `      want ${a.want}`).join("\n") + "\n" +
      `      got  ${v.kind === "drop" ? `dropped (${v.reason})` : `head ${JSON.stringify(head)}`}` +
      (alts.length ? `  alts ${JSON.stringify(alts)}` : "") +
      (aliases.length ? `  aliases ${JSON.stringify(aliases)}` : ""),
    );
  }
}

for (const f of failures) console.log(f);
const scored = pass + fail;
console.log(
  `\n${pass}/${scored} curated assertions satisfied` +
  ` (${unscored} unscorable notes, ${cases.length} flagged lines)`,
);

// Not a hard gate. This is an instrument, and a `process.exit(1)` here would mean
// every newly-curated correction breaks the build before anyone has written the
// rule for it. The number is the point; regressions are visible by comparing it.
