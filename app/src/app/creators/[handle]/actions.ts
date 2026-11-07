"use server";

import { revalidatePath } from "next/cache";
import { creatorByHandle, recipesOf } from "@/lib/creators";
import { removeCollection, saveCollection } from "@/lib/claims";
import { currentUser } from "@/lib/owner";
import { servable } from "@/lib/recipes";

/**
 * Title suggestions, scoped to THIS creator's shelf — the search bar's
 * autosuggest. Case folds on both sides; matches lead with title-prefix hits
 * because that is what a person typing a remembered name expects to win.
 */
export async function suggestTitles(handle: string, q: string):
  Promise<Array<{ id: string; title: string }>> {
  const creator = creatorByHandle(handle);
  const term = q.trim().toLowerCase();
  if (!creator || term.length < 2) return [];
  const all = servable(recipesOf(creator.id));
  const starts = all.filter((r) => r.title.toLowerCase().startsWith(term));
  const contains = all.filter((r) =>
    !r.title.toLowerCase().startsWith(term) && r.title.toLowerCase().includes(term));
  return [...starts, ...contains].slice(0, 8).map((r) => ({ id: r.id, title: r.title }));
}

/** Claimant-only, like every claim write — the lib enforces it again. */
export async function saveCollectionAction(
  handle: string,
  col: { id?: string; title: string; description: string; recipe_ids: string[] },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "signed out" };
  const creator = creatorByHandle(handle);
  if (!creator) return { ok: false, error: "unknown creator" };
  const r = saveCollection(creator.id, user.id, col);
  if (r.ok) revalidatePath(`/creators/${handle}`, "layout");
  return r;
}

export async function removeCollectionAction(handle: string, id: string):
  Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "signed out" };
  const creator = creatorByHandle(handle);
  if (!creator) return { ok: false, error: "unknown creator" };
  if (!removeCollection(creator.id, user.id, id))
    return { ok: false, error: "only the claimant edits collections" };
  revalidatePath(`/creators/${handle}`, "layout");
  return { ok: true };
}
