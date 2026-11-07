/**
 * Bug reports, written where they are found.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * Dogfooding produces its findings at the worst possible moment: mid-tap, in a
 * kitchen, on a phone. The alternative to a button is a spreadsheet in another
 * app, which means the note gets written later or not at all — and the half
 * that gets lost is always the context, because "the chip thing was weird" is
 * what survives an hour and a page URL is not.
 *
 * So the button captures what the person cannot be expected to: the exact URL
 * including its query, the viewport, the user agent, the service worker version
 * and which owner was looking. The typing is left for the part only a human
 * has — what they expected to happen.
 *
 * ── JSONL, appended, never rewritten ─────────────────────────────────────
 *
 * One line per report, opened in append mode. `owners.json` is read-modify-write
 * and that is correct for state that changes; a log is not that. Appending means
 * two reports filed a second apart cannot lose each other, a half-written line
 * costs one report rather than the file, and reading it is `tail`.
 *
 * It lives beside `owners.json` in `data/app/`, which is gitignored — these are
 * notes about a running deployment, not source.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
/* Re-exported so server callers have one import, while the client dialog
   reads them from the fs-free module directly. */
export { REPORT_KINDS, type ReportKind } from "./report-kinds";
import type { ReportKind } from "./report-kinds";

const FILE = resolve(process.cwd(), "..", "data", "app", "reports.jsonl");

export type Report = {
  at: string;
  /** Which layer it is in — see `REPORT_KINDS`. Absent on reports filed before this existed. */
  kind?: ReportKind;
  /** What the person typed. The only field they are asked for. */
  what: string;
  /** Where they were, query and all — the field most often lost by hand. */
  url: string;
  /** Which kitchen, so a report can be reproduced against real state. */
  owner: string;
  /** Signed in, and as whom. Absent means anonymous. */
  email?: string;
  viewport?: string;
  ua?: string;
  /** The service worker version, which is the closest thing to a build id. */
  sw?: string;
  /** Set once it has been dealt with — see `resolveReport`. */
  done?: boolean;
};

export function addReport(r: Report): void {
  mkdirSync(dirname(FILE), { recursive: true });
  appendFileSync(FILE, JSON.stringify(r) + "\n", "utf8");
}

/**
 * Every report, newest first.
 *
 * A bad line is skipped rather than thrown on: this is a log read by a review
 * page, and one malformed entry must not be able to hide the other forty.
 */
export function allReports(): Report[] {
  if (!existsSync(FILE)) return [];
  const out: Report[] = [];
  for (const line of readFileSync(FILE, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line) as Report); } catch { /* skip the bad line */ }
  }
  return out.reverse();
}
