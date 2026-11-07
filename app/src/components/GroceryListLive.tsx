"use client";

/**
 * The grocery page's own half, over the DEVICE's copy — UX-SPEC §4e.
 *
 * `/list` was the last page in the product whose above-the-fold content was an
 * owner render: `ReadyToCook` joined the meal plan to the pantry on the server,
 * and the list itself was `PantryDrawer` reading `owners.json`. Both now run
 * here, between a tap and the next frame, which is what makes ticking eleven
 * things in an aisle cost eleven state changes instead of eleven round trips.
 *
 * ── The join is computed once and read from both ends ─────────────────────
 *
 * §4a says the list and the calendar are one fact. `planStatuses` answers it,
 * and the two halves of the answer sit on the same screen: the plans that have
 * stopped waiting go into `ReadyToCook` above, and the ones still short go into
 * the list below as "for your meal plan". The server page computed it exactly
 * once for exactly this reason, and so does this.
 *
 * `PantryDrawerLive` computes its own copy of `planNeeds` for the drawer laid
 * over other pages, so the same join runs twice on this page — over at most a
 * week of plans, which is what it cost on the server too. The alternative is a
 * second code path where the needs are sometimes a prop and sometimes derived,
 * and one of those two would eventually stop matching the other.
 */

import { useMemo } from "react";
import { ReadyToCook } from "./ReadyToCook";
import { PantryDrawerLive, type AskRow, type ListOffer } from "./PantryDrawerLive";
import type { BrowseAisle } from "@/lib/browse";
import { resolveId } from "@/lib/client-data";
import { dayKey, ownAsRecipes, pantryOf } from "@/lib/owner-core";
import type { Recipe } from "@/lib/match";
import { planStatuses, upcomingPlans } from "@/lib/plan";
import { useBundle, useOwner } from "@/lib/use-owner";
import { wasCorrupt } from "@/lib/client-store";

export function GroceryListLive({ asks, aisles, perk, accounted, search, offersFor }: {
  asks: AskRow[];
  aisles: BrowseAisle[];
  perk?: string;
  accounted: boolean;
  search: React.ComponentProps<typeof PantryDrawerLive>["search"];
  offersFor: (rows: Array<{ name: string; kind?: string }>) =>
    Promise<Record<string, ListOffer>>;
}) {
  const bundle = useBundle();
  const { owner, ready } = useOwner();

  const ready_ = useMemo(() => {
    if (!bundle || !ready) return null;

    /**
     * What the plan should stop asking you to buy — CART-SPEC §8, settled.
     *
     * On the list, OR in the cart. The two readers of a cart row want different
     * answers and both are right: the matcher treats it as absent, because you
     * cannot cook with something in a car park, while the meal-plan join treats
     * it as bought, because telling you to buy the gochujang already in your
     * bag is the one thing this whole feature exists to stop.
     */
    const handled = new Set(
      Object.values(owner?.ingredients ?? {}).filter((r) => r.on_list || r.in_cart)
        .map((r) => resolveId(r.ingredient_id)));

    /* The day the device is standing in. On the server this came from a cookie
       `TimeZone` had written; here the browser's own clock is the fact that
       cookie was a proxy for, so it is read directly. */
    const today = dayKey();
    const pantry = pantryOf(owner, resolveId);
    const byId = new Map(
      [...bundle.recipes, ...ownAsRecipes(owner)].map((r) => [r.id, r as Recipe]));

    return planStatuses(
      upcomingPlans(owner, today, 7), byId, pantry, bundle.relations, handled)
      .filter((st) => st.match.missing.length === 0)
      .map((st) => ({
        id: st.plan.id,
        recipeId: st.recipe.id,
        title: st.recipe.title,
        when: `${new Date(`${st.plan.date}T12:00:00`)
          .toLocaleDateString(undefined, { weekday: "short" })} ${st.plan.meal}`,
      }));
  }, [bundle, owner, ready]);

  return (
    <>
      {/*
        The device's own `StoreCorrupt` — the same promise the server page made
        with its "the pantry file could not be read" branch, translated. A blob
        that would not parse was moved aside rather than overwritten, so the
        list on screen is empty and the user's data is not gone. Saying so is
        the whole point: the failure being guarded against is someone deciding
        their list was deleted and retyping it, which is what makes it true.
      */}
      {ready_ !== null && wasCorrupt() && (
        <p className="note foot" role="alert">
          This device’s saved kitchen could not be read, so it was set aside
          rather than overwritten. Nothing was deleted. Adding things now
          starts a fresh one.
        </p>
      )}
      {/* Above the list: it is the answer to "was the shopping worth it", and
          the list below is the part still outstanding. */}
      <ReadyToCook ready={ready_ ?? []} />
      {/* `listHeading`: on this page the shelf's heading is the page's
          heading, and the count becomes a line about the trip. */}
      <PantryDrawerLive asks={asks} aisles={aisles} accounted={accounted}
                        {...(perk ? { perk } : {})}
                        search={search} only="list" listHeading
                        offersFor={offersFor} />
    </>
  );
}
