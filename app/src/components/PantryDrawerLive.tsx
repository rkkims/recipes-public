"use client";

/**
 * The pantry drawer over the DEVICE's copy — the whole assembly, everywhere.
 *
 * `PantryDrawer` was the server version: it turned `owner.ingredients` into
 * `Item[]` using `nameOf` / `displayOf` / `kindOf` off the ontology on disk.
 * This started as the home page's copy in slice B and became the only one in
 * slice C, when `/list`, `/calendar` and `/my-recipes` converted and the server
 * assembly was deleted. Rows come from `client-store` and the shipped bundle,
 * so a tick is a synchronous state change rather than a write, a revalidation
 * and a re-render.
 *
 * ── What it keeps, deliberately ───────────────────────────────────────────
 *
 * `Pantry` and `BrowseGrid` are reused untouched. They were always client
 * components taking plain rows and action refs; what changes is where the rows
 * come from and which functions the refs point at (`lib/dual-write`, so the
 * server's copy stays true for push reminders and the sync tier). Nothing about
 * how a chip is drawn or how the aisles group moved.
 *
 * ── What the server still hands over ──────────────────────────────────────
 *
 * `clarifications`, the browse grid's aisles and the affiliate perk are read
 * off disk and are the same for every visitor, so they arrive as props once —
 * static per deploy, not per owner (STATIC-SPEC §5's split). `accounted` is
 * the one genuinely per-request fact: whether this REQUEST carries a session,
 * which `lib/account` answers and a device cannot.
 *
 * ── The affiliate row, and why it is fetched rather than shipped ──────────
 *
 * `PantryDrawer` computed `buy` inline from `weeeProductsFor`, a CSV read off
 * disk keyed on the ingredient's name. The catalogue covers the whole
 * vocabulary and the question is about the handful of things on one list, so
 * it arrives the way `HomeGrid`'s shelf offers do: the rows are known first,
 * then one round trip asks about exactly those (`offersFor`). Nothing waits on
 * it — the list draws, and the buy links appear when the answer lands.
 *
 * It is asked for ONLY when `only === "list"`, which is the grocery page and
 * nowhere else. The drawer laid over other pages carries no offer, and that
 * predates this file: §4h keeps the affiliate on the grocery PAGE and the
 * Almost-there shelf.
 */

import { useEffect, useMemo, useState } from "react";
import { Pantry, type Item } from "./Pantry";
import { BrowseGrid } from "./BrowseGrid";
import type { BrowseAisle } from "@/lib/browse";
import { displayOf, kindOf, nameOf, resolveId } from "@/lib/client-data";
import { dayKey, dietOf, isFreeText, ownAsRecipes, pantryOf, pinLapsed } from "@/lib/owner-core";
import type { Recipe } from "@/lib/match";
import { planNeeds, planStatuses, upcomingPlans } from "@/lib/plan";
import { soonLabel } from "@/lib/day";
import { useBundle, useOwner } from "@/lib/use-owner";
import {
  addListNote, addToGroceryList, answerAsk, excludeIngredient, moveListToPantry,
  putAwayCart, savePantryPicks, setIngredientNote, tickOffItem, updateState,
} from "@/lib/dual-write";

/** A clarification, flattened for the wire — INGREDIENT-SPEC §6. */
export type AskRow = {
  id: string; trigger: string; grants: string; question: string; because: string;
};

/** What a hard-to-find list row can be bought from — `weeeUrlFor` + its products. */
export type ListOffer = {
  url: string;
  products: Array<{ id: string; title: string; url: string; image?: string }>;
};

export function PantryDrawerLive({ asks, aisles, perk, accounted, search,
                                   only, listHeading = false, offersFor }: {
  /** `clarifications()`, serialized — three rows, static per deploy. */
  asks: AskRow[];
  /** `browseAisles()`, serialized — the tickable kitchen. */
  aisles: BrowseAisle[];
  perk?: string;
  /** Whether THIS REQUEST carries a session — §9's ask, suppressed if so. */
  accounted: boolean;
  /**
   * Render one half of it — `/list` shows the list as a page and the pantry as
   * a floating panel (§4e), which is the same assembly twice with a different
   * half showing. Scoped in CSS rather than by splitting the component: the two
   * shelves share the basket, the writes and the one failure bar.
   */
  only?: "pantry" | "list";
  /** This list is the page it is on, so its shelf heading is the page's. */
  listHeading?: boolean;
  /** The ingredient autosuggest — still a server action, see the note below. */
  search: (q: string) => Promise<Array<{
    id: string; name: string; recipes: number; via?: string;
    children?: Array<{ id: string; name: string; recipes: number }>;
  }>>;
  /**
   * The buy links for the list's hard-to-find rows — §4h, asked once the rows
   * are known. The server applies the findability veto (`hardToFind`) and
   * answers by ingredient NAME, which is what the Weee catalogue keys on.
   */
  offersFor?: (rows: Array<{ name: string; kind?: string }>) =>
    Promise<Record<string, ListOffer>>;
}) {
  const bundle = useBundle();
  const { owner, ready } = useOwner();
  const [offers, setOffers] = useState<Record<string, ListOffer>>({});

  const view = useMemo(() => {
    if (!bundle || !ready) return null;

    /**
     * Rows read through the redirect map — INGREDIENT-SPEC §1.
     *
     * A row written before a merge holds the retired id. Resolving on READ
     * keeps the pantry working without rewriting anyone's data.
     */
    const items: Item[] = Object.values(owner?.ingredients ?? {}).map((r) => {
      const id = resolveId(r.ingredient_id);
      // A typed row has no ontology entry, so `nameOf` would echo the id back.
      // Its label IS its name.
      const name = r.label ?? nameOf(id);
      // The representational form, when the node has one — see `Item.display`.
      const display = r.label ?? displayOf(id);
      return {
        id, name,
        ...(display !== name ? { display } : {}),
        in_pantry: r.in_pantry, on_list: r.on_list, use_first: r.use_first,
        /* Bought and not yet put away — CART-SPEC. Absent on every row written
           before the field existed, which reads as false. */
        in_cart: !!r.in_cart,
        addedAt: r.added_at,
        ...(r.first_added_at ? { sinceAt: r.first_added_at } : {}),
        /* The last time this was in play at all — held, listed, or the moment
           it stopped being either. It is what ranks your own history in the
           add box (§4f). */
        usedAt: r.removed_at ?? r.added_at,
        lapsedPin: pinLapsed(r),
        ...(r.note ? { note: r.note } : {}),
        // One `kind`, one `aisleOf`, for both shelves — a kitchen is walked too.
        kind: kindOf(id),
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    const pantry = pantryOf(owner, resolveId);
    const answered = owner?.answers ?? {};
    const live = asks.filter((a) => pantry.have.has(a.trigger));
    const asksFor: Record<string, Array<{
      id: string; grants: string; grantsName: string; question: string;
      because: string; answer: boolean | null;
    }>> = {};
    for (const a of live) {
      (asksFor[a.trigger] ??= []).push({
        id: a.id, grants: a.grants, grantsName: nameOf(a.grants),
        question: a.question, because: a.because,
        answer: answered[a.id] ?? null,
      });
    }

    /**
     * What the meal plan needs and the pantry lacks — the same join the
     * calendar computes, so the drawer says the same thing on both pages.
     * Free-text rows are excluded from `onList` by resolution, exactly as on
     * the server: `resolveId` passes a `txt_` id through unchanged.
     */
    const today = dayKey();
    const onList = new Set(
      Object.values(owner?.ingredients ?? {}).filter((r) => r.on_list)
        .map((r) => resolveId(r.ingredient_id)));
    /* Corpus AND the user's own: a plan can point at a recipe they typed in,
       and a plan whose recipe cannot be resolved contributes nothing to the
       shopping — which would silently drop exactly the dinners they chose
       most deliberately. */
    const byRecipeId = new Map(
      [...bundle.recipes, ...ownAsRecipes(owner)].map((r) => [r.id, r as Recipe]));
    const needs = planNeeds(
      planStatuses(upcomingPlans(owner, today, 7), byRecipeId, pantry,
                  bundle.relations, onList),
      /* `displayOf`: these rows land on the grocery list shelf, which speaks
         the representational name — see `Item.display`. */
      displayOf, onList,
      /* The dish AND the day: standing in a shop, "which of these do I need
         first" is a real question. */
      (st) => `${st.recipe.title} (${soonLabel(st.plan.date, today)})`);

    return {
      items, asksFor, needs,
      excludes: [...dietOf(owner, resolveId).excludes],
      held: Object.values(owner?.ingredients ?? {})
        .filter((r) => r.in_pantry).map((r) => resolveId(r.ingredient_id)),
    };
  }, [bundle, owner, ready, asks]);

  /**
   * Ask about the rows on the list, and only those.
   *
   * Keyed by the NAMES on the list rather than by the array, so re-rendering
   * for a tick somewhere else does not re-ask. Free-text rows are excluded on
   * the way out: we have no idea what "bin bags" is, and a shop search for it
   * is a guess dressed as a recommendation.
   */
  const listKey = JSON.stringify(
    (view?.items ?? [])
      .filter((i) => i.on_list && !isFreeText(i.id))
      .map((i) => [i.name, i.kind ?? ""])
      .sort((a, b) => a[0]!.localeCompare(b[0]!)));
  useEffect(() => {
    if (!offersFor) return;
    const rows = (JSON.parse(listKey) as Array<[string, string]>)
      .map(([name, kind]) => ({ name, ...(kind ? { kind } : {}) }));
    if (rows.length === 0) { setOffers({}); return; }
    let live = true;
    void offersFor(rows)
      .then((got) => { if (live) setOffers(got); })
      .catch((e) => console.warn("[offers] list rows not fetched:", e));
    return () => { live = false; };
  }, [listKey, offersFor]);

  /* Until the store and the bundle have both answered there is nothing
     truthful to draw. An empty pantry and an unread one look identical, and
     drawing the empty one first would tell a returning visitor their kitchen
     is gone for as long as the fetch takes. */
  if (!view) {
    return (
      <div className={only ? `pantrydrawer only-${only}` : "pantrydrawer"}
           aria-busy="true">
        <p className="note">Reading your kitchen…</p>
      </div>
    );
  }

  /**
   * The buy link, folded onto the row it belongs to — §4h.
   *
   * List rows only, and only when the page asked (`offersFor`). The server has
   * already applied the findability veto, so a name that comes back is a name
   * a mainstream shop does not reliably carry; anything absent simply has no
   * link, which is the same silence `PantryDrawer` produced for it.
   */
  const items = only === "list"
    ? view.items.map((i) => {
        const offer = i.on_list ? offers[i.name] : undefined;
        return offer ? { ...i, buy: offer } : i;
      })
    : view.items;

  return (
    <div className={only ? `pantrydrawer only-${only}` : "pantrydrawer"}>
      <Pantry items={items}
              listHeading={listHeading}
              /* Still a SERVER action, and only this one: the autosuggest
                 ranks the whole ontology by how many recipes use a word, and
                 the bundle ships the curated shelf's closure. Answering from
                 the device would quietly narrow what a person can find. Slice
                 C's decision, not this one's. */
              search={search}
              onUpdate={updateState}
              {...(perk ? { perk } : {})}
              /* §9's ask, and only for a kitchen with nothing keeping it. */
              accounted={accounted}
              /* Every write below is dual-written: the device first and
                 synchronously, the server action after and detached, so the
                 copy push reminders read stays true. */
              onAddMany={addToGroceryList} onMoveToPantry={moveListToPantry}
              onAnswer={answerAsk} onExclude={excludeIngredient}
              onPutAway={putAwayCart}
              excludes={view.excludes}
              asksFor={view.asksFor}
              planNeeds={view.needs}
              /* The optimistic override machinery is retired here — see
                 `Pantry`'s `live`. The store IS the truth now, and it answers
                 on the same frame as the tap. */
              live
              onAddNote={addListNote} onTick={tickOffItem}
              onNote={setIngredientNote} />
      {/* A SIBLING, not a child. Sharing a parent render with `Pantry` is what
          made every chip tap reconcile three hundred hidden checkboxes. */}
      <BrowseGrid aisles={aisles} onSave={savePantryPicks} held={view.held} />
    </div>
  );
}
