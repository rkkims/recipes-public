"use client";

/**
 * The library's shelves, over the DEVICE's copy — UX-SPEC §8.
 *
 * Cooked, added by me, saved: three claims about one kitchen, and every one of
 * them was a server render off `owners.json` an hour ago. They are device state
 * now (STATIC-SPEC §2), so adding a recipe puts it on the shelf on the same
 * frame instead of after a write, a revalidation and a full page render.
 *
 * Deliberately NOT ranked against the pantry — the page's own rule, unchanged.
 * This answers "what have I cooked" and "what did I mean to cook"; the home
 * page answers "what can I cook tonight", and blending the two would make this
 * a second, worse version of it.
 *
 * ── Adding a recipe is still a server action, and that is the plan ────────
 *
 * `saveOwnRecipe` runs the link parser, mirrors the thumbnail off someone
 * else's CDN before it dies, and files the demand-board row. STATIC-SPEC §7b
 * keeps add-by-URL on the server for this slice and names it as one of the
 * things static mode gives up (§8). It goes through `lib/dual-write`, which
 * runs it and then has the device adopt the result — which is what makes the
 * recipe's id the same id in both stores, and therefore what lets edit and
 * delete be ordinary mirrors.
 */

import { useEffect, useMemo } from "react";
import { Empty } from "./primitives";
import { Gallery, RecipeCard } from "./Gallery";
import { SaveButton } from "./SaveButton";
import { DeleteOwn } from "./DeleteOwn";
import { AddRecipe } from "./AddRecipe";
import { ImportGate } from "./ImportGate";
import { dayLabel } from "@/lib/day";
import { dietFor } from "@/lib/detail";
import {
  dietOf, ownAsRecipes, ownNeedingIngredients, summaryFor,
} from "@/lib/owner-core";
import type { Recipe } from "@/lib/match";
import { dietIndex } from "@/lib/client-data";
import { useBundle, useOwner } from "@/lib/use-owner";
import { wasCorrupt } from "@/lib/client-store";
import {
  removeOwnRecipe, saveOwnRecipe, saveRecipe, upgradeOwnRecipes,
} from "@/lib/dual-write";
import type { ParsedLine } from "@/lib/paste";
import type { ActionResult } from "@/lib/result";
import { openRecipeHref, STATIC } from "@/lib/static-mode";

/** Per-deploy facts about a shelf row that no device can look up. */
export type ShelfMeta = { creatorHref?: string; confirmed?: boolean };

export function MyRecipesLive({
  meta, account, shared, sharedTitle, search, onParse, onLookup,
}: {
  /** Recipe id → the creator page and the confirmation pen. */
  meta: Record<string, ShelfMeta>;
  /** Whether THIS REQUEST carries a session — the add form's gate. */
  account: boolean;
  shared?: string;
  sharedTitle?: string;
  search: React.ComponentProps<typeof AddRecipe>["search"];
  onParse: (block: string) => Promise<ParsedLine[]>;
  onLookup: React.ComponentProps<typeof AddRecipe>["onLookup"];
}) {
  const bundle = useBundle();
  const { owner, ready } = useOwner();

  /**
   * The return trip of the request queue, at a moment that may have a write.
   *
   * A URL the user pasted becomes a curated recipe, and their note, steps,
   * cooks and plans move onto the corpus row. Deciding WHICH rows move needs
   * the recipe index, so it is a server action; it ran in this page's server
   * component BODY before, which was a write during render. Once per mount, and
   * the device only re-reads when something actually moved.
   */
  useEffect(() => {
    if (!ready) return;
    void upgradeOwnRecipes().catch((e) =>
      console.warn("[my-recipes] could not fold pasted recipes in:", e));
  }, [ready]);

  const view = useMemo(() => {
    if (!bundle || !ready) return null;

    const byId = new Map(
      [...bundle.recipes, ...ownAsRecipes(owner)].map((r) => [r.id, r as Recipe]));
    const diet = dietOf(owner);
    const nodes = dietIndex();

    /**
     * These shelves are NOT filtered — and that is why they need a warning.
     *
     * Hiding a dish you have cooked because you later set a preference would be
     * absurd, so the shelves stay whole. Saying nothing was the actual failure:
     * a saved recipe sat here indistinguishable from one that had passed every
     * check. So each card carries its own verdict instead (USER-SPEC §6).
     */
    const warnFor = (r: { requires: string[]; optional?: string[]; unresolved?: string[] }) => {
      const v = dietFor(r, diet, nodes);
      if (v.unexaminable) return "no ingredients recorded, so your dietary filters can’t check this one";
      if (v.hiddenWhy) return `normally hidden for you: ${v.hiddenWhy}`;
      return undefined;
    };

    /**
     * Their most recent rating of a dish, not the average of all of them.
     *
     * `summaryFor(...).mine.rating` is a mean, which is the right number for
     * the modal's history and the wrong one for a card: a dish rated 2 then
     * fixed and rated 5 shows 3.5, which is a score it never got and a
     * judgement they no longer hold. `events` is newest first, so the first one
     * carrying a rating is the last opinion they actually expressed.
     */
    const lastRating = (rid: string): number | undefined =>
      summaryFor(owner, rid).mine.events.find((e) => typeof e.rating === "number")?.rating;

    /**
     * Cooked, most recently first.
     *
     * Built from the cook log rather than from `user_recipe`, because the log
     * is the source of truth (§6 computes; it does not store) and because a
     * recipe you cooked without saving belongs here just as much as one you
     * saved.
     */
    const cookedIds: string[] = [];
    const seen = new Set<string>();
    for (const c of [...(owner?.cooks ?? [])]
                      .sort((a, b) => b.cooked_at.localeCompare(a.cooked_at))) {
      if (seen.has(c.recipe_id)) continue;
      seen.add(c.recipe_id);
      cookedIds.push(c.recipe_id);
    }
    const cooked = cookedIds
      .map((rid) => ({ recipe: byId.get(rid), summary: summaryFor(owner, rid) }))
      // A recipe the shelf no longer holds is a real state — ids are stable,
      // but the corpus is regenerated. Drop the row rather than render a blank.
      .filter((r): r is { recipe: Recipe; summary: typeof r.summary } => !!r.recipe);

    const saved = Object.values(owner?.recipes ?? {})
      .filter((r) => r.saved)
      .map((r) => byId.get(r.recipe_id))
      .filter((r): r is Recipe => !!r);

    const mine = owner?.own ?? [];

    /**
     * The union of the three shelves, deduplicated.
     *
     * Ordered cooked-first because a dish you have actually made is the one
     * most likely to be wanted again; then your own additions, then things you
     * merely meant to try.
     */
    const everything = (() => {
      const at = new Set<string>();
      const out: Recipe[] = [];
      for (const r of [...cooked.map((c) => c.recipe),
                       ...(ownAsRecipes(owner) as Recipe[]), ...saved]) {
        if (at.has(r.id)) continue;
        at.add(r.id);
        out.push(r);
      }
      return out;
    })();

    return {
      cooked, saved, mine, everything, warnFor, lastRating,
      savedIds: new Set(saved.map((r) => r.id)),
      cooks: (rid: string) => summaryFor(owner, rid).mine.cooks,
      needsIngredients: ownNeedingIngredients(owner),
    };
  }, [bundle, owner, ready]);

  if (!view) {
    return (
      <div className="gridskeleton" aria-busy="true" aria-live="polite">
        <span className="sr-only">Reading your library</span>
        {Array.from({ length: 3 }, (_, i) => (
          <div className="gridskeleton-card" key={i} aria-hidden="true" />
        ))}
      </div>
    );
  }

  const mark = (id: string): ShelfMeta => meta[id] ?? {};

  /** One card, drawn the same way on all four shelves. */
  const card = (
    r: { id: string; title: string; source: string; image?: string; rating?: number;
         requires: string[]; optional?: string[]; unresolved?: string[] },
    children?: React.ReactNode,
  ) => {
    const mk = mark(r.id);
    const my = view.lastRating(r.id);
    return (
      <RecipeCard key={r.id} title={r.title} source={r.source}
                  {...(mk.creatorHref ? { creatorHref: mk.creatorHref } : {})}
                  href={openRecipeHref(r.id, `/my-recipes?recipe=${r.id}`)} image={r.image}
                  confirmed={mk.confirmed}
                  away={0} missing={[]} uses={[]} checks={[]}
                  {...(r.rating !== undefined ? { sourceRating: r.rating } : {})}
                  warn={view.warnFor(r)}
                  cooked={view.cooks(r.id)} incomplete={false}
                  {...(my !== undefined ? { myRating: my } : {})}
                  save={<SaveButton recipeId={r.id} heart
                                    saved={view.savedIds.has(r.id)}
                                    onSave={saveRecipe} />}>
        {children}
      </RecipeCard>
    );
  };

  return (
    <>
      {wasCorrupt() && (
        <p className="note foot" role="alert">
          This device’s saved library could not be read, so it was set aside
          rather than overwritten. Nothing was deleted. Saving something now
          starts a fresh one.
        </p>
      )}

      {/*
        Adding a recipe needs an account — see `signedIn`.

        UX-SPEC §9 names three things that must never be gated: matching, search
        and the pantry. This is none of them, and the difference is real. A
        pantry is cheap to rebuild and is the argument FOR signing up, so it has
        to work first. A recipe typed in by hand is a link, a title, a dozen
        ingredients and a method that we cannot reconstruct if the cookie goes.
      */}
      {/* A share arrival with no account gets the gate SAID, not a page that
          silently lacks the form the share was for — see `ImportGate`. */}
      {!account && shared && !STATIC && <ImportGate shared={shared} />}

      {/*
        Static mode says why the form is missing — STATIC-SPEC §3.
        *"My-recipes' add by URL requires a parser and is disabled in static
        mode (paste-a-URL renders the same honest note as sync)."*
        The shelves above are untouched, and so are edit and delete: those are
        device writes on rows the device already holds. What cannot happen is
        the CREATE, because the id, the ingredient parse and the mirrored
        thumbnail all come from a server (`lib/actions-static`).
      */}
      {STATIC && (
        <p className="note foot">
          Adding a recipe by link needs a server to read the page, and this copy
          of JipBap runs entirely in your browser. Everything you have already
          added is still here, and still editable.
        </p>
      )}

      {account && !STATIC && (
        <AddRecipe search={search} onParse={onParse}
                   {...(shared ? { shared } : {})}
                   {...(sharedTitle ? { sharedTitle } : {})}
                   onLookup={onLookup}
                   /* Server-first, then adopted — see the header. */
                   onSave={saveOwnRecipe as (r: Parameters<typeof saveOwnRecipe>[0])
                     => Promise<ActionResult>} />
      )}

      {/* The backlog an import creates, named where it can be worked through.
          Recipes with no ingredients cannot rank, match or be diet-checked, so
          a library full of them looks broken rather than full. */}
      {view.needsIngredients.length > 0 && (
        <p className="note tonight-line">
          <b>{view.needsIngredients.length}</b>{" "}
          {view.needsIngredients.length === 1 ? "recipe has" : "recipes have"} no
          ingredients yet, so {view.needsIngredients.length === 1 ? "it will" : "they will"}{" "}
          not match your pantry. Open one and paste its list; “Added by me” has them.
        </p>
      )}

      <Gallery tabs={[
        {
          /**
           * Everything of yours, in one place — and the default.
           *
           * The three shelves answer three good questions, but the commonest
           * one is "where is that thing I had", and answering it meant guessing
           * which shelf a recipe had landed on. Cooked, added and saved overlap
           * constantly: a recipe you added, saved AND cooked was on all three
           * and findable on none of them without knowing that.
           */
          id: "all",
          label: "All",
          count: view.everything.length,
          empty: <Empty>Nothing yet.</Empty>,
          panel: <div className="gallery">{view.everything.map((r) => card(r))}</div>,
        },
        {
          id: "cooked",
          label: "Cooked",
          count: view.cooked.length,
          empty: (
            <Empty>
              Nothing yet. Open a recipe and press <b>Made it</b>. This becomes
              your record of what you have actually made.
            </Empty>
          ),
          panel: (
            <div className="gallery">
              {view.cooked.map(({ recipe, summary: s }) => card(recipe, (
                <p className="note">
                  {s.mine.last && <>last {dayLabel(s.mine.last)}</>}
                  {s.mine.rating !== null && (
                    <> · <span className="stars-inline">{"★".repeat(Math.round(s.mine.rating))}</span></>
                  )}
                </p>
              )))}
            </div>
          ),
        },
        {
          id: "mine",
          label: "Added by me",
          count: view.mine.length,
          empty: (
            <Empty>
              {account
                ? <>Nothing yet. Press <b>Add a recipe</b> above.</>
                : <>Sign up to add recipes of your own.</>}
            </Empty>
          ),
          panel: (
            <div className="gallery">
              {view.mine.map((r) => card(r, (
                <>
                  <p className="note">{r.requires.length} ingredients</p>
                  <DeleteOwn recipeId={r.id} title={r.title} onDelete={removeOwnRecipe} />
                </>
              )))}
            </div>
          ),
        },
        {
          id: "saved",
          label: "Saved",
          count: view.saved.length,
          empty: <Empty>Nothing saved. Save a recipe and it waits here.</Empty>,
          panel: <div className="gallery">{view.saved.map((r) => card(r))}</div>,
        },
      ]} />
    </>
  );
}
