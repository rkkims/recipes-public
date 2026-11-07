/**
 * Apply the curate UI's recorded edits to the ontology tables.
 *
 *   npm run apply-edits -- --dry    # show what would change
 *   npm run apply-edits             # rewrite the tables
 *
 * Two inputs, one pass:
 *
 *   data/decisions/ontology-edits.csv   the editor — aliases, edges, renames
 *   data/decisions/unknown.csv          the queue — its `alias` verdicts are
 *                                       alias-sets by another name; `new` and
 *                                       `reject` are reported and left alone,
 *                                       because minting and retiring nodes is
 *                                       reserved for the promote path
 *                                       (INGREDIENT-SPEC §1)
 *
 * The app records and never applies: the tables only change here, between
 * builds, where a partial write costs a re-run instead of an inconsistent
 * ontology under a running server. This consumer owns the invariants —
 * `is_a`/`derives_from` exclusivity, the rejected-edges log that stops
 * proposers re-offering a removed edge, and rename-versus-merge.
 *
 * Order: aliases and edges in append order (the reviewer's later call wins),
 * renames last, so an edit recorded before a rename still names the node it
 * was made against.
 *
 * ontology-edits.csv is rewritten down to the rows that were REFUSED — that is
 * the contract `pendingEdits()` in the app reads ("a present row is a pending
 * one"), and it is what keeps the file from growing forever. unknown.csv is
 * the queue's own record and is never rewritten here; re-applying its alias
 * rows is a no-op because every operation below converges.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ONT = resolve(ROOT, "data/ontology");
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

const q = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
const save = (file: string, rows: string[][]) => {
  const tmp = file + ".tmp";
  writeFileSync(tmp, rows.map((r) => r.map(q).join(",")).join("\n") + "\n", "utf8");
  renameSync(tmp, file);
};
const read = (file: string, header: string[]): string[][] =>
  existsSync(file) ? parseCsv(readFileSync(file, "utf8")) : [header];

type Edit = { kind: string; subject: string; object: string; note: string; decided_at: string };

/* ── gather the edits ─────────────────────────────────────────────────── */

const EDITS_FILE = resolve(DEC, "ontology-edits.csv");
const edits: Edit[] = read(EDITS_FILE, ["kind", "subject", "object", "note", "decided_at"])
  .slice(1)
  .map((r) => ({
    kind: r[0] ?? "", subject: (r[1] ?? "").toLowerCase().trim(),
    object: (r[2] ?? "").toLowerCase().trim(), note: r[3] ?? "", decided_at: r[4] ?? "",
  }))
  .filter((e) => e.kind && e.subject);

/** The queue's alias verdicts, translated. Last row per surface wins. */
const unknownFile = resolve(DEC, "unknown.csv");
const queueAliases = new Map<string, { object: string; note: string }>();
let queueNew = 0, queueReject = 0;
for (const r of read(unknownFile, ["id", "verdict", "value", "note", "decided_at"]).slice(1)) {
  const surface = (r[0] ?? "").toLowerCase().trim();
  const verdict = r[1] ?? "";
  if (!surface) continue;
  if (verdict === "alias" && r[2]) queueAliases.set(surface, { object: (r[2] ?? "").toLowerCase().trim(), note: r[3] ?? "" });
  else if (verdict === "new") { queueAliases.delete(surface); queueNew++; }
  else if (verdict === "reject") { queueAliases.delete(surface); queueReject++; }
}
for (const [surface, { object, note }] of queueAliases)
  edits.push({ kind: "alias-set", subject: surface, object, note, decided_at: "" });

if (edits.length === 0) {
  console.log("nothing recorded — nothing to do");
  process.exit(0);
}

/* ── load the tables ──────────────────────────────────────────────────── */

const nodesFile = resolve(ONT, "nodes.csv");
const nodes = parseCsv(readFileSync(nodesFile, "utf8"));
const nodeNames = new Set(nodes.slice(1).map((r) => (r[0] ?? "").toLowerCase()));

const aliasFile = resolve(ONT, "aliases.csv");
const aliases = read(aliasFile, ["surface", "node", "source", "note"]);

const isaFile = resolve(ONT, "is_a.csv");
const isa = read(isaFile, ["child", "parent", "source", "note"]);
const dfFile = resolve(ONT, "derives_from.csv");
const df = read(dfFile, ["part", "whole", "source", "note"]);

const rejFile = resolve(DEC, "rejected-edges.csv");
const rej = read(rejFile, ["child", "parent", "note"]);

const glossFile = resolve(ONT, "glosses.csv");
const glosses = read(glossFile, ["node", "gloss"]);

/* ── apply, in order, renames last ────────────────────────────────────── */

const refused: Edit[] = [];
const why = (e: Edit, reason: string) => {
  refused.push(e);
  console.log(`  refused ${e.kind} "${e.subject}" → "${e.object}": ${reason}`);
};
let applied = 0;

const edgeTable = (kind: string) => (kind.startsWith("is_a") ? isa : df);
const otherTable = (kind: string) => (kind.startsWith("is_a") ? df : isa);

for (const e of edits.filter((e) => e.kind !== "rename")) {
  switch (e.kind) {
    case "alias-set": {
      if (!nodeNames.has(e.object)) { why(e, "target is not a node — promote it first"); continue; }
      const hit = aliases.findIndex((r, i) => i > 0 && (r[0] ?? "").toLowerCase() === e.subject);
      const row = [e.subject, e.object, "review", e.note || "curate UI"];
      if (hit > 0) aliases[hit] = row; else aliases.push(row);
      applied++;
      break;
    }
    case "alias-drop": {
      const before = aliases.length;
      for (let i = aliases.length - 1; i > 0; i--)
        if ((aliases[i]![0] ?? "").toLowerCase() === e.subject) aliases.splice(i, 1);
      if (aliases.length !== before) applied++;
      break;
    }
    case "merge": {
      // The inverse of promote: the subject node folds into the target. Its
      // name and aliases become the target's aliases, its edge rows retarget
      // (dropping self-loops and duplicates), its nodes.csv row leaves — and
      // the build then retires its id behind a redirect, because the name
      // resolves through the new alias (the same mechanism every hand merge
      // has used).
      if (!nodeNames.has(e.subject)) { applied++; break; }    // converged
      if (!nodeNames.has(e.object)) { why(e, "target is not a node"); continue; }
      for (const r of aliases.slice(1))
        if ((r[1] ?? "").toLowerCase() === e.subject) r[1] = e.object;
      aliases.push([e.subject, e.object, "review", e.note || "merged in curate UI"]);
      for (const table of [isa, df]) {
        for (const r of table.slice(1)) {
          if ((r[0] ?? "").toLowerCase() === e.subject) r[0] = e.object;
          if ((r[1] ?? "").toLowerCase() === e.subject) r[1] = e.object;
        }
        for (let i = table.length - 1; i > 0; i--) {
          const r = table[i]!;
          if (r[0] === r[1]) { table.splice(i, 1); continue; }
          if (table.findIndex((x, j) => j > 0 && j < i && x[0] === r[0] && x[1] === r[1]) > 0)
            table.splice(i, 1);
        }
      }
      for (let i = nodes.length - 1; i > 0; i--)
        if ((nodes[i]![0] ?? "").toLowerCase() === e.subject) nodes.splice(i, 1);
      nodeNames.delete(e.subject);
      // The retiree's gloss goes with it — the target keeps its own.
      for (let i = glosses.length - 1; i > 0; i--)
        if ((glosses[i]![0] ?? "").toLowerCase() === e.subject) glosses.splice(i, 1);
      applied++;
      break;
    }
    case "promote": {
      // The danmuji case as one action: an alias surface becomes a node of
      // its own, standing is_a under the node it was an alias of. This is
      // the promote path the header reserves — minting stays HERE, between
      // builds, never in the app (INGREDIENT-SPEC §1).
      if (nodeNames.has(e.subject)) { applied++; break; }     // converged
      if (!nodeNames.has(e.object)) { why(e, "parent is not a node"); continue; }
      for (let i = aliases.length - 1; i > 0; i--)
        if ((aliases[i]![0] ?? "").toLowerCase() === e.subject) aliases.splice(i, 1);
      nodes.push([e.subject, "0", "confirmed", "", e.note || "promoted in curate UI"]);
      nodeNames.add(e.subject);
      if (!isa.some((r, i) => i > 0 && r[0] === e.subject && r[1] === e.object))
        isa.push([e.subject, e.object, "review", e.note || "promoted in curate UI"]);
      applied++;
      break;
    }
    case "remove": {
      // The node should not exist — equipment, a parse artifact — and unlike
      // merge there is no survivor: its aliases die with it (nothing left for
      // them to mean), its edges and gloss go, and the build retires its id.
      // Lines that resolved here go back to unresolved, which is the honest
      // state for a thing that was never an ingredient.
      if (!nodeNames.has(e.subject)) { applied++; break; }    // converged
      for (let i = aliases.length - 1; i > 0; i--)
        if ((aliases[i]![0] ?? "").toLowerCase() === e.subject
          || (aliases[i]![1] ?? "").toLowerCase() === e.subject) aliases.splice(i, 1);
      for (const table of [isa, df])
        for (let i = table.length - 1; i > 0; i--)
          if ((table[i]![0] ?? "").toLowerCase() === e.subject
            || (table[i]![1] ?? "").toLowerCase() === e.subject) table.splice(i, 1);
      for (let i = glosses.length - 1; i > 0; i--)
        if ((glosses[i]![0] ?? "").toLowerCase() === e.subject) glosses.splice(i, 1);
      for (let i = nodes.length - 1; i > 0; i--)
        if ((nodes[i]![0] ?? "").toLowerCase() === e.subject) nodes.splice(i, 1);
      nodeNames.delete(e.subject);
      applied++;
      break;
    }
    case "gloss": {
      // Display and search only (build.ts loads this table beside the node).
      // Upsert by node name; an empty object clears the row — "no gloss" is
      // a curator's answer, not a missing one.
      if (!nodeNames.has(e.subject)) { why(e, "not a node"); continue; }
      for (let i = glosses.length - 1; i > 0; i--)
        if ((glosses[i]![0] ?? "").toLowerCase() === e.subject) glosses.splice(i, 1);
      if (e.object) glosses.push([e.subject, e.object]);
      applied++;
      break;
    }
    case "is_a-add":
    case "derives_from-add": {
      if (!nodeNames.has(e.subject)) { why(e, "child is not a node"); continue; }
      if (!nodeNames.has(e.object)) { why(e, "parent is not a node"); continue; }
      const table = edgeTable(e.kind), other = otherTable(e.kind);
      if (!table.some((r, i) => i > 0 && r[0] === e.subject && r[1] === e.object))
        table.push([e.subject, e.object, "review", e.note || "curate UI"]);
      // is_a and derives_from are different claims and must not both hold —
      // holding the whole would silently satisfy a recipe wanting the part.
      for (let i = other.length - 1; i > 0; i--)
        if (other[i]![0] === e.subject && other[i]![1] === e.object) other.splice(i, 1);
      applied++;
      break;
    }
    case "is_a-remove":
    case "derives_from-remove": {
      const table = edgeTable(e.kind);
      const before = table.length;
      for (let i = table.length - 1; i > 0; i--)
        if (table[i]![0] === e.subject && table[i]![1] === e.object) table.splice(i, 1);
      if (table.length !== before) {
        // Remembered, or the proposers re-offer the same edge next run.
        if (!rej.some((r, i) => i > 0 && r[0] === e.subject && r[1] === e.object))
          rej.push([e.subject, e.object, e.note || "removed in curate UI"]);
      }
      applied++;
      break;
    }
    default:
      why(e, `unknown kind`);
  }
}

/* Renames last. Refuse merges: collapsing two nodes changes identity, and
   INGREDIENT-SPEC §1 reserves identity changes for review. */
const renames = new Map<string, Edit>();
for (const e of edits.filter((e) => e.kind === "rename")) renames.set(e.subject, e);

const doing = new Map<string, string>();
for (const e of renames.values()) {
  if (!nodeNames.has(e.subject)) {
    if (nodeNames.has(e.object)) { applied++; continue; }   // already applied
    why(e, "old name not in nodes.csv");
    continue;
  }
  if (nodeNames.has(e.object)) { why(e, "target already a node — that is a merge, reserved for review"); continue; }
  doing.set(e.subject, e.object);
}

if (doing.size) {
  const ren = (s: string | undefined) => doing.get((s ?? "").toLowerCase()) ?? s ?? "";
  for (const r of nodes.slice(1)) if (doing.has((r[0] ?? "").toLowerCase())) { r[0] = ren(r[0]); applied++; }
  const keptAliases = [aliases[0]!];
  const surfaces = new Set(aliases.slice(1).map((r) => (r[0] ?? "").toLowerCase()));
  for (const r of aliases.slice(1)) {
    r[1] = ren(r[1]);
    // A surface equal to its node's new name is not an alias, it is the name.
    if ((r[0] ?? "").toLowerCase() === (r[1] ?? "").toLowerCase()) continue;
    keptAliases.push(r);
  }
  // The old name becomes an alias, or the corpus stops matching (WEEE-SPEC §10).
  for (const [oldName, newName] of doing)
    if (!surfaces.has(oldName)) keptAliases.push([oldName, newName, "review", "renamed in curate UI"]);
  aliases.length = 0; aliases.push(...keptAliases);
  for (const table of [isa, df])
    for (const r of table.slice(1)) { r[0] = ren(r[0]); r[1] = ren(r[1]); }
  // The gloss follows the name it explains.
  for (const r of glosses.slice(1)) r[0] = ren(r[0]);
  for (const [o, n] of doing) console.log(`  rename ${o} → ${n}`);
}

/* ── report and write ─────────────────────────────────────────────────── */

console.log(`\n${applied} edit(s) applied, ${refused.length} refused`);
if (queueNew || queueReject)
  console.log(`  queue verdicts left for the promote path: ${queueNew} new, ${queueReject} reject`);

if (DRY) { console.log("\n(dry run — nothing written)"); process.exit(0); }

save(nodesFile, nodes);
save(aliasFile, aliases);
save(isaFile, isa);
save(dfFile, df);
save(rejFile, rej);
save(glossFile, glosses);

/* The contract with pendingEdits(): what remains in the file is what was
   refused. Everything applied is history now, and git holds history. */
const header = ["kind", "subject", "object", "note", "decided_at"];
save(EDITS_FILE, [header, ...refused.map((e) => [e.kind, e.subject, e.object, e.note, e.decided_at])]);

console.log(`\nwrote the ontology tables — run npm run build-ontology next`);
if (refused.length) process.exit(1);
