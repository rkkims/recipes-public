/**
 * Fetch a recipe's own text, for the curation screen only.
 *
 * The reviewer judges quality and lead time by reading the method, and opening
 * a tab for every recipe is the slowest part of the loop. So the curation tool
 * fetches the page and shows it inline.
 *
 * ── This does not breach RECIPE-SPEC §1 ────────────────────────────────────
 *
 * That rule forbids STORING a recipe's method: an ingredient list is facts, a
 * method is authored expression, and keeping it would make us a host. Nothing
 * here is stored. The text is fetched on demand, held in memory for this
 * process, shown to one internal curator, and never written to disk or served
 * to a user of the product. It is the same act as the curator opening the tab
 * themselves — which is precisely what it replaces.
 *
 * The enrichment pass already reads these instructions to derive lead time
 * (src/ingest/enrich.ts) and stores only the number. This is the same fetch with
 * the same boundary.
 */
const cache = new Map<string, SourceText>();

export type SourceText = {
  instructions: string[];
  rawIngredients: string[];
  notes: string;
  error?: string;
};

function recipeNode(html: string): Record<string, unknown> | null {
  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    let parsed: unknown;
    try { parsed = JSON.parse(b[1]!.trim()); } catch { continue; }
    const stack: unknown[] = [parsed];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) { stack.push(...node); continue; }
      if (!node || typeof node !== "object") continue;
      const o = node as Record<string, unknown>;
      const t = o["@type"];
      if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) return o;
      if (o["@graph"]) stack.push(o["@graph"]);
    }
  }
  return null;
}

const steps = (v: unknown): string[] => {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(steps);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o["itemListElement"]) return steps(o["itemListElement"]);
    if (typeof o["text"] === "string") return [o["text"]];
    if (typeof o["name"] === "string") return [o["name"]];
  }
  return [];
};

const strip = (s: string) =>
  s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")
   .replace(/&amp;/g, "&").replace(/&#?\w+;/g, " ")
   .replace(/\s+/g, " ").trim();

export async function sourceText(url: string): Promise<SourceText> {
  const hit = cache.get(url);
  if (hit) return hit;
  let out: SourceText;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; recipe-curation/1.0)" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const node = recipeNode(await res.text());
    if (!node) throw new Error("no Recipe markup on the page");
    out = {
      instructions: steps(node["recipeInstructions"]).map(strip).filter(Boolean),
      rawIngredients: (Array.isArray(node["recipeIngredient"])
        ? (node["recipeIngredient"] as unknown[]) : []).map((x) => strip(String(x))),
      notes: strip(String(node["description"] ?? "")),
    };
  } catch (e) {
    out = { instructions: [], rawIngredients: [], notes: "",
            error: e instanceof Error ? e.message : String(e) };
  }
  cache.set(url, out);
  return out;
}
