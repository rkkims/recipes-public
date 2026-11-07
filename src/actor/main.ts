/**
 * Apify Actor: crawl the 403-blocked recipe sources through Apify Proxy.
 *
 * Why this exists. maangchi.com and justonecookbook.com return 403 (Cloudflare)
 * to datacenter IPs, so they need residential routing. Apify Proxy on this
 * account reports:
 *
 *   "Your access to Apify Proxy is limited: Access from external HTTP clients
 *    (outside of Actors) isn't enabled."
 *
 * So the proxy is usable only from inside an Actor, which is what this is. The
 * Actor requests a proxy URL from the platform and reuses the *same* sitemap,
 * JSON-LD and normalization modules as the local crawler — the extractor must
 * never fork, or the two paths will silently disagree about what a recipe is.
 *
 * Results land in the Actor's default dataset. Pull them locally with:
 *   npm run pull -- --run-id <id>
 */
import { Actor, log } from "apify";
import { politeFetch } from "../ingest/http.js";
import { collectPostUrls } from "../ingest/sitemap.js";
import { findRecipeNode } from "../ingest/jsonld.js";
import { isUsable, toRawRecipe } from "../ingest/normalize.js";
import { SOURCES, type Source } from "../ingest/sources.js";

type Input = {
  /** Source ids from src/ingest/sources.ts. Defaults to the blocked two. */
  sourceIds?: string[];
  /** Cap pages per source. Omit for the full back catalogue. */
  limit?: number;
  /** Milliseconds between requests to the same host. */
  delayMs?: number;
};

await Actor.init();

const input = (await Actor.getInput<Input>()) ?? {};
const sourceIds = input.sourceIds ?? ["maangchi", "justonecookbook"];
const delayMs = input.delayMs ?? 1500;

/**
 * RESIDENTIAL is the point of the exercise — datacenter IPs are what already get
 * 403'd. But it is not available on the FREE plan (which grants only
 * BUYPROXIES94952, a datacenter group), so requesting it unconditionally makes
 * the Actor fail before it fetches anything.
 *
 * Degrade instead, and log which tier we actually got. If the run ends up on
 * datacenter IPs and still hits 403s, that is the answer to "will a proxy fix
 * this" — no, only a residential plan will.
 */
async function proxy(): Promise<{ config: NonNullable<Awaited<ReturnType<typeof Actor.createProxyConfiguration>>>; tier: string }> {
  for (const attempt of [
    { tier: "RESIDENTIAL", opts: { groups: ["RESIDENTIAL"], countryCode: "US" } },
    { tier: "datacenter (BUYPROXIES94952)", opts: { groups: ["BUYPROXIES94952"] } },
    { tier: "auto", opts: {} },
  ]) {
    try {
      const config = await Actor.createProxyConfiguration(attempt.opts);
      if (config) {
        log.info(`proxy tier: ${attempt.tier}`);
        return { config, tier: attempt.tier };
      }
    } catch (err) {
      log.warning(`proxy tier unavailable: ${attempt.tier}`, { err: String(err).slice(0, 160) });
    }
  }
  throw new Error("no usable proxy configuration on this account");
}

const { config: proxyConfiguration, tier: proxyTier } = await proxy();

const selected: Source[] = SOURCES.filter((s) => sourceIds.includes(s.id));
if (!selected.length) {
  throw new Error(`no sources matched ${JSON.stringify(sourceIds)}`);
}

let stored = 0;
let noJsonLd = 0;
let tooFew = 0;
let failed = 0;

for (const source of selected) {
  const proxyUrl = await proxyConfiguration.newUrl(`sess_${source.id}`);
  log.info(`${source.name}: starting`, { cuisine: source.cuisine });

  let urls: string[];
  try {
    urls = await collectPostUrls(source.sitemapIndex, { proxyUrl });
  } catch (err) {
    log.error(`${source.name}: sitemap failed — this is fatal for the source`, {
      err: String(err),
      hint: "if this is a 403, the proxy tier is not clearing Cloudflare",
    });
    failed++;
    continue;
  }

  // Sitemap order skews non-recipe at the head, so a limited run samples evenly.
  let queue = urls;
  if (input.limit && queue.length > input.limit) {
    const step = Math.floor(queue.length / input.limit);
    queue = queue.filter((_, i) => i % step === 0).slice(0, input.limit);
  }
  log.info(`${source.name}: ${urls.length} posts, fetching ${queue.length}`);

  for (const url of queue) {
    const res = await politeFetch(url, { proxyUrl, delayMs });
    if (!res.ok) {
      failed++;
      if (failed <= 3 || failed % 10 === 0) {
        log.warning(`fetch failed (${failed} total)`, {
          status: res.status,
          proxyRejected: res.proxyRejected ?? false,
          url,
        });
      }
      continue;
    }
    const node = findRecipeNode(res.body);
    if (!node) { noJsonLd++; continue; }
    const recipe = toRawRecipe(node, source, url);
    if (!recipe) { noJsonLd++; continue; }
    if (!isUsable(recipe)) { tooFew++; continue; }

    await Actor.pushData(recipe);
    stored++;
    if (stored % 25 === 0) log.info(`${stored} recipes stored`);
  }
}

log.info("done", { stored, noJsonLd, tooFew, failed, proxyTier });
await Actor.setValue("SUMMARY", { stored, noJsonLd, tooFew, failed, sourceIds, proxyTier });
await Actor.exit();
