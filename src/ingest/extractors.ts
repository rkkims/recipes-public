/**
 * Bespoke HTML extractors, for sources with no schema.org markup.
 *
 * The default path is JSON-LD (deterministic, zero maintenance — DECISIONS §6).
 * A hand-written extractor is a maintenance liability: it breaks silently when a
 * theme changes. So one only earns its place when the source offers something
 * JSON-LD sources don't.
 *
 * Maangchi does. Every ingredient is wrapped in a link to her own glossary:
 *
 *   <li>2 tablespoons <a href="/ingredient/hot-pepper-paste-gochujang">gochujang
 *       (Korean hot pepper paste)</a></li>
 *
 * That slug is a **canonical ingredient ID hand-curated by a native Korean cook**
 * — precisely the asset §3 calls the moat, and no JSON-LD source provides it.
 * `toasted-sesame-oil` is even kept distinct from untoasted, which
 * `ONTOLOGY-SEED.md` lists as a *not*-substitution. So this extractor is not
 * really about recovering recipes; it's about harvesting alias → canonical
 * mappings for free.
 */

export type Extracted = {
  title: string;
  rawIngredients: string[];
  /**
   * alias → canonical pairs, taken per ingredient line rather than per page.
   *
   * The pairing is the whole value. Collecting slugs at page level tells you
   * "gochujang appears somewhere here"; pairing tells you the string
   * "2 tablespoons gochujang (Korean hot pepper paste)" resolves to
   * `hot-pepper-paste-gochujang` — which is a directly usable alias-table row.
   */
  canonicalPairs: Array<{ raw: string; slug: string }>;
  imageUrl: string | null;
};

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#8217;|&rsquo;|&#8216;|&lsquo;|&#0?39;|&apos;/g, "'")
    .replace(/&#8220;|&ldquo;|&#8221;|&rdquo;/g, '"')
    .replace(/&#8211;|&ndash;/g, "-")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;|&[a-z]+;/gi, "")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Maangchi. Validated on 8/8 sampled recipes (mean ~10 ingredient lines).
 *
 * Structure notes that make this safe rather than fragile:
 *  - the block is fenced by `div.recipe-card-ingredients`, a semantic class
 *  - `<h3>` inside it are section headers ("For seasoning mixture:") and are
 *    skipped — only `<li>` and `<p>` are ingredient lines
 *  - a lone `<p>` before the first `<ul>` is a real ingredient (the main
 *    item), so it must be included, not treated as prose
 */
export function maangchi(html: string): Extracted | null {
  const block = html.match(/<div class="recipe-card-ingredients">([\s\S]*?)<\/div>/);
  if (!block) return null;

  const inner = block[1]!;
  const items: string[] = [];
  const canonicalPairs: Array<{ raw: string; slug: string }> = [];

  for (const m of inner.matchAll(/<(li|p)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const rawHtml = m[2]!;
    const text = decode(rawHtml);
    if (text.length <= 1 || /^print recipe$/i.test(text)) continue;
    items.push(text);
    // Slugs found inside THIS line, so the mapping is per ingredient.
    for (const s of new Set([...rawHtml.matchAll(/\/ingredient\/([a-z0-9-]+)/g)].map((x) => x[1]!))) {
      canonicalPairs.push({ raw: text, slug: s });
    }
  }

  if (items.length < 3) return null;

  const title =
    decode(html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "") ||
    decode(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "").replace(/\s*[-|].*$/, "");
  if (!title) return null;

  // og:image is published for exactly this purpose (§6, thumbnail + attribution).
  const imageUrl =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/)?.[1] ?? null;

  return { title, rawIngredients: items, canonicalPairs, imageUrl };
}

/**
 * Hiroko Liston (hirokoliston.com). Japanese home cooking, ~3,100 posts,
 * NO schema.org markup at all — which is the other way an extractor earns its
 * place. The Gutenberg structure is strict and uniform (verified on sampled
 * pages, 2026-08-20):
 *
 *   <h5 class="wp-block-heading">Ingredients</h5>
 *   <p>2 servings Freshly Cooked Rice<br>Shredded Cabbage as required<br>…</p>
 *   <h5 class="wp-block-heading">Sweet Miso Sauce</h5>   ← sub-section
 *   <p>3 tablespoons Miso<br>…<br>*Alter the amount …</p> ← footnote line
 *   <h5 class="wp-block-heading">Method</h5>
 *
 * Sub-section headers are emitted as "Name:" lines — the junk filter already
 * drops trailing-colon headers with reason `header`, so the curator sees them
 * as settled rather than asked. `*`-footnotes ride the same path
 * (`instruction`). Ingredient lines split on <br>.
 */
export function hirokoliston(html: string): Extracted | null {
  const start = html.search(/<h5[^>]*>\s*Ingredients?\s*<\/h5>/i);
  if (start < 0) return null;
  const after = html.slice(start);
  const end = after.search(/<h5[^>]*>\s*(?:Method|Instructions?|Directions?)\s*<\/h5>/i);
  const block = end > 0 ? after.slice(0, end) : after;

  const items: string[] = [];
  for (const m of block.matchAll(/<(h5|p)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    if (m[1]!.toLowerCase() === "h5") {
      const name = decode(m[2]!);
      if (name && !/^ingredients?$/i.test(name)) items.push(`${name}:`);
      continue;
    }
    for (const part of m[2]!.split(/<br\s*\/?>/i)) {
      const text = decode(part);
      if (text.length > 1) items.push(text);
    }
  }
  if (items.filter((i) => !i.endsWith(":")).length < 3) return null;

  // No <h1> on this site, so the <title> fallback is the ONLY path — and its
  // suffix strip must not cut at a bare hyphen: "‘Goma-ae’ Spinach – Hiroko's
  // Recipes" was truncating to "Goma" (curator report, 2026-08-20). Only a
  // SPACED en/em dash or pipe separates title from site name here; hyphens
  // inside dish names have no spaces and survive.
  // decode() turns the site's &#8211; into a plain hyphen, so the suffix
  // reads " - Hiroko's Recipes" — strip THAT, by name, and nothing else.
  // A spaced en dash/pipe suffix stays covered for older page variants.
  const title =
    decode(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "") ||
    decode(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "")
      .replace(/\s+[–—|-]\s+Hiroko.{0,2}s Recipes\s*$/i, "")
      .replace(/\s+[–—|]\s+[^–—|]*$/, "").trim();
  if (!title) return null;

  // No og:image on this site (probed 2026-08-20) — the featured image is the
  // one <img> tagged attachment-post-thumbnail, uniform across sampled posts.
  // og:image stays first in case an SEO plugin ever appears. Two-step match
  // because attribute order between class and src is not guaranteed.
  const thumb = html.match(/<img\b[^>]*attachment-post-thumbnail[^>]*>/)?.[0];
  const imageUrl =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/)?.[1]
    ?? thumb?.match(/\bsrc=["']([^"']+)/)?.[1] ?? null;

  return { title, rawIngredients: items, canonicalPairs: [], imageUrl };
}

export const EXTRACTORS: Record<string, (html: string) => Extracted | null> = {
  maangchi,
  hirokoliston,
};
