"use server";

import { revalidatePath } from "next/cache";
import { creatorByHandle, creatorOfRecipe } from "@/lib/creators";
import { claimOf, setConfirmed } from "@/lib/claims";
import { currentUser } from "@/lib/owner";
import { search as searchIngredients } from "@/lib/data";

/** The claimant, or nothing — same gate as the add flow, same reason. */
async function claimant(handle: string) {
  const user = await currentUser();
  if (!user) return null;
  const creator = creatorByHandle(handle);
  if (!creator) return null;
  const claim = claimOf(creator.id);
  if (!claim || claim.user_id !== user.id) return null;
  return { user, creator };
}

/** The vocabulary, same as everywhere an ingredient is named — CREATOR-SPEC
    §5b: selecting an existing id, never minting one. */
export async function suggestIngredients(q: string): Promise<Array<{ id: string; name: string }>> {
  return searchIngredients(q, 8).map((h) => ({ id: h.id, name: h.name }));
}

export async function confirmIngredients(
  handle: string, recipeId: string,
  list: { requires: string[]; optional: string[] },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await claimant(handle);
  if (!gate) return { ok: false, error: "not your page" };
  // The recipe must be one of THEIRS — a claim on beyondkimchee must not be
  // able to rewrite a maangchi list, however valid the claim.
  if (creatorOfRecipe(recipeId)?.id !== gate.creator.id)
    return { ok: false, error: "not one of your recipes" };
  const res = setConfirmed(gate.creator.id, gate.user.id, recipeId, list);
  if (res.ok) {
    revalidatePath(`/creators/${handle}`, "layout");
    revalidatePath(`/recipe/${recipeId}`, "page");
  }
  return res;
}
