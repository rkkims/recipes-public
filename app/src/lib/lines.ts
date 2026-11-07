/**
 * Per-line ingredient detail, precomputed by `npm run recipe-index`.
 *
 * 6 MB, loaded only by the curation screen. The main product never reads it —
 * matching works on resolved node ids and does not care how a line was written.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export type Line = {
  raw: string; head: string; node: string | null; nodes: string[]; alts: string[];
  /** The recipe's own wording marks this optional — a garnish, an "if desired". */
  optional: boolean;
  /**
   * A site rule recognised this line as something other than an ingredient
   * (`src/ingest/site-rules.ts`). Equipment, a link to another recipe, a stray
   * line of method.
   *
   * Distinct from an unresolved line, and the curation screen must render it
   * differently: "we know this is a colander" is settled, "we could not read
   * this" is a question. Showing both as a warning is what had the reviewer
   * writing "not ingredient" on every kimchi recipe.
   */
  dropped?: "equipment" | "sub-recipe" | "instruction" | "yield" | "header";
  /** The LLM extraction overlay resolved this line (NORMALIZATION, "The LLM extraction overlay"). */
  llm?: boolean;
  /**
   * RESOLUTION-SPEC §1 — what this mention MEANS here, when a table row (or a
   * curator) knows: the sibling node id, with provenance. `soy sauce` written,
   * `gochugaru` meant. Absent on the common line no rule covers.
   */
  resolved?: string;
  resolution?: "curated" | "explicit" | "cuisine-default";
};

function find(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const c = resolve(dir, "data", "ontology", "recipe-lines.json");
    if (existsSync(c)) return c;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

let cache: Record<string, Line[]> | null = null;

export function linesFor(recipeId: string): Line[] {
  if (!cache) {
    const f = find();
    cache = f ? (JSON.parse(readFileSync(f, "utf8")) as Record<string, Line[]>) : {};
  }
  return cache[recipeId] ?? [];
}

/**
 * PROVENANCE — node id → the verbatim lines that produced it (curator's ask,
 * 2026-08-20: "properly parsed ingredient (verbatim in the recipe) —
 * internally resolved node", walkable in both directions). Built once from
 * the same lines file; each surface keeps one example recipe so the editor
 * can link straight back into the curation view.
 */
let provenance: Map<string, Map<string, { n: number; recipeId: string }>> | null = null;

export function surfacesOf(nodeId: string):
  Array<{ raw: string; n: number; recipeId: string }> {
  if (!provenance) {
    linesFor("");                         // ensure the cache is loaded
    provenance = new Map();
    for (const [rid, ls] of Object.entries(cache!)) {
      for (const l of ls) {
        if (l.dropped) continue;
        for (const id of (l.nodes?.length ? l.nodes : l.node ? [l.node] : [])) {
          const per = provenance.get(id) ?? new Map();
          const hit = per.get(l.raw);
          if (hit) hit.n++;
          else per.set(l.raw, { n: 1, recipeId: rid });
          provenance.set(id, per);
        }
      }
    }
  }
  return [...(provenance.get(nodeId) ?? new Map()).entries()]
    .map(([raw, v]) => ({ raw, n: v.n, recipeId: v.recipeId }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 14);
}
