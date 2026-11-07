/**
 * The meal plan — RECIPE-SPEC §4d.
 *
 * A week at a time, each day holding its meal slots. What sits in a slot is
 * either a PLAN (an intention) or a COOK (a record), and the page shows both
 * because they are both true: you planned bibimbap for Thursday, and on Tuesday
 * you made something that was never planned at all.
 *
 * A week rather than a month: a month of thirty cells on a phone gives each meal
 * a few pixels, and the question this page answers — "what am I eating this
 * week, and what do I need to buy" — is a week-shaped question.
 *
 * ── What this file does after the inversion ───────────────────────────────
 *
 * No owner read. Plans and cooks are on the device (STATIC-SPEC §2), so the
 * squares, their distance from the pantry and the "n on list" join are computed
 * in `CalendarLive`; the modal over them is `RecipeLive`. What is left here is
 * the frame and the two things the device cannot answer for itself: which
 * recipe a word names in the FULL corpus, and everything about the recipe the
 * modal opens that is not about a kitchen.
 */
import Link from "next/link";
import { Page } from "@/components/primitives";
import { Shell } from "@/components/Shell";
import { TimeZone } from "@/components/TimeZone";
import { Nav } from "@/components/Nav";
import { RecipeModal } from "@/components/RecipeModal";
import { RecipeLive } from "@/components/RecipeLive";
import { OwnRecipeSheet } from "@/components/OwnRecipeSheet";
import { CalendarLive } from "@/components/CalendarLive";
import { starterList } from "@/lib/starter";
import { creatorOfRecipe } from "@/lib/creators";
import { PantryDrawerLive } from "@/components/PantryDrawerLive";
import { load } from "@/lib/data";
import { searchIngredients, searchRecipes } from "@/app/shelf-actions";
import { STATIC } from "@/lib/static-mode";
import { findRecipe, usedInOf } from "@/lib/recipes";
import { hiddenRecipeIds } from "@/lib/claims";
import { recipeProps } from "@/lib/recipe-props";
import { clarifications } from "@/lib/clarify";
import { browseAisles } from "@/lib/browse";
import { signedIn } from "@/lib/account";
import { weeePerk } from "@/lib/weee";
import { getOwner, MEALS } from "@/lib/store";
import { currentUser, ownerId } from "@/lib/owner";
import { readPastedIngredients } from "@/app/actions";

/* Both reads now live in `app/shelf-actions.ts` — see the note there. */

/**
 * How many days the column shows, and how much further "more" goes.
 *
 * A rolling window from TODAY, not a calendar week — RECIPE-SPEC §4d. On a
 * Friday "this week" means three days, so a plan shrank as the week ran out and
 * was at its least useful exactly when shopping was most imminent. Seven from
 * today means the same thing on every day of the week, and it is the window
 * `planNeeds` already walks, so the calendar and the grocery list finally agree
 * about which days they are talking about.
 */
const WINDOW = 7;
const MORE = 7;
/** Far enough to be a scroll rather than a pager; short enough not to be a year. */
const MAX_DAYS = 56;

export default async function Calendar({ searchParams }: {
  searchParams: Promise<{ recipe?: string; date?: string; view?: string; days?: string }>;
}) {
  /* No cookie and no query on an exported page — see `page.tsx`'s note. The
     week itself is device state and draws either way; what static mode loses
     here is the `?recipe=` sheet (the recipe's own page takes over) and the
     `?days=` window, which opens at seven. */
  const { recipe: openRecipeId, date: openDate, view, days: daysParam } =
    STATIC ? {} as Awaited<typeof searchParams> : await searchParams;

  /* The session, and only the session — see `/list` for the same read and the
     same reason. Nothing rendered below depends on whose kitchen it is. */
  const accounted = STATIC ? false : await (async () => {
    try { return signedIn(getOwner(await ownerId())); }
    catch { return false; }
  })();

  /* `?days=` is a URL parameter for the same reasons `?recipe=` is: the back
     button undoes "show more", and a reload keeps how far you had scrolled. */
  const span = Math.min(MAX_DAYS, Math.max(WINDOW, Number(daysParam) || WINDOW));

  /**
   * The open recipe, resolved from the CORPUS — or left to the device.
   *
   * A plan can point at a recipe the user typed in themselves, and that one
   * lives in `owner.own` and nowhere else, so `OwnRecipeSheet` reads it off the
   * device. Which is also what keeps a private row out of a route that renders
   * on the server.
   */
  const isOwn = !!openRecipeId?.startsWith("rec_own_");
  const open = openRecipeId && !isOwn ? findRecipe(null, openRecipeId) : undefined;
  const props = open ? recipeProps(open) : null;
  const boundDate = openDate && /^\d{4}-\d{2}-\d{2}$/.test(openDate) ? openDate : undefined;
  const creator = open ? creatorOfRecipe(open.id) : undefined;

  const asks = clarifications().map((cl) => ({
    id: cl.id, trigger: cl.trigger, grants: cl.grants,
    question: cl.question, because: cl.because,
  }));

  return (
    <Page>
      <TimeZone />
      <Nav user={STATIC ? false : !!(await currentUser())} />
      <Shell
        drawer={
          <PantryDrawerLive search={searchIngredients} asks={asks} aisles={browseAisles()}
                            {...(weeePerk() ? { perk: weeePerk()! } : {})}
                            accounted={accounted} />
        }
      >
        {/* No dietary control here either — same argument as `/my-recipes`.
            A meal already on your calendar is a decision you made, and this page
            deliberately does not filter it. A control that changes nothing on
            the page it sits on teaches people it does nothing. It belongs on
            the grid, where discovery happens. */}
        <CalendarLive span={span} meals={[...MEALS]} searchRecipes={searchRecipes} />
        {span < MAX_DAYS && (
          /* A link, not a button: it is a navigation, the back button undoes it,
             and it works before any JavaScript has loaded. */
          <p className="cook-line">
            <Link className="btn btn-plain" href={`/calendar?days=${span + MORE}`} scroll={false}>
              {MORE} more days
            </Link>
          </p>
        )}
      </Shell>

      {isOwn && openRecipeId && (
        <OwnRecipeSheet recipeId={openRecipeId} stapleIds={starterList().map((s) => s.id)}
                        meals={[...MEALS]} linkStyle="modal"
                        {...(boundDate ? { boundDate } : {})}
                        {...(view ? { view } : {})}
                        payoffCreatorHrefs={creatorHrefs()}
                        hiddenIds={[...hiddenRecipeIds()]}
                        showDismiss showPlanButton planDefaultDays={1}
                        search={searchIngredients} onParse={readPastedIngredients} />
      )}

      {open && props && (
        <RecipeModal title={open.title}>
          <RecipeLive recipe={open} edges={props.edges} nodes={props.nodes}
                      mains={props.mains} stapleIds={props.stapleIds}
                      buyUrls={props.buyUrls}
                      meals={[...MEALS]} linkStyle="modal"
                      {...(boundDate ? { boundDate } : {})}
                      {...(view ? { view } : {})}
                      {...(open.components?.length ? { components: open.components
                        .map((cid) => findRecipe(null, cid))
                        .filter((c): c is NonNullable<typeof c> => !!c)
                        .map((c) => ({ id: c.id, title: c.title, href: `?recipe=${c.id}`,
                                       ...(c.image ? { image: c.image } : {}) })) } : {})}
                      {...((u) => u.length ? { usedIn: u.map((o) =>
                        ({ ...o, href: `?recipe=${o.id}` })) } : {})(usedInOf(open.id))}
                      {...(creator ? { creatorHref: `/creators/${creator.handle}` } : {})}
                      payoffCreatorHrefs={creatorHrefs()}
                      hiddenIds={[...hiddenRecipeIds()]}
                      showDismiss showPlanButton planDefaultDays={1}
                      search={searchIngredients} onParse={readPastedIngredients} />
        </RecipeModal>
      )}
    </Page>
  );
}

/**
 * Recipe id → creator page, for the payoff's cards.
 *
 * The curated shelf only, which is the pool the payoff ranks over. A per-deploy
 * fact about the shelf rather than about the kitchen, so it is handed over once
 * — the same split `HomeGrid`'s `meta` makes.
 */
function creatorHrefs(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of load().recipes) {
    const c = creatorOfRecipe(r.id);
    if (c) out[r.id] = `/creators/${c.handle}`;
  }
  return out;
}
