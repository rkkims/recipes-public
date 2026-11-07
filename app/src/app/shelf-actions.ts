"use server";

/**
 * The four reads a converted surface still asks the server for.
 *
 * Every one of them was declared inline in a page — the same `searchAction`
 * copied into four files, plus two shapes of offer lookup and the calendar's
 * recipe search. They are gathered here for one reason: STATIC-SPEC §1 needs a
 * single module to swap. An exported site cannot POST to a server action, so
 * static mode aliases this file to `lib/shelf-actions-static.ts`, which answers
 * the same four questions from the shipped bundle. Four inline copies would
 * have been four things to remember.
 *
 * Nothing here is new and nothing changed on the way in: same bodies, same
 * return shapes, same comments. In server mode this is a move, not an edit.
 *
 * They are READS, all four. Writes go through `app/actions.ts`, which the same
 * mechanism swaps for the device-only copy.
 */
import { nameOf, resolveId, search as searchIngredientsIndex } from "@/lib/data";
import { completions, searchAllRecipes } from "@/lib/recipes";
import { getOwner } from "@/lib/store";
import { ownerId } from "@/lib/owner";
import { hardToFind } from "@/lib/findability";
import { weeeProductImage, weeeProductsFor, weeeUrlFor } from "@/lib/weee";

/**
 * The autosuggest's vocabulary — the whole ontology, not the shipped shelf.
 *
 * Ranked by corpus usage (`lib/data`'s `search`), which is why it is a server
 * read at all: the bundle carries the curated closure, and the drawer's box
 * offers words from beyond it.
 */
export async function searchIngredients(q: string) {
  return searchIngredientsIndex(q).map((i) => ({
    id: i.id, name: i.name, recipes: i.recipes, via: i.via, children: i.children,
  }));
}

/**
 * Complete the WORD being typed — UX-SPEC §4j. The grid shows the recipes.
 *
 * It answers with words rather than recipes because the gallery below is
 * already the place a recipe is drawn, with tabs, distance, saved marks and
 * cook counts that a search result list had none of. See `FindRecipe`.
 *
 * The owner is passed so the counts include the user's own recipes — a word
 * that only reaches a recipe they added themselves is still a word that works.
 */
export async function completeSearch(q: string) {
  return completions(getOwner(await ownerId()), q);
}

/**
 * The Almost-there shelf's offers, asked for once the rows are known.
 *
 * A read, not a write, and a server one because the Weee tables are CSV on
 * disk. It is fetched rather than shipped because of the arithmetic: 254 of
 * the bundle's 1,165 nodes carry products, which is 89 KB of catalogue sent to
 * answer a question about the eight ingredients this kitchen happens to be
 * short of. Eight ids go up, at most eight rows come back, and the row draws
 * its recipes meanwhile — the offer is the last thing to arrive and the least
 * urgent, which is also the right order for an advertisement.
 *
 * Capped, because the argument stops holding at scale and the input comes
 * from a client.
 */
export async function offersForBlocking(ingredientIds: string[]) {
  const out: Record<string, { url: string;
    products: Array<{ id: string; title: string; url: string; image?: string }> }> = {};
  for (const id of ingredientIds.slice(0, 12)) {
    const name = nameOf(resolveId(id));
    const products = weeeProductsFor(name, 4);
    if (products.length === 0) continue;
    const url = weeeUrlFor(name);
    if (!url) continue;
    out[id] = {
      url,
      /* Cached thumbnails when the offline fetch has run; a missing image
         degrades to the title, never blocks the offer. */
      products: products.map((p) => {
        const image = weeeProductImage(p.id);
        return { ...p, ...(image ? { image } : {}) };
      }),
    };
  }
  return out;
}

/**
 * The buy links for whatever is on the list right now — §4h, asked not shipped.
 *
 * `PantryDrawer` computed this inline while it had the owner in hand. The rows
 * live on the device now, so the question arrives from there: these names, are
 * any of them hard to find, and what does the shop have. One round trip for the
 * handful of things on a list, rather than 89 KB of catalogue for a vocabulary
 * of a thousand.
 *
 * `kind` is passed and used: without it the veto never fires and this offered
 * to deliver onions — 34 nodes' worth, garlic and scallion among them
 * (RETAILER-SPEC §4, step 2).
 */
export async function offersForListRows(rows: Array<{ name: string; kind?: string }>) {
  const out: Record<string, {
    url: string;
    products: Array<{ id: string; title: string; url: string; image?: string }>;
  }> = {};
  for (const { name, kind } of rows) {
    if (!hardToFind(name, kind)) continue;
    const url = weeeUrlFor(name);
    if (!url) continue;
    out[name] = {
      url,
      /* Cached thumbnails when the offline fetch has run —
         CREATORS-TAB-SPEC §7; absent renders title-only. */
      products: weeeProductsFor(name).map((p) => {
        const image = weeeProductImage(p.id);
        return { ...p, ...(image ? { image } : {}) };
      }),
    };
  }
  return out;
}

/**
 * Recipe search for the calendar's "+", UNSCORED.
 *
 * It used to read the owner and return each hit's distance from the pantry.
 * The distance is still the point — planning Thursday is a decision about
 * shopping as much as about appetite — but the pantry is on the device now, so
 * the two halves of the answer come from where each one lives: the server says
 * which recipes the word names, and `CalendarLive` scores them and folds in the
 * user's own. Twelve `scoreRecipe` calls on a device is nothing; searching the
 * corpus there would mean shipping it.
 *
 * Exclusions are applied on the device for the same reason (USER-SPEC §6 calls
 * them a standing instruction, and a standing instruction that lapses when the
 * request leaves the browser is not standing). `requires` travels so the
 * scoring has something to score.
 */
export async function searchRecipes(q: string) {
  return searchAllRecipes(null, q).map((r) => ({
    id: r.id, title: r.title, source: r.source, requires: r.requires,
    ...(r.image ? { image: r.image } : {}),
  }));
}
