/**
 * Source probe — decide whether a candidate blog is usable before adding it.
 *
 *   npm run probe -- mykoreankitchen.com kimchimari.com
 *   npm run probe                          # the built-in candidate list
 *
 * Answers the only four questions that matter (DECISIONS §6):
 *   1. Is it reachable from here at all, or Cloudflare-blocked?
 *   2. Does it publish a usable sitemap, and how many posts?
 *   3. What share of posts carry schema.org/Recipe JSON-LD?
 *   4. Does robots.txt permit it?
 *
 * Probing is cheap (about 8 requests per domain) and prevents adding a source
 * that yields nothing. Ranking by *estimated recipes* rather than post count
 * matters: a big blog with a low JSON-LD rate is worth less than a small one
 * with recipe cards on everything.
 */
import { politeFetch } from "./http.js";
import { loadRobots, isAllowed } from "./robots.js";
import { collectPostUrls } from "./sitemap.js";
import { findRecipeNode } from "./jsonld.js";

/** English-language Korean recipe blogs. Sourced from search + known names. */
const CANDIDATES = [
  "www.koreanbapsang.com",
  "www.maangchi.com",
  "mykoreankitchen.com",
  "kimchimari.com",
  "www.beyondkimchee.com",
  "seonkyounglongest.com",
  "aeriskitchen.com",
  "futuredish.com",
  "carvingajourney.com",
  "ahnestkitchen.com",
  "www.crazykoreancooking.com",
  "thesubversivetable.com",
  "www.drivemehungry.com",
  "thekoreanvegan.com",
  "cjeatsrecipes.com",
  "www.twoplaidaprons.com",
];

const SAMPLE = 5;

type Probe = {
  domain: string;
  reachable: boolean;
  status: number;
  robotsRules: number;
  robotsBlocksPosts: boolean;
  posts: number;
  sampled: number;
  jsonLdHits: number;
  meanIngredients: number;
  estRecipes: number;
  note: string;
};

async function probe(domain: string): Promise<Probe> {
  const origin = `https://${domain}`;
  const r: Probe = {
    domain, reachable: false, status: 0, robotsRules: 0, robotsBlocksPosts: false,
    posts: 0, sampled: 0, jsonLdHits: 0, meanIngredients: 0, estRecipes: 0, note: "",
  };

  const robots = await loadRobots(origin);
  r.robotsRules = robots.disallow.length;

  // Probe a real content path, never `/`. Maangchi's homepage is edge-cached and
  // returns 200 while every other path 403s — testing `/` reports false success.
  let urls: string[] = [];
  for (const candidate of [`${origin}/sitemap_index.xml`, `${origin}/sitemap.xml`, `${origin}/wp-sitemap.xml`]) {
    const res = await politeFetch(candidate, { delayMs: 1200, retries: 1 });
    r.status = res.status;
    if (!res.ok) continue;
    try {
      urls = await collectPostUrls(candidate);
    } catch {
      continue;
    }
    if (urls.length) break;
  }

  if (!urls.length) {
    r.note = r.status === 403 || r.status === 401 ? "blocked (WAF)" : r.status === 0 ? "unreachable" : "no usable sitemap";
    return r;
  }

  r.reachable = true;
  r.posts = urls.length;
  r.robotsBlocksPosts = !isAllowed(new URL(urls[0]!).pathname, robots);

  const step = Math.max(1, Math.floor(urls.length / SAMPLE));
  const sample = urls.filter((_, i) => i % step === 0).slice(0, SAMPLE);

  let ingTotal = 0;
  for (const u of sample) {
    const res = await politeFetch(u, { delayMs: 1200, retries: 1 });
    r.sampled++;
    if (!res.ok) continue;
    const node = findRecipeNode(res.body);
    if (!node) continue;
    const ing = node["recipeIngredient"];
    r.jsonLdHits++;
    if (Array.isArray(ing)) ingTotal += ing.length;
  }
  r.meanIngredients = r.jsonLdHits ? ingTotal / r.jsonLdHits : 0;
  r.estRecipes = Math.round(r.posts * (r.jsonLdHits / Math.max(r.sampled, 1)));
  return r;
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]!);
      }
    }),
  );
  return out;
}

const domains = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const targets = domains.length ? domains : CANDIDATES;

console.log(`probing ${targets.length} domains (${SAMPLE}-page sample each)\n`);
// Different hosts, so the per-host delay doesn't serialise across domains.
const results = await pool(targets, 4, probe);

results.sort((a, b) => b.estRecipes - a.estRecipes);

const pad = (s: string | number, n: number) => String(s).padEnd(n);
console.log(
  pad("domain", 28) + pad("posts", 7) + pad("jsonld", 8) + pad("mean ing", 10) + pad("est recipes", 13) + "note",
);
console.log("─".repeat(84));
for (const r of results) {
  console.log(
    pad(r.domain, 28) +
      pad(r.reachable ? r.posts : "—", 7) +
      pad(r.reachable ? `${r.jsonLdHits}/${r.sampled}` : "—", 8) +
      pad(r.meanIngredients ? r.meanIngredients.toFixed(1) : "—", 10) +
      pad(r.estRecipes || "—", 13) +
      [r.note, r.robotsBlocksPosts ? "robots: DISALLOWED" : "", r.robotsRules ? `${r.robotsRules} robots rules` : ""]
        .filter(Boolean).join("; "),
  );
}

const usable = results.filter((r) => r.reachable && r.jsonLdHits > 0 && !r.robotsBlocksPosts);
console.log(`
usable sources     ${usable.length} / ${targets.length}
combined estimate  ~${usable.reduce((a, r) => a + r.estRecipes, 0)} recipes with JSON-LD ingredient lists`);
