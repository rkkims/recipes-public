/**
 * Parser regression cases.
 *
 *   npm run test-parser
 *
 * Every case here is a real line from data/raw that produced a wrong head, and
 * the reviewer caught it by hand. Once caught, it belongs in a file — the same
 * argument as agreement.ts makes for the ontology: manual review is expensive
 * and should never have to find the same defect twice.
 *
 * No framework. A list, a loop, and a non-zero exit.
 */
import { headName } from "./frequency.js";

const CASES: Array<[raw: string, want: string, why: string]> = [
  // ── the curator's Fried Tofu Salad flag (2026-08-20) ──
  ["3 to 4 cupfuls Vegetables of your choice", "vegetables",
   "cupfuls was not a unit word, so the head became 'cupfuls vegetables'"],
  ["2 cupfuls dashi stock", "dashi stock", "same unit, resolvable head"],
  // ── the missing-main class (2026-08-19): recipes whose TITLE ingredient
  //    parsed to nothing, so the matcher called them complete without it ──
  ["¾–1 lb boneless, skinless chicken thighs", "boneless skinless chicken thighs",
   "unicode-fraction range: the en-dash survived and cut the line to ¾"],
  ["1½ pounds boneless, skinless chicken thighs (trimmed as needed (about 4 thighs))",
   "boneless skinless chicken thighs", "mixed token 1½ defeated the adjective guard"],
  ["2  boneless, skin-on chicken thighs ((about 7.4 oz (210 g) each))", "boneless skin-on chicken thighs",
   "nested parens left orphan fragments that polluted the comma guard"],
  ["2 tablespoons plus 1 teaspoon apple cider vinegar", "apple cider vinegar",
   "pure-quantity segment before `plus` deleted the name"],
  ["1/2 cup packed, sliced kimchi", "kimchi",
   "processing word before the comma cut the head to `packed`"],
  ["1  whole frozen or fresh pollock ((Dongtae))", "whole pollock",
   "multi-word modifier-only left of `or` kept `whole` as the head"],
  ["8 ounces boneless (skinless chicken breast or thigh (fat removed))", "skinless chicken breast",
   "the name lived inside the parenthetical; head was `boneless`"],
  ["2 cornish hens. Each hen weighs about 1½ pounds, a nice portion for 1 person.",
   "cornish hens", "the sentence after the name was kept and drowned it"],
  ["2 blocks firm or extra firm tofu ((anywhere from 14-16 oz. per package))", "firm tofu",
   "`blocks` counted as identity, so the or-branch kept the bare modifier"],

  ["2 tbsp Extra Virgin Olive Oil", "extra virgin olive oil",
   "spaced spelling lost `extra` to the degree strip and changed retail grade"],

  // ── leaf-identity plants ────────────────────────────────────────────────
  ["1  bay leaf", "bay leaf", "`leaf` is in PORTION and stripped the identity"],
  ["10  perilla leaves (sliced)", "perilla leaves", "same; 101 mentions became `perilla`"],
  ["2 kaffir lime leaves", "kaffir lime leaves", "compound leaf name"],
  ["10 leaves perilla", "perilla leaves", "leaf word came first; prefix stripper ate it"],
  ["1 tablespoon sesame oil", "sesame oil", "`sesame` alone must not gain a leaf"],

  // ── possessive that is not a brand ──────────────────────────────────────
  ["4-5  bird's eye chilies (bruised)", "bird eye chilies", "BRAND ate `bird's` → `eye chilies`"],

  // ── processing word that is part of the product name ────────────────────
  ["2 tablespoons ground bean sauce", "ground bean sauce", "a jarred condiment, not ground sauce"],
  ["½ lb ground meat (beef, chicken, turkey, pork, shrimp)", "ground meat", "the generic protein slot"],
  ["1/2 cup Korean frying mix (tempura)", "korean frying mix", "`frying` stripped → `korean mix`"],

  // ── portion and quantifier vocabulary ───────────────────────────────────
  ["2 envelope (about 4 1/2 tsp) active dry yeast", "dry yeast", "`envelope` not a portion word"],
  ["2 large scoops vanilla ice cream", "vanilla ice cream", "`scoop` not a portion word"],
  ["2 (6 oz can) lump crab meat (drained well)", "crab meat", "`lump` not a portion word"],
  ["1 lb very thinly sliced beef - prime rib eye", "beef", "`very` survived the adverb strip"],
  ["2 lb single chicken wings", "chicken wings", "`single` is a count, not identity"],
  ["3 lbs thick cut pork belly", "pork belly", "`thick cut` written unhyphenated"],
  ["8 oz thick cut bacon (roughly chopped)", "bacon", "same"],
  ["2 tbsp flat leaf parsley (chopped)", "parsley", "`flat leaf` is a variety the reviewer merged"],

  ["1 cup broccoli florets", "broccoli", "`floret` is a portion word"],
  ["1 an english cucumber", "english cucumber", "leading article"],
  ["2 jalapeños, sliced", "jalapenos", "accents folded, not deleted"],
  ["1/4 cup crème fraîche", "creme fraiche", "same"],
  ["4 tbsp unsalted butter, at room temperature", "unsalted butter", "trailing state clause"],
  ["1 cup milk of choice", "milk", "`of choice` is a hedge, not a name"],
  ["2 bundle mung bean glass noodles", "mung bean glass noodles", "`bundle` is a portion word"],
  ["2 1/2 lb (1.1 kg) beef short ribs", "beef short ribs", "`ribs` is a cut here, not a portion"],

  // ── numeric range written with spaces ───────────────────────────────────
  // 106 lines across 9 sources produced an EMPTY head: " - " is the delimiter
  // for a trailing clause ("beef - prime rib eye"), so the line was cut at its
  // own quantity. Found while scoring site rules against curated corrections.
  // `plump` and the "parts of" prefix are koreanbapsang rules, not general ones —
  // these cases assert only that the RANGE no longer destroys the line.
  ["7 - 8  plump garlic cloves", "plump garlic", "spaced range cut the line at `7`"],
  ["3 - 4  green chili peppers (or 1 green bell pepper, julienned)", "green chili peppers", "same"],
  ["2 - 3  white parts of large scallions", "white parts of scallions", "same"],
  ["1 lb very thinly sliced beef - prime rib eye", "beef", "the clause split must still work"],
  ["4  caps white mushrooms - optional", "caps white mushrooms", "and still cut a trailing `- optional`"],

  // ── measurement written as "<part> of <ingredient>" ────────────────────
  ["Zest of 1 lemon", "lemon zest", "a quantity phrase; canonical word order"],
  ["zest from 1 lemon", "lemon zest", "same, `from` spelling"],
  ["Juice of half a lime", "lime juice", "quantity is `half a`"],
  ["juice from kimchi", "kimchi juice", "must NOT fold — kimchi juice is its own node"],
  ["2 tbsp lemon juice", "lemon juice", "already canonical; unchanged"],

  // ── "or" and "/" alternations ───────────────────────────────────────────
  ["1/4 cup  water or kelp broth (to rinse)", "water", "borrowing gave `water broth`"],
  ["1 tsp sugar or agave nectar", "sugar", "slash/or borrowing gave `sugar nectar`"],
  ["1 tbsp vegetable or olive oil", "vegetable oil", "borrowing IS right when left is a modifier"],
  ["1 tablespoon white or apple cider vinegar", "white vinegar", "same"],

  // ── grain length is identity, not size ──────────────────────────────────
  ["2 1/2 cups medium grain white rice", "medium grain white rice", "gave `grain white rice`"],

  // ── things that already worked and must keep working ────────────────────
  ["3 cloves garlic, minced", "garlic", ""],
  ["1 tablespoon toasted sesame oil", "sesame oil", ""],
  ["1/2 teaspoon kosher salt", "kosher salt", ""],
  ["2 ts soy sauce", "soy sauce", "`ts` is a real abbreviation in this corpus"],
  ["1-1/2 cups water", "water", "mixed number written with a hyphen"],
  ["1/4 to 1/2 tsp salt", "salt", "fraction range"],
  ["salt &#038; pepper", "salt and pepper", "HTML entity, not a quantity"],
  ["10&#215;10 dasima, dried kelp", "dasima", "&#215; is ×; decoded late it became digits"],
  ["1 tbsp (9 g toasted sesame seeds", "sesame seeds", "unbalanced paren"],
  ["½ boneless, skinless chicken thigh", "boneless skinless chicken thigh", "adjective-run guard"],
  ["Serves 4", "", "servings line is not an ingredient"],
  ["bring 4 to 5 cups of water to a boil, add the taro, cover, cook 10 minutes",
   "", "method prose inside the ingredient list"],
  // The comma split already reaches the name here; prose detection is the
  // backstop for lines with no comma to split on.
  ["1 tbsp vegetable oil, use if you want a softer chocolate shell",
   "vegetable oil", "note after the comma is dropped by the comma split"],
  ["1 tbsp vegetable oil use if you want a softer chocolate shell",
   "", "no comma to split on — prose detection catches it"],
  ["¾ cup uncooked Japanese short-grain white rice", "uncooked japanese short-grain white rice",
   "six real words — length alone must not condemn it"],
];

/**
 * Cases that only resolve with a vocabulary — the second pass. Same grammar,
 * opposite readings; the corpus is the only thing that tells them apart.
 */
const VOCAB = new Set(["perilla oil", "sesame oil", "kelp broth", "water", "chili oil"]);
const TWO_PASS: Array<[raw: string, want: string, why: string]> = [
  ["2 to 3 tablespoons of perilla or sesame oil", "perilla oil",
   "`perilla oil` is in the corpus 26 times, so the head noun distributes"],
  ["1/4 cup water or kelp broth (to rinse)", "water",
   "`water broth` is in the corpus zero times, so it does not"],
  ["1 tbsp chili or sesame oil", "chili oil", "same shape, distributes"],
];

let failed = 0;
for (const [raw, want, why] of TWO_PASS) {
  const got = headName(raw, VOCAB);
  if (got === want) continue;
  failed++;
  console.log(`FAIL  ${JSON.stringify(raw)} (two-pass)`);
  console.log(`      want ${JSON.stringify(want)}  got ${JSON.stringify(got)}`);
  console.log(`      ${why}`);
}
for (const [raw, want, why] of CASES) {
  const got = headName(raw);
  if (got === want) continue;
  failed++;
  console.log(`FAIL  ${JSON.stringify(raw)}`);
  console.log(`      want ${JSON.stringify(want)}  got ${JSON.stringify(got)}`);
  if (why) console.log(`      ${why}`);
}
const total = CASES.length + TWO_PASS.length;
console.log(`\n${total - failed}/${total} parser cases pass`);
if (failed) process.exit(1);
