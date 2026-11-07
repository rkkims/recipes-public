/**
 * Which recipe photographs are still there? — writes `data/ontology/dead-images.json`.
 *
 *   npm run check-images
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * The app has one rule about a recipe with no photograph: `picturedFirst` ranks
 * it last, because a blank tile in a grid of photographs does not read as "this
 * one has no photo", it reads as broken — and at the head of a shelf it is the
 * first thing a visitor sees.
 *
 * That rule was being defeated by the corpus rather than by the code. Only 13
 * recipes have no `imageUrl` at all; the ones that actually rendered blank had
 * a URL that had since 404'd. The index called them pictured, the ranking put
 * them first, and the user saw an empty box at the top of "Cook tonight".
 *
 * ── Why the answer is checked in rather than computed ──────────────────────
 *
 * Laying out a grid must not cost 4,874 network requests, and a page render is
 * the worst possible place to discover that a third-party host is down. So this
 * runs by hand, occasionally, and `recipe-index` reads its result.
 *
 * ── The one thing to be careful about ──────────────────────────────────────
 *
 * A crawler being refused is not a dead image. Two probes, and only what fails
 * BOTH is recorded:
 *
 *   1. HEAD (then a ranged GET for hosts that refuse HEAD) with a plain agent.
 *   2. Everything that failed, again, with a browser user-agent and image
 *      `Accept`/`Sec-Fetch` headers.
 *
 * The first pass called 400 images dead. The second recovered 26 of them, and
 * of what remained 362 were futuredish serving a SiteGround CAPTCHA page — an
 * HTML body under a 200, to every datacentre IP, for every image on the host.
 * Those load fine in a real browser. Blanking them would have demoted a twelfth
 * of the corpus because our crawler was challenged, which is why `sgcaptcha`
 * bodies and whole-host failures are excluded below rather than trusted.
 *
 * What survives is: an outright 404, or a 403 that persists behind a browser
 * agent while sibling images on the same host return 200.
 *
 * ── Corrected 2026-08-20 — read `RECIPE-SPEC` §1a's field note ─────────────
 *
 * The paragraph above describes futuredish as a CAPTCHA page under a 200,
 * served to every datacentre IP, loading fine in a real browser. Re-measured,
 * none of that holds: it is a hard 403, it turns on the USER-AGENT and not the
 * address, and the same IP is served happily under a Safari agent. Chrome is
 * refused, curl is not.
 *
 * Which lands on this file directly: `BROWSER` below is a Windows Chrome
 * string, so the second pass now probes as the one class that host refuses.
 * The whole-host exclusion still stops that becoming a mass blanking — the
 * safeguard was built for a different reason and holds anyway — but nobody
 * should read the second pass as evidence that a real visitor is fine.
 * Whether a Chrome browser on a domestic connection is also refused is
 * untested and cannot be tested from this box.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const INDEX = resolve(ROOT, "data/ontology/recipe-index.json");
const OUT = resolve(ROOT, "data/ontology/dead-images.json");

const PLAIN = "Mozilla/5.0 (compatible; jipbap-imagecheck/1.0)";
const BROWSER = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
                "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
/** Enough of the body to tell an image from an interstitial. */
const SNIFF = "bytes=0-2047";
const CONCURRENCY = 16;
const TIMEOUT_MS = 20_000;

/** null = it is an image. Anything else is why we think it is not. */
type Verdict = string | null;

async function probe(url: string, browserLike: boolean): Promise<Verdict> {
  for (const method of ["HEAD", "GET"] as const) {
    const c = new AbortController();
    const timer = setTimeout(() => c.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method, redirect: "follow", signal: c.signal,
        headers: {
          "user-agent": browserLike ? BROWSER : PLAIN,
          ...(browserLike ? {
            accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.9",
            "sec-fetch-dest": "image", "sec-fetch-mode": "no-cors",
            "sec-fetch-site": "cross-site",
          } : {}),
          ...(method === "GET" ? { range: SNIFF } : {}),
        },
      });
      const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
      if (!res.ok) {
        /* 405 means "not HEAD", not "not there". Ask again properly. */
        if (method === "HEAD" && res.status === 405) continue;
        return `http ${res.status}`;
      }
      /* Some hosts answer HEAD with no type at all — that is not evidence. */
      if (!type) { if (method === "HEAD") continue; return "content-type none"; }
      return /^image\//i.test(type) ? null : `content-type ${type}`;
    } catch (e) {
      const why = e instanceof Error ? (e.cause as { code?: string })?.code ?? e.name : "unknown";
      if (method === "GET") return `fetch ${why}`;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/** Run `work` over `items`, a few at a time. */
async function pool<T>(items: T[], work: (item: T) => Promise<void>) {
  const queue = items.slice();
  let done = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (let item = queue.pop(); item !== undefined; item = queue.pop()) {
      await work(item);
      if (++done % 250 === 0) console.error(`  ${done}/${items.length}`);
    }
  }));
}

const recipes: Array<{ image?: string; source?: string }> =
  JSON.parse(readFileSync(INDEX, "utf8")).recipes;
/**
 * Locally mirrored images are not probed, because they cannot be dead.
 *
 * `recipe-index` rewrites a challenge-walled host's image to a path under
 * `/cached-images/` when `cache-images.ts` has mirrored it, and its own comment
 * has the reason already: *"a cached image is by definition not dead: the bytes
 * are on our disk."* Handing that path to `fetch` produces ERR_INVALID_URL,
 * which this file would then record as a cause of death.
 *
 * The result was perverse enough to be worth naming: on 2026-08-20 the run
 * marked all four successfully-mirrored maangchi photographs dead — the four
 * that the rescue mechanism had saved from exactly the host this file refuses
 * to blank. The remedy for a blocked image was being deleted for not being
 * reachable over the network it was rescued from.
 */
const urls = [...new Set(recipes.map((r) => r.image)
  .filter((u): u is string => !!u?.trim())
  .filter((u) => /^https?:\/\//i.test(u)))];
console.error(`${urls.length} distinct image urls`);

const suspect = new Map<string, string>();
await pool(urls, async (url) => {
  const why = await probe(url, false);
  if (why) suspect.set(url, why);
});
console.error(`${suspect.size} failed the first pass; re-probing as a browser`);

const dead = new Map<string, string>();
await pool([...suspect.keys()], async (url) => {
  const why = await probe(url, true);
  if (why) dead.set(url, why);
});
console.error(`${dead.size} still failing`);

/**
 * A host that fails wholesale is a host that is blocking us.
 *
 * If every image we hold for a source is "dead", the source is not missing 371
 * photographs — we are being refused. Recording that would silently demote the
 * whole source, so it is dropped with a line saying so.
 */
const byHost = new Map<string, { dead: number; total: number }>();
const hostOf = (u: string) => { try { return new URL(u).host; } catch { return u; } };
for (const u of urls) {
  const h = hostOf(u);
  const row = byHost.get(h) ?? { dead: 0, total: 0 };
  row.total++; byHost.set(h, row);
}
for (const u of dead.keys()) byHost.get(hostOf(u))!.dead++;

const kept = new Map<string, string>();
for (const [url, why] of dead) {
  const row = byHost.get(hostOf(url))!;
  /* Wholesale, and more than a handful: blocking, not rot. */
  if (row.dead === row.total && row.total > 5) continue;
  kept.set(url, why);
}
for (const [host, row] of byHost) {
  if (row.dead === row.total && row.total > 5) {
    console.error(`  skipped ${host}: all ${row.total} failed — treating as blocked, not gone`);
  }
}

writeFileSync(OUT, JSON.stringify({
  _note: [
    "Image URLs the source has taken down. Generated by `npm run check-images`;",
    "read by `recipe-index`, which blanks them so `picturedFirst` ranks those",
    "recipes last — which is what the app already does for a recipe with no",
    "photograph at all.",
    "",
    "Only what failed BOTH a plain probe and a browser-agent probe is here, and",
    "hosts that failed wholesale are excluded as blocked rather than gone. See",
    "the header of src/ontology/check-images.ts.",
  ],
  checked: urls.length,
  dead: Object.fromEntries([...kept].sort(([a], [b]) => a.localeCompare(b))),
}, null, 2) + "\n");

console.error(`wrote ${kept.size} dead urls to ${OUT}`);
