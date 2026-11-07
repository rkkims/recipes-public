/**
 * schema.org/Recipe extraction from JSON-LD. Deterministic — no model call
 * (DECISIONS §6).
 *
 * Real pages put the Recipe inside an `@graph` alongside Article, WebPage,
 * BreadcrumbList, Organization and Person nodes, so this walks the whole
 * structure rather than checking the top level.
 */
export type JsonLdNode = Record<string, unknown>;

export function extractJsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    const raw = decodeEntities(m[1]!.trim());
    try {
      out.push(JSON.parse(raw));
    } catch {
      // Some sites emit trailing commas or stray newlines inside strings.
      try {
        out.push(JSON.parse(raw.replace(/,\s*([}\]])/g, "$1")));
      } catch {
        /* unparseable block — skip, it's never the only one that matters */
      }
    }
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

const typesOf = (node: JsonLdNode): string[] => {
  const t = node["@type"];
  if (typeof t === "string") return [t];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string");
  return [];
};

/** Every node typed `Recipe`, in traversal order. */
function allRecipeNodes(html: string): JsonLdNode[] {
  const found: JsonLdNode[] = [];
  const stack: unknown[] = extractJsonLdBlocks(html);
  while (stack.length) {
    const node = stack.pop();
    if (Array.isArray(node)) {
      stack.push(...node);
    } else if (node && typeof node === "object") {
      const obj = node as JsonLdNode;
      if (typesOf(obj).includes("Recipe")) found.push(obj);
      stack.push(...Object.values(obj));
    }
  }
  return found;
}

/**
 * Every `Person` the page declares, keyed by `@id` — CREATOR-SPEC §3's fix.
 *
 * Ten of fifteen sources emit `author: {"@id": "https://site/#/schema/person/<hash>"}`
 * on the Recipe node, with the actual name sitting on a `Person` node elsewhere
 * in the same `@graph`. Flattening the reference (which is what a generic
 * string-coercion does) stores the hash as the author, and 2,511 of 4,874 raw
 * rows carry exactly that. The name was on the page all along; this is the
 * lookup that follows the reference to it.
 */
export function personNames(html: string): Map<string, string> {
  const out = new Map<string, string>();
  const stack: unknown[] = extractJsonLdBlocks(html);
  while (stack.length) {
    const node = stack.pop();
    if (Array.isArray(node)) {
      stack.push(...node);
    } else if (node && typeof node === "object") {
      const obj = node as JsonLdNode;
      if (typesOf(obj).includes("Person")) {
        const id = obj["@id"], name = obj["name"];
        if (typeof id === "string" && typeof name === "string" && name.trim())
          out.set(id, name.trim());
      }
      stack.push(...Object.values(obj));
    }
  }
  return out;
}

const idOf = (n: JsonLdNode): string =>
  [n["@id"], n["url"], (n["mainEntityOfPage"] as JsonLdNode | undefined)?.["@id"],
   n["mainEntityOfPage"]]
    .filter((v): v is string => typeof v === "string").join(" ");

/** Normalised path for comparing a node's declared URL against the page's. */
const pathOf = (u: string): string => {
  try { return new URL(u).pathname.replace(/\/+$/, "").toLowerCase(); }
  catch { return u.replace(/^https?:\/\/[^/]+/, "").split("#")[0]!.replace(/\/+$/, "").toLowerCase(); }
};

/**
 * The `Recipe` node belonging to THIS page.
 *
 * A page can embed several Recipe nodes — a "popular recipes" widget, a related
 * card, a site-wide featured recipe. Returning the first one found is silently
 * catastrophic: on seonkyounglongest.com it produced **611 recipes that all
 * shared one identical Thai noodle ingredient list**, which passed every
 * downstream check (valid JSON-LD, >3 ingredients, plausible strings) and
 * corrupted the ingredient frequency distribution that sets the ontology scope.
 *
 * So: prefer the node whose @id / url / mainEntityOfPage matches the page URL.
 * Fall back to the first only when nothing declares a URL at all.
 */
export function findRecipeNode(html: string, pageUrl?: string): JsonLdNode | null {
  const nodes = allRecipeNodes(html);
  if (nodes.length <= 1) return nodes[0] ?? null;

  if (pageUrl) {
    const want = pathOf(pageUrl);
    const match = nodes.find((n) => {
      const id = idOf(n);
      return id && id.split(" ").some((u) => pathOf(u) === want);
    });
    if (match) return match;
  }
  // No node declares a URL — the seonkyounglongest.com case, where every page
  // embeds a 10-recipe "popular recipes" carousel with no @id on any node, and
  // the page's OWN recipe is last in traversal order. Fall back to matching the
  // recipe name against the URL slug, which is the only remaining signal.
  const best = bySlug(nodes, pageUrl);
  if (best) return best;

  // Still ambiguous. Reject rather than guess: a carousel entry looks perfectly
  // valid downstream (real name, real ingredients) and silently duplicates
  // across every page that embeds it. Losing a recipe is cheap; 611 copies of
  // one Thai noodle recipe corrupted the whole frequency distribution.
  return null;
}

/** Slug words that carry no identity — common in titles and URLs alike. */
const SLUG_STOP = new Set([
  "recipe", "recipes", "easy", "best", "quick", "simple", "how", "to", "make",
  "the", "a", "of", "and", "with", "authentic", "homemade", "minute", "style",
]);

const tokens = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !SLUG_STOP.has(t));

/**
 * Pick the Recipe whose name best covers the URL slug.
 *
 * `/kimchi-fried-rice/` → {kimchi, fried, rice}. "Beef Short Rib Kimchi Fried
 * Rice & Soft Boiled Eggs" covers 3/3; "Easy Egg Fried Rice" covers 2/3. The
 * winner must be unambiguous, so a tie returns nothing.
 */
function bySlug(nodes: JsonLdNode[], pageUrl?: string): JsonLdNode | null {
  if (!pageUrl) return null;
  const want = tokens(pathOf(pageUrl).split("/").pop() ?? "");
  if (want.length === 0) return null;

  const scored = nodes
    .map((n) => {
      const name = new Set(tokens(String(n["name"] ?? "")));
      return { n, score: want.filter((t) => name.has(t)).length / want.length };
    })
    .sort((a, b) => b.score - a.score);

  const top = scored[0];
  const second = scored[1];
  if (!top || top.score < 0.6) return null;
  if (second && second.score === top.score) return null; // ambiguous
  return top.n;
}
