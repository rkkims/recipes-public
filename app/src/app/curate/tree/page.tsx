/**
 * The ontology tree — every node in an `is_a` edge, htop-style, editable.
 *
 * Server side: build the forest once from the same load() every page reads —
 * raw one-hop edges (kept in the cache for exactly this kind of consumer),
 * recipe counts, aliases. Multi-parent nodes appear under each parent; the
 * client marks the repeats. Nodes in NO edge are deliberately absent — 1,500
 * singletons in a tree of guide rails is a list wearing a costume; they are
 * reachable through search and the recipe pages, where they live.
 */
import { Page, Note, Section } from "@/components/primitives";
import { OntologyTree, type TreeNode } from "@/components/OntologyTree";
import { displayOf, load } from "@/lib/data";
import { aliasDrop, aliasSet, edgeAdd, edgeRemove, fixLine, glossSet, mergeNode, openIngredient,
  promoteAlias, removeNode, renameNode, suggest } from "../ingredients/[id]/actions";

export const dynamic = "force-dynamic";

export default async function TreePage() {
  const { ingredients, byId, edges, recipeCount } = load();

  const kids = new Map<string, string[]>();
  const parentCount = new Map<string, number>();
  for (const [narrow, broad] of edges.is_a) {
    if (!narrow || !broad || !byId.has(narrow) || !byId.has(broad)) continue;
    (kids.get(broad) ?? kids.set(broad, []).get(broad)!).push(narrow);
    parentCount.set(narrow, (parentCount.get(narrow) ?? 0) + 1);
  }

  const uses = (id: string) => recipeCount.get(id) ?? 0;
  /** Subtree weight, for ordering — the busiest families first. */
  const weight = new Map<string, number>();
  const weigh = (id: string, path: Set<string>): number => {
    if (weight.has(id)) return weight.get(id)!;
    if (path.has(id)) return 0;                    // cycle guard — lint's job, belt here
    path.add(id);
    const w = uses(id) + (kids.get(id) ?? []).reduce((a, c) => a + weigh(c, path), 0);
    path.delete(id);
    weight.set(id, w);
    return w;
  };

  const node = (id: string, path: Set<string>): TreeNode => {
    const i = byId.get(id)!;
    const childIds = path.has(id) ? [] : (kids.get(id) ?? []);
    path.add(id);
    const children = childIds
      .map((c) => node(c, path))
      .sort((a, b) => (weight.get(b.id) ?? 0) - (weight.get(a.id) ?? 0));
    path.delete(id);
    return {
      id, name: displayOf(id), uses: uses(id),
      aliases: [i.name.toLowerCase(), ...i.aliases.map((a) => a.toLowerCase())],
      parents: parentCount.get(id) ?? 0, children,
      ...(id.startsWith("pending:") ? { pending: true } : {}),
    };
  };

  const roots = ingredients
    .filter((i) => kids.has(i.id) && !parentCount.has(i.id))
    .map((i) => { weigh(i.id, new Set()); return node(i.id, new Set()); })
    .sort((a, b) => (weight.get(b.id) ?? 0) - (weight.get(a.id) ?? 0));

  const inTree = new Set<string>();
  const count = (n: TreeNode) => { inTree.add(n.id); n.children.forEach(count); };
  roots.forEach(count);

  const ingredientActions = {
    open: openIngredient, rename: renameNode, gloss: glossSet, remove: removeNode,
    aliasSet, aliasDrop, promoteAlias, mergeNode, fixLine, edgeAdd, edgeRemove, suggest,
  };

  return (
    <Page>
      <Section title="Ontology tree" count={roots.length}
               action={<span className="note"><a href="/curate">back to the queue →</a></span>}>
        <Note>
          {inTree.size} nodes across {roots.length} families — every ingredient
          holding or standing under an is_a edge. Nodes in no edge are not
          drawn; find those through any recipe line or the editor pages.
        </Note>
        <OntologyTree roots={roots} ingredient={ingredientActions} />
      </Section>
    </Page>
  );
}
