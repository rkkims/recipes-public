/**
 * Step 3 — turn SKU titles into candidate ingredient names.
 *
 *   npm run weee-parse
 *
 * WEEE-SPEC §3. A SKU title is `brand + ingredient + pack size`, and the
 * pipeline is the one the corpus already uses — INGREDIENT-SPEC §5, "the engine
 * is the gate". A catalogue title gets no special path:
 *
 *     "Laoganma Fried Chili in Oil 275 g"
 *       → strip brand        (here)
 *       → strip measurement  (frequency.ts headName, unchanged)
 *       → head + modifiers   (ontology/normalize.ts, unchanged)
 *
 * If a SKU title forces a change to normalize.ts, stop — §3 says the engine
 * should not move, and a catalogue that breaks it has found a real gap in the
 * class model.
 *
 * Brand stripping is the only new judgment, and it is deliberately split in
 * two. What the brand sitemap names is stripped; what merely looks like a brand
 * is PROPOSED, never applied — see `brandCandidates` below for why.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { headName } from "../ingest/frequency.js";
import { normalize } from "../ontology/normalize.js";
import { CLASSES, NOT_INGREDIENT, UNIVERSAL } from "../ontology/classes.js";

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

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Pack size, which the ontology may never read.
 *
 * INGREDIENT-SPEC §2: `portion` is recorded and never matched on. Here it is
 * not even recorded — a SKU's pack size is a fact about a box, and the whole
 * point of §7's forbidden list is that it must not ride into the vocabulary on
 * the back of a name.
 */
const PACK =
  /\b\d+(?:\.\d+)?\s?(?:g|kg|mg|oz|lb|lbs|ml|l|ct|pc|pcs|pack|packs|bag|bags|can|cans|box|boxes|count|fl\s?oz|gal|qt|inch|cm)\b/g;

/**
 * Words that cannot be part of a brand, because the ontology already uses them.
 *
 * This is what stops the frequency pass from eating real modifiers. `dried`
 * leads a great many catalogue titles and recurs across shelves — every signal
 * a naive brand detector looks for — but it is a `preservation` word, and
 * stripping it would merge `dried shiitake` into `shiitake`, which
 * NORMALIZATION.md names as the canonical example of a modifier that must be
 * kept.
 */
function stoplist(): Set<string> {
  const s = new Set<string>();
  for (const c of CLASSES) for (const w of c.words) for (const t of norm(w).split(" ")) if (t) s.add(t);
  for (const w of [...UNIVERSAL, ...NOT_INGREDIENT]) for (const t of norm(w).split(" ")) if (t) s.add(t);
  if (existsSync(NODES)) {
    for (const r of asObjects(readFileSync(NODES, "utf8"))) {
      for (const t of norm(r["node"] ?? "").split(" ")) if (t) s.add(t);
    }
  }
  return s;
}

/**
 * Longest known brand that prefixes the title, or null.
 *
 * Bucketed by first word. A linear scan of 2,284 brands per title is fine for
 * the 2,700 shelf products and is 550 million string comparisons across the
 * 242,000 sitemap titles — the difference between a step that runs and one
 * that gets abandoned.
 */
function brandIndex(brands: string[]) {
  const byFirst = new Map<string, string[]>();
  for (const b of brands) {
    const f = b.split(" ")[0]!;
    (byFirst.get(f) ?? byFirst.set(f, []).get(f)!).push(b);
  }
  // Longest first within a bucket, so `lee kum kee` wins over `lee`.
  for (const list of byFirst.values()) list.sort((a, b) => b.length - a.length);
  return (title: string): string | null => {
    const t = norm(title);
    const first = t.split(" ")[0];
    if (!first) return null;
    for (const b of byFirst.get(first) ?? []) if (t === b || t.startsWith(b + " ")) return b;
    return null;
  };
}

/**
 * Leading n-grams that look like brands but are not in the sitemap.
 *
 * PROPOSED, NEVER APPLIED. The sitemap catches 68% of titles (§3.1) and the
 * survivors — `chuan zhi wei`, `czw`, `nature joy`, `donglong`, `gong he` — are
 * real brands we would like to strip. But the same signal fires on an
 * ingredient the ontology has not learned yet: `calamansi juice` leads with a
 * word absent from every node, recurs across products, and looks exactly like
 * `donglong dried shiitake` to any counting rule.
 *
 * Stripping it would delete the very ingredient this import exists to name, and
 * silently — the row would simply say `juice`. So the rule is the repo's usual
 * one: propose it, let review decide, and leave the title intact meanwhile.
 */
function brandCandidates(
  titles: { shelf: string; title: string }[],
  stop: Set<string>,
): (string | number)[][] {
  const seen = new Map<string, { n: number; shelves: Set<string>; eg: string[] }>();
  for (const { shelf, title } of titles) {
    const tokens = norm(title).split(" ").filter(Boolean);
    for (let n = 1; n <= 3 && n < tokens.length; n++) {
      const gram = tokens.slice(0, n).join(" ");
      // Every token must be unknown to the ontology. One known word is enough
      // to make this a description rather than a name.
      if (tokens.slice(0, n).some((t) => stop.has(t) || /^\d+$/.test(t))) break;
      const e = seen.get(gram) ?? { n: 0, shelves: new Set<string>(), eg: [] };
      e.n++; e.shelves.add(shelf);
      if (e.eg.length < 3) e.eg.push(title);
      seen.set(gram, e);
    }
  }
  const rows: (string | number)[][] = [["candidate", "products", "shelves", "examples"]];
  for (const [gram, e] of [...seen].sort((a, b) => b[1].n - a[1].n)) {
    if (e.n < 2) continue;
    rows.push([gram, e.n, e.shelves.size, e.eg.join(" | ")]);
  }
  return rows;
}

async function main() {
  const productsFile = resolve(OUT, "products.csv");
  if (!existsSync(productsFile)) throw new Error(`run 'npm run weee-pull' first — no ${productsFile}`);

  /**
   * Two sources, one pipeline.
   *
   * Shelf products carry a shelf label and are admitted unconditionally — they
   * came from an aisle a reviewer chose. Sitemap titles carry no shelf and are
   * admitted only if they join to something we already have; that gate lives in
   * name.ts, and the `source` column is what lets it tell them apart.
   */
  const products = asObjects(readFileSync(productsFile, "utf8")).map((p) => ({
    source: "shelf", shelf: p["shelf"] ?? "", shelf_name: p["shelf_name"] ?? "",
    product_id: p["product_id"] ?? "", title: p["title"] ?? "",
  }));
  const sitemapFile = resolve(OUT, "sitemap-titles.csv");
  const seen = new Set(products.map((p) => p.product_id));
  const sitemap = existsSync(sitemapFile)
    ? asObjects(readFileSync(sitemapFile, "utf8"))
        .filter((p) => !seen.has(p["product_id"] ?? ""))
        .map((p) => ({
          source: "sitemap", shelf: "", shelf_name: "",
          product_id: p["product_id"] ?? "", title: p["title"] ?? "",
        }))
    : [];
  const all = [...products, ...sitemap];

  const brands = asObjects(readFileSync(resolve(OUT, "brands.csv"), "utf8"))
    .map((b) => b["brand"]!)
    .filter(Boolean);
  const knownBrand = brandIndex(brands);
  const stop = stoplist();

  const vocab = { has: () => true };
  const rows: (string | number)[][] = [
    ["source", "shelf", "shelf_name", "product_id", "title", "brand", "core", "canonical", "drop"],
  ];
  let stripped = 0, dropped = 0;
  const canon = new Set<string>();

  for (const p of all) {
    const title = p.title;
    const brand = knownBrand(title);
    if (brand) stripped++;

    let core = brand ? norm(title).slice(brand.length).trim() : norm(title);
    // Split letter-glued sizes before stripping. `Baby Corn15oz` has no word
    // boundary before the digits, so both the pack pattern and the bare-number
    // pattern miss it and `corn15oz` enters the vocabulary as its own name.
    core = core.replace(/([a-z])(\d)/g, "$1 $2");
    core = core.replace(PACK, " ").replace(/\b\d+(?:\.\d+)?\b/g, " ").replace(/\s+/g, " ").trim();

    let canonical = "", drop = "";
    if (core) {
      let head = core;
      try { head = headName(core); } catch { /* keep the core */ }
      try {
        const r = normalize(head, vocab);
        // An empty canonical with no drop reason is still nothing. Counting it
        // as a name gave one 77-product "" row at the head of the vocabulary.
        if (r.drop) drop = r.drop;
        else if (!r.canonical) drop = "empty-canonical";
        else canonical = r.canonical;
      } catch { drop = "parse-failure"; }
    } else drop = "empty-core";   // distinct from normalize()'s own "empty"

    if (drop) dropped++; else canon.add(canonical);
    rows.push([
      p.source, p.shelf, p.shelf_name, p.product_id, title,
      brand ?? "", core, canonical, drop,
    ]);
  }

  writeFileSync(resolve(OUT, "parsed.csv"), csv(rows));

  // Shelf rows only. This is a review queue, and one generated over 242,000
  // sitemap titles would be a list nobody can read.
  const unbranded = products
    .filter((p) => !knownBrand(p.title))
    .map((p) => ({ shelf: p.shelf, title: p.title }));
  const cands = brandCandidates(unbranded, stop);
  writeFileSync(resolve(OUT, "brand-candidates.csv"), csv(cands));

  const n = all.length;
  console.log(`${n} products (${products.length} shelf, ${sitemap.length} sitemap)`);
  console.log(`  brand stripped from sitemap list  ${stripped} (${Math.round((stripped / n) * 100)}%)`);
  console.log(`  dropped by the engine             ${dropped}`);
  console.log(`  distinct canonical names          ${canon.size}  (collapse ${Math.round((1 - canon.size / (n - dropped)) * 100)}%)`);
  console.log(`  brand candidates PROPOSED         ${cands.length - 1}  (not applied — review them)`);
  console.log(`\nwrote ${resolve(OUT, "parsed.csv")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
