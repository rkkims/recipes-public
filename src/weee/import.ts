/**
 * Read offline review work back into the repo.
 *
 *   npm run weee-import -- <file> [<file> …]
 *
 * Accepts either shape the offline tool produces:
 *
 *   weee-qc-autosave*.json        the autosave file — both decision sets
 *   weee-vocabulary-decisions.csv the Export button's vocabulary artifact
 *   recipe-weee-map.csv           the Export button's mapping artifact
 *
 * Writes:
 *   data/decisions/weee-vocabulary.csv   reviewed names — kept, never regenerated
 *   data/decisions/weee-recipe-map.csv   recipe line → Weee name
 *
 * Under data/decisions/ because that is where this repo already keeps reviewed
 * work: proposals in data/qc are regenerated at will, decisions are not. Running
 * the Weee pipeline again must never touch these files.
 *
 * Merging is by key and last-write-wins, so importing the same file twice is a
 * no-op and importing a newer one updates in place. Nothing is ever deleted by
 * an import: a decision absent from the incoming file is left alone, because
 * the alternative is that a partial export silently erases a full review.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
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

type VocabRow = { id: string; name: string; verdict: string; value: string; note: string; at: string };
type MapRow = { recipe_id: string; line: string; raw: string; head: string; weee_name: string };

const vocab = new Map<string, VocabRow>();
const map = new Map<string, MapRow>();

/** Existing decisions load first, so an import merges rather than replaces. */
function loadExisting() {
  const v = resolve(DEC, "weee-vocabulary.csv");
  if (existsSync(v)) {
    for (const r of asObjects(readFileSync(v, "utf8"))) {
      if (r["id"]) vocab.set(r["id"]!, r as unknown as VocabRow);
    }
  }
  const m = resolve(DEC, "weee-recipe-map.csv");
  if (existsSync(m)) {
    for (const r of asObjects(readFileSync(m, "utf8"))) {
      if (r["recipe_id"]) map.set(`${r["recipe_id"]}:${r["line"]}`, r as unknown as MapRow);
    }
  }
}

function takeAutosave(text: string): number {
  const d = JSON.parse(text) as {
    vocab?: Record<string, { name?: string; verdict?: string; value?: string; note?: string; at?: string }>;
    map?: Record<string, Record<string, string>>;
  };
  let n = 0;
  for (const [id, v] of Object.entries(d.vocab ?? {})) {
    vocab.set(id, {
      id, name: v.name ?? "", verdict: v.verdict ?? "", value: v.value ?? "",
      note: v.note ?? "", at: v.at ?? "",
    });
    n++;
  }
  for (const [rid, lines] of Object.entries(d.map ?? {})) {
    for (const [line, name] of Object.entries(lines)) {
      // The autosave holds no raw text — it is keyed by line index, and the raw
      // line lives in recipe-lines.json. Kept blank rather than guessed at.
      map.set(`${rid}:${line}`, { recipe_id: rid, line, raw: "", head: "", weee_name: name });
      n++;
    }
  }
  return n;
}

function takeCsv(text: string): number {
  const rows = asObjects(text);
  if (!rows.length) return 0;
  const head = Object.keys(rows[0]!);
  let n = 0;
  if (head.includes("verdict")) {
    for (const r of rows) {
      if (!r["id"]) continue;
      vocab.set(r["id"]!, {
        id: r["id"]!, name: r["name"] ?? "", verdict: r["verdict"] ?? "",
        value: r["value"] ?? "", note: r["note"] ?? "", at: r["decided_at"] ?? r["at"] ?? "",
      });
      n++;
    }
  } else if (head.includes("weee_name")) {
    for (const r of rows) {
      if (!r["recipe_id"]) continue;
      map.set(`${r["recipe_id"]}:${r["line"]}`, {
        recipe_id: r["recipe_id"]!, line: r["line"] ?? "", raw: r["raw"] ?? "",
        head: r["parsed_head"] ?? r["head"] ?? "", weee_name: r["weee_name"] ?? "",
      });
      n++;
    }
  } else {
    throw new Error("unrecognised CSV — expected a 'verdict' or 'weee_name' column");
  }
  return n;
}

function main() {
  const files = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  if (!files.length) {
    console.error("usage: npm run weee-import -- <autosave.json | export.csv> …");
    process.exit(1);
  }
  loadExisting();
  const before = { v: vocab.size, m: map.size };

  for (const f of files) {
    const path = resolve(process.cwd(), f);
    if (!existsSync(path)) { console.error(`  missing: ${f}`); continue; }
    const text = readFileSync(path, "utf8");
    const n = path.endsWith(".json") ? takeAutosave(text) : takeCsv(text);
    console.log(`  ${f} — ${n} row(s)`);
  }

  mkdirSync(DEC, { recursive: true });
  writeFileSync(resolve(DEC, "weee-vocabulary.csv"), csv([
    ["id", "name", "verdict", "value", "note", "at"],
    ...[...vocab.values()].sort((a, b) => a.id.localeCompare(b.id))
      .map((v) => [v.id, v.name, v.verdict, v.value, v.note, v.at]),
  ]));
  writeFileSync(resolve(DEC, "weee-recipe-map.csv"), csv([
    ["recipe_id", "line", "raw", "head", "weee_name"],
    ...[...map.values()].sort((a, b) =>
      a.recipe_id.localeCompare(b.recipe_id) || Number(a.line) - Number(b.line))
      .map((m) => [m.recipe_id, m.line, m.raw, m.head, m.weee_name]),
  ]));

  console.log(`\nvocabulary decisions  ${before.v} → ${vocab.size}`);
  console.log(`recipe line mappings  ${before.m} → ${map.size}`);
  console.log(`\nwrote data/decisions/weee-vocabulary.csv and weee-recipe-map.csv`);
}

main();
