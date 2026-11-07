/**
 * The collection editor — claimant only, reached from the "+" card.
 *
 * `?edit=<id>` reopens an existing collection; without it the form is blank.
 * Anyone who is not the claimant gets sent back to the page: the editor is
 * not a secret, it is simply not theirs.
 */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Page, Note, Section } from "@/components/primitives";
import { Nav } from "@/components/Nav";
import { creatorByHandle } from "@/lib/creators";
import { claimOf } from "@/lib/claims";
import { currentUser } from "@/lib/owner";
import { load } from "@/lib/data";
import { CollectionEditor } from "@/components/CollectionEditor";
import { removeCollectionAction, saveCollectionAction, suggestTitles } from "../actions";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return { title: "Collections · JipBap", robots: { index: false } };
}

export default async function CollectionsPage(
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

  const existing = edit ? claim.collections?.find((c) => c.id === edit) : undefined;
  const { recipes } = load();
  const titleOf = new Map(recipes.map((r) => [r.id, r.title]));

  return (
    <Page>
      <Nav user />
      <h1 className="page-title">
        {existing ? `Edit “${existing.title}”` : "New collection"}
      </h1>
      <Section title={existing ? "Collection" : "Your first card"}>
        <CollectionEditor
          handle={creator.handle}
          initial={existing ? {
            id: existing.id,
            title: existing.title,
            description: existing.description,
            picked: existing.recipe_ids.map((id) => ({ id, title: titleOf.get(id) ?? id })),
          } : null}
          onSuggest={suggestTitles}
          onSave={saveCollectionAction}
          onRemove={removeCollectionAction}
        />
      </Section>
      <Note>
        <Link href={`/creators/${creator.handle}`}>← Back to your page</Link>
      </Note>
    </Page>
  );
}
