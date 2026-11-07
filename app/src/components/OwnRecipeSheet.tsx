"use client";

/**
 * The modal for a recipe the user added themselves.
 *
 * Every other surface resolves the open recipe on the SERVER and hands the
 * static half down. A `rec_own_…` recipe has no server half to hand down: it
 * lives in `owner.own` on this device and nowhere else, and it must stay that
 * way — the pages that open modals are the same pages that mint Open Graph
 * cards, and generating share metadata for private content is how private
 * content gets shared.
 *
 * So the chrome waits for the device too. The title is the sheet's accessible
 * name and the browser's back-stop, so the modal cannot render before the store
 * has answered; a skeleton behind a modal nobody can name would be worse than a
 * beat of nothing.
 */

import { RecipeModal } from "./RecipeModal";
import { RecipeLive } from "./RecipeLive";
import { useOwner } from "@/lib/use-owner";

export function OwnRecipeSheet(props: {
  recipeId: string;
} & Omit<React.ComponentProps<typeof RecipeLive>, "recipe" | "ownId">) {
  const { recipeId, ...rest } = props;
  const { owner, ready } = useOwner();
  const own = ready ? (owner?.own ?? []).find((r) => r.id === recipeId) : undefined;
  if (!own) return null;

  return (
    <RecipeModal title={own.title}>
      <RecipeLive ownId={recipeId} {...rest} />
    </RecipeModal>
  );
}
