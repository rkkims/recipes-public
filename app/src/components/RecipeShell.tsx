"use client";

/**
 * A recipe page drawn in the browser — the static site's answer for every
 * recipe that has no prerendered file (2026-11-06).
 *
 * The export prerenders KEPT recipes only; the bundle ships every recipe not
 * dropped. `deploy/cloudflare/site-worker.ts` redirects any `/recipe/<id>`
 * with no file to `/recipe-shell?id=<id>`, and this reads the id from there,
 * finds the row in the bundle and works out on the device the five facts
 * `recipeProps` works out on the server for a prerendered page:
 *
 *   - the relation edges around the recipe (`recipeClosure`, the same code)
 *   - the ingredients' names and diet facts, from the bundle's ontology
 *   - the mains: the curated ones, else the two rarest non-staples by corpus
 *     frequency — `lib/mains`' rule over the same corpus
 *   - the shop links: the bundle already carries `buy_url` on the nodes worth
 *     a link, decided at build
 *   - the creator byline, for a recipe whose creator has a page
 *
 * No Open Graph card: a shell has one `<head>` for every recipe. Accepted —
 * this is a personal sandbox, not a page anyone shares.
 */
import { useEffect, useState, type ComponentProps } from "react";
import { RecipeLive, type RecipeNode } from "./RecipeLive";
import { load, type ClientData } from "@/lib/client-data";
import { loadCreators, type ClientCreator } from "@/lib/client-creators";
import { recipeClosure } from "@/lib/recipe-closure";
import type { Recipe } from "@/lib/match";

type LiveProps = ComponentProps<typeof RecipeLive>;
type ShellProps = Pick<LiveProps, "stapleIds" | "meals" | "showPlanButton" | "search" | "onParse">;
type Drawn = Pick<LiveProps, "edges" | "nodes" | "mains" | "buyUrls" | "components" |
  "usedIn" | "creatorHref" | "payoffCreatorHrefs"> & { recipe: Recipe };

/** The `?id=` the Worker's redirect carries, or null. */
export function recipeIdFrom(search: string): string | null {
  return new URLSearchParams(search).get("id") || null;
}

/* `lib/mains`' corpus frequency, once per page lifetime. */
let frequency: Map<string, number> | null = null;

function mainsOf(recipe: Recipe, recipes: Recipe[], staples: Set<string>): string[] {
  if (recipe.mainIngredients?.length) return recipe.mainIngredients;
  if (!frequency) {
    frequency = new Map();
    for (const r of recipes)
      for (const id of new Set(r.requires)) frequency.set(id, (frequency.get(id) ?? 0) + 1);
  }
  const f = frequency;
  return [...new Set(recipe.requires)]
    .filter((id) => !staples.has(id))
    .sort((a, b) => (f.get(a) ?? 0) - (f.get(b) ?? 0) || a.localeCompare(b))
    .slice(0, 2);
}

function draw(data: ClientData, creators: ClientCreator[], recipe: Recipe,
              stapleIds: string[]): Drawn {
  const { reach, edges } = recipeClosure(recipe, data.edges);
  const nodes: RecipeNode[] = [...reach].map((id) => {
    const i = data.byId.get(id);
    return {
      id, name: i?.name ?? id,
      ...(i?.allergens?.length ? { allergens: i.allergens } : {}),
      ...(i?.animal_source ? { animal_source: i.animal_source } : {}),
    };
  });
  const buyUrls: Record<string, string> = {};
  for (const id of reach) {
    const i = data.byId.get(id);
    if (i?.buy_url) buyUrls[i.name] = i.buy_url;
  }

  const byId = new Map(data.recipes.map((r) => [r.id, r]));
  const card = (r: Recipe) => ({ id: r.id, title: r.title, href: `/recipe/${r.id}`,
                                 ...(r.image ? { image: r.image } : {}) });
  const components = (recipe.components ?? [])
    .map((id) => byId.get(id)).filter((r): r is Recipe => !!r).map(card);
  const usedIn = data.recipes.filter((r) => r.components?.includes(recipe.id)).map(card);

  const payoffCreatorHrefs: Record<string, string> = {};
  for (const c of creators)
    for (const rid of c.recipe_ids) payoffCreatorHrefs[rid] = `/creators/${c.handle}`;
  const creatorHref = payoffCreatorHrefs[recipe.id];

  return {
    recipe, edges, nodes, buyUrls,
    mains: mainsOf(recipe, data.recipes, new Set(stapleIds)),
    ...(components.length ? { components } : {}),
    ...(usedIn.length ? { usedIn } : {}),
    ...(creatorHref ? { creatorHref } : {}),
    payoffCreatorHrefs,
  };
}

export function RecipeShell({ stapleIds, ...live }: ShellProps) {
  const [state, setState] = useState<"loading" | "missing" | "failed" | Drawn>("loading");

  useEffect(() => {
    const id = recipeIdFrom(window.location.search);
    if (!id) { setState("missing"); return; }
    let live = true;
    Promise.all([load(), loadCreators()])
      .then(([data, creators]) => {
        if (!live) return;
        const recipe = data.recipes.find((r) => r.id === id);
        if (!recipe) { setState("missing"); return; }
        document.title = `${recipe.title} · JipBap`;
        setState(draw(data, creators, recipe, stapleIds));
      })
      .catch(() => { if (live) setState("failed"); });
    return () => { live = false; };
  }, [stapleIds]);

  if (state === "loading") return <p className="empty">Loading recipe…</p>;
  if (state === "missing") return <p className="empty">Recipe not found. <a href="/">Back to the grid</a></p>;
  if (state === "failed") return <p className="empty">Couldn&apos;t load the recipe. Check your connection and reload.</p>;
  return <RecipeLive {...state} {...live} stapleIds={stapleIds} starterIds={stapleIds}
                     linkStyle="page" />;
}
