/**
 * Turn review notes into alias rows.
 *
 *   npm run learn -- --dry     # show what would be added
 *   npm run learn              # append to data/ontology/aliases.csv
 *
 * Most notes are instructions, not commentary. A row annotated `doenjang` or
 * `aliased with salt` means "this is that", and that is precisely an alias:
 * surface form → known node. Hand-transcribing them does not scale and silently
 * drops the ones nobody re-read.
 *
 * The output goes to the alias TABLE rather than to a side file, because the
 * table is the source of truth the engine reads. An earlier version wrote
 * learned-aliases.json and had propose.ts register it at startup, which meant
 * two places held aliases and only one of them was reviewable.
 *
 * Notes that are NOT instructions are reported, never guessed at:
 *
 *   "not ingredient"     → the row should be dropped, which is a different edit
 *   "should be split"    → names two ingredients; needs the split target named
 *   "parsing error"      → belongs in frequency.ts
 *   commentary           → a human has to read it
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { intentOf } from "../ontology/score.js";
import { loadAliases, saveAliases, type Alias } from "../ontology/aliases.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const QC = resolve(ROOT, "data/qc");
const DEC = resolve(ROOT, "data/decisions");
const DRY = process.argv.includes("--dry");

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

/** Notes that describe a problem rather than name an answer. */
const NOT_AN_ALIAS =
  /\bnot (?:an? )?ingredient\b|\bshould be split\b|\bpars(?:e|ing) error\b|\bsplit\b/i;

const aliasFile = resolve(QC, "aliases.csv");
const decFile = resolve(DEC, "aliases.csv");
if (!existsSync(decFile)) { console.error("no decisions yet"); process.exit(1); }

const proposals = asObjects(readFileSync(aliasFile, "utf8"));
const byId = new Map(proposals.map((p) => [p["id"]!, p]));
const decisions = asObjects(readFileSync(decFile, "utf8"));

const existing = loadAliases();
const have = new Map(existing.map((a) => [a.surface, a]));

const added: Alias[] = [];
const needsYou: Array<{ row: string; note: string; why: string }> = [];
let already = 0;

for (const d of decisions) {
  const note = (d["note"] ?? "").trim();
  const verdict = d["verdict"] ?? "";
  const p = byId.get(d["id"]!);
  // Row ids dissolve when the list regenerates; fall back to the id's slug so a
  // decision on a since-merged row can still contribute its fact.
  const surfaces = p
    ? [p["proposed_canonical"]!, ...(p["members"] ?? "").split(" | ")]
        .map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [d["id"]!.replace(/^alias-/, "").replace(/-/g, " ")];

  let target = "";
  if (verdict === "edit" || verdict === "merge") target = (d["value"] ?? "").trim();
  else if (note) {
    if (NOT_AN_ALIAS.test(note)) {
      needsYou.push({ row: surfaces[0]!, note, why: NOT_AN_ALIAS.exec(note)![0] });
      continue;
    }
    const intent = intentOf(note);
    if (intent?.kind === "target") target = intent.to;
    else if (intent) { needsYou.push({ row: surfaces[0]!, note, why: intent.kind }); continue; }
  }
  if (!target) continue;

  for (const surface of surfaces) {
    if (surface === target.toLowerCase()) continue;   // already says what it is
    const prev = have.get(surface);
    if (prev) {
      if (prev.node !== target) {
        // The reviewer changed their mind, or the old row was mine. Theirs wins.
        prev.node = target;
        prev.source = "review";
        prev.note = note || prev.note;
        added.push(prev);
      } else already++;
      continue;
    }
    const a: Alias = { surface, node: target, source: "review", note };
    have.set(surface, a);
    added.push(a);
  }
}

console.log(`\n${added.length} alias row(s) from ${decisions.length} decisions`);
if (already) console.log(`  ${already} already present, unchanged`);
for (const a of added.slice(0, 30)) console.log(`  ${a.surface.padEnd(34)} → ${a.node}`);
if (added.length > 30) console.log(`  … and ${added.length - 30} more`);

if (needsYou.length) {
  console.log(`\n${needsYou.length} note(s) are NOT aliases and need you:`);
  const byWhy = new Map<string, number>();
  for (const n of needsYou) byWhy.set(n.why, (byWhy.get(n.why) ?? 0) + 1);
  for (const [why, n] of byWhy) console.log(`  ${String(n).padStart(4)}  ${why}`);
  console.log(`  (a "split" needs both halves named; "not ingredient" is a drop, not a merge)`);
}

if (DRY) { console.log("\n(dry run — nothing written)"); process.exit(0); }
saveAliases([...have.values()]);
console.log(`\nwrote data/ontology/aliases.csv — ${have.size} aliases total`);
