/**
 * The ingredient editor's writes — all of them decisions, none of them applied.
 *
 * An earlier version wrote alias and edge edits into the reviewed tables
 * directly, arguing that a human in the authenticated curation UI is the
 * review. Reversed by the reviewer's own call: **everything goes through a
 * decisions file**, one contract for every edit kind, applied offline by
 * `npm run apply-edits`. What that buys over the direct write:
 *
 *   - the app process never mutates the ontology under itself — the tables
 *     only change between builds, where a partial write costs a re-run
 *   - every edit is diffable history in git before it is a fact in a table
 *   - one consumer owns the invariants (edge exclusivity, rejected-edges,
 *     rename-vs-merge), instead of the app and the pipeline each holding half
 *
 * One file, `data/decisions/ontology-edits.csv`:
 *
 *   kind,subject,object,note,decided_at
 *
 *   alias-set            surface → node it means
 *   alias-drop           surface (object empty)
 *   is_a-add / -remove   child → parent
 *   derives_from-add / -remove   part → whole
 *   rename               old name → new name
 *   merge                node → the node it actually is; the subject stops
 *                        being a node, its name becomes an alias of the
 *                        target, and the build retires its id behind a
 *                        redirect (INGREDIENT-SPEC §1)
 *   promote              alias surface → the node it was an alias of; the
 *                        surface becomes a NODE and a child (is_a) of that
 *                        node. The danmuji case, as one action (2026-08-20)
 *
 * Append-only, last row wins per (kind-family, subject) — the reviewer's later
 * call replaces the earlier one, same as every decision file beside it.
 * INERT until `npm run apply-edits`; the pages that record these say so,
 * because a decision that silently changes nothing is the failure mode this
 * repo has already paid for once.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const FILE = resolve(process.cwd(), "..", "data", "decisions", "ontology-edits.csv");
const HEADER = ["kind", "subject", "object", "note", "decided_at"];

export type Relation = "is_a" | "derives_from";

export type EditKind =
  | "alias-set" | "alias-drop"
  | "is_a-add" | "is_a-remove"
  | "derives_from-add" | "derives_from-remove"
  | "rename"
  | "promote"
  | "merge"
  | "gloss"
  | "remove";

export type Edit = { kind: EditKind; subject: string; object: string; note: string };

/** Minimal RFC-4180-ish parser — same four lines as `unknowns.ts`, same reason. */
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

const q = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);

/**
 * Append one edit. Temp-file-and-rename, because this is the artifact that
 * costs human hours and cannot be regenerated.
 */
export function record(e: Edit): void {
  const subject = e.subject.trim().toLowerCase();
  const object = e.object.trim().toLowerCase();
  if (!subject) return;
  // An empty object is a real answer three times over: alias-drop and remove
  // have no target, and an empty gloss CLEARS one.
  if (!["alias-drop", "gloss", "remove"].includes(e.kind) && !object) return;
  if (subject === object) return;

  mkdirSync(dirname(FILE), { recursive: true });
  const prev = existsSync(FILE) ? readFileSync(FILE, "utf8") : HEADER.join(",") + "\n";
  const body = prev.endsWith("\n") || prev === "" ? prev : prev + "\n";
  const row = [e.kind, subject, object, e.note.trim(), new Date().toISOString()]
    .map(q).join(",") + "\n";
  const tmp = FILE + ".tmp";
  writeFileSync(tmp, body + row, "utf8");
  renameSync(tmp, FILE);
}

/**
 * Everything recorded and not yet applied, in append order.
 *
 * "Not yet applied" is approximated as "still in the file" — `apply-edits`
 * rewrites the file down to whatever it refused, so a present row is a pending
 * one. That is the consumer's contract, not a guess made here.
 */
export function pendingEdits(): Edit[] {
  if (!existsSync(FILE)) return [];
  return parseCsv(readFileSync(FILE, "utf8")).slice(1)
    .map((r) => ({
      kind: (r[0] ?? "") as EditKind,
      subject: r[1] ?? "",
      object: r[2] ?? "",
      note: r[3] ?? "",
    }))
    .filter((e) => e.kind && e.subject);
}

/** The pending edits that touch one node, by any of its names, for the editor page. */
export function pendingFor(names: string[]): Edit[] {
  const set = new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean));
  return pendingEdits().filter((e) => set.has(e.subject) || set.has(e.object));
}
