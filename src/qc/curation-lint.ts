/**
 * The session lint — CURATION-RULES.md §0, tier 2.
 *
 *   npm run curation-lint
 *
 * Runs after a curation sitting and emits a scannable QC list of exactly the
 * rows a human should look at again. Tier 2 exists so the curator never has to
 * REMEMBER a rule mid-flow: mint freely, type fast, and let this catch what the
 * tool could not block in the moment. Every check here is a rule from
 * CURATION-RULES.md §1 with its enforcement made real.
 *
 * Output: data/qc/curation-lint.csv, worst first, plus a console summary. An
 * empty file after a sitting is the goal state, not a suspicious silence.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { numberKey } from "../ontology/naming.js";
import { suggest, type Candidate } from "../ontology/suggest.js";
import { SYNONYM } from "../ontology/exceptions.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ONT = resolve(ROOT, "data/ontology");
const OUT = resolve(ROOT, "data/qc/curation-lint.csv");

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
const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

type Row = { check: string; subject: string; detail: string; suggestion: string };
const rows: Row[] = [];
const add = (check: string, subject: string, detail: string, suggestion = "") =>
  rows.push({ check, subject, detail, suggestion });

// ── load everything once ────────────────────────────────────────────────────
const nodes = asObjects(readFileSync(resolve(ONT, "nodes.csv"), "utf8"));
const confirmed = new Map(nodes.filter((n) => n["status"] === "confirmed")
  .map((n) => [n["node"]!, Number(n["mentions"] || 0)]));
const aliases = asObjects(readFileSync(resolve(ONT, "aliases.csv"), "utf8"));
const aliasBySurface = new Map(aliases.map((a) => [a["surface"]!, a["node"]!]));
const aliasKeys = new Map(aliases.map((a) => [numberKey(a["surface"]!), a["node"]!]));
const nodeKeys = new Map([...confirmed.keys()].map((n) => [numberKey(n), n]));

const curationFile = resolve(ROOT, "data/curation/recipes.json");
const curations: Record<string, {
  recipe_id: string; verdict: string; make_ahead?: boolean; dish_type?: string;
  drop_reason?: string;
  note?: string; line_notes?: Array<{ raw: string; note: string }>;
}> = existsSync(curationFile) ? JSON.parse(readFileSync(curationFile, "utf8")) : {};

const classifyFile = resolve(ONT, "classify.json");
const classify: Record<string, { dish_type?: string }> =
  existsSync(classifyFile) ? JSON.parse(readFileSync(classifyFile, "utf8")) : {};

const candidates: Candidate[] = [
  ...[...confirmed].map(([n, m]) => ({ node: n, surface: n, mentions: m, recipes: m })),
  ...aliases.filter((a) => confirmed.has(a["node"]!))
    .map((a) => ({ node: a["node"]!, surface: a["surface"]!,
                   mentions: confirmed.get(a["node"]!) ?? 0,
                   recipes: confirmed.get(a["node"]!) ?? 0 })),
];

const nearMisses = (text: string) =>
  suggest(text, candidates, 3).map((h) => h.node).join(" | ");

/** Resolves to a confirmed node, through the ontology or an alias, or not. */
const resolves = (text: string): string | undefined => {
  const k = numberKey(text);
  return nodeKeys.get(k) ?? aliasKeys.get(k);
};

// ── A · corrections that resolve to nothing — would-be mints ────────────────
// "should be…" text that names neither a node nor an alias is a mint waiting
// to happen (QC-SPEC §8.4). Shown with near-misses so the answer is usually a
// click, not a judgement.
// "not ingredient" is the curator's junk-door marker (CURATION-RULES §3,
// door 1), written as text because the tool has no button for it yet. A
// marker is a settled answer, not a failed resolution.
const JUNK_MARKER = /^not (an? )?ingredient\b/i;
for (const c of Object.values(curations)) {
  for (const ln of c.line_notes ?? []) {
    const target = ln.note.trim();
    if (!target || JUNK_MARKER.test(target) || resolves(target)) continue;
    add("correction-unresolved", c.recipe_id,
        `"${ln.raw.slice(0, 60)}" corrected to "${target}" — no node or alias has that name`,
        nearMisses(target));
  }
}

// ── B · corrections written in the renamed form ─────────────────────────────
// The curator typed a surface the SYNONYM table renames (korean red pepper
// flakes → gochugaru). Harmless at save time — resolution follows the table —
// but the canonical name is the one every other surface will show, and typing
// the English form is how the native-term rule erodes.
for (const c of Object.values(curations)) {
  for (const ln of c.line_notes ?? []) {
    const target = ln.note.trim().toLowerCase();
    const renamed = SYNONYM[target] ?? aliasBySurface.get(target);
    // A number-only difference is the number rule's business, never the
    // curator's (QC-SPEC §6) — flagging it would ask a human to decide
    // singular vs plural, which is exactly what tier 1 exists to prevent.
    if (renamed && renamed !== target && numberKey(renamed) !== numberKey(target)) {
      add("correction-renamed-form", c.recipe_id,
          `correction says "${target}" but the vocabulary calls it "${renamed}"`,
          renamed);
    }
  }
}

// ── C · drops with no reason ────────────────────────────────────────────────
// CURATION-RULES §2: a drop without a reason cannot be learned from, audited,
// or explained to the next annotator. The form enforces the enum for new
// drops (2026-08-17); this catches the rows that predate it.
for (const c of Object.values(curations)) {
  if (c.verdict === "drop" && !c.drop_reason && !(c.note ?? "").trim()) {
    add("drop-without-reason", c.recipe_id,
        "dropped with no reason recorded",
        "duplicate | not-a-recipe | incomplete | unparseable | out-of-scope");
  }
}

// ── D · decisions hiding in prose ───────────────────────────────────────────
// CURATION-RULES §5: a note that contains a decision is a defect report
// against the tool. Grep for decision-shaped phrasing and surface it before
// it fossilises. The match is deliberately loose — a false positive costs a
// glance, a fossilised decision costs a feature nobody builds.
const DECISION_SHAPE = /(should|->|→|\bsub:|\bsubs:|\badd\b|\bsplit\b|\bflag\b|\bomit)/i;
for (const c of Object.values(curations)) {
  const note = (c.note ?? "").trim();
  if (note && DECISION_SHAPE.test(note)) {
    add("decision-shaped-note", c.recipe_id, `note: "${note.slice(0, 100)}"`,
        "give it a field, or spend it and delete it");
  }
}

// ── E · hierarchy edges that can never fire ─────────────────────────────────
// An edge whose child is an alias surface resolves before matching begins; an
// edge naming a non-node on either end discloses nothing (the build drops it
// loudly, but only at build time — this catches it at the sitting).
const isA = asObjects(readFileSync(resolve(ONT, "is_a.csv"), "utf8"));
for (const e of isA) {
  const child = e["child"]!, parent = e["parent"]!;
  // An emptied parent is a TOMBSTONE — the retired-edge convention keeps the
  // row with its reason in the note. Settled, not dangling.
  if (!parent) continue;
  if (aliasBySurface.has(child)) {
    add("alias-child-edge", `${child} is_a ${parent}`,
        `child is an alias surface (resolves to "${aliasBySurface.get(child)}") — the edge can never fire`,
        aliasBySurface.get(child)!);
  } else if (!confirmed.has(child)) {
    add("dangling-edge", `${child} is_a ${parent}`, "child is not a confirmed node", "");
  }
  if (!confirmed.has(parent) && !aliasBySurface.has(parent)) {
    add("dangling-edge", `${child} is_a ${parent}`, "parent is not a confirmed node", "");
  }
}

// ── F · make-ahead contradictions ───────────────────────────────────────────
// A pickle or ferment that "can start now" is almost always a keystroke slip:
// the curated answer overrules the grid permanently, so it is worth a glance.
// Dish type comes from the saved legacy field or the classifier's proposal —
// curation stopped collecting it 2026-08-17.
for (const c of Object.values(curations)) {
  const dish = c.dish_type ?? classify[c.recipe_id]?.dish_type;
  if (dish === "pickle-preserve" && c.make_ahead === false) {
    add("make-ahead-contradiction", c.recipe_id,
        `dish type "${dish}" (${c.dish_type ? "curated" : "classifier"}) but make_ahead is false`,
        "confirm or fix on revisit");
  }
}

// ── G · number-split pairs — the regression guard ───────────────────────────
// The 2026-08-17 merge pass took this to zero. Anything appearing here means
// a mint slipped past the numberKey guard, or the guard is not built yet and
// a session re-split a word.
{
  const byKey = new Map<string, string[]>();
  for (const n of confirmed.keys()) {
    const k = numberKey(n);
    byKey.set(k, [...(byKey.get(k) ?? []), n]);
  }
  for (const [, group] of byKey) {
    if (group.length > 1) {
      add("number-split-pair", group.join(" / "),
          "one ingredient, several confirmed nodes", "npm run merge-numbers");
    }
  }
}

// ── H · minted decisions, revisited ─────────────────────────────────────────
// Every `new` verdict in unknown.csv is a mint. The ones whose value now
// resolves are settled and say so; the rest show near-misses, because the
// commonest fate of a hand-minted name is that the vocabulary grew past it.
const unknownFile = resolve(ROOT, "data/decisions/unknown.csv");
if (existsSync(unknownFile)) {
  for (const d of asObjects(readFileSync(unknownFile, "utf8"))) {
    if (d["verdict"] !== "new") continue;
    const val = (d["value"] ?? "").trim();
    if (!val) continue;
    const hit = resolves(val);
    if (!hit) {
      add("mint-unbuilt", d["id"]!,
          `decided "new: ${val}" but no such node exists yet`, nearMisses(val));
    }
  }
}

// ── write, worst first ──────────────────────────────────────────────────────
const ORDER = ["number-split-pair", "alias-child-edge", "dangling-edge",
               "correction-unresolved", "mint-unbuilt", "drop-without-reason",
               "make-ahead-contradiction", "correction-renamed-form",
               "decision-shaped-note"];
rows.sort((a, b) => ORDER.indexOf(a.check) - ORDER.indexOf(b.check));

writeFileSync(OUT, ["check,subject,detail,suggestion",
  ...rows.map((r) => [q(r.check), q(r.subject), q(r.detail), q(r.suggestion)].join(",")),
].join("\n") + "\n");

const counts = new Map<string, number>();
for (const r of rows) counts.set(r.check, (counts.get(r.check) ?? 0) + 1);
console.log(`curation lint: ${rows.length} row(s) → data/qc/curation-lint.csv\n`);
for (const c of ORDER) {
  if (counts.has(c)) console.log(`  ${String(counts.get(c)).padStart(4)}  ${c}`);
}
if (!rows.length) console.log("  clean — nothing needs a second look");
