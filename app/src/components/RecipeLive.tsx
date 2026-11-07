"use client";

/**
 * A recipe, against the DEVICE's kitchen — the owner half of `RecipeDetail`.
 *
 * The block this replaces was written out four times: `/recipe/[id]`, and the
 * `?recipe=` modal on the grid, the calendar and the library. Each copy read
 * the owner off disk, scored the recipe, built the chip rows, the diet verdict,
 * the cook history and the payoff, and each copy had to stay identical because
 * the modal is deliberately the same component on every surface. Slice C had to
 * move all four to the device; moving them into ONE component was the only way
 * to do that without making the drift four times as likely.
 *
 * ── The split, and why it falls where it does ─────────────────────────────
 *
 * Everything that describes the RECIPE is server-rendered and arrives as props:
 * title, source, canonical URL, the ingredient list, the creator byline, the
 * related dishes. That is the half a stranger arriving from a shared link came
 * for, it is what makes `/recipe/[id]` a real URL with real HTML, and none of
 * it depends on whose kitchen it is.
 *
 * Everything that describes the KITCHEN is computed here: which ingredients you
 * have, what you are short of, what you said last time you cooked it, whether
 * it is saved, and the payoff grid. Those change on a tap and used to cost a
 * round trip and a `revalidatePath` each (`/recipe/[id]` kept its own
 * `updateStateHere` wrapper purely to make the payoff move, and paid a full
 * page render per chip for it). Now the store notifies and this recomputes.
 *
 * ── Matching uses the SERVER's edges, not the bundle's ────────────────────
 *
 * `edges` is the relation closure around this recipe's own ingredients, sliced
 * by the page that knows the whole ontology. The shipped bundle carries only
 * the closure the CURATED shelf reaches (STATIC-SPEC §3), and a recipe the user
 * typed in themselves picks its ingredients from the WHOLE vocabulary — so its
 * requirements can name nodes the bundle has never heard of, and matching those
 * against a pruned graph would quietly answer "you need this" about something
 * the pantry covers through a relation. The bundle's own relations are still
 * used for the payoff, where the pool IS the curated shelf and the closure is
 * complete by construction.
 */

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { RecipeDetail, type DetailIngredient } from "./RecipeDetail";
import { RecipeIngredients } from "./RecipeIngredients";
import { MyVersion } from "./MyVersion";
import { MyVersionRead } from "./MyVersionRead";
import { Summary } from "./Summary";
import { EditCooks } from "./EditCooks";
import { EditRecipe } from "./EditRecipe";
import { PlanButton } from "./PlanButton";
import { SaveButton } from "./SaveButton";
import { RecipeMore } from "./RecipeMore";
import { Payoff } from "./Payoff";
import { buildRelations } from "@/lib/relations";
import { cuisinesOf, scoreRecipe, type Recipe } from "@/lib/match";
import { alsoCookable } from "@/lib/payoff";
import { cookRows, detailRows, dietFor } from "@/lib/detail";
import {
  cooksOnDate, dayKey, dietOf, dismissedNow, extrasOf, latestCook, ownAsRecipes,
  pantryOf, statesOf, summaryFor,
} from "@/lib/owner-core";
import { dietIndex, nameOf as bundleName } from "@/lib/client-data";
import { useBundle, useOwner } from "@/lib/use-owner";
import { wasCorrupt } from "@/lib/client-store";
import {
  dismissRecipe, editOwnRecipe, madeIt, noteOpened, planMeal, rateCook,
  removeOwnRecipe, saveRecipe, savePantryPicks, setIngredientNote, settleUp,
  excludeIngredient, undoMadeIt, updateState,
} from "@/lib/dual-write";
import type { ParsedLine } from "@/lib/paste";
import { openRecipeHref } from "@/lib/static-mode";

/** `YYYY-MM-DD` n days on — the plan button's default, in the device's zone. */
function shiftDay(date: string, days: number): string {
  if (!days) return date;
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return dayKey(d);
}

/** An ingredient as the diet filter and the chip labels need it. */
export type RecipeNode = {
  id: string; name: string;
  allergens?: string[];
  animal_source?: "meat" | "fish" | "dairy" | "egg";
};

export function RecipeLive({
  recipe, ownId, edges = { is_a: [], derives_from: [] }, nodes = [], mains = [],
  stapleIds, buyUrls = {}, meals, boundDate, view,
  linkStyle, components, usedIn, creatorHref, payoffPool, payoffHeading,
  payoffCreatorHrefs, hiddenIds = [], starterIds, showDismiss = false,
  showPlanButton = false, planDefaultDays = 0, search, onParse,
}: {
  /**
   * The recipe itself, resolved by the server from the corpus — or absent,
   * when it is one the user added.
   *
   * A `rec_own_…` recipe lives in `owner.own` and nowhere else. The server has
   * never seen it and must not: it belongs to one kitchen, and this component
   * renders on surfaces that hand out Open Graph cards. So the device resolves
   * it (`ownId`), which also means it arrives without the four server-supplied
   * facts below — and each of their absences is honest rather than degraded:
   * an own recipe has no curated mains, and the bundle's relations cover the
   * shelf it is being matched against.
   */
  recipe?: Recipe;
  /** A recipe of the user's own, to be read out of device state. */
  ownId?: string;
  /** Relation edges around this recipe's ingredients — see the header. */
  edges?: { is_a: string[][]; derives_from: string[][] };
  /** Names and diet facts for this recipe's ingredients, from the ontology. */
  nodes?: RecipeNode[];
  /** RECIPE-SPEC §4c, resolved server-side — see `detailRows`. */
  mains?: string[];
  /** The twelve staples, so the post-cook question stays short (`cookRows`). */
  stapleIds: string[];
  /** Shop links by ingredient NAME, computed where the catalogue is. */
  buyUrls?: Record<string, string>;
  meals: string[];
  /** `?date=`, validated by the page. Absent means today, read on the device. */
  boundDate?: string;
  view?: string;
  /** `?recipe=` inside a modal, or `/recipe/id` from a page. */
  linkStyle: "modal" | "page";
  components?: Array<{ id: string; title: string; href: string; image?: string }>;
  usedIn?: Array<{ id: string; title: string; href: string; image?: string }>;
  creatorHref?: string;
  /**
   * The payoff's pool, when it is creator-scoped — INGREDIENT-HOME-SPEC §3's
   * guardrail. On the page a creator's own audience lands on, showing another
   * creator's dishes routes the audience we were lent to a competitor. Absent
   * means the whole curated shelf, which is right for a resident browsing
   * their own shelves.
   */
  payoffPool?: string[];
  payoffHeading?: string;
  payoffCreatorHrefs?: Record<string, string>;
  /** CREATOR-SPEC §6/§6a withdrawals — a runtime judgement, so it travels. */
  hiddenIds?: string[];
  /**
   * CHECKOFF-SPEC §2's one-tap seeding, for the deep-link arrival. Present
   * only where the prompt belongs; absent means the surface does not offer it.
   */
  starterIds?: string[];
  showDismiss?: boolean;
  showPlanButton?: boolean;
  /**
   * How far ahead the plan button opens, in days from today.
   *
   * A date rather than a number was the server's shape, and today is the
   * device's fact now. The calendar and the library both offered TOMORROW —
   * you are looking at a week and planning the next thing — while the recipe
   * page offered today, because arriving at a dish from outside is usually
   * about tonight.
   */
  planDefaultDays?: number;
  /** The ingredient autosuggest — still a server action, ontology-wide. */
  search: (q: string) => Promise<Array<{
    id: string; name: string; recipes: number; via?: string;
    children?: Array<{ id: string; name: string; recipes: number }>;
  }>>;
  onParse: (block: string) => Promise<ParsedLine[]>;
}) {
  const bundle = useBundle();
  const { owner, ready } = useOwner();

  /**
   * The lightest write in the product, and the one Explore is built on.
   *
   * The modal marked the recipe opened from its own mount and the page never
   * did, so arriving at a dish by its URL left it forever unseen. One place,
   * both surfaces.
   */
  const id = recipe?.id ?? ownId;
  useEffect(() => {
    if (!ready || !id) return;
    void noteOpened(id);
  }, [ready, id]);

  const view_ = useMemo(() => {
    if (!ready || !bundle) return null;

    /* The corpus row the server resolved, or the user's own out of device
       state. `ownAsRecipes` gives it the `Recipe` shape the matcher wants and
       is explicit that nothing was parsed, so nothing failed to parse. */
    const r = recipe
      ?? (ownAsRecipes(owner).find((x) => x.id === ownId) as Recipe | undefined);
    if (!r) return null;

    const today = dayKey();
    const date = boundDate ?? today;
    const pantry = pantryOf(owner);
    /* The server's slice when there is one, the shipped closure when there is
       not — see the header. An own recipe is matched against the shelf, and
       the shelf's closure is what the bundle carries. */
    const relations = recipe
      ? buildRelations({
          is_a: edges.is_a as [string, string][],
          derives_from: edges.derives_from as [string, string][],
        })
      : bundle.relations;
    const match = scoreRecipe(r, pantry, relations);

    /* The recipe's own vocabulary first, the bundle behind it: past cooks
       carry a SNAPSHOT of what they required (RECIPE-SPEC §3), which can name
       ingredients this recipe no longer lists. */
    const names = new Map(nodes.map((n) => [n.id, n.name]));
    const nameOf = (id: string) => names.get(id) ?? bundleName(id);

    const states = statesOf(owner, (id) => id);
    const rows: DetailIngredient[] = detailRows(
      r, match, states, nameOf, (name) => buyUrls[name] ?? null, mains);

    /* The ontology the diet filter reads: the shipped index, with this
       recipe's own nodes laid over it so a corpus row outside the curated
       closure is still examinable. */
    const dietNodes = new Map<string, RecipeNode>(dietIndex());
    for (const n of nodes) dietNodes.set(n.id, n);

    const staples = new Set(stapleIds);
    const own = (owner?.own ?? []).find((o) => o.id === r.id);
    const summary = summaryFor(owner, r.id);
    const todays = cooksOnDate(owner, r.id, date);
    const last = owner ? latestCook(owner, r.id) : null;

    return {
      recipe: r,
      today, date, pantry, match, rows, nameOf, states, own, summary, todays, last,
      diet: dietOf(owner),
      dietVerdict: dietFor(r, dietOf(owner), dietNodes),
      saved: !!owner?.recipes?.[r.id]?.saved,
      dismissed: dismissedNow(owner).has(r.id),
      standing: owner?.recipes?.[r.id]?.note,
      extras: extrasOf(owner, (id) => id),
      isStaple: (id: string) => staples.has(id),
      cooks: summary.mine.events,
    };
  }, [ready, bundle, owner, recipe, ownId, edges, nodes, mains, stapleIds,
      buyUrls, boundDate]);

  /**
   * The payoff — CHECKOFF-SPEC §3, ranked on the device over the shipped shelf.
   *
   * Its own memo, because it is the expensive half: a full `rank` with
   * `maxMissing: 0` over every curated recipe, which must not re-run when the
   * only thing that changed is which day the modal is bound to.
   */
  const also = useMemo(() => {
    if (!bundle || !view_) return null;
    const pool = payoffPool
      ? bundle.recipes.filter((r) => payoffPool.includes(r.id))
      : bundle.recipes;
    return alsoCookable(pool, view_.pantry, view_.recipe.id, Infinity,
                        new Set(hiddenIds));
  }, [bundle, view_, payoffPool, hiddenIds]);

  /* Nothing truthful to draw until the store has answered. An empty pantry and
     an unread one look identical, and drawing the empty one first would tell a
     returning visitor every chip reads "you need". */
  if (!view_) {
    return (
      <p className="note" aria-busy="true" aria-live="polite">
        Reading your kitchen…
      </p>
    );
  }

  const v = view_;
  const href = (rid: string) =>
    openRecipeHref(rid, linkStyle === "modal" ? `?recipe=${rid}` : `/recipe/${rid}`);
  const dateLabel = v.date === v.today
    ? "today"
    : new Date(`${v.date}T12:00:00`).toLocaleDateString(undefined,
        { weekday: "short", day: "numeric", month: "short" });

  return (
    <>
      {wasCorrupt() && (
        <p className="note foot" role="alert">
          This device’s saved kitchen could not be read, so it was set aside
          rather than overwritten. Nothing was deleted. Adding things now
          starts a fresh one.
        </p>
      )}

      {/* A stranger has no pantry, so every chip below reads "you need". Said
          plainly rather than left to look like a verdict on their kitchen —
          and the one-tap seeding is what turns this page from a static list
          into the product: staples in, chips flip, the payoff below appears.
          DECISIONS §5 holds because nothing is seeded until they say so. */}
      {starterIds && v.pantry.have.size === 0 && (
        <div className="note tonight-line">
          Empty pantry, so this is the full list.{" "}
          <button type="button" className="linklike"
                  onClick={() => { void savePantryPicks(starterIds, []); }}>
            Start with the basics: salt, oil, garlic and the rest
          </button>
          {" or "}
          <Link href="/">add what you have</Link>.
        </div>
      )}

      <RecipeDetail recipeId={v.recipe.id} title={v.recipe.title} source={v.recipe.source}
                    url={v.recipe.url}
                    {...(components?.length ? { components } : {})}
                    {...(usedIn?.length ? { usedIn } : {})}
                    {...(creatorHref ? { creatorHref } : {})}
                    sheet={{ extras: v.extras, excludedIds: v.diet.excludes,
                             onNote: setIngredientNote,
                             onExclude: excludeIngredient }}
                    {...(also && also.count > 0 ? { payoff: (
                      <Payoff needCount={v.match.missing.length} also={also}
                              {...(payoffHeading ? { heading: payoffHeading } : {})}
                              {...(payoffCreatorHrefs
                                ? { creatorHrefs: payoffCreatorHrefs } : {})}
                              hrefFor={href} />
                    ) } : {})}
                    {...(v.recipe.image ? { image: v.recipe.image } : {})}
                    /* Membership, not one label — a dish can be Korean AND
                       Chinese, and `cuisinesOf` is the one reader of that. */
                    {...((cs) => cs.length ? { cuisine: cs.join(" · ") } : {})(
                      cuisinesOf(v.recipe))}
                    {...(v.recipe.rating !== undefined ? { sourceRating: v.recipe.rating } : {})}
                    {...(v.recipe.confirmed ? { confirmed: true } : {})}
                    diet={v.dietVerdict}
                    {...(v.own?.steps ? { steps: v.own.steps } : {})}
                    {...(showDismiss ? { more: (
                      <RecipeMore recipeId={v.recipe.id} dismissed={v.dismissed}
                                  onDismiss={dismissRecipe} />
                    ) } : {})}
                    ingredients={v.rows} incomplete={v.recipe.unresolved.length > 0}
                    /* UX-SPEC §1: one gesture from anywhere an ingredient name
                       appears. The chips write to the same pantry the drawer
                       does, through the same dual-write. */
                    onUpdate={updateState}
                    /* The rows are the device's, so `RecipeIngredients` holds
                       no optimistic copy of them — see its `live`. */
                    live
                    {...(v.own || showPlanButton ? { actions: (
                      <>
                        {/* Only a recipe the user added can be edited — the
                            corpus is generated and a change here would be
                            overwritten by the next pipeline run. */}
                        {v.own && (
                          <EditRecipe recipeId={v.own.id} title={v.own.title}
                                      url={v.own.url} note={v.own.note ?? ""}
                                      steps={v.own.steps ?? ""} onParse={onParse}
                                      ingredients={v.own.requires.map((i) => ({
                                        id: i, name: v.nameOf(i),
                                      }))}
                                      search={search} onSave={editOwnRecipe}
                                      onDelete={removeOwnRecipe} />
                        )}
                        {showPlanButton && (
                          <PlanButton recipeId={v.recipe.id} meals={meals}
                                      defaultDate={shiftDay(v.today, planDefaultDays)}
                                      onPlan={planMeal} />
                        )}
                      </>
                    ) } : {})}
                    save={<SaveButton recipeId={v.recipe.id}
                                      {...(linkStyle === "modal" ? { heart: true } : {})}
                                      saved={v.saved} onSave={saveRecipe} />}
                    history={view === "summary" ? null : (
                      <MyVersionRead cooks={v.summary.mine.cooks}
                                     {...(v.standing ? { standing: v.standing } : {})}
                                     {...(v.last ? { last: {
                                       at: v.last.cooked_at,
                                       ...(v.last.rating !== undefined ? { rating: v.last.rating } : {}),
                                       ...(v.last.note !== undefined ? { note: v.last.note } : {}),
                                     } } : {})}
                                     edit={<EditCooks
                                       meals={meals}
                                       onRate={rateCook} onDelete={undoMadeIt}
                                       cooks={v.cooks.map((e) => ({
                                         id: e.id, at: e.cooked_at,
                                         ...(e.meal !== undefined ? { meal: e.meal } : {}),
                                         ...(e.rating !== undefined ? { rating: e.rating } : {}),
                                         ...(e.note !== undefined ? { note: e.note } : {}),
                                       }))} />} />
                    )}>
        {view === "summary"
          ? <Summary summary={v.summary} nameOf={v.nameOf}
                     backHref={linkStyle === "modal"
                       ? `?recipe=${v.recipe.id}&date=${v.date}`
                       : `/recipe/${v.recipe.id}?date=${v.date}`} />
          : <MyVersion recipeId={v.recipe.id}
                       date={v.date} today={v.today}
                       dateLabel={dateLabel} meals={meals}
                       todays={cookRows(v.todays, v.states, v.nameOf,
                                        v.match.missing, v.isStaple, mains)}
                       search={search} onSettle={settleUp}
                       onRate={rateCook}
                       onCook={madeIt} onUndo={undoMadeIt} />}
      </RecipeDetail>
    </>
  );
}
