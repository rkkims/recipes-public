/**
 * Ingredient frequency report — the artifact that sets the ontology's scope.
 *
 * DECISIONS §3 (corpus-first): the node list comes FROM the corpus. Frequency-
 * sort the raw strings, define nodes to ~95% coverage, stop. This report is
 * meant to be read by a human and hand-curated, not consumed programmatically.
 *
 * It deliberately does NOT try to be a parser. `ingredient-parser-nlp` exists
 * for that (SOCIAL-INGEST §5); this only strips quantities well enough to group
 * strings so the head of the distribution is legible.
 *
 * Reminder from measurement: quantities appear as `3T` / `1t` / `1/2T` as often
 * as `tbsp`/`tsp`. A units regex that only matches spelled-out forms scores a
 * real recipe line as having no quantity at all.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RawRecipe } from "./normalize.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RAW_DIR = resolve(ROOT, "data/raw");
const OUT_DIR = resolve(ROOT, "data/reports");

/**
 * Longest-first, and every use site must append `\b`.
 *
 * Both matter. Regex alternation is left-to-right, so a single-letter unit
 * placed before its spelled-out form wins and eats the first letter of the
 * word: with the `i` flag, `T` matched the leading "t" of "teaspoon" and
 * produced `easpoon sesame oil`; `c` did the same to `cloves` → `loves garlic`.
 * Sorting by length fixes the ordering, and `\b` makes single letters match
 * only as whole tokens (`3T`, `2 c`) — which is the real guard.
 */
const UNITS = [
  "tablespoons?", "teaspoons?", "milliliters?", "packages?", "bottles?",
  "pinch(?:es)?", "dash(?:es)?", "handfuls?", "cupfuls?", "bunch(?:es)?", "inch(?:es)?",
  "ounces?", "pounds?", "grams?", "liters?", "quarts?", "sprigs?", "slices?",
  "pieces?", "sheets?", "sticks?", "cloves?", "stalks?", "heads?", "boxes",
  "pints?", "tbsps?", "cans?", "pkgs?", "jars?", "bags?", "cups?", "tsps?",
  "tbs", "tbsn", "tspn", "box", "lbs?", "oz", "ml", "kg",
  // "ts" / "tb" are real abbreviations in this corpus ("2 ts soy sauce")
  "ts", "tb", "l", "g", "c", "T", "t",
]
  .sort((a, b) => b.length - a.length)
  .join("|");

/**
 * Leading amount. ORDER MATTERS — longest form first.
 *
 * `1-1/2 cup water` is a mixed number, not a range. With the range pattern
 * first it matched "1-1", left "/2 cup water", and produced the head
 * "2 cup water" — a quantity masquerading as an ingredient. The mixed-number
 * forms must therefore be tried before the range form.
 *
 * The trailing `(?!\s*%)` keeps percentages attached to the ingredient: without
 * it `2% low fat milk` loses its `2` and becomes `% low fat milk`.
 */
const NUM = String.raw`(?:\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|[¼½¾⅓⅔⅛⅜⅝⅞]|\d+(?:\.\d+)?(?!\s*%))`;

/**
 * A number, optionally a range of two numbers.
 *
 * Composing from NUM rather than enumerating range shapes: the previous version
 * listed integer ranges only, so `1/4 to 1/2 tsp salt` matched just the first
 * fraction and left the head `to 1 2 tsp salt`. Any number form can now appear
 * on either side of a range, which also covers `1-1/2` (mixed number written
 * with a hyphen) as a side effect.
 */
const AMOUNT = String.raw`${NUM}(?:(?:\s*[-–—]\s*|\s+to\s+)${NUM})?`;

/**
 * Portion and shape words that describe HOW MUCH or WHAT SHAPE, not what it is.
 *
 * From review notes: `knob of ginger`, `thumb size ginger`, `thin slices of
 * ginger` and `thick slices of ginger` are all just ginger; `lime wedges` is
 * lime; `cilantro leaves` is cilantro; `swirl of sesame oil` is sesame oil.
 * These are measurements in disguise, the same category as "a few cracks of".
 */
const PORTION = String.raw`(?:thin|thick|small|large|big|thumb|knob|hunk|chunk|swirl|drizzle|strip|sheet|wedge|slice|sprig|leaf|leaves|stalk|head|piece|clove|bunch|handful|size|sized|each|bulb|rib|bowl|block|pack|packet|envelope|sachet|scoop|lump|tub|jar|carton|bag|stick|tube|slab|fillet|filet|floret|sprig|clove|stem|spear|bundle|bunch|batch|portion|serving|matchstick|julienne|round|coin)s?`;

/**
 * Purpose phrases: `oil for frying` and `frying oil` are both oil. The purpose
 * belongs to the recipe step, not to the ingredient's identity.
 */
/** `milk of choice`, `mixed vegetables of your choice` — a hedge, not a name. */
const OF_CHOICE = /\s+of\s+(?:your\s+|the\s+)?(?:choice|choosing|preference)\b.*$/i;

const PURPOSE = /\s+for\s+(?:frying|deep frying|deep-frying|garnish|serving|topping|greasing|brushing|dusting|coating|drizzling|sprinkling|the\s+\w+)\b.*$/i;

/**
 * Possessive brand prefixes: `baek's soy sauce`, `frank's hot sauce`.
 *
 * The animal exception is not optional: `bird's eye chili` is a variety name,
 * and eating the possessive left the head `eye chilies` on three rows — a body
 * part masquerading as an ingredient.
 */
const NOT_BRAND = /^(?:bird|lamb|cow|goat|hen|sheep|duck|devil|shepherd|baker|cook|confectioner)$/i;
const BRAND = /(?:^|\s)([a-z]+)['’]s\s+/gi;
const stripBrand = (s: string) =>
  s.replace(BRAND, (m, w: string) => (NOT_BRAND.test(w) ? m.replace(/['’]s/, "") : " "));

/**
 * Vague quantifiers. "Few cracks of black pepper" is black pepper — the cracks
 * are a measurement, just an imprecise one.
 */
const VAGUE = String.raw`(?:a\s+)?(?:few|couple|several|some|handful|handfull|pinch|dash|drizzle|splash|sprinkle|shake|crack|worth)s?(?:\s+of)?`;

/**
 * Amount, optional whole-token unit, optional "of", optional "+"/"plus" join.
 *
 * The join matters for compound quantities like `1 cup + 2 tbsp water`, where
 * one pass leaves a second quantity behind.
 */
const STRIP_PREFIX = new RegExp(
  String.raw`^\s*[+&]?\s*(?:and\s+)?(?:plus\s+)?(?:(?:an?|the)\s+)?(?:${VAGUE}\s+)?(?:${AMOUNT})?\s*` +
  String.raw`(?:(?:${UNITS})\b\.?)?\s*(?:a\s+)?(?:${PORTION}\b\s*)?(?:of\s+)?`,
  "i",
);

/** Trailing portion words: `lime wedges`, `cilantro leaves`, `ginger slices`. */
const TRAILING_PORTION = new RegExp(String.raw`\s+(?:${PORTION})$`, "i");

/**
 * Plants whose LEAF is the ingredient. `bay leaf` is not a portion of a bay and
 * `perilla leaves` are not a portion of a perilla — stripping the leaf left
 * `bay` (105 mentions) and `perilla` (101), neither of which is a thing you buy.
 */
const LEAF_PLANT = "bay|perilla|curry|kaffir lime|kaffir|lime|banana|lotus|grape|shiso|mustard|collard|sesame";
const LEAF_IDENTITY = new RegExp(String.raw`\b(?:${LEAF_PLANT})\s+(?:leaf|leaves)$`, "i");
/**
 * The same plants when the leaf word came FIRST: "10 leaves perilla" is ten
 * perilla leaves, but `leaves` is a leading portion word and STRIP_PREFIX ate
 * it, leaving the bare plant. Guarding only the trailing position fixed
 * `perilla leaves` and missed this spelling of the same line.
 */
const LEAF_PLANT_ALONE = new RegExp(String.raw`^(?:${LEAF_PLANT})$`, "i");

/**
 * Cuts whose name ENDS in a portion word. `rib` is in PORTION — "3 ribs celery"
 * is celery — but `pork baby back ribs` is a cut and the ribs are the point.
 *
 * Guarding the trailing strip is the right shape, the same as LEAF_IDENTITY.
 * The earlier attempt used PROTECTED, which REPLACES the head with the
 * protected phrase, so `pork baby back ribs` came back as `baby back ribs` —
 * the animal, which the reviewer had just asked to add, was thrown away.
 */
const CUT_IDENTITY = /\b(?:baby back|short|spare|back|prime|beef|pork|lamb)\s+ribs?$/i;

/**
 * A token carrying no identity: a number, a unicode fraction, or a unit.
 *
 * The unicode fractions matter. `½ boneless, skinless chicken thigh` slipped
 * past a digits-only test, so the adjective-run guard counted `½` as a real
 * word and produced the head `boneless` — a modifier with no noun.
 */
const QTY_TOKEN = new RegExp(
  // One class, digits and fraction glyphs together: "1½" is a MIXED token —
  // digit then glyph — and two pure alternations matched neither half, so the
  // guard that keeps "boneless, skinless chicken thighs" whole saw "1½" as a
  // word with identity and let the comma cut through (2026-08-19).
  String.raw`^(?:[\d/.\-¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]+|(?:${UNITS}))$`,
  "i",
);

/** A portion word standing alone: "2 blocks firm or extra firm tofu" — the
    or-branch counted "blocks" as a word with identity, so the left side
    looked substantive and kept its modifier as the head. */
const PORTION_TOKEN = new RegExp(String.raw`^(?:${PORTION})$`, "i");

/**
 * `zest of 1 lemon`, `juice from half a lime` — a MEASUREMENT construction, not
 * an ingredient name. The part word is fronted and the quantity sits between it
 * and the ingredient, which is why the ordinary prefix stripper cannot reach it.
 *
 * Rewritten to canonical word order (`lemon zest`) rather than resolved here.
 * Stage 1 normalises SYNTAX; whether a zest is its own pantry item is an
 * identity question and belongs to the engine. Folding it here would also
 * destroy `juice from kimchi`, which IS its own node.
 */
const PART_OF_PHRASE =
  /^(?:the\s+)?(zest|juice|peel|rind|skin)\s+(?:of|from)\s+(?:about\s+)?(?:\d+[\d\/.\s-]*|half\s+(?:a\s+)?|a\s+|an\s+|one\s+|two\s+|the\s+)*(.+)$/i;

/** Servings lines that leak in as ingredients: "Serves 4", "Serves 2 to 3". */
const NOT_INGREDIENT = /^(?:serves?|yields?|makes)\b/i;

/**
 * Recipe PROSE that arrives inside an ingredient list.
 *
 * Authors put method notes on ingredient lines — "bring 4 to 5 cups of water to
 * a boil, add the taro, cover, cook for 10 minutes", "use if you want a softer
 * chocolate shell". Every rule downstream then treats a sentence as a name, and
 * the promotion step waves it through because such a line usually sits near the
 * top of the list and carries a weight.
 *
 * Two signals, and both are needed. Length alone is wrong — `uncooked japanese
 * short-grain white rice` is six real words. Markers alone are wrong too:
 * `use` and `note` appear inside ordinary names. Together they are precise,
 * because an ingredient name is a NOUN PHRASE and prose is not.
 */
const PROSE_MARKER =
  /\b(?:you|your|yours|if\s|instead|will need|see note|see notes|yields|choose|substitute|prevent|at least|as much as|i tried|comes with|enough for|enough to|set aside|to a boil|for \d+ minutes|close to|soak in|strain the|drippings from|for a softer|that is)\b/i;
const isProse = (s: string) => {
  const words = s.split(/\s+/).filter(Boolean);
  // Six words is the ceiling for a real name: `uncooked japanese short-grain
  // white rice` is five, and nothing legitimate in this corpus reaches seven.
  return words.length > 6 || (words.length > 4 && PROSE_MARKER.test(s));
};

/**
 * Trailing unit noun: "garlic cloves" is garlic, "3 cloves garlic" already is.
 * Only strips when something remains, so `cloves` alone survives as itself.
 */
const TRAILING_UNIT = new RegExp(String.raw`\s+(?:${UNITS})$`, "i");

/**
 * Words removed before grouping: quantifiers, size adjectives, and
 * PROCESSING STEPS.
 *
 * Processing steps are merged into the raw ingredient because a cook can
 * perform them. If you have garlic you can crush it; if you have beef you can
 * buy or make it ground. For pantry matching, `crushed garlic` and `garlic` are
 * the same requirement, so keeping them apart only fragments the graph and
 * makes recipes look unmakeable when they aren't.
 *
 * This reverses an earlier comment here which argued `ground pork is not pork`.
 * That was reasoning about the *product* rather than about what the matcher
 * needs to decide, which is: can this person cook this dish tonight.
 *
 * Deliberately still NOT stripped — these are purchases, not steps:
 *   dried, smoked, pickled, fermented, canned, cured, aged
 * Dried shiitake is not fresh shiitake left in a cupboard, and kimchi is not
 * cabbage. Colours and origins are likewise untouched (`black pepper`,
 * `korean radish`) — see the granularity rule in DECISIONS §3.
 */
const NOISE = new RegExp(
  "(?<![\\w-])(?:" + [
    // quantifiers and hedges
    "optional", "to taste", "divided", "plus more", "as needed", "about",
    // The grain lookahead matters: "medium grain white rice" lost its size word
    // and left the head `grain white rice`. Rice grain length is identity.
    "approx\\.?", "small(?!\\s+grain)", "medium(?!\\s+grain)", "large", "extra",
    "packed", "heaping", "level", "very", "single",
    "thick[\\s-]cut", "thin[\\s-]cut", "flat[\\s-]leaf", "lump",
    // manner adverbs
    // "rough" is half of "rough chopped" and was left behind as `rough onion`.
    "thinly", "freshly", "finely", "roughly", "rough", "coarsely", "lightly",
    // processing steps a cook can perform on the raw ingredient
    "minced", "grated", "chopped", "sliced", "diced", "julienned", "halved",
    "quartered", "peeled", "trimmed", "beaten", "cooked", "crushed", "squeezed",
    "ground", "frozen", "boiled", "mashed", "shredded", "steamed", "blanched",
    "thawed", "drained", "rinsed", "cubed", "pounded", "whisked", "torn",
    "smashed", "sifted", "softened", "melted", "toasted", "roasted", "fresh",
    "washed", "soaked", "deveined", "shelled", "pitted", "seeded", "stemmed",
    "poached", "fried", "scrambled", "distilled", "creamy", "clear", "active",
    // temperature and purpose: `cold butter` is butter, `frying oil` is oil
    // `frying(?!…)`: "Korean frying mix" is a boxed tempura product, and
    // stripping the word left the head `korean mix`.
    "cold", "warm", "chilled", "lukewarm", "room temperature",
    "frying(?!\\s+(?:mix|powder|batter|flour))", "deep-frying",
  ].join("|") + ")(?![\\w-])",
  "g",
);

/** Best-effort ingredient head. Grouping aid, not a parser. */
/**
 * Phrases where a word that is normally a processing step is part of the product
 * name. `ground bean sauce` is a jarred Chinese condiment, not bean sauce that
 * was ground, and `ground meat` is the generic slot the reviewer asked for —
 * both lost their first word to the NOISE list and became something else.
 */
// "extra virgin olive oil" joined 2026-08-20: written unhyphenated, `extra`
// fell to the degree-word strip and the line landed on plain virgin olive oil
// — a different retail grade. The curator saw it in the editor's provenance.
const PROTECTED = /\b(?:ground bean sauce|ground meat|ground pork sausage|extra virgin olive oil)\b/;

/**
 * Left-hand words in an "X or Y" that cannot stand alone as an ingredient.
 * Used to decide whether to borrow the right side's noun.
 */
/** Words in a quantity phrase that carry no identity. */
const FILLER = /^(?:of|to|a|an|the|plus|about|approx|approximately)$/i;

const MODIFIER_ONLY = /^(?:vegetable|canola|light|dark|white|red|green|black|yellow|brown|toasted|untoasted|regular|low|full|reduced|extra|virgin|whole|skim|unsalted|salted|sweet|sour|hot|mild|fresh|dried|frozen|raw|cooked|thin|thick|large|small|medium|firm|soft|silken|instant|active|rice|apple|balsamic)$/i;

/** Words that can stand before a comma without being the name: state and
    processing adjectives. Shared by the comma guard and the paren rescue. */
const ADJ_ONLY = /^(?:boneless|skinless|bone-in|skin-on|fresh|dried|frozen|raw|cooked|large|small|medium|thin|thick|whole|ground|lean|fatty|firm|soft|silken|ripe|unripe|hot|cold|warm|sweet|unsalted|salted|low|full|reduced|extra|packed|sliced|peeled|pitted|cubed|chopped|minced|diced|trimmed|uncooked|cored|seeded|shredded|julienned|halved|quartered|crushed|grated|torn|rinsed|drained|washed)$/i;

/**
 * Best-effort ingredient head.
 *
 * `vocab` enables the second pass. Some lines cannot be resolved in isolation —
 * see the "or" branch below — and the only evidence that settles them is the
 * rest of the corpus, which this function is what builds. So callers run it
 * twice: once with no vocabulary to collect the heads, once with them to fix the
 * lines that needed context.
 */
export function headName(raw: string, vocab?: ReadonlySet<string>, _depth = 0): string {
  // Fold accents before anything else. The character filter below keeps only
  // [a-z0-9], so `jalapeño` lost its ñ and became the head `jalape o`, and
  // `crème fraîche` became `cr me fra che` — two words split into four.
  let s = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Unicode spaces are spaces. The `&nbsp;` ENTITY was already decoded below,
  // but a literal U+00A0 survived every pattern that spells a space as " " \u2014
  // and the separators are spelled that way. "Samgyetang broth -\u00a0 1/4 cup"
  // therefore failed the " - " split that strips a trailing quantity, and the
  // leftover became the node `samgyetang broth - 1 4`. Pasted recipe text is
  // full of these: 231 lines in this corpus carry one.
  s = s.replace(/[\u00a0\u2007\u202f\u2009\u200a\ufeff]/g, " ");
  // Entities FIRST, not late. `10&#215;10 dasima` is 10×10 kelp, but the
  // leading-separator strip removed the bare `&`, which stopped the entity
  // pattern from matching, and the character filter then turned the orphaned
  // body into digits: the head `215 10 dasima`. An earlier fix caught the same
  // class of bug for `&#038;` only because that one sat at a different offset.
  s = s.replace(/&#?\w+;/g, (m) =>
    /^&(?:amp|#0*38);$/i.test(m) ? " and "
    : /^&(?:times|#0*215);$/i.test(m) ? " x "
    : /^&(?:nbsp|#0*160);$/i.test(m) ? " "
    : " ");
  // An unbalanced "(" is not a parenthetical — the text after it is usually the
  // ingredient itself: "1 tbsp (9 g toasted sesame seeds". Dropping the bracket
  // and letting the quantity stripper run is right; dropping to end of line
  // would delete the name.
  if ((s.match(/\(/g)?.length ?? 0) > (s.match(/\)/g)?.length ?? 0))
    s = s.replace(/\(/g, " ");
  // Dimensions: "10x10 dasima" is a sheet size, not two quantities.
  s = s.replace(/\b\d+(?:\.\d+)?\s*x\s*\d+(?:\.\d+)?\s*(?:inch(?:es)?|in|cm|mm)?\b/gi, " ");
  // A SPACED numeric range is one quantity: "7 - 8 garlic cloves" is 7-8 cloves
  // of garlic. Written with spaces it hit the trailing-clause split below — where
  // " - " separates "beef - prime rib eye" — and the line was truncated to its
  // own quantity, so the head came out empty. 106 lines across 9 sources, over
  // half of them on koreanbapsang, which writes every range this way.
  // Collapsing to the unspaced form is enough: AMOUNT already reads "7-8".
  s = s.replace(/(\d)\s*[-–—]\s*(?=\d)/g, "$1-");
  // The same range written with UNICODE fractions: "¾–1 lb boneless, skinless
  // chicken thighs". The collapse above spells a digit as \d, which no fraction
  // glyph matches, so the en-dash survived to the trailing-clause split below
  // and the line was truncated to "¾" — the head came out empty and a chicken
  // dish stopped requiring chicken (the missing-main class, 2026-08-19).
  s = s.replace(/([\d¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])\s*[-–—]\s*(?=[\d¼½¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, "$1-");
  const protectedPhrase = PROTECTED.exec(s)?.[0];
  // Parentheticals, INNERMOST OUT. JustOneCookbook double-brackets every note
  // — "((about 7.4 oz (210 g) each))" — and a single greedy-less pass removed
  // only "(210 g)"-shaped spans, leaving orphaned ")" fragments that polluted
  // every rule downstream (the or-branch borrowed "firm package" from one).
  for (let i = 0; i < 4; i++) {
    const next = s.replace(/\([^()]*\)/g, " ");
    if (next === s) break;
    s = next;
  }
  s = s.replace(/\[[^\]]*\]/g, " ");
  // "salt + pepper" is a compound line. The character filter would drop the
  // "+" and leave the head "salt pepper", which then matches no rule.
  s = s.replace(/\s+\+\s+/g, " and ");
  // Measurement first: "zest of 1 lemon" → "lemon zest". Before the "or" split,
  // which would otherwise see the quantity as part of the ingredient name.
  {
    const m = PART_OF_PHRASE.exec(s.trim());
    if (m) s = `${m[2]!.trim()} ${m[1]!.toLowerCase()}`;
  }
  // Purpose clauses BEFORE the "or" split. "vegetable or canola oil for frying"
  // otherwise borrows the last word of the right side and yields
  // "vegetable frying".
  // Trailing state clauses: "unsalted butter, at room temperature" left the
  // head `unsalted butter at` once the comma split ran.
  s = s.replace(/[, ]+at\s+room\s+temperature\b.*$/i, " ")
       .replace(/[, ]+softened\b.*$/i, " ");
  s = s.replace(OF_CHOICE, " ").replace(PURPOSE, " ");

  // "1 tbsp vegetable or olive oil" — splitting on "or" and keeping the left
  // yields the head "vegetable", which is not an ingredient. When the left side
  // is a bare modifier, borrow the right side's noun: → "vegetable oil".
  // "1 tsp sugar/agave nectar" is the same construction as "or" and produced
  // the head `sugar nectar` — a compound of two different sweeteners.
  // LETTERS on both sides, not \w: `\w` matched digits and rewrote every
  // fraction — "1/2 cup" became "1 or 2 cup", and the head came out empty on
  // a quarter of the corpus.
  // A full sentence after the ingredient is commentary: "2 cornish hens. Each
  // hen weighs about 1½ pounds…" kept the whole paragraph and the head came
  // out empty. Cut at the first sentence boundary — but only when what stands
  // before it has identity, so "2 Tbs. Thai fish sauce" (an abbreviation dot,
  // nothing but quantity before it) is left alone.
  {
    const sent = s.split(/\.\s+/);
    if (sent.length > 1) {
      const first = sent[0]!.trim().split(/\s+/)
        .filter((w) => w && !QTY_TOKEN.test(w) && !NOISE.test(w) && !FILLER.test(w));
      if (first.length > 0) s = sent[0]!;
    }
  }
  // "X aka Y" and "X such as Y" are one ingredient with commentary: keep the
  // name, drop the elaboration — "Korean hot pepper flakes aka Korean red
  // pepper flakes" and "mixed fresh herbs such as cilantro and mint" both
  // produced empty heads from the full clause.
  s = s.split(/\s+aka\s+/)[0]!;
  s = s.split(/\s+such as\s+/)[0]!;
  s = s.replace(/([a-z])\s*\/\s*([a-z])/g, "$1 or $2");
  const orMatch = s.match(/^([^,]+?)\s+or\s+([^,]+)/);
  if (orMatch) {
    // Count only tokens that carry identity. "1 tablespoon of white or apple
    // cider vinegar" has a four-word left side by raw count but a one-word one
    // in substance; counting the filler took the wrong branch and gave `white`.
    const meaningful = (part: string) =>
      part.trim().split(/\s+/)
        .map((w) => w.replace(/\.$/, ""))
        // "to" is the connector in a range ("2 to 3 tablespoons"), not a word
        // with identity. Counting it made the left side of "2 to 3 tablespoons
        // of perilla or sesame oil" look two words long, so the head noun
        // never distributed and the head stayed `perilla`.
        .filter((w) => w && !FILLER.test(w) && !QTY_TOKEN.test(w) && !NOISE.test(w)
          && !PORTION_TOKEN.test(w));
    const left = meaningful(orMatch[1]!);
    const right = meaningful(orMatch[2]!);

    // "1 or 2 scallions" — the `or` joins two NUMBERS, not two ingredients. The
    // left side has no word with identity in it, so there is nothing to choose
    // between; the quantity simply continues on the right. Previously this kept
    // the left side and produced an empty head.
    if (left.length === 0) {
      s = orMatch[2]!;
    } else if (left.length > 1 && left.every((w) => MODIFIER_ONLY.test(w) || ADJ_ONLY.test(w))) {
      // "1 whole frozen or fresh pollock" — a MULTI-word left side made of
      // nothing but modifiers. The single-word borrow below cannot fire
      // (left.length === 1 is its guard), so the left side was kept verbatim
      // and the head came out "whole". Identity lives on the right; take it.
      s = orMatch[2]!;
    } else {
    // Does the left side take the right side's head noun?
    //
    //   "perilla or sesame oil"  → perilla OIL or sesame oil   (distributes)
    //   "water or kelp broth"    → water, or kelp broth        (does not)
    //
    // Nothing in the sentence distinguishes these. The distinction is whether
    // the left word can stand alone as an ingredient, and that is a fact about
    // the world, not about the grammar. Two tests, in order:
    //
    //   1. the left word is a plain adjective   — "vegetable or olive oil"
    //   2. the corpus uses the borrowed form    — `perilla oil` appears 26
    //      times on its own lines; `water broth` appears nowhere
    //
    // Test 2 needs the vocabulary, which is why this function takes a second
    // pass. Without it the borrow is skipped, which is the safe direction: it
    // leaves a head that is too general rather than inventing one that is wrong.
    // How much of the right side does the left borrow?
    //
    //   "green or red chili peppers"       → green CHILI PEPPERS
    //   "white or apple cider vinegar"     → white VINEGAR
    //
    // Both have a modifier in front on the right, and they want different
    // amounts of what follows: `chili pepper` is a category noun the left side
    // needs, `apple cider` is a compound modifier it must not inherit. Position
    // cannot tell them apart — an earlier version took `right.slice(1)` for both
    // and produced `white cider vinegar`.
    //
    // The vocabulary can. Prefer the longer form when the corpus uses it, and
    // fall back to the bare head noun when it does not.
    const longForm = right.length > 1 ? `${left[0]} ${right.slice(1).join(" ")}` : "";
    const shortForm = `${left[0]} ${right[right.length - 1]}`;
    const borrowed = right.length < 2 ? ""
      : longForm && vocab?.has(longForm) ? longForm
      : shortForm;
    const takesHeadNoun =
      left.length === 1 && !!borrowed &&
      (MODIFIER_ONLY.test(left[0]!) || !!vocab?.has(borrowed));
      s = takesHeadNoun ? borrowed : orMatch[1]!;
    }
  }
  // Comma split, EXCEPT when everything before the comma is adjectives.
  // "boneless, skinless chicken thighs" split to the head "boneless" — a
  // modifier with no noun, which the reviewer flagged as a parsing error.
  // The processing words (packed, peeled, pitted…) joined 2026-08-19 for the
  // same reason: "1/2 cup packed, sliced kimchi" cut to "packed" and a kimchi
  // dish stopped requiring kimchi.
  const parts = s.split(/,|—|–| - |\bplus\b/);
  let commaCut = parts[0] ?? s;
  // "2 tablespoons plus 1 teaspoon apple cider vinegar" — the first segment is
  // PURE quantity, so cutting to it deleted the name. Same rule as the empty
  // left of an "or": nothing before the separator has identity, so the
  // ingredient simply continues after it.
  const firstMeaning = commaCut.trim().split(/\s+/)
    .map((w) => w.replace(/\.$/, ""))
    .filter((w) => w && !QTY_TOKEN.test(w) && !NOISE.test(w) && !FILLER.test(w)
      && !PORTION_TOKEN.test(w));
  if (firstMeaning.length === 0 && parts.length > 1) commaCut = parts.slice(1).join(" ");
  // Trailing periods matter: "8 oz. boneless" left `oz.` unmatched by the unit
  // test, so the run looked like it contained a real word and the guard didn't
  // fire — reproducing the `boneless` head it exists to prevent.
  const head = commaCut.trim().split(/\s+/).map((w) => w.replace(/\.$/, "")).filter(Boolean);
  const strippedQty = head.filter((w) => !QTY_TOKEN.test(w));
  s = strippedQty.length > 0 && strippedQty.every((w) => ADJ_ONLY.test(w))
    ? s.replace(/,/g, " ")   // keep the noun that lives after the comma
    : commaCut;
  // Noise first: a leading size adjective ("Small handful of…") hides the vague
  // quantifier behind it, so stripping noise only at the end leaves "handful of
  // green onions" as a head.
  s = stripBrand(s.replace(PURPOSE, " "));
  s = s.replace(NOISE, " ").replace(/\s+/g, " ").trim();

  // Repeat until stable, stripping leftover separators INSIDE the loop.
  //
  // Each pass can expose a new quantity: "1 (14 oz) can crushed tomatoes" leaves
  // "can ..."; "1 cup + 2 tbsp water" leaves a second amount; "1/4-1/2 cup
  // water" is a range of fractions where the first fraction is consumed and a
  // bare "-" is left in front of the second. Stripping separators only after
  // the loop finishes handles one such layer and stops.
  for (let i = 0; i < 5; i++) {
    const next = s.replace(/^[\s/\-–—+&.,]+/, "").replace(STRIP_PREFIX, "");
    if (next === s) break;
    s = next;
  }
  s = s.replace(/^[\s/\-–—+&.,]+/, "");
  s = s.replace(NOISE, " ");
  // HTML entities before the character filter. Stripping "&" and ";" first
  // leaves the numeric body behind: "salt &#038; pepper" became the head
  // "salt 038 pepper", a quantity-looking token in an ingredient name.
  s = s.replace(/&#?\w+;/g, (m) => (/^&(?:amp|#0*38);$/i.test(m) ? " and " : " "));
  // Bare ampersand too. Encoded forms were handled but a literal "&" fell to
  // the character filter below and vanished, turning "salt & pepper" into the
  // head "salt pepper" — which no longer matched the compound-line rule.
  s = s.replace(/&/g, " and ");
  s = s.replace(/[*†‡•]/g, " ").replace(/[^a-z0-9%\-' ]/g, " ");
  s = s.replace(/\b(\w+)(\s+\1)+\b/g, "$1").replace(/\s+/g, " ").trim();
  if (NOT_INGREDIENT.test(s) || isProse(s)) return "";
  for (const re of [TRAILING_UNIT, TRAILING_PORTION]) {
    if (re === TRAILING_PORTION && (LEAF_IDENTITY.test(s) || CUT_IDENTITY.test(s))) continue;
    const t = s.replace(re, "").trim();
    if (t) s = t;
  }
  // Restore a leaf the prefix stripper took: only when the raw line actually
  // said "leaf", so `sesame` stays `sesame` unless it was `sesame leaves`.
  if (LEAF_PLANT_ALONE.test(s) && /\bleaf|leaves\b/i.test(raw)) s = `${s} leaves`;
  // A protected phrase survives every rule above: if it was in the raw string
  // and the pipeline lost it, the pipeline is wrong.
  if (protectedPhrase && !s.includes(protectedPhrase)) s = protectedPhrase;
  // The name lived inside the parentheses. "8 ounces boneless (skinless
  // chicken breast or thigh (fat removed))" — the parenthetical strip removed
  // the name with the gloss, and the head that remained was a bare modifier.
  // When the result is empty or nothing but ADJ_ONLY words and the raw line
  // held a parenthetical, parse that parenthetical as a line of its own, once.
  if (_depth === 0 && (!s || s.split(/\s+/).every((w) => ADJ_ONLY.test(w)))) {
    const inner = /\(([^()]*(?:\([^()]*\)[^()]*)*)\)/.exec(raw);
    const body = inner?.[1]?.replace(/[()]/g, " ").trim();
    if (body) {
      const rescued = headName(body, vocab, 1);
      if (rescued && !rescued.split(/\s+/).every((w) => ADJ_ONLY.test(w))) return rescued;
    }
  }
  return s;
}

function main() {
  if (!existsSync(RAW_DIR)) { console.error("no data/raw — run: npm run crawl"); process.exit(1); }
  mkdirSync(OUT_DIR, { recursive: true });

  const recipes: RawRecipe[] = [];
  for (const f of readdirSync(RAW_DIR).filter((f) => f.endsWith(".jsonl"))) {
    for (const line of readFileSync(resolve(RAW_DIR, f), "utf8").split("\n")) {
      if (line.trim()) { try { recipes.push(JSON.parse(line)); } catch {} }
    }
  }
  if (!recipes.length) { console.error("data/raw is empty"); process.exit(1); }

  const heads = new Map<string, { n: number; examples: Set<string>; cuisines: Set<string> }>();
  let lines = 0;
  for (const r of recipes) {
    for (const raw of r.rawIngredients) {
      lines++;
      const h = headName(raw);
      if (!h) continue;
      const e = heads.get(h) ?? { n: 0, examples: new Set(), cuisines: new Set() };
      e.n++;
      if (e.examples.size < 3) e.examples.add(raw);
      e.cuisines.add(r.cuisine ?? "unresolved");
      heads.set(h, e);
    }
  }

  const ranked = [...heads.entries()].sort((a, b) => b[1].n - a[1].n);
  const total = ranked.reduce((a, [, v]) => a + v.n, 0);

  // Where to stop defining nodes: cumulative coverage of ingredient mentions.
  let cum = 0;
  const rows = ranked.map(([name, v]) => {
    cum += v.n;
    return {
      name, count: v.n,
      coverage: cum / total,
      cuisines: [...v.cuisines].join("|"),
      examples: [...v.examples],
    };
  });

  const csv = [
    "rank,name,count,cumulative_coverage,cuisines,example",
    ...rows.map((r, i) =>
      [i + 1, `"${r.name}"`, r.count, r.coverage.toFixed(4), r.cuisines,
       `"${(r.examples[0] ?? "").replace(/"/g, '""')}"`].join(","),
    ),
  ].join("\n");
  writeFileSync(resolve(OUT_DIR, "ingredient-frequency.csv"), csv);

  const at = (p: number) => rows.findIndex((r) => r.coverage >= p) + 1;
  console.log(`
recipes            ${recipes.length}
ingredient lines   ${lines}
distinct heads     ${rows.length}

nodes needed for coverage — this is the ontology scope decision (DECISIONS §3):
  50%   ${at(0.5)}
  80%   ${at(0.8)}
  90%   ${at(0.9)}
  95%   ${at(0.95)}   ← the target
  99%   ${at(0.99)}

top 25:`);
  for (const [i, r] of rows.slice(0, 25).entries()) {
    console.log(`  ${String(i + 1).padStart(3)}. ${r.name.padEnd(26)} ${String(r.count).padStart(4)}  ${r.cuisines}`);
  }
  console.log(`\nwrote data/reports/ingredient-frequency.csv`);
}

// Only run as a CLI. `headName` is imported by analysis scripts, and an
// unguarded main() meant importing it also printed the whole report.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!)) {
  main();
}
