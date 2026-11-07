/**
 * The behavioural record — BEHAVIOR-SPEC §§2–4, ATTRIBUTION-SPEC §2.
 *
 * One append-only JSONL file. Not a database, on purpose: the asset is the
 * trajectory, and a log whose write path CANNOT update or delete a line is the
 * cheapest honest implementation of "append-only" there is. Current state
 * stays in `owners.json`; this file is never read to render anything.
 *
 * ── Why it never throws ────────────────────────────────────────────────────
 *
 * Same rule as `weee.ts`: instrumentation must never take a surface down. A
 * full disk loses an event; it must not lose a shopping trip. The one thing
 * worse than a gap in the record is a record that taught the product to fail.
 *
 * ── Why events are one line each ───────────────────────────────────────────
 *
 * `appendFileSync` on a POSIX filesystem writes small lines atomically under
 * O_APPEND, so concurrent server actions interleave whole lines rather than
 * corrupting each other. No lock, no tmp-rename — those are for files that
 * get rewritten, and this one never is.
 *
 * ── What never enters ──────────────────────────────────────────────────────
 *
 * Free-text ids (`txt_`) and their labels. BEHAVIOR-SPEC §6: canonical node
 * ids only, structurally — the caller cannot log what this module refuses.
 * "Prefer the input that carries only what we need" (ATTRIBUTION-SPEC §7b),
 * applied to ourselves.
 */
import {
  appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

const FILE = resolve(process.cwd(), "..", "data", "events", "events.jsonl");

/** The id left where a household used to be — see `forgetHousehold`. */
const TOMBSTONE = "own_deleted";

/** How a pantry line came to change — BEHAVIOR-SPEC §4, plus `cook`:
 *  `recordCook`'s additive marks and `settleCook`'s used-up removals are a
 *  distinct mechanism, neither typed by hand nor bought off the list. */
export type PantrySource = "manual" | "first_run" | "gap_resolution" | "import" | "cook";

export function appendEvent(kind: string, fields: Record<string, unknown>): void {
  try {
    const dir = dirname(FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(
      FILE,
      JSON.stringify({ kind, at: new Date().toISOString(), ...fields }) + "\n",
      "utf8",
    );
  } catch {
    /* an unrecorded event is a gap in the record; a thrown one is an outage */
  }
}

/**
 * This household's own rows — the export's half of "everything we hold".
 *
 * `/export` used to return the owner record alone, while `pantry_event` and
 * `cook_event` carried a `household` id into this file. The policy promises the
 * export is everything held against your browser; two stores means the export
 * reads two stores.
 *
 * Never throws, and returns `[]` on a missing or unreadable file: a download is
 * worth more than an error page, and an absent log is the ordinary state of a
 * fresh install rather than a fault.
 */
export function householdEvents(ownerId: string): unknown[] {
  try {
    if (!existsSync(FILE)) return [];
    const out: unknown[] = [];
    for (const line of readFileSync(FILE, "utf8").split("\n")) {
      if (!line) continue;
      try {
        const e = JSON.parse(line) as { household?: string };
        if (e.household === ownerId) out.push(e);
      } catch {
        /* one malformed line must not cost a person their export */
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Unlink a household from its trail — the erasure half of the same promise.
 *
 * ── Why this exists at all ─────────────────────────────────────────────────
 *
 * The privacy policy says closing an account deletes everything in your kitchen
 * and that *we keep no copy*. `store.deleteAccount` honoured that for
 * `owners.json` and nothing else, while this file went on holding
 * `{household: own_…, node_id, op}` rows describing the same kitchen. That is a
 * published sentence the code did not keep.
 *
 * ── Why it rewrites rather than deletes ────────────────────────────────────
 *
 * BEHAVIOR-SPEC §2 makes the trajectory the asset: how often a gap resolves to
 * a pantry add is a fact about the product, not about a person. Dropping the
 * rows would pay for one person's erasure with the whole record's shape. So the
 * identifier goes and the event stays — the row keeps its kind, its time and
 * its node, and stops being anybody's. Erasure by anonymisation, which is what
 * the promise actually requires: nothing that remains can be pointed back at a
 * browser we can no longer name.
 *
 * ── Why it may throw, when `appendEvent` never does ────────────────────────
 *
 * A dropped event is a gap in a record. A dropped erasure is a promise broken
 * silently, and the caller must be able to tell the difference — so this one
 * reports failure and `deleteAccount` runs it *before* it writes, so a person
 * is never told their data is gone while it is still here.
 *
 * Written tmp-then-rename, the same way `store.ts` writes: this is the one path
 * that rewrites the file, and a torn rewrite would take the log with it.
 */
export function forgetHousehold(ownerId: string): number {
  if (!existsSync(FILE)) return 0;

  const lines = readFileSync(FILE, "utf8").split("\n");
  let forgotten = 0;

  const kept = lines.map((line) => {
    if (!line) return line;
    let e: { household?: string };
    try {
      e = JSON.parse(line) as { household?: string };
    } catch {
      // Unparseable, therefore unmatchable: it cannot be shown to be this
      // household's, and rewriting what we cannot read would lose data to
      // tidiness. Left exactly as found.
      return line;
    }
    if (e.household !== ownerId) return line;
    forgotten += 1;
    return JSON.stringify({ ...e, household: TOMBSTONE });
  });

  const tmp = FILE + ".tmp";
  writeFileSync(tmp, kept.join("\n"), "utf8");
  renameSync(tmp, FILE);
  return forgotten;
}
