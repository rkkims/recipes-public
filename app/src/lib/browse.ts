/**
 * The kitchen, as a list to tick — the other way of filling a pantry.
 *
 * ── Two different jobs wearing one control ────────────────────────────────
 *
 * The add box is autosuggest-first, and it is the right shape for *"I just
 * bought gochujang"*: you know the word, you type three letters, you are done.
 *
 * It is the wrong shape for the other job — sitting down once and telling us
 * what is actually in the cupboards. There you do not know what to type,
 * because you do not know what we know: whether we have "perilla leaf", whether
 * "soy sauce" is one thing or three, whether it is worth mentioning salt. A box
 * that answers only what you can already name cannot help you inventory a
 * kitchen, and the first session is exactly when a pantry is emptiest and the
 * product least useful (DECISIONS §3 — the starter list exists for the same
 * reason, and stops at twelve).
 *
 * So: a browsable grid, grouped the way the pantry and the list already group,
 * where you scan and tick. It goes in the FULL-screen pantry mode, which `Shell`
 * describes as "sitting down and sorting the pantry out properly" — the session
 * this is for, and the only one with room for it.
 *
 * ── What is in it, and why not everything ─────────────────────────────────
 *
 * The vocabulary is ~2,900 nodes. A grid of all of them is a worse search box.
 * So it is the most-used ingredients per aisle, by how many recipes actually
 * want them — which is a claim about the corpus, and the honest ordering for a
 * tool whose only purpose is unlocking recipes in that corpus.
 *
 * Frequency ranks WITHIN an aisle and never across: `aisleRank` decides the
 * order of the sections, so the grid walks a kitchen in the same order the
 * grocery list walks a shop. Two orderings for one vocabulary is how they drift.
 *
 * Deliberately NOT filtered to what you lack. A grid that hides what you have
 * cannot be used to correct a mistake, and "did I tell them about the rice?" is
 * the question this screen exists to answer.
 */
import { load } from "./data";
import { aisleOf, aisleRank, OTHER_AISLE } from "./aisle";

export type BrowseItem = { id: string; name: string; recipes: number };
export type BrowseAisle = { aisle: string; items: BrowseItem[] };

/**
 * How many per aisle.
 *
 * Enough that the common case is there, few enough that the section is a shape
 * the eye takes in rather than a page to read. Produce alone would run to
 * hundreds and the tail is single-recipe curiosities — the thing the add box
 * is for.
 */
const PER_AISLE = 30;

/** Nothing worth ticking appears in one recipe. */
const MIN_RECIPES = 3;

export function browseAisles(): BrowseAisle[] {
  const { ingredients, recipeCount } = load();

  const groups = new Map<string, BrowseItem[]>();
  for (const i of ingredients) {
    const n = recipeCount.get(i.id) ?? 0;
    if (n < MIN_RECIPES) continue;
    /* Unplaced kinds go to one group at the end rather than being dropped —
       the same rule the list follows. They are still real ingredients. */
    const key = aisleOf(i.kind) ?? OTHER_AISLE;
    const at = groups.get(key);
    const row = { id: i.id, name: i.name, recipes: n };
    if (at) at.push(row); else groups.set(key, [row]);
  }

  return [...groups.entries()]
    .map(([aisle, items]) => ({
      aisle,
      /* Most-wanted first within the aisle, then alphabetical so the tail has a
         stable order rather than whatever the ontology file happened to hold. */
      items: items
        .sort((a, b) => b.recipes - a.recipes || a.name.localeCompare(b.name))
        .slice(0, PER_AISLE)
        /* Then alphabetical for DISPLAY: frequency chose the members, and a
           grid you are scanning for a word is one you read alphabetically. */
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) =>
      aisleRank(a.aisle === OTHER_AISLE ? null : a.aisle) -
      aisleRank(b.aisle === OTHER_AISLE ? null : b.aisle) ||
      a.aisle.localeCompare(b.aisle));
}
