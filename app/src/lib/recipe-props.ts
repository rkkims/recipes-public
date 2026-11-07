/**
 * What a recipe surface hands to the device — the server half of `RecipeLive`.
 *
 * Slice C moved every owner-derived part of the recipe view to the browser
 * (STATIC-SPEC §2), which left four facts that are about the RECIPE rather than
 * the kitchen and that the device cannot look up for itself:
 *
 *   - the relation edges around this recipe's ingredients, so matching answers
 *     the same way the server used to. The shipped bundle carries only the
 *     closure the CURATED shelf reaches (§3); a corpus recipe curation has not
 *     kept can name ingredients that closure has never heard of, and matching
 *     those against a pruned graph would say "you need this" about something
 *     the pantry covers through a relation
 *   - the ingredients' names and diet facts, for the same reason
 *   - `mainsOf`, which falls back to corpus FREQUENCY and therefore to the
 *     whole recipe index (RECIPE-SPEC §4c)
 *   - the shop links, which are a CSV of the retailer's catalogue
 *
 * All four are static per deploy. None is per owner. Gathered in one place
 * because four surfaces need exactly the same set and a fifth will.
 */
import { load, nameOf } from "./data";
import { buyUrlForRecipe } from "./buy";
import { mainsOf } from "./mains";
import { starterList } from "./starter";
import { recipeClosure } from "./recipe-closure";
import type { Recipe } from "./match";
import type { RecipeNode } from "@/components/RecipeLive";

export type RecipeProps = {
  edges: { is_a: string[][]; derives_from: string[][] };
  nodes: RecipeNode[];
  mains: string[];
  stapleIds: string[];
  buyUrls: Record<string, string>;
};

export function recipeProps(recipe: Recipe): RecipeProps {
  const { edges, byId } = load();

  const { reach, edges: around } = recipeClosure(recipe, edges);

  const buyUrlFor = buyUrlForRecipe(recipe.id);
  const nodes: RecipeNode[] = [...reach].map((id) => {
    const i = byId.get(id);
    return {
      id, name: i?.name ?? nameOf(id),
      ...(i?.allergens?.length ? { allergens: i.allergens } : {}),
      ...(i?.animal_source ? { animal_source: i.animal_source } : {}),
    };
  });

  /* Links for every ingredient, not just the missing ones: which are missing
     is the device's answer and changes on a tap. A dozen lookups against a
     catalogue already in memory is cheaper than a second round trip. */
  const buyUrls: Record<string, string> = {};
  for (const n of nodes) {
    const url = buyUrlFor(n.name);
    if (url) buyUrls[n.name] = url;
  }

  return {
    edges: around,
    nodes,
    mains: mainsOf(recipe),
    stapleIds: starterList().map((s) => s.id),
    buyUrls,
  };
}
