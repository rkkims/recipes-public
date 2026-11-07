/**
 * JSON-LD Recipe node → RawRecipe.
 *
 * Two rules here are policy, not preference:
 *
 * 1. `recipeInstructions` and `description` are NEVER stored. Ingredient lists
 *    are facts; instructions-as-written and headnotes are the creator's
 *    copyrightable expression (DECISIONS §6, link-out only). Both fields sit
 *    right there in the payload, which is exactly why the drop is written out
 *    explicitly instead of left implied.
 *
 * 2. Ingredient strings are preserved VERBATIM. They are the input to the
 *    ontology's node list and alias table (DECISIONS §3, corpus-first) — any
 *    cleanup here destroys the signal we're collecting.
 */
import { inferCuisine } from "./cuisine.js";
import type { JsonLdNode } from "./jsonld.js";
import type { Source } from "./sources.js";

export type RawRecipe = {
  sourceId: string;
  sourceUrl: string;
  title: string;
  /**
   * Domain-derived and normalized. This is the field §3's context-aware
   * mapping consumes — it must be a small closed set.
   */
  cuisine: string | null;
  /**
   * How `cuisine` was determined.
   *
   * `domain`     single-cuisine source; the domain is authoritative
   * `inferred`   multi-cuisine source; cuisine.ts committed a label
   * `unresolved` multi-cuisine source; inference abstained → cuisine is null
   *
   * `unresolved` rows are KEPT, not dropped. Their raw ingredient strings still
   * feed the node list and frequency report (§3, corpus-first), which needs no
   * cuisine. They must simply be excluded from cuisine-dependent ingredient
   * mapping — an absent tag is safe, a wrong one is not.
   */
  cuisineSource: "domain" | "inferred" | "unresolved";
  /** Inference score, null for domain-derived. Feeds a review queue (§6). */
  cuisineConfidence: number | null;
  /**
   * JSON-LD `recipeCuisine` verbatim, informational only.
   *
   * Measured: it is inconsistent AND low quality. Absent entirely on
   * koreanbapsang; on thewoksoflife it yields free text like "Asian",
   * "Southeast Asian inspired", "American" — on Chinese recipes. Letting it
   * override the domain default polluted the cuisine field with values the
   * mapper can't use, so the domain now wins and this is kept for reference.
   */
  cuisineRaw: string | null;
  category: string | null;
  author: string | null;
  datePublished: string | null;
  imageUrl: string | null;
  ratingValue: number | null;
  ratingCount: number | null;
  recipeYield: string | null;
  /** Verbatim, unmodified. */
  rawIngredients: string[];
  /**
   * alias → canonical pairs supplied by the source itself, where it has them
   * (currently Maangchi's /ingredient/<slug> links). Free alias-table evidence
   * for the ontology — see extractors.ts.
   */
  canonicalPairs?: Array<{ raw: string; slug: string }>;
};

const str = (v: unknown): string | null => {
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    for (const x of v) {
      const s = str(x);
      if (s) return s;
    }
    return null;
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return str(o["name"] ?? o["@id"] ?? o["url"] ?? null);
  }
  return null;
};

const num = (v: unknown): number | null => {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/**
 * The author, as a NAME wherever the page holds one — never a person-URI when
 * the reference can be followed.
 *
 * `str()` on `{"@id": "…#/schema/person/<hash>"}` returns the hash URI, which
 * is what 2,511 raw rows currently store. The `people` map (from
 * `personNames`) is the same page's Person nodes keyed by @id; a reference
 * that resolves there returns the person's name, and one that does not falls
 * back to whatever `str()` made of it — a URI in the file is still evidence
 * (it is stable per person per site), just worse evidence than a name.
 */
function authorOf(v: unknown, people: Map<string, string>): string | null {
  for (const cand of Array.isArray(v) ? v : [v]) {
    if (cand && typeof cand === "object") {
      const o = cand as Record<string, unknown>;
      const name = str(o["name"]);
      if (name) return name;
      const id = typeof o["@id"] === "string" ? o["@id"] : null;
      if (id && people.has(id)) return people.get(id)!;
    }
    if (typeof cand === "string" && people.has(cand)) return people.get(cand)!;
  }
  return str(v);
}

export function toRawRecipe(
  node: JsonLdNode,
  source: Source,
  sourceUrl: string,
  /** Person nodes from the same page, keyed by @id — see `authorOf`. */
  people: Map<string, string> = new Map(),
): RawRecipe | null {
  const ingredientsRaw = node["recipeIngredient"] ?? node["ingredients"];
  const rawIngredients = (Array.isArray(ingredientsRaw) ? ingredientsRaw : [])
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim())
    .filter(Boolean);

  const title = str(node["name"]);
  if (!title) return null;

  const jsonLdCuisine = str(node["recipeCuisine"]);
  const rating = node["aggregateRating"] as Record<string, unknown> | undefined;

  /**
   * Single-cuisine sources: the domain is authoritative and cheaper than any
   * inference. Multi-cuisine sources: infer per recipe, and abstain rather than
   * guess. The Woks of Life looked single-cuisine and wasn't — see sources.ts.
   */
  function resolveCuisine(): Pick<RawRecipe, "cuisine" | "cuisineSource" | "cuisineConfidence"> {
    if (!source.multiCuisine) {
      return { cuisine: source.cuisine, cuisineSource: "domain", cuisineConfidence: null };
    }
    const inf = inferCuisine({
      title: title!,
      url: sourceUrl,
      category: str(node["recipeCategory"]),
      cuisineRaw: jsonLdCuisine,
      rawIngredients,
    });
    return inf.cuisine
      ? { cuisine: inf.cuisine, cuisineSource: "inferred", cuisineConfidence: inf.confidence }
      : { cuisine: null, cuisineSource: "unresolved", cuisineConfidence: inf.confidence };
  }

  return {
    sourceId: source.id,
    sourceUrl,
    title,
    ...resolveCuisine(),
    cuisineRaw: jsonLdCuisine,
    category: str(node["recipeCategory"]),
    author: authorOf(node["author"], people),
    datePublished: str(node["datePublished"]),
    // Thumbnail use only, with attribution (DECISIONS §6).
    imageUrl: str(node["image"]),
    ratingValue: rating ? num(rating["ratingValue"]) : null,
    ratingCount: rating ? num(rating["ratingCount"]) : null,
    recipeYield: str(node["recipeYield"]),
    rawIngredients,
  };
}

/**
 * Build a RawRecipe from a bespoke HTML extractor rather than JSON-LD.
 *
 * Same shape, same policy: no instructions, no description, ingredient strings
 * verbatim. Sources without schema.org markup have no cuisine field at all, so
 * cuisine falls to the source (or inference, for multi-cuisine sources).
 */
export function fromExtracted(
  e: { title: string; rawIngredients: string[]; canonicalPairs: Array<{ raw: string; slug: string }>; imageUrl: string | null },
  source: Source,
  sourceUrl: string,
): RawRecipe | null {
  if (!e.title || e.rawIngredients.length === 0) return null;
  const base = {
    cuisine: source.cuisine,
    cuisineSource: "domain" as const,
    cuisineConfidence: null,
  };
  const resolved = source.multiCuisine
    ? (() => {
        const inf = inferCuisine({ title: e.title, url: sourceUrl, rawIngredients: e.rawIngredients });
        return inf.cuisine
          ? { cuisine: inf.cuisine, cuisineSource: "inferred" as const, cuisineConfidence: inf.confidence }
          : { cuisine: null, cuisineSource: "unresolved" as const, cuisineConfidence: inf.confidence };
      })()
    : base;

  return {
    sourceId: source.id,
    sourceUrl,
    title: e.title,
    ...resolved,
    cuisineRaw: null,
    category: null,
    author: source.name,
    datePublished: null,
    imageUrl: e.imageUrl,
    ratingValue: null,
    ratingCount: null,
    recipeYield: null,
    rawIngredients: e.rawIngredients,
    canonicalPairs: e.canonicalPairs,
  };
}

/**
 * Minimum ingredient count.
 *
 * Verified need: `/how-to-break-down-a-chicken/` publishes a valid Recipe card
 * with a single ingredient. Technique posts carry recipe markup, so a Recipe
 * node alone is not evidence of a recipe (DECISIONS §6).
 */
export const MIN_INGREDIENTS = 3;

export const isUsable = (r: RawRecipe): boolean =>
  r.rawIngredients.length >= MIN_INGREDIENTS;
