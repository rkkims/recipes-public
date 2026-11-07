/**
 * Source registry.
 *
 * `cuisine` is the domain-derived default. DECISIONS §6: `recipeCuisine` is
 * inconsistent and low quality across sources, so the domain supplies cuisine
 * and JSON-LD is retained only as `cuisineRaw`.
 *
 * All figures below were measured with `npm run probe` on 2026-07-29 — a
 * 5-page evenly-spread sample per domain. `est` is posts × JSON-LD hit rate.
 */
export type Source = {
  id: string;
  name: string;
  origin: string;
  sitemapIndex: string;
  /** Domain-derived default cuisine. See `multiCuisine` before trusting it. */
  cuisine: string;
  enabled: boolean;
  /**
   * The blog covers several cuisines, so a single domain-level `cuisine` is
   * wrong for it. These stay disabled until per-recipe cuisine inference
   * exists — §3's context-aware mapping depends on the tag being correct, and a
   * mislabel is worse than an absence: it maps "soy sauce" to the wrong
   * canonical ID, which is the exact failure the ontology exists to prevent.
   */
  multiCuisine?: boolean;
  /**
   * Route this source through the residential provider. Opt-in per source:
   * proxy bandwidth costs money and adds failure modes, so sources that work
   * directly must never touch it.
   */
  needsResidential?: boolean;
  /**
   * Fetch via the Wayback Machine instead of the live site. For sources that
   * block every non-browser client at any IP — see wayback.ts. `sourceUrl` still
   * records the original URL, so link-out is unaffected.
   */
  wayback?: { pattern: string; from?: number; urlFilter?: RegExp };
  /**
   * Named bespoke HTML extractor (see extractors.ts) for sources with no
   * schema.org markup. Only justified when the source offers something JSON-LD
   * doesn't — Maangchi supplies canonical ingredient slugs.
   */
  extractor?: string;
  /** Why disabled or otherwise notable, so it isn't silently forgotten. */
  note?: string;
};

export const SOURCES: Source[] = [
  // ── Korean, verified, enabled ────────────────────────────────────────────
  {
    id: "chefchrischo",
    name: "Chef Chris Cho",
    origin: "https://chefchrischo.com",
    sitemapIndex: "https://chefchrischo.com/sitemap_index.xml",
    cuisine: "korean",
    enabled: true,
    note: "Added 2026-08-17 on the curator's ask. 230 posts, 4/5 JSON-LD, " +
      "mean 10.5 ing, est ~184. Mod_Security 406s bot-like UAs; the standard " +
      "browser UA passes, no residential routing needed.",
  },
  {
    id: "koreanbapsang",
    name: "Korean Bapsang",
    origin: "https://www.koreanbapsang.com",
    sitemapIndex: "https://www.koreanbapsang.com/sitemap_index.xml",
    cuisine: "korean",
    enabled: true,
    note: "275 posts, 3/5 JSON-LD, est ~165.",
  },
  {
    id: "futuredish",
    name: "Future Dish",
    origin: "https://futuredish.com",
    sitemapIndex: "https://futuredish.com/sitemap_index.xml",
    cuisine: "korean",
    enabled: true,
    note: "392 posts, 4/5 JSON-LD, est ~314.",
  },
  {
    id: "kimchimari",
    name: "Kimchimari",
    origin: "https://kimchimari.com",
    sitemapIndex: "https://kimchimari.com/sitemap_index.xml",
    cuisine: "korean",
    enabled: true,
    note: "386 posts, 4/5 JSON-LD, est ~309.",
  },
  {
    id: "mykoreankitchen",
    name: "My Korean Kitchen",
    origin: "https://mykoreankitchen.com",
    sitemapIndex: "https://mykoreankitchen.com/sitemap_index.xml",
    cuisine: "korean",
    enabled: true,
    note: "383 posts, 3/5 JSON-LD, est ~230. Lower mean ingredients (8.3).",
  },
  {
    id: "beyondkimchee",
    name: "Beyond Kimchee",
    origin: "https://www.beyondkimchee.com",
    sitemapIndex: "https://www.beyondkimchee.com/sitemap_index.xml",
    cuisine: "korean",
    enabled: true,
    note: "372 posts, 3/5 JSON-LD, est ~223. Some pan-Asian content.",
  },
  {
    id: "thesubversivetable",
    name: "The Subversive Table",
    origin: "https://thesubversivetable.com",
    sitemapIndex: "https://thesubversivetable.com/sitemap_index.xml",
    cuisine: "korean",
    enabled: true,
    note: "223 posts, 4/5 JSON-LD, est ~178. Korean-American.",
  },
  {
    id: "thekoreanvegan",
    name: "The Korean Vegan",
    origin: "https://thekoreanvegan.com",
    sitemapIndex: "https://thekoreanvegan.com/sitemap_index.xml",
    cuisine: "korean",
    enabled: true,
    note: "251 posts but only 1/5 JSON-LD, est ~50. Low yield; kept for coverage.",
  },

  // ── Chinese, verified, enabled ───────────────────────────────────────────
  {
    id: "thewoksoflife",
    name: "The Woks of Life",
    origin: "https://thewoksoflife.com",
    sitemapIndex: "https://thewoksoflife.com/sitemap_index.xml",
    cuisine: "chinese",
    enabled: true,
    multiCuisine: true,
    note: "1,561 posts, 10/14 JSON-LD, est ~1,100. Chinese-majority but genuinely pan-Asian — the corpus contains Japchae, Yaki Udon, Pad Krapow, Chicken Larb, Vietnamese Coffee. Discovered by cuisine-eval: treating the domain as ground truth produced 0.86 precision, and most 'errors' were the classifier being right. Stays enabled; cuisine comes from inference.",
  },

  // ── Multi-cuisine: enabled, cuisine comes from per-recipe inference ──────
  // cuisine.ts scores dish names, cuisine adjectives and marker ingredients and
  // ABSTAINS when the evidence is weak. Measured precision 1.000 at 84%
  // commit on a 249-recipe Korean control set (npm run cuisine-eval).
  {
    id: "seonkyounglongest",
    name: "Seonkyoung Longest (Asian at Home)",
    origin: "https://seonkyounglongest.com",
    sitemapIndex: "https://seonkyounglongest.com/sitemap_index.xml",
    cuisine: "korean",
    enabled: true,
    multiCuisine: true,
    note: "611 posts, 5/5 JSON-LD, est ~611 — the best yield found. Pan-Asian (Korean/Chinese/Thai/Japanese), so needs per-recipe cuisine inference first.",
  },
  {
    id: "twoplaidaprons",
    name: "Two Plaid Aprons",
    origin: "https://www.twoplaidaprons.com",
    sitemapIndex: "https://www.twoplaidaprons.com/sitemap_index.xml",
    cuisine: "korean",
    enabled: true,
    multiCuisine: true,
    note: "328 posts, 5/5 JSON-LD, est ~328, highest mean ingredients (16.4). Thai/Korean mix.",
  },
  {
    id: "drivemehungry",
    name: "Drive Me Hungry",
    origin: "https://www.drivemehungry.com",
    sitemapIndex: "https://www.drivemehungry.com/sitemap_index.xml",
    cuisine: "korean",
    enabled: true,
    multiCuisine: true,
    note: "238 posts, 5/5 JSON-LD, est ~238. Pan-Asian.",
  },
  {
    id: "cjeatsrecipes",
    name: "CJ Eats",
    origin: "https://cjeatsrecipes.com",
    sitemapIndex: "https://cjeatsrecipes.com/sitemap_index.xml",
    cuisine: "korean",
    enabled: true,
    multiCuisine: true,
    note: "316 posts, 3/5 JSON-LD, est ~190. Pan-Asian.",
  },
  {
    id: "carvingajourney",
    name: "Carving A Journey",
    origin: "https://carvingajourney.com",
    sitemapIndex: "https://carvingajourney.com/sitemap_index.xml",
    cuisine: "korean",
    enabled: true,
    multiCuisine: true,
    note: "304 posts but 2/5 JSON-LD and mean 7.0 ingredients, est ~122. Weakest usable source.",
  },

  // ── Not usable ───────────────────────────────────────────────────────────
  {
    id: "maangchi",
    name: "Maangchi",
    origin: "https://www.maangchi.com",
    sitemapIndex: "https://www.maangchi.com/sitemap_index.xml",
    cuisine: "korean",
    enabled: true,
    wayback: {
      pattern: "maangchi.com/recipe/*",
      // Newer is better here, counter-intuitively: CDX `limit` caps ROWS, not
      // distinct URLs, so a wider date range spends the budget on repeat
      // snapshots of the same page and returns FEWER recipes. from:2020 yielded
      // 216 candidates; from:2024 yielded 262.
      from: 2024,
      urlFilter: /maangchi\.com\/recipe\/[a-z0-9-]+$/i,
    },
    extractor: "maangchi",
    note: "No schema.org markup at all — recovered with a bespoke extractor because every ingredient links to /ingredient/<slug>, a canonical ID hand-curated by a native Korean cook (§3's moat asset, free). Live site 403s all non-browser clients at any IP, so fetched via Wayback. Validated 8/8 on sampled recipes. OLD note kept for history: DEAD END — not a WAF problem. Wayback snapshots fetch fine and contain NO recipe markup at all: 0 Recipe JSON-LD, 0 microdata, 0 hRecipe, 0 WP Recipe Maker, 0 Tasty Recipes. Ingredients are hand-rolled HTML. Even fully unblocked there is nothing for this pipeline to parse. Same category as aeriskitchen. Do not revisit without committing to bespoke HTML extraction.",
  },
  {
    id: "hirokoliston",
    name: "Hiroko's Recipes",
    origin: "https://www.hirokoliston.com",
    sitemapIndex: "https://www.hirokoliston.com/wp-sitemap.xml",
    cuisine: "japanese",
    enabled: true,
    extractor: "hirokoliston",
    note: "Added 2026-08-20 on the curator's ask. ~3,100 posts, NO JSON-LD — " +
      "bespoke extractor over a strict Gutenberg h5/p/br structure. Japanese " +
      "home cooking written from Melbourne; robots.txt permissive.",
  },
  {
    id: "justonecookbook",
    name: "Just One Cookbook",
    origin: "https://www.justonecookbook.com",
    sitemapIndex: "https://www.justonecookbook.com/sitemap_index.xml",
    cuisine: "japanese",
    enabled: true,
    wayback: {
      pattern: "justonecookbook.com*",
      from: 2023,
      // Root-level slugs, e.g. /oyakodon/ — not /recipe/<slug>/.
      urlFilter: /justonecookbook\.com\/[a-z0-9-]{6,}$/i,
    },
    note: "Live site 403s every non-browser client at any IP (datacenter AND residential, with browser headers). Recovered via Wayback: 8/8 JSON-LD, mean 10.4 ingredients, ~279 pages. **The only single-cuisine Japanese source** — supplies the Japanese ground truth cuisine-eval lacks.",
  },
  // ── Added 2026-08-21: the subscription-deadline sweep ────────────────────
  // Eighteen blogs across all six in-scope cuisines, probed the same day
  // (npm run probe, 5-page samples). Every author cooks their own cuisine,
  // which is the queue's authorship rule; the curator strikes any they would
  // not have validated. chinasichuanfood probed 0/5 JSON-LD and was left out.
  {
    id: "chopstickchronicles",
    name: "Chopstick Chronicles",
    origin: "https://www.chopstickchronicles.com",
    sitemapIndex: "https://www.chopstickchronicles.com/sitemap_index.xml",
    cuisine: "japanese",
    enabled: true,
    note: "Shihoko Ura, Japanese. 363 posts, 4/5 JSON-LD, mean 9.3 ing, est ~290.",
  },
  {
    id: "recipetinjapan",
    name: "RecipeTin Japan",
    origin: "https://japan.recipetineats.com",
    sitemapIndex: "https://japan.recipetineats.com/sitemap_index.xml",
    cuisine: "japanese",
    enabled: true,
    note: "Yumiko, Japanese. 435 posts, 2/5 JSON-LD, mean 14.0 ing, est ~174 \u2014 low hit rate, kept for the authorship.",
  },
  {
    id: "sudachirecipes",
    name: "Sudachi Recipes",
    origin: "https://sudachirecipes.com",
    sitemapIndex: "https://sudachirecipes.com/sitemap_index.xml",
    cuisine: "japanese",
    enabled: true,
    note: "Yuto Omura, Japanese. 592 posts, 4/5 JSON-LD, mean 13.0 ing, est ~474.",
  },
  {
    id: "okonomikitchen",
    name: "Okonomi Kitchen",
    origin: "https://www.okonomikitchen.com",
    sitemapIndex: "https://www.okonomikitchen.com/sitemap_index.xml",
    cuisine: "japanese",
    enabled: true,
    note: "Lisa Kitahara, Japanese-Canadian, vegan Japanese. 779 posts, 4/5 JSON-LD, mean 12.3 ing, est ~623.",
  },
  {
    id: "norecipes",
    name: "No Recipes",
    origin: "https://norecipes.com",
    sitemapIndex: "https://norecipes.com/sitemap_index.xml",
    cuisine: "japanese",
    enabled: true,
    multiCuisine: true,
    note: "Marc Matsumoto, Japanese-American; Japanese-majority but pan-Asian, cuisine from inference. 571 posts, 5/5 JSON-LD, est ~571. 12 robots rules, none on posts.",
  },
  {
    id: "redhousespice",
    name: "Red House Spice",
    origin: "https://redhousespice.com",
    sitemapIndex: "https://redhousespice.com/sitemap_index.xml",
    cuisine: "chinese",
    enabled: true,
    note: "Wei Guo, Chinese. 319 posts, 4/5 JSON-LD, mean 7.0 ing, est ~255.",
  },
  {
    id: "omnivorescookbook",
    name: "Omnivore's Cookbook",
    origin: "https://omnivorescookbook.com",
    sitemapIndex: "https://omnivorescookbook.com/sitemap_index.xml",
    cuisine: "chinese",
    enabled: true,
    note: "Maggie Zhu, Chinese (Beijing). 776 posts, 4/5 JSON-LD, mean 15.8 ing, est ~621.",
  },
  {
    id: "madewithlau",
    name: "Made With Lau",
    origin: "https://www.madewithlau.com",
    sitemapIndex: "https://www.madewithlau.com/sitemap.xml",
    cuisine: "chinese",
    enabled: true,
    note: "Daddy Lau, Cantonese. 200 posts, 4/5 JSON-LD, mean 14.3 ing, est ~160.",
  },
  {
    id: "rasamalaysia",
    name: "Rasa Malaysia",
    origin: "https://rasamalaysia.com",
    sitemapIndex: "https://rasamalaysia.com/sitemap_index.xml",
    cuisine: "chinese",
    enabled: true,
    multiCuisine: true,
    note: "Bee Yinn Low, Malaysian-Chinese; pan-Asian (Chinese/Thai/Vietnamese/Malaysian), cuisine from inference \u2014 Malaysian dishes abstain and fall out of the queue. 1,404 posts, 4/5 JSON-LD, est ~1,123.",
  },
  {
    id: "hotthaikitchen",
    name: "Hot Thai Kitchen",
    origin: "https://hot-thai-kitchen.com",
    sitemapIndex: "https://hot-thai-kitchen.com/sitemap_index.xml",
    cuisine: "thai",
    enabled: true,
    note: "Pailin Chongchitnant, Thai. 469 posts, 4/5 JSON-LD, mean 19.5 ing, est ~375. The first single-cuisine Thai source.",
  },
  {
    id: "vickypham",
    name: "Vicky Pham",
    origin: "https://vickypham.com",
    sitemapIndex: "https://vickypham.com/sitemap_index.xml",
    cuisine: "vietnamese",
    enabled: true,
    note: "Vicky Pham, Vietnamese. 495 posts, 3/5 JSON-LD, mean 17.3 ing, est ~297. www. 301s to the bare host.",
  },
  {
    id: "hungryhuy",
    name: "Hungry Huy",
    origin: "https://www.hungryhuy.com",
    sitemapIndex: "https://www.hungryhuy.com/sitemap_index.xml",
    cuisine: "vietnamese",
    enabled: true,
    multiCuisine: true,
    note: "Huy Vu, Vietnamese-American; Vietnamese-majority with pan-Asian and some American posts, cuisine from inference. 448 posts, 3/5 JSON-LD, est ~269.",
  },
  {
    id: "wokandkin",
    name: "Wok & Kin",
    origin: "https://www.wokandkin.com",
    sitemapIndex: "https://www.wokandkin.com/sitemap_index.xml",
    cuisine: "vietnamese",
    enabled: true,
    multiCuisine: true,
    note: "Jeannette, Vietnamese-Australian (Chinese-Vietnamese family); cuisine from inference. 219 posts, 2/5 JSON-LD, est ~88.",
  },
  {
    id: "delightfulplate",
    name: "Delightful Plate",
    origin: "https://delightfulplate.com",
    sitemapIndex: "https://delightfulplate.com/sitemap_index.xml",
    cuisine: "vietnamese",
    enabled: true,
    note: "Sophie Pham, Vietnamese. 271 posts, 4/5 JSON-LD, mean 10.5 ing, est ~217.",
  },
  {
    id: "cookingtherapy",
    name: "Cooking Therapy",
    origin: "https://www.cooking-therapy.com",
    sitemapIndex: "https://www.cooking-therapy.com/sitemap_index.xml",
    cuisine: "vietnamese",
    enabled: true,
    multiCuisine: true,
    note: "Becca Du, Vietnamese-American; Vietnamese-majority, some pan-Asian, cuisine from inference. 427 posts, 4/5 JSON-LD, est ~342. 7 robots rules, none on posts.",
  },
  {
    id: "panlasangpinoy",
    name: "Panlasang Pinoy",
    origin: "https://panlasangpinoy.com",
    sitemapIndex: "https://panlasangpinoy.com/sitemap_index.xml",
    cuisine: "filipino",
    enabled: true,
    note: "Vanjo Merano, Filipino. 2,738 posts, 4/5 JSON-LD, mean 11.0 ing, est ~2,190 \u2014 the largest source in the corpus. 13 robots rules, none on posts.",
  },
  {
    id: "kawalingpinoy",
    name: "Kawaling Pinoy",
    origin: "https://www.kawalingpinoy.com",
    sitemapIndex: "https://www.kawalingpinoy.com/sitemap_index.xml",
    cuisine: "filipino",
    enabled: true,
    note: "Lalaine Manalo, Filipino. 625 posts, 4/5 JSON-LD, mean 9.5 ing, est ~500.",
  },
  {
    id: "foxyfolksy",
    name: "Foxy Folksy",
    origin: "https://www.foxyfolksy.com",
    sitemapIndex: "https://www.foxyfolksy.com/sitemap_index.xml",
    cuisine: "filipino",
    enabled: true,
    note: "Bebs, Filipino. 617 posts, 4/5 JSON-LD, mean 9.5 ing, est ~494.",
  },

  {
    id: "aeriskitchen",
    name: "Aeri's Kitchen",
    origin: "https://aeriskitchen.com",
    sitemapIndex: "https://aeriskitchen.com/sitemap_index.xml",
    cuisine: "korean",
    enabled: false,
    note: "681 posts, 0/5 JSON-LD — no recipe-card markup. Would need bespoke HTML parsing; not worth it while ~1,500 Korean recipes are available with JSON-LD.",
  },
  {
    id: "ahnestkitchen",
    name: "Ahnest Kitchen",
    origin: "https://ahnestkitchen.com",
    sitemapIndex: "https://ahnestkitchen.com/sitemap_index.xml",
    cuisine: "korean",
    enabled: false,
    note: "327 posts, 0/5 JSON-LD. Also 27 robots.txt rules — read them before any crawl.",
  },
  {
    id: "crazykoreancooking",
    name: "Crazy Korean Cooking",
    origin: "https://www.crazykoreancooking.com",
    sitemapIndex: "https://www.crazykoreancooking.com/sitemap.xml",
    cuisine: "korean",
    enabled: false,
    note: "No usable sitemap found (tried sitemap_index.xml, sitemap.xml, wp-sitemap.xml).",
  },
];

export function enabledSources(only?: string[]): Source[] {
  const pool = SOURCES.filter((s) => s.enabled || only?.includes(s.id));
  return only ? pool.filter((s) => only.includes(s.id)) : pool;
}
