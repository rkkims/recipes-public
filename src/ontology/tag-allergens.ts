/**
 * Tag the node list, and write the audit artifact — INGREDIENT-SPEC §4.
 *
 *   npm run allergens
 *
 * Writes `data/qc/allergens.csv`: every node that got a tag, the tags, and the
 * animal source. Sorted by corpus frequency, so a half-finished read still
 * covers most of what a user will meet.
 *
 * The lexicon in `allergens.ts` is the rule source and is reviewed as CODE —
 * the same arrangement as `rules.ts` and `exceptions.ts`, and for the same
 * reason: a rule someone can read and argue with beats a table nobody audits.
 * This file is the artifact for auditing the result, not a queue to work
 * through.
 *
 * §4 measured a lexicon pass at 749 of 3,147 nodes on allergens and 684 as
 * animal-derived. This prints the same two numbers so the gap between the
 * estimate and the implementation is visible rather than assumed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ALLERGENS, allergensOf, animalSourceOf, type Allergen } from "./allergens.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ONT = resolve(ROOT, "data/ontology");
const QC = resolve(ROOT, "data/qc");

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ""));
}
const asObjects = (text: string) => {
  const rows = parseCsv(text);
  const h = rows[0]!;
  return rows.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""])));
};
const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((c) => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n") + "\n";

function main() {
  const nodes = asObjects(readFileSync(resolve(ONT, "nodes.csv"), "utf8"))
    .filter((r) => r["status"] === "confirmed")
    .map((r) => ({ node: r["node"]!, mentions: Number(r["mentions"] || 0) }))
    .sort((a, b) => b.mentions - a.mentions);

  const perAllergen = new Map<Allergen, number>();
  const rows: (string | number)[][] = [["node", "mentions", "allergens", "animal_source"]];
  let tagged = 0, animal = 0;

  for (const n of nodes) {
    const a = allergensOf(n.node);
    const src = animalSourceOf(n.node);
    if (a.length) { tagged++; for (const x of a) perAllergen.set(x, (perAllergen.get(x) ?? 0) + 1); }
    if (src) animal++;
    if (a.length || src) rows.push([n.node, n.mentions, a.join("|"), src ?? ""]);
  }

  if (!existsSync(QC)) mkdirSync(QC, { recursive: true });
  writeFileSync(resolve(QC, "allergens.csv"), csv(rows));

  const pct = (x: number) => `${Math.round((x / nodes.length) * 100)}%`;
  console.log(`${nodes.length} confirmed nodes`);
  console.log(`  carry an allergen   ${tagged} (${pct(tagged)})     §4 estimated 749`);
  console.log(`  animal-derived      ${animal} (${pct(animal)})     §4 estimated 684`);
  console.log(`\nby allergen:`);
  for (const a of ALLERGENS) {
    console.log(`  ${a.padEnd(10)}${String(perAllergen.get(a) ?? 0).padStart(5)}`);
  }
  console.log(`\nwrote ${resolve(QC, "allergens.csv")}`);
}

main();
