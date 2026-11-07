/**
 * EXCEPTIONS — semantic facts, per cuisine.
 *
 * These cannot be derived. `granulated sugar` keeps its modifier and
 * `granulated garlic` does not; `japanese mayonnaise` keeps its origin and
 * `korean mayonnaise` does not; `korean radish` is a different vegetable and
 * `korean perilla` is not. Same shapes, opposite answers, every time because of
 * something true about food rather than something true about English.
 *
 * This file is SUPPOSED to grow. Adding Italian means adding entries here plus
 * vocabulary to rules.ts — never engine logic. What must NOT happen is the
 * general rules stagnating while this file swells, which would mean the engine
 * had quietly become a lookup table with extra steps.
 *
 * Organise additions by cuisine as they arrive. Every entry earns its place by
 * naming the decision that produced it.
 */
import type { ModifierClass } from "./rules.js";

/**
 * Parts that stand alone despite being obtainable from the whole, because a
 * pantry-sized amount of the whole cannot supply a recipe-sized amount.
 */
/**
 * Cuisine vocabulary, merged into the general classes at load.
 *
 * The CLASS is general — a cultivar name always discriminates, a brand name
 * never does, in any cuisine. The WORDS are not: which cultivars exist is a fact
 * about a place. rules.ts claims that adding a cuisine must not change it, and
 * that claim was false while it held a list of Korean chili varieties.
 *
 * This is where a new cuisine lands. Italian brings `san marzano`, `carnaroli`,
 * `00`, `guanciale`; Mexican brings `poblano`, `nixtamalized`, `crema`. Group by
 * cuisine so the cost of each is visible.
 */
export const CUISINE_WORDS: Array<{ cuisine: string; class: string; words: string[] }> = [
  { cuisine: "shared", class: "variety",
    words: ["baby", "cherry", "grape", "roma", "beefsteak", "greek",
            "shiitake", "enoki", "oyster", "king-oyster", "portobello", "cremini",
            "jasmine", "basmati", "sushi", "arborio", "brown-rice",
            "yukon", "russet", "sweet-potato", "cayenne"] },
  { cuisine: "korean", class: "variety",
    words: ["cheongyang", "napa", "gochu"] },
  { cuisine: "korean", class: "grade",
    words: ["cheonilyeom"] },
  { cuisine: "japanese", class: "variety",
    words: ["shishito", "savoy"] },
  { cuisine: "mexican", class: "variety",
    words: ["serrano", "jalapeno", "habanero", "poblano", "anaheim"] },
  { cuisine: "thai", class: "variety",
    words: ["birds-eye"] },
  // Brands: which ones exist is a fact about a market, never about the dish.
  { cuisine: "shared", class: "grade",
    words: ["diamond crystal", "morton", "kikkoman", "lee kum kee", "kewpie brand"] },
];

export const YIELD_LIMITED = new Set(["kimchi juice", "pickle juice", "olive brine", "pasta water"]);

/**
 * Products where an origin word really is just sourcing.
 *
 * Deliberately short, and it must stay short. Everything not listed here keeps
 * its origin, because the failure mode is asymmetric: wrongly keeping `korean
 * mayonnaise` costs one redundant node, while wrongly stripping `chinese
 * broccoli` tells a user that gai lan and broccoli are the same vegetable.
 */
/**
 * Entries an alias row already intercepts have been removed from these tables.
 * They never ran — the alias fires first — and a reader would reasonably think
 * COMMODITY was what governed `vegetable oil` when the alias table does.
 */
export const COMMODITY = new Set([
  "salt", "sea salt", "sugar", "flour", "mayonnaise", "butter", "milk",
  "water", "honey", "zucchini", "mustard", "ketchup", "olive oil", "black pepper", "baking soda", "baking powder", "cornstarch",
  "egg", "eggs", "yogurt", "cream", "vanilla extract", "red chili pepper",
]);


/**
 * Names that already carry their category, so appending one is redundant.
 * `mirin wine` is mirin; `sake wine` is sake; `nori seaweed` is nori.
 */
export const IMPLIES: Record<string, string[]> = {
  mirin: ["wine"],
  sake: ["wine"],
  nori: ["seaweed"],
  wakame: ["seaweed"],
  kombu: ["seaweed"],
  dashima: ["seaweed"],
  miyeok: ["seaweed"],
  gim: ["seaweed"],
  ketchup: ["sauce"],
  serrano: ["chili", "chilli"],
  jalapeno: ["chili", "chilli"],
  // NOT `panko: [breadcrumbs]` or `shaoxing: [wine]`. The reviewer kept both
  // full forms. The redundancy rule only fires where the short name is already
  // the common English name; `panko` alone is not, and stripping it produced a
  // node no shopper would recognise on a label.
};

export const SYNONYM: Record<string, string> = {
  // ── migrated from propose.ts ─────────────────────────────────────────────
  // This lexicon lived in the proposal generator, which meant two tables of the
  // same judgements diverging quietly — the reason `lemon zest` sat in the
  // review queue as its own node while the engine had already settled it. It is
  // exceptions, by every test in this file's header, so it lives here now and
  // there is one copy.

  // gochugaru — one node, per review decision
  "korean chili flakes": "gochugaru", "korean hot pepper flakes": "gochugaru",
  "korean red pepper flakes": "gochugaru", "korean chili powder": "gochugaru",
  "korean red chili pepper flakes": "gochugaru", "gochukaru": "gochugaru",
  // NOT "hot pepper flakes" — reviewer: Korean and Thai pepper flakes differ,
  // so the generic term must stay its own node.
  // guk-ganjang — one node
  "korean soup soy sauce": "soup soy sauce", "guk ganjang": "soup soy sauce",
  "guk kanjang": "soup soy sauce", "gukganjang": "soup soy sauce",
  "soup soy sauce guk ganjang": "soup soy sauce",
  // kelp
  "dasima": "dashima", "dried kelp": "dashima", "kelp": "dashima",
  "sea kelp": "dashima", "dried sea kelp": "dashima",
  // radish
  "mu": "korean radish", "moo": "korean radish", "korean white radish": "korean radish",
  // pastes
  "korean hot pepper paste": "gochujang", "hot pepper paste": "gochujang",
  "red pepper paste": "gochujang", "korean chili paste": "gochujang",
  "soybean paste": "doenjang", "korean soybean paste": "doenjang",
  "fermented soybean paste": "doenjang",
  // rice wine / syrup
  "mirim": "mirin", "sweet rice wine": "mirin", "korean cooking wine": "mirin",
  // NOT bare "corn syrup" — the reviewer's node note (2026-08-09) rules them
  // different products ("corn syrup is glucose syrup from corn, not
  // oligodang"), and the 2026-08-17 audit found this entry contradicting it.
  // What the old entry was RIGHT about — a Korean blogger writing "corn
  // syrup" means mulyeot — is a cuisine reading, and lives in
  // resolution.ts now. The korean-prefixed form IS an identity claim and
  // stays; it needs its own entry because the cuisine-word strip would
  // otherwise land it on the bare node.
  "rice syrup": "oligodang", "korean corn syrup": "oligodang", "korean rice syrup": "oligodang",
  // fish
  "korean anchovy sauce": "aekjeot", "anchovy sauce": "aekjeot",
  "dried anchovies": "myeolchi", "dried anchovy": "myeolchi",
  "salted shrimp": "saeujeot", "fermented shrimp": "saeujeot",
  // noodles / starch
  "sweet potato starch noodles": "dangmyeon", "glass noodles": "dangmyeon",
  "starch noodles": "dangmyeon", "korean glass noodles": "dangmyeon",
  "sweet potato noodles": "dangmyeon",
  "rice cakes": "tteok", "korean rice cakes": "tteok", "tteokbokki tteok": "tteok",
  // aromatics
  "spring onion": "scallion", "green onion": "scallion", "green onions": "scallion",
  "dae pa": "scallion", "asian chives": "buchu", "garlic chives": "buchu",
  "korean chives": "buchu", "perilla leaves": "perilla leaf",
  "sesame leaves": "perilla leaf", "kkaennip": "perilla leaf",
  // seaweed / other
  "gim": "laver", "roasted seaweed": "laver", "seaweed sheets": "laver",
  "toasted sesame oil": "sesame oil", "roasted sesame oil": "sesame oil",
  "korean pear": "asian pear", "nashi pear": "asian pear",
  "brussel sprouts": "brussels sprouts",

  // ── from review notes ───────────────────────────────────────────────────
  // Gochugaru absorbs its descriptive forms. NOT "hot pepper flakes": the
  // reviewer kept that separate because Korean and Thai pepper flakes differ.
  // And no longer bare "red pepper flakes" (audit, 2026-08-17): by the
  // reviewer's own hot-pepper-flakes reasoning the generic term is not
  // gochugaru — an Italian recipe's red pepper flakes are crushed red pepper.
  // It is the generic `chili flakes`, and the Korean reading — which is what
  // the old entry got right — is resolution.ts's business now. The
  // korean-prefixed forms are identity and stay.
  "gochu-garu": "gochugaru", "gochugaru flakes": "gochugaru",
  "red pepper flakes": "chili flakes", "korean red chili powder": "gochugaru",
  "dried red chili peppers": "gochugaru",
  // Cheongyang chilis are closest to serrano in heat and use.
  "green chili pepper": "serrano pepper", "green chili": "serrano pepper",
  "cheongyang chili peppers": "serrano pepper", "cheongyang pepper": "serrano pepper",
  // Named by the reviewer directly.
  "green cabbage": "cabbage", "dark brown sugar": "brown sugar",
  "powdered sugar": "granulated sugar", "active dry yeast": "yeast",
  "vanilla": "vanilla extract", "shaoxing rice wine": "shaoxing wine",
  "clear rice wine": "rice wine", "coarse sea salt": "coarse salt",
  "korean coarse sea salt": "coarse salt", "green onion scallion": "scallion",
  "green onions scallions": "scallion", "distilled white vinegar": "white vinegar",
  "creamy peanut butter": "peanut butter", "ramen egg": "egg",
  // Salt grain and provenance words the old DEMOTE list stripped. `coarse salt`
  // stays its own node — grain size is identity — but these are not.
  "fine salt": "salt", "fine sea salt": "salt", "cooking salt": "salt",
  // `kosher salt` is itself `salt` now (aliases.csv): salt is salt in a pantry,
  // and a brand of it is further still from being a different ingredient.
  "table salt": "salt", "diamond crystal kosher salt": "salt",
  "morton kosher salt": "salt", "diamond crystal salt": "salt",

  // Origin words that ARE just sourcing, where the general rule cannot tell.
  // `korean radish` is a different vegetable; `korean perilla` is perilla grown
  // in Korea. Same shape, opposite answers — so this is a list, like the two above.
  "korean perilla leaf": "perilla leaf",
  "korean perilla leaves": "perilla leaves",
  "korean perilla": "perilla leaves",
  // Kimchi is cabbage kimchi unless it says otherwise; naming the vegetable is
  // redundant, and the reviewer sent both `napa cabbage kimchi` and `sour
  // cabbage kimchi` to plain kimchi.
  "cabbage kimchi": "kimchi",
  "napa cabbage kimchi": "kimchi",
  "fermented cabbage kimchi": "fermented kimchi",
  "hot chicken stock": "chicken stock",
  "rock salt": "salt",
  "serrano chili": "serrano pepper",
  "jalapeno chili": "jalapeno pepper",
  "hot water": "water",
  "scallion greens": "scallion",
  "scallion whites": "scallion",
  "green onion greens": "green onion",
  "bird s eye chili": "thai chili pepper",
  "birds eye chili": "thai chili pepper",
  "bird's eye chili": "thai chili pepper",
  "thai bird chili": "thai chili pepper",
  "eye chili": "thai chili pepper",
  "whipping cream": "heavy cream",
  "whipped cream": "heavy cream",
  "heavy whipping cream": "heavy cream",
  "sweet rice flour": "glutinous rice flour",
  "purple cabbage": "red cabbage",
  "yukon gold potato": "yukon potato",
  "mayo": "mayonnaise",
  "kewpie mayo": "kewpie mayonnaise",
  "japanese mayo": "japanese mayonnaise",
  "myulchi aekjeot": "myeolchi aekjeot",
  "course salt": "coarse salt",
  "course sea salt": "coarse salt",
  "sweet condensed milk": "sweetened condensed milk",
  "sweet red bean paste": "sweetened red bean paste",
  "jasmin rice": "jasmine rice",
  "cheongyang chili pepper": "serrano pepper",
  "yolk": "egg yolk",
  "bean sauce": "ground bean sauce",
};

/**
 * State words that must be KEPT, because the base cannot be transformed at home.
 *
 * Reviewer, settling `granulated sugar` against `granulated garlic`: "granulated
 * sugar is not possible to create on-site. you should buy it. garlic can be made
 * on site with the whole garlic."
 *
 * So the `state` test — can the cook produce this in one session? — is about the
 * INGREDIENT, not the word. `granulated` strips from garlic, because whole
 * garlic is a thing you own and can grind; it stays on sugar, because nothing in
 * a pantry turns into granulated sugar. The word alone cannot decide, so the
 * pairs are listed.
 */
/**
 * Lines that name two ingredients, where the reviewer named both halves.
 *
 * The general conjunction rule handles `X and Y Z` when it can tell what
 * distributes. These are the ones it cannot: `mirin sake` has no conjunction at
 * all, and `green` is a parse remnant of "green and red leaf lettuce". Each was
 * written out by hand during review.
 */
export const SPLIT: Record<string, string[]> = {
  "white and black sesame seeds": ["white sesame seeds", "black sesame seeds"],
  "black and white sesame seeds": ["white sesame seeds", "black sesame seeds"],
  "white black sesame seeds": ["white sesame seeds", "black sesame seeds"],
  "peas and carrots": ["peas", "carrots"],
  "kimchi and kimchi juice": ["kimchi", "kimchi juice"],
  "mirin sake": ["mirin", "sake"],
  "garlic and onion powder": ["garlic powder", "onion powder"],
  "chili oil with chili flakes": ["chili oil", "chili flakes"],
  "green and": ["green chili pepper", "red chili pepper"],
};

/**
 * Preservation words that never discriminate, because the fresh form is not a
 * thing anyone buys.
 *
 * Reviewer, three times: "soybean. it's always dry", "rice vermicelli. it's
 * always dry", "pasta. there's no wet pasta." The `preservation` class keeps
 * `dried` by default and is right to — dried shiitake is not fresh shiitake —
 * but where no fresh form exists the word carries nothing.
 *
 * Listed rather than derived. The tempting general rule is "strip when the
 * corpus has no `fresh X`", and it would be wrong the first time a corpus
 * happens not to mention fresh shiitake. Three examples do not make a rule.
 */
export const ALWAYS_PRESERVED = new Set([
  "soybeans", "soybean", "pasta", "spaghetti", "rice vermicelli",
  "vermicelli", "rice noodles", "lentils", "split peas",
  "chickpeas", "kidney beans", "black beans", "barley", "couscous",
]);

export const PURCHASED_FORM = new Set([
  "granulated sugar", "white granulated sugar", "confectioners sugar", "icing sugar", "brown sugar", "rock sugar",
  "raw sugar", "caster sugar", "instant coffee", "condensed milk", "evaporated milk",
  "desiccated coconut", "shredded coconut",
]);

/**
 * Origin + commodity combinations that name a real product.
 *
 * Reviewer, settling `japanese mayonnaise` against `korean mayonnaise`: "there
 * is no Korean mayo. but there is japanese mayo. the distinction is from
 * semantic, it cannot be logiced."
 *
 * That is the honest reason this is a list and not a rule. Whether a country has
 * a distinct version of a commodity is a fact about the world's kitchens, and no
 * amount of string analysis recovers it. Anything absent here is treated as
 * sourcing and stripped.
 */
export const ORIGIN_PRODUCT = new Set([
  "japanese mayonnaise", "japanese curry",
  "chinese five spice", "italian seasoning",
]);

/**
 * Slots: nodes that are a CHOICE, not an ingredient.
 *
 * A recipe naming a slot must resolve to one child; a pantry entry matching a
 * slot must be clarified before it can match. This is the one thing no modifier
 * table can decide, because the fact lives in cooking rather than in language —
 * `nori seaweed` and `dried wakame seaweed` look like the same word plus noise,
 * and collapsing them would let a nori-owning user match a miyeok soup.
 *
 * Naming convention (reviewer's): `<slot> - <name>/<name>`, most internationally
 * recognised name first, native romanisation second. The display string is
 * DERIVED from `names`, never stored, so adding a fourth alias cannot leave the
 * canonical stale.
 */
export type SlotChild = {
  /** Recognised names, most widely known first. Drives the display string. */
  names: string[];
  /** Surface forms that resolve here but do not appear in the display name. */
  aliases?: string[];
  note?: string;
};

export const SLOTS: Record<string, { because: string; children: SlotChild[] }> = {
  seaweed: {
    because:
      "Three unrelated species doing three unrelated jobs. Reviewer: 'In Asia, " +
      "miyeok (wakame) and gim (nori) are completely different ingredients. When " +
      "a user adds this to a pantry, it should be clarified.' Corpus evidence " +
      "forced a third: dashima has 111 mentions, more than seaweed, laver and " +
      "nori combined, and it is the broth kelp — a third genus, not a variant.",
    children: [
      {
        names: ["nori", "gim"],
        aliases: ["kim", "laver", "seaweed paper", "dried seaweed paper", "seaweed sheets",
                  "roasted seaweed", "seasoned seaweed", "seaweed snack", "crumbled seaweed",
                  "seaweed flakes", "gim gui"],
        note: "Pressed sheets (Porphyra). Wraps and garnish.",
      },
      {
        names: ["wakame", "miyeok"],
        aliases: ["dried wakame", "dried miyeok", "sea mustard"],
        note: "Soup seaweed (Undaria). Rehydrates into miyeok-guk.",
      },
      {
        names: ["kombu", "dashima"],
        aliases: ["kelp", "dasima", "sea kelp", "dried kelp", "konbu"],
        note: "Broth kelp (Saccharina). Steeped for stock, then discarded.",
      },
      {
        names: ["aonori"],
        aliases: ["green laver", "green seaweed"],
        note: "Powdered green laver used as a topping. Not interchangeable with sheet nori.",
      },
    ],
  },
};

/**
 * Modifiers whose class is genuinely arguable, surfaced in the QC artifact
 * rather than decided silently.
 *
 * Recording these is the point: a wrong guess buried in a 400-word table costs
 * more than a wrong guess the reviewer can see. Each needs one yes/no, once.
 */
export const CONTESTED: Array<{ word: string; assigned: string; question: string }> = [
  { word: "toasted", assigned: "state",
    question: "Toasted sesame oil is a different bottle from plain sesame oil in Asian cooking, but this corpus uses them interchangeably. Strip, or promote to variety?" },
  { word: "frozen", assigned: "state",
    question: "A cook can freeze anything, but frozen peas and dumplings are purchases. Strip, or promote to preservation?" },
  { word: "instant", assigned: "preservation",
    question: "Instant yeast vs active dry yeast — reviewer merged both to `dry yeast`, which implies strip. Instant dashi vs dashi does not." },
  { word: "sea", assigned: "variety",
    question: "Reviewer sent `korean sea salt` and `flaky sea salt` to `salt`, which implies strip; but `coarse salt` survived as its own node." },
];
