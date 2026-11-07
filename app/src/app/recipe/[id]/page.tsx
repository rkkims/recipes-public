/**
 * A recipe's own address — UX-SPEC §10.
 *
 * Recipes were reachable only as `?recipe=` over one of three pages, which is
 * right for the in-app modal (the back button closes it, a reload keeps your
 * place) and wrong for everything outside the app. There was no canonical URL
 * to share, and `layout.tsx` carried one static `metadata` object — so a link
 * pasted into a group chat previewed as *"what can I cook"* with no dish name
 * and no picture.
 *
 * Phase C is demand aggregation. This is the surface demand travels through,
 * and it was zero.
 *
 * ── This does not replace the modal ────────────────────────────────────────
 *
 * In-app navigation still opens `?recipe=`, because the modal's whole argument
 * is that you should not lose your place in a grid of sixty to look at one
 * dish. This route is for arrivals from outside — a shared link, a search
 * result — where there is no place to lose. Same `RecipeLive`, same writes, so
 * the two cannot drift.
 *
 * ── What is still rendered HERE, and why it matters ────────────────────────
 *
 * The recipe: title, source, canonical link, the ingredient list, the creator
 * byline, the related dishes. That is what a stranger arrived for and what a
 * crawler reads, so it is real HTML in the response rather than something a
 * script fills in. Slice C moved the KITCHEN half to the device (STATIC-SPEC
 * §2) — the chips' states, the cook history, the payoff — because those change
 * on a tap and used to cost a round trip and a full page render each. The
 * `updateStateHere` wrapper that existed for exactly that reason is gone with
 * them.
 *
 * ── The visitor may be a stranger ──────────────────────────────────────────
 *
 * No owner, no pantry, no cookie: every ingredient reads as missing, which is
 * honest and unhelpful. So the page says what it is and offers the one-tap
 * seeding that makes it useful (`starterIds`), rather than pretending the
 * empty match is a result.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Page } from "@/components/primitives";
import { Nav } from "@/components/Nav";
import { BackLink } from "@/components/BackLink";
import { TimeZone } from "@/components/TimeZone";
import { RecipeLive } from "@/components/RecipeLive";
import { PLAN_BUTTON } from "@/lib/surface";
import { load } from "@/lib/data";
import { searchIngredients } from "@/app/shelf-actions";
import { STATIC } from "@/lib/static-mode";
import { findRecipe, usedInOf } from "@/lib/recipes";
import { recipeProps } from "@/lib/recipe-props";
import { creatorOfRecipe, recipesOf } from "@/lib/creators";
import { hiddenRecipeIds } from "@/lib/claims";
import { CreatorUpLink } from "@/components/CreatorUpLink";
import { MEALS } from "@/lib/store";
import { currentUser } from "@/lib/owner";
import { readPastedIngredients } from "@/app/actions";

/* The autosuggest now lives in `app/shelf-actions.ts` — see the note there. */

/**
 * One page per KEPT recipe — STATIC-SPEC §3.
 *
 * `load().recipes` IS the curated shelf: `lib/data`'s hard gate drops anything
 * without a keep verdict and anything whose component was not kept too, which
 * is the same rule and the same two lines `src/static/build-data.ts` applies to
 * the bundle. So the pages this emits and the rows the device holds are the
 * same set by construction, and a card can never point at a recipe with no
 * page.
 *
 * Declared in BOTH modes and harmless in the server one: with no `dynamicParams
 * = false` beside it, these are simply the paths prerendered at build time and
 * everything else still renders on request, exactly as before.
 */
export function generateStaticParams() {
  return load().recipes.map((r) => ({ id: r.id }));
}

/**
 * Real per-recipe metadata — the whole reason this route exists.
 *
 * Only the CORPUS is described here. A user's own recipe lives in their owner
 * file, is visible to nobody else, and must never be given an Open Graph card:
 * generating share metadata for private content is how private content gets
 * shared.
 */
export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const recipe = load().recipes.find((r) => r.id === id);
  if (!recipe) return { title: "Recipe not found" };

  const bits = [
    recipe.cuisine,
    recipe.yield && `serves ${recipe.yield}`,
    `${recipe.requires.length} ingredients`,
  ].filter(Boolean);
  const description =
    `${recipe.title} from ${recipe.source}. ${bits.join(", ")}. ` +
    `See what you already have for it.`;

  return {
    title: `${recipe.title} · JipBap`,
    description,
    openGraph: {
      title: recipe.title,
      description,
      type: "article",
      /* Restated, not inherited — declaring `openGraph` here replaces the
         object in `layout.tsx` rather than merging with it, and a card with no
         site name reads as an anonymous link. */
      siteName: "JipBap",
      ...(recipe.image ? { images: [{ url: recipe.image }] } : {}),
    },
    // The source page is the original. We hold a reading of its ingredient
    // list, not its method, and pointing search engines at ourselves instead of
    // at the author would be taking credit for their work.
    alternates: { canonical: recipe.url },
  };
}

export default async function RecipePage(
  { params, searchParams }: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ date?: string; view?: string }>;
  },
) {
  const { id: recipeId } = await params;
  /* `params` is real in both modes — `generateStaticParams` supplies it. The
     QUERY is not: an exported page has no request, so the date a cook is bound
     to and the summary view open at their defaults. */
  const { date, view } = STATIC ? {} as Awaited<typeof searchParams> : await searchParams;

  /**
   * No owner read.
   *
   * `findRecipe` took one so it could also find a recipe the visitor had added
   * themselves. Own recipes live on the device now, and a `rec_o…` id is not a
   * public address in any case — it belongs to one kitchen and this route hands
   * out Open Graph cards. So this route is the corpus, and `?recipe=` over the
   * library is where your own copy opens.
   */
  const recipe = findRecipe(null, recipeId);
  if (!recipe) notFound();

  const { edges, nodes, mains, stapleIds, buyUrls } = recipeProps(recipe);
  const boundDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  const creator = creatorOfRecipe(recipe.id);

  return (
    <Page>
      <TimeZone />
      <Nav user={STATIC ? false : !!(await currentUser())} />
      {/* A recipe is where people arrive from outside — a shared link, a search
          result, "open it" on a request — and from inside, off the grid. The
          nav takes you to a PLACE; this takes you back to the one you came
          from, and falls back to the grid for the cold arrival. */}
      <p className="page-backline">
        <BackLink href="/" label="Back" />
      </p>

      {/* The way back up — this page is where a creator's audience lands, and
          the shelf above it should be one tap, not a search. The second link is
          the claimant's own door (CREATOR-SPEC §4): visible only to the person
          the claim belongs to, and only on crawled rows — a rec_c… recipe is
          already their word and is edited from the add page. */}
      {/* Extracted to its own component, and it is the alias seam static mode
          needs: the two controls in it are inline server actions, and Next
          refuses an export if a single server action is compiled at ALL —
          reachable or not. `next.config.mjs` swaps this import for a stub that
          renders nothing, which is the honest answer anyway: a claimant cannot
          hide a row on a site with no server to hear them (§7b names the
          creator channel going read-only as the one real loss). */}
      <CreatorUpLink recipe={recipe} creator={creator} />

      <article className="recipe-page" id="main" tabIndex={-1}>
        <RecipeLive recipe={recipe} edges={edges} nodes={nodes} mains={mains}
                    stapleIds={stapleIds} buyUrls={buyUrls}
                    meals={[...MEALS]} linkStyle="page"
                    {...(boundDate ? { boundDate } : {})}
                    {...(view ? { view } : {})}
                    {...(recipe.components?.length ? { components: recipe.components
                      .map((cid) => findRecipe(null, cid))
                      .filter((c): c is NonNullable<typeof c> => !!c)
                      .map((c) => ({ id: c.id, title: c.title, href: `/recipe/${c.id}`,
                                     ...(c.image ? { image: c.image } : {}) })) } : {})}
                    {...((u) => u.length ? { usedIn: u.map((o) =>
                      ({ ...o, href: `/recipe/${o.id}` })) } : {})(usedInOf(recipe.id))}
                    {...(creator ? { creatorHref: `/creators/${creator.handle}` } : {})}
                    /* CHECKOFF-SPEC §3's grid, and §3's guardrail from
                       INGREDIENT-HOME-SPEC: on THIS surface — the page a
                       creator's own audience lands on — the pool is
                       creator-scoped. Showing a visitor another creator's
                       dishes here routes the audience we were lent to a
                       competitor, which is the churn the whole creator side is
                       designed around. A recipe with no creator falls back to
                       the shelf; the in-app modal stays shelf-wide, because a
                       resident browsing their own shelves is nobody's lent
                       audience. */
                    {...(creator ? {
                      payoffPool: recipesOf(creator.id).map((r) => r.id),
                      payoffHeading:
                        `You can cook these from ${creator.displayName}, with what's in your kitchen`,
                    } : {})}
                    payoffCreatorHrefs={Object.fromEntries(
                      load().recipes
                        .map((r) => [r.id, creatorOfRecipe(r.id)])
                        .filter((e): e is [string, NonNullable<ReturnType<typeof creatorOfRecipe>>] => !!e[1])
                        .map(([rid, c]) => [rid, `/creators/${c.handle}`]))}
                    hiddenIds={[...hiddenRecipeIds()]}
                    /* CHECKOFF-SPEC §2 for the deep-link arrival: the visitor
                       skipped first-run, so a starter pantry is one button that
                       says exactly what it does. */
                    starterIds={stapleIds}
                    showPlanButton={PLAN_BUTTON}
                    search={searchIngredients} onParse={readPastedIngredients} />
      </article>
    </Page>
  );
}
