/**
 * Per-source line rules, derived from curated corrections.
 *
 * The general parser in `frequency.ts` is cuisine- and site-agnostic on purpose.
 * But a blog is a house style: one author, writing ingredient lines the same way
 * for fifteen years. That regularity is exploitable, and it is exactly the
 * regularity a general parser must not assume.
 *
 * So this file holds rules that are **only ever true of one site**, and every rule
 * cites the curated line that motivated it. The evidence is `data/curation`: the
 * reviewer flagged a line, wrote what it should have been, and that pair is the
 * specification. Nothing here was invented from imagination about how blogs are
 * written.
 *
 * Rules for adding a source:
 *   - a rule needs at least one curated correction behind it, quoted in a comment
 *   - it may DROP a line, REWRITE it, or HARVEST an alias — never resolve to a
 *     node. Identity is the ontology's job and stays there (DECISIONS §3)
 *   - it must be measurable. `npm run test-site-rules` scores this file against
 *     every curated correction and prints what it still misses
 *
 * A dropped line is not the same as an unresolved one, and the distinction is the
 * point of `reason`: "we know this is a colander" and "we could not read this"
 * look identical in the data today, so the curator is asked about equipment
 * forever. See RECIPE-SPEC §4b.
 */

import { headName } from "./frequency.js";

export type Drop = { kind: "drop"; reason: DropReason; raw: string };
export type Keep = {
  kind: "keep";
  /** The line the parser should see, after site-specific cleanup. */
  raw: string;
  /** Alias candidates harvested from the line. Proposals, never auto-promoted. */
  aliases: Array<{ surface: string; alias: string }>;
  /** Alternatives the author offered, including ones hidden inside parentheses. */
  alternates: string[];
};
export type LineVerdict = Drop | Keep;

export type DropReason =
  /** Equipment, packaging, vessels — needed to cook, never bought to eat. */
  | "equipment"
  /** A reference to another recipe on the same site, not an ingredient. */
  | "sub-recipe"
  /** A whole line of method that happens to sit in the ingredient list. */
  | "instruction"
  /** A serving or yield statement — "Makes about 40 dumplings", "(2 servings)". */
  | "yield"
  /** A section heading — "Optional vegetables:", "For the sauce:". */
  | "header";

// ─────────────────────────────────────────────────────────────────────────────
// Shared shapes. Generic enough to reuse, kept here because only site rules use
// them and a second source will want to reshape rather than inherit.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vessels and tools. A line that reduces to nothing BUT these is equipment.
 *
 * Reducing first is what makes this safe. Matching the bare word would kill
 * "1 pot of rice" and "hot pot broth"; requiring the whole line to be equipment
 * cannot, because those lines have a food noun left over.
 */
const EQUIPMENT_NOUN =
  /^(?:container|containers|jar|jars|bowl|bowls|pot|pots|colander|colanders|strainer|sieve|glove|gloves|cheesecloth|steamer|basket|skewer|skewers|towel|towels|tray|mold|mould|thermometer|blender|grinder|press|wrap|foil|paper|toothpick|toothpicks|twine|mat|rack|lid|weight|plate)$/;

/** Words that may accompany equipment without making it food. */
const EQUIPMENT_MODIFIER =
  /^(?:a|an|the|or|and|of|airtight|air-tight|kitchen|disposable|rubber|latex|fine|fine-mesh|mesh|wire|glass|plastic|ceramic|stainless|steel|nonstick|non-stick|large|larger|small|medium|big|deep|shallow|wide|clean|dry|heavy|sturdy|bamboo|wooden|metal|silicone|parchment|wax|aluminum|aluminium|cotton|sushi|rolling|cutting|gallon|gallons|quart|quarts|liter|liters|litre|litres|cup|cups|inch|inches|cm|qt|to)$/;

/** Quantity-ish tokens that carry no identity, for the equipment reduction. */
const NUMERIC = /^[\d/.,\-–—¼½¾⅓⅔⅛⅜⅝⅞x×]+$/;

/**
 * Does the line, once vessels and sizes are removed, contain nothing else?
 *
 * Curated evidence — the reviewer wrote "not ingredient" on every one of these:
 *   "a 3/4 - 1 gallon airtight container or jar"
 *   "a large bowl or pot (7 - 8 quarts)"
 *   "a large colander"
 *   "kitchen gloves"
 *   "1/2 gallon airtight container or jar."
 */
function isEquipmentLine(raw: string): boolean {
  const body = raw
    .replace(/\([^)]*\)/g, " ")     // "(7 - 8 quarts)" is a size, not a food
    .replace(/[.;:*]/g, " ")
    .toLowerCase();
  const words = body.split(/[\s,]+/).filter(Boolean);
  if (!words.length) return false;
  let sawEquipment = false;
  for (const w of words) {
    if (EQUIPMENT_NOUN.test(w)) { sawEquipment = true; continue; }
    if (EQUIPMENT_MODIFIER.test(w) || NUMERIC.test(w)) continue;
    return false;                    // a word that is neither → real ingredient
  }
  return sawEquipment;
}

/**
 * Hangul. The single most reliable signal on a Korean recipe site: a parenthetical
 * containing it is a gloss of the word before it, never a quantity or a note.
 */
const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;

/** Parentheticals that are plainly not glosses. */
const NOT_A_GLOSS =
  /^(?:or\b|about\b|optional\b|see\b|plus\b|use\b|reduce\b|thawed\b|soaked\b|more\b|less\b|for\b|to\b|if\b|either\b|\d)/i;
/** Prose inside a parenthetical: a definition or an instruction, not a name. */
const GLOSS_PROSE = /\b(?:made with|made from|which|that|until|then|and then|per|each|thin|finely|so that|available)\b/i;

/**
 * The author naming a second name explicitly: "(some may be labeled as jjajang)".
 *
 * Handled before the prose test, because the sentence around the alias would
 * otherwise disqualify it — and the alias is the whole content of the sentence.
 *
 * Curated evidence:
 *   "5 tablespoons Chunjang (춘장), Korean black bean paste (some may be labeled
 *    as jjajang (짜장))"                          → "aliased as chunjang and jjajang"
 */
const ALIAS_INTRODUCER =
  /\b(?:labell?ed|called|known|sold|marketed)\s+as\s+(.+)$/i;

/** Adjectives inside a gloss that are not part of the name: "(premade tempura batter mix)". */
const GLOSS_ADJECTIVE =
  /^(?:pre-?made|premade|prepared|store-?bought|instant|packaged|bottled|canned|dried|fresh)\s+/i;

/**
 * A parenthetical that passes every shape test and still is not a name.
 *
 * Measured, not guessed: the first version of the harvest returned 447 candidates
 * whose most frequent entries were `thinly sliced` (30), `adjust to taste` (20),
 * `roughly chopped` (19), `etc.` (19) and `white` (8). Bare modifiers and meta
 * phrases fit "at most three words, no digits" perfectly.
 *
 * Two filters do the work: this list for meta phrases and bare modifiers, and
 * `headName` for anything that reduces to nothing once processing words are
 * stripped — which is what kills `thinly sliced` without naming it here.
 */
const NOT_A_NAME =
  /^(?:etc\.?|adjust(?:ed)?(?:\s+to\s+taste)?|to\s+taste|or\s+more|as\s+desired|any|both|each|total|divided|packed|thin|thick|small|medium|large|white|black|red|green|yellow|brown|light|dark|hot|mild|sweet|sour|raw|whole|halved|room\s+temperature)$/i;

// ─────────────────────────────────────────────────────────────────────────────
// koreanbapsang. 22 recipes curated, 53 lines corrected — the evidence base.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Names this site uses that the reviewer mapped to something else.
 *
 * PROPOSALS, not rewrites — and the distinction is the line this file must not
 * cross. A rule that rewrites `gim nori` to `gim` looks like parsing and is
 * actually an identity decision: it asserts the two are one pantry item. That
 * belongs to the ontology and its review step (§7), not to a regex keyed on one
 * observation, which is how a site layer turns into a pile of overfitted
 * substitutions that nobody can audit.
 *
 * So these are emitted as alias candidates and change nothing until reviewed.
 * Curated evidence, left → right is the reviewer's own wording:
 *   "4 ounces fresh shiitaki mushrooms"                → "shiitake mushrooms"
 *   "4 tablespoons myeolchiaekjeot (fish sauce …)"      → "myeolchi aekjeot"
 *   "1/2 sheet gim nori, cut into thin strips"          → "gim"
 *   "1/2 package of instant curry roux (…)"             → "instant curry"
 *   "1 cup Korean coarse sea salt for making kimchi"    → "coarse salt"
 *
 * The general parser handles the SYNTAX on these lines already (the unit, the
 * purpose clause, the bracket). What is left is a naming question, and naming
 * questions have one home.
 */
export const NAME_PROPOSALS: Array<{ alias: string; canonical: string }> = [
  { alias: "myeolchiaekjeot", canonical: "myeolchi aekjeot" },
  { alias: "shiitaki", canonical: "shiitake" },
  { alias: "gim nori", canonical: "gim" },
  { alias: "instant curry roux", canonical: "instant curry" },
  { alias: "korean coarse sea salt", canonical: "coarse salt" },
];

/**
 * Leading "part of" constructions. This author names the part before the plant.
 *
 * Curated evidence:
 *   "2 - 3  white parts of large scallions"                    → "scallions"
 *   "tender inner parts of 1 napa cabbage, salted (…)"         → "nappa cabage" [sic]
 *
 * The general parser cannot reach these: PART_OF_PHRASE covers zest/juice/peel,
 * and the quantity sits after the part word, so the prefix stripper never fires.
 */
const PART_OF_PREFIX =
  /^\s*(?:\d[\d\s/.\-–]*)?(?:tender\s+|inner\s+|outer\s+|white\s+|green\s+|light\s+|dark\s+|top\s+|bottom\s+)*(?:parts?|caps?|tips?|ends?)\s+of\s+/i;

/**
 * A bare part word used as a unit: "4 caps white mushrooms".
 *
 * Curated evidence:
 *   "4  caps white mushrooms - optional"                       → "white mushrooms"
 * Only strips when a noun follows, so a line that IS about caps survives.
 */
const PART_AS_UNIT = /^\s*(?:\d[\d\s/.\-–]*)?(?:caps?|parts?|tips?)\s+(?=\S)/i;

/**
 * Temperature theatre. "Boiling hot water" is water; "steaming hot kabocha" is
 * kabocha. The general NOISE list has `warm` and `hot` handled elsewhere but not
 * this doubled form, which this author uses constantly in the tteok recipes.
 *
 * Curated evidence — the reviewer wrote "staple" on the water lines, which is
 * only reachable once `boiling hot water` reduces to `water` (UNIVERSAL):
 *   "4 tablespoons boiling hot water (more as needed…)"        → "staple"
 *   "5 to 6 tablespoons boiling hot water (…)"                 → "staple"
 *   "1 tablespoon plus 1 or 2 teaspoons boiling hot water"     → "staple"
 *   "⅓ cup cooked steaming hot kabocha, (danhobak, 단호박) (…)" → "kabocha …"
 */
const HOT_THEATRE = /\b(?:boiling|steaming|piping|scalding)\s+hot\b/gi;

/**
 * A second quantity glued to the first: "1 tablespoon plus 1 or 2 teaspoons X".
 *
 * The general STRIP_PREFIX handles `plus` as a join but not a `plus N or N unit`
 * run, and the leftover digits then took the "or" branch and destroyed the head.
 *
 * Curated evidence:
 *   "1 tablespoon plus 1 or 2 teaspoons boiling hot water"          → "staple"
 *   "4 tablespoons plus 1 or 2 teaspoons boiling hot blueberry juice"
 *                                                                  → "blueberry juice"
 */
const PLUS_QUANTITY =
  /\bplus\s+\d+[\d\s/.\-–]*(?:or\s+\d+[\d\s/.\-–]*)?(?:teaspoons?|tablespoons?|tsp|tbsp|cups?|ounces?|oz|pounds?|lbs?|grams?|g|ml|liters?)\b/gi;

/**
 * An alternative *count* for the same ingredient: "4 to 5 pounds or about 15 …".
 *
 * Curated evidence:
 *   "4 to 5 pounds or about 15 small to medium young radishes with leaves (chonggak mu, 총각무)"
 *                                                                  → "young radish"
 * Parsed today as the head `to young radishes with` — three separate failures on
 * one line, which is why this line drove three of the rules here.
 */
const OR_ABOUT_COUNT = /\s+or\s+about\s+\d+[\d\s/.\-–]*/gi;

/** "small to medium", "medium to large" — one size, written as a range. */
const SIZE_RANGE =
  /\b(?:small|medium|large|extra[\s-]large|baby)\s+to\s+(?:small|medium|large|extra[\s-]large)\b/gi;

/**
 * Purpose and portioning clauses this author appends. The general PURPOSE regex
 * covers frying/garnish/serving; these are the ones it misses.
 *
 * Curated evidence:
 *   "1/4 cup all-purpose flour for dredging"                   → "all-purpose flour"
 *   "canola or corn oil for pan frying"                        → "oil"
 *   "1 cup Korean coarse sea salt for making kimchi (…)"       → "coarse salt"
 *   "2 cups wet rice powder per batch (about 16 songpyeon)"    → "wet rice powder"
 */
const TRAILING_PURPOSE =
  /[, ]+(?:for\s+(?:dredging|dusting|pan[\s-]frying|shallow[\s-]frying|stir[\s-]frying|making\s+\w+|the\s+\w+|wrapping|rolling|steaming|boiling|seasoning|marinating)|per\s+batch|per\s+serving|if\s+needed)\b.*$/i;

/**
 * Botanical extras that are not part of the name.
 *
 * Curated evidence:
 *   "4 to 5 pounds or about 15 … young radishes with leaves (…)" → "young radish"
 */
const WITH_LEAVES = /[, ]+with\s+(?:its\s+)?(?:leaves|leaf|stems|tops|greens)\b.*$/i;

/**
 * Quality adjectives this author favours, which the general NOISE list omits
 * because they are rare elsewhere.
 *
 * Curated evidence:
 *   "7 - 8  plump garlic cloves"                               → "garlic"
 *   "8 ounces lean tender beef, cut into thin strips (…)"      → "beef"
 *   "4 ounces lean beef"                                       → "beef"
 *   "3 tablespoons of assorted nuts (…)"                       → "nuts"
 *   "4 strips pre-cut pickled radish (danmuji, 단무지) strips…" → "pickled radish"
 *   "1 cup twiguim garu (premade tempura batter mix*)"         → alias only
 */
const SITE_ADJECTIVE =
  /(?<![\w-])(?:plump|tender|lean|assorted|pre-?cut|pre-?made|premade|pre-?soaked|good[\s-]quality|top[\s-]quality)(?![\w-])/gi;

/**
 * A trailing repeat of the unit after a parenthetical: "… radish (danmuji) strips,
 * white or yellow". The unit already appeared at the front of the line.
 *
 * Curated evidence:
 *   "4 strips pre-cut pickled radish (danmuji, 단무지) strips, white or yellow"
 *                                                                → "pickled radish"
 */
const TRAILING_UNIT_REPEAT =
  /[, ]+(?:strips?|slices?|pieces?|sheets?|cubes?)\b\s*(?:,.*)?$/i;

/**
 * The site's cross-reference to another of its own recipes.
 *
 * Curated evidence:
 *   "Radish salad, musaengchae - See recipe."                  → "not ingredient. it's separate recipe."
 */
const SUB_RECIPE = /[-–—]\s*see\s+(?:the\s+)?recipe\b|\bsee\s+recipe\s*\.?\s*$/i;

/**
 * A whole line of method, parenthesised.
 *
 * Curated evidence:
 *   "(Dissolve 1/2 cup coarse salt in 4 cups of water, and soak the cabbage
 *     leaves until softened, 2 to 4 hours. Rinse and drain well.)"
 *                                                              → "salt"
 *
 * NOTE, and it is a known miss: the reviewer wanted `salt` out of this line. We
 * drop it instead. Mining nouns out of prose is precisely what the general
 * parser's prose guard exists to prevent, and the cost here is nil — the line
 * above it already carries the cabbage, and salt is a staple. Recorded rather
 * than quietly scored as a pass.
 */
const PARENTHESISED_INSTRUCTION = /^\s*\(.*\)\s*$/s;

/**
 * Alternatives hidden inside parentheses.
 *
 * The general `alternatives()` strips every parenthetical BEFORE looking for
 * "or", so on this site it finds almost nothing: the author's alternatives are
 * nearly always bracketed, and sometimes double-bracketed.
 *
 * Curated evidence — every one of these is a reviewer "subs:" note:
 *   "1 teaspoon rice wine ((or mirin))"                        → "subs: mirin"
 *   "1 tablespoon rice wine (or mirin)"                        → "subs: mirin"
 *   "8 ounces lean tender beef … ((or bulgogi meat or ground beef))"
 *   "2  kirby cucumbers (or 1 long variety cucumber)"          → "subs: cucumbers"
 *   "3  dried shiitake mushrooms (soaked (or 3 ounces fresh shiitake))"
 *   "1.5 to 2.5 pounds fresh white fish fillets (haddock, tilapia, cod, or flounder)"
 *   "3 - 4  green chili peppers (or 1 green bell pepper, julienned)"
 *   "6 ounces minari (water dropwort (or 1/2 green bell pepper or a few green chili peppers))"
 *
 * This is very likely a general bug rather than a site quirk. It is scoped here
 * until the same measurement has been run on a second source — see the report at
 * the bottom of `site-rules.test.ts`.
 */
/**
 * Every parenthetical group, including nested ones, with its own nesting stripped.
 *
 * `matchAll(/\(([^()]*)\)/g)` only sees the INNERMOST group, and this author
 * nests constantly: "6 ounces minari (water dropwort (or 1/2 green bell
 * pepper…))" hid the gloss `water dropwort` behind an inner bracket, so the
 * alias was never harvested. One scan, a depth counter, and each group is
 * reported both whole and shorn of its children.
 */
function parentheticals(raw: string): string[] {
  const out: string[] = [];
  const opens: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === "(") opens.push(i);
    else if (raw[i] === ")" && opens.length) {
      const start = opens.pop()!;
      const body = raw.slice(start + 1, i);
      out.push(body);
      // The same group with its children removed — that is where a gloss sits
      // when the author appended an alternative after it.
      const shorn = body.replace(/\([^()]*\)/g, " ").trim();
      if (shorn && shorn !== body.trim()) out.push(shorn);
    }
  }
  return out;
}

/**
 * Units the author repeats inside a bracketed alternative: "(or 3 ounces fresh
 * shiitake)".
 *
 * The trailing `\b\s+` is load-bearing. Without it the `g` alternative matched
 * the first letter of "green bell pepper" and offered `reen bell pepper` as a
 * substitution — a unit list applied without a word boundary will always find a
 * one-letter unit inside a real word.
 */
const BRACKET_UNIT =
  /^\s*(?:(?:a|an|about|approximately)\b\s+)?[\d/.\s\-–]*\s*(?:(?:teaspoons?|tablespoons?|tsp|tbsp|cups?|ounces?|oz|pounds?|lbs?|grams?|g|kg|ml|liters?|litres?|cloves?|sheets?|strips?|slices?|pieces?|packages?|cans?|bunch(?:es)?|heads?|stalks?|sprigs?|large|small|medium|long)\b\s+)?(?:variety\b\s+)?/i;

function parentheticalAlternates(raw: string): string[] {
  const out: string[] = [];
  for (const body of parentheticals(raw)) {
    const inner = body.trim();
    if (!inner) continue;
    // "(or X)" / "(or X or Y)" — an explicit offer.
    const orForm = /^or\s+(.+)$/i.exec(inner);
    if (orForm) { out.push(...orForm[1]!.split(/\s+or\s+/i)); continue; }
    // "(A, B, C, or D)" — a list of interchangeable options, which only counts
    // when the LAST item is introduced by "or". A comma list without it is a
    // description ("small and thin").
    if (/,/.test(inner) && /,\s*or\s+/i.test(inner)) {
      out.push(...inner.split(/,\s*(?:or\s+)?/i));
      continue;
    }
  }
  return out
    // Strip the quantity AND unit the author repeats inside the bracket: "1 long
    // variety cucumber", "3 ounces fresh shiitake". The general parser finishes
    // the job; this only has to stop a count or a unit becoming part of a name.
    .map((s) => s.replace(BRACKET_UNIT, "").trim())
    .filter((s) => s.length > 2 && !/^(?:more|less|to taste|as needed|canned|fresh)$/i.test(s))
    .filter((s, i, a) => a.indexOf(s) === i);
}

/**
 * "A or B <noun>" and "A/B <noun>" written INLINE, outside any bracket.
 *
 * The noun belongs to both sides, so the right-hand alternative is only an
 * ingredient once it borrows it: `corn` is not a substitute for potato starch,
 * `corn starch` is. `frequency.ts` already distributes the noun for the HEAD
 * (via MODIFIER_ONLY and the corpus vocabulary), but nothing harvests the
 * alternative, so the author's substitution was silently dropped.
 *
 * Curated evidence:
 *   "1 tablespoon potato or corn starch (…)"                    → "subs: corn starch"
 *   "3 to 4 servings fresh jajangmyeon/udon noodles (…)"        → "subs: udon noodle"
 *   "1/2 cup warm kabocha or pumpkin puree (…)"                 → "subs: pumpkin puree"
 *   "canola or corn oil for pan frying"                         → "oil"
 *
 * Head-safe by construction: it only ever ADDS an alternative and never rewrites
 * the line, so a head the pipeline already resolves cannot regress.
 */
function inlineOrAlternates(raw: string): string[] {
  // Outside brackets only — bracketed forms are `parentheticalAlternates`' job.
  const body = raw.replace(/\([^()]*\)/g, " ");
  const out: string[] = [];
  // "<left> or|/ <right> <noun>", where the noun is the last word of the phrase.
  const m = /([a-z][a-z-]*)\s*(?:\s+or\s+|\s*\/\s*)([a-z][a-z-]*)\s+([a-z][a-z-]*)/i.exec(body);
  if (m) {
    const [, , right, noun] = m;
    // A trailing participle is not the shared noun: "green chili peppers
    // (julienned)" would offer `chili julienned`.
    if (!/(?:ed|ing)$/i.test(noun!)) out.push(`${right} ${noun}`);
  }
  return out;
}

/**
 * Korean glosses → alias candidates. The reason this file is worth writing.
 *
 * This author consistently writes `English name (romanization, 한글)`. That is a
 * hand-authored alias table by a native cook, published on 249 pages, free.
 * `extractors.ts` says the same thing about Maangchi's glossary slugs; this is
 * the same asset in a different shape, and it does not need a bespoke HTML
 * extractor to reach because the gloss survives into the JSON-LD string.
 *
 * Curated evidence — every one is a reviewer "aliased as" note:
 *   "10 ounces garlic scapes (maneuljjong)"                    → "aliased as maneuljjong"
 *   "4 strips pre-cut pickled radish (danmuji, 단무지) strips…" → "pickled radish aliased as danmuji"
 *   "5 tablespoons Chunjang (춘장), Korean black bean paste (some may be labeled as jjajang (짜장))"
 *                                                              → "aliased as chunjang and jjajang"
 *   "⅓ cup cooked steaming hot kabocha, (danhobak, 단호박) (…)" → "kabocha aliased as danhobak"
 *   "2 teaspoons hot mustard powder (gyeoja, 겨자) (…)"          → "subs: hot mustard"
 *   "6 ounces minari (water dropwort (…))"                     → "aliased as water dropwort…"
 *   "1 cup twiguim garu (premade tempura batter mix*)"         → "aliased as tempura mix…"
 *
 * Proposals only. An alias is a claim about identity and goes through review
 * (§7) — this function never writes the ontology.
 */
function glosses(raw: string): string[] {
  const out: string[] = [];
  for (const body of parentheticals(raw)) {
    let inner = body.trim().replace(/\*+$/, "");
    if (!inner) continue;
    // "…labeled as jjajang" — the alias is what follows, and the sentence around
    // it would fail the prose test, so this runs first.
    const introduced = ALIAS_INTRODUCER.exec(inner);
    if (introduced) inner = introduced[1]!.replace(/\([^)]*\)/g, " ").trim();
    else if (NOT_A_GLOSS.test(inner) || GLOSS_PROSE.test(inner)) continue;
    for (const part of inner.split(/\s*,\s*/)) {
      const p = part.trim().replace(GLOSS_ADJECTIVE, "");
      if (!p) continue;
      // Hangul is self-evidently a gloss at any length — it cannot be one of our
      // own processing words, and it is the highest-value half of this harvest.
      if (HANGUL.test(p)) { out.push(p); continue; }
      // Latin text has to look like a NAME: at most three words, no digits, not a
      // meta phrase, and something left after the general parser strips
      // processing words ("thinly sliced" reduces to nothing and is not a name).
      const words = p.split(/\s+/);
      if (words.length <= 3 && !/\d/.test(p) && !NOT_A_NAME.test(p) && headName(p))
        out.push(p);
    }
  }
  return out.filter((s, i, a) => a.indexOf(s) === i);
}

function koreanbapsang(raw: string): LineVerdict {
  if (isEquipmentLine(raw)) return { kind: "drop", reason: "equipment", raw };
  if (SUB_RECIPE.test(raw)) return { kind: "drop", reason: "sub-recipe", raw };
  if (PARENTHESISED_INSTRUCTION.test(raw))
    return { kind: "drop", reason: "instruction", raw };

  // Harvest BEFORE rewriting, because rewriting removes the parentheses the
  // aliases and alternatives live in.
  const aliases = glosses(raw).map((alias) => ({ surface: raw, alias }));
  const alternates = [...parentheticalAlternates(raw), ...inlineOrAlternates(raw)]
    .filter((s, i, a) => a.indexOf(s) === i);

  // Syntax only. Every rule below removes a construction; none renames anything.
  let s = raw
    .replace(PLUS_QUANTITY, " ")
    .replace(OR_ABOUT_COUNT, " ")
    .replace(HOT_THEATRE, " ")
    .replace(SIZE_RANGE, " ")
    .replace(SITE_ADJECTIVE, " ")
    .replace(WITH_LEAVES, " ")
    .replace(TRAILING_PURPOSE, " ")
    .replace(TRAILING_UNIT_REPEAT, " ");
  s = s.replace(PART_OF_PREFIX, " ").replace(PART_AS_UNIT, " ");
  // NO general "to" collapse here. An earlier version dropped an orphaned range
  // connector by removing any " to " not preceded by a digit, and it rewrote
  // "salt to taste" as "salt taste" — 21 lines across 9 sources gained a
  // nonsense requirement. SIZE_RANGE already removes the connector along with
  // both of its size words, which is the only case that needed it.
  s = s.replace(/\s{2,}/g, " ").replace(/^[\s,;]+|[\s,;]+$/g, "");

  return { kind: "keep", raw: s || raw, aliases, alternates };
}

/**
 * The registry. Keyed by `sourceId`, the same key `EXTRACTORS` uses.
 *
 * A source with no entry gets the general parser untouched, which is the correct
 * default: a site-specific rule is a liability until someone has curated enough
 * of that site to know its house style.
 */
// ─────────────────────────────────────────────────────────────────────────────
// hirokoliston. The house style is NAME FIRST, quantity after — the reverse of
// every other source — and the general parser only strips LEADING quantities.
// Measured on the 2026-08-20 crawl: 11,658 of the site's lines failed, nearly
// all in one of three shapes (probe evidence, quoted verbatim):
//
//   "Soy Sauce 2 tablespoons"                        → head "soy sauce 2"
//   "Salt 1/4 teaspoon"                              → head "salt 1 4"
//   "Ginger 1 to 2 teaspoons *grated OR thinly …"    → trailing *note
//   "Shredded Cabbage as required"                   → hedge, not a quantity
//
// Three REWRITES, no drops and no resolving — identity stays the ontology's.
// ─────────────────────────────────────────────────────────────────────────────

/** A trailing quantity in the name-first style: amount, range, unit, size note. */
const HL_TRAILING_QTY = new RegExp(
  String.raw`[\s,]+(?:about\s+|approx\.?\s+)?\d[\d\s/.,\-–—]*(?:to\s+\d[\d/.]*)?` +
  String.raw`\s*(?:g|kg|ml|l|cm|litres?|liters?|teaspoons?|tablespoons?|tbsp|tsp|cups?|` +
  String.raw`bunch(?:es)?|cloves?|punnets?|pieces?|pcs?|sheets?|cans?|sticks?|stalks?|` +
  String.raw`leaves?|slices?|servings?|blocks?|packets?|bags?|handfuls?|pinch(?:es)?)?\s*$`,
  "i",
);

function hirokolistonRule(raw: string): LineVerdict {
  // Alternates BEFORE rewriting — "OR any cucumbers" lives in the text the
  // rewrite is about to remove.
  const alternates = [...parentheticalAlternates(raw), ...inlineOrAlternates(raw)]
    .filter((s, i, a) => a.indexOf(s) === i);

  let s = raw;
  // "*grated OR thinly sliced into strips" — a processing note, not identity.
  s = s.replace(/\s\*.*$/, " ");
  s = s.replace(/\s+as\s+(?:required|needed)\b/gi, " ");
  // The trailing quantity, twice: "1 medium *about 300g" leaves a second
  // layer once the *note is gone.
  s = s.replace(HL_TRAILING_QTY, " ").replace(HL_TRAILING_QTY, " ");
  s = s.replace(/\s{2,}/g, " ").replace(/^[\s,;]+|[\s,;]+$/g, "");

  return { kind: "keep", raw: s || raw, aliases: [], alternates };
}

export const SITE_RULES: Record<string, (raw: string) => LineVerdict> = {
  koreanbapsang,
  hirokoliston: hirokolistonRule,
};

// ─────────────────────────────────────────────────────────────────────────────
// Junk shapes every source shares. Not house style — a yield statement or a
// section heading looks the same on eight blogs — so they run before any site
// rule, in the one path every caller takes. Evidence, per this file's own rule,
// from the machine-draft-flagged lines of 2026-08-18 (data/curation/drafts.json),
// which named these shapes across at least five sources:
//
//   "Makes 7 to 9 about 3-inch fritters"   (koreanbapsang)  → yield
//   "Makes about 40 dumplings"             (koreanbapsang)  → yield
//   "Makes 3 gyeran-ppang"                 (maangchi)       → yield
//   "(2 servings)" / "(Serves 2 to 4)"     (mykoreankitchen)→ yield
//   "(makes 2 sandwiches):"                (kimchimari)     → yield
//   "Optional vegetables:"                 (koreanbapsang)  → header, parsed as 'oil'
//   "*A premade batter mix can be found…"  (koreanbapsang)  → footnote prose
// ─────────────────────────────────────────────────────────────────────────────

/** The whole line is a yield/serving statement. Anchored to the start: no real
    ingredient line begins with these verbs, parenthesised or not. */
const YIELD_LINE = /^\s*\(?\s*(makes|yields?|serves)\b/i;
/** "(2 servings)", "(4 servings):", "for 2 servings" — count-first and
    for-prefixed variants of the same thing. */
const SERVINGS_ONLY = /^\s*(?:\(\s*\d[^)]*servings?\s*\)|for\s+\d+\s+servings?)\s*:?\s*$/i;
/** A section heading: the line ends in a colon. Headings label the list; an
    ingredient ending in ":" does not occur in the flagged corpus. */
const SECTION_HEADER = /:\s*$/;
/**
 * A section heading with the colon forgotten — a bare dish-part word.
 *
 * "Sauce" alone was resolving as a required ingredient in 256 recipes (the
 * curator's flag on a salmon rice bowl, 2026-08-20). A CLOSED list, never
 * "any single capitalised word": "Salt" and "Sesame seeds" are real one-word
 * ingredient lines and must survive. Covers numbered headers ("3. Sauce"),
 * "For the sauce", and pairs ("Sauce & Topping"); every word here labels a
 * part of the dish and names nothing anyone can buy.
 */
const HEADER_WORD = "(?:sauce|soup|dressing|filling|marinade|batter|topping|garnish|seasoning|base)s?";
const BARE_HEADER = new RegExp(
  `^\\s*(?:\\d+[.)]\\s*)?(?:for\\s+the\\s+)?${HEADER_WORD}(?:\\s*(?:[&+]|and)\\s*${HEADER_WORD})?\\s*$`, "i");
/** A starred footnote — prose that wandered into the ingredient list. */
const FOOTNOTE = /^\s*\*/;

function junk(raw: string): Drop | null {
  if (YIELD_LINE.test(raw) || SERVINGS_ONLY.test(raw))
    return { kind: "drop", reason: "yield", raw };
  if (FOOTNOTE.test(raw)) return { kind: "drop", reason: "instruction", raw };
  // "chicken meatballs ((see ingredients above))" — the line points back at
  // the recipe's own sub-section, whose components are already listed. The
  // curator's Chanko Nabe flag (2026-08-20); not an ingredient hole.
  if (/\bsee (?:the )?(?:ingredients? )?above\b/i.test(raw))
    return { kind: "drop", reason: "sub-recipe", raw };
  if (SECTION_HEADER.test(raw) || BARE_HEADER.test(raw))
    return { kind: "drop", reason: "header", raw };
  return null;
}

/** The general path, for sources with no rules — one shape for every caller. */
export function applySiteRules(sourceId: string | undefined, raw: string): LineVerdict {
  const j = junk(raw);
  if (j) return j;
  const rule = sourceId ? SITE_RULES[sourceId] : undefined;
  return rule ? rule(raw) : { kind: "keep", raw, aliases: [], alternates: [] };
}
