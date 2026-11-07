/**
 * Lines that must never gate a recipe match — QC-SPEC §7.
 *
 * `water` is the single largest unmatched head in the corpus at 2,033 lines,
 * roughly a third of everything that resolves to nothing. It is not an
 * ingredient anybody stocks, and annotating it one line at a time is two
 * thousand identical decisions. It needs a rule.
 *
 * ── What this is NOT ───────────────────────────────────────────────────────
 *
 * Not a delete, and not an ontology edit. Nothing here is removed from a
 * recipe or from the corpus — a recipe still says to add water, and the line
 * still renders. What changes is that the line does not COUNT against "can I
 * cook this tonight", because a pantry that lacks water is not a pantry.
 *
 * ── Precision over recall, deliberately inverted ───────────────────────────
 *
 * The standing instruction on the parser is recall over precision, because a
 * wrong parse is caught in review. This rule is the opposite: a wrongly
 * ignored line NEVER REACHES REVIEW. It disappears from the queue and stays
 * wrong forever. A wrongly kept line costs one keystroke.
 *
 * So the rule is narrow, and the traps are named and tested rather than hoped
 * about.
 *
 * ── Why the last word carries it ───────────────────────────────────────────
 *
 * The corpus makes this easy. `water chestnut`, `water spinach`, `water
 * dropwort` and `water parsley` are real vegetables whose FIRST word is
 * water; `ice cream` is a real ingredient whose first word is ice. Every one
 * of them ends in something else. Only a phrase ENDING in water or ice is a
 * candidate, which excludes all of them by construction rather than by a list
 * that could be missed.
 *
 * What the last word cannot settle is the modifier: `rice water`, `coconut
 * water`, `lye water`, `bean water` (aquafaba, already a node) and the
 * carbonated waters are ingredients that end in water and must survive. Those
 * are named in SOURCED, and the test asserts each one.
 */
import { numberKey } from "./naming.js";

/**
 * A modifier that names what the water was MADE FROM. The result is a
 * distinct ingredient a shop sells, so the phrase is not water in the sense
 * this rule means.
 *
 * `rice` is here because the repo already decided it: rice water is an
 * ingredient. `bean` is here because bean water is aquafaba, which is a
 * confirmed node with its own recipes.
 */
const SOURCED = new Set([
  "rice", "coconut", "lye", "bean", "barley", "ginger", "beet", "gardenia",
  "yeast", "tea", "corn", "lime", "lemon", "honey", "birch", "maple", "rose",
  // carbonated waters — a bottle, not a tap
  "sparkling", "mineral", "tonic", "soda", "seltzer", "carbonated", "artesian",
  "artisan", "spring", "coco",
]);

/**
 * A modifier naming what the water was COOKED IN. Not stocked either — it
 * only exists partway through the recipe that calls for it — but for a
 * different reason than tap water, and a reviewer should see which.
 */
const BY_PRODUCT = new Set([
  "pasta", "noodle", "starch", "mushroom", "shitake", "shiitake", "cooking",
  "soaking", "reserved", "residual", "saved", "rinse", "parboil", "blanching",
  "brine", "steeping",
]);

export type Verdict = { kind: "assumed" | "by-product"; why: string };

/**
 * `null` means "a real ingredient, treat it normally". Anything else means the
 * line should not count against a pantry match, with the reason to show.
 */
export function notStocked(head: string): Verdict | null {
  const key = numberKey(head ?? "");
  if (!key) return null;
  const tokens = key.split(" ");
  const last = tokens[tokens.length - 1]!;

  // `ice cube` in any arrangement — the only cube phrasing that is not food.
  const isIceCube = key.includes("ice cube") || key === "cube ice";
  if (last !== "water" && last !== "ice" && !isIceCube) return null;

  // A named source outranks everything: it is a product, not a tap.
  for (const t of tokens) {
    if (SOURCED.has(t)) return null;
  }

  for (const t of tokens) {
    if (BY_PRODUCT.has(t)) {
      return { kind: "by-product", why: `cooking liquid from ${t}, made during the recipe rather than stocked` };
    }
  }

  return {
    kind: "assumed",
    why: last === "ice" || isIceCube
      ? "ice — assumed present in any kitchen"
      : "water — assumed present in any kitchen",
  };
}
