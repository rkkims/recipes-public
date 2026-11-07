/**
 * Step 1 — enumerate the shelves, and decide which hold cooking ingredients.
 *
 *   npm run weee-shelves
 *
 * WEEE-SPEC §2. The product sitemaps carry no category, so there is nothing to
 * filter 250,000 SKUs on after pulling them. The only place the food/non-food
 * distinction exists is the category tree — so we choose shelves first and
 * never fetch the rest. Non-food is excluded by never being crawled.
 *
 * This writes a REVIEWED FILE, not a classifier's output. Which shelves hold
 * ingredients is a judgment over 212 rows, made once; the seed below is a
 * starting point for that judgment and the CSV is the record of it. Re-running
 * preserves every `ingredient` value already in the file and only appends
 * shelves Weee! has added since — the same rule `propose.ts` follows, for the
 * same reason: regenerating must never clobber reviewed work.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { politeFetch } from "../ingest/http.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, "data/weee");
const FILE = resolve(OUT, "shelves.csv");

const CATEGORY_SITEMAP = "https://www.weee.com/sitemap-en-category.xml";

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

/**
 * The seed judgment, by top-level group.
 *
 * `yes` means "a cook buys things here to make a dish out of them". The
 * excluded groups are not close calls:
 *
 *   care/health/grocery   not food at all — cleanser, supplements, Anime
 *   alcohol/beverages     drunk, not cooked with. Cooking wine and mirin are
 *                         merchandised under seasoning, where we do look.
 *   snack/bakery/instant  prepared food. WEEE-SPEC §3 measured this tail: it
 *   freshbakery/frozen    is where `selfheating beef hot pot tomato flavor`
 *   freshgourmet/mooncake lives, and it is 93% singletons.
 *
 * `frozen` is the one genuine judgment call and it is excluded: its shelves are
 * dumplings, buns, ice cream and prepared entrees. Frozen vegetables and frozen
 * seafood — the parts a cook builds a dish from — are filed under `green04` and
 * `seafood`, which are included, so nothing is lost by dropping the group.
 */
const INGREDIENT_GROUPS = new Set([
  "green", "fruits", "meat", "seafood", "dairy",
  "dried", "seasoning", "tofuplantbased", "canned",
]);

/**
 * Leaf shelves only.
 *
 * A group's root page (`green/Vegetables`) is a landing page whose 60 products
 * are a promotional mix drawn from every child shelf. Including it would give
 * the same SKUs a second, less specific shelf label — and the shelf label is
 * the evidence in §5, so a wrong one is worse than a missing one.
 */
const isLeaf = (code: string) => /\d$/.test(code);

/**
 * `Other` shelves are the retailer's own admission that a shelf has no name.
 *
 * They are still INCLUDED. The two jobs want different things from a shelf:
 * §4 wants the product names on it, which are ordinary ingredients, and §5
 * wants the shelf label as class evidence, which `Other Vegetables` cannot
 * supply. Excluding them would throw away good vocabulary to avoid bad
 * evidence — so they are marked instead, and §5 skips what it cannot use.
 */
const isUnnamed = (name: string) => /^(other|others)\b/i.test(name.replace(/-/g, " "));

/**
 * Named shelves inside an ingredient group that are not ingredient shelves.
 *
 * Both are judgments the group rule cannot make, which is what this file is
 * for. Recorded here rather than hand-edited into the CSV so that a shelf
 * Weee! renames does not silently return.
 */
const EXCLUDE_SHELF = new Map([
  ["tofuplantbased08", "prepared entrees, not an ingredient"],
  // A cross-cut, not a leaf: its products also sit on green01..15 under their
  // real shelf. Including it would give the same SKU a second shelf label and
  // put `organic` — a `grade` word NORMALIZATION.md strips — into the names.
  ["green16", "cross-cut of the other green shelves; duplicates their SKUs"],
]);

async function main() {
  const res = await politeFetch(CATEGORY_SITEMAP, { delayMs: 1000 });
  if (!res.ok) throw new Error(`category sitemap ${res.status}`);

  const locs = [...res.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]!);
  const found = new Map<string, { code: string; name: string; url: string }>();
  for (const raw of locs) {
    const url = raw.replace(/&amp;/g, "&");
    const m = /\/category\/([^/]+)\/(.+)$/.exec(url);
    if (!m) continue;
    const code = m[1]!;
    const name = decodeURIComponent(m[2]!).replace(/-/g, " ");
    // The sitemap lists the same shelf once per locale prefix in some runs.
    if (!found.has(code)) found.set(code, { code, name, url });
  }

  const prior = existsSync(FILE)
    ? new Map(asObjects(readFileSync(FILE, "utf8")).map((r) => [r["code"]!, r]))
    : new Map<string, Record<string, string>>();

  const rows = [...found.values()].sort((a, b) => a.code.localeCompare(b.code));
  let kept = 0, added = 0;
  const out: (string | number)[][] = [["code", "name", "group", "ingredient", "url", "note"]];

  for (const s of rows) {
    const group = /^([a-z-]+)/.exec(s.code)?.[1] ?? s.code;
    const excluded = EXCLUDE_SHELF.get(s.code);
    const seed =
      !INGREDIENT_GROUPS.has(group) ? "no"
      : !isLeaf(s.code) ? "no"
      : excluded ? "no"
      : "yes";
    const seedNote =
      !INGREDIENT_GROUPS.has(group) ? `group '${group}' is not ingredients`
      : !isLeaf(s.code) ? "group landing page, not a leaf shelf"
      : excluded ? excluded
      : isUnnamed(s.name) ? "names only — shelf label is no class evidence (§5)"
      : "";

    const was = prior.get(s.code);
    if (was) kept++; else added++;
    out.push([
      s.code, s.name, group,
      // A reviewed answer always wins. This file is the judgment, not the seed.
      was?.["ingredient"] ?? seed,
      s.url,
      was?.["note"] ?? seedNote,
    ]);
  }

  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  writeFileSync(FILE, csv(out));

  const yes = out.slice(1).filter((r) => r[3] === "yes").length;
  console.log(`${rows.length} shelves — ${kept} already reviewed, ${added} new`);
  console.log(`  ${yes} marked ingredient=yes  →  ~${yes * 60} SKUs at 60/shelf`);
  console.log(`\nwrote ${FILE}`);
  console.log(`Edit the 'ingredient' column to correct it; re-running keeps your answers.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
