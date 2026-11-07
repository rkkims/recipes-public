/**
 * Step 2 — fetch the shelves marked `ingredient=yes`, and the brand lexicon.
 *
 *   npm run weee-pull
 *
 * WEEE-SPEC §2. One request per shelf, ~76 shelves. A category page is
 * server-rendered and carries about 60 products; "Load more" calls the `/api/`
 * endpoint, which robots.txt disallows, so 60 is where we stop. §2 argues that
 * cap is not even a cost: a shelf's first page is its top-ranked products, and
 * for a naming vocabulary the head is the right sample, not the tail.
 *
 * Do not route around it. §8.2.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { politeFetch } from "../ingest/http.js";
import { isAllowed, loadRobots } from "../ingest/robots.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, "data/weee");
const SHELVES = resolve(OUT, "shelves.csv");

const ORIGIN = "https://www.weee.com";
const BRAND_SITEMAP = `${ORIGIN}/sitemap-en-brand.xml`;

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

/** `Laoganma-Fried-Chili-in-Oil` → `Laoganma Fried Chili in Oil`. */
const untitle = (slug: string) =>
  decodeURIComponent(slug).replace(/-+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Products linked from a shelf page.
 *
 * Host-qualified matches only. The same `/product/<slug>/<id>` shape appears in
 * image URLs on the CDN — on one shelf, 35 of 96 matches were images — and
 * those slugs are truncated variants that would enter the vocabulary as
 * separate products. Requiring the weee.com host is what separates them.
 */
function productsOn(html: string): Map<string, string> {
  const found = new Map<string, string>();
  const rx = /(?:https?:)?\/\/(?:www\.)?weee\.com\/[a-z-]+\/product\/([^"'\\\s]+?)\/(\d+)\b/g;
  for (const m of html.matchAll(rx)) {
    const title = untitle(m[1]!);
    if (title) found.set(m[2]!, title);
  }
  return found;
}

/**
 * There is no shelf total on the page, and we do not guess one.
 *
 * An earlier version reported one. It was reading digits out of SVG path data
 * — `C4.96037 7.46147 …` yields plausible three-digit numbers all day. So
 * coverage.csv records only what we captured, and how much of a shelf that
 * represents is honestly unknown (§10).
 */

async function brands(): Promise<string[]> {
  const res = await politeFetch(BRAND_SITEMAP, { delayMs: 1000 });
  if (!res.ok) throw new Error(`brand sitemap ${res.status}`);
  const out = new Set<string>();
  for (const m of res.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    const b = /\/brand\/(.+)\/[A-Za-z0-9]+$/.exec(m[1]!.replace(/&amp;/g, "&"));
    if (b) {
      const name = untitle(b[1]!).toLowerCase();
      if (name) out.add(name);
    }
  }
  return [...out].sort();
}

async function main() {
  if (!existsSync(SHELVES)) throw new Error(`run 'npm run weee-shelves' first — no ${SHELVES}`);
  const shelves = asObjects(readFileSync(SHELVES, "utf8")).filter((s) => s["ingredient"] === "yes");
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

  const robots = await loadRobots(ORIGIN);
  if (!robots.fetched) throw new Error("robots.txt unreadable — refusing to crawl blind");

  const brandList = await brands();
  writeFileSync(resolve(OUT, "brands.csv"), csv([["brand"], ...brandList.map((b) => [b])]));
  console.log(`${brandList.length} brands`);

  const rows: (string | number)[][] = [["shelf", "shelf_name", "product_id", "title"]];
  const coverage: (string | number)[][] = [["shelf", "shelf_name", "captured"]];
  let ok = 0, failed = 0, seen = new Set<string>();

  for (const [i, s] of shelves.entries()) {
    const url = s["url"]!;
    if (!isAllowed(new URL(url).pathname, robots)) {
      console.log(`  skip ${s["code"]} — robots.txt disallows ${new URL(url).pathname}`);
      continue;
    }
    const res = await politeFetch(url, { delayMs: 1500 });
    if (!res.ok) {
      failed++;
      console.log(`  ${s["code"]} FAILED ${res.status}`);
      continue;
    }
    const found = productsOn(res.body);
    for (const [id, title] of found) {
      rows.push([s["code"]!, s["name"]!, id, title]);
      seen.add(id);
    }
    coverage.push([s["code"]!, s["name"]!, found.size]);
    ok++;
    console.log(`  [${i + 1}/${shelves.length}] ${s["code"]} ${s["name"]} — ${found.size}`);
  }

  writeFileSync(resolve(OUT, "products.csv"), csv(rows));
  writeFileSync(resolve(OUT, "coverage.csv"), csv(coverage));
  console.log(
    `\n${ok} shelves fetched, ${failed} failed — ${rows.length - 1} rows, ${seen.size} distinct products`,
  );
  console.log(`wrote ${resolve(OUT, "products.csv")}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
