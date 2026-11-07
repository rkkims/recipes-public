/**
 * The unknown-surface queue — the largest ingredient review left, and the one
 * that had no surface at all.
 *
 * `data/qc/unknown.csv` holds 1,956 strings the corpus produced and the ontology
 * could not place. It is the un-aliased pile: the thing that makes a recipe
 * render with a line nobody can match against.
 *
 * ── Why this is not in `npm run qc-ui` ────────────────────────────────────
 *
 * `src/qc/server.ts` puts `unknown` in its `REPORTS` set and refuses to review
 * it, for a good reason stated there: the file has **no `id` column**, so
 * decisions would be keyed to `undefined` and *"quietly corrupt the decisions
 * file."* That was the right call for a generic reviewer keyed on `id`.
 *
 * The fix is not to add an id to a generated report. **The surface IS the key** —
 * it is the raw string as the corpus produced it, it is stable across
 * regeneration in a way a row number is not, and two rows with the same surface
 * are the same fact. So this queue keys on the surface and writes decisions in
 * the same shape every other decision file uses.
 *
 * ── Ordering is blast radius, not alphabet ────────────────────────────────
 *
 * `mentions` is how many corpus lines carry the string. Deciding `gochugaru`
 * once fixes every recipe that calls for it; deciding a hapax fixes one. Same
 * discipline `src/qc/propose.ts` already states — *"sorted by corpus frequency
 * throughout, so a half-finished review still captures most of the value."*
 *
 * ── What a decision is worth ──────────────────────────────────────────────
 *
 * `alias` is the common case and the only one that feeds the engine directly:
 * `npm run learn` turns it into a row in `data/ontology/aliases.csv`, which is
 * the table the matcher reads. `new` and `reject` are recorded but deliberately
 * do not write the ontology — `INGREDIENT-SPEC` §1 reserves minting and
 * retirement for review, and `QC-SPEC`'s benchmark is the only path in.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const QUEUE = resolve(process.cwd(), "..", "data", "qc", "unknown.csv");
const FILE = resolve(process.cwd(), "..", "data", "decisions", "unknown.csv");

export type Verdict = "alias" | "new" | "reject" | "skip";

/** One row of the generated queue. */
export type Unknown = {
  surface: string;
  mentions: number;
  /** The string appeared in a recipe title — a stronger signal it is real food. */
  inTitle: boolean;
  headline: boolean;
  cuisines: string[];
  /** The line it came from, so the reviewer can see the context that produced it. */
  example: string;
};

export type Decision = {
  id: string;
  verdict: Verdict;
  /** The target node for `alias`, the proposed name for `new`. Empty otherwise. */
  value: string;
  note: string;
  decided_at: string;
};

/**
 * Minimal RFC-4180-ish parser, same shape as `src/qc/server.ts`'s.
 *
 * Duplicated rather than imported: `app/` is a nested package and cannot reach
 * `src/`. Four lines of parser is a cheaper dependency than a shared build.
 */
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

const toCsvCell = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);

function objects(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  const header = rows[0];
  if (!header) return [];
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

/** The generated queue, as written by `npm run propose`. Empty if not yet run. */
export function allUnknowns(): Unknown[] {
  if (!existsSync(QUEUE)) return [];
  return objects(readFileSync(QUEUE, "utf8"))
    .map((o) => ({
      surface: (o["surface"] ?? "").trim(),
      mentions: Number(o["mentions"] ?? 0) || 0,
      inTitle: (o["in_title"] ?? "") !== "",
      headline: (o["headline"] ?? "") !== "",
      cuisines: (o["cuisines"] ?? "").split("|").map((c) => c.trim()).filter(Boolean),
      example: (o["example"] ?? "").trim(),
    }))
    .filter((u) => u.surface !== "");
}

/**
 * Decisions so far, last write per surface winning.
 *
 * Same read posture as `src/qc/server.ts`: the file is append-only, and a
 * reviewer who changes their mind writes a second row rather than editing the
 * first. History is cheap and a rewritten CSV is not diffable.
 */
export function allDecisions(): Map<string, Decision> {
  const out = new Map<string, Decision>();
  if (!existsSync(FILE)) return out;
  for (const o of objects(readFileSync(FILE, "utf8"))) {
    const id = (o["id"] ?? "").trim();
    if (!id) continue;
    out.set(id, {
      id,
      verdict: (o["verdict"] ?? "skip") as Verdict,
      value: o["value"] ?? "",
      note: o["note"] ?? "",
      decided_at: o["decided_at"] ?? "",
    });
  }
  return out;
}

/**
 * The queue in working order: undecided first, heaviest first.
 *
 * `skip` is not a decision, it is a deferral — a skipped row returns, at the
 * back. Anything else is settled and drops out until the reviewer names it
 * again.
 */
export function queue(limit = 1): Unknown[] {
  const decided = allDecisions();
  const open = allUnknowns().filter((u) => {
    const d = decided.get(u.surface);
    return !d || d.verdict === "skip";
  });
  const fresh = open.filter((u) => !decided.has(u.surface));
  const skipped = open.filter((u) => decided.has(u.surface));
  const byWeight = (a: Unknown, b: Unknown) =>
    b.mentions - a.mentions || a.surface.localeCompare(b.surface);
  return [...fresh.sort(byWeight), ...skipped.sort(byWeight)].slice(0, limit);
}

/** How much of the corpus is still unaccounted for — the only progress number. */
export function progress(): { total: number; decided: number; lines: number; linesDone: number } {
  const decided = allDecisions();
  const all = allUnknowns();
  const settled = all.filter((u) => {
    const d = decided.get(u.surface);
    return d && d.verdict !== "skip";
  });
  return {
    total: all.length,
    decided: settled.length,
    lines: all.reduce((n, u) => n + u.mentions, 0),
    linesDone: settled.reduce((n, u) => n + u.mentions, 0),
  };
}

/**
 * Append one decision.
 *
 * Written through a temp file and renamed, because a half-written CSV is a
 * corrupt decisions file and this is the artifact that costs human hours and
 * cannot be regenerated — the same argument `src/qc/server.ts` makes for its
 * token.
 */
/**
 * Log a mis-parse, without deciding anything.
 *
 * The reviewer's ask (2026-08-14): when "as written" shows the parser mangled
 * the line — "for 2 servings" became a surface, "1 egg yolk" kept its
 * quantity — that fact should be RECORDED, not buried inside whatever verdict
 * the row gets. The verdict says what the surface is; this says the parser
 * should never have produced it. Appends (surface, example) to
 * `data/decisions/parse-errors.csv`, which is the parser's bug list — the
 * curation data is its test set, and this file is how the test set grows.
 * Measured before building it: ~39 of 1,956 queue rows are parse artifacts,
 * which is why this is a log and not a workflow.
 */
const PARSE_FILE = resolve(process.cwd(), "..", "data", "decisions", "parse-errors.csv");

export function logParseError(surface: string, example: string): void {
  mkdirSync(dirname(PARSE_FILE), { recursive: true });
  const header = "surface,example,noted_at\n";
  const prev = existsSync(PARSE_FILE) ? readFileSync(PARSE_FILE, "utf8") : header;
  if (prev.split("\n").some((l) => l.startsWith(toCsvCell(surface) + ","))) return; // once is a report
  const row = [surface, example, new Date().toISOString()].map(toCsvCell).join(",") + "\n";
  const tmp = PARSE_FILE + ".tmp";
  writeFileSync(tmp, (prev.endsWith("\n") ? prev : prev + "\n") + row, "utf8");
  renameSync(tmp, PARSE_FILE);
}

export function decide(d: Omit<Decision, "decided_at">): void {
  mkdirSync(dirname(FILE), { recursive: true });
  const header = "id,verdict,value,note,decided_at\n";
  const row = [d.id, d.verdict, d.value, d.note, new Date().toISOString()]
    .map((c) => toCsvCell(String(c ?? ""))).join(",") + "\n";
  const prev = existsSync(FILE) ? readFileSync(FILE, "utf8") : header;
  const body = prev.endsWith("\n") || prev === "" ? prev : prev + "\n";
  const tmp = FILE + ".tmp";
  writeFileSync(tmp, body + row, "utf8");
  renameSync(tmp, FILE);
}
