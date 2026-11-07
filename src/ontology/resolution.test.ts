/**
 * Variant resolution — RESOLUTION-SPEC.md's falsifiable claims.
 *
 *   npm run test-resolution
 */
import { resolveVariant } from "./resolution.js";

let failed = 0;
function check(name: string, ok: boolean, why?: string) {
  if (!ok) {
    failed++;
    console.error(`FAIL ${name}${why ? `\n     ${why}` : ""}`);
  }
}

// ── the cuisine default ─────────────────────────────────────────────────────
{
  const r = resolveVariant("chili flakes", "korean", "main");
  check("korean chili flakes resolve to gochugaru",
    r?.to === "gochugaru" && r.tier === "cuisine-default",
    "the flagship row: the generic node, read through the cuisine");
}
check("thai chili flakes stay themselves",
  resolveVariant("chili flakes", "thai", "main") === undefined,
  "a default is per cuisine — resolving another cuisine's mention would be " +
  "the exact westernisation the identity layer refuses, pointed the other way");
check("no cuisine, no resolution",
  resolveVariant("chili flakes", undefined, "main") === undefined);
check("korean rice means short grain",
  resolveVariant("rice", "korean", "main")?.to === "short grain rice");
check("korean corn syrup line means oligodang",
  resolveVariant("corn syrup", "korean", "dessert")?.to === "oligodang",
  "the audit's model case: identity says different products, resolution " +
  "says what the Korean author meant — both true, in different fields");

// ── explicit — the recipe wrote the variant ─────────────────────────────────
{
  const r = resolveVariant("gochugaru", "korean", "main");
  check("writing gochugaru is explicit",
    r?.to === "gochugaru" && r.tier === "explicit");
}
check("writing soup soy sauce is explicit",
  resolveVariant("soup soy sauce", "korean", "soup-stew")?.tier === "explicit");

// ── the guk-ganjang doubt ───────────────────────────────────────────────────
{
  const r = resolveVariant("soy sauce", "korean", "soup-stew");
  check("soy sauce in a korean soup is flagged, never switched",
    r?.to === "soy sauce" && r.tier === "cuisine-default" && !!r.flag,
    "dish type is machine-derived, so the trigger may only raise a doubt");
}
check("soy sauce in a korean main has nothing to say",
  resolveVariant("soy sauce", "korean", "main") === undefined,
  "a self-resolution with no doubt is a stamp with no information");
check("soy sauce with no dish type has nothing to say",
  resolveVariant("soy sauce", "korean", undefined) === undefined);

// ── the common case ─────────────────────────────────────────────────────────
check("a node no row covers stamps nothing",
  resolveVariant("scallion", "korean", "main") === undefined);

if (failed) { console.error(`\n${failed} failing`); process.exit(1); }
console.log("all resolution cases pass");
