/**
 * Structural checks on the rule and exception tables.
 *
 * These are not about whether an answer is right — that is agreement.ts. These
 * catch the class of bug that produces a right answer for a wrong reason, and
 * both checks here found one:
 *
 *   `boneless` was in grade (strip) AND cut (keep). The right class won only
 *   because it is declared later in the file. Reordering CLASSES would have
 *   silently changed how every cut of meat normalises.
 *
 *   Nine exception entries never ran, because an alias row intercepts the same
 *   string first. Harmless to behaviour and actively misleading to read.
 *
 * Neither is visible from the output. Both are one comparison. So they run on
 * every scoring pass rather than living in someone's scratchpad.
 */
import { CLASSES } from "./rules.js";
import {
  ALWAYS_PRESERVED, COMMODITY, CUISINE_WORDS, ORIGIN_PRODUCT, PURCHASED_FORM, SPLIT,
} from "./exceptions.js";
import { loadAliases } from "./aliases.js";

export type Finding = { check: string; detail: string };

export function checkTables(): Finding[] {
  const found: Finding[] = [];

  // ── 1. a word must belong to exactly one class ────────────────────────────
  //
  // Two classes with the same behaviour are still a finding: the pair should be
  // read in one place, and today's harmless duplicate is tomorrow's silent flip
  // when someone changes one of the two behaviours.
  const where = new Map<string, string[]>();
  const add = (w: string, cls: string) => {
    const k = w.toLowerCase();
    if (!where.has(k)) where.set(k, []);
    where.get(k)!.push(cls);
  };
  for (const c of CLASSES) for (const w of c.words) add(w, c.name);
  for (const v of CUISINE_WORDS) for (const w of v.words) add(w, `${v.class} (${v.cuisine})`);

  for (const [w, classes] of where) {
    const distinct = [...new Set(classes.map((c) => c.replace(/ \(.*\)$/, "")))];
    if (classes.length > 1)
      found.push({
        check: "word in more than one class",
        detail: `"${w}" is in ${classes.join(" and ")} — "${classes[classes.length - 1]}" wins by declaration order`
          + (distinct.length > 1 ? ", and they disagree" : ""),
      });
  }

  // Hyphen and space spellings of one concept must land in the same class.
  // `low fat` was in grade and `low-fat` in variety, so behaviour depended on
  // how the author typed it.
  const byShape = new Map<string, Set<string>>();
  // Exact duplicates are already reported above; re-reporting them here as a
  // hyphenation problem would double-count and point at the wrong fix.
  const alreadyReported = new Set(found.map((f) => f.detail.split('"')[1]));
  for (const [w, classes] of where) {
    if (alreadyReported.has(w)) continue;
    const k = w.replace(/[- ]/g, "");
    if (!byShape.has(k)) byShape.set(k, new Set());
    for (const c of classes) byShape.get(k)!.add(c.replace(/ \(.*\)$/, ""));
  }
  for (const [k, classes] of byShape)
    if (classes.size > 1)
      found.push({
        check: "spelling decides the class",
        detail: `"${k}" appears as ${[...classes].join(" and ")} depending on hyphenation`,
      });

  // ── 2. no exception entry may be shadowed by an alias ─────────────────────
  //
  // Aliases resolve first, so an entry naming the same string is dead code that
  // reads like the governing rule.
  const aliased = new Set(loadAliases().map((a) => a.surface));
  const tables: Array<[string, Iterable<string>]> = [
    ["COMMODITY", COMMODITY],
    ["PURCHASED_FORM", PURCHASED_FORM],
    ["ORIGIN_PRODUCT", ORIGIN_PRODUCT],
    ["ALWAYS_PRESERVED", ALWAYS_PRESERVED],
    ["SPLIT", Object.keys(SPLIT)],
  ];
  for (const [name, values] of tables)
    for (const v of values)
      if (aliased.has(v))
        found.push({
          check: "exception shadowed by an alias",
          detail: `"${v}" is in ${name} but an alias row resolves it first — the ${name} entry never runs`,
        });

  return found;
}

export function reportTables(): number {
  const found = checkTables();
  if (!found.length) { console.log("table integrity: ok"); return 0; }
  console.log(`\ntable integrity: ${found.length} finding(s)\n`);
  const byCheck = new Map<string, string[]>();
  for (const f of found) {
    if (!byCheck.has(f.check)) byCheck.set(f.check, []);
    byCheck.get(f.check)!.push(f.detail);
  }
  for (const [check, details] of byCheck) {
    console.log(`  ${check} (${details.length})`);
    for (const d of details) console.log(`    ${d}`);
  }
  console.log();
  return found.length;
}
