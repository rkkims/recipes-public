/**
 * The number rule — NORMALIZATION.md, "Number".
 *
 *   npm run test-naming
 *
 * Two things are being protected. The rule itself, and the reason it is applied
 * to the DISPLAY name only: the node string is what `identity.csv` keys ids to,
 * so anything that rewrites it orphans pantry rows (INGREDIENT-SPEC §1).
 */
import { writeFileSync } from "node:fs";
import { aggregateKeys, displayNameFor, numberKey, toSingular } from "./naming.js";
import { singular } from "./normalize.js";

let failed = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) return;
  failed++;
  console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
};

const NONE = new Set<string>();
const AGG = new Set(["pine nut", "red date"]);

// ── the rule ───────────────────────────────────────────────────────────────
check("plural becomes singular", displayNameFor("eggs", NONE) === "egg");
check("only the last word moves",
  displayNameFor("dried shiitake mushrooms", NONE) === "dried shiitake mushroom");
check("already singular is untouched", displayNameFor("soy sauce", NONE) === "soy sauce");
check("mass nouns are untouched", displayNameFor("salt", NONE) === "salt");
check("an aggregate keeps its plural", displayNameFor("pine nuts", AGG) === "pine nuts");
check("an aggregate is matched on the KEY, not the string",
  displayNameFor("red dates", AGG) === "red dates");
check("a non-aggregate plural still moves even next to one",
  displayNameFor("walnuts", AGG) === "walnut");

// ── singular(), and the bugs the rule exposed ──────────────────────────────
check("fungus is not a plural", singular("fungus") === "fungus",
  "the bare strip-an-s rule made this `fungu` — invisible while it only built keys");
check("asparagus is not a plural", singular("asparagus") === "asparagus");
check("cookies is cookie, not cooky", singular("cookies") === "cookie",
  "`-ies` comes from `-y` except when the singular already ends `-ie`");
check("anchovies is still anchovy", singular("anchovies") === "anchovy",
  "the pair that proves the -ies rule was not simply removed");
check("kimchis is kimchi", singular("kimchis") === "kimchi",
  "an `-is` guard was tried and removed: it catches the plural of every food " +
  "word ending in -i, a larger class than the -is singulars it protects");
check("zucchinis is zucchini", singular("zucchinis") === "zucchini");
check("molasses is not stripped", singular("molasses") === "molasses");

// ── the key ────────────────────────────────────────────────────────────────
check("the key ignores number", numberKey("Onions") === numberKey("onion"));
check("the key ignores punctuation and case",
  numberKey("Bay-Leaves") === numberKey("bay leaf"));
check("the key ignores number on a KEEP_PLURAL word",
  numberKey("chive") === numberKey("chives"),
  "singular() leaves both forms alone — the guard protects `chives`, and " +
  "`chive` has nothing to strip — so without canonicalising the bare singular " +
  "up to the protected plural, the pair holds two keys and can never merge");
check("the key unifies noodle pairs the same way",
  numberKey("rice noodle") === numberKey("rice noodles"));
check("the up-canonical key stays out of display names",
  displayNameFor("chives", new Set()) === "chives");
check("toSingular leaves a one-word singular alone", toSingular("onion") === "onion");

// ── the exception is derived from data, not asserted ───────────────────────
{
  const csv = [
    "name,sku_support",
    "pine nuts,16",          // never singular, well supported → aggregate
    "peas,1",                // never singular, one SKU → below the floor
    "bay leaf,12",
    "bay leaves,0",
    "eggs,0",
    "egg,3",
  ].join("\n");
  const tmp = "/tmp/naming-vocab-test.csv";
  writeFileSync(tmp, csv + "\n");
  const agg = aggregateKeys(tmp);
  check("a plural-only name with support is an aggregate", agg.has("pine nut"));
  check("a plural-only name below the floor is NOT",
    !agg.has("pea"), "one oddly-named product must not invent an exception");
  check("a name the catalogue writes singular is not an aggregate", !agg.has("bay leaf"));
  check("a missing catalogue yields no exceptions, not a crash",
    aggregateKeys("/tmp/does-not-exist-at-all.csv").size === 0);
}

console.log(failed ? `\n${failed} naming case(s) failed` : "\nall naming cases pass");
if (failed) process.exit(1);
