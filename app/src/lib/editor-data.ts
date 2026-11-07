/**
 * The ingredient editor's data, assembled once, used from two doors.
 *
 * Extracted from `/curate/ingredients/[id]` when the recipe page grew its
 * ingredient SHEET (QC-SPEC §4: ontology curation is modal over the recipe,
 * and the standalone page remains for arriving by address bar). Both doors
 * must show the same truth, so there is one assembly.
 */
import { idForName, load, nameOf, resolveId } from "@/lib/data";
import { surfacesOf } from "@/lib/lines";
import { allLineFixes } from "@/lib/line-fixes";
import { pendingFor } from "@/lib/ontology-edits";
import type { EditorData } from "@/components/IngredientEditor";

export type { EditorData };

export function editorDataFor(idOrName: string): EditorData | null {
  const raw = idOrName.trim();
  const id = raw.startsWith("ing_") ? resolveId(raw) : (idForName(raw) ?? raw);
  const { byId, edges, allRecipes: recipes } = load();
  const ing = byId.get(id);
  if (!ing) return null;

  const rel = (pairs: string[][], pick: 0 | 1, relation: "is_a" | "derives_from") =>
    pairs.filter((e) => e[pick === 0 ? 1 : 0] === id)
      .map((e) => ({ id: e[pick]!, name: nameOf(e[pick]!), relation }));

  const used = recipes.filter((r) =>
    r.requires.includes(id) || (r.optional ?? []).includes(id));

  const verb: Record<string, string> = {
    "alias-set": "alias", "alias-drop": "drop alias",
    "is_a-add": "add parent", "is_a-remove": "remove parent",
    "derives_from-add": "add source", "derives_from-remove": "remove source",
    "rename": "rename",
    "gloss": "gloss",
    "remove": "remove node",
  };
  const pending = pendingFor([ing.name, ...ing.aliases]).map((e) =>
    `${verb[e.kind] ?? e.kind}: ${e.subject}${e.object ? ` → ${e.object}` : ""}`);

  return {
    id,
    name: ing.name,
    ...(ing.gloss ? { gloss: ing.gloss } : {}),
    mentions: ing.mentions,
    ...(ing.kind ? { kind: ing.kind } : {}),
    aliases: ing.aliases,
    parents: [...rel(edges.is_a, 1, "is_a"), ...rel(edges.derives_from, 1, "derives_from")],
    children: [...rel(edges.is_a, 0, "is_a"), ...rel(edges.derives_from, 0, "derives_from")],
    recipes: used.slice(0, 40).map((r) => ({ id: r.id, title: r.title, source: r.source })),
    /* The verbatim lines this node came from — the parse side of the link the
       curator walks. A node whose only surface reads like a sentence is a
       parse artifact, and this is where that becomes visible. */
    surfaces: (() => {
      const fixes = allLineFixes();
      return surfacesOf(id).map((sf) => ({
        ...sf,
        ...(fixes.has(`${sf.recipeId} ${sf.raw}`)
          ? { fixedTo: fixes.get(`${sf.recipeId} ${sf.raw}`) } : {}),
      }));
    })(),
    recipeCount: used.length,
    pending,
  };
}
