/**
 * Recover the verb behind every bare "overnight" — a one-off repair.
 *
 * ── Why this exists rather than a full re-enrich ─────────────────────────
 *
 * `leadTime` has always required a waiting verb within a clause of the word
 * "overnight", and then stored the reason as the literal string "overnight",
 * discarding the verb one line after matching it. So 343 recipes recorded that
 * they need eight hours and lost the only fact that says WHAT for — leaving a
 * marinating bulgogi and a setting custard identical in the data.
 *
 * The extractor is fixed. The stored rows are not, and they cannot be repaired
 * offline: `data/raw` keeps ingredients but never the method text, so the
 * sentence containing the verb only exists on the source page.
 *
 * ── It refetches 343 pages, not 4,874 ────────────────────────────────────
 *
 * Every other enriched row is unaffected by the fix — a reason like "marinate
 * for 2 hours" already carries its verb — so re-running the whole pass would be
 * 4,500 requests to other people's servers for no new information. This walks
 * only the rows whose reason is exactly "overnight".
 *
 * Same user agent and the same delay as the pass it repairs, sequentially, one
 * request at a time.
 *
 * ── It rewrites through a temp file ──────────────────────────────────────
 *
 * `data/enriched` is derived and re-creatable, but only by another 4,874-page
 * crawl, which makes it expensive enough to treat as precious. Each file is
 * written beside itself and renamed on success, so an interrupted run leaves
 * the original intact rather than half of it.
 *
 *   npx tsx src/ingest/relead.ts [--delay 1200] [--limit 0]
 */
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { leadTime, recipeNode, instructionText } from "./enrich.js";

const DIR = resolve(process.cwd(), "data", "enriched");
const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i === -1 ? undefined : process.argv[i + 1];
};
const DELAY = Number(arg("--delay") ?? 1200);
const LIMIT = Number(arg("--limit") ?? 0);

type Row = {
  sourceUrl: string; fetchedAt?: string; error?: string;
  prepMinutes?: number; cookMinutes?: number; totalMinutes?: number;
  leadMinutes?: number; leadReason?: string;
};

async function main(): Promise<void> {
  if (!existsSync(DIR)) { console.error("no data/enriched"); process.exit(1); }
  let seen = 0, fixed = 0, unchanged = 0, failed = 0;

  for (const file of readdirSync(DIR).filter((f) => f.endsWith(".jsonl"))) {
    const path = resolve(DIR, file);
    const rows: Row[] = readFileSync(path, "utf8").split("\n")
      .filter((l) => l.trim()).map((l) => JSON.parse(l) as Row);

    const targets = rows.filter((r) => r.leadReason === "overnight");
    if (!targets.length) continue;
    console.log(`${file}: ${targets.length} bare "overnight" rows`);

    for (const row of targets) {
      if (LIMIT && seen >= LIMIT) break;
      seen++;
      try {
        const res = await fetch(row.sourceUrl, {
          headers: { "user-agent": "Mozilla/5.0 (compatible; recipe-curation/1.0)" },
          signal: AbortSignal.timeout(25_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const node = recipeNode(await res.text());
        if (!node) throw new Error("no Recipe node");
        const lead = leadTime(instructionText(node));
        if (lead && lead.reason !== "overnight") {
          row.leadMinutes = lead.minutes;
          row.leadReason = lead.reason;
          fixed++;
          console.log(`  ✓ ${lead.reason}`);
        } else if (lead) {
          // Still bare: the page words it as "overnight" with the verb further
          // away than the pattern reaches. Left as it was rather than guessed.
          unchanged++;
        } else {
          // The page changed and no longer states a wait at all. Honest to drop
          // it: the badge should follow the recipe as it stands today.
          delete row.leadMinutes;
          delete row.leadReason;
          unchanged++;
        }
      } catch (e) {
        failed++;
        console.log(`  ✗ ${row.sourceUrl} — ${e instanceof Error ? e.message : String(e)}`);
      }
      await new Promise((r) => setTimeout(r, DELAY));
    }

    const tmp = `${path}.new`;
    writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
    renameSync(tmp, path);
    console.log(`${file}: rewritten`);
  }

  console.log(`\nvisited ${seen}; verb recovered on ${fixed}; ${unchanged} left as-is; ${failed} failed`);
}

void main();
