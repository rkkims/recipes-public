"use client";

/**
 * The meal plan over the DEVICE's copy — RECIPE-SPEC §4d, after the inversion.
 *
 * The calendar was a server render: it read `owner.plans` and `owner.cooks` off
 * disk, grouped them by day, scored each square against the pantry and shipped
 * plain rows. Every one of those inputs is on the device now (STATIC-SPEC §2),
 * so the grouping and the scoring happen here, against the same `scoreRecipe`
 * the server ran. `Week` is untouched: it never knew what a plan or a cook IS,
 * and it still does not.
 *
 * ── What "today" means here ───────────────────────────────────────────────
 *
 * The server read a timezone cookie that `TimeZone` had written from the
 * browser. On the device the browser's own clock is the fact the cookie was a
 * proxy for, so `dayKey()` is asked directly — one fewer round of indirection,
 * and correct for a device that crossed a border since its last visit.
 *
 * ── The plan writers land here first now ──────────────────────────────────
 *
 * `planMeal`, `unplanMeal`, `madeIt` and the rest were `lib/dual-write`'s
 * server-then-adopt wrappers, because they address a plan or a cook BY ID and
 * two shells minting their own ids means the id this component is holding is
 * not the one the other store has. That is settled by the device minting and
 * the server accepting (`owner-core.mintPlanId`), so they are ordinary mirrors:
 * a square fills on the tap's own frame, and it fills on a build with no server
 * to ask.
 */

import { useMemo } from "react";
import { Empty } from "./primitives";
import { Week, type Day, type RecipeHit } from "./Week";
import { resolveId } from "@/lib/client-data";
import { dayKey, ownAsRecipes } from "@/lib/owner-core";
import { pantryOf } from "@/lib/owner-core";
import { scoreRecipe, type Recipe } from "@/lib/match";
import { useBundle, useOwner } from "@/lib/use-owner";
import { wasCorrupt } from "@/lib/client-store";
import { madeIt, planMeal, planNoteEntry, unplanMeal } from "@/lib/dual-write";

/** `YYYY-MM-DD` n days from a date. */
function shift(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return dayKey(d);
}

export function CalendarLive({ span, meals, searchRecipes }: {
  /** How many days the column shows — a URL parameter, parsed by the page. */
  span: number;
  meals: string[];
  /**
   * Corpus search for the "+", UNSCORED — the split the inversion argues for.
   *
   * The server holds the whole corpus and answers which recipes a word names;
   * the device holds the pantry and answers how far away each one is. The
   * action used to do both, which meant reading `owners.json` to score twelve
   * titles. Own recipes are folded in here for the same reason: they live on
   * the device and the server has no business knowing them.
   */
  searchRecipes: (q: string) => Promise<Array<{
    id: string; title: string; source: string; image?: string; requires: string[];
  }>>;
}) {
  const bundle = useBundle();
  const { owner, ready } = useOwner();

  const view = useMemo(() => {
    if (!bundle || !ready) return null;

    const today = dayKey();
    const days = Array.from({ length: span }, (_, i) => shift(today, i));
    const pantry = pantryOf(owner, resolveId);

    /**
     * NOT diet-filtered, deliberately — the server page's rule, kept.
     *
     * Exclusions govern DISCOVERY. A meal already on your calendar is a
     * decision you made, and blanking Thursday because the setting changed
     * would be the product overruling the user rather than filtering for them.
     */
    const byId = new Map(
      [...bundle.recipes, ...ownAsRecipes(owner)].map((r) => [r.id, r as Recipe]));
    const titleOf = (recipeId: string) =>
      byId.get(recipeId)?.title ?? "a recipe no longer indexed";

    /**
     * Missing ingredients that are already on the grocery list.
     *
     * The calendar's half of the join: "3 away, 2 on list" says something a
     * bare count cannot — that you have already dealt with most of it.
     */
    const onList = new Set(
      Object.values(owner?.ingredients ?? {}).filter((r) => r.on_list)
        .map((r) => resolveId(r.ingredient_id)));

    const rows: Day[] = days.map((date) => {
      const plans = (owner?.plans ?? []).filter((p) => p.date === date);
      const linked = new Set(plans.map((p) => p.cook_id).filter(Boolean) as string[]);
      const cooks = (owner?.cooks ?? [])
        .filter((c) => dayKey(new Date(c.cooked_at)) === date)
        .filter((c) => !linked.has(c.id));

      return {
        date,
        isToday: date === today,
        isPast: date < today,
        planned: plans.map((p) => {
          const recipe = p.recipe_id ? byId.get(p.recipe_id) : undefined;
          /* A cooked plan needs no shopping advice — it already happened. Nor
             does a note: there is nothing to shop for in "eat out". */
          const m = recipe && !p.cook_id
            ? scoreRecipe(recipe, pantry, bundle.relations) : null;
          return {
            id: p.id,
            ...(p.recipe_id ? { recipeId: p.recipe_id } : {}),
            title: p.recipe_id ? titleOf(p.recipe_id) : (p.label ?? ""),
            meal: p.meal, done: !!p.cook_id,
            ...(m ? {
              away: m.missing.length,
              listed: m.missing.filter((i) => onList.has(i)).length,
            } : {}),
          };
        }),
        /* Cooks with no plan behind them — the unplanned dinners. Shown because
           they happened, and a calendar that hides them is a calendar of
           intentions rather than a record. */
        unplanned: cooks.map((c) => ({
          id: c.id, recipeId: c.recipe_id, title: titleOf(c.recipe_id),
          meal: c.meal ?? "", ...(c.rating !== undefined ? { rating: c.rating } : {}),
        })),
      };
    });

    return { rows, today, pantry, relations: bundle.relations, byId };
  }, [bundle, owner, ready, span]);

  /**
   * The picker's distance, computed where the pantry is.
   *
   * Scoring twelve results is cheap; the reason it happens after the search
   * rather than as part of it is that scoring the corpus would not be. Own
   * recipes are searched here because they exist only on this device.
   */
  const search = useMemo(() => async (q: string): Promise<RecipeHit[]> => {
    if (!view) return [];
    const term = q.trim().toLowerCase();
    const mine = term
      ? (ownAsRecipes(owner) as Recipe[]).filter((r) => r.title.toLowerCase().includes(term))
      : [];
    const hits = [...await searchRecipes(q), ...mine];
    const seen = new Set<string>();
    const out: RecipeHit[] = [];
    for (const r of hits) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      /* The hit carries what the matcher needs and nothing else — the picker
         draws a title, a source and a distance, so `url` and `cuisine` are
         filled in rather than shipped for twelve rows nobody opens here. */
      const m = scoreRecipe(
        { id: r.id, title: r.title, url: "", source: r.source, cuisine: "",
          requires: r.requires, unresolved: [] },
        view.pantry, view.relations);
      out.push({
        id: r.id, title: r.title, source: r.source, away: m.missing.length,
        ...(r.image ? { image: r.image } : {}),
      });
    }
    return out;
  }, [view, owner, searchRecipes]);

  /* Until the store and the bundle have both answered there is nothing
     truthful to draw. An empty week and an unread one look identical, and
     drawing the empty one first would tell a returning visitor their plans are
     gone for as long as the fetch takes. */
  if (!view) {
    return <p className="note" aria-busy="true">Reading your week…</p>;
  }

  return (
    <>
      {/* The device's `StoreCorrupt` — see `HomeGrid` for the argument. */}
      {wasCorrupt() && (
        <p className="note foot" role="alert">
          This device’s saved kitchen could not be read, so it was set aside
          rather than overwritten. Nothing was deleted. Planning something now
          starts a fresh one.
        </p>
      )}

      {/* No back button, and that is the point of a rolling window: yesterday
          is not a thing you plan. Cooks already recorded stay in the history
          (§8), which is where looking backwards belongs. */}
      <div className="topbar cal-top">
        <span className="cal-range">
          Today
          {" – "}
          {new Date(`${shift(view.today, span - 1)}T12:00:00`)
            .toLocaleDateString(undefined, { day: "numeric", month: "short" })}
        </span>
      </div>

      {view.rows.every((r) => !r.planned.length && !r.unplanned.length) && (
        <Empty>
          Nothing planned this week. Open a recipe and use <b>Add to meal plan</b>.
        </Empty>
      )}

      <Week days={view.rows} meals={meals} onUnplan={unplanMeal} onCook={madeIt}
            onPlan={planMeal} onNote={planNoteEntry} searchRecipes={search} />
    </>
  );
}
