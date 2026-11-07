/**
 * Backfill `cuisine` on already-crawled rows.
 *
 *   npm run recuisine -- --dry
 *   npm run recuisine
 *
 * Needed because cuisine is decided at ingest time, so rows crawled before
 * inference existed — or before a source was reclassified `multiCuisine` — carry
 * a stale label. The Woks of Life is the concrete case: ~1,100 recipes stored as
 * `chinese` when the blog is genuinely pan-Asian.
 *
 * Re-deriving is possible only because the row keeps everything the inference
 * needs (title, url, category, cuisineRaw, rawIngredients). That's the payoff for
 * storing raw signals rather than just conclusions.
 *
 * Rewrites files in place. Run `npm run cuisine-eval` afterwards — note that
 * eval only trusts `cuisineSource: "domain"` rows, so it will not grade the
 * classifier against its own output.
 */
import { readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inferCuisine } from "./cuisine.js";
import type { RawRecipe } from "./normalize.js";
import { SOURCES } from "./sources.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RAW_DIR = resolve(ROOT, "data/raw");
const DRY = process.argv.includes("--dry");

const byId = new Map(SOURCES.map((s) => [s.id, s]));

let scanned = 0, changed = 0, unresolved = 0;
const moves = new Map<string, number>();

for (const file of readdirSync(RAW_DIR).filter((f) => f.endsWith(".jsonl"))) {
  const path = resolve(RAW_DIR, file);
  const out: string[] = [];
  let fileChanged = 0;

  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let r: RawRecipe;
    try {
      r = JSON.parse(line) as RawRecipe;
    } catch {
      continue; // truncated final line from an interrupted run
    }
    scanned++;
    const source = byId.get(r.sourceId);

    if (!source) {
      out.push(JSON.stringify(r));
      continue;
    }

    const before = r.cuisine;
    if (!source.multiCuisine) {
      r.cuisine = source.cuisine;
      r.cuisineSource = "domain";
      r.cuisineConfidence = null;
    } else {
      const inf = inferCuisine({
        title: r.title,
        url: r.sourceUrl,
        category: r.category,
        cuisineRaw: r.cuisineRaw,
        rawIngredients: r.rawIngredients,
      });
      if (inf.cuisine) {
        r.cuisine = inf.cuisine;
        r.cuisineSource = "inferred";
      } else {
        r.cuisine = null;
        r.cuisineSource = "unresolved";
        unresolved++;
      }
      r.cuisineConfidence = inf.confidence;
    }

    if (before !== r.cuisine) {
      changed++;
      fileChanged++;
      const key = `${before ?? "null"} → ${r.cuisine ?? "unresolved"}`;
      moves.set(key, (moves.get(key) ?? 0) + 1);
    }
    out.push(JSON.stringify(r));
  }

  if (!DRY) {
    // Write to a temp file and rename, so an interrupted run can't truncate the
    // corpus — these files are the only copy of a multi-hour crawl.
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, out.join("\n") + "\n");
    renameSync(tmp, path);
  }
  console.log(`  ${file.padEnd(28)} ${out.length} rows, ${fileChanged} relabelled`);
}

console.log(`
scanned      ${scanned}
relabelled   ${changed}
unresolved   ${unresolved} (kept — raw strings still feed the node list)
${DRY ? "\nDRY RUN — nothing written. Re-run without --dry to apply." : ""}`);

if (moves.size) {
  console.log("\nlabel moves:");
  for (const [k, n] of [...moves].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(5)}  ${k}`);
  }
}
