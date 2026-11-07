/**
 * Pull Actor results into data/raw/, so Actor-crawled and locally-crawled
 * recipes land in the same place and feed the same frequency report.
 *
 *   npm run pull -- --run-id <runId>
 *   npm run pull -- --dataset-id <datasetId>
 *
 * Needs APIFY_TOKEN in .env.local. Note that this is the *API token*, a
 * different secret from APIFY_PROXY_PASSWORD.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RawRecipe } from "./normalize.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RAW_DIR = resolve(ROOT, "data/raw");

for (const line of (() => {
  try {
    return readFileSync(resolve(ROOT, ".env.local"), "utf8").split(/\r?\n/);
  } catch {
    return [];
  }
})()) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i > 0) {
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (v && !process.env[k]) process.env[k] = v;
  }
}

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i === -1 ? undefined : process.argv[i + 1];
};

const token = process.env.APIFY_TOKEN;
if (!token) {
  console.error(
    "APIFY_TOKEN missing from .env.local.\n" +
      "This is the API token (Console → Settings → API & Integrations),\n" +
      "not the proxy password already stored there.",
  );
  process.exit(1);
}

const runId = arg("run-id");
let datasetId = arg("dataset-id");

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.apify.com/v2${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}: ${await res.text()}`);
  return (await res.json()) as T;
}

if (!datasetId) {
  if (!runId) {
    console.error("pass --run-id or --dataset-id");
    process.exit(1);
  }
  const run = await api<{ data: { defaultDatasetId: string; status: string } }>(
    `/actor-runs/${runId}`,
  );
  console.log(`run status: ${run.data.status}`);
  datasetId = run.data.defaultDatasetId;
}

const items = await api<RawRecipe[]>(`/datasets/${datasetId}/items?clean=true&format=json`);
console.log(`dataset ${datasetId}: ${items.length} items`);

mkdirSync(RAW_DIR, { recursive: true });

/** Dedupe against what's already stored — pulls are safe to repeat. */
const bySource = new Map<string, RawRecipe[]>();
for (const r of items) {
  if (!r?.sourceId || !r?.sourceUrl) continue;
  (bySource.get(r.sourceId) ?? bySource.set(r.sourceId, []).get(r.sourceId)!).push(r);
}

for (const [sourceId, rows] of bySource) {
  const file = resolve(RAW_DIR, `${sourceId}.jsonl`);
  const seen = new Set<string>();
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        seen.add((JSON.parse(line) as RawRecipe).sourceUrl);
      } catch {
        /* truncated line */
      }
    }
  }
  let added = 0;
  for (const r of rows) {
    if (seen.has(r.sourceUrl)) continue;
    appendFileSync(file, JSON.stringify(r) + "\n");
    seen.add(r.sourceUrl);
    added++;
  }
  console.log(`  ${sourceId}: +${added} new (${rows.length - added} already stored)`);
}

console.log("\nnext: npm run frequency");
