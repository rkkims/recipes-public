/**
 * Sitemap discovery.
 *
 * DECISIONS §6: the sitemap index is the entry point, not the homepage. Both
 * target sites render their listing pages with JS, and link extraction from nav
 * markup produced zero candidates during evaluation.
 */
import { politeFetch } from "./http.js";

const locs = (xml: string): string[] =>
  [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]!);

/**
 * Returns post URLs from a sitemap index.
 *
 * Prefers sub-sitemaps whose filename contains "post" — page/category/author
 * sitemaps carry no recipes and cost requests. Falls back to all sub-sitemaps
 * when naming doesn't cooperate.
 */
export async function collectPostUrls(
  sitemapIndex: string,
  /**
   * Routing must apply to the sitemap too, not just the pages. An earlier
   * version took a bare boolean, so the Apify Actor had no way to pass its
   * proxy URL here — it fetched sitemaps directly from the container's
   * datacenter IP and both blocked sources 403'd before fetching a single page.
   */
  route: { residential?: boolean; proxyUrl?: string } = {},
): Promise<string[]> {
  const { residential = false, proxyUrl } = route;
  const index = await politeFetch(sitemapIndex, { delayMs: 800, residential, proxyUrl });
  if (!index.ok) {
    throw new Error(`sitemap index ${index.status} for ${sitemapIndex}`);
  }

  const all = locs(index.body);
  const subs = all.filter((u) => u.endsWith(".xml"));

  // No nested sitemaps: this was a flat sitemap listing pages directly.
  if (subs.length === 0) return all;

  /**
   * Exclude taxonomy and archive sitemaps BEFORE preferring "post".
   *
   * A naive /post/i filter also matches `post_tag-sitemap.xml`. On
   * seonkyounglongest.com that turned 6,305 *tag archive* pages into apparent
   * recipes — and archives are the worst possible false positive here, because
   * WordPress recipe plugins emit Recipe JSON-LD on them too. They pass the
   * JSON-LD check and the ≥3-ingredient check, then duplicate real recipes in
   * the corpus and skew the ingredient frequency distribution that sets the
   * ontology's scope. Nothing downstream would flag it.
   */
  const TAXONOMY =
    /(?:post_tag|post_format|product_tag|product_cat|category|tag|author|attachment|brand|page)-sitemap/i;
  const content = subs.filter((u) => !TAXONOMY.test(u));

  // Prefer post/recipe sitemaps; some sites use a `recipe` custom post type.
  // WordPress CORE sitemaps reverse the word order — `wp-sitemap-posts-post-1.xml`
  // (hirokoliston, 2026-08-20) — so both spellings are preferred.
  const preferred = content.filter((u) =>
    /(?:^|[/_-])(?:posts?|recipes?)-sitemap|wp-sitemap-posts-/i.test(u));
  const chosen =
    preferred.length > 0 ? preferred : content.length > 0 ? content : subs;

  const urls: string[] = [];
  for (const sub of chosen) {
    const res = await politeFetch(sub, { delayMs: 800, residential, proxyUrl });
    if (!res.ok) continue;
    urls.push(...locs(res.body).filter((u) => !u.endsWith(".xml")));
  }
  return [...new Set(urls)];
}
