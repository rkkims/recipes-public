/**
 * Time fields from the enrichment pass (src/ingest/enrich.ts).
 *
 * Optional by design: the pass runs over ~4,900 pages and some sources are
 * WAF-blocked, so a recipe with no entry here is normal and the curation screen
 * shows an empty field rather than a wrong one.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

function findEnriched(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const c = resolve(dir, "data", "enriched");
    if (existsSync(c)) return c;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

export type Times = {
  prepMinutes?: number; cookMinutes?: number; totalMinutes?: number;
  leadMinutes?: number; leadReason?: string;
};

let cache: Map<string, Times> | null = null;

export function times(): Map<string, Times> {
  if (cache) return cache;
  cache = new Map();
  const dir = findEnriched();
  if (!dir) return cache;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsonl"))) {
    for (const l of readFileSync(resolve(dir, f), "utf8").split("\n")) {
      if (!l.trim()) continue;
      try {
        const d = JSON.parse(l) as Times & { sourceUrl: string; error?: string };
        if (!d.error) cache.set(d.sourceUrl, d);
      } catch { /* skip */ }
    }
  }
  return cache;
}
