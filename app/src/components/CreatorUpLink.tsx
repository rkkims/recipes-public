/**
 * The way back up to a creator's shelf, and the claimant's controls beside it.
 *
 * Lifted out of `recipe/[id]/page.tsx` unchanged — same reads, same two inline
 * server actions, same markup. It moved for one reason: those two actions make
 * the recipe page uncompilable in static mode, because Next refuses an export
 * when a single server action exists anywhere in the build, whether or not an
 * exported page could reach it. With the block in its own module,
 * `next.config.mjs` can swap the module (see `lib/CreatorUpLink-static.tsx`),
 * which is the same mechanism `@/app/actions` already uses.
 *
 * CREATOR-SPEC §4: the claimant's own door is visible only to the person the
 * claim belongs to, and only on crawled rows — a `rec_c…` recipe is already
 * their word and is edited from the add page.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { load } from "@/lib/data";
import { claimOf, setHidden } from "@/lib/claims";
import { removeCreatorRecipe } from "@/lib/creator-recipes";
import { currentUser } from "@/lib/owner";
import { RemoveRecipeButton } from "./RemoveRecipeButton";
import type { creatorOfRecipe } from "@/lib/creators";

export type UpLinkRecipe = { id: string; confirmed?: boolean };
export type UpLinkCreator = NonNullable<ReturnType<typeof creatorOfRecipe>>;

export async function CreatorUpLink(
  { recipe, creator: c }: { recipe: UpLinkRecipe; creator: UpLinkCreator | null | undefined },
) {
  if (!c) return null;
  const u = await currentUser();
  const cl = claimOf(c.id);
  const mine = !!u && !!cl && cl.user_id === u.id;
  const crawled = load().recipes.some((r) => r.id === recipe.id);
  const hiddenNow = !!cl?.hidden?.includes(recipe.id);

  // The claimant's shelf controls, on the page where they look at one
  // dish — hide is a toggle on crawled rows, their own rows edit on the
  // add page (same-URL save is the edit) or leave entirely.
  async function toggleHidden() {
    "use server";
    const user = await currentUser();
    const claim = claimOf(c!.id);
    if (!user || !claim || claim.user_id !== user.id) return;
    setHidden(c!.id, user.id, recipe!.id, !claim.hidden?.includes(recipe!.id));
    revalidatePath("/recipe/[id]", "page");
    revalidatePath(`/creators/${c!.handle}`, "layout");
  }
  async function removeOwn() {
    "use server";
    const user = await currentUser();
    const claim = claimOf(c!.id);
    if (!user || !claim || claim.user_id !== user.id) return;
    removeCreatorRecipe(c!.id, recipe!.id);
    revalidatePath(`/creators/${c!.handle}`, "layout");
    redirect(`/creators/${c!.handle}`);
  }

  return (
    <p className="note creator-up">
      <Link href={`/creators/${c.handle}`}>← View {c.displayName}&apos;s recipes</Link>
      {mine && crawled && (
        <>
          {" · "}
          <Link href={`/creators/${c.handle}/confirm/${recipe.id}`}>
            {recipe.confirmed ? "Edit your confirmed list" : "Fix the ingredient list"}
          </Link>
          {" · "}
          <form action={toggleHidden} style={{ display: "inline" }}>
            <button type="submit" className="linklike">
              {hiddenNow ? "Show on your page" : "Hide from your page"}
            </button>
          </form>
          {hiddenNow && <span className="creator-hidden-note"> · hidden from visitors</span>}
        </>
      )}
      {mine && !crawled && (
        <>
          {" · "}
          <Link href={`/creators/${c.handle}/add?edit=${recipe.id}`}>Edit this recipe</Link>
          {" · "}
          <RemoveRecipeButton onRemove={removeOwn} />
        </>
      )}
    </p>
  );
}
