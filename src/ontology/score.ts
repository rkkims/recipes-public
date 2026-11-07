/**
 * Compare one review decision against the engine.
 *
 * Shared by the offline harness (agreement.ts) and the live review UI
 * (qc/server.ts) so the two can never drift. A row the UI marks as conflicting
 * must be the same row the harness counts as conflicting, or the number at the
 * bottom of the screen stops meaning anything.
 */
import { normalize, singular, type Vocabulary } from "./normalize.js";

export type Intent =
  | { kind: "target"; to: string }
  | { kind: "split"; into: string[] }
  | { kind: "parse-error" }
  | { kind: "comment"; text: string };

const SPLIT = /(?:should be )?split(?:ted)? into\s+(.+)|should be split:\s*(.+)/i;
const PARSE_ERROR = /\bpars(?:e|ing)\s+error\b|\binvestigate\b/i;
const COMMENTARY =
  /\b(?:adjective|servings?|staple|separate|universal|no such thing|subtle|opportunity|clarified|carefully)\b/i;

/**
 * What the reviewer meant by a note.
 *
 * Most notes are instructions ("garlic" means merge into garlic), but some are
 * diagnoses ("parse error") and a few are split requests. Reading a diagnosis as
 * a merge target invents a node called `parsing error`, so classification comes
 * before extraction.
 */
export function intentOf(note: string): Intent | null {
  const raw = note.trim();
  if (!raw) return null;

  const sm = SPLIT.exec(raw);
  if (sm) {
    const list = (sm[1] ?? sm[2] ?? "")
      .split(/\s*[\/,]\s*|\s+and\s+/).map((s) => s.trim()).filter(Boolean);
    if (list.length > 1) return { kind: "split", into: list };
  }
  // A parse-error note often ALSO names the right answer:
  // "parsing error - thai chili pepper". Prefer the answer when there is one.
  if (PARSE_ERROR.test(raw)) {
    const after = raw.split(/[-–—]|\.\s*/).map((s) => s.trim())
      .filter((s) => s && !PARSE_ERROR.test(s) && s.split(" ").length <= 4);
    if (after.length) return { kind: "target", to: after[after.length - 1]!.toLowerCase() };
    return { kind: "parse-error" };
  }
  if (COMMENTARY.test(raw)) return { kind: "comment", text: raw };

  let s = raw.toLowerCase();
  s = s.replace(/^(?:aliased?\s+with|alias\s+of|merge\s+(?:in)?to|same\s+as|should\s+be|it'?s)\s+/i, "");
  s = s.replace(/\([^)]*\)/g, " ").replace(/[."'’]+$/g, "").replace(/\s+/g, " ").trim();
  if (!s || s.split(/[.;]/).filter(Boolean).length > 1 || s.split(" ").length > 4)
    return { kind: "comment", text: raw };
  return { kind: "target", to: s };
}

export type Status =
  | "agree" | "agree-refined" | "conflict" | "engine-missed"
  | "parser" | "unscored" | "undecided";

export type Score = {
  status: Status;
  /** What the engine produced. */
  engine: string;
  /** What the reviewer asked for, when it could be read. */
  wanted: string;
  /** Why the engine said what it said. */
  why: string;
  /** Deliberate action (flag/reject) vs a pass (accept). */
  signal: "strong" | "weak";
  /**
   * Which tables produced this answer.
   *
   *   general    settled by cuisine-independent rules alone — carries forward
   *   exception  needed at least one hand-written semantic fact
   *   none       the engine left the string untouched
   */
  source: "general" | "exception" | "none";
};

/** Plural-insensitive: `chicken thighs` and `chicken thigh` are one node. */
const norm = (x: string) =>
  x.toLowerCase().replace(/\s+/g, " ").trim().split(" ").map(singular).join(" ");

export function score(
  input: string,
  decision: { verdict?: string; value?: string; note?: string } | undefined,
  vocab: Vocabulary,
): Score {
  const r = normalize(input, vocab);
  const engine = r.drop ? `(drop: ${r.drop})` : r.split ? r.split.join(" + ") : r.canonical;
  const why = r.trace.map((t) => t.why).filter(Boolean).join("; ") || (r.review ?? "");
  const signal = decision?.verdict === "accept" ? "weak" : "strong";
  const source = !r.trace.length ? "none"
    : r.trace.some((t) => t.kind === "exception") ? "exception"
    : "general";
  const base = { engine, why, signal, source } as const;

  if (!decision) return { ...base, status: "undecided", wanted: "" };

  // "not ingredient" is not a merge target. Scoring it as one asked the engine
  // to produce a node literally called `not ingredient`, and marked every
  // correct drop as a conflict.
  if (/\bnot (?:an? )?ingredient\b|\bcoloring is not\b/i.test(decision.note ?? ""))
    return { ...base, wanted: "(drop)",
             status: r.drop ? "agree" : "engine-missed" };

  const intent = intentOf(decision.note ?? "");
  let wanted: string;
  if (decision.verdict === "accept" && !intent) wanted = input;
  else if (intent?.kind === "target") wanted = intent.to;
  else if (intent?.kind === "split") wanted = intent.into.join(" + ");
  else if (intent?.kind === "parse-error") return { ...base, status: "parser", wanted: "" };
  else if (decision.verdict === "edit" || decision.verdict === "merge")
    wanted = decision.value ?? input;
  else return { ...base, status: "unscored", wanted: intent?.kind === "comment" ? intent.text : "" };

  if (norm(engine) === norm(wanted)) return { ...base, status: "agree", wanted };
  // A slot child is more specific than the bare slot name, not different from
  // it: the reviewer wrote `seaweed`, the engine writes `seaweed - nori/gim`.
  if (r.slot && (norm(engine).startsWith(norm(wanted) + " - ") || norm(engine).includes(norm(wanted))))
    return { ...base, status: "agree-refined", wanted };
  if (engine === input) return { ...base, status: "engine-missed", wanted };
  return { ...base, status: "conflict", wanted };
}
