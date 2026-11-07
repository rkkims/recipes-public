/**
 * The relation edges around one recipe — the pure half of `recipeProps`.
 *
 * Shared by the server (`lib/recipe-props`) and the device (`RecipeShell`), so
 * a recipe drawn in the browser matches exactly as a prerendered one does.
 * No node imports: it takes the edges, it does not load them.
 *
 * The closure, not one hop. `satisfies` walks up and down these edges, so an
 * ingredient two steps from one the recipe names is still part of the
 * answer. Iterating a Set while adding to it IS the breadth-first walk, and a
 * cycle terminates because a member is only added once.
 */
import type { Recipe } from "./match";

export type Edges = { is_a: string[][]; derives_from: string[][] };

export function recipeClosure(
  recipe: Pick<Recipe, "requires" | "optional" | "alternates">,
  edges: Edges,
): { reach: Set<string>; edges: Edges } {
  const reach = new Set<string>([...recipe.requires, ...(recipe.optional ?? [])]);
  for (const alts of Object.values(recipe.alternates ?? {}))
    for (const one of alts) for (const id of one) reach.add(id);
  const all = [...edges.is_a, ...edges.derives_from];
  let grew = true;
  while (grew) {
    grew = false;
    for (const [a, b] of all) {
      if (!a || !b) continue;
      if (reach.has(a) && !reach.has(b)) { reach.add(b); grew = true; }
      if (reach.has(b) && !reach.has(a)) { reach.add(a); grew = true; }
    }
  }
  const within = (e: string[]) => !!e[0] && !!e[1] && reach.has(e[0]) && reach.has(e[1]);
  return {
    reach,
    edges: { is_a: edges.is_a.filter(within), derives_from: edges.derives_from.filter(within) },
  };
}
