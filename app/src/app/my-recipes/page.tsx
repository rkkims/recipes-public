/**
 * My recipes — the user's own library.
 *
 * The third place, and the one that did not exist. "Saved" was a tab inside the
 * recommendation gallery, which made it a filter on the corpus rather than a
 * place of your own — and everything you had actually COOKED was reachable only
 * by finding the recipe again and opening its summary.
 *
 * Two claims, plus your own additions and the union of all three:
 *
 *   - **Cooked** — things you have made, most recent first, with how many times
 *     and how you rated them. This is the record UX-SPEC §8 calls the one thing
 *     a user gets here that they cannot get anywhere else.
 *   - **Saved** — things you meant to make. An intention, not a record (§4),
 *     and shown whatever the pantry currently says.
 *
 * Deliberately NOT ranked against the pantry. This page answers "what have I
 * cooked" and "what did I mean to cook"; the home page answers "what can I cook
 * tonight", and blending the two would make this a second, worse version of it.
 *
 * ── What this file does after the inversion ───────────────────────────────
 *
 * No owner read, and no write during render: `transferOwnUpgrades` used to run
 * in this function's body, which the stage-1 map flagged, and it is now an
 * action `MyRecipesLive` calls on mount. What is left here is the frame, the
 * per-deploy facts about the shelf that no device can look up (creator pages,
 * confirmation pens), the modal's static half, and the three server actions the
 * add form needs — the parser above all, which STATIC-SPEC §7b keeps on the
 * server for this slice.
 */
import { Page } from "@/components/primitives";
import { Nav } from "@/components/Nav";
import { TimeZone } from "@/components/TimeZone";
import { RecipeModal } from "@/components/RecipeModal";
import { RecipeLive } from "@/components/RecipeLive";
import { OwnRecipeSheet } from "@/components/OwnRecipeSheet";
import { MyRecipesLive, type ShelfMeta } from "@/components/MyRecipesLive";
import { starterList } from "@/lib/starter";
import { load } from "@/lib/data";
import { searchIngredients } from "@/app/shelf-actions";
import { STATIC } from "@/lib/static-mode";
import { findRecipe, usedInOf } from "@/lib/recipes";
import { hiddenRecipeIds } from "@/lib/claims";
import { recipeProps } from "@/lib/recipe-props";
import { signedIn } from "@/lib/account";
import { getOwner, MEALS } from "@/lib/store";
import { currentUser, ownerId } from "@/lib/owner";
import { lookupLink, readPastedIngredients } from "@/app/actions";
import { creatorOfRecipe } from "@/lib/creators";
import { Shell } from "@/components/Shell";
import { PantryDrawerLive } from "@/components/PantryDrawerLive";
import { clarifications } from "@/lib/clarify";
import { browseAisles } from "@/lib/browse";
import { weeePerk } from "@/lib/weee";

/* The autosuggest now lives in `app/shelf-actions.ts` — see the note there. */

/**
 * The shelf's per-deploy marks, for every recipe the library can hold.
 *
 * `lib/creators` and `lib/claims` read the filesystem, so a device cannot
 * answer either — and both are facts about the SHELF rather than about the
 * kitchen, so they are handed over once. The same split `HomeGrid`'s `meta`
 * makes, and the same size: the curated shelf, not the corpus.
 */
function shelfMeta(): Record<string, ShelfMeta> {
  const out: Record<string, ShelfMeta> = {};
  for (const r of load().recipes) {
    const c = creatorOfRecipe(r.id);
    const m: ShelfMeta = {
      ...(c ? { creatorHref: `/creators/${c.handle}` } : {}),
      ...(r.confirmed ? { confirmed: true } : {}),
    };
    if (m.creatorHref || m.confirmed) out[r.id] = m;
  }
  return out;
}

export default async function MyRecipes({ searchParams }: {
  /* `url`, `text` and `title` arrive from the share sheet — see the
     `share_target` block in `app/manifest.ts`. */
  searchParams: Promise<{ recipe?: string; date?: string; view?: string;
                          url?: string; text?: string; title?: string }>;
}) {
  /* No query on an exported page — see `page.tsx`'s note. Two things go with
     it here: the `?recipe=` sheet (cards point at the recipe's own page in
     static mode, see `openRecipeHref`) and the share target, which needs a URL
     handed to it and a parser to read it — both already disabled by §3. */
  const { recipe: openRecipeId, date: openDate, view,
          url: sharedUrl, text: sharedText, title: sharedTitle } =
    STATIC ? {} as Awaited<typeof searchParams> : await searchParams;

  /*
    A link shared in from another app.

    Android is inconsistent about which field carries it: many apps put the
    URL in `text`, some send it in `url`, and some send a caption in `text`
    with the link buried in it. So take `url` if it came, otherwise pull the
    first http(s) run out of `text` — which is what a shared TikTok caption
    actually looks like.
  */
  const shared = sharedUrl?.trim()
    || sharedText?.match(/https?:\/\/\S+/)?.[0]
    || undefined;

  /* The session, and only the session — the add form's gate and §9's ask. */
  const account = STATIC ? false : await (async () => {
    try { return signedIn(getOwner(await ownerId())); }
    catch { return false; }
  })();

  /**
   * The open recipe, resolved from the CORPUS — or left to the device.
   *
   * A recipe the user added themselves lives in `owner.own` and nowhere else,
   * so there is nothing here to resolve and nothing here that should try:
   * `OwnRecipeSheet` reads it off the device, which is also what keeps a
   * private row out of a route that mints share metadata.
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
  const meta = shelfMeta();

  return (
    <Page>
      <TimeZone />
      <Nav user={STATIC ? false : !!(await currentUser())} />

      {/*
        The pantry, on the third page too — UX-SPEC §1.

        This was the one destination in the nav with no pantry and no add box,
        so a third of the product failed the requirement the spec opens with:
        "a persistent add-ingredient affordance on EVERY page". You remember the
        fridge at random moments, and this is a page you sit on.
      */}
      <Shell drawer={<PantryDrawerLive search={searchIngredients} asks={asks}
                                       aisles={browseAisles()}
                                       {...(weeePerk() ? { perk: weeePerk()! } : {})}
                                       accounted={account} />}>
        {/* No dietary control here. Every shelf on this page is the user’s OWN
            saves and cooks, and those are deliberately NOT filtered — hiding a
            dish you have cooked because you later set a preference would be
            absurd. A control whose setting changes nothing on the page it sits
            on is a control that teaches people it does nothing. It lives on the
            grid, where §6 actually bites. */}
        {/* No sign-up ask on this page. It explained why the add form is
            missing — a reasonable thing to say, and the wrong page to say it
            on. §9’s ask lives in the top bar, where it is about the session
            rather than about this shelf. */}
        <MyRecipesLive meta={meta} account={account}
                       {...(shared ? { shared } : {})}
                       {...(sharedTitle ? { sharedTitle } : {})}
                       search={searchIngredients} onParse={readPastedIngredients}
                       onLookup={lookupLink} />
        {/* The "find something to cook" prompt lived here, under an empty
            Section, and again inside the empty tab above. Cook is the first
            item in the bar on every screen and the brand goes there too — a
            page that points at the front door is a page telling you something
            you can see. */}
      </Shell>

      {isOwn && openRecipeId && (
        <OwnRecipeSheet recipeId={openRecipeId} stapleIds={starterList().map((s) => s.id)}
                        meals={[...MEALS]} linkStyle="modal"
                        {...(boundDate ? { boundDate } : {})}
                        {...(view ? { view } : {})}
                        payoffCreatorHrefs={Object.fromEntries(
                          Object.entries(meta)
                            .filter(([, m]) => !!m.creatorHref)
                            .map(([id, m]) => [id, m.creatorHref!]))}
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
                      payoffCreatorHrefs={Object.fromEntries(
                        Object.entries(meta)
                          .filter(([, m]) => !!m.creatorHref)
                          .map(([id, m]) => [id, m.creatorHref!]))}
                      hiddenIds={[...hiddenRecipeIds()]}
                      showDismiss showPlanButton planDefaultDays={1}
                      search={searchIngredients} onParse={readPastedIngredients} />
        </RecipeModal>
      )}
    </Page>
  );
}
