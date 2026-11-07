/**
 * Freeze review decisions into stable expectations.
 *
 *   npm run freeze            # from the current proposal list
 *   npm run freeze -- <ref>   # from a git revision of it
 *
 * Decisions are stored against ROW IDS, which are derived from the proposal's
 * content and therefore dissolve when a rule improves and the row is renamed or
 * merged away. That is correct for the review UI and fatal for the test suite:
 * once the engine drove proposal generation, `npm run agreement` began scoring
 * the engine against its own output and reported a meaningless 99%.
 *
 * So the decisions are converted, once, into what they always meant:
 *
 *     this raw head  →  should settle as this canonical
 *
 * Those pairs survive any regeneration, because the raw head comes from the
 * corpus rather than from a proposal. They are the actual test suite — the thing
 * that keeps paying off on cuisines the review never touched.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { intentOf } from "../ontology/score.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const QC = resolve(ROOT, "data/qc");
const DEC = resolve(ROOT, "data/decisions");
const REF = process.argv[2];

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

// A path or a git ref. data/qc is gitignored — it is derived data — so the
// snapshot the decisions were made against usually comes from a file.
const proposalText = !REF
  ? readFileSync(resolve(QC, "aliases.csv"), "utf8")
  : existsSync(REF)
    ? readFileSync(REF, "utf8")
    : execFileSync("git", ["show", `${REF}:data/qc/aliases.csv`], { cwd: ROOT, encoding: "utf8" });
const proposals = asObjects(proposalText);
const byId = new Map(proposals.map((p) => [p["id"]!, p]));

if (!existsSync(resolve(DEC, "aliases.csv"))) { console.error("no decisions"); process.exit(1); }
const decisions = asObjects(readFileSync(resolve(DEC, "aliases.csv"), "utf8"));

/** Existing expectations are kept: freezing twice must never lose a case. */
const out = new Map<string, { expected: string; signal: string; note: string }>();
const expFile = resolve(QC, "expectations.csv");
if (existsSync(expFile))
  for (const e of asObjects(readFileSync(expFile, "utf8")))
    out.set(e["input"]!, { expected: e["expected"]!, signal: e["signal"]!, note: e["note"] ?? "" });

let added = 0, skipped = 0;
for (const d of decisions) {
  const p = byId.get(d["id"]!);
  if (!p) { skipped++; continue; }

  const intent = intentOf(d["note"] ?? "");
  let expected: string | null = null;
  if (d["verdict"] === "edit" || d["verdict"] === "merge") expected = d["value"] || null;
  else if (intent?.kind === "target") expected = intent.to;
  else if (intent?.kind === "split") expected = intent.into.join(" + ");
  else if (d["verdict"] === "accept" && !intent) expected = p["proposed_canonical"]!;
  if (!expected) { skipped++; continue; }

  // Every raw head in the group becomes a case. The group's members ARE the
  // corpus strings the parser produced, so each is an independent test of the
  // engine — and unlike the canonical, they do not move when a rule changes.
  const members = (p["members"] ?? "").split(" | ").map((m) => m.trim()).filter(Boolean);
  for (const m of members.length ? members : [p["proposed_canonical"]!]) {
    if (out.has(m)) continue;
    out.set(m, {
      expected,
      signal: d["verdict"] === "accept" ? "weak" : "strong",
      note: d["note"] ?? "",
    });
    added++;
  }
}

writeFileSync(expFile, csv([
  ["input", "expected", "signal", "note"],
  ...[...out.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([input, v]) => [input, v.expected, v.signal, v.note]),
]));

console.log(`froze ${added} new case(s); ${out.size} total in data/qc/expectations.csv`);
if (skipped) console.log(`  ${skipped} decision(s) had no readable target (commentary, or row no longer exists)`);
console.log(`\nThese are stable: they name raw heads from the corpus, not proposal rows,`);
console.log(`so they keep scoring the engine after any regeneration.`);
