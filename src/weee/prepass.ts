/**
 * A first QC pass, so the human one is short.
 *
 *   npm run weee-prepass
 *
 * Decides only what is MECHANICAL, and leaves every judgement call untouched.
 * The output is two CSVs in the offline tool's own import format, written into
 * the bundle folder so they travel with it — Import both, and the review opens
 * with the easy rows already answered.
 *
 * ── What counts as mechanical ──────────────────────────────────────────────
 *
 * Vocabulary: a row is auto-accepted only when the catalogue name is IDENTICAL
 * to a confirmed ontology node — `match = exact`, `confidence = high`,
 * `in_ontology = confirmed`. There is no question to answer: the shelf and the
 * corpus already agree, and WEEE-SPEC §4a calls that agreement the finding
 * rather than the noise.
 *
 * Everything else is left blank on purpose:
 *
 *   plural      differs only in number — but WHICH spelling is the
 *               representational one is exactly the question §4 exists to ask
 *   suffix      the rung that produced `alaskan red sea cucumber -> cucumber`
 *   unmatched   a name the ontology has never seen; the most interesting rows
 *
 * Recipe mapping: a line is auto-mapped only when its parsed head resolves to
 * exactly ONE vocabulary name under the same number- and spacing-insensitive
 * key the typeahead uses. One candidate and no ambiguity is a lookup, not a
 * decision. Two candidates is a choice, and it stays yours.
 *
 * Every auto row carries `auto:` in its note, so filtering for them and
 * spot-checking is one search. Nothing here is final — the tool treats these
 * exactly like your own answers, and one key overturns any of them.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { singular } from "../ontology/normalize.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WEEE = resolve(ROOT, "data/weee");
const ONT = resolve(ROOT, "data/ontology");
const OUT = resolve(WEEE, "offline");

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

/** The typeahead's key: number- and spacing-insensitive. */
const key = (s: string) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    .split(" ").filter(Boolean).map(singular).join(" ");

function main() {
  const vocab = asObjects(readFileSync(resolve(WEEE, "vocabulary.csv"), "utf8"));
  const lines = JSON.parse(readFileSync(resolve(ONT, "recipe-lines.json"), "utf8")) as
    Record<string, Array<{ raw: string; head: string }>>;
  const stamp = new Date().toISOString();

  // ── vocabulary ───────────────────────────────────────────────────────────
  const vrows: (string | number)[][] = [["id", "name", "verdict", "value", "note", "decided_at"]];
  const leftBy = new Map<string, number>();
  let accepted = 0;

  for (const v of vocab) {
    const mechanical = v["match"] === "exact" && v["confidence"] === "high" &&
                       v["in_ontology"] === "confirmed";
    if (mechanical) {
      accepted++;
      vrows.push([v["id"]!, v["name"]!, "accept", "",
                  "auto: identical to a confirmed ontology node", stamp]);
    } else {
      const why = v["match"] ? `${v["match"]} match` : "new to us";
      leftBy.set(why, (leftBy.get(why) ?? 0) + 1);
    }
  }

  // ── recipe mapping ───────────────────────────────────────────────────────
  /** key → the vocabulary names that share it. More than one means a choice. */
  const byKey = new Map<string, Set<string>>();
  for (const v of vocab) {
    const k = key(v["name"] ?? "");
    if (!k) continue;
    (byKey.get(k) ?? byKey.set(k, new Set()).get(k)!).add(v["name"]!);
  }

  const mrows: (string | number)[][] = [["recipe_id", "line", "raw", "parsed_head", "weee_name"]];
  let mapped = 0, ambiguous = 0, noHit = 0, blank = 0;

  for (const [rid, ls] of Object.entries(lines)) {
    for (const [i, l] of ls.entries()) {
      const head = (l.head ?? "").trim();
      if (!head) { blank++; continue; }
      const hits = byKey.get(key(head));
      if (!hits) { noHit++; continue; }
      if (hits.size > 1) { ambiguous++; continue; }
      mapped++;
      mrows.push([rid, i, l.raw ?? "", head, [...hits][0]!]);
    }
  }

  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  writeFileSync(resolve(OUT, "prepass-vocabulary.csv"), csv(vrows));
  writeFileSync(resolve(OUT, "prepass-recipe-map.csv"), csv(mrows));

  // ── the worklist ─────────────────────────────────────────────────────────
  /**
   * Undecided rows, ordered by how much of the CORPUS each one serves.
   *
   * 5,698 rows left is not a review anybody finishes. But they are wildly
   * unequal: a name that would resolve 600 ingredient lines and a name that
   * matches nothing in the corpus cost the same to read and are not worth the
   * same. So the queue is sorted by lines served, and the report says how far
   * down you have to go to cover most of it.
   *
   * Rows serving zero lines are kept, last. They are not junk — the corpus will
   * grow into some of them — but they are not what a first session is for.
   */
  const servedBy = new Map<string, number>();
  for (const ls of Object.values(lines)) {
    for (const l of ls) {
      const hits = byKey.get(key(l.head ?? ""));
      if (!hits) continue;
      for (const n of hits) servedBy.set(n, (servedBy.get(n) ?? 0) + 1);
    }
  }

  const undecided = vocab
    .filter((v) => !(v["match"] === "exact" && v["confidence"] === "high" &&
                     v["in_ontology"] === "confirmed"))
    .map((v) => ({ v, serves: servedBy.get(v["name"] ?? "") ?? 0 }))
    .sort((a, b) =>
      b.serves - a.serves ||
      Number(b.v["sku_support"] || 0) - Number(a.v["sku_support"] || 0) ||
      (a.v["name"] ?? "").localeCompare(b.v["name"] ?? ""));

  const wrows: (string | number)[][] = [[
    "rank", "id", "name", "serves_lines", "sku_support", "match", "confidence",
    "node", "examples",
  ]];
  undecided.forEach((u, i) => wrows.push([
    i + 1, u.v["id"]!, u.v["name"]!, u.serves, u.v["sku_support"] ?? "",
    u.v["match"] ?? "", u.v["confidence"] ?? "", u.v["node"] ?? "", u.v["examples"] ?? "",
  ]));
  writeFileSync(resolve(OUT, "prepass-worklist.csv"), csv(wrows));

  const totalServed = undecided.reduce((a, u) => a + u.serves, 0);
  let run = 0, to80 = 0, to95 = 0;
  for (const [i, u] of undecided.entries()) {
    run += u.serves;
    if (!to80 && run >= totalServed * 0.8) to80 = i + 1;
    if (!to95 && run >= totalServed * 0.95) to95 = i + 1;
  }
  const deadWeight = undecided.filter((u) => u.serves === 0).length;

  const totalLines = mapped + ambiguous + noHit + blank;
  const pct = (x: number, of: number) => `${Math.round((x / of) * 100)}%`;

  console.log(`VOCABULARY  ${vocab.length} names`);
  console.log(`  auto-accepted   ${accepted} (${pct(accepted, vocab.length)}) — identical to a confirmed node`);
  console.log(`  left for you    ${vocab.length - accepted}`);
  for (const [why, n] of [...leftBy].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${String(n).padStart(5)}  ${why}`);
  }
  console.log(`\nRECIPE LINES  ${totalLines}`);
  console.log(`  auto-mapped     ${mapped} (${pct(mapped, totalLines)}) — exactly one vocabulary name matched`);
  console.log(`  ambiguous       ${ambiguous} — more than one candidate, yours to pick`);
  console.log(`  no candidate    ${noHit}`);
  console.log(`  no parsed head  ${blank}`);
  console.log(`\nWORKLIST  ${undecided.length} undecided names, ordered by corpus impact`);
  console.log(`  the top ${to80} cover 80% of the corpus lines they could serve`);
  console.log(`  the top ${to95} cover 95%`);
  console.log(`  ${deadWeight} serve no line in the corpus at all — read last, or never`);
  console.log(`\nwrote prepass-vocabulary.csv, prepass-recipe-map.csv and prepass-worklist.csv`);
  console.log(`into ${OUT}`);
}

main();
