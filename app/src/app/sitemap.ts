import type { MetadataRoute } from "next";

/**
 * Four URLs, and the corpus is deliberately not among them.
 *
 * The obvious sitemap here is 4,874 recipe pages. It would be a mistake:
 * every one of them sets its canonical to the source blog (see
 * `recipe/[id]/page.tsx`), so submitting them asks a crawler with no reason to
 * trust this domain yet to spend its whole budget on pages we have already told
 * it to credit elsewhere. Those pages exist to be shared, not to be found.
 *
 * What is listed is what a stranger could actually be looking for: the product,
 * and the two documents that say what it does with their data.
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://jipbap.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
