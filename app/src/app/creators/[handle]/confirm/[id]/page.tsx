/**
 * Confirm a crawled recipe's ingredient list — CREATOR-SPEC §4/§5.
 *
 * The crawl produced OUR reading of the creator's recipe; this page is where
 * the creator replaces it with THEIRS. Preloaded with the current list so
 * confirming a correct reading is one tap, and showing the raw lines the
 * parser could not resolve so nothing we failed to read is silently lost.
 *
 * Claimant only, and only for the claimant's own crawled recipes: a
 * creator-added recipe (rec_c…) is already the creator's word and is edited
 * by pasting its link on the add page. Anyone else is sent to the public
 * page, same move as the add and collections editors.
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Page, Note, Section } from "@/components/primitives";
import { Nav } from "@/components/Nav";
import { creatorByHandle, creatorOfRecipe } from "@/lib/creators";
import { claimOf, allConfirmations } from "@/lib/claims";
import { currentUser } from "@/lib/owner";
import { load, nameOf } from "@/lib/data";
import { CreatorConfirm } from "@/components/CreatorConfirm";
import { confirmIngredients, suggestIngredients } from "./actions";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return { title: "Confirm the ingredient list · JipBap", robots: { index: false } };
}

export default async function ConfirmPage(
  { params }: { params: Promise<{ handle: string; id: string }> },
) {
  const { handle, id } = await params;
  const creator = creatorByHandle(handle);
  if (!creator) notFound();
  const user = await currentUser();
  const claim = claimOf(creator.id);
  if (!user || !claim || claim.user_id !== user.id) redirect(`/creators/${handle}`);

  // The raw corpus row, NOT findRecipe — the overlay would hand back their own
  // confirmation with `unresolved` cleared, and this page must keep showing
  // what the parser could not read.
  // A creator claims their own recipe whether or not it has a go yet.
  const raw = load().allRecipes.find((r) => r.id === id);
  if (!raw || creatorOfRecipe(id)?.id !== creator.id) notFound();

  // Preload with the list as it currently serves: their confirmation when one
  // exists, the parser's reading otherwise.
  const conf = allConfirmations().get(id);
  const requires = conf?.requires ?? raw.requires;
  const optional = conf?.optional ?? raw.optional ?? [];
  const initial = [
    ...requires.map((i) => ({ id: i, name: nameOf(i), optional: false })),
    ...optional.map((i) => ({ id: i, name: nameOf(i), optional: true })),
  ];

  return (
    <Page>
      <Nav user />
      <h1 className="page-title">Confirm the ingredient list</h1>
      <Section title={raw.title}>
        <CreatorConfirm handle={creator.handle} recipeId={id}
                        initial={initial} unreadable={raw.unresolved}
                        onSuggest={suggestIngredients}
                        onConfirm={confirmIngredients} />
      </Section>
      <Note>
        <Link href={`/recipe/${id}`}>← Back to the recipe</Link>
      </Note>
    </Page>
  );
}
