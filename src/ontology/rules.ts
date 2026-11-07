/**
 * GENERAL RULES — cuisine-independent.
 *
 * Everything here is a claim about how ingredient NAMES work, not about any
 * particular kitchen. Adding a cuisine must not change this file. If it does,
 * the class model is wrong and that is worth stopping for.
 *
 * The counterpart is exceptions.ts, which holds the semantic facts no rule can
 * derive and which is EXPECTED to grow with every cuisine. The split is the
 * point: general rules are the asset that compounds across cuisines, exceptions
 * are the rent paid for each one. `npm run agreement` prints the ratio, so a
 * general rule quietly degrading into a pile of special cases shows up as a
 * number rather than as a slow feeling.
 */

/**
 * THE TEST, for every modifier in every class:
 *
 *     does this adjective oblige a SEPARATE PURCHASE?
 *
 * Not "is it a different thing" — plenty of adjectives describe real
 * differences that a cook produces on the spot. The matcher only ever asks one
 * question, "can this person cook this dish tonight", so the modifier matters
 * exactly when a pantry holding the unmodified ingredient does NOT satisfy the
 * recipe.
 *
 * `hot chicken stock` — you heat what you have. Strip.
 * `dried shiitake`    — a different bag on a different shelf. Keep.
 * `granulated garlic` — grind the garlic you own. Strip.
 * `granulated sugar`  — nothing in a pantry becomes it. Keep.
 *
 * The last pair is why the test is about the INGREDIENT, not the word. When the
 * word alone cannot decide, the pair is listed in exceptions.ts.
 */

/**
 * How a modifier behaves when it sits in front of an ingredient.
 *
 *   strip   — never changes what the ingredient IS; remove it
 *   keep    — changes identity; the modified form is its own node
 *   native  — an origin word that may trigger a rename to the native product
 *   part    — names a piece of a larger ingredient; folds into the whole
 */
export type Behaviour = "strip" | "keep" | "native" | "part";

export type ModifierClass = {
  name: string;
  behaviour: Behaviour;
  /** Why this class behaves the way it does — the reviewer's reasoning. */
  because: string;
  words: string[];
};

export const CLASSES: ModifierClass[] = [
  {
    name: "state",
    behaviour: "strip",
    because:
      "The cook can produce this state from the raw form in one session. " +
      "`hot chicken stock` is chicken stock you heated; a pantry holding stock " +
      "can satisfy it tonight. Keeping these apart fragments the graph and makes " +
      "cookable recipes look uncookable.",
    words: [
      // temperature. "hot" is absent: in an Asian corpus it means spicy far
      // more often than warm, and stripping it merged `hot mustard`, `hot chili
      // oil` and `hot chicken` into their mild parents. The handful of genuine
      // temperature uses are named synonyms instead.
      "cold", "warm", "chilled", "lukewarm", "room temperature", "iced",
      // doneness
      "cooked", "uncooked", "raw", "boiled", "hard-boiled", "hard boiled",
      "soft-boiled", "soft boiled", "half-boiled", "poached", "fried",
      "scrambled", "steamed", "blanched", "parboiled", "seared", "grilled",
      // knife and mill work
      "minced", "grated", "chopped", "sliced", "diced", "julienned", "halved",
      "quartered", "cubed", "shredded", "crushed", "smashed", "pounded",
      "mashed", "torn", "cut", "thick-cut", "thin-cut", "ground", "granulated",
      "powdered", "flaked", "crumbled", "zested", "squeezed", "juiced",
      // preparation
      "peeled", "trimmed", "beaten", "whisked", "whipped", "whipping", "sifted",
      "softened", "melted", "thawed", "defrosted", "drained", "rinsed", "washed",
      "cleaned", "soaked", "rehydrated", "deveined", "shelled", "pitted",
      "seeded", "stemmed", "husked", "shucked", "pressed", "strained",
      "toasted", "roasted",
      // provenance of the preparation, not of the ingredient
      "homemade", "store-bought", "store bought", "prepared", "leftover",
      "day-old", "day old", "overnight",
      // manner adverbs that only ever qualify a state word
      "thinly", "freshly", "finely", "roughly", "coarsely", "lightly", "well",
    ],
  },

  {
    name: "preservation",
    behaviour: "keep",
    because:
      "Cannot be produced from the raw form in one session, so the preserved " +
      "form is a separate purchase and a separate pantry item. Dried shiitake is " +
      "not fresh shiitake left in a cupboard; aged kimchi is not kimchi you made " +
      "this morning. This is the boundary the whole `state` class is defined " +
      "against — reviewer sent sour/aged/ripe kimchi to `fermented kimchi`, NOT " +
      "to `kimchi`.",
    words: [
      "dried", "dry", "sun-dried", "freeze-dried", "dehydrated",
      "fermented", "aged", "ripened", "sour", "well-fermented", "ripe",
      // `salted` sits in `variety` with `unsalted`, not here. Both behaviours
      // are "keep" so nothing changed, but a word in two classes is decided by
      // declaration order, and salted/unsalted is one axis that should be read
      // in one place.
      "pickled", "brined", "cured", "smoked", "preserved",
      "canned", "jarred", "candied", "marinated", "instant",
    ],
  },

  {
    name: "grade",
    behaviour: "strip",
    because:
      "Marketing and sourcing claims. They change what you pay, never what the " +
      "recipe needs. Reviewer stripped all of these without exception across 14 " +
      "rows — the safest class in the table.",
    words: [
      "organic", "unbleached", "bleached", "natural", "all-natural", "pure",
      "premium", "quality", "good", "good-quality", "best", "fancy",
      "artisan", "artisanal", "authentic", "traditional", "real", "genuine",
      "free-range", "free range", "grass-fed", "grass fed", "pasture-raised",
      "wild-caught", "wild caught", "farm-raised", "sustainably sourced",
      "neutral", "neutral-flavored", "neutral flavored", "flavourless",
      "seedless",
      // `boneless`/`skinless`/`bone-in`/`skin-on` are NOT here. They were, and
      // the `cut` class below happened to be declared later so it won — a
      // behaviour that would have silently flipped if anyone reordered CLASSES.
      // `low fat`/`low sodium` are not here either: they were in grade with a
      // space and in variety with a hyphen, so `low-fat milk` kept its modifier
      // and `low fat milk` lost it. Both live in `variety` now, both spellings.
      "no-salt-added", "your choice", "any",
      "fat free", "fat-free", "sugar free", "sugar-free",
      "cheap", "inexpensive", "ordinary", "standard", "basic",
      "sharp", "mild", "extra", "special",
      // Salt-crystal provenance. Reviewer sent `flaky sea salt`, `rock salt`,
      // `korean solar sea salt` and `korean cheonilyeom sea salt` all to plain
      // `salt`: where the crystal came from is a label claim. Grain SIZE is not
      // here — `coarse salt` is a real node with 62 mentions.
      // "rock" is NOT here: `rock sugar` is a distinct product. `rock salt` is
      // handled as a named synonym — the word is only a provenance claim when
      // it sits in front of salt.
      "sea", "solar", "flaky", "himalayan",
      "cooking", "cracked",
      // Brand names live in CUISINE_WORDS: which brands exist is a fact about a
      // market, not about English.
      // NOT "hot": in this corpus it means spicy far more often than warm, and
      // `chinese hot mustard` is a distinct product. `hot chicken stock` is
      // handled as a named synonym instead — one row, not a rule.
    ],
  },

  {
    name: "cut",
    behaviour: "keep",
    because:
      "Reviewer, stated directly: 'if a recipe specifies a specific cut of meat, " +
      "it should be that one.' Bone-in and boneless are different purchases with " +
      "different cook times, and they accepted all 9 such rows unchanged. These " +
      "read like grade words and are not.",
    words: ["boneless", "skinless", "bone-in", "bone in", "skin-on", "skin on"],
  },

  {
    name: "size",
    behaviour: "strip",
    because:
      "A quantity in disguise. `medium-sized potatoes` is potatoes; the size " +
      "belongs to the amount, which the parser already discards.",
    words: [
      "small", "medium", "medium-sized", "medium sized", "large", "big", "huge",
      "extra-large", "jumbo", "giant", "tiny", "mini", "thin", "thick",
      // "long" and "short" are absent: `long beans` is a vegetable and
      // `short grain` is a rice type, so both are identity far more often
      // than they are size.
      "square", "round", "wide", "narrow", "whole", "half",
      "single", "individual", "plump", "fat", "slim",
    ],
  },

  {
    name: "origin",
    behaviour: "native",
    because:
      "DEFAULT IS KEEP. This reverses the rule as first written, on the " +
      "reviewer's own evidence: they kept `chinese broccoli`, `korean radish`, " +
      "`thai basil`, `japanese cucumber`, `chinese black vinegar` and ~25 more, " +
      "and stripped the origin from only 8 — every one of them a commodity " +
      "staple (salt, mayonnaise, zucchini, mustard). Gai lan is not broccoli and " +
      "mu is not a radish, so an origin word is normally naming a different " +
      "plant, not a different supplier. It is safe to strip ONLY where the " +
      "underlying product is a global commodity, which is what COMMODITY below " +
      "enumerates. Where the origin names a distinct product with a native name, " +
      "NATIVE renames it instead.",
    words: [
      // `asian` is absent on purpose: `asian pear` and `asian leek` are
      // specific plants, and the reviewer kept `asian` while dropping `korean`
      // from `korean asian pear`. It sits in `variety` instead.
      "korean", "japanese", "chinese", "thai", "vietnamese", "filipino",
      "taiwanese", "indonesian", "malaysian", "indian", "east asian",
      "southeast asian", "american", "italian", "french", "mexican", "spanish",
      // `greek` is NOT here: `greek yogurt` is a style of yogurt, not Greek
      // sourcing of ordinary yogurt. It lives in `variety`.
      "turkish", "mediterranean", "western", "european",
    ],
  },

  {
    name: "variety",
    behaviour: "keep",
    because:
      "Names a cultivar, grain, colour or texture that a cook cannot substitute " +
      "freely. Reviewer kept `red` in `korean red chili pepper` while dropping " +
      "`korean` from the same string — the colour distinguishes, the nationality " +
      "does not. Salt grain size lives here too: `coarse salt` survived review " +
      "as its own node with 62 mentions.",
    words: [
      // colour
      "red", "green", "white", "black", "yellow", "purple", "brown", "golden",
      // grain and texture
      // `sea`, `flaky`, `rock` and `solar` are NOT here: the reviewer sent
      // `flaky sea salt`, `rock salt`, `korean solar sea salt` and `korean
      // cheonilyeom sea salt` all to plain `salt`. Grain SIZE discriminates
      // (`coarse salt` survived as its own node); provenance of the crystal
      // does not. `kosher` stays because it survived review as a node.
      "coarse", "fine", "kosher", "table",
      "glutinous", "short-grain", "short grain", "long-grain", "long grain",
      "silken", "firm", "extra-firm", "extra firm", "soft", "medium-firm",
      "creamy", "chunky", "smooth",
      // flavour axis that changes the product
      // `plain` is a flavour axis, not a grade claim: plain yogurt is the
      // opposite of strawberry yogurt, and plain flour is a named product.
      // Reviewer's call.
      "plain",
      "sweet", "sweetened", "unsweetened", "salted", "unsalted", "spicy",
      "toasted-sesame", "dark", "light", "heavy", "double",
      "full-fat", "nonfat", "skim",
      "low-sodium", "low sodium", "reduced-sodium", "reduced sodium",
      "low-fat", "low fat",
      "asian", "buttermilk", "whole-milk",
      // Cultivar and brand NAMES are not here — see CUISINE_WORDS in
      // exceptions.ts. `cheongyang`, `napa`, `shishito` and `kikkoman` are
      // vocabulary, and vocabulary is exactly what a new cuisine brings. This
      // file claims that adding a cuisine must not change it, and holding a list
      // of Korean chili cultivars made that claim false.
    ],
  },
];

/**
 * Category words that are redundant after a species name. `mackerel fish` is
 * mackerel; `ginkgo nut` keeps its nut because the nut is the part you eat.
 */
export const APPOSITIVE = /\s+(?:fish|meat)$/i;

/**
 * Not ingredients at all: equipment, packaging, and presentation words that end
 * up in ingredient lists.
 *
 * Reviewer marked eight of these "not ingredient" — skewers, kitchen gloves,
 * parchment paper, a steamer. A recipe listing them is listing what you need,
 * not what you buy to eat, and a pantry node for `wooden skewers` can only ever
 * make a dish look unmakeable.
 *
 * `toppings` and `garnish` are here for a different reason: they name a ROLE,
 * not a thing, and the actual ingredients follow on their own lines.
 */
export const NOT_INGREDIENT = new Set([
  "bamboo skewers", "wooden skewers", "skewers", "metal skewers",
  "kitchen gloves", "gloves", "disposable gloves", "rubber gloves",
  "parchment paper", "wax paper", "aluminum foil", "foil", "plastic wrap",
  "cheesecloth", "paper towels", "toothpicks", "steamer", "steamer basket",
  "cheese cloth", "kitchen twine", "butcher twine", "mortar and pestle",
  "toppings", "topping", "garnish", "garnishes", "for garnish", "for serving",
  "food coloring", "red food coloring", "green food coloring", "yellow food coloring",
  // NOT "organic": it is a grade word, and a bare `organic` head is caught by
  // the parse-failure rule. Listing it here said it was a kind of equipment.
]);

/**
 * Universal ingredients: present in every kitchen, never stocked as a decision.
 *
 * A node for water can only ever be noise in the matcher — nobody adds it to a
 * pantry, and no recipe is unmakeable for want of it. Reviewer's call. The
 * variants matter as much as the base: `ice cubes`, `boiling water`, `filtered
 * water` and `ice water` are ~180 mentions of the same non-decision.
 *
 * `coconut water` and `water chestnuts` are NOT universal — they merely end in
 * the word — so this matches the whole phrase, never a suffix.
 *
 * Nor is `rice water`. Reviewer: "if you don't have rice, then you cannot have
 * it." It is the starchy water from rinsing rice, so it is a thing you either
 * have to hand or do not — which is the definition of an ingredient and the
 * opposite of universal.
 */
export const UNIVERSAL = new Set([
  "water", "cold water", "hot water", "warm water", "boiling water",
  "filtered water", "ice water", "iced water", "lukewarm water", "tap water",
  "room temperature water", "reserved pasta water", "pasta water",
  "ice", "ice cubes", "ice cube", "crushed ice",
  "mushroom soaking water", "soaking water", "reserved water", "starchy water",

  /*
    The same non-decision, written 50 more ways — added 2026-08-09.

    This set is exact-match, so every spelling the corpus invents misses it
    and gets reported as an ingredient we could not read. These 50 were
    blocking 60 recipes for no other reason, and they are all the tap:
    temperature ("tepid", "icy", "boiling hot"), quantity ("qt water",
    "gallons water", "tbap water"), or where it was standing ("noodle
    cooking water", "water saved from the mushrooms").

    Five were refused. `rice starch water` because the reviewer carved rice
    water out of this set by name; `yeast water` is a starter culture;
    `ice shaver machine` is equipment; `water oil` is two ingredients joined
    by a bad parse; `beet water flavored` is flavoured by something you have
    to own.
  */
  "1 5 cup water", "1 tsp water", "2 tbsp water", "artesian water",
  "boiling hot water", "cornstarch mixed + 2 tablespoons water",
  "cornstarch mixed in 2 tablespoons water", "cup water",
  "dried mushroom-soaking water", "drinking water", "enough water",
  "gallon water", "gallons water", "half cup of water",
  "hot boiling water", "ice bath", "ice cubes regular", "ice-cold water",
  "icy water", "light water mist", "litters water", "mushroom water",
  "noodle cooking water", "noodle water", "parts water", "qt water",
  "regular sized ice cubes", "reserved cooking water",
  "reserved mushroom soaking water", "reserved noodle cooking water",
  "residual water from mushrooms", "shiitake mushroom soaking water",
  "shitake mushroom water",
  "shitake mushroom water from hydrating mushrooms",
  "soup ladle of noodle water", "soup ladles of pasta water",
  "soup ladles of starch water", "soup ladles pasta water", "starch water",
  "tablespoona water", "tbap water", "tepid water",
  "up to 2 cups hot water", "water - amount", "water 1 3", "water bath",
  "water for rice wrapper", "water per", "water saved from the mushrooms",
  "water used to rinse rice",
]);

/**
 * Parts that fold into the whole ingredient.
 *
 * `greens` is NOT here. The reviewer kept `collard greens`, `mustard greens`,
 * `chrysanthemum greens`, `leafy greens`, `baby greens` and `mixed greens` —
 * every one a plant in its own right, not a part of something. Only `scallion
 * greens` and `scallion whites` behave like parts, and those are named aliases
 * rather than a rule that would strip the other six.
 */
export const PARTS = ["zest", "peel", "rind", "whites", "tops", "stems"];

/**
 * `juice` is deliberately NOT a part.
 *
 * The reviewer kept `lemon juice`, `lime juice`, `orange juice`, `pineapple
 * juice`, `apple juice`, `ginger juice`, `yuzu juice` and `watermelon juice` as
 * their own nodes — every single one — while folding `juice of 1 lime` and `zest
 * of 1 lemon` into the fruit. That is not a contradiction: `X juice` is a bottle
 * you buy, whereas `juice of X` is a QUANTITY PHRASE the parser failed to strip.
 * Zest is the opposite — nobody sells zest, so it always folds.
 *
 * The `of` form is handled by PART_OF below, which is about parsing, not identity.
 */
export const PART_OF = ["zest", "juice", "peel", "rind"];

/**
 * Category nouns: the head word that says what KIND of thing this is.
 *
 * Two failure modes, one rule. The category appears exactly once:
 *
 *   missing  `chili` → `chili pepper`, `bay` → `bay leaf`, `perilla` → `perilla leaf`
 *   doubled  `mirin wine` → `mirin`, `serrano chili` → `serrano pepper`, `nori seaweed` → `seaweed`
 *
 * A proper noun that already implies its category never gets one bolted on,
 * which is what IMPLIES encodes.
 */
export const CATEGORY: Record<string, string> = {
  chili: "pepper", chilli: "pepper", chile: "pepper",
  bay: "leaf",
  perilla: "leaf",
  sesame: "seed",
};
