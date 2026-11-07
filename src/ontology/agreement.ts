/**
 * Score the engine against the reviewer.
 *
 *   npm run agreement
 *
 * The 593 manual decisions are treated as TEST CASES, not as rules. That
 * distinction is the whole design. Transcribing decisions into an alias map
 * bakes the reviewer's mistakes in permanently and has to be redone for every
 * new cuisine; scoring against them instead means:
 *
 *   - a rule change re-runs in a second and reports exactly which calls it now
 *     contradicts
 *   - a contradiction is a bug in EITHER the rule or the original call, and only
 *     contradictions need a human — never the rows both already agree on
 *   - the review keeps paying off on corpora it was never performed against
 *
 * Output is data/qc/agreement.csv, sorted so the rows worth arguing about are at
 * the top.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { score } from "./score.js";
import { reportTables } from "./integrity.js";
import type { Vocabulary } from "./normalize.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const QC = resolve(ROOT, "data/qc");
const DEC = resolve(ROOT, "data/decisions");

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ""));
}
const asObjects = (text: string) => {
  const rows = parseCsv(text);
  const h = rows[0]!;
  return rows.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""])));
};
const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((c) => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n") + "\n";

/**
 * What the reviewer meant by a note.
 *
 * Most notes are instructions ("garlic" means merge into garlic), but some are
 * diagnoses ("parse error", "adjective") and a few are split requests. Reading a
 * diagnosis as a merge target invents a node called `parsing error`, so the
 * classification has to come first.
 */
// ── load ───────────────────────────────────────────────────────────────────

if (!existsSync(resolve(DEC, "aliases.csv"))) {
  console.error("no decisions to score against — review some rows first");
  process.exit(1);
}
const proposals = asObjects(readFileSync(resolve(QC, "aliases.csv"), "utf8"));

/**
 * Frozen expectations, if they exist — `npm run freeze`.
 *
 * These are the real test suite: raw head → the canonical it should settle as.
 * Scoring against live proposal rows stopped working the moment the engine
 * started GENERATING those rows, because then it was grading its own homework
 * and reported 99% while proving nothing.
 */
const expFile = resolve(QC, "expectations.csv");
const FROZEN = existsSync(expFile) ? asObjects(readFileSync(expFile, "utf8")) : [];
const decisions = asObjects(readFileSync(resolve(DEC, "aliases.csv"), "utf8"));
const byId = new Map(proposals.map((p) => [p["id"]!, p]));

/**
 * The corpus vocabulary, used by the engine's safety condition: a modifier is
 * only stripped down to a form the corpus actually uses. Built from every
 * proposed canonical AND every member surface form.
 */
const vocabSet = new Set<string>();
for (const p of proposals) {
  vocabSet.add(p["proposed_canonical"]!);
  for (const m of (p["members"] ?? "").split(" | ")) if (m.trim()) vocabSet.add(m.trim());
}
const vocab: Vocabulary = { has: (h) => vocabSet.has(h) };

// ── score ──────────────────────────────────────────────────────────────────

/**
 * `signal` separates decisions the reviewer ACTED on from ones they merely let
 * pass. An accept can mean "this is right" or it can mean "row 340 of 1285 and I
 * was moving fast"; a flag with a note is unambiguous intent. Reporting one
 * blended number lets inattention masquerade as evidence, and tuning the engine
 * to fit it would be fitting noise. Strong agreement is the number to trust.
 */
type Row = {
  id: string; input: string; reviewer: string; engine: string;
  status: string; rule: string; why: string; signal: string;
};
const rows: Row[] = [];
const tally: Record<string, number> = {};
const bump = (k: string) => (tally[k] = (tally[k] ?? 0) + 1);

const cases = FROZEN.length
  ? FROZEN.map((e) => ({
      id: e["input"]!, input: e["input"]!,
      decision: { verdict: e["signal"] === "weak" ? "accept" : "edit", value: e["expected"]!, note: "" },
    }))
  : decisions.map((d) => ({
      id: d["id"]!, input: byId.get(d["id"]!)?.["proposed_canonical"] ?? "", decision: d,
    })).filter((c) => c.input);

for (const c of cases) {
  const d = c.decision as Record<string, string>;
  const input = c.input;
  // One scorer, shared with the live review UI, so a row the UI badges as
  // conflicting is exactly a row this counts as conflicting.
  const r = score(input, d, vocab);
  rows.push({
    id: c.id, input, reviewer: r.wanted, engine: r.engine,
    status: r.status, rule: r.status, why: r.why, signal: r.signal,
  });
  bump(r.status);
  bump(`${r.signal}:${r.status}`);
  if (r.status === "agree" || r.status === "agree-refined") bump(`src:${r.source}`);
}

// ── report ─────────────────────────────────────────────────────────────────

const ORDER = ["conflict", "engine-missed", "unscored", "parser", "agree-refined", "agree"];
rows.sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.input.localeCompare(b.input));

mkdirSync(QC, { recursive: true });
writeFileSync(resolve(QC, "agreement.csv"),
  csv([["id", "input", "reviewer_wanted", "engine_says", "status", "signal", "rule", "why"],
       ...rows.map((r) => [r.id, r.input, r.reviewer, r.engine, r.status, r.signal, r.rule, r.why])]));

const scored = (tally["agree"] ?? 0) + (tally["agree-refined"] ?? 0) +
               (tally["conflict"] ?? 0) + (tally["engine-missed"] ?? 0);
const agreed = (tally["agree"] ?? 0) + (tally["agree-refined"] ?? 0);
const rate = (sig: string) => {
  const ok = (tally[`${sig}:agree`] ?? 0) + (tally[`${sig}:agree-refined`] ?? 0);
  const all = ok + (tally[`${sig}:conflict`] ?? 0) + (tally[`${sig}:engine-missed`] ?? 0);
  return all ? `${((ok / all) * 100).toFixed(1)}%  (${ok}/${all})` : "n/a";
};

// Structural findings FIRST. They are cheap, rare, and describe bugs that
// produce right answers for wrong reasons — buried under a score nobody would
// read them.
const structural = reportTables();

console.log(`\nscored ${scored} of ${cases.length} ${FROZEN.length ? "frozen expectations" : "decisions"}\n`);
for (const k of ORDER) if (tally[k]) console.log(`  ${k.padEnd(15)} ${String(tally[k]).padStart(4)}`);
console.log(`
  agreement      ${((agreed / scored) * 100).toFixed(1)}%  (${agreed}/${scored})
    strong       ${rate("strong")}   ← flags and rejects: deliberate, trust this
    weak         ${rate("weak")}   ← accepts: may be inattention`);
const g = tally["src:general"] ?? 0, x = tally["src:exception"] ?? 0, z = tally["src:none"] ?? 0;
console.log(`
  of the ${g + x + z} correct answers, what produced them:
    general rules  ${String(g).padStart(4)}   ← cuisine-independent; carries to the next cuisine
    exceptions     ${String(x).padStart(4)}   ← hand-written semantic facts; per-cuisine rent
    untouched      ${String(z).padStart(4)}   ← the proposal was already right
`);
console.log(`
  parser    = reviewer called it a parse defect; belongs in frequency.ts
  unscored  = note was commentary, no single target to compare against

wrote data/qc/agreement.csv — conflicts first`);

const conflicts = rows.filter((r) => r.status === "conflict").slice(0, 15);
if (conflicts.length) {
  console.log(`\ntop conflicts:`);
  for (const c of conflicts)
    console.log(`  ${c.input.padEnd(32)} you: ${c.reviewer.padEnd(24)} engine: ${c.engine}`);
}
