/**
 * Add one of your recipes — claimant only, reached from the title-row button.
 *
 * The pitch's five-minute promise as a page: link, title, ingredient chips
 * flipped between required and optional, save. Anyone who is not the claimant
 * is sent back to the page — the editor is not a secret, it is simply not
 * theirs (the collections editor makes the same move for the same reason).
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Page, Note, Section } from "@/components/primitives";
import { Nav } from "@/components/Nav";
import { creatorByHandle } from "@/lib/creators";
import { claimOf } from "@/lib/claims";
import { currentUser } from "@/lib/owner";
import { creatorRecipeById } from "@/lib/creator-recipes";
import { recipesOf } from "@/lib/creators";
import { nameOf } from "@/lib/data";
import { CreatorAddRecipe } from "@/components/CreatorAddRecipe";
import { lookupCreatorLink, saveCreatorRecipe, suggestIngredients, suggestOwnRecipes } from "./actions";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return { title: "Add a recipe · JipBap", robots: { index: false } };
}

export default async function AddRecipePage(
  { params, searchParams }: {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ edit?: string }>;
  },
) {
  const { handle } = await params;
  const { edit } = await searchParams;
  const creator = creatorByHandle(handle);
  if (!creator) notFound();
  const user = await currentUser();
  const claim = claimOf(creator.id);
  if (!user || !claim || claim.user_id !== user.id) redirect(`/creators/${handle}`);

  // ?edit= preloads one of THEIR rows — the save path is unchanged, because
  // saving the same URL already edits instead of duplicating. Editing is just
  // arriving with the form already full.
  const row = edit ? creatorRecipeById(edit) : undefined;
  const editing = row && row.creator_id === creator.id ? row : undefined;
  const initial = editing ? {
    url: editing.url, title: editing.title,
    ...(editing.image ? { image: editing.image } : {}),
    picked: [
      ...editing.requires.map((i) => ({ id: i, name: nameOf(i), optional: false })),
      ...editing.optional.map((i) => ({ id: i, name: nameOf(i), optional: true })),
    ],
    ...(editing.unresolved?.length ? { raw: editing.unresolved } : {}),
    /* Components arrive as id+title so the chips render without a client
       lookup — resolved against their shelf, and a stale id (a component
       they since deleted) simply drops out here. */
    ...(editing.components?.length ? {
      components: ((shelf) => editing.components!
        .map((id) => shelf.get(id))
        .filter((c): c is { id: string; title: string } => !!c))(
        new Map(recipesOf(creator.id).map((x) => [x.id, { id: x.id, title: x.title }]))),
    } : {}),
  } : undefined;

  return (
    <Page>
      <Nav user />
      <h1 className="page-title">{initial ? "Edit your recipe" : "Add a recipe"}</h1>
      <Section title={initial ? editing!.title : "From your catalogue"}>
        <CreatorAddRecipe handle={creator.handle}
                          {...(initial ? { initial } : {})}
                          onLookup={lookupCreatorLink}
                          onSuggest={suggestIngredients}
                          onSuggestRecipes={suggestOwnRecipes}
                          onSave={saveCreatorRecipe} />
      </Section>
      <Note>
        <Link href={`/creators/${creator.handle}`}>← Back to your page</Link>
      </Note>
    </Page>
  );
}
