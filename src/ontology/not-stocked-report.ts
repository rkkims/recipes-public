/**
 * What the rule disposes of, and what it touched — QC-SPEC §7.
 *
 *   npm run not-stocked
 *
 * Writes `data/qc/not-stocked.csv`: every distinct head the rule caught, with
 * its line count and the reason. The point is auditability — a rule that
 * removes two thousand lines from a review queue has to be readable in full,
 * because anything it takes wrongly never comes back to be noticed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { notStocked } from "./not-stocked.js";
import { numberKey } from "./naming.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ONT = resolve(ROOT, "data/ontology");
const QC = resolve(ROOT, "data/qc");

const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((c) => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n") + "\n";

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

function main() {
  const lines = JSON.parse(readFileSync(resolve(ONT, "recipe-lines.json"), "utf8")) as
    Record<string, Array<{ raw: string; head: string }>>;

  const nodeRows = parseCsv(readFileSync(resolve(ONT, "nodes.csv"), "utf8")).slice(1);
  const nodeKeys = new Set(nodeRows.filter((r) => r[2] === "confirmed").map((r) => numberKey(r[0] ?? "")));

  const caught = new Map<string, { n: number; kind: string; why: string }>();
  let total = 0, hit = 0, recipesTouched = new Set<string>();

  for (const [rid, ls] of Object.entries(lines)) {
    for (const l of ls) {
      const head = (l.head ?? "").trim();
      if (!head) continue;
      total++;
      const v = notStocked(head);
      if (!v) continue;
      hit++;
      recipesTouched.add(rid);
      const e = caught.get(head.toLowerCase()) ?? { n: 0, kind: v.kind, why: v.why };
      e.n++;
      caught.set(head.toLowerCase(), e);
    }
  }

  /**
   * Heads the rule caught that are ALSO confirmed nodes.
   *
   * Written expecting this to mean the rule had overreached. It means the
   * opposite: `icy water`, `tepid water`, `qt water`, `litters water` and
   * `regular sized ice cubes` are all promoted nodes, and none of them is an
   * ingredient. The collision is the ontology's, not the rule's — these are
   * the parser wreckage that reached `nodes.csv`, and the rule found them by
   * accident.
   *
   * Left as a loud warning rather than a quiet count, because retiring a node
   * is INGREDIENT-SPEC §1's business — behind a redirect, never a delete —
   * and not something a report should do on its own.
   */
  const collisions = [...caught].filter(([h]) => nodeKeys.has(numberKey(h)));

  const rows = [...caught].sort((a, b) => b[1].n - a[1].n);
  if (!existsSync(QC)) mkdirSync(QC, { recursive: true });
  writeFileSync(resolve(QC, "not-stocked.csv"), csv([
    ["head", "lines", "kind", "why", "is_confirmed_node"],
    ...rows.map(([h, e]) => [h, e.n, e.kind, e.why, nodeKeys.has(numberKey(h)) ? "yes" : ""]),
  ]));

  const byKind = (k: string) => rows.filter(([, e]) => e.kind === k);
  const sum = (l: typeof rows) => l.reduce((a, [, e]) => a + e.n, 0);

  console.log(`${total} ingredient lines in the corpus`);
  console.log(`  not stocked        ${hit} (${Math.round((hit / total) * 100)}%) across ${caught.size} distinct heads`);
  console.log(`    assumed on hand  ${sum(byKind("assumed"))} lines, ${byKind("assumed").length} heads`);
  console.log(`    cooking by-prod  ${sum(byKind("by-product"))} lines, ${byKind("by-product").length} heads`);
  console.log(`  recipes affected   ${recipesTouched.size}`);

  console.log(`\ntop heads caught:`);
  for (const [h, e] of rows.slice(0, 10)) {
    console.log(`  ${String(e.n).padStart(5)}  ${h.padEnd(28)} ${e.kind}`);
  }

  if (collisions.length) {
    console.log(`\n${collisions.length} of these are CONFIRMED NODES, and none is an ingredient.`);
    console.log(`They are parser wreckage that reached nodes.csv. Retiring them is §1's`);
    console.log(`business — behind a redirect, never a delete — so they are only named here:`);
    for (const [h, e] of collisions.sort((a, b) => b[1].n - a[1].n)) {
      console.log(`  ${String(e.n).padStart(5)}  ${h}`);
    }
  } else {
    console.log(`\nno caught head is a confirmed node`);
  }
  console.log(`\nwrote data/qc/not-stocked.csv — the full list, for auditing`);
}

main();
