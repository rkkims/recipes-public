/**
 * Ranking, asserted against the real ontology.
 *
 *   npm run test-suggest
 *
 * Cases are taken from the corpus's own unmatched heads, not invented — these
 * are rows an annotator will actually meet.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { suggest, type Candidate } from "./suggest.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ONT = resolve(ROOT, "data/ontology");

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

const nodeRows = parseCsv(readFileSync(resolve(ONT, "nodes.csv"), "utf8")).slice(1)
  .filter((r) => r[2] === "confirmed");
const mentions = new Map(nodeRows.map((r) => [r[0]!, Number(r[1] || 0)]));

const CANDIDATES: Candidate[] = [
  ...nodeRows.map((r) => ({ node: r[0]!, surface: r[0]!, mentions: Number(r[1] || 0) })),
  ...parseCsv(readFileSync(resolve(ONT, "aliases.csv"), "utf8")).slice(1)
    .map((r) => ({ node: r[1]!, surface: r[0]!, mentions: mentions.get(r[1]!) ?? 0 })),
];

let pass = 0, fail = 0;
const check = (label: string, fn: () => void) => {
  try { fn(); pass++; }
  catch (e) { fail++; console.error(`  FAIL  ${label}\n        ${(e as Error).message.split("\n")[0]}`); }
};

const top = (q: string) => suggest(q, CANDIDATES)[0]?.node;
const topN = (q: string, n: number) => suggest(q, CANDIDATES).slice(0, n).map((h) => h.node);

// ── the regression this module exists for ──────────────────────────────────
check('"whole onion" ranks onion above scallion', () => {
  const r = topN("whole onion", 3);
  assert.equal(r[0], "onion", `got ${JSON.stringify(r)}`);
});

// ── head noun carries identity ─────────────────────────────────────────────
const HEAD: Array<[string, string]> = [
  ["sea salt", "salt"],
  ["cracked black pepper", "black pepper"],
  // whole milk became a NODE in the 2026-08-20 small-family pass (milk sorts
  // by fat), so the right suggestion is now the node itself.
  ["whole milk", "whole milk"],
  ["green chili", "green chili pepper"],
  ["fresh garlic", "garlic"],
  ["toasted sesame oil", "sesame oil"],
];
for (const [q, want] of HEAD) {
  check(`"${q}" → ${want}`, () => {
    assert.equal(top(q), want, `got ${JSON.stringify(topN(q, 3))}`);
  });
}

// ── exact hits short-circuit ───────────────────────────────────────────────
check('"korean red chili pepper flakes" resolves via alias', () => {
  const [h] = suggest("korean red chili pepper flakes", CANDIDATES);
  assert.equal(h?.node, "gochugaru");
  assert.equal(h?.how, "alias");
  assert.ok(h?.via, "an alias hit should report the surface it matched");
});
check('"garlic" resolves as a node, with no via', () => {
  const [h] = suggest("garlic", CANDIDATES);
  assert.equal(h?.node, "garlic");
  assert.equal(h?.how, "node");
  assert.equal(h?.via, null);
});
check("the number rule still bridges plurals", () => {
  assert.equal(top("chicken thigh"), "chicken thighs");
});

// ── typeahead: a half-written word still ranks ─────────────────────────────
check('"gochu" offers the gochu- ingredients', () => {
  const r = topN("gochu", 4);
  assert.ok(r.includes("gochugaru") || r.includes("gochujang"), `got ${JSON.stringify(r)}`);
});

// ── one answer, one row ────────────────────────────────────────────────────
check("results are deduplicated by node", () => {
  for (const q of ["green onion", "whole onion", "red pepper", "soy", "chili"]) {
    const nodes = suggest(q, CANDIDATES).map((h) => h.node);
    assert.equal(new Set(nodes).size, nodes.length, `"${q}" repeated a node: ${nodes.join(", ")}`);
  }
});

check("an empty query offers nothing", () => {
  assert.deepEqual(suggest("", CANDIDATES), []);
  assert.deepEqual(suggest("   ", CANDIDATES), []);
});

check("nonsense offers nothing rather than something", () => {
  assert.deepEqual(suggest("zzzqqxx", CANDIDATES), []);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
