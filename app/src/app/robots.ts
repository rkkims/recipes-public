import type { MetadataRoute } from "next";

/**
 * What a crawler may read.
 *
 * The list is short because most of this app is not a website. Everything
 * behind `Disallow` is either one person's own state (`/my-recipes`, `/list`,
 * `/calendar`), a form (`/signin`), a file (`/export`), or the founder's
 * curation tool (`/curate`) — none of it is an answer to a query, and a crawler
 * spending its budget there is budget not spent on the two pages that are.
 *
 * `/recipe/*` stays open on purpose even though every one of those pages sends
 * its canonical to the source blog: the pages are shared into group chats, and
 * a scraper that cannot fetch the page cannot draw the card. Crawlable and
 * un-ranked is the intended state, and the canonical is what enforces it.
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://jipbap.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/curate", "/my-recipes", "/list", "/calendar", "/signin", "/export", "/offline"],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
