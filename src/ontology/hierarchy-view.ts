/**
 * Draw the drafted hierarchy as a browsable key — the QC view.
 *
 *   npm run hierarchy-view      # writes data/qc/hierarchy.html
 *
 * Three CSVs and an alias table are hard to hold in your head at once, and the
 * thing they describe is a TREE. `cod`, `pollock`, `basa` and fifteen others
 * under one proposed `white fish` is one glance as a tree and twenty scattered
 * rows as a spreadsheet.
 *
 * The page is self-contained — data inlined, no network — so it opens from a
 * file:// path on the review laptop like the rest of the offline bundle.
 *
 * ── What the view is careful about ─────────────────────────────────────────
 *
 * Ordering is CORPUS REACH: a node's own mentions plus every descendant's.
 * A proposed category has zero mentions of its own — `white fish` is not in
 * the corpus as a node — so ranking categories by their own count would sort
 * every one of them to the bottom, which is exactly backwards from what makes
 * them worth minting.
 *
 * Each row is marked with the edge INTO it, because provenance is the whole
 * review question: `der` was derived from the name and needs no judgement,
 * `llm` was drafted from meaning and does, `new` means accepting it mints a
 * node. Confidence and the trap flags ride alongside.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ONT = resolve(ROOT, "data/ontology");
const QC = resolve(ROOT, "data/qc");
const TEMPLATE = resolve(ROOT, "src/ontology/hierarchy-view.html");
const OUT = resolve(QC, "hierarchy.html");

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

type Edge = { parent: string; src: "d" | "l" | "n"; conf: string; reason: string; flag: string };

function main() {
  const mentions = new Map<string, number>();
  for (const r of objs(resolve(ONT, "nodes.csv"))) {
    if (r["status"] === "confirmed") mentions.set(r["node"]!, Number(r["mentions"] || 0));
  }

  /**
   * First writer wins, and the order is deliberate: a derived edge is a rule
   * and needs no review, so it must not be displaced by a drafted opinion
   * about the same child.
   */
  const edge = new Map<string, Edge>();
  for (const r of objs(resolve(QC, "hierarchy.csv"))) {
    edge.set(r["child"]!, { parent: r["parent"]!, src: "d", conf: "", reason: "", flag: r["flag"] ?? "" });
  }
  for (const r of objs(resolve(QC, "hierarchy-llm.csv"))) {
    if (edge.has(r["child"]!)) continue;
    edge.set(r["child"]!, { parent: r["parent"]!, src: "l", conf: r["confidence"] ?? "",
                            reason: r["reason"] ?? "", flag: r["flag"] ?? "" });
  }

  // The new-nodes file repeats the category only on its first row.
  const proposed = new Set<string>();
  let current = "";
  for (const r of objs(resolve(QC, "hierarchy-llm-new-nodes.csv"))) {
    if (r["proposed_node"]) current = r["proposed_node"];
    if (!current) continue;
    proposed.add(current);
    if (edge.has(r["child"]!)) continue;
    edge.set(r["child"]!, { parent: current, src: "n", conf: r["confidence"] ?? "",
                            reason: r["reason"] ?? "", flag: "" });
  }

  const names = new Set<string>();
  for (const [child, e] of edge) { names.add(child); names.add(e.parent); }

  const list = [...names].sort();
  const idx = new Map(list.map((n, i) => [n, i]));
  const nodes = list.map((n) => {
    const e = edge.get(n);
    return {
      n, m: mentions.get(n) ?? 0,
      p: e ? (idx.get(e.parent) ?? -1) : -1,
      s: e ? e.src : "", c: e?.conf ?? "", r: e?.reason ?? "", f: e?.flag ?? "",
      x: proposed.has(n) ? 1 : 0,
    };
  });

  const aliases = objs(resolve(QC, "hierarchy-llm-aliases.csv"))
    .map((a) => ({ s: a["surface"]!, n: a["node"]!, note: a["note"] ?? "" }));

  const srcCount = (s: string) => [...edge.values()].filter((e) => e.src === s).length;
  const totals = {
    nodes: mentions.size,
    derived: srcCount("d"), drafted: srcCount("l"), newkids: srcCount("n"),
    proposed: proposed.size, aliases: aliases.length,
    roots: nodes.filter((n) => n.p === -1).length,
    orphans: mentions.size - edge.size,
  };

  const template = readFileSync(TEMPLATE, "utf8");
  // A literal `</script>` inside the JSON would close the tag early.
  const json = JSON.stringify({ nodes, aliases, totals }).replace(/<\//g, "<\\/");
  if (!template.includes("__DATA__")) {
    console.error(`${TEMPLATE} has no __DATA__ placeholder — refusing to write a page with no data.`);
    process.exit(1);
  }

  if (!existsSync(QC)) mkdirSync(QC, { recursive: true });
  writeFileSync(OUT, template.replace("__DATA__", json));

  console.log(`${totals.nodes} confirmed nodes, ${nodes.length} of them placed in the tree`);
  console.log(`  derived by name     ${totals.derived}`);
  console.log(`  drafted by meaning  ${totals.drafted}`);
  console.log(`  under a new node    ${totals.newkids} across ${totals.proposed} proposed categories`);
  console.log(`  roots               ${totals.roots}`);
  console.log(`  still unplaced      ${totals.orphans}`);
  console.log(`\nwrote ${OUT} (${Math.round(readFileSync(OUT).length / 1024)}KB, self-contained)`);
}

main();
