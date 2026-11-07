/**
 * The alias table — surface form → known node.
 *
 * DATA, in data/ontology/aliases.csv, not code. This is the realm of semantics:
 * `anchovy sauce` is `aekjeot` and `asian chives` are `buchu` because of what
 * those things ARE, and no rule over English derives it. Rules generalise across
 * cuisines; aliases do not, and pretending otherwise by burying them in a
 * TypeScript literal made them invisible to review and impossible to grow.
 *
 * It lives in a reviewable file for the same reason the decisions do: it is the
 * artifact that costs human hours, and it is the one that must survive every
 * regeneration of everything else.
 *
 * The engine's job, given a new recipe, is to resolve every ingredient through
 * this table and leave behind ONLY the surfaces it has never seen. Those
 * leftovers are the review queue — and they should shrink toward nothing as the
 * table grows, which is the number `npm run resolve-corpus` reports.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const ALIAS_FILE = resolve(ROOT, "data/ontology/aliases.csv");

export type Alias = {
  surface: string;
  node: string;
  /** Where it came from: `review`, `native`, `learned`, `seed`. */
  source: string;
  note: string;
};

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

export function loadAliases(): Alias[] {
  if (!existsSync(ALIAS_FILE)) return [];
  const rows = parseCsv(readFileSync(ALIAS_FILE, "utf8"));
  const h = rows[0]!;
  return rows.slice(1).map((r) => {
    const o = Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""]));
    return {
      surface: (o["surface"] ?? "").toLowerCase().trim(),
      node: (o["node"] ?? "").trim(),
      source: o["source"] ?? "",
      note: o["note"] ?? "",
    };
  }).filter((a) => a.surface && a.node);
}

export function saveAliases(list: Alias[]): void {
  const q = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  const sorted = [...list].sort((a, b) => a.surface.localeCompare(b.surface));
  writeFileSync(ALIAS_FILE,
    [["surface", "node", "source", "note"],
     ...sorted.map((a) => [a.surface, a.node, a.source, a.note])]
      .map((r) => r.map(q).join(",")).join("\n") + "\n");
}
