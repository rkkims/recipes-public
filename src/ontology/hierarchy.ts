/**
 * Derive the is_a hierarchy — INGREDIENT-SPEC §3a (DRAFT).
 *
 *   npm run hierarchy
 *
 * Writes `data/qc/hierarchy.csv`. **Proposals, not edges.** Nothing here reaches
 * the matcher until it is reviewed, because a wrong is_a edge is not a bad
 * ranking — it makes one ingredient satisfy a recipe that needs a different one.
 *
 * The ontology has SEVEN is_a edges across 2,885 ingredients, which is why §3
 * describes a hierarchy the data does not have: `basa` does not satisfy a
 * recipe wanting `white fish`, and nothing noticed because there was no edge to
 * get wrong.
 *
 * ── What is derivable ──────────────────────────────────────────────────────
 *
 * One node's name being a token-SUFFIX of another: `light soy sauce` is_a
 * `soy sauce` is_a `sauce`. Only the NEAREST ancestor is emitted — the chain
 * gives the rest transitively, and emitting every level would triple the review
 * for no extra information.
 *
 * ── What is not, and it is the case that motivated this ────────────────────
 *
 * `basa is_a white fish`. `pollock is_a white fish`. Nothing in either name says
 * so, and people put `basa` in a pantry, not `white fish`. This script cannot
 * produce those and does not pretend to; §3a's open question is where they come
 * from.
 *
 * ── The trap ───────────────────────────────────────────────────────────────
 *
 * A shared last word is not a shared identity. `coconut milk` is not milk,
 * `peanut butter` is not butter, and `korean radish` is a different vegetable
 * from `radish` — which `NORMALIZATION`'s SYNONYM table already records, having
 * been caught by it once.
 *
 * So every proposal is annotated with what the repo already knows, and the queue
 * is ordered by CORPUS IMPACT rather than by flag — a flag is a note on a row,
 * not a reason to read it before one that affects ten times as many recipes.
 * Reviewer's standing instruction is recall over precision: these are generated
 * wide and annotated, never filtered out.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { numberKey } from "./naming.js";
import { SYNONYM } from "./exceptions.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ONT = resolve(ROOT, "data/ontology");
const QC = resolve(ROOT, "data/qc");

const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((c) => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n") + "\n";

/**
 * The borrowed-category trap, narrowly.
 *
 * A first attempt flagged every child of a category noun — `oil`, `salt`,
 * `sugar` — and produced 585 flags of which nearly all were correct edges.
 * `sesame oil` IS oil. A flag that fires on the right answer teaches the
 * reviewer to ignore it, which is worse than no flag.
 *
 * The real trap is narrower and nameable: a PLANT word in front of an ANIMAL
 * product. `coconut milk` is not milk, `peanut butter` is not butter, `oat
 * cream` is not cream — and a wrong edge here is not cosmetic, because it would
 * let a dairy-free pantry satisfy a recipe that needs dairy.
 */
const ANIMAL_HEAD = new Set(["milk", "butter", "cream", "cheese", "yogurt", "yoghurt"]);
const PLANT_SOURCE = new Set(["coconut", "almond", "soy", "soya", "oat", "rice",
                              "cashew", "peanut", "sesame", "hemp", "macadamia",
                              "hazelnut", "walnut", "pea", "flax", "cocoa", "shea",
                              "apple", "nut", "seed"]);

/** Modifiers that make the child a different SPECIES, not a variety of the parent. */
const ORIGIN_TRAP = /^(korean|japanese|chinese|thai|vietnamese|indian|mexican|italian|french)\b/;

function main() {
  const nodes = readFileSync(resolve(ONT, "nodes.csv"), "utf8").split("\n").slice(1)
    .map((l) => l.split(","))
    .filter((r) => r[2] === "confirmed")
    .map((r) => ({ node: r[0]!, mentions: Number(r[1] ?? 0) }));

  const byKey = new Map(nodes.map((n) => [numberKey(n.node), n]));
  const synonymKeys = new Set(Object.keys(SYNONYM).map(numberKey));

  type Row = { child: string; parent: string; cm: number; pm: number; flag: string };
  const rows: Row[] = [];

  for (const c of nodes) {
    const t = numberKey(c.node).split(" ");
    for (let i = 1; i < t.length; i++) {
      const parent = byKey.get(t.slice(i).join(" "));
      if (!parent || parent.node === c.node) continue;

      const head = t[t.length - 1]!;
      const first = t[0]!;
      const flags: string[] = [];
      // A plant in front of an animal product is not that product.
      if (ANIMAL_HEAD.has(head) && PLANT_SOURCE.has(first))
        flags.push("plant word + animal product — probably NOT a kind of it");
      // `korean radish` is not a radish. NORMALIZATION already recorded this trap.
      if (ORIGIN_TRAP.test(numberKey(c.node))) flags.push("origin word — may be a different species");
      // The engine already has an opinion that these two are not the same thing.
      if (synonymKeys.has(numberKey(c.node))) flags.push("named in SYNONYM — check the table");
      // A parent nobody uses is not a category, it is a leftover.
      if (parent.mentions < 3) flags.push("parent is rare — may not be a real category");

      rows.push({ child: c.node, parent: parent.node, cm: c.mentions, pm: parent.mentions,
                  flag: flags.join("; ") });
      break;   // nearest ancestor only; the chain supplies the rest
    }
  }

  /**
   * Ordered by corpus impact, NOT by flag.
   *
   * Sorting flags first put `sesame oil is_a oil` — a correct edge — at the top
   * of the queue. The flag is an annotation on a row, not a reason to read it
   * before a row that affects ten times as many recipes.
   */
  rows.sort((a, b) => (b.cm + b.pm) - (a.cm + a.pm));

  // Siblings, for the record: §3a's guard says these never match each other.
  const kids = new Map<string, string[]>();
  for (const r of rows) {
    const l = kids.get(r.parent) ?? [];
    l.push(r.child);
    kids.set(r.parent, l);
  }
  const siblings = [...kids.values()].filter((l) => l.length > 1);

  if (!existsSync(QC)) mkdirSync(QC, { recursive: true });
  writeFileSync(resolve(QC, "hierarchy.csv"), csv([
    ["child", "parent", "child_mentions", "parent_mentions", "flag"],
    ...rows.map((r) => [r.child, r.parent, r.cm, r.pm, r.flag]),
  ]));

  const flagged = rows.filter((r) => r.flag).length;
  console.log(`${nodes.length} confirmed ingredients`);
  console.log(`  derivable is_a edges   ${rows.length} (${Math.round(rows.length / nodes.length * 100)}% of nodes get a parent)`);
  console.log(`  flagged for review     ${flagged}`);
  console.log(`  clean                  ${rows.length - flagged}`);
  console.log(`\n  ${siblings.length} sibling families — §3a: these never match each other`);
  console.log(`  largest: ` + [...kids].sort((a, b) => b[1].length - a[1].length).slice(0, 4)
    .map(([p, l]) => `${p} (${l.length})`).join(", "));
  console.log(`\nwrote data/qc/hierarchy.csv — PROPOSALS. Nothing reaches the matcher unreviewed.`);
}

main();
