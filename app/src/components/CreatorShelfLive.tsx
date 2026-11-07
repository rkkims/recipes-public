"use client";

/**
 * A creator's shelf, computed on the device — the static half of
 * `/creators/[handle]`.
 *
 * The server page above this reads `owners.json`, scores every one of the
 * creator's recipes against it, and ships pre-rendered cards. A static build
 * has no owner file and no request, so the page splits the way every converted
 * surface splits (STATIC-SPEC §2): the SHELL is real prerendered HTML for what
 * a device cannot know — who this creator is, their face, where they live —
 * and everything about THIS kitchen is computed here, between the store's
 * notify and the next frame.
 *
 * The recipe rows come from the bundle rather than as props. They are already
 * in the browser (`client-data`), the ids are baked per creator
 * (`client-creators`), and inlining a dozen full rows into each of eleven
 * pages would ship the shelf twice.
 *
 * ── What this shelf drops, and it is deliberate ───────────────────────────
 *
 * The server page carries a shelf search, four sort orders and the claimant's
 * collections. All three are addressed by query string (`?sort=`, `?q=`,
 * `?col=`) and an exported page has no query to read; "most saved" is a
 * cross-owner aggregate besides, and collections are claim data. So one order
 * ships — closest first, which is the product's own claim applied to this
 * shelf — and the tie-break is the title rather than the publish date, because
 * the bundle does not carry dates (`build-data.ts` ships what the matcher
 * reads). Fewest missing is the DEFAULT order on the server page too, so the
 * static shelf opens the way the server one does.
 */

import { useMemo } from "react";
import { Empty, Section } from "./primitives";
import { RecipeCard } from "./Gallery";
import { SaveButton } from "./SaveButton";
import { FollowButton } from "./FollowButton";
import { expandComponents, scoreRecipe, type Recipe } from "@/lib/match";
import { pantryOf, statesOf } from "@/lib/owner-core";
import { nameOf, resolveId } from "@/lib/client-data";
import { useCreators } from "@/lib/client-creators";
import { useBundle, useOwner } from "@/lib/use-owner";
import { saveRecipe, updateState } from "@/lib/dual-write";

/**
 * The follow pill, waiting for the device to answer.
 *
 * Its `initial` is owner state, so it cannot be rendered on the server at all:
 * the shell is one file for every visitor and this is the one thing on it that
 * is about the person reading. Nothing until the store has been read — a pill
 * that draws "Follow" and then flips to "Following" a frame later reads as the
 * page undoing your tap.
 *
 * `signedIn` is false and unused: `FollowButton` drops the sign-in ask in
 * static mode, because a follow is device state and there is no account to
 * attach it to (see its header).
 */
export function CreatorFollow(
  { handle, creatorId, name }: { handle: string; creatorId: string; name: string },
) {
  const { owner, ready } = useOwner();
  if (!ready) return null;
  return (
    <FollowButton handle={handle} creatorId={creatorId} name={name} signedIn={false}
                  initial={!!owner?.follows?.some((f) => f.creator_id === creatorId)} />
  );
}

export function CreatorShelfLive({ handle }: { handle: string }) {
  const { owner, ready } = useOwner();
  const bundle = useBundle();
  const creators = useCreators();

  const rows = useMemo(() => {
    if (!bundle || !creators || !ready) return null;
    const mine = creators.find((c) => c.handle === handle);
    if (!mine) return [];
    const ids = new Set(mine.recipe_ids);
    /* Folded the way the server folds them and against the WHOLE shelf, not
       against this creator's slice: `expandComponents` resolves a component by
       id out of the array it is given, and a dish whose sauce sits one row
       outside the filter would silently lose the sauce's ingredients. Filter
       after folding, never before. */
    const pantry = pantryOf(owner, resolveId);
    return expandComponents(bundle.recipes as Recipe[])
      .filter((r) => ids.has(r.id))
      .map((r) => ({ r, m: scoreRecipe(r, pantry, bundle.relations) }))
      .sort((a, b) =>
        a.m.missing.length - b.m.missing.length || a.r.title.localeCompare(b.r.title));
  }, [bundle, creators, ready, owner, handle]);

  if (!rows) return <p className="note">Reading your kitchen…</p>;

  const chipStates = statesOf(owner, resolveId);
  const saved = new Set(
    Object.values(owner?.recipes ?? {}).filter((r) => r.saved).map((r) => r.recipe_id));

  return (
    <Section title="Recipes" count={rows.length}>
      {/* The same card and grid the shelves use — a creator's page is a shelf,
          and inventing a second recipe tile would make it read as somewhere
          else. */}
      {rows.length === 0
        ? <Empty>Nothing of theirs is on the shelf yet.</Empty>
        : <div className="gallery">
        {rows.map(({ r, m }) => (
          <RecipeCard key={r.id} title={r.title} source={r.source}
                      href={`/recipe/${r.id}`}
                      away={m.missing.length}
                      missing={m.missing.map(nameOf)}
                      uses={m.uses.map((u) => ({ id: u, name: nameOf(u) }))}
                      states={chipStates} onUpdate={updateState}
                      checks={[]} incomplete={m.incomplete}
                      total={r.requires.length}
                      {...(r.image ? { image: r.image } : {})}
                      {...(r.rating !== undefined ? { sourceRating: r.rating } : {})}
                      save={<SaveButton recipeId={r.id} heart
                                        saved={saved.has(r.id)}
                                        onSave={saveRecipe} />} />
        ))}
          </div>}
    </Section>
  );
}
