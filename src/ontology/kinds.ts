/**
 * Ingredient kind — what section of the shop it comes from.
 *
 * A new global attribute, which reverses "the ingredient carries nothing" for
 * the second time. It passes the test in INGREDIENT-SPEC §4 on all three counts:
 * the vocabulary is closed and small, three things read it (pantry grouping, the
 * dietary filter, and slot resolution for `protein`), and a wrong value is
 * obvious the moment an ingredient appears under the wrong heading.
 *
 * ONE AXIS. `category` on recipes mixed dish type with meal time and difficulty
 * and became unusable (RECIPE-SPEC §4a); the same mistake here would produce a
 * field that cannot be filtered on. This is provenance-and-shop-section only —
 * not role in a dish, not preparation, not cuisine.
 *
 * `dairy` and `egg` are separate because vegan needs them separate, and `meat`
 * and `seafood` because most people who avoid one still eat the other.
 */
export type Kind =
  | "produce" | "meat" | "seafood" | "dairy" | "egg"
  | "grain" | "legume" | "nut-seed" | "condiment" | "spice"
  | "oil-fat" | "sweetener" | "beverage" | "other";

export const KINDS: Kind[] = [
  "produce", "meat", "seafood", "dairy", "egg", "grain", "legume",
  "nut-seed", "condiment", "spice", "oil-fat", "sweetener", "beverage", "other",
];

/**
 * Lexicon, ordered — the FIRST match wins, so the specific patterns come first.
 *
 * Order is load-bearing and easy to get wrong: `fish sauce` is a condiment, not
 * seafood, and `sesame oil` is a fat, not a seed. Both would be misfiled by an
 * alphabetical list, and both are common enough that the error would be visible
 * immediately — which is the argument for a lexicon over a guess.
 */
const LEXICON: Array<[Kind, RegExp]> = [
  ["condiment", /sauce|paste|jang\b|vinegar|mayo|ketchup|mustard|kimchi|jeot|aekjeot|miso|stock|broth|dashi|marinade|dressing|syrup\b(?!.*\bmaple)|sriracha|sambal|yondu|tsuyu|maesil|ponzu|worcestershire|tabasco|furikake|wasabi|horseradish|relish|chutney|salsa|pesto|tahini|hummus|extract\b|essence\b|danmuji|jangajji|pickle|mirin|doubanjiang|gochujang|ssamjang|chunjang|oyster|hoisin|maltose|molasses(?!.*sugar)|kecap|jam\b|preserves\b|marmalade|shaoxing|shao ?hsing|cooking wine|rice wine|huangjiu|mijiu/i],
  ["oil-fat",   /\boil\b|butter|ghee|lard|shortening|tallow|margarine/i],
  ["spice",     /pepper(?:corn)?s?\b|powder|flakes|gochugaru|cinnamon|cumin|coriander seed|turmeric|paprika|nutmeg|clove\b|star anise|bay leaf|five spice|seasoning|\bsalt\b|herb|thyme|oregano|rosemary|sage\b|dill\b|marjoram|tarragon|cayenne|chili powder|togarashi|sancho|curry powder|yeast\b|baking (?:powder|soda)|msg\b|bouillon|allspice|cardamo[nm]|fennel seed|saffron|vanilla|coriander|matcha/i],
  ["sweetener", /sugar|honey|molasses|agave|oligodang|sweetener|stevia|maltose|marshmallow|condensed milk/i],
  ["seafood",   /katsuobushi|bonito|eomuk|odeng|dasima|dashima|fish\b|shrimp|prawn|crab|lobster|clam|oyster|mussel|scallop|squid|octopus|anchov|salmon|tuna|mackerel|pollock|cod\b|eel\b|roe\b|seaweed|kelp|nori|wakame|dashima|myeolchi|saeujeot/i],
  ["meat",      /hot dogs?\b|beef|pork|chicken|lamb|duck|turkey|bacon|ham\b|sausage|brisket|belly|thigh|breast|rib\b|ribs\b|meat|mince|spam/i],
  ["dairy",     /creme fraiche|milk|cheese|cream|yogurt|kefir|buttermilk|mozzarella|cheddar|parmesan|parmigiano|feta|ricotta|mascarpone|half.and.half|half-and-half/i],
  ["grain",     /rice|flour|noodle|pasta|bread|panko|starch|oats|barley|tteok|wheat|udon|soba|som(?:en|yeon)|ramen|vermicelli|tortilla|cracker|spaghetti|macaroni|couscous|quinoa|wrapper|dumpling|gyoza|mandu|bun\b|buns\b|cake mix|pancake mix|frying mix|breadcrumb|crouton|cereal|corn ?starch|potato ?starch|glass noodle|dangmyeon|pastry|inari|tortilla|pita|naan|cake\b|baguette|injeolmi|yubu|brioche|bagel/i],
  /*
    `eggplant` is a plant and `egg noodles` are noodles: the head noun is the
    last word, and this pattern was reading the first. It sat above `grain`
    matching a bare /\begg/, so seven eggplants and eight egg noodles walked
    to the dairy aisle — the misfiling this file's own header admitted to.

    Two edits, both about that: `grain` now runs first, so a compound naming
    a grain AND an egg is shopped where the grain is; and `(?!plant)` sends
    the aubergines to produce, which already lists them. `eggshell` stays
    egg, which is what it is made of.
  */
  ["egg",       /\begg(?!plant)/i],
  ["legume",    /inari|bean|tofu|lentil|pea\b|peas\b|chickpea|soy\b|edamame|tempeh|natto/i],
  ["nut-seed",  /nut\b|nuts\b|almond|cashew|walnut|pecan|pistachio|sesame seed|seeds?\b|peanut/i],
  /*
    Drinks you drink. A cooking wine is not one of them: shaoxing and rice
    wine are on the seasoning shelf of an Asian grocer, next to the soy and
    the vinegar, so that is where this walks you — they are caught by the
    `condiment` line above, which runs first. Sake, soju and makgeolli stay
    here: they are cooked with too, but they are sold as drinks, and the
    only question this file answers is where you walk.
  */
  ["beverage",  /wine|beer|soju|makgeolli|sake\b|juice|tea\b|coffee|cola|soda|bourbon|whisk(?:e)?y|vodka|rum\b|brandy|sprite|seltzer|cider\b/i],
  ["produce",   /onion|garlic|ginger|scallion|leek|cabbage|radish|carrot|potato|cucumber|zucchini|mushroom|spinach|lettuce|chili|pepper\b|tomato|apple|pear|lemon|lime|orange|berry|berries|greens|sprout|chive|perilla|herb|basil|cilantro|parsley|mint|fruit|vegetable|avocado|jalapeno|bok choy|bamboo shoot|asparagus|lotus root|watermelon|taro\b|watercress|minari|\bcorn\b|squash|kabocha|pumpkin|jujube|raisin|date\b|dates\b|plum|peach|mango|banana|melon|grape|cherry|celery|broccoli|cauliflower|eggplant|okra|turnip|beet|kale|chard|arugula|rocket|shallot|scallop squash|gourd|yam\b|parsnip|leaf|leaves|namul|gosari|fernbrake|dropwort|chrysanthemum|buchu|choy sum|crown daisy|burdock|daepa|daikon|kiwi|tangerine|serrano|habanero|poblano|shishito|caper|shiso|sisho|garland|aehobak|deodeok|doraji|balloon flower|bellflower|sprouts?\b|artichoke|zucchini|cress|galangal|lily flower|cherries|cherry|lily bulb|chestnut|persimmon|quince|citron|yuja|apricot(?!.*jam)/i],
];

/** Best guess for a node name, or null when nothing matches. */
export function guessKind(name: string): Kind | null {
  for (const [kind, re] of LEXICON) if (re.test(name)) return kind;
  return null;
}
