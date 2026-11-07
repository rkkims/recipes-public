/**
 * Per-recipe cuisine inference.
 *
 * Needed to unblock the pan-Asian sources (`multiCuisine` in sources.ts) —
 * ~1,489 recipes including the highest-yield source found. Domain-derived
 * cuisine is correct for Korean Bapsang and wrong for "Asian at Home".
 *
 * DESIGN RULE, from DECISIONS §3/§6: a wrong cuisine tag is worse than no tag.
 * Context-aware ingredient mapping keys off cuisine, so a mislabel routes "soy
 * sauce" to the wrong canonical ID — the exact failure the ontology exists to
 * prevent. So this ABSTAINS by default and only commits when the evidence is
 * both strong and unambiguous. Abstentions are cheap (drop the recipe);
 * mislabels are not (they poison the graph invisibly).
 *
 * Deterministic and dependency-free. No model call, consistent with §6's
 * "parse JSON-LD deterministically" rule. An LLM pass is the escalation for
 * abstentions, not the first move.
 */

export type Cuisine =
  | "korean" | "japanese" | "chinese" | "thai" | "vietnamese" | "filipino";

type Weight = 3 | 1.5 | 0.5;

/**
 * Marker ingredients, weighted by how much they actually discriminate.
 *
 * This is the same insight as the stopword-ingredient problem in
 * SOCIAL-INGEST §6: soy sauce, sesame oil, garlic, rice and sugar appear
 * everywhere and carry almost no signal, so they are absent here entirely.
 *
 * Weight 0.5 exists for the §3 false-friend cases. Fish sauce is Thai *and*
 * Vietnamese *and* Filipino *and* Korean — a real ingredient, a terrible
 * classifier. Weighting it strongly for Thai would misfile Korean recipes.
 */
const MARKERS: Array<[string, Cuisine, Weight]> = [
  // Korean — the jang family is close to a fingerprint
  ["gochujang", "korean", 3], ["gochugaru", "korean", 3],
  ["doenjang", "korean", 3], ["ssamjang", "korean", 3],
  ["guk ganjang", "korean", 3], ["soup soy sauce", "korean", 3],
  ["kimchi", "korean", 1.5], ["tteok", "korean", 3],
  ["dangmyeon", "korean", 3], ["sweet potato starch noodle", "korean", 3],
  ["perilla", "korean", 3], ["aekjeot", "korean", 3],
  ["saeujeot", "korean", 3], ["oligodang", "korean", 3],
  ["korean radish", "korean", 3], ["dashima", "korean", 1.5],
  ["asian pear", "korean", 1.5], ["napa cabbage", "korean", 0.5],
  ["myeolchi", "korean", 3], ["danmuji", "korean", 3],
  ["rice cake", "korean", 1.5], ["korean chili", "korean", 3],

  // Japanese
  ["dashi", "japanese", 1.5], ["mirin", "japanese", 0.5],
  ["miso", "japanese", 1.5], ["katsuobushi", "japanese", 3],
  ["bonito", "japanese", 3], ["kombu", "japanese", 0.5],
  ["konbu", "japanese", 0.5], ["panko", "japanese", 1.5],
  ["shiso", "japanese", 3], ["nori", "japanese", 1.5],
  ["sake", "japanese", 0.5], ["wasabi", "japanese", 3],
  ["ponzu", "japanese", 3], ["shichimi", "japanese", 3],
  ["yuzu", "japanese", 1.5], ["sushi rice", "japanese", 3],
  ["japanese soy sauce", "japanese", 3], ["shoyu", "japanese", 3],

  // Chinese
  ["shaoxing", "chinese", 3], ["doubanjiang", "chinese", 3],
  ["douchi", "chinese", 3], ["hoisin", "chinese", 1.5],
  ["oyster sauce", "chinese", 1.5], ["chinkiang", "chinese", 3],
  ["black vinegar", "chinese", 1.5], ["sichuan peppercorn", "chinese", 3],
  ["szechuan peppercorn", "chinese", 3], ["five spice", "chinese", 3],
  ["lap cheong", "chinese", 3], ["chinese sausage", "chinese", 3],
  ["light soy sauce", "chinese", 1.5], ["dark soy sauce", "chinese", 3],
  ["bok choy", "chinese", 0.5], ["wonton", "chinese", 1.5],
  ["chinese rice wine", "chinese", 3], ["fermented black bean", "chinese", 3],

  // Thai
  ["lemongrass", "thai", 1.5], ["galangal", "thai", 1.5],
  ["kaffir lime", "thai", 1.5], ["makrut", "thai", 1.5],
  ["thai basil", "thai", 3], ["holy basil", "thai", 3],
  ["palm sugar", "thai", 1.5], ["tamarind", "thai", 0.5],
  ["curry paste", "thai", 1.5], ["coconut milk", "thai", 0.5],
  ["thai chili", "thai", 3], ["bird's eye chili", "thai", 1.5],
  ["fish sauce", "thai", 0.5], // false friend — see the note above

  // Vietnamese
  ["nuoc mam", "vietnamese", 3], ["rice paper", "vietnamese", 1.5],
  ["rice vermicelli", "vietnamese", 0.5], ["vietnamese", "vietnamese", 3],

  // Filipino
  ["patis", "filipino", 3], ["calamansi", "filipino", 3],
  ["banana ketchup", "filipino", 3], ["bagoong", "filipino", 3],
];

/** Dish names. A dish name in the title is near-decisive. */
const DISHES: Array<[string, Cuisine]> = [
  ["bibimbap", "korean"], ["tteokbokki", "korean"], ["japchae", "korean"],
  ["bulgogi", "korean"], ["galbi", "korean"], ["kalbi", "korean"],
  ["kimbap", "korean"], ["gimbap", "korean"], ["sundubu", "korean"],
  ["jjigae", "korean"], ["jjajangmyeon", "korean"], ["samgyetang", "korean"],
  ["banchan", "korean"], ["bossam", "korean"], ["haemul", "korean"],
  ["pajeon", "korean"], ["jeon", "korean"], ["namul", "korean"],
  ["bibim", "korean"], ["dakgangjeong", "korean"], ["tteokguk", "korean"],
  ["mandu", "korean"], ["gukbap", "korean"], ["jorim", "korean"],
  ["bokkeum", "korean"], ["muchim", "korean"], ["guksu", "korean"],
  ["ramyun", "korean"], ["ramyeon", "korean"],
  ["jjim", "korean"], ["saengseon", "korean"], ["kkanpung", "korean"],
  // Romanization variants. English-language Korean blogs use all of these, and
  // a single canonical spelling silently misses the rest: "Korean Black Bean
  // Noodles (Jajangmyeon)" was classified Chinese purely because the token here
  // was "jjajangmyeon".
  ["jajangmyeon", "korean"], ["jjajang", "korean"], ["jajang", "korean"],
  ["topokki", "korean"], ["ddeokbokki", "korean"], ["tteokbokgi", "korean"],
  ["kimbop", "korean"], ["gimbop", "korean"], ["soondubu", "korean"],
  ["chapchae", "korean"], ["chigae", "korean"], ["dwenjang", "korean"],
  ["tangsuyuk", "korean"], ["bibimbop", "korean"], ["bulgogi", "korean"],
  ["dakgalbi", "korean"], ["makgeolli", "korean"], ["sundae", "korean"],
  ["saeu", "korean"], ["gamjatang", "korean"], ["budae", "korean"],
  ["seolleongtang", "korean"], ["kongnamul", "korean"], ["sigeumchi", "korean"],

  ["ramen", "japanese"], ["udon", "japanese"], ["soba", "japanese"],
  ["donburi", "japanese"], ["katsu", "japanese"], ["teriyaki", "japanese"],
  ["onigiri", "japanese"], ["takoyaki", "japanese"], ["okonomiyaki", "japanese"],
  ["tempura", "japanese"], ["yakitori", "japanese"], ["sukiyaki", "japanese"],
  ["chawanmushi", "japanese"], ["gyoza", "japanese"], ["sushi", "japanese"],

  ["mapo", "chinese"], ["kung pao", "chinese"], ["lo mein", "chinese"],
  ["chow mein", "chinese"], ["char siu", "chinese"], ["congee", "chinese"],
  ["dan dan", "chinese"], ["xiao long bao", "chinese"], ["dim sum", "chinese"],
  ["hot pot", "chinese"], ["scallion pancake", "chinese"], ["baozi", "chinese"],
  ["egg foo young", "chinese"], ["general tso", "chinese"],

  ["pad thai", "thai"], ["tom yum", "thai"], ["tom kha", "thai"],
  ["massaman", "thai"], ["som tam", "thai"], ["pad krapow", "thai"],
  ["khao soi", "thai"], ["larb", "thai"], ["laab", "thai"],

  ["pho", "vietnamese"], ["banh mi", "vietnamese"], ["bun bo", "vietnamese"],
  ["banh xeo", "vietnamese"], ["goi cuon", "vietnamese"],

  ["adobo", "filipino"], ["sinigang", "filipino"], ["lumpia", "filipino"],
  ["pancit", "filipino"], ["kare kare", "filipino"], ["tinola", "filipino"],
];

/** Cuisine adjectives in a title or slug. */
const ADJECTIVES: Array<[string, Cuisine]> = [
  ["korean", "korean"], ["japanese", "japanese"], ["chinese", "chinese"],
  ["thai", "thai"], ["vietnamese", "vietnamese"], ["filipino", "filipino"],
  ["taiwanese", "chinese"], ["cantonese", "chinese"], ["sichuan", "chinese"],
  ["szechuan", "chinese"], ["hong kong", "chinese"], ["osaka", "japanese"],
];

/**
 * JSON-LD `recipeCuisine` → a known cuisine, or null.
 *
 * Deliberately maps "asian", "southeast asian inspired", "fusion" and
 * "american" to null. Those were the real values observed on The Woks of Life,
 * and treating them as usable is what made the field harmful in the first place.
 */
export function normalizeRawCuisine(raw: string | null): Cuisine | null {
  if (!raw) return null;
  const s = raw.toLowerCase();
  for (const [needle, cuisine] of ADJECTIVES) if (s.includes(needle)) return cuisine;
  return null;
}

const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Whole-token match. The end boundary is not optional: without it `dashi`
 * matches `dashima` — the Korean word for kelp — and every Korean recipe using
 * kelp broth got classified Japanese by its own ingredient list. Prefix
 * matching feels harmless and silently inverts the result.
 */
const has = (haystack: string, needle: string) =>
  new RegExp(`(?:^| )${needle.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?: |$)`).test(haystack);

export type CuisineEvidence = { signal: string; cuisine: Cuisine; weight: number };

export type CuisineInference = {
  /** Committed label, or null when abstaining. */
  cuisine: Cuisine | null;
  /** Highest-scoring cuisine regardless of thresholds — for evaluation only. */
  top: Cuisine | null;
  confidence: number;
  runnerUp: Cuisine | null;
  margin: number;
  /** Kept for debugging and for the review queue — costs nothing (§6). */
  evidence: CuisineEvidence[];
};

/**
 * Commit thresholds, tuned on the Korean control set (npm run cuisine-eval).
 *
 * Set for COVERAGE, not maximum caution. The sweep measured precision 1.000 at
 * both 2.5 and 3.0, with 90% vs 84% committed — so the stricter setting bought
 * no measured precision and cost 6% of the corpus. Abstentions are reviewed by
 * a human anyway, which is the same person who would review a mislabel, so
 * machine caution here just moves work rather than removing it.
 *
 * Caveat kept deliberately visible: the control set is Korean-only, so these
 * numbers show the classifier finds Korean reliably and say nothing about false
 * positives toward Thai/Japanese. That's what data/reports/qc-cuisine.csv is
 * for — every committed label is listed with its evidence, lowest confidence
 * first.
 */
export const MIN_SCORE = 2.5;
export const MIN_MARGIN = 1.5;
/** One cuisine shouldn't win purely by accumulating many weak ingredients. */
const INGREDIENT_CAP = 6;

export function inferCuisine(input: {
  title: string;
  url?: string;
  category?: string | null;
  cuisineRaw?: string | null;
  rawIngredients?: string[];
}): CuisineInference {
  const nameText = normalize(
    [input.title, input.url?.replace(/https?:\/\/[^/]+/, "") ?? "", input.category ?? ""].join(" "),
  );
  const ingText = normalize((input.rawIngredients ?? []).join(" "));

  const scores = new Map<Cuisine, number>();
  const ingScores = new Map<Cuisine, number>();
  const evidence: CuisineEvidence[] = [];

  const add = (cuisine: Cuisine, weight: number, signal: string) => {
    scores.set(cuisine, (scores.get(cuisine) ?? 0) + weight);
    evidence.push({ signal, cuisine, weight });
  };

  for (const [dish, cuisine] of DISHES) {
    if (has(nameText, dish)) add(cuisine, 3, `dish:${dish}`);
  }
  /**
   * An explicit cuisine word in the title outweighs ingredient evidence.
   *
   * Raised from 2.5 to 4 because the author naming the cuisine is a direct
   * statement, while marker ingredients are an inference — and the inference was
   * overriding the statement. "Korean Black Bean Noodles (Jajangmyeon)" lost to
   * Chinese on `dark soy sauce`, which is exactly backwards: the dish is Korean
   * and uses a Chinese pantry item.
   */
  for (const [adj, cuisine] of ADJECTIVES) {
    if (has(nameText, adj)) add(cuisine, 4, `adjective:${adj}`);
  }
  const fromRaw = normalizeRawCuisine(input.cuisineRaw ?? null);
  if (fromRaw) add(fromRaw, 2.5, `recipeCuisine:${input.cuisineRaw}`);

  // Ingredient markers are capped per cuisine, so five weak Thai hints can't
  // outvote one decisive Korean one.
  for (const [marker, cuisine, weight] of MARKERS) {
    if (!has(ingText, marker)) continue;
    const current = ingScores.get(cuisine) ?? 0;
    if (current >= INGREDIENT_CAP) continue;
    const applied = Math.min(weight, INGREDIENT_CAP - current);
    ingScores.set(cuisine, current + applied);
    add(cuisine, applied, `ingredient:${marker.trim()}`);
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const best = ranked[0];
  const second = ranked[1];
  const confidence = best?.[1] ?? 0;
  const margin = confidence - (second?.[1] ?? 0);

  const commit = Boolean(best) && confidence >= MIN_SCORE && margin >= MIN_MARGIN;

  return {
    cuisine: commit ? best![0] : null,
    top: best?.[0] ?? null,
    confidence,
    runnerUp: second?.[0] ?? null,
    margin,
    evidence,
  };
}
