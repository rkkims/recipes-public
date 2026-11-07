/**
 * Build the offline QC tool — QC-SPEC.
 *
 *   npm run offline-qc
 *
 * Writes `data/qc/offline-qc/index.html`: one self-contained file, opened from
 * `file://` on the review laptop. No server, because `file://` cannot `fetch`
 * and because QC-SPEC §8.2 settled it — so every byte the tool needs is inlined.
 *
 * ── What ships ─────────────────────────────────────────────────────────────
 *
 * Recipes with their raw ingredient lines, the confirmed nodes, the alias
 * table, the hierarchy as parent pointers, and the set of heads that do not
 * gate a match. That is the whole ontology the annotator needs and nothing
 * else — no ids, because `identity.csv` lives on the VM and the page must
 * never invent one (§3).
 *
 * ── The one thing this build asserts ───────────────────────────────────────
 *
 * The page carries its own copy of `numberKey` and `suggest`, because it runs
 * with no module loader. A second implementation of the ranking rule is a
 * drift waiting to happen — and a silent one, since both sides would keep
 * returning plausible answers.
 *
 * So the build RUNS BOTH over real corpus heads and refuses to write the file
 * if they disagree. The page's copy is extracted from the template and
 * evaluated here, so what is checked is the code that actually ships.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { suggest, type Candidate } from "../ontology/suggest.js";
import { notStocked } from "../ontology/not-stocked.js";
import { numberKey } from "../ontology/naming.js";
import { DERIVES_FROM } from "../ontology/edges.js";
import { IRREGULAR, KEEP_PLURAL } from "../ontology/normalize.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ONT = resolve(ROOT, "data/ontology");
const QC = resolve(ROOT, "data/qc");
const OUT_DIR = resolve(QC, "offline-qc");
const TEMPLATE = resolve(ROOT, "src/qc/offline-qc.html");

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
const objs = (f: string): Record<string, string>[] => {
  if (!existsSync(f)) return [];
  const rows = parseCsv(readFileSync(f, "utf8"));
  const h = rows[0];
  if (!h) return [];
  return rows.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""])));
};

type Line = { raw: string; head: string; node?: string };
type Recipe = { id: string; title: string; source: string; cuisine: string; url: string;
                requires?: string[]; optional?: string[] };

function main() {
  // ── nodes, aliases ───────────────────────────────────────────────────────
  const nodeRows = objs(resolve(ONT, "nodes.csv")).filter((r) => r["status"] === "confirmed");
  const nodeSet = new Set(nodeRows.map((r) => r["node"]!));
  const mentions = new Map(nodeRows.map((r) => [r["node"]!, Number(r["mentions"] || 0)]));


  /**
   * Accepted aliases and PROPOSED ones, in one list and told apart by `p`.
   *
   * `aliases.csv` holds 433 rows that review has already settled. The 124
   * same_as rows drafted alongside the hierarchy have never been merged into
   * it, so shipping only the accepted file left a quarter of the alias work
   * invisible to the tool meant for reviewing it. Both ship; the page marks
   * the proposed ones and offers accept/reject on each.
   */
  const accepted = objs(resolve(ONT, "aliases.csv"))
    .filter((a) => a["surface"] && a["node"] && nodeSet.has(a["node"]!))
    .map((a) => ({ s: a["surface"]!, n: a["node"]! }));
  const settled = new Set(accepted.map((a) => a.s));
  const proposed = objs(resolve(QC, "hierarchy-llm-aliases.csv"))
    .filter((a) => a["surface"] && a["node"] && nodeSet.has(a["node"]!) && !settled.has(a["surface"]!))
    .map((a) => ({ s: a["surface"]!, n: a["node"]!, p: 1 as const, why: a["note"] ?? "" }));
  const aliases = [...accepted, ...proposed];

  // ── hierarchy as parent pointers, with provenance ────────────────────────
  /**
   * `[parent, provisional]`. Provisional means the edge is still a PROPOSAL —
   * §8.1b. The page draws those with a dashed underline, so an annotator
   * reading `fish › white fish › basa` can see which parts of that path the
   * ontology has actually accepted and which are drafted.
   */
  const parent: Record<string, [string, 0 | 1]> = {};
  for (const r of objs(resolve(QC, "hierarchy.csv")))
    if (r["child"] && r["parent"]) parent[r["child"]] = [r["parent"], 1];
  for (const r of objs(resolve(QC, "hierarchy-llm.csv")))
    if (r["child"] && r["parent"] && !parent[r["child"]]) parent[r["child"]] = [r["parent"], 1];
  let current = "";
  for (const r of objs(resolve(QC, "hierarchy-llm-new-nodes.csv"))) {
    if (r["proposed_node"]) current = r["proposed_node"];
    if (current && r["child"] && !parent[r["child"]]) parent[r["child"]] = [current, 1];
  }

  /**
   * The hierarchy REVIEW QUEUE — every derived proposal, in one list.
   *
   * The parent pointers above answer "what path does this node sit on"; this
   * answers "which of these edges are true", which is a different job and was
   * previously reachable only by stumbling into a node from a recipe line. 673
   * prefix proposals and 1,567 suffix ones will not be reviewed incidentally.
   *
   * Both rules ship together, keyed by child+parent so the same edge proposed
   * twice appears once. Where they disagree — 240 rows — BOTH are offered,
   * because both can be true: `beef flank steak` is a kind of steak and a kind
   * of beef, and the matcher now holds two parents.
   *
   * Ordered by how many recipes the child appears in. A reviewer trades time
   * against corpus impact, not against alphabetical order.
   */
  const proposals = new Map<string, {
    c: string; p: string; rel: "is_a" | "derives_from"; r: number; pr: number;
    src: string; flag: string;
  }>();
  /**
   * Edges review has already settled — accepted or rejected.
   *
   * The derivation rules regenerate the same 2,452 proposals on every build. A
   * queue that offered a rejected edge again would make the reviewer's work
   * evaporate, which is the fastest way to teach someone to stop reviewing.
   */
  const settledEdges = new Set<string>();
  for (const f of ["../ontology/is_a.csv", "../ontology/derives_from.csv",
                   "../decisions/rejected-edges.csv"]) {
    for (const r of objs(resolve(QC, f))) {
      const a = r["child"] ?? r["part"] ?? "", b = r["parent"] ?? r["whole"] ?? "";
      if (a && b) settledEdges.add(a + "\u0000" + b);
    }
  }

  const addProposal = (
    child: string, par: string, rel: "is_a" | "derives_from", src: string, flag: string,
  ) => {
    if (!child || !par || child === par) return;
    if (!nodeSet.has(child) || !nodeSet.has(par)) return;
    const key = child + "\u0000" + par;
    if (settledEdges.has(key)) return;
    const had = proposals.get(key);
    // Proposed by both rules is a signal in itself — record it rather than
    // letting whichever loaded second win.
    if (had) { if (!had.src.includes(src)) had.src += "+" + src; return; }
    proposals.set(key, {
      c: child, p: par, rel, r: 0, pr: 0, src, flag,
    });
  };
  for (const r of objs(resolve(QC, "hierarchy.csv")))
    addProposal(r["child"] ?? "", r["parent"] ?? "", "is_a", "suffix", r["flag"] ?? "");
  for (const r of objs(resolve(QC, "hierarchy-prefix.csv")))
    addProposal(r["child"] ?? "", r["parent"] ?? "",
                (r["relation"] === "derives_from" ? "derives_from" : "is_a"), "prefix", r["flag"] ?? "");
  for (const r of objs(resolve(QC, "hierarchy-llm.csv")))
    addProposal(r["child"] ?? "", r["parent"] ?? "", "is_a", "llm", r["note"] ?? "");

  // ── recipes and their lines ──────────────────────────────────────────────
  const index = JSON.parse(readFileSync(resolve(ONT, "recipe-index.json"), "utf8")) as
    { recipes: Recipe[] };
  const lines = JSON.parse(readFileSync(resolve(ONT, "recipe-lines.json"), "utf8")) as
    Record<string, Line[]>;

  /**
   * How many RECIPES use each ingredient — the number the suggestion row shows
   * and the prior the ranking breaks ties on. Distinct recipes, not ingredient
   * lines: `mentions` double-counts a recipe that names something twice, and
   * "used by 40 recipes" is the fact an annotator can actually judge.
   */
  const recipeCount = new Map<string, number>();

  /** id → node name. The page never sees an id (§6). */
  const idName = new Map<string, string>();
  for (const r of objs(resolve(ONT, "identity.csv")))
    if (r["id"] && r["name"] && !r["retired_to"]) idName.set(r["id"], r["name"]);

  for (const r of index.recipes) {
    const seen = new Set<string>();
    for (const id of [...(r.requires ?? []), ...(r.optional ?? [])]) {
      const name = idName.get(id);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      recipeCount.set(name, (recipeCount.get(name) ?? 0) + 1);
    }
  }

  // Impact, filled once the recipe counts exist.
  for (const pr of proposals.values()) {
    pr.r = recipeCount.get(pr.c) ?? 0;
    pr.pr = recipeCount.get(pr.p) ?? 0;
  }
  const hier = [...proposals.values()]
    .sort((a, b) => b.r - a.r || a.c.localeCompare(b.c) || a.p.localeCompare(b.p));

  const nodes = nodeRows.map((r) => ({
    n: r["node"]!,
    m: Number(r["mentions"] || 0),
    r: recipeCount.get(r["node"]!) ?? 0,
  }));

  const notStockedHeads = new Set<string>();
  const recipes = index.recipes.map((r) => {
    const ls = (lines[r.id] ?? []).map((l) => {
      const head = (l.head ?? "").trim();
      if (head && notStocked(head)) notStockedHeads.add(head);
      const name = l.node ? idName.get(l.node) ?? "" : "";
      return { r: l.raw ?? "", h: head, n: nodeSet.has(name) ? name : "" };
    });
    return { i: r.id, t: r.title ?? "", s: r.source ?? "", c: r.cuisine ?? "", u: r.url ?? "", l: ls };
  }).filter((r) => r.l.length);

  const data = {
    builtAt: new Date().toISOString(),
    nodes, aliases, parent,
    derives: DERIVES_FROM.map((d) => [d.part, d.whole]),
    hier,
    notStocked: [...notStockedHeads],
    irregular: IRREGULAR,
    keepPlural: [...KEEP_PLURAL],
    recipes,
  };

  // ── the drift check ──────────────────────────────────────────────────────
  const template = readFileSync(TEMPLATE, "utf8");
  if (!template.includes("__DATA__")) {
    console.error("template has no __DATA__ placeholder — refusing to write a tool with no data.");
    process.exit(1);
  }
  assertSuggestAgrees(template, data, nodes, aliases, mentions, recipeCount);

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const json = JSON.stringify(data).replace(/<\//g, "<\\/");
  const html = template.replace("__DATA__", json);
  writeFileSync(resolve(OUT_DIR, "index.html"), html);
  /**
   * The stamp the import's staleness gate reads. Written beside the bundle so
   * the two cannot be separated: an export names the build it came from, and
   * `qc-import` refuses it if this file has moved on since.
   */
  writeFileSync(resolve(OUT_DIR, ".build"), data.builtAt + "\n");

  const open = recipes.filter((r) => r.l.some((l) => !l.n && !notStockedHeads.has(l.h))).length;
  console.log(`${recipes.length} recipes, ${recipes.reduce((a, r) => a + r.l.length, 0)} lines`);
  console.log(`  ${nodes.length} nodes, ${accepted.length} accepted + ${proposed.length} proposed aliases, ${Object.keys(parent).length} hierarchy edges`);
  console.log(`  ${hier.length} hierarchy proposals in the review queue ` +
              `(${hier.filter((h) => h.rel === "is_a").length} is_a, ` +
              `${hier.filter((h) => h.rel === "derives_from").length} derives_from)`);
  console.log(`  ${notStockedHeads.size} head(s) marked assumed-on-hand — they never gate a match`);
  console.log(`  ${open} recipe(s) have at least one unresolved line — the queue`);
  console.log(`\nwrote ${resolve(OUT_DIR, "index.html")} (${Math.round(html.length / 1048576 * 10) / 10} MB, self-contained)`);
  console.log(`open it with a file:// URL; Save to file… once, and it autosaves from then on`);
}

/**
 * Run the page's own `suggest` against the real one and refuse to build if they
 * disagree. Extracted from the template rather than re-typed, so this checks
 * the code that ships.
 */
function assertSuggestAgrees(
  template: string,
  data: { nodes: { n: string; m: number; r: number }[]; aliases: { s: string; n: string }[];
          irregular: Record<string, string>; keepPlural: string[] },
  nodes: { n: string; m: number; r: number }[],
  aliases: { s: string; n: string }[],
  mentions: Map<string, number>,
  recipes: Map<string, number>,
) {
  const start = template.indexOf('var IRREGULAR = D.irregular');
  const end = template.indexOf("/** `fish › white fish › basa`");
  if (start < 0 || end < 0 || end <= start) {
    console.error("could not find the page's suggest implementation — the drift check cannot run.");
    process.exit(1);
  }
  const src = template.slice(start, end);

  /**
   * The slice starts below the page's own bindings, so the sandbox has to
   * restate them — verbatim, from the same template, so the preamble cannot
   * drift either.
   */
  const preamble = `
    var NODES = D.nodes, ALIASES = D.aliases;
    var mentions = new Map(NODES.map(function (n) { return [n.n, n.m]; }));
    var nodeSet = new Set(NODES.map(function (n) { return n.n; }));
  `;
  const sandbox = new Function("D", `
    ${preamble}
    ${src}
    return { numberKey: numberKey, suggest: suggest };
  `)({ irregular: data.irregular, keepPlural: data.keepPlural, nodes: data.nodes, aliases: data.aliases });

  const candidates: Candidate[] = [
    ...nodes.map((n) => ({ node: n.n, surface: n.n, mentions: n.m, recipes: n.r })),
    ...aliases.map((a) => ({ node: a.n, surface: a.s, mentions: mentions.get(a.n) ?? 0,
                             recipes: recipes.get(a.n) ?? 0 })),
  ];

  const probes = [
    "whole onion", "sea salt", "cracked black pepper", "gim", "gochu", "basa",
    "korean red chili pepper flakes", "chicken thigh", "green chili", "whole milk",
    "cooking sake", "fresh garlic", "sesame seed", "pork ribs", "nori",
    "toasted sesame oil", "rice water", "zzzqqxx", "", "   ",
  ];

  let bad = 0;
  for (const p of probes) {
    const mine = suggest(p, candidates, 5).map((h) => h.node).join("|");
    const theirs = (sandbox.suggest(p, 5) as { node: string }[]).map((h) => h.node).join("|");
    if (mine !== theirs) {
      bad++;
      console.error(`  DRIFT on ${JSON.stringify(p)}\n    suggest.ts : ${mine || "(none)"}\n    the page   : ${theirs || "(none)"}`);
    }
    const k1 = numberKey(p), k2 = sandbox.numberKey(p) as string;
    if (k1 !== k2) { bad++; console.error(`  DRIFT numberKey(${JSON.stringify(p)}): ${k1} vs ${k2}`); }
  }
  if (bad) {
    console.error(`\n${bad} disagreement(s) between suggest.ts and the page's copy. Not writing the tool.`);
    process.exit(1);
  }
  console.log(`suggest parity: ${probes.length} probes agree with src/ontology/suggest.ts`);
}

main();
