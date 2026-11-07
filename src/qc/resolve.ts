/**
 * Settle reviewer/engine conflicts in the engine's favour.
 *
 *   npm run resolve -- --dry     # show what would change
 *   npm run resolve              # apply
 *
 * Only `conflict` rows are touched — cases where the reviewer and the engine
 * both acted and disagreed. `engine-missed` rows are deliberately left alone:
 * there the engine has no opinion, so there is no rule to follow and the
 * reviewer's judgment is the only information present. Overwriting those would
 * destroy work while claiming to enforce a rule.
 *
 * The previous decision is preserved in the note, so nothing is lost and the
 * change is legible in the diff.
 */
import { existsSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { score } from "../ontology/score.js";
import type { Vocabulary } from "../ontology/normalize.js";

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
const toCsv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((c) => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n") + "\n";

const decFile = resolve(DEC, "aliases.csv");
if (!existsSync(decFile)) { console.error("no decisions to resolve"); process.exit(1); }

const props = parseCsv(readFileSync(resolve(QC, "aliases.csv"), "utf8"));
const ph = props[0]!;
const items = props.slice(1).map((r) => Object.fromEntries(ph.map((h, i) => [h, r[i] ?? ""])));
const byId = new Map(items.map((i) => [i["id"]!, i]));

const vocabSet = new Set<string>();
for (const it of items) {
  vocabSet.add(it["proposed_canonical"]!);
  for (const m of (it["members"] ?? "").split(" | ")) if (m.trim()) vocabSet.add(m.trim());
}
const vocab: Vocabulary = { has: (h) => vocabSet.has(h) };

const dec = parseCsv(readFileSync(decFile, "utf8"));
const dh = dec[0]!;
const rows = dec.slice(1);

let changed = 0;
for (const r of rows) {
  const o = Object.fromEntries(dh.map((h, i) => [h, r[i] ?? ""]));
  const p = byId.get(o["id"]!);
  if (!p) continue;
  const s = score(p["proposed_canonical"]!, o, vocab);
  if (s.status !== "conflict") continue;

  console.log(`${p["proposed_canonical"]!.padEnd(42)} ${s.wanted}  →  ${s.engine}`);
  changed++;
  if (DRY) continue;

  const iV = dh.indexOf("verdict"), iVal = dh.indexOf("value"), iN = dh.indexOf("note");
  const was = o["note"] ? `${o["note"]}; ` : "";
  r[iV] = "edit";
  r[iVal] = s.engine;
  r[iN] = `${was}was "${s.wanted}" — resolved to the rule`;
}

if (!changed) { console.log("no conflicts to resolve"); process.exit(0); }
if (DRY) { console.log(`\n${changed} would change (dry run)`); process.exit(0); }

copyFileSync(decFile, decFile + ".bak");
writeFileSync(decFile, toCsv([dh, ...rows]));
console.log(`\n${changed} decisions resolved to the rule`);
console.log(`previous file kept at data/decisions/aliases.csv.bak`);
