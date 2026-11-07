/**
 * Allergen and animal-source tagging — INGREDIENT-SPEC §4.
 *
 * These are the only two attributes an Ingredient carries, and they survived
 * the test §4 applies to every attribute: the vocabulary is closed and
 * externally defined (the major-allergen lists are not ours to invent), the
 * consumer is the dietary filter (USER-SPEC §6), and a wrong value announces
 * itself the first time a filtered recipe appears.
 *
 * ── The asymmetry that shapes every rule below ─────────────────────────────
 *
 * §4: *"a missing tag is the dangerous direction, so review must be biased
 * toward over-tagging: an ingredient wrongly marked as containing soy costs a
 * hidden recipe, and one wrongly marked clean costs something else entirely."*
 *
 * So POSITIVE rules are generous and NEGATIVE rules are expensive. Every
 * exclusion in `NOT` is a claim that something does **not** contain an
 * allergen, which is the direction that hurts, and each one carries its reason.
 *
 * This is not a safety device. USER-SPEC §6 is explicit: we assert *contains*,
 * never *free of*, and a recipe with anything unresolved is hidden rather than
 * cleared. This file produces "contains" claims. Nothing here licenses telling
 * anyone a dish is safe.
 */

/** The major-allergen list. Closed, and not ours to extend. */
export const ALLERGENS = [
  "peanut", "treenut", "milk", "egg", "soy", "wheat", "fish", "shellfish", "sesame",
] as const;
export type Allergen = (typeof ALLERGENS)[number];

/** Provenance, which is a different question from allergy (INGREDIENT-SPEC §4). */
export type AnimalSource = "meat" | "fish" | "dairy" | "egg";

const rx = (words: string[]) =>
  new RegExp("(^|[^a-z])(" + words.join("|") + ")([^a-z]|$)", "i");

type Rule = { allergen: Allergen; test: RegExp; because: string };

/**
 * Positive rules. Deliberately broad — see the asymmetry above.
 */
const RULES: Rule[] = [
  { allergen: "peanut", test: rx(["peanuts?", "groundnuts?"]),
    because: "peanut in the name" },

  { allergen: "treenut",
    test: rx(["almonds?", "cashews?", "walnuts?", "pecans?", "pistachios?", "hazelnuts?",
              "macadamias?", "chestnuts?", "pine nuts?", "brazil nuts?", "marzipan",
              "praline", "nutella", "gingko|ginkgo"]),
    because: "named tree nut" },

  { allergen: "milk",
    test: rx(["milk", "butter", "buttermilk", "cheese", "cream", "creamer", "yogurt",
              "yoghurt", "ghee", "paneer", "whey", "casein", "custard", "condensed milk",
              "half and half", "mascarpone", "ricotta", "mozzarella", "parmesan",
              "cheddar", "gouda", "brie", "feta", "queso", "kefir", "gelato",
              "ice cream", "milkfat", "curd"]),
    because: "dairy word in the name" },

  { allergen: "egg",
    test: rx(["eggs?", "egg white", "egg yolk", "mayonnaise", "mayo", "meringue",
              "aioli", "custard", "hollandaise", "albumen"]),
    because: "egg or an egg-built product" },

  { allergen: "soy",
    test: rx(["soy", "soya", "soybeans?", "tofu", "edamame", "miso", "doenjang",
              "gochujang", "ssamjang", "chunjang", "tempeh", "natto", "yuba",
              "bean curd", "beancurd", "tamari", "ponzu", "hoisin", "teriyaki",
              "oyster sauce", "black bean sauce", "douchi", "fermented black beans?"]),
    because: "soy, or a sauce conventionally built on it" },

  { allergen: "wheat",
    test: rx(["wheat", "flour", "bread", "breadcrumbs?", "panko", "pasta", "noodles?",
              "udon", "somen", "ramen", "soba", "couscous", "semolina", "seitan",
              "gluten", "barley", "malt", "farro", "spelt", "bulgur", "cracker",
              "biscuit", "cookie", "cake", "pastry", "wonton", "dumplings?",
              "spring roll wrappers?", "gyoza wrappers?", "pie crust", "puff pastry",
              "soy sauce", "hoisin", "doenjang", "gochujang", "tempura", "roux",
              "beer", "phyllo|filo"]),
    because: "wheat, or a product conventionally made with it" },

  { allergen: "fish",
    test: rx(["fish", "anchovy|anchovies", "salmon", "tuna", "cod", "mackerel",
              "sardines?", "bonito", "katsuobushi", "dashi", "myeolchi", "aekjeot",
              "nam pla", "worcestershire", "caviar", "roe", "pollock", "halibut",
              "tilapia", "trout", "eel", "unagi", "snapper", "flounder", "croaker",
              "hairtail", "sea bass", "yellowtail", "monkfish", "surimi"]),
    because: "fish, or a fish-built seasoning" },

  /**
   * Kimchi — the false negative DIET-FILTER-SWEEP called the one that
   * matters, fixed 2026-08-17 on the curator's decision. Traditional and most
   * commercial kimchi is seasoned with jeotgal: fermented anchovy or fish
   * sauce (fish), as often saeujeot — salted shrimp (shellfish). Tagging the
   * word covers kimchi juice and kimchi brine too, which carry the same
   * seasoning. The vegan variant is cleared below, by name, because it omits
   * jeotgal BY DEFINITION — not merely by label.
   */
  { allergen: "fish", test: rx(["kimchi"]),
    because: "jeotgal — fermented anchovy or fish sauce — seasons most kimchi" },
  { allergen: "shellfish", test: rx(["kimchi"]),
    because: "the jeotgal is as often saeujeot, salted shrimp" },
  { allergen: "fish", test: rx(["imitation crabs?"]),
    because: "surimi — pollock pressed into crab shape; the crab word already tags shellfish" },

  { allergen: "shellfish",
    test: rx(["shrimps?", "prawns?", "crabs?", "lobsters?", "crayfish", "oysters?",
              "clams?", "mussels?", "scallops?", "squid", "calamari", "octopus",
              "abalone", "cockle", "whelk", "conch", "krill", "saeujeot",
              "oyster sauce", "shrimp paste", "belacan", "XO sauce"]),
    because: "crustacean or mollusc" },

  { allergen: "sesame",
    test: rx(["sesame", "tahini", "benne", "gomashio", "za'?atar", "halva", "hummus"]),
    because: "sesame in the name or the product" },
];

/**
 * Hand-justified exclusions — the expensive direction.
 *
 * Matched against the WHOLE node name, lowercased, so a loose word can never
 * clear a tag by accident. Every entry is a claim that a thing does not contain
 * an allergen the rules above thought it did, and every one needs a reason a
 * person can check.
 */
const NOT: Array<{ name: RegExp; clears: Allergen[]; because: string; unless?: RegExp }> = [
  { name: /^(king |golden |brown |white )?oyster mushrooms?( log)?$/,
    clears: ["shellfish"], because: "a mushroom named for its shape; no oyster in it" },
  { name: /^(dried |canned |sliced )?water chestnuts?$/,
    clears: ["treenut"], because: "an aquatic corm, not a nut" },
  { name: /^(purple |green |red )?perilla( leaf| leaves| oil| seeds?| powder)?$/,
    clears: ["sesame"], because: "Perilla frutescens is a mint; sesame is Sesamum indicum" },
  { name: /^(dried )?seaweed - kombu\/dashima$/,
    clears: ["fish"], because: "kelp. `dashi` in the display string is the romanised name, not stock" },
  { name: /^(dried |instant )?kelp$/, clears: ["fish"], because: "seaweed" },
  { name: /^coconut( milk| cream| water| oil| flakes?| sugar)?$/,
    clears: ["treenut", "milk"], because: "a drupe, and 'milk' here is the liquid from it" },
  { name: /^(soy|almond|oat|rice|cashew|coconut) milk$/,
    clears: ["milk"], because: "plant milks contain no dairy — their own allergen still tags" },
  { name: /^peanut oil$/, clears: [], because: "kept: refined peanut oil is usually tolerated, but §4 says over-tag" },
  { name: /^cream of tartar$/, clears: ["milk"], because: "potassium bitartrate, a wine by-product" },
  { name: /^(baking )?soda$/, clears: ["milk"], because: "no dairy; matched nothing but the word" },
  { name: /^butternut squash$/, clears: ["milk", "treenut"], because: "a squash" },
  { name: /^butter lettuce$/, clears: ["milk"], because: "a lettuce" },
  { name: /^peanut butter( chips)?$/, clears: ["milk"], because: "no dairy in it; peanut still tags" },
  { name: /^shea butter$/, clears: ["milk"], because: "a plant fat" },
  { name: /^cocoa butter$/, clears: ["milk"], because: "cocoa fat, no dairy" },
  { name: /^apple butter$/, clears: ["milk"], because: "cooked fruit" },
  { name: /^(vegan|vegetarian) .*$/, clears: [], because: "kept: 'vegetarian oyster sauce' still usually contains soy and wheat" },
  { name: /^vegan kimchi$/, clears: ["fish", "shellfish"],
    because: "vegan kimchi omits jeotgal by definition, not merely by label; its soy and wheat (gochugaru paste, soy sauce) still tag" },
  { name: /^egg(plant|plants)$/, clears: ["egg"], because: "a nightshade" },
  { name: /^buckwheat( flour| noodles?)?$/, clears: [], because: "kept: buckwheat is not wheat, but noodles sold as soba are usually cut with wheat" },
  { name: /^rice noodles?$/, clears: ["wheat"], because: "rice noodles are rice; wheat matched the word 'noodle'" },
  { name: /^(glass|sweet potato|mung bean) noodles?$/, clears: ["wheat"], because: "starch noodles, no wheat" },
  { name: /^rice flour$/, clears: ["wheat"], because: "rice" },
  { name: /^(potato|corn|tapioca|sweet potato) (starch|flour)$/, clears: ["wheat"], because: "not a cereal flour" },
  { name: /^almond flour$/, clears: ["wheat"], because: "ground almonds; treenut still tags" },
  { name: /^coconut cream$/, clears: ["milk"], because: "coconut" },
  { name: /^ice$/, clears: ["milk"], because: "water; matched 'ice cream' loosely" },

  /**
   * Named non-wheat grains, matched anywhere in the name rather than as the
   * whole of it.
   *
   * The anchored rules above missed `dried rice noodles`, `glutinous rice
   * flour`, `mung bean glass noodles` and a long tail like them — the word
   * `noodle` or `flour` pulled in wheat and nothing took it back out. Over 40
   * nodes, which is most of the Korean and Chinese starch vocabulary, and
   * hiding all of it from a wheat-sensitive user is a real cost.
   *
   * `unless` is the guard that keeps this honest: a name that ALSO says wheat
   * keeps the tag. `wheat starch` and `rice and wheat noodles` are not cleared
   * by mentioning rice.
   */
  /* No `buckwheat` in this alternation: rice/mung-bean/potato noodles are
     genuinely wheat-free, but noodles sold as soba are usually CUT with wheat
     (DIET-FILTER-SWEEP) — the wheat tag stays on those. */
  { name: /\b(rice|glutinous rice|sweet rice|mung bean|glass|cellophane|sweet potato|potato|corn|tapioca|chickpea|almond|coconut)\b.*\b(noodles?|vermicelli|flour|starch|cake|paper|wrappers?|stick)/,
    clears: ["wheat"],
    because: "the name states a non-wheat grain or starch",
    unless: /\b(wheat|flour blend|all.purpose|bread|udon|somen|ramen|soba)\b/ },
  { name: /\b(noodles?|vermicelli|flour|starch)\b.*\b(rice|mung bean|glass|sweet potato|potato|corn|tapioca)\b/,
    clears: ["wheat"],
    because: "same rule, written the other way round (`flour, rice`)",
    unless: /\b(wheat|all.purpose|bread)\b/ },
  { name: /^(tteok|garae.?tteok|dduk|ddeok)\b/, clears: ["wheat"],
    because: "Korean rice cake is rice" },
];

const clean = (s: string) => s.toLowerCase().trim();

/**
 * Allergens this ingredient contains, as far as its NAME can tell us.
 *
 * Name-based and therefore incomplete by construction — which is exactly why
 * USER-SPEC §6 hides recipes carrying anything unresolved instead of trusting
 * this to be exhaustive.
 */
export function allergensOf(name: string): Allergen[] {
  const n = clean(name);
  if (!n) return [];
  const found = new Set<Allergen>();
  for (const r of RULES) if (r.test.test(n)) found.add(r.allergen);
  for (const ex of NOT) {
    if (!ex.name.test(n)) continue;
    // A name that independently names the allergen keeps the tag. Clearing
    // `wheat` off `rice and wheat noodles` because it says "rice" is exactly
    // the direction §4 forbids.
    if (ex.unless && ex.unless.test(n)) continue;
    for (const a of ex.clears) found.delete(a);
  }
  return ALLERGENS.filter((a) => found.has(a));
}

const MEAT = rx(["beef", "pork", "chicken", "lamb", "mutton", "duck", "goose", "turkey",
                 "bacon", "ham", "sausages?", "gelatin", "gelatine", "lard", "tallow",
                 "brisket", "ribs?", "loin", "belly", "shank", "tripe", "liver",
                 "gizzard", "oxtail", "bulgogi", "spam", "prosciutto", "pancetta",
                 "chorizo", "salami", "pepperoni", "anchovy paste", "bone broth",
                 "chicken stock", "beef stock", "pork stock", "meatballs?", "mince",
                 "ground (beef|pork|chicken|turkey|lamb)", "veal", "venison", "rabbit"]);

const NOT_MEAT = [
  /* `imitation` is deliberately NOT in this prefix guard: imitation crab is
     pollock — an animal — and zeroing its source made a pescatarian's filter
     wrong in the safe direction and a vegetarian's wrong in the unsafe one.
     Imitation MEATS are named below instead. */
  { name: /^(vegan|vegetarian|plant.based|mock) /, because: "explicitly not meat" },
  { name: /^imitation (beef|pork|chicken|meat|bulgogi)/, because: "plant protein shaped as meat" },
  { name: /^chicken (mushrooms?|of the woods)$/, because: "a fungus" },
  { name: /^beef(steak)? tomato(es)?$/, because: "a tomato" },
  { name: /^(vegetable|mushroom|kombu|dashima) (stock|broth)$/, because: "no animal in it" },
];

/**
 * Where this came from, if an animal.
 *
 * Separate from allergens because it answers a different question — vegetarian
 * is a choice about provenance, milk allergy is a reaction to a protein.
 * Gelatin is meat-derived and not an allergen; sesame oil is an allergen and
 * not animal (INGREDIENT-SPEC §4).
 *
 * One value, most specific first: something that is both meat and dairy in name
 * is almost always the meat.
 */
export function animalSourceOf(name: string): AnimalSource | null {
  const n = clean(name);
  if (!n) return null;
  for (const ex of NOT_MEAT) if (ex.name.test(n)) return null;
  const a = allergensOf(n);
  if (MEAT.test(n)) return "meat";
  if (a.includes("fish") || a.includes("shellfish")) return "fish";
  if (a.includes("milk")) return "dairy";
  if (a.includes("egg")) return "egg";
  return null;
}
