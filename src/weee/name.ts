/**
 * Step 4 — the naming authority.
 *
 *   npm run weee-name
 *
 * WEEE-SPEC §4. Two files come out of this, for two different jobs:
 *
 *   vocabulary.csv   every distinct catalogue name, with the evidence behind
 *                    it. This is the artefact to QC by hand.
 *   naming.csv       one row per ontology node the catalogue has an opinion
 *                    about: what we call it, what the shelf calls it, and
 *                    whether those agree.
 *
 * §4a: this RENAMES, it does not add. The corpus already has the ingredients;
 * what it lacks is an answer to which surface is the name. Nothing here mints
 * an id, and `agrees = yes` rows are the finding rather than the noise — each
 * one is an independent confirmation that corpus frequency picked a name a
 * shopper would recognise.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { singular } from "../ontology/normalize.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, "data/weee");
const NODES = resolve(ROOT, "data/ontology/nodes.csv");

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

/** Number-insensitive key, the same trick `normalize.ts` uses for synonyms. */
const key = (s: string) => s.split(" ").filter(Boolean).map(singular).join(" ");

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/**
 * How a catalogue name reaches an ontology node.
 *
 * Exact match answers 14% of the vocabulary and string equality is the wrong
 * join — `king oyster mushrooms` and the node `king oyster mushroom` are the
 * same ingredient, and `superior light soy sauce` is `light soy sauce` wearing
 * a marketing word. So the ladder, strongest first:
 *
 *   exact      identical strings                    → the shelf agrees with us
 *   plural     identical after singularising        → agreement, different number
 *   suffix     the node is a token-suffix of the
 *              catalogue name                       → the shelf adds words
 *   suffix-rev the catalogue name is a token-suffix
 *              of the node                          → WE add words
 *
 * Suffix, not substring. `soy sauce` occurs inside `sweet soy sauce paste`,
 * which is a different product; requiring the match to end the string keeps the
 * head noun shared, which is what makes the two names candidates at all.
 * Matching is on token boundaries so `oil` cannot match `broil`.
 */
type MatchKind = "exact" | "plural" | "suffix" | "suffix-rev";

function buildMatcher(nodes: string[]) {
  const byExact = new Map(nodes.map((n) => [n, n]));
  const byKey = new Map<string, string>();
  for (const n of nodes) if (!byKey.has(key(n))) byKey.set(key(n), n);

  /**
   * Every proper token-suffix of every node, pointing back at the node.
   *
   * Built once instead of scanned per name. The linear version was 134,000
   * names times 4,968 nodes and did not finish in ten minutes; this is one map
   * lookup. The shortest node wins a shared suffix, because a bare `oil` more
   * likely means `oil` than `garlic infused chili oil`.
   */
  const revIndex = new Map<string, string>();
  for (const n of nodes) {
    const t = key(n).split(" ");
    for (let i = 1; i < t.length; i++) {
      const suf = t.slice(i).join(" ");
      const cur = revIndex.get(suf);
      if (!cur || cur.length > n.length) revIndex.set(suf, n);
    }
  }

  return (name: string): { node: string; kind: MatchKind } | null => {
    if (byExact.has(name)) return { node: name, kind: "exact" };
    const k = key(name);
    const p = byKey.get(k);
    if (p) return { node: p, kind: "plural" };

    // The node is a suffix of the catalogue name: the shelf is more specific,
    // or has prefixed a grade word. Longest node wins — `light soy sauce`
    // beats `soy sauce` for `superior light soy sauce`.
    const toks = k.split(" ");
    for (let i = 1; i < toks.length; i++) {
      const tail = toks.slice(i).join(" ");
      const hit = byKey.get(tail);
      if (hit) return { node: hit, kind: "suffix" };
    }
    // The catalogue name is a suffix of a node: we are the more specific one.
    const rev = revIndex.get(k);
    if (rev) return { node: rev, kind: "suffix-rev" };
    return null;
  };
}

async function main() {
  const parsedFile = resolve(OUT, "parsed.csv");
  if (!existsSync(parsedFile)) throw new Error(`run 'npm run weee-parse' first — no ${parsedFile}`);

  const parsed = asObjects(readFileSync(parsedFile, "utf8")).filter((r) => !r["drop"]);

  /**
   * Heads the corpus actually produced.
   *
   * The second half of the admission gate. A sitemap title may enter the
   * vocabulary if it names something we already have — an ontology node, or a
   * head a recipe wrote even though review has not placed it yet. `mirin` is
   * the second kind: 293 corpus lines want it and no node exists.
   */
  const corpusHeads = new Set<string>();
  const linesFile = resolve(ROOT, "data/ontology/recipe-lines.json");
  if (existsSync(linesFile)) {
    const byRecipe = JSON.parse(readFileSync(linesFile, "utf8")) as
      Record<string, { head?: string }[]>;
    for (const ls of Object.values(byRecipe)) {
      for (const l of ls) if (l.head) corpusHeads.add(key(l.head));
    }
  }
  const nodeRows = asObjects(readFileSync(NODES, "utf8"));
  const nodes = nodeRows.map((r) => r["node"]!).filter(Boolean);
  const confirmed = new Set(nodeRows.filter((r) => r["status"] === "confirmed").map((r) => r["node"]!));
  const match = buildMatcher(nodes);

  // ── the vocabulary ───────────────────────────────────────────────────────
  type Entry = {
    name: string; skus: number; shelfSkus: number;
    shelves: Set<string>; names: Set<string>; eg: string[];
  };
  const vocab = new Map<string, Entry>();
  for (const r of parsed) {
    const name = r["canonical"]!;
    if (!name) continue;
    const e = vocab.get(name)
      ?? { name, skus: 0, shelfSkus: 0, shelves: new Set(), names: new Set(), eg: [] };
    e.skus++;
    if (r["source"] === "shelf") {
      e.shelfSkus++;
      if (r["shelf"]) e.shelves.add(r["shelf"]);
      if (r["shelf_name"]) e.names.add(r["shelf_name"]);
    }
    if (e.eg.length < 3) e.eg.push(r["title"]!);
    vocab.set(name, e);
  }

  /**
   * The admission gate — WEEE-SPEC §2, narrowly extended.
   *
   * A shelf name is in because a reviewer chose the aisle. A sitemap name is in
   * only if it reaches an ingredient we already have. That is what keeps the
   * 242,000-title prepared-food tail out: `selfheating beef hot pot tomato
   * flavor` joins to nothing and never appears, while `mirin` does and is the
   * whole point of reading the sitemaps at all.
   *
   * The sitemaps are still not a source of new ingredients. Nothing admitted
   * here can mint a node — §7 is unchanged.
   */
  /**
   * Sitemap admissions, capped per ingredient.
   *
   * Exact-match alone was too strict and bare suffix far too loose. The
   * catalogue never carries a product called plain `mirin` — it carries
   * `mirin sweet cooking seasoning` — so requiring equality loses the very word
   * the corpus asks for 293 times. Admitting every suffix match instead put
   * 38,000 product names in, including `korean bbq beef bulgogi marinade sauce`
   * as a way of saying `sauce`.
   *
   * So: find what each name is a name FOR, then keep the three shortest per
   * ingredient. Shortest, because the least product-flavoured phrasing is the
   * one worth typing at; three, because the cap is what bounds the vocabulary
   * to something a person can review and a typeahead can scan per keystroke.
   */
  const headKeys = new Map<string, string>();
  for (const h of corpusHeads) headKeys.set(h, h);
  const targetOf = (name: string): string | null => {
    const m = match(name);
    if (m) return m.node;
    const t = key(name).split(" ");
    // Longest corpus head that starts or ends the name — `mirin sweet cooking
    // seasoning` is a mirin, `sweet chili sauce mix` is a sweet chili sauce.
    for (let n = t.length; n >= 1; n--) {
      const head = headKeys.get(t.slice(0, n).join(" "));
      if (head) return head;
      const tail = headKeys.get(t.slice(t.length - n).join(" "));
      if (tail) return tail;
    }
    return null;
  };

  const SITEMAP_PER_INGREDIENT = 3;
  const admitted = new Map<string, Entry>();
  const byTarget = new Map<string, { name: string; e: Entry }[]>();
  let rejectedTail = 0;

  for (const [name, e] of vocab) {
    if (e.shelfSkus > 0) { admitted.set(name, e); continue; }
    const target = targetOf(name);
    if (!target) { rejectedTail++; continue; }
    (byTarget.get(target) ?? byTarget.set(target, []).get(target)!).push({ name, e });
  }
  let capped = 0;
  for (const list of byTarget.values()) {
    list.sort((a, b) =>
      a.name.split(" ").length - b.name.split(" ").length ||
      b.e.skus - a.e.skus ||
      a.name.length - b.name.length);
    for (const [i, item] of list.entries()) {
      if (i < SITEMAP_PER_INGREDIENT && !admitted.has(item.name)) admitted.set(item.name, item.e);
      else if (i >= SITEMAP_PER_INGREDIENT) capped++;
    }
  }
  rejectedTail += capped;

  /**
   * How much to trust a match without reading it.
   *
   * `suffix` onto a single-word node is the rung that goes wrong: it produced
   * `alaskan red sea cucumber → cucumber`, which is a different animal. A
   * shared head noun is real evidence when the node is `light soy sauce` and
   * much weaker when the node is `oil`. Flagged, not dropped — the reviewer
   * sorting by this column reads the dangerous class first.
   */
  const confidenceOf = (kind: MatchKind, node: string) =>
    kind === "exact" || kind === "plural" ? "high"
    : kind === "suffix" && !node.includes(" ") ? "low"
    : "medium";

  const vrows: (string | number)[][] = [[
    "id", "name", "sku_support", "source", "shelves", "shelf_names", "node", "match",
    "confidence", "in_ontology", "examples",
  ]];
  const perNode = new Map<string, { name: string; kind: MatchKind; skus: number; shelf: string }[]>();

  for (const e of [...admitted.values()].sort((a, b) => b.skus - a.skus || a.name.localeCompare(b.name))) {
    const m = match(e.name);
    vrows.push([
      `weee-${slug(e.name)}`, e.name, e.skus,
      e.shelfSkus > 0 ? "shelf" : "catalogue",
      [...e.shelves].join(" "), [...e.names].join(" | "),
      m?.node ?? "", m?.kind ?? "", m ? confidenceOf(m.kind, m.node) : "",
      m ? (confirmed.has(m.node) ? "confirmed" : "candidate") : "",
      e.eg.join(" | "),
    ]);
    if (m) {
      const list = perNode.get(m.node) ?? [];
      list.push({ name: e.name, kind: m.kind, skus: e.skus, shelf: [...e.names][0] ?? "" });
      perNode.set(m.node, list);
    }
  }
  writeFileSync(resolve(OUT, "vocabulary.csv"), csv(vrows));

  const RANK: Record<MatchKind, number> = { exact: 0, plural: 1, suffix: 2, "suffix-rev": 3 };
  const nrows: (string | number)[][] = [[
    "id", "node", "current_name", "shelf_name", "match", "sku_support", "shelf", "agrees",
  ]];
  let agree = 0, differ = 0;
  for (const [node, list] of [...perNode].sort((a, b) => a[0].localeCompare(b[0]))) {
    list.sort((a, b) => RANK[a.kind] - RANK[b.kind] || b.skus - a.skus);
    const best = list[0]!;
    const agrees = best.kind === "exact" || best.kind === "plural" ? "yes" : "no";
    if (agrees === "yes") agree++; else differ++;
    nrows.push([
      `name-${slug(node)}`, node, node, best.name, best.kind, best.skus, best.shelf, agrees,
    ]);
  }
  writeFileSync(resolve(OUT, "naming.csv"), csv(nrows));

  const matched = vrows.slice(1).filter((r) => r[6]).length;
  const fromShelf = vrows.slice(1).filter((r) => r[3] === "shelf").length;
  console.log(`${vocab.size} distinct names parsed`);
  console.log(`  admitted                   ${admitted.size}`);
  console.log(`    from a reviewed shelf    ${fromShelf}`);
  console.log(`    from the sitemap tier    ${admitted.size - fromShelf}`);
  console.log(`  rejected — join to nothing ${rejectedTail}`);
  console.log(`\n  reached an ontology node   ${matched} (${Math.round((matched / admitted.size) * 100)}%)`);
  for (const k of ["exact", "plural", "suffix", "suffix-rev"] as MatchKind[]) {
    console.log(`    ${k.padEnd(11)}${vrows.slice(1).filter((r) => r[7] === k).length}`);
  }
  console.log(`\n${perNode.size} nodes the catalogue has an opinion about`);
  console.log(`  agrees with our name       ${agree}`);
  console.log(`  differs                    ${differ}`);
  console.log(`\nwrote vocabulary.csv and naming.csv`);
}

main().catch((e) => { console.error(e); process.exit(1); });
