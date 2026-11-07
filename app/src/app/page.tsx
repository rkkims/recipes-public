/**
 * The whole product, Phase A.
 *
 * A server component: it reads the owner's state, ranks the corpus, and hands
 * plain data to the client parts. All the judgement lives in `lib/match.ts`;
 * this file decides what to show, not what is true.
 */
import { Page, Note, Section } from "@/components/primitives";
import { SaveButton } from "@/components/SaveButton";
import { CLASSES } from "@/lib/diet";
import { ALLERGENS } from "@/lib/allergen-vocab";
import { load, nameOf, resolveId } from "@/lib/data";
import { cuisinesOf, scoreRecipe } from "@/lib/match";
import { RecipeModal } from "@/components/RecipeModal";
import { RecipeMore } from "@/components/RecipeMore";
import { RecipeDetail, type DetailIngredient } from "@/components/RecipeDetail";
import { MyVersion } from "@/components/MyVersion";
import { MyVersionRead } from "@/components/MyVersionRead";
import { Summary } from "@/components/Summary";
import { PlanButton } from "@/components/PlanButton";
import { PLAN_BUTTON } from "@/lib/surface";
import { EditRecipe } from "@/components/EditRecipe";
import Link from "next/link";
import { peek } from "@/lib/diet";
import { cooksOnDate, dayKey, daysAway, dietOf, dismissedNow, getOwner, latestCook, MEALS, pantryOf, StoreCorrupt, summaryFor , updateOwnRecipe} from "@/lib/store";
import { retryOwnImages } from "@/lib/user-images";
import { currentUser, ownerId, ownerTz } from "@/lib/owner";
import { editOwnRecipe, madeIt, planMeal, rateCook, removeOwnRecipe, readPastedIngredients, settleUp, finishFirstRun, dismissRecipe, reviewPantryAfterAbsence, undoMadeIt, saveRecipe, updateState, noteOpened , setIngredientNote, excludeIngredient} from "@/app/actions";
import { completeSearch, offersForBlocking, searchIngredients } from "@/app/shelf-actions";
import { STATIC } from "@/lib/static-mode";
import { Shell } from "@/components/Shell";
import { TimeZone } from "@/components/TimeZone";
import { Nav } from "@/components/Nav";
import { allRecipesFor, usedInOf } from "@/lib/recipes";
import { weeePerk, weeeUrlFor } from "@/lib/weee";
import { cookRows, detailRows, dietFor, statesOf, extrasOf } from "@/lib/detail";
import { isStaple, starterList } from "@/lib/starter";
import { FirstRun } from "@/components/FirstRun";
/* The device's grid and drawer — slice B. Slice C converted the other four
   pages onto the same two components and deleted the server drawer, so this is
   no longer the exception it was written as. What is still server-rendered
   here is the `?recipe=` modal below: `RecipeLive` is what the other surfaces
   open now, and folding this one into it is the next slice's edit, not this
   one's. */
import { HomeGrid, type CardMeta } from "@/components/HomeGrid";
import { PantryDrawerLive } from "@/components/PantryDrawerLive";
import { clarifications } from "@/lib/clarify";
import { browseAisles } from "@/lib/browse";
import { signedIn } from "@/lib/account";
import { hiddenRecipeIds } from "@/lib/claims";
import { DietBar, dietNotices } from "@/components/DietBar";
import { Notices } from "@/components/Notices";
import { FindRecipe } from "@/components/FindRecipe";
import { CuisineBar, CUISINES, OTHERS } from "@/components/CuisineBar";
import { WelcomeBack } from "@/components/WelcomeBack";
import { ageOf } from "@/components/Pantry";
import { mainsOf } from "@/lib/mains";
import { EditCooks } from "@/components/EditCooks";
import { needsTime, waitReason } from "@/lib/waiting";
import { creatorOfRecipe, unlistedRecipeIds } from "@/lib/creators";

/**
 * The only page here that a stranger reaches by searching, so the only one that
 * carries a search-facing title. `layout.tsx` keeps the bare name for the app
 * surfaces behind it.
 *
 * Two jobs, one string. The first is the name: word of mouth is the whole
 * distribution plan, and someone who hears "jipbap" in a thread on Tuesday and
 * types it on Saturday has to land here. The second is the one query shape a
 * search page cannot answer for itself, because it does not know what is in
 * your kitchen.
 *
 * The hangul is in the DESCRIPTION, not the title. A crawler still reads 집밥
 * and someone searching it still lands here, but the title is the line a
 * stranger sees in a result list and in a shared card, and it reads as one
 * language.
 *
 * The em dash here is deliberate and is the ONE place the site-wide ban on
 * them does not apply — the home `title` and the `og:title` it is copied into,
 * and nowhere else. That rule is about body copy, where a dash is usually a
 * sentence that has not been decided; a search title is not a sentence, it is a
 * name and a claim set side by side, and that is the punctuation for it.
 *
 * It was swept to a colon on 2026-08-18 with everything else and restored the
 * same day at Richard's word: *"only allow em dash in homepage title."* So the
 * exception is now stated twice, here and in the memory that drove the sweep.
 * Do not let the next sweep take it again.
 */
export const metadata = {
  title: "JipBap — Cook Asian at home, from what's already in your kitchen",
  description:
    "JipBap is Asian home cooking, 집밥. Say what is in your kitchen and it " +
    "shows the Korean, Chinese and Japanese recipes you can cook right now, " +
    "and what one more ingredient would unlock.",
  alternates: { canonical: "/" },
  /* `siteName` and `type` are repeated from `layout.tsx` rather than inherited:
     a route that declares `openGraph` replaces the parent's object outright
     instead of merging into it, so anything not restated here is simply
     dropped from the card. */
  openGraph: {
    title: "JipBap — Cook Asian at home, from what's already in your kitchen",
    description:
      "Say what is in your kitchen. See what you can cook right now.",
    url: "/",
    siteName: "JipBap",
    type: "website" as const,
  },
};

/* The four reads this page still asks a server for now live in one module —
   `app/shelf-actions.ts`. They were declared inline here (and, identically, in
   three other pages); gathering them is what lets static mode swap ALL of them
   at once for the bundle-backed copies, which is the one thing an exported
   site has no other way to do. Same bodies, same shapes, same comments. */

/**
 * The §3a lines a match earns — one per requirement the pantry answered with
 * something BROADER than the recipe named. Built here rather than in the
 * component so the component stays about rendering and the id→name resolution
 * stays in one place.
 */
function checksFor(m: { covered: Array<{ need: string; via: string; have?: string; disclose?: boolean }> },
                   nameOf: (id: string) => string) {
  return m.covered
    .filter((c) => c.disclose && c.have)
    .map((c) => ({
      wants: { id: c.need, name: nameOf(c.need) },
      have: { id: c.have!, name: nameOf(c.have!) },
    }));
}

/**
 * The recipe modal is addressed by a query parameter, not a route.
 *
 * `?recipe=rec_x` over whichever page you were on. That buys the two things
 * that actually bite — the back button closes it, and a reload keeps your place
 * — without parallel or intercepting routes, and the calendar will open the
 * same modal by setting the same parameter. See `RecipeModal`.
 */
/** How many cards a tab shows before asking. */
const PAGE = 30;

export default async function Home({ searchParams }: {
  searchParams: Promise<{ recipe?: string; date?: string; view?: string; n?: string;
                          allow?: string; c?: string; q?: string;
                          /* The shuffle seed for Explore and Can-cook — see
                             `shuffleSeed`. `tab` is read by `Gallery` on the
                             client and never here. */
                          seed?: string; tab?: string }>;
}) {
  /**
   * The two things an exported page does not have: a cookie and a query.
   *
   * Both are per-REQUEST facts, and a prerendered file is not a request. Reading
   * either would also make this route dynamic, which `output: "export"` refuses
   * outright — so static mode does not read them, rather than reading them and
   * discarding the answer.
   *
   * Nothing above the fold is lost by that. The grid, the drawer, the diet
   * control and the first-run screen all draw from the device already; what they
   * were still taking from the server here is the ADDRESS, and `HomeGrid` reads
   * it on the client instead (see its `Addressed`). What genuinely does not
   * survive is the `?recipe=` modal — the recipe's own page takes over, see
   * `openRecipeHref` — and the two owner-derived notices below.
   */
  const id = STATIC ? "" : await ownerId();
  const tz = STATIC ? "UTC" : await ownerTz();
  const { recipe: openRecipeId, date: openDate, view, n, allow, c, q, seed } =
    STATIC ? {} as Awaited<typeof searchParams> : await searchParams;

  /**
   * A different shelf every visit — but not mid-browse.
   *
   * The shelves are ranked, and a ranking over a corpus that did not change
   * overnight opens on the same cards every time. Reshuffling on every request
   * fixes that and breaks something else: "show 30 more" is a request, so
   * paging would reshuffle the thirty you had just read and lose your place.
   *
   * So the seed lives in the address. Arrive without one and you get a new
   * order; `link()` carries it from then on, so paging and opening a recipe
   * keep it. Refreshing the bare URL is a fresh arrival and reshuffles, which
   * is the behaviour asked for; refreshing a paged URL holds still, which is
   * the behaviour anyone mid-browse would want.
   *
   * One seed for both shuffled shelves — Explore and Can-cook. They reshuffle
   * together on a fresh arrival, which is coherent, and it keeps the address
   * to one parameter. Can-cook rotated DAILY until 2026-08-13 (`${id}:${today}`
   * as the seed); replaced on the reviewer's call because a pantry changes more
   * often than a corpus, and the person refreshing that shelf is asking for
   * another look at what they can already make, not for yesterday's order held
   * until midnight.
   *
   * `Math.random` is right here and would be wrong in `shuffleDaily`'s daily
   * callers: a daily seed must agree with itself all day, this one must
   * disagree with its last visit.
   */
  /*
    The seed is no longer MINTED here, and that is the whole of what moved.

    It used to be minted per request when the address carried none, because a
    request was the only thing that knew an arrival had happened. The grid is
    the device's now, so the arrival it has to hold still across is a VISIT:
    `useVisitSeed` mints one into `sessionStorage` and every card's href
    carries it from then on. What survives here unchanged is the rule that the
    address wins — a shared or paged URL opens the order it names — so this
    passes `seed` through to the client and to `link()` exactly as it arrived.
  */
  const term = q?.trim().toLowerCase() || undefined;

  /**
   * One query string, built once, KEEPING whatever else is set.
   *
   * Every link on this page was a bare `?recipe=${id}` or `?n=${count}`, which
   * replaces the whole query rather than adding to it. That silently threw away
   * the cuisine chip: filter to Chinese, open a recipe, close it, and you were
   * back to everything with the chip un-highlighted. Adding a search term would
   * have made the same bug twice as easy to hit — you would lose the search by
   * looking at one of its results.
   *
   * `recipe` and `date` are NOT carried: they address the modal, so they belong
   * only to the link that opens it. Everything else describes what the page is
   * showing and survives.
   */
  const link = (over: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    /* `seed` rides along so paging keeps the shuffled order — see above. */
    for (const [k, v] of Object.entries({ c, q: term, n, allow, seed, ...over }))
      if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `?${s}` : "?";
  };

  /**
   * How many cards to show, in the URL rather than in client state.
   *
   * The same reasoning as the modal's `?recipe=`: the back button undoes it and
   * a reload keeps your place. Clamped, because it arrives from a query string
   * and rendering an unbounded number of cards is a denial of service you write
   * for yourself.
   *
   * ── Why 300 and not 600 ───────────────────────────────────────────────
   *
   * Measured, because the guess was wrong twice. The cost of this page is
   * almost entirely the CARDS: loading the ontology and ranking all 4,874
   * recipes against the pantry is a ~35ms floor that does not move, and
   * everything above it scales with how many are drawn.
   *
   *   30 cards →   93 KB,  37ms
   *  300 cards →  683 KB, 157ms
   *  600 cards → 1.35 MB, 310ms
   *
   * About 2.2 KB a card, and there is no waste in it to remove — the pantry
   * state map that looked like the culprit appears exactly once in the payload,
   * because React Flight already dedupes it.
   *
   * The number that matters is not the download, which is fast. It is what the
   * BROWSER then holds: switching cuisine resets this to 30, so the new page is
   * cheap, and the wait is the old page being torn down — client work
   * proportional to the view you are leaving, which no server change touches.
   * Nobody chooses 600; the lazy loader walks you into it.
   *
   * Halving the ceiling halves that worst case. Making card count stop
   * mattering means virtualising the grid, which is a real piece of work and
   * fights the `?n=` design that keeps your place across a reload — a v2
   * decision, not something to slip into a UX pass.
   */
  const shown = Math.min(Math.max(PAGE, Number(n) || PAGE), 300);

  /**
   * The one failure we can name in advance, handled here rather than thrown.
   *
   * A corrupt owner store used to reach the error boundary, and in production
   * Next replaces a server error with a generic page — so the message that
   * matters ("your data is still there, here is what to do") never arrived.
   * Anticipated failures deserve a specific answer; the boundary is for the
   * ones we did not see coming.
   */
  /* Static mode has no owner file to read and no corruption to report — the
     device's own version of this guarantee is `client-store.keepCorrupt`, and
     `HomeGrid` prints it. */
  let owner;
  try {
    owner = STATIC ? null : getOwner(id);
  } catch (e) {
    if (!(e instanceof StoreCorrupt)) throw e;
    return (
      <Page>
        <Section title="The pantry file could not be read">
          <Note>
            Nothing deleted, and nothing will be written until this is fixed.
          </Note>
          <p className="note">
            Move <code>{e.file}</code> aside to start empty, or repair the JSON.
          </p>
          <pre className="fail-detail">{e.message}</pre>
        </Section>
      </Page>
    );
  }
  const { relations, byId } = load();
  // Corpus + own, through the one helper that knows the difference.
  const allRecipes = allRecipesFor(owner);
  const pantry = pantryOf(owner, resolveId);

  /**
   * Dietary exclusions come off the top — USER-SPEC §6.
   *
   * Applied before ranking rather than after, so a hidden recipe cannot occupy
   * a slot in "cook tonight" and then vanish. The count is kept and shown: §6
   * requires the product to say what it is hiding and why.
   */
  /**
   * Standing setting, then this browse's lift — two layers, see `peek`.
   *
   * `standing` is what the user told us and what the control shows; `diet` is
   * what this render filters by. Keeping both means the topbar can say "your
   * setting is unchanged" and mean it.
   */
  const standing = dietOf(owner, resolveId);
  /** Aliases for the shared modal helpers: the STANDING setting, and the ontology. */
  const standingDiet = standing;
  const byIdMap = byId;
  const { lifted } = peek(standing, allow);

  const saved = new Set(
    Object.values(owner?.recipes ?? {}).filter((r) => r.saved).map((r) => r.recipe_id));

  /** Use-today pins. One of them is a hard filter in `rank` — see the note below. */
  const pinned = [...pantry.useFirst];

  /**
   * Been away long enough that the pantry is probably wrong.
   *
   * Fourteen days: long enough that fresh things have certainly gone and short
   * enough to catch someone before they act on a bad "have everything". Gated
   * on having a pantry at all — there is nothing to review otherwise — and on
   * having been onboarded, so a new owner never sees both panels.
   *
   * Staples are left out for the reason the post-cook block leaves them out:
   * salt did not go off, and asking about it teaches people to dismiss the
   * panel unread.
   */
  const away = daysAway(owner);
  const stale = (away !== null && away >= 14 && owner?.onboarded_at)
    ? Object.values(owner.ingredients ?? {})
        .filter((r) => r.in_pantry && !isStaple(resolveId(r.ingredient_id)))
        .sort((a, b) => a.added_at.localeCompare(b.added_at))
        .slice(0, 20)
        .map((r) => ({
          id: resolveId(r.ingredient_id),
          name: nameOf(resolveId(r.ingredient_id)),
          age: ageOf(r.added_at) ?? "a while",
        }))
    : [];
  // Thumbnails whose mirror failed at save time get another try here, off the
  // render path: nothing awaits it, and the next view reads the local copy.
  if (owner) void retryOwnImages(owner.id, owner.own, updateOwnRecipe);

  /**
   * The open recipe, scored on its own.
   *
   * Read from the UNFILTERED corpus: a link to a recipe should open it, and
   * silently showing nothing because it clashes with a dietary setting is the
   * one thing USER-SPEC §6 forbids. The modal says so instead.
   */
  const open = openRecipeId ? allRecipes.find((r) => r.id === openRecipeId) : undefined;
  const openMatch = open ? scoreRecipe(open, pantry, relations) : undefined;
  /** The open recipe, if it is one the user added — editable, unlike the corpus. */
  const openOwn = open ? (owner?.own ?? []).find((o) => o.id === open.id) : undefined;

  /**
   * The modal always carries a DATE, defaulting to today.
   *
   * That one parameter is what makes the grid, the calendar and a recipe's own
   * page the same component: the grid opens today implicitly, a calendar cell
   * opens its own square. History is NOT bound to it — see `MyVersion`.
   */
  const today = dayKey(new Date(), tz);
  const boundDate = openDate && /^\d{4}-\d{2}-\d{2}$/.test(openDate) ? openDate : today;
  const summary = open ? summaryFor(owner, open.id) : undefined;
  const todays = open ? cooksOnDate(owner, open.id, boundDate, tz) : [];
  const lastCook = open && owner ? latestCook(owner, open.id) : null;
  // Planning is about future cooking, so the picker opens on tomorrow rather
  // than inviting you to plan a dinner you are already having.
  const tomorrow = dayKey(new Date(Date.now() + 24 * 60 * 60 * 1000), tz);
  const dateLabel = boundDate === today
    ? "today"
    : new Date(`${boundDate}T12:00:00`).toLocaleDateString(undefined,
        { weekday: "short", day: "numeric", month: "short" });
  /** One states object for the whole grid — every card's chips read from it. */
  const chipStates = statesOf(owner, resolveId);

  const detail: DetailIngredient[] = openMatch && open
    ? detailRows(open, openMatch, statesOf(owner, resolveId), nameOf, weeeUrlFor)
    : [];

  const onList = new Set(
    Object.values(owner?.ingredients ?? {}).filter((r) => r.on_list)
      .map((r) => resolveId(r.ingredient_id)));
  /**
   * What you already decided to eat today.
   *
   * Read from the unfiltered set for the same reason a saved recipe is: a plan
   * is a commitment the user made, and hiding it because a dietary setting
   * changed would be the product overruling them rather than filtering for
   * them.
   */
  const byRecipeId = new Map(allRecipes.map((r) => [r.id, r]));
  const titleOf = (rid: string) => byRecipeId.get(rid)?.title ?? "a recipe no longer indexed";
  /* Notes are excluded: "Tonight: eat out" is a link to nothing, and the line
     exists to get you into a recipe. */
  const tonight = (owner?.plans ?? [])
    .filter((p) => p.date === today && !p.cook_id && p.recipe_id);

  /**
   * What the CLIENT grid cannot know, gathered once — see `HomeGrid`'s header.
   *
   * Three server-bound facts per recipe, none of them about this kitchen: the
   * creator's shelf (`lib/creators` reads the registry and the claim overlay),
   * the confirmation pen (a creator's own answer, arriving at runtime rather
   * than at build), and the head-start badge (`lib/waiting` reads curation and
   * the enrichment pass). Only rows that have something to say are included,
   * so this is a few dozen entries against the shelf rather than a row per
   * recipe.
   */
  const meta: Record<string, CardMeta> = {};
  for (const r of allRecipes) {
    const creator = creatorOfRecipe(r.id);
    const wait = waitReason(r);
    const row: CardMeta = {
      ...(creator ? { creatorHref: `/creators/${creator.handle}` } : {}),
      ...(r.confirmed ? { confirmed: true } : {}),
      ...(needsTime(r) ? { makeAhead: true } : {}),
      ...(wait ? { waitReason: wait } : {}),
    };
    if (Object.keys(row).length > 0) meta[r.id] = row;
  }

  /**
   * CREATOR-SPEC §6/§6a, carried to a device holding an older bundle.
   *
   * A withdrawal or a hidden row is a judgement made at RUNTIME — the bundle
   * was generated before it and cannot know. The client filters its shelf on
   * this for the same reason `servable` does on the server: a creator who left
   * must leave every pool built from the corpus, including one held in a
   * browser.
   */
  const hiddenIds = [...unlistedRecipeIds(), ...hiddenRecipeIds()];

  /* CREATORS-TAB-SPEC §4's payoff was computed here, from `owner.follows` and
     the server's creator index, and handed down as a prop. It moved into
     `HomeGrid` with the rest of the ranking: a follow is device state now
     (`setFollowing`), and in static mode there is no server owner to read one
     from — so the boost was quietly dead on exactly the build that ships. The
     device's follows and the bundle's `recipe_ids` are both there already. */

  /**
   * Every shelf on this page is computed on the DEVICE now — `HomeGrid`.
   *
   * What stood here was the product's centre of gravity: `rank`, `nearMisses`,
   * `explore`, the seeded shuffle, the blocking-ingredient inversion and the
   * search shelf, ~250 lines of it, run per request against the owner file. It
   * moved wholesale rather than in pieces, calling the same modules with the
   * same arguments, because a shelf that is ranked one way on a server and
   * another way in a browser is two products (STATIC-SPEC §2).
   *
   * The memo that used to guard it (`lib/shelves`, keyed on pantry + diet +
   * dismissals) went with it and is not replaced: it existed because every
   * modal open re-ran ~560ms of ranking on a request that changed none of the
   * inputs. A device ranks once per pantry CHANGE, inside `useMemo`, and a
   * modal open changes nothing it depends on. `lib/shelves` stays for the
   * pages that still rank on the server.
   */

  return (
    <Page>
      <TimeZone />
      {/* Whether THIS REQUEST carries a session. A prerendered file has no
          request, and static mode has no `/signin` to send anyone to — `Nav`
          says so in the corner rather than offering a link to nothing. */}
      <Nav user={STATIC ? false : !!(await currentUser())} />
      {/*
        First run — DECISIONS §3. Above the Shell, because until it is answered
        it IS the page: a gallery of four empty tabs behind it would be the very
        thing it exists to prevent.
      */}
      {/*
        Been away — check the pantry before trusting anything computed from it.

        Below first run and above everything else, and mutually exclusive with
        it: a brand-new owner has no pantry to review, and a returning one has
        already been onboarded.
      */}
      {/* Both panels stay SERVER-gated — whether to ask is a question about
          the owner the page already read, and the answer arrives on the next
          render because both writes revalidate. What is `live` is where the
          answer LANDS: the grid under them is the device's, so a starter
          pantry or a removed row that reached only `owners.json` would leave
          the shelves saying the opposite of what the user just said. */}
      {stale.length > 0 && away !== null && (
        <WelcomeBack items={stale} days={away}
                     onSettle={reviewPantryAfterAbsence}
                     onDismiss={() => reviewPantryAfterAbsence([])} live />
      )}
      {!owner?.onboarded_at && (
        <FirstRun starter={starterList()} classes={CLASSES} allergens={[...ALLERGENS]}
                  onFinish={finishFirstRun} live />
      )}
      <Shell
        drawer={
          /* The device's copy of the drawer — `PantryDrawerLive`. The rows,
             the plan's shopping and the clarification answers all come from
             `client-store` now, so a tick is a state change rather than a
             round trip; what the server still hands over is what a device
             cannot know: the questions themselves, the browsable kitchen, the
             perk line, and whether THIS REQUEST is signed in.
             §5 still forbids the affiliate anywhere on the results grid, and
             the drawer is where it may live — but not in this copy of it: the
             buy link is a grocery-PAGE placement (`only === "list"`), which
             the home drawer has never set. */
          <PantryDrawerLive search={searchIngredients}
                            asks={clarifications().map((cl) => ({
                              id: cl.id, trigger: cl.trigger, grants: cl.grants,
                              question: cl.question, because: cl.because,
                            }))}
                            aisles={browseAisles()}
                            {...(weeePerk() ? { perk: weeePerk()! } : {})}
                            accounted={signedIn(owner)} />
        }
      >
        {/* One band: search and the (collapsed) dietary control are both
            single-line controls, so they share a row instead of stacking two. */}
        {/* Excluded ingredients are a restriction like any other, so they are
            named in the same control rather than being invisible — see `Diet`. */}
        <DietBar classes={[...standing.classes]} allergens={[...standing.allergens]}
                 excluded={[...standing.excludes].map((id) => ({ id, name: nameOf(id) }))}>
          {/* `key` on the term so a navigation seeds the box with what is now
              being searched — the word stays there to be edited. `n` is dropped
              from the link on purpose: a new search starts at page one. */}
          <FindRecipe key={term ?? ""} search={completeSearch}
                      {...(term ? { chosen: term } : {})}
                      keep={link({ q: undefined, n: undefined }).replace(/^\?/, "")} />
        </DietBar>

        {/* Below the search rather than beside it: it changes what the whole
            page is about, and a control that reshapes everything under it
            belongs above that, not tucked into a row of one-line inputs. */}
        {/* The chip the address names, validated the same way the grid
            validates it: an unknown value falls through to everything rather
            than to nothing, so a hand-edited or stale URL shows the app. */}
        <CuisineBar {...(c && (CUISINES.includes(c) || c === OTHERS) ? { chosen: c } : {})}
                    href={(next) => link({ c: next, n: undefined })} />

        {/*
          Every status line the page has, in one strip and ordered by what it
          costs you to miss — see `Notices`. Four separately-bordered blocks
          stacked above the gallery was the problem: each justified, together a
          wall in front of the thing they were explaining.
        */}
        <Notices items={[
          /* No `hidden` tally: the count of casualties stopped being printed
             (see `dietNotices`), and computing it here would mean running the
             whole diet filter on the server to feed a notice that no longer
             says anything about it. The grid runs the same filter on the
             device, where the result is actually used. */
          ...dietNotices({ classes: [...standing.classes], lifted, here: "/" }),
          /*
            A single Use-today pin is a HARD FILTER (`rank`), and it had no
            indicator anywhere. One forgotten pin silently reduces the whole
            gallery to recipes containing a scallion thrown out last week — a
            thin, strange-looking page whose cause is a chip in a closed drawer.
            Pins lapse after a week now, which shortens the window but does not
            close it.
          */
          ...(pinned.length === 1 ? [{
            kind: "filter" as const, key: "pin",
            children: (
              <>Only recipes using <b>{nameOf(pinned[0]!)}</b>.</>
            ),
          }] : []),
          /*
            Tonight's plan, on the page you actually cook from. The calendar was
            write-only: you planned Thursday there and this page then ranked
            4,874 recipes at you and said nothing about the decision you had
            already made.
          */
          ...(tonight.length > 0 ? [{
            kind: "info" as const, key: "tonight",
            children: (
              <>Tonight: {tonight.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && " · "}
                  <Link href={link({ recipe: p.recipe_id!, date: today })} scroll={false}>
                    {titleOf(p.recipe_id!)}
                  </Link>
                  <span className="note"> ({p.meal})</span>
                </span>
              ))}</>
            ),
          }] : []),
        ]} />

        {/*
          The grid, drawn from the device — `HomeGrid`.

          What stood here was five tab panels of server-rendered cards, handed
          to `Gallery` as pre-rendered trees. `Gallery` and `RecipeCard` are
          unchanged and still do exactly what they did; what moved is who
          computes the shelves and where the chips' state comes from. The
          address still decides everything about WHAT is being shown — the
          cuisine chip, the search term, the page size, the peeked filter and
          the shuffle seed all travel as props, parsed once, here.
        */}
        <HomeGrid {...(c ? { c } : {})} {...(q ? { q } : {})}
                  {...(n ? { n } : {})} {...(allow ? { allow } : {})}
                  {...(seed ? { seed } : {})}
                  meta={meta} hiddenIds={hiddenIds}
                  {...(weeePerk() ? { perk: weeePerk()! } : {})}
                  offersFor={offersForBlocking} />

        {/* The corpus counts, and the "hidden by you" line that outlived
            them, both moved with the grid — the dismissal count is a fact
            about the shelf being drawn, so it is drawn where the shelf is
            (`HomeGrid`). RECIPE-SPEC §1's disclosure is unaffected: it is
            made against the recipe it is about, on the card and in the modal,
            never as a statistic under a grid. */}
      </Shell>

      {open && (
        /* `live`: the open mark has to reach the DEVICE as well as the file,
           because the shelf that reads `opened_at` is the device's now — see
           `RecipeModal`. */
        <RecipeModal title={open.title} recipeId={open.id} onOpened={noteOpened} live>
          <RecipeDetail recipeId={open.id} title={open.title} source={open.source} url={open.url}
                        {...(open.components?.length ? { components: open.components
                          .map((cid) => byRecipeId.get(cid))
                          .filter((c): c is NonNullable<typeof c> => !!c)
                          .map((c) => ({ id: c.id, title: c.title, href: link({ recipe: c.id }),
                                         ...(c.image ? { image: c.image } : {}) })) } : {})}
                        {...((u) => u.length ? { usedIn: u.map((o) =>
                          ({ ...o, href: link({ recipe: o.id }) })) } : {})(usedInOf(open.id))}
                        sheet={{ extras: extrasOf(owner, resolveId),
                                 excludedIds: standing.excludes,
                                 onNote: setIngredientNote,
                                 onExclude: excludeIngredient }}
                        /* No payoff grid in the COOK page's modal (the user's
                           call, 2026-08-16): the grid is already the screen
                           behind this sheet, so "also cookable" cards at the
                           bottom were the page repeated inside its own modal.
                           The standalone recipe page keeps its payoff — there
                           is no grid behind it. */
                        {...((c) => c ? { creatorHref: `/creators/${c.handle}` } : {})(creatorOfRecipe(open.id))}
                        image={open.image} cuisine={cuisinesOf(open).join(" · ")} sourceRating={open.rating}
                        confirmed={open.confirmed}
                        diet={dietFor(open, standingDiet, byIdMap)}
                        {...(openOwn?.steps ? { steps: openOwn.steps } : {})}
                        more={<RecipeMore recipeId={open.id}
                                          dismissed={dismissedNow(owner).has(open.id)}
                                          onDismiss={dismissRecipe} />}
                        ingredients={detail} incomplete={open.unresolved.length > 0}
                        save={<SaveButton recipeId={open.id} heart
                                          saved={saved.has(open.id)} onSave={saveRecipe} />}
                        history={view === "summary" && summary ? null : (
                          <MyVersionRead cooks={summary?.mine.cooks ?? 0}
                                       {...((n) => n ? { standing: n } : {})(owner?.recipes?.[open.id]?.note)}
                                         {...(lastCook ? { last: {
                                           at: lastCook.cooked_at,
                                           ...(lastCook.rating !== undefined ? { rating: lastCook.rating } : {}),
                                           ...(lastCook.note !== undefined ? { note: lastCook.note } : {}),
                                         } } : {})}
                                         edit={<EditCooks
                                           meals={MEALS} live
                                           onRate={rateCook} onDelete={undoMadeIt}
                                           cooks={(summary?.mine.events ?? []).map((e) => ({
                                             id: e.id, at: e.cooked_at,
                                             ...(e.meal !== undefined ? { meal: e.meal } : {}),
                                             ...(e.rating !== undefined ? { rating: e.rating } : {}),
                                             ...(e.note !== undefined ? { note: e.note } : {}),
                                           }))} />} />
                        )}
                        /* UX-SPEC §1: one gesture from anywhere an ingredient
                           name appears. The chips write to the same pantry the
                           drawer does — and on THIS page that pantry is the
                           device's, so `live` sends them through the dual-write
                           pair rather than straight to the action. */
                        onUpdate={updateState} live
                        /* Spread rather than passed, so that a row with nothing
                           in it is `undefined` and not an empty fragment —
                           `RecipeDetail` renders `.modal-actions` on
                           truthiness, and a fragment is truthy however empty it
                           is. With the plan button off at v1 (`lib/surface`),
                           empty is now the common case: every corpus recipe. */
                        {...(openOwn || PLAN_BUTTON ? { actions: (
                          <>
                            {/* Only a recipe the user added can be edited —
                                the corpus is generated and a change here would
                                be overwritten by the next pipeline run. */}
                            {openOwn && (
                              <EditRecipe recipeId={openOwn.id} title={openOwn.title}
                                          url={openOwn.url} note={openOwn.note ?? ""}
                                          steps={openOwn.steps ?? ""} onParse={readPastedIngredients}
                                          ingredients={openOwn.requires.map((i) => ({
                                            id: i, name: nameOf(i),
                                          }))}
                                          search={searchIngredients} onSave={editOwnRecipe}
                                          onDelete={removeOwnRecipe} />
                            )}
                            {PLAN_BUTTON && (
                              <PlanButton recipeId={open.id} meals={MEALS} live
                                          defaultDate={tomorrow} onPlan={planMeal} />
                            )}
                          </>
                        ) } : {})}>
            {/* "Made it" lives HERE, not on the card — it is the only place the
                rating can wake up beside it. The summary is the same modal with
                `view=summary`, so getting back is one link and the recipe never
                leaves the screen. */}
            {view === "summary" && summary
              ? <Summary summary={summary} nameOf={nameOf}
                         backHref={`?recipe=${open.id}&date=${boundDate}`} />
              : <MyVersion recipeId={open.id}
                           date={boundDate} today={today}
                           dateLabel={dateLabel} meals={MEALS}
                           todays={cookRows(todays, statesOf(owner, resolveId), nameOf,
                                            openMatch?.missing ?? [], isStaple,
                                            mainsOf(open))}
                           /* `live`: all four are device-first mirrors now —
                              the device mints the cook's id and the action
                              takes it, so the row this sheet points at is one
                              row in both copies. Settling up is why it
                              matters: the grid behind this sheet is computed
                              from the device, and "the pork ran out" has to
                              reach it or the shelf keeps recommending the
                              dinners built on it. See `lib/dual-write`. */
                           search={searchIngredients} onSettle={settleUp} live
                           onRate={rateCook}
                           onCook={madeIt} onUndo={undoMadeIt} />}
          </RecipeDetail>
        </RecipeModal>
      )}
    </Page>
  );
}
