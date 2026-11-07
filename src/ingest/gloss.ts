/**
 * Parenthetical gloss narrowing — the author's own answer to an ambiguous head.
 *
 * "1 oz dried seaweed (miyeok)" resolves, by head, to the GENERIC `dried
 * seaweed` — and the answer to which species was sitting in the parentheses
 * the whole time. Recipe authors gloss constantly: "(gim / nori)", "(Wakame)",
 * "(haidai, 海带)". Reading the gloss is not guessing; it is reading the line.
 *
 * The rule is deliberately narrow, because parentheses also hold quantities,
 * prep notes and SUBSTITUTIONS, and a substitution read as identity would
 * rewrite what the dish needs:
 *
 *   - a group that opens with an alternative marker ("or …", "use …",
 *     "such as …", "e.g. …") is not a gloss and is skipped whole, and so is
 *     any group containing "etc" — that word IS the author saying "this is a
 *     list of options"
 *   - a group only counts when everything it names agrees on ONE node.
 *     "(mirim or mirin)" is one thing spelled twice; "(white, brown, or cane
 *     sugar)" names three, and a list of options must never be read as
 *     identity. In an or/and group EVERY option has to resolve — "(regular
 *     thin soy sauce or light soy sauce)" offers a choice we can only half
 *     read, and half-read is not read
 *   - the agreed node must be an IS-A DESCENDANT of what the head resolved
 *     to — an author can narrow "dried seaweed" to wakame, but "(or
 *     sriracha)" beside gochujang names a sibling, and a sibling never
 *     passes the descent gate
 *
 * The descent gate is the real safety: everything else is just refusing to
 * decide lines that offer choices.
 */

/** Every parenthetical group's content, innermost first. */
export function parenGroups(raw: string): string[] {
  const out: string[] = [];
  let s = raw;
  for (let guard = 0; guard < 20; guard++) {
    const m = s.match(/\(([^()]*)\)/);
    if (!m) break;
    if (m[1]!.trim()) out.push(m[1]!.trim());
    s = s.slice(0, m.index!) + " " + s.slice(m.index! + m[0].length);
  }
  return out;
}

/**
 * An alternative, not a gloss. "or" alone is enough — "(or use Wakame)" means
 * the generic ALSO works, and narrowing would wrongly demand the specific.
 */
const ALTERNATIVE = /^(?:or\b|use\b|sub\b|substitute|such as\b|e\.?g\b|alternatively\b|optional\b|if\b|plus\b|for\b|recommend\w*\b|prefer\w*\b|i like\b|we like\b|ideally\b)/i;

/** A group ruling something OUT is the opposite of naming it. */
const EXCLUSION = /\b(?:except|instead of|avoid|without|rather than|other than)\b/i;

/** Words that are notes about handling, never about identity. */
const NOTE_TOKEN = /[\d¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]|\b(?:optional|divided|note|taste|serving|sliced|chopped|cut|minced|grated|soaked|about|approx|roughly|preferably|typically|packed|more|less|extra|needed|desired)\b/i;

/** One group's split pieces: all of them, and the identity candidates. */
export function glossGroups(raw: string):
  Array<{ pieces: string[]; tokens: string[]; enumerates: boolean }> {
  const out: Array<{ pieces: string[]; tokens: string[]; enumerates: boolean }> = [];
  for (const g of parenGroups(raw)) {
    if (ALTERNATIVE.test(g) || EXCLUSION.test(g) || /\betc\b/i.test(g)) continue;
    const pieces: string[] = [];
    const tokens: string[] = [];
    for (const t of g.split(/[,;/·*]|\s+(?:or|and)\s+|\s+aka\s+|\balso known as\b/i)) {
      const tok = t.trim().replace(/^['"‘’]+|['"‘’]+$/g, "");
      if (!tok) continue;
      pieces.push(tok);
      if (tok.split(/\s+/).length > 4 || NOTE_TOKEN.test(tok)) continue;
      tokens.push(tok);
    }
    if (tokens.length) out.push({ pieces, tokens, enumerates: /\s(?:or|and)\s/i.test(g) });
  }
  return out;
}

/** Flat view of every candidate token — kept for tests and tooling. */
export function glossTokens(raw: string): string[] {
  return glossGroups(raw).flatMap((g) => g.tokens);
}

/** Does `id` sit strictly below `ancestor` in is_a? Cycle-guarded walk. */
function descends(id: string, ancestor: string, parentsOf: (id: string) => string[]): boolean {
  const seen = new Set<string>();
  const stack = [...parentsOf(id)];
  while (stack.length) {
    const p = stack.pop()!;
    if (p === ancestor) return true;
    if (seen.has(p)) continue;
    seen.add(p);
    stack.push(...parentsOf(p));
  }
  return false;
}

/**
 * The node this line's gloss narrows `nodeId` to, or null.
 *
 * `resolveToken` runs a candidate through the SAME resolution engine as every
 * ingredient line — identity stays the ontology's, exactly as the LLM overlay's
 * names do (NORMALIZATION, "The LLM extraction overlay").
 */
export function narrowByGloss(
  raw: string,
  nodeId: string,
  resolveToken: (t: string) => string | null,
  parentsOf: (id: string) => string[],
): string | null {
  // "e.g." anywhere on the line marks it as a list of options, parens or not.
  if (/\be\.?g\b/i.test(raw)) return null;
  const cands = new Set<string>();
  for (const g of glossGroups(raw)) {
    // An or/and group is a CHOICE unless every piece — prefixes, notes and
    // all — reads as the same one thing. "(mirim or mirin)" narrows;
    // "(I like to use avocado or coconut oil)" must not.
    const ids = (g.enumerates ? g.pieces : g.tokens).map(resolveToken);
    const agreed = [...new Set(ids.filter((x): x is string => !!x))];
    if (agreed.length !== 1) continue;            // several things, or none
    if (g.enumerates && ids.some((x) => !x)) continue;  // a choice we can only half read
    cands.add(agreed[0]!);
  }
  cands.delete(nodeId);
  const desc = [...cands].filter((id) => descends(id, nodeId, parentsOf));
  return desc.length === 1 ? desc[0]! : null;
}
