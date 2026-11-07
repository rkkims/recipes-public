/**
 * Corpus crawler: sitemap → JSON-LD → raw ingredient strings.
 *
 * Writes one JSONL file per source under data/raw/. Resumable: URLs already
 * present in the output are skipped, so an interrupted run costs nothing.
 *
 *   npm run crawl                        # all enabled sources
 *   npm run crawl -- --limit 40          # sample, for verification
 *   npm run crawl -- --source maangchi   # force a disabled source
 *   npm run crawl -- --direct            # ignore proxy config entirely
 *   npm run crawl -- --delay 3000        # slower cadence
 *
 * Running the Cloudflare-blocked sources from a home connection: a residential
 * IP is exactly what they want, so `--direct` from home is the whole fix. See
 * RUNBOOK.md.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { politeFetch, routing, hasResidentialRouting } from "./http.js";
import { isAllowed, loadRobots } from "./robots.js";
import { collectPostUrls } from "./sitemap.js";
import { discoverWayback, snapshotUrl, type WaybackPage } from "./wayback.js";
import { findRecipeNode, personNames } from "./jsonld.js";
import { fromExtracted, isUsable, toRawRecipe, MIN_INGREDIENTS, type RawRecipe } from "./normalize.js";
import { EXTRACTORS } from "./extractors.js";
import { enabledSources, type Source } from "./sources.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RAW_DIR = resolve(ROOT, "data/raw");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const flag = (name: string): boolean => process.argv.includes(`--${name}`);

/**
 * Force direct connections regardless of what's in .env.local.
 *
 * This exists to prevent a specific trap: the blocked sources are marked
 * `needsResidential`, so on a machine that happens to have a proxy credential
 * configured they get routed through it — even when the machine's own IP is
 * residential and would work fine. From home, direct is what you want.
 */
const DIRECT = flag("direct");

function alreadyDone(file: string): Set<string> {
  if (!existsSync(file)) return new Set();
  const seen = new Set<string>();
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      seen.add((JSON.parse(line) as RawRecipe).sourceUrl);
    } catch {
      /* truncated final line from an interrupted run */
    }
  }
  return seen;
}

type Stats = {
  considered: number;
  fetched: number;
  recipes: number;
  tooFewIngredients: number;
  noJsonLd: number;
  blocked: number;
  errors: number;
};

async function crawlSource(source: Source, limit?: number, delayMs?: number): Promise<Stats> {
  const st: Stats = {
    considered: 0, fetched: 0, recipes: 0,
    tooFewIngredients: 0, noJsonLd: 0, blocked: 0, errors: 0,
  };
  const out = resolve(RAW_DIR, `${source.id}.jsonl`);
  const done = alreadyDone(out);

  console.log(`\n── ${source.name} (${source.id})`);
  if (source.note) console.log(`   note: ${source.note}`);

  const residential = Boolean(source.needsResidential) && !DIRECT;
  // For wayback sources the origin's robots.txt is unreachable anyway, and the
  // fetch target is archive.org. Skip rather than fail open on a 403.
  const robots = source.wayback
    ? { disallow: [], allow: [], fetched: false }
    : await loadRobots(source.origin, residential);
  console.log(
    `   robots: ${robots.fetched ? `${robots.disallow.length} disallow rules for *` : "unavailable"}`,
  );

  // originalUrl → fetchUrl. They differ only for wayback sources, where we read
  // the archive but still store and link the original (DECISIONS §6).
  let fetchUrlFor = (u: string) => u;
  let urls: string[];
  try {
    if (source.wayback) {
      const pages: WaybackPage[] = await discoverWayback(source.wayback);
      const snap = new Map(pages.map((p) => [p.original, snapshotUrl(p)]));
      fetchUrlFor = (u) => snap.get(u) ?? u;
      urls = pages.map((p) => p.original);
      console.log(`   via Wayback Machine: ${urls.length} archived pages`);
    } else {
      urls = await collectPostUrls(source.sitemapIndex, { residential });
    }
  } catch (err) {
    console.log(`   ✗ ${String(err)}`);
    st.errors++;
    return st;
  }

  const allowed = urls.filter((u) => isAllowed(new URL(u).pathname, robots));
  if (allowed.length !== urls.length) {
    console.log(`   robots excluded ${urls.length - allowed.length} URLs`);
  }

  // Sitemap order is not random — the head skews to non-recipe pages
  // (roundups, /blog/). Sampling evenly makes a --limit run representative.
  let queue = allowed.filter((u) => !done.has(u));
  if (limit && queue.length > limit) {
    const step = Math.floor(queue.length / limit);
    queue = queue.filter((_, i) => i % step === 0).slice(0, limit);
  }

  console.log(
    `   ${urls.length} posts in sitemap, ${done.size} already stored, ${queue.length} to fetch`,
  );

  for (const url of queue) {
    st.considered++;
    const res = await politeFetch(fetchUrlFor(url), { residential, delayMs });
    if (!res.ok) {
      if (res.proxyRejected) {
        console.log("   ✗ residential proxy rejected our credential — cannot reach this source");
        st.errors++;
        break;
      }
      if (res.status === 403 || res.status === 401) st.blocked++;
      else st.errors++;
      if (st.blocked === 3) {
        console.log(`   ✗ repeated ${res.status} — stopping this source`);
        break;
      }
      continue;
    }
    st.fetched++;

    let recipe: RawRecipe | null;
    if (source.extractor) {
      const fn = EXTRACTORS[source.extractor];
      if (!fn) throw new Error(`unknown extractor "${source.extractor}" on ${source.id}`);
      const e = fn(res.body);
      if (!e) { st.noJsonLd++; continue; }
      recipe = fromExtracted(e, source, url);
    } else {
      const node = findRecipeNode(res.body, url);
      if (!node) { st.noJsonLd++; continue; }
      // The page's Person nodes, so an author reference resolves to a name
      // instead of storing the #/schema/person hash (CREATOR-SPEC §3).
      recipe = toRawRecipe(node, source, url, personNames(res.body));
    }
    if (!recipe) { st.noJsonLd++; continue; }
    if (!isUsable(recipe)) { st.tooFewIngredients++; continue; }

    appendFileSync(out, JSON.stringify(recipe) + "\n");
    st.recipes++;
    if (st.recipes % 25 === 0) console.log(`   … ${st.recipes} recipes`);
  }
  return st;
}

async function main() {
  mkdirSync(RAW_DIR, { recursive: true });
  const limit = arg("limit") ? Number(arg("limit")) : undefined;
  const only = arg("source")?.split(",");
  const delayMs = arg("delay") ? Number(arg("delay")) : undefined;

  console.log(
    DIRECT
      ? "routing: direct (--direct; proxy config ignored)"
      : `routing: ${routing}${hasResidentialRouting() ? "" : " (no credential — 403-blocked sources stay off)"}`,
  );
  if (delayMs) console.log(`delay: ${delayMs}ms per host`);
  if (limit) console.log(`limit: ${limit} per source (sampled evenly across the sitemap)`);

  const sources = enabledSources(only);
  if (!sources.length) { console.log("no sources selected"); return; }

  const totals: Stats[] = [];
  for (const s of sources) totals.push(await crawlSource(s, limit, delayMs));

  const sum = (k: keyof Stats) => totals.reduce((a, t) => a + t[k], 0);
  console.log(`
═══ totals
  pages fetched        ${sum("fetched")} / ${sum("considered")} considered
  recipes stored       ${sum("recipes")}
  no Recipe JSON-LD    ${sum("noJsonLd")}   (roundups, technique posts — expected)
  < ${MIN_INGREDIENTS} ingredients     ${sum("tooFewIngredients")}
  blocked (403/401)    ${sum("blocked")}
  errors               ${sum("errors")}

next: npm run frequency`);
}

main().catch((e) => { console.error(e); process.exit(1); });
