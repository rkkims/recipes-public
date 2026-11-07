/**
 * Step 2b — the sitemap tier, for autosuggest coverage.
 *
 *   npm run weee-sitemap
 *
 * WEEE-SPEC §2 permits the product sitemaps for a membership test and forbids
 * them as a name source, because 250,000 titles are mostly prepared food and
 * would flood a 3,085-node ontology.
 *
 * This is the narrow extension of that rule, and the constraint that makes it
 * safe lives in name.ts, not here: a sitemap title enters the vocabulary ONLY
 * if its parsed name reaches an ingredient we already have — an ontology node
 * or a head the corpus produced. The prepared-food tail is excluded by
 * construction, because it joins to nothing.
 *
 * What this buys, measured: shelf pages alone offer a suggestion for 71% of
 * corpus ingredient lines. The 60-per-shelf cap is why `mirin`, `kosher salt`
 * and `shaoxing wine` are missing — they sit on shelves we crawled and
 * truncated, not on shelves we skipped. No amount of shelf selection fixes
 * that; only more titles do.
 *
 * Titles are cached to data/weee/sitemap-titles.csv so re-parsing never
 * re-downloads 90 MB.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { politeFetch } from "../ingest/http.js";
import { isAllowed, loadRobots } from "../ingest/robots.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, "data/weee");
const FILE = resolve(OUT, "sitemap-titles.csv");

const ORIGIN = "https://www.weee.com";
const INDEX = `${ORIGIN}/sitemap-en.xml`;

const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((c) => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n") + "\n";

const locs = (xml: string) =>
  [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]!.replace(/&amp;/g, "&"));

const untitle = (slug: string) =>
  decodeURIComponent(slug).replace(/-+/g, " ").replace(/\s+/g, " ").trim();

async function main() {
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

  const robots = await loadRobots(ORIGIN);
  if (!robots.fetched) throw new Error("robots.txt unreadable — refusing to crawl blind");

  const idx = await politeFetch(INDEX, { delayMs: 1000 });
  if (!idx.ok) throw new Error(`sitemap index ${idx.status}`);

  // Product sitemaps only. The geo/brand/ethnic/category files list pages, not
  // products, and cost a request each for nothing.
  const subs = locs(idx.body).filter((u) => /-(?:new-)?product(?:-\d+)?\.xml$/.test(u));
  console.log(`${subs.length} product sitemaps`);

  const found = new Map<string, string>();
  for (const [i, u] of subs.entries()) {
    if (!isAllowed(new URL(u).pathname, robots)) {
      console.log(`  skip ${u} — robots.txt disallows it`);
      continue;
    }
    const res = await politeFetch(u, { delayMs: 1200, timeoutMs: 90_000 });
    if (!res.ok) { console.log(`  [${i + 1}/${subs.length}] FAILED ${res.status} ${u}`); continue; }
    let n = 0;
    for (const l of locs(res.body)) {
      const m = /\/product\/(.+)\/(\d+)$/.exec(l);
      if (!m) continue;
      const t = untitle(m[1]!);
      if (t && !found.has(m[2]!)) { found.set(m[2]!, t); n++; }
    }
    console.log(`  [${i + 1}/${subs.length}] ${u.split("/").pop()} — ${n} new (${found.size} total)`);
  }

  writeFileSync(FILE, csv([["product_id", "title"], ...[...found].map(([id, t]) => [id, t])]));
  console.log(`\n${found.size} distinct product titles`);
  console.log(`wrote ${FILE} (${Math.round(readFileSync(FILE).length / 1024 / 1024)} MB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
