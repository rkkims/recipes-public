/**
 * What to offer when an annotator types — QC-SPEC §2, §7.
 *
 * ── The bug this replaces ──────────────────────────────────────────────────
 *
 * Token overlap scored `whole onion` against `onion` and against the alias
 * surface `green onion` (which resolves to `scallion`) identically — one
 * shared token each — and then broke the tie on corpus frequency, where
 * `scallion` has 1,638 mentions to `onion`'s 1,097. So typing `whole onion`
 * offered scallion first. A frequency tiebreak on a tied score is a rule that
 * hands the answer to whichever ingredient is more popular.
 *
 * The fix is that those two matches are not tied. `onion` uses ALL of its own
 * words to match; `green onion` spends half its words on `green`, which the
 * query never said. Overlap counted only what was shared and was blind to
 * what the candidate brought along uninvited.
 *
 * ── Scoring ────────────────────────────────────────────────────────────────
 *
 * Both directions, combined as F1:
 *
 *   precision  matched / candidate's own tokens   — did the candidate say
 *              anything the annotator did not?
 *   recall     matched / query's tokens           — did it cover the query?
 *
 *     whole onion  vs  onion         p 1/1  r 1/2  → 0.67
 *     whole onion  vs  green onion   p 1/2  r 1/2  → 0.50
 *
 * Then a HEAD BONUS. In every ingredient phrase in this corpus the last word
 * carries the identity and the earlier words qualify it: `cracked black
 * pepper` is pepper, `dried shiitake mushroom` is mushroom. A candidate whose
 * last word agrees with the query's is talking about the same thing, and one
 * whose last word differs is usually not — `chicken stock` against `chicken`.
 *
 * Frequency still breaks ties, but only ties. It is a prior, not evidence —
 * and the frequency that counts is RECIPES, not ingredient lines: what an
 * annotator is likely to mean is what most dishes call for.
 *
 * ── Typing, not just pasting ───────────────────────────────────────────────
 *
 * A typeahead is asked to answer at `gochu`, which shares no whole token with
 * anything. The final query token is therefore also tried as a PREFIX, at
 * partial credit — enough to rank, not enough to beat a real word match.
 */
import { numberKey } from "./naming.js";

export type Candidate = {
  /** The node this resolves to — always a node, never an alias surface. */
  node: string;
  /** The text that matched. Differs from `node` when an alias fired. */
  surface: string;
  mentions: number;
  /**
   * How many RECIPES use this ingredient. The prior the ranking actually
   * wants, and not the same number as `mentions`, which counts ingredient
   * lines and double-counts a recipe naming something twice. Reviewer: the
   * suggestion should be based on how similar the strings are and how many
   * recipes are using it. Falls back to `mentions` where it is not supplied.
   */
  recipes?: number;
};

export type Hit = {
  node: string;
  /** Set when an alias matched, so the UI can say why. `null` for a node. */
  via: string | null;
  score: number;
  /** `exact` short-circuits scoring; the rest are ranked. */
  how: "alias" | "node" | "scored";
};

/** A candidate token counts as covered if the query says it, or begins it. */
const PREFIX_CREDIT = 0.6;
/** Agreement on the last word, which is the word that names the thing. */
const HEAD_BONUS = 0.35;

function score(queryKey: string, candKey: string): number {
  const q = queryKey.split(" ").filter(Boolean);
  const c = candKey.split(" ").filter(Boolean);
  if (!q.length || !c.length) return 0;

  /**
   * Sets on both sides, and the two numerators counted separately.
   *
   * Counting one number for both was a real bug: the node `garlic cloves
   * garlic` matched `fresh garlic` on two candidate tokens, and reusing that
   * count as the recall numerator claimed it had covered both query words when
   * it had covered one. A repeated word beat the plain node `garlic`.
   */
  const qSet = new Set(q);
  const cSet = new Set(c);
  const last = q[q.length - 1]!;


  let candidateCovered = 0;
  for (const t of cSet) {
    if (qSet.has(t)) candidateCovered += 1;
    else if (t.startsWith(last) && t !== last) candidateCovered += PREFIX_CREDIT;
  }

  let queryCovered = 0;
  for (const t of qSet) {
    if (cSet.has(t)) queryCovered += 1;
    else if (t === last && [...cSet].some((x) => x.startsWith(t))) queryCovered += PREFIX_CREDIT;
  }
  if (!candidateCovered || !queryCovered) return 0;

  const precision = candidateCovered / cSet.size;
  const recall = queryCovered / qSet.size;
  const f1 = (2 * precision * recall) / (precision + recall);

  const cLast = c[c.length - 1]!;
  const headAgrees = cLast === last || cLast.startsWith(last);
  return f1 + (headAgrees ? HEAD_BONUS : 0);
}

/**
 * Ranked suggestions, deduplicated BY NODE.
 *
 * A node reachable through three alias surfaces was offered three times,
 * identically, because the list was built over surfaces and displayed by
 * target — one answer wearing three hats, filling a short list. Only the
 * best-scoring surface for each node survives, and it is reported so the UI
 * can show which words actually matched.
 */
export function suggest(query: string, candidates: Candidate[], limit = 6): Hit[] {
  const key = numberKey(query ?? "");
  if (!key) return [];

  // An exact hit is an answer, not a suggestion. Aliases first: an alias is a
  // recorded decision, and a node name that collides with one is the older
  // accident.
  const exactAlias = candidates.find((c) => c.surface !== c.node && numberKey(c.surface) === key);
  if (exactAlias) return [{ node: exactAlias.node, via: exactAlias.surface, score: 1, how: "alias" }];
  const exactNode = candidates.find((c) => c.surface === c.node && numberKey(c.node) === key);
  if (exactNode) return [{ node: exactNode.node, via: null, score: 1, how: "node" }];

  const best = new Map<string, Hit & { mentions: number }>();
  for (const c of candidates) {
    const s = score(key, numberKey(c.surface));
    if (s <= 0) continue;
    const prev = best.get(c.node);
    if (prev && prev.score >= s) continue;
    best.set(c.node, {
      node: c.node,
      via: c.surface === c.node ? null : c.surface,
      score: s,
      how: "scored",
      mentions: c.recipes ?? c.mentions,
    });
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score || b.mentions - a.mentions || a.node.localeCompare(b.node))
    .slice(0, limit)
    .map(({ mentions: _m, ...h }) => h);
}
