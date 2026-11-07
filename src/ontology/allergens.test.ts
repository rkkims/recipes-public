/**
 * Allergen tagging cases — INGREDIENT-SPEC §4.
 *
 *   npm run test-allergens
 *
 * Two kinds of case, and they are not equally important.
 *
 * A **missed tag** is the dangerous direction: §4 says an ingredient wrongly
 * marked clean "costs something else entirely". Those cases are the point of
 * this file.
 *
 * A **false tag** costs a hidden recipe. Worth fixing, never worth trading a
 * missed tag for.
 */
import { allergensOf, animalSourceOf } from "./allergens.js";

let failed = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) return;
  failed++;
  console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
};

const has = (name: string, a: string) => allergensOf(name).includes(a as never);
const tags = (name: string) => allergensOf(name).join(",");

// ── the ones that must never be missed ─────────────────────────────────────
{
  // Hidden allergens — the whole reason a lexicon beats reading the word.
  check("soy sauce contains wheat", has("soy sauce", "wheat"),
    "the classic hidden allergen: most soy sauce is brewed with wheat");
  check("soy sauce contains soy", has("soy sauce", "soy"));
  check("gochujang contains wheat", has("gochujang", "wheat"));
  check("gochujang contains soy", has("gochujang", "soy"));
  check("doenjang contains soy", has("doenjang", "soy"));
  check("oyster sauce contains shellfish", has("oyster sauce", "shellfish"));
  check("oyster sauce contains soy", has("oyster sauce", "soy"));
  check("worcestershire contains fish", has("worcestershire sauce", "fish"),
    "anchovy, and nothing in the name says so");
  check("dashi contains fish", has("dashi", "fish"));
  check("mayonnaise contains egg", has("mayonnaise", "egg"));
  check("panko contains wheat", has("panko", "wheat"));
  check("tempura batter contains wheat", has("tempura batter", "wheat"));
  check("hoisin contains soy and wheat",
    has("hoisin sauce", "soy") && has("hoisin sauce", "wheat"));
  check("ghee is milk", has("ghee", "milk"));
  check("tahini is sesame", has("tahini", "sesame"));
  check("marzipan is a tree nut", has("marzipan", "treenut"));
  check("gelatin is animal", animalSourceOf("gelatin") === "meat",
    "meat-derived and NOT an allergen — the case §4 uses to justify two fields");
  check("gelatin carries no allergen", tags("gelatin") === "");
}

// ── the ones that must not fire ────────────────────────────────────────────
{
  check("oyster mushrooms are not shellfish", !has("oyster mushrooms", "shellfish"),
    "named for the shape");
  check("king oyster mushroom is not shellfish", !has("king oyster mushroom", "shellfish"));
  check("water chestnuts are not a tree nut", !has("water chestnuts", "treenut"),
    "an aquatic corm");
  check("chestnuts ARE a tree nut", has("chestnuts", "treenut"),
    "the pair that proves the exclusion is scoped to the whole name");
  check("perilla is not sesame", !has("perilla leaf", "sesame"),
    "Perilla frutescens is a mint; sesame is Sesamum indicum");
  check("sesame oil IS sesame", has("sesame oil", "sesame"));
  check("eggplant is not egg", !has("eggplant", "egg"));
  check("egg is egg", has("egg", "egg"));
  check("coconut milk is not dairy", !has("coconut milk", "milk"));
  check("coconut is not a tree nut here", !has("coconut milk", "treenut"),
    "a drupe; tagging it would hide most of the corpus from a nut allergy");
  check("rice noodles are not wheat", !has("rice noodles", "wheat"));
  check("udon IS wheat", has("udon", "wheat"));
  check("rice flour is not wheat", !has("rice flour", "wheat"));
  check("almond flour is not wheat", !has("almond flour", "wheat"));
  check("almond flour IS a tree nut", has("almond flour", "treenut"));
  check("butternut squash is neither dairy nor nut",
    !has("butternut squash", "milk") && !has("butternut squash", "treenut"));
  check("peanut butter is not dairy", !has("peanut butter", "milk"));
  check("peanut butter IS peanut", has("peanut butter", "peanut"));
  check("cream of tartar is not dairy", !has("cream of tartar", "milk"));
  check("kombu is not fish", !has("seaweed - kombu/dashima", "fish"),
    "kelp — `dashima` is the romanised name, not stock");
}

// ── animal source: a different question ────────────────────────────────────
{
  check("pork belly is meat", animalSourceOf("pork belly") === "meat");
  check("anchovies are fish", animalSourceOf("anchovies") === "fish");
  check("shrimp is fish-class", animalSourceOf("shrimp") === "fish",
    "the vocabulary has no separate shellfish provenance value");
  check("butter is dairy", animalSourceOf("butter") === "dairy");
  check("egg is egg", animalSourceOf("egg") === "egg");
  check("sesame oil is not animal", animalSourceOf("sesame oil") === null,
    "an allergen and not animal — the other half of §4's argument");
  check("tofu is not animal", animalSourceOf("tofu") === null);
  check("vegetarian oyster sauce is not animal",
    animalSourceOf("vegetarian oyster sauce") === null);
  check("vegetarian oyster sauce still tags soy",
    has("vegetarian oyster sauce", "soy"),
    "not animal does not mean not allergenic");
  check("chicken mushrooms are not meat", animalSourceOf("chicken mushrooms") === null);
  check("vegetable stock is not meat", animalSourceOf("vegetable stock") === null);
  check("chicken stock is meat", animalSourceOf("chicken stock") === "meat");
}

// ── the closed vocabulary ──────────────────────────────────────────────────
{
  const all = new Set(["peanut","treenut","milk","egg","soy","wheat","fish","shellfish","sesame"]);
  const sample = ["soy sauce", "butter", "shrimp", "walnuts", "tahini", "udon", "mayonnaise"];
  const emitted = new Set(sample.flatMap((s) => allergensOf(s)));
  check("nothing outside the major-allergen list is ever emitted",
    [...emitted].every((a) => all.has(a)),
    "the vocabulary is externally defined and not ours to extend");
}

console.log(failed ? `\n${failed} allergen case(s) failed` : "\nall allergen cases pass");
if (failed) process.exit(1);
