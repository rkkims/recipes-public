/**
 * Singular or plural — the display-name rule (NORMALIZATION.md, "Number").
 *
 *   > Singular, unless the catalogue never uses the singular.
 *
 * Applied to the DISPLAY name only. The node string stays exactly as it is,
 * because `identity.csv` keys ids to it — renaming a node would mint a new id
 * and orphan every pantry row pointing at the old one, which is the migration
 * INGREDIENT-SPEC §1 exists to prevent. §1 also makes this safe: `display_name`
 * is "freely editable. May change."
 *
 * ── Why the exception list is not a table ──────────────────────────────────
 *
 * Some things are only ever handled in the aggregate — `pine nuts`, `peas`,
 * `sesame seeds` — and "pine nut" reads like a mistake. That is a real class,
 * and the tempting fix is a hand-kept list of them.
 *
 * The catalogue already answers it. A thing sold only in the aggregate has zero
 * singular SKUs: `pine nuts` is 0 singular against 16 plural, while `bay leaf`
 * is 12 against 0 and `egg` 3 against 0. So the exception is DERIVED, and it
 * stays true as the catalogue changes rather than drifting from it.
 *
 * The support floor is what stops one oddly-named product from inventing an
 * exception. `peas` rests on a single plural SKU, which is not enough to
 * override the rule.
 */
import { existsSync, readFileSync } from "node:fs";
import { KEEP_PLURAL, singular } from "./normalize.js";

/** Plural SKUs required before "the catalogue never says singular" means anything. */
export const AGGREGATE_MIN_SUPPORT = 3;

const parseCsv = (text: string): string[][] => {
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
};

/**
 * Number-insensitive key — the same one the alias table and typeahead use.
 *
 * KEEP_PLURAL words must be number-insensitive HERE too. `singular()` leaves
 * both `chives` and `chive` untouched — the first by the guard, the second
 * because there is nothing to strip — which handed the pair two different keys,
 * and a pair with two keys can never merge or match. So in the KEY the bare
 * singular canonicalises UP to the protected plural. Keys only: display names
 * are `displayNameFor`'s decision, and `singular()` keeps its meaning.
 */
const keyToken = (t: string) => {
  const s = singular(t);
  return s === t && KEEP_PLURAL.has(t + "s") ? t + "s" : s;
};
export const numberKey = (s: string) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    .split(" ").filter(Boolean).map(keyToken).join(" ");

const isPlural = (name: string) => {
  const toks = name.trim().split(/\s+/);
  const last = toks[toks.length - 1] ?? "";
  return singular(last) !== last;
};

/** Make the last word singular, leaving the rest alone. */
export const toSingular = (name: string) => {
  const toks = name.trim().split(/\s+/);
  if (!toks.length) return name;
  toks[toks.length - 1] = singular(toks[toks.length - 1]!);
  return toks.join(" ");
};

/**
 * Keys the catalogue only ever writes in the plural, with real support behind
 * it. Absent catalogue → empty set, and the rule degrades to plain "singular"
 * rather than to nothing: a missing optional file must not silently change what
 * every name looks like.
 */
export function aggregateKeys(vocabularyCsv: string): Set<string> {
  const out = new Set<string>();
  if (!existsSync(vocabularyCsv)) return out;
  let rows: string[][];
  try { rows = parseCsv(readFileSync(vocabularyCsv, "utf8")); } catch { return out; }
  const head = rows[0];
  if (!head) return out;
  const iName = head.indexOf("name"), iSupport = head.indexOf("sku_support");
  if (iName < 0) return out;

  const tally = new Map<string, { sing: number; plur: number }>();
  for (const r of rows.slice(1)) {
    const name = r[iName] ?? "";
    const k = numberKey(name);
    if (!k) continue;
    const support = iSupport >= 0 ? Number(r[iSupport] || 0) || 1 : 1;
    const t = tally.get(k) ?? { sing: 0, plur: 0 };
    if (isPlural(name)) t.plur += support; else t.sing += support;
    tally.set(k, t);
  }
  for (const [k, t] of tally) {
    if (t.sing === 0 && t.plur >= AGGREGATE_MIN_SUPPORT) out.add(k);
  }
  return out;
}

/**
 * The name to show. Sentence case is applied by the caller.
 *
 * Returns the node string unchanged when it is already right, so a caller can
 * cheaply tell whether anything moved.
 */
export function displayNameFor(node: string, aggregates: Set<string>): string {
  if (!isPlural(node)) return node;
  if (aggregates.has(numberKey(node))) return node;   // only ever sold in the aggregate
  return toSingular(node);
}
