/**
 * Gloss-narrowing regression cases.
 *
 *   npm run test-gloss
 *
 * The rule these protect: a parenthetical may NARROW a resolution down its own
 * is_a line, and may do nothing else. Every case that must not narrow is here
 * because it is one substitution away from rewriting what a dish needs.
 */
import { glossTokens, narrowByGloss, parenGroups } from "./gloss.js";

let failed = 0;
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) return;
  failed++;
  console.log(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
};

/* A miniature seaweed family: species under the generic, plus a stranger. */
const PARENTS: Record<string, string[]> = {
  wakame: ["dried-seaweed"], gim: ["dried-seaweed"], kombu: ["dried-seaweed"],
  sriracha: [], gochugaru: ["chili-flakes"],
};
const NODES: Record<string, string> = {
  // The real resolveToken is the full engine, which reads through cuisine
  // modifiers; the toy resolver spells those surfaces out instead.
  miyeok: "wakame", wakame: "wakame", "dried wakame": "wakame",
  "korean miyeok": "wakame", "japanese wakame": "wakame",
  gim: "gim", nori: "gim", "sushi nori": "gim",
  haidai: "kombu", kelp: "kombu",
  sriracha: "sriracha", gochugaru: "gochugaru",
};
const resolve = (t: string) => NODES[t.toLowerCase()] ?? null;
const parentsOf = (id: string) => PARENTS[id] ?? [];
const narrow = (raw: string, node: string) => narrowByGloss(raw, node, resolve, parentsOf);

// ── the cases that motivated the rule ──────────────────────────────────────
check("(miyeok) narrows dried seaweed to wakame",
  narrow("1 oz (30 g) dried seaweed (miyeok)", "dried-seaweed") === "wakame");
check("(gim / nori) narrows to gim",
  narrow("4 sheets dried seaweed ((gim / nori))", "dried-seaweed") === "gim");
check("(haidai, 海带, also known as kelp) narrows to kombu",
  narrow("15 grams dried seaweed ((haidai, 海带, also known as kelp))", "dried-seaweed") === "kombu");
check("(Korean miyeok or Japanese wakame) agrees on one species",
  narrow("15 g dried seaweed ((Korean miyeok or Japanese wakame))", "dried-seaweed") === "wakame");

// ── enumerations are options, never identity (2026-08-20, second pass:
//    the first cut narrowed "sugar (white, brown, or cane sugar)" to cane) ──
const SUGAR: Record<string, string[]> = { "cane-sugar": ["sugar"], "brown-sugar": ["sugar"] };
const sugarResolve = (t: string) =>
  ({ "cane sugar": "cane-sugar", "brown sugar": "brown-sugar" } as Record<string, string>)[t.toLowerCase()] ?? null;
check("a comma list naming two kinds decides nothing",
  narrowByGloss("¼ cup sugar (brown sugar, or cane sugar)", "sugar", sugarResolve,
    (id) => SUGAR[id] ?? []) === null);
check("an or-list with an unreadable option decides nothing",
  narrowByGloss("¼ cup sugar (white, or cane sugar)", "sugar", sugarResolve,
    (id) => SUGAR[id] ?? []) === null);
check("etc marks a list of options",
  narrowByGloss("¼ cup sugar (cane sugar, etc.)", "sugar", sugarResolve,
    (id) => SUGAR[id] ?? []) === null);
check("one thing spelled twice still narrows",
  narrowByGloss("1 Tbsp rice wine (mirim or mirin)", "rice-wine",
    (t) => (/^miri[mn]$/i.test(t) ? "mirin" : null),
    (id) => (id === "mirin" ? ["rice-wine"] : [])) === "mirin");
check("an exclusion names what NOT to buy",
  narrowByGloss("4 Tbsp miso (any kind except for Saikyo miso)", "miso",
    (t) => (t.toLowerCase() === "saikyo miso" ? "saikyo" : null),
    (id) => (id === "saikyo" ? ["miso"] : [])) === null);
check("a long preference prefix is still a choice",
  narrowByGloss("Cooking oil (I like to use avocado or coconut oil)", "oil",
    (t) => (t.toLowerCase() === "coconut oil" ? "coconut-oil" : null),
    (id) => (id === "coconut-oil" ? ["oil"] : [])) === null);
check("unicode fractions are quantities",
  narrowByGloss("1 tbsp parsley (finely chopped, or ½ tsp dried parsley)", "parsley",
    (t) => (t.toLowerCase().includes("dried parsley") ? "dried-parsley" : null),
    (id) => (id === "dried-parsley" ? ["parsley"] : [])) === null);
check("e.g. anywhere marks the whole line as options",
  narrowByGloss("Seeds 2 tablespoons *e.g. Pepita (Pumpkin Seeds)", "seeds",
    (t) => (t.toLowerCase() === "pumpkin seeds" ? "pumpkin-seeds" : null),
    (id) => (id === "pumpkin-seeds" ? ["seeds"] : [])) === null);

// ── the cases that must never fire ─────────────────────────────────────────
check("(or use Wakame) is an alternative, not identity",
  narrow("Dried Seaweed (or use Wakame - a handful)", "dried-seaweed") === null);
check("a sibling never passes the descent gate",
  narrow("1 Tbsp gochujang (or sriracha)", "gochugaru") === null);
check("naming two species decides nothing",
  narrow("dried seaweed (miyeok, gim)", "dried-seaweed") === null);
check("the head's own node is not a narrowing",
  narrow("wakame (dried wakame)", "wakame") === null);
check("prep notes are not identities",
  narrow("dried seaweed ((cut into 6ths))", "dried-seaweed") === null);
check("quantities are not identities",
  narrow("dried seaweed ((typically 1⅔ cups))", "dried-seaweed") === null);

// ── mechanics ──────────────────────────────────────────────────────────────
check("nested parens surface innermost content",
  parenGroups("a ((gim / nori) sheets)").includes("gim / nori"));
check("alternative marker skips the whole group",
  glossTokens("beef (such as ribeye)").length === 0);
check("aka splits like a separator",
  glossTokens("x (haidai aka kelp)").join("|") === "haidai|kelp");

if (failed) { console.log(`\n${failed} failure(s)`); process.exit(1); }
console.log("all gloss cases pass");
