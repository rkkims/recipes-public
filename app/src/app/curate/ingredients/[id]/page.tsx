/**
 * The ingredient editor — one node, every claim the ontology makes about it.
 *
 * Assembled server-side from `load()`: the node itself, its aliases, both edge
 * tables walked in both directions, and the recipes whose `requires` or
 * `optional` name it. The last list is the point of the page — a reviewer
 * about to rename or re-parent something should be looking at what it is
 * load-bearing for while they decide.
 *
 * Accepts an id (`ing_…`) or anything `idForName` can resolve, so
 * `/curate/ingredients/gochujang` works from the address bar — which is how a
 * reviewer mid-queue actually arrives.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { Page, Note } from "@/components/primitives";
import { IngredientEditor } from "@/components/IngredientEditor";
import { editorDataFor } from "@/lib/editor-data";
import { aliasDrop, aliasSet, edgeAdd, edgeRemove, fixLine, glossSet, mergeNode, promoteAlias, removeNode, renameNode, suggest } from "./actions";

export const dynamic = "force-dynamic";

export default async function IngredientPage({ params }: {
  params: Promise<{ id: string }>;
}) {
  const raw = decodeURIComponent((await params).id);
  // One assembly, shared with the recipe page's ingredient sheet.
  const data = editorDataFor(raw);
  if (!data) notFound();

  return (
    <Page>
      <Note>
        <Link href="/curate/ingredients">← ingredient queue</Link>
        {" · "}every edit here is recorded, not applied. <code>npm run
        apply-edits</code> writes the tables, <code>npm run build-ontology</code>
        rebuilds what the app reads.
      </Note>
      <IngredientEditor
        data={data}
        actions={{ rename: renameNode, gloss: glossSet, remove: removeNode, aliasSet, aliasDrop, promoteAlias, mergeNode, fixLine, edgeAdd, edgeRemove, suggest }}
      />
    </Page>
  );
}
