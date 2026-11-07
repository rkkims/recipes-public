"use client";

/**
 * The home grid, computed on the device — STATIC-SPEC §2's inversion, arriving.
 *
 * Everything in here was a server render an hour ago: `page.tsx` read the
 * owner off disk, ranked the corpus against it, and shipped four pre-rendered
 * tab panels. That is why ticking an ingredient cost a round trip and a
 * full-tree reconciliation before the counts moved, and why `GridStatus`
 * existed to defer the cost to drawer-close.
 *
 * Now the pantry is in `localStorage` (`client-store`), the shelf and the
 * vocabulary arrive as one gzipped bundle (`client-data`), and the whole
 * pipeline runs between a tap and the next frame. The store notifies, this
 * recomputes, the counts move. No refresh, no revalidation, no spinner.
 *
 * ── What is NOT computed here, and why ────────────────────────────────────
 *
 * Three kinds of fact stay on the server and arrive as props:
 *
 *   - **Per-recipe marks** (`meta`) — the creator's shelf, the confirmation
 *     pen, the head-start badge. `lib/creators`, `lib/claims` and
 *     `lib/waiting` all read the filesystem, and two of the three change
 *     between deploys when a creator acts, so they cannot ride in a build-time
 *     bundle either. They are per-deploy-ish facts about the shelf rather than
 *     about the kitchen, so the page hands them over once.
 *   - **Withdrawals** (`hiddenIds`) — CREATOR-SPEC §6/§6a is a runtime
 *     judgement and must reach a device that is holding an older bundle.
 *   - **The affiliate offers** — fetched after the rows are known, because
 *     they are keyed on the eight ingredients this pantry happens to be short
 *     of, and shipping the catalogue for all 1,165 nodes would cost 89 KB to
 *     answer a question about eight of them.
 *
 * ── The same functions, deliberately ──────────────────────────────────────
 *
 * `rank`, `nearMisses`, `explore`, `applyDiet`, `shuffleDaily`,
 * `picturedFirst`, `pantryOf`, `dismissedNow` — every one is the module the
 * server calls, imported unchanged. The inversion is about WHERE the pantry
 * lives, and the day the two shells disagree about what "2 away" means is the
 * day this stops being one product.
 */

import { Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Empty } from "./primitives";
import { Gallery, RecipeCard } from "./Gallery";
import { NearlyRows, type NearRow } from "./NearlyRows";
import { MoreOnScroll } from "./MoreOnScroll";
import { SaveButton } from "./SaveButton";
import { CUISINES, OTHERS } from "./CuisineBar";
import { applyDiet, peek } from "@/lib/diet";
import { explore } from "@/lib/explore";
import {
  cuisinesOf, expandComponents, nearMisses, rank, scoreRecipe,
  type Match, type Recipe,
} from "@/lib/match";
import { foundationRank, picturedFirst, shuffleDaily } from "@/lib/order";
import { sourceRating } from "@/lib/rating";
import {
  dietOf, dismissedNow, ownAsRecipes, pantryOf, statesOf, type Owner,
} from "@/lib/owner-core";
import {
  coversOf, dietIndex, ingredientNamed, nameOf, resolveId,
} from "@/lib/client-data";
import { useCreators } from "@/lib/client-creators";
import { arrivalFrom, useBundle, useOwner, useVisitSeed } from "@/lib/use-owner";
import { wasCorrupt } from "@/lib/client-store";
import { saveRecipe, updateState } from "@/lib/dual-write";
import { openRecipeHref, STATIC } from "@/lib/static-mode";

/** How many cards a tab shows before asking. Unchanged from the server page. */
const PAGE = 30;

export type CardMeta = {
  /** The creator's own page, when the recipe has one and they are still listed. */
  creatorHref?: string;
  /** CREATOR-SPEC §5: the creator confirmed this ingredient list themselves. */
  confirmed?: boolean;
  /** `lib/waiting`'s verdict — curated, or the recipe's own stated wait. */
  makeAhead?: boolean;
  /** The recipe's own words for the wait, when the enrichment pass caught them. */
  waitReason?: string;
};

export type ShelfOffer = {
  url: string;
  products: Array<{ id: string; title: string; url: string; image?: string }>;
};

/**
 * The address, and who parses it — the one thing static mode moves.
 *
 * In server mode `page.tsx` reads `searchParams` and hands the five values down
 * as props, which is where they belong: the server decided what to render from
 * them. An EXPORTED page has no request, so it has no query string to read, and
 * every one of these would be permanently undefined — the cuisine chip would
 * highlight nothing, a search would show the whole grid, and "show 30 more"
 * would show thirty.
 *
 * So in static mode the same five values are read on the CLIENT, from the same
 * address, by `useSearchParams`. Inside a Suspense boundary because that is the
 * contract for it in a prerendered tree, and behind `STATIC` so the server build
 * never reaches this component at all: hooks are not called conditionally here,
 * a whole component is or is not rendered.
 */
export function HomeGrid(props: React.ComponentProps<typeof Shelves>) {
  if (!STATIC) return <Shelves {...props} />;
  return (
    <Suspense fallback={<GridSkeleton />}>
      <Addressed {...props} />
    </Suspense>
  );
}

function Addressed(props: React.ComponentProps<typeof Shelves>) {
  const sp = useSearchParams();
  const at = (k: string) => sp.get(k) ?? undefined;
  return (
    <Shelves {...props}
             {...(at("c") ? { c: at("c") } : {})}
             {...(at("q") ? { q: at("q") } : {})}
             {...(at("n") ? { n: at("n") } : {})}
             {...(at("allow") ? { allow: at("allow") } : {})}
             {...(at("seed") ? { seed: at("seed") } : {})} />
  );
}

/**
 * A skeleton the size of the grid rather than a spinner or an empty div: what
 * arrives is a wall of cards, and a page that jumps by a screen height the
 * moment it loads reads as broken even when it is fast.
 */
function GridSkeleton() {
  return (
    <div className="gridskeleton" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your kitchen</span>
      {Array.from({ length: 6 }, (_, i) => (
        <div className="gridskeleton-card" key={i} aria-hidden="true" />
      ))}
    </div>
  );
}

function Shelves({
  c, q, n, allow, seed, meta, hiddenIds, perk, offersFor,
}: {
  /** The address, parsed by the server page and passed through unchanged. */
  c?: string; q?: string; n?: string; allow?: string; seed?: string;
  meta: Record<string, CardMeta>;
  hiddenIds: string[];
  perk?: string;
  /** The shelf's affiliate rows, asked for once the blocking ingredients are known. */
  offersFor: (ingredientIds: string[]) => Promise<Record<string, ShelfOffer>>;
}) {
  const bundle = useBundle();
  const { owner, ready } = useOwner();
  /**
   * Who made what — the other half of CREATORS-TAB-SPEC §4's boost.
   *
   * This arrived as a prop, computed in `page.tsx` from the SERVER's owner and
   * the server's creator index. Both halves were wrong once the follow moved to
   * the device: in static mode there is no server owner at all, so the list was
   * empty and following a creator boosted nothing; in server mode it was a
   * follow read from a copy the device is now ahead of.
   *
   * Both inputs are here instead. `owner.follows` is device state like any
   * other group in the blob (`setFollowing`), and the bundle's creator rows
   * carry `recipe_ids` — shipped for the creator pages, and free to read from a
   * second surface. Precomputed per followed creator (a handful) rather than
   * resolved per recipe (thousands), which is the shape `scoreExplore` wants.
   */
  const creators = useCreators();
  const shuffleSeed = useVisitSeed(seed);
  const [offers, setOffers] = useState<Record<string, ShelfOffer>>({});

  const term = q?.trim().toLowerCase() || undefined;
  /**
   * How many cards to show, in the URL rather than in client state — the same
   * reasoning as the modal's `?recipe=`: the back button undoes it and a
   * reload keeps your place. Clamped for the reason `page.tsx` measured:
   * beyond 300 the cost is what the BROWSER holds, and nobody chooses 600,
   * the lazy loader walks you into it.
   */
  const shown = Math.min(Math.max(PAGE, Number(n) || PAGE), 300);

  /**
   * One query string, built once, KEEPING whatever else is set.
   *
   * `recipe` and `date` are NOT carried: they address the modal, so they
   * belong only to the link that opens it. Everything else describes what the
   * page is showing and survives — including `seed`, which is what holds the
   * shuffled shelves still across a click.
   */
  const link = (over: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(
      { c, q: term, n, allow, seed: shuffleSeed ?? undefined, ...over }))
      if (v) sp.set(k, v);
    const s = sp.toString();
    return s ? `?${s}` : "?";
  };

  /* Keyed by CONTENT, not by reference: `hiddenIds` is minted fresh by the
     server on every render of the page above and the followed list is rebuilt
     from two changing inputs here, and re-ranking the shelf because a new array
     holds the same ids is the cost this memo exists to avoid. */
  const hiddenKey = hiddenIds.join(",");
  const followedKey = useMemo(() => {
    if (!creators) return "";
    const wanted = new Set((owner?.follows ?? []).map((f) => f.creator_id));
    if (wanted.size === 0) return "";
    return creators.filter((cr) => wanted.has(cr.id))
      .flatMap((cr) => cr.recipe_ids).join(",");
  }, [creators, owner]);
  const shelves = useMemo(() => {
    if (!bundle || !ready || !shuffleSeed) return null;
    return computeShelves({
      bundle, owner, shuffleSeed, allow, cuisine: c, term,
      hidden: new Set(hiddenKey ? hiddenKey.split(",") : []),
      followed: new Set(followedKey ? followedKey.split(",") : []),
    });
  }, [bundle, owner, ready, shuffleSeed, allow, c, term, hiddenKey, followedKey]);

  /**
   * The offers, after the rows — one round trip for the eight ingredients this
   * kitchen is actually short of. Nothing waits on it: a row draws its recipes
   * and gains its first card when the answer lands.
   */
  const offerKeys = (shelves?.nearRows ?? []).map((r) => r.id).join(",");
  useEffect(() => {
    if (!offerKeys) return;
    let live = true;
    void offersFor(offerKeys.split(","))
      .then((got) => { if (live) setOffers(got); })
      .catch((e) => console.warn("[offers] not fetched:", e));
    return () => { live = false; };
  }, [offerKeys, offersFor]);

  /**
   * Nothing to draw yet — the bundle is in flight, or the store has not been
   * read (which happens in a mount effect, because the server has no
   * `localStorage` and `layout.tsx` removed `suppressHydrationWarning`).
   */
  if (!shelves) return <GridSkeleton />;

  const {
    found, canCookAll, nearlyAll, nearRows, explored, popular, ownRecipes,
    chipStates, saved, cookCount, empty, hushedHere,
  } = shelves;

  /**
   * The device's own `StoreCorrupt` — the same promise, translated.
   *
   * A blob that would not parse was MOVED ASIDE rather than overwritten
   * (`client-store.keepCorrupt`), so the kitchen on screen is empty and the
   * user's data is not gone. Saying so is the whole point: the failure this
   * guards against is someone concluding their pantry was deleted and
   * rebuilding it, which is what makes the damage permanent.
   */
  const corrupt = wasCorrupt();

  const marks = (id: string): CardMeta => meta[id] ?? {};

  /* The foot of a shelf: "Loading…" while there is more, and nothing when
     there is not. `total` decides whether there IS a next page. */
  const more = (total: number) =>
    total > shown ? <MoreOnScroll href={link({ n: String(shown + PAGE) })} /> : null;

  /** One card, drawn the same way on every shelf — see `RecipeCard`. */
  const card = (m: Match, children?: ReactNode) => {
    const mk = marks(m.recipe.id);
    return (
      <RecipeCard key={m.recipe.id} title={m.recipe.title} source={m.recipe.source}
                  {...(mk.creatorHref ? { creatorHref: mk.creatorHref } : {})}
                  /* `?recipe=` in server mode, the recipe's own page in static
                     mode — see `openRecipeHref`. */
                  href={openRecipeHref(m.recipe.id, link({ recipe: m.recipe.id }))}
                  image={m.recipe.image}
                  confirmed={mk.confirmed}
                  away={m.missing.length}
                  missing={m.missing.map(nameOf)}
                  uses={m.uses.map((u) => ({ id: u, name: nameOf(u) }))}
                  states={chipStates} onUpdate={updateState}
                  cooked={cookCount(m.recipe.id)}
                  checks={checksFor(m)} incomplete={m.incomplete}
                  sourceRating={m.recipe.rating} total={m.recipe.requires.length}
                  makeAhead={mk.makeAhead}
                  {...(mk.waitReason ? { waitReason: mk.waitReason } : {})}
                  save={<SaveButton recipeId={m.recipe.id} heart
                                    saved={saved.has(m.recipe.id)}
                                    onSave={saveRecipe} />}>
        {children}
      </RecipeCard>
    );
  };

  return (
    <>
      {corrupt && (
        <p className="note foot" role="alert">
          This device’s saved kitchen could not be read, so it was set aside
          rather than overwritten. Nothing was deleted. Adding things now
          starts a fresh one.
        </p>
      )}
      {/*
        `key` on the TERM, so a new search opens its own tab — `Gallery` keeps
        the chosen tab in client state, and choosing a word is choosing what to
        look at.
      */}
      <Gallery key={term ?? ""} tabs={[
        ...(term ? [{
          id: "found",
          label: term,
          count: found.length,
          empty: <Empty>No recipe here uses {term}.</Empty>,
          panel: (
            <>
            <div className="gallery">{found.slice(0, shown).map((m) => card(m))}</div>
            {more(found.length)}
            </>
          ),
        }] : []),
        {
          id: "tonight",
          label: "Can cook now",
          count: canCookAll.length,
          /**
           * A distance reading, not a shrug. "Add a few things and this fills
           * in" gave a new user no way to tell "keep going" from "broken"; the
           * closest near-miss is a number that moves every time they add
           * something.
           */
          empty: <Empty>{
            nearlyAll[0]
              ? `Closest is ${nearlyAll[0].missing.length} away. Try Almost there.`
              : empty
                ? "Add what you have and this fills in."
                : "Nothing close yet."
          }</Empty>,
          panel: (
            <>
            <div className="gallery">{canCookAll.slice(0, shown).map((m) => card(m))}</div>
            {more(canCookAll.length)}
            </>
          ),
        },
        {
          id: "nearly",
          label: "Almost there",
          /* The count is INGREDIENTS, not recipes — the shelf is a shopping
             list and its size is how many lines that list has. */
          count: nearRows.length,
          empty: <Empty>Nothing close yet. Add a few more things you have.</Empty>,
          panel: (
            <NearlyRows
              rows={nearRows.map((r) => (offers[r.id] ? { ...r, offer: offers[r.id]! } : r))}
              {...(perk ? { perk } : {})} />
          ),
        },
        {
          /**
           * The one shelf that works with an empty pantry. Listed after the two
           * pantry-driven tabs, because for a user WITH a pantry those are the
           * better answer — and `Gallery` opens the first tab that has anything
           * in it, so a visitor with nothing lands here regardless.
           */
          id: "explore",
          label: "Explore",
          count: explored.length,
          hideCount: true,
          empty: <Empty>You have seen everything we have. Check back as the corpus grows.</Empty>,
          panel: (
            <>
            <div className="gallery">{explored.slice(0, shown).map((m) => card(m))}</div>
            {more(popular.length)}
            </>
          ),
        },
        ...(ownRecipes.length > 0 ? [{
          /**
           * Recipes you added yourself, in the grid rather than only on the
           * library page. They already rank in the two pantry shelves like any
           * other; this tab is for FINDING them, which is a different question
           * from what you can cook.
           */
          id: "mine",
          label: "Added by me",
          count: ownRecipes.length,
          empty: <Empty>Nothing yet.</Empty>,
          panel: (
            <div className="gallery">
              {ownRecipes.map((m) => card(m, m.recipe.requires.length === 0
                ? <p className="note">no ingredients yet, so it won’t match your pantry</p>
                : null))}
            </div>
          ),
        }] : []),
      ]} />

      {/* The user's own instruction, reported back. The undo for it sits on
          the card. */}
      {hushedHere > 0 && (
        <p className="note foot">
          <b>{hushedHere.toLocaleString()}</b> hidden by you.
        </p>
      )}
    </>
  );
}

/**
 * The §3a lines a match earns — one per requirement the pantry answered with
 * something BROADER than the recipe named.
 */
function checksFor(m: Match) {
  return m.covered
    .filter((cv) => cv.disclose && cv.have)
    .map((cv) => ({
      wants: { id: cv.need, name: nameOf(cv.need) },
      have: { id: cv.have!, name: nameOf(cv.have!) },
    }));
}

/**
 * Every shelf on the page, from one pantry — the server page's own sequence,
 * in its own order, for the reason that sequence is not arbitrary.
 *
 * Diet comes off the top before ranking (USER-SPEC §6), so a hidden recipe
 * cannot occupy a slot in "Cook tonight" and then vanish. The cuisine chip is
 * applied at the same point, so every count on the page counts the same thing.
 * "Not now" applies to the two DISCOVERY shelves and nowhere else.
 */
function computeShelves(input: {
  bundle: NonNullable<ReturnType<typeof useBundle>>;
  owner: Owner | null;
  shuffleSeed: string;
  allow?: string;
  cuisine?: string;
  term?: string;
  hidden: Set<string>;
  followed: Set<string>;
}) {
  const { bundle, owner, shuffleSeed, allow, term, hidden, followed } = input;
  const arrivedAt = arrivalFrom(shuffleSeed);

  /* Corpus + own, folded the way the server folds them: a dish that uses a
     stock requires the stock's anchovies (`expandComponents`). Own recipes
     last, so ids collide toward theirs. */
  const allRecipes = expandComponents(
    [...bundle.recipes, ...ownAsRecipes(owner)] as Recipe[])
    .filter((r) => !hidden.has(r.id));

  const pantry = pantryOf(owner, resolveId);
  const standing = dietOf(owner, resolveId);
  const { diet } = peek(standing, allow);
  const { kept: dietKept } = applyDiet(allRecipes, diet, dietIndex());

  /* Membership, not equality — a dish under two cuisines shows on both chips.
     "Others" is the complement of the six among NAMED cuisines; an unknown
     value falls through to everything rather than to nothing. */
  const cuisine = input.cuisine
    && (CUISINES.includes(input.cuisine) || input.cuisine === OTHERS)
    ? input.cuisine : undefined;
  const recipes = !cuisine
    ? dietKept
    : cuisine === OTHERS
      ? dietKept.filter((r) => {
          const cs = cuisinesOf(r);
          return cs.length > 0 && !cs.some((x) => CUISINES.includes(x));
        })
      : dietKept.filter((r) => cuisinesOf(r).includes(cuisine));

  const recipeById = new Map(allRecipes.map((r) => [r.id, r]));
  const saved = new Set(
    Object.values(owner?.recipes ?? {}).filter((r) => r.saved).map((r) => r.recipe_id));

  /* The card only needs the NUMBER — it reports the count and does not act
     on it, so the whole log is counted once rather than filtered per card. */
  const cooks = new Map<string, number>();
  for (const ev of owner?.cooks ?? [])
    cooks.set(ev.recipe_id, (cooks.get(ev.recipe_id) ?? 0) + 1);
  const cookCount = (recipeId: string) => cooks.get(recipeId) ?? 0;

  const empty = pantry.have.size === 0;
  const opts = { relations: bundle.relations, requireComplete: true };
  const hushed = dismissedNow(owner);
  const undismissed = recipes.filter((r) => !hushed.has(r.id));

  /* `maxMissing: 0` is "what can I cook right now" — the question the product
     exists to answer. Ranked in FULL and sliced for display: the count must
     not be the slice, or the one number measuring whether the pantry is
     paying off flatlines exactly when it starts working. */
  const canCook = empty ? [] : rank(undismissed, pantry, { ...opts, maxMissing: 0 });
  const nearly = empty
    ? [] : nearMisses(undismissed, pantry, opts, Number.MAX_SAFE_INTEGER);

  /* Shuffled per visit, THEN photographs to the front: the shuffle decides the
     order among cards worth showing, the picture rule decides which of those a
     person can actually see. */
  const canCookAll = picturedFirst(
    shuffleDaily(canCook, shuffleSeed, (m) => m.recipe.id), (m) => m.recipe);
  const nearlyAll = picturedFirst(nearly, (m) => m.recipe);

  /* Nothing unread goes out — `servable`, on the device. The bundle ships
     resolved lists only and own recipes parse nothing, so what this really
     enforces here is the withdrawal filter above plus the same rule for
     anything a future bundle carries unresolved. */
  const servable = <T extends { id: string; unresolved: string[] }>(rs: T[]) =>
    rs.filter((r) => r.unresolved.length === 0);

  /**
   * The search, as its own SHELF — UX-SPEC §4j.
   *
   * `hushed` is deliberately NOT applied: "not now" is discovery only, and
   * asking not to be recommended something is not asking for it to become
   * unfindable. Fewest missing first, then the shorter title — the answer to
   * the real question behind a search.
   */
  const found = term
    ? servable(recipes).filter(termFilter(term))
        .map((r) => scoreRecipe(r, pantry, bundle.relations))
        .sort((a, b) => a.missing.length - b.missing.length ||
                        a.recipe.title.length - b.recipe.title.length)
    : [];

  const popular = picturedFirst(explore(
    servable([...recipes]).filter((r) => r.requires.length > 0 && !hushed.has(r.id)),
    owner,
    {
      have: pantry.have,
      byId: recipeById,
      ratingOf: (r) => sourceRating(r.rating) ?? null,
      arrivedAt,
      ...(followed.size ? { followedIds: followed } : {}),
    },
  ), (r) => r);
  const explored = picturedFirst(shuffleDaily(popular, shuffleSeed, (r) => r.id), (r) => r)
    .map((r) => scoreRecipe(r, pantry, bundle.relations));

  /* Newest first: the one you just added is the one you are looking for. */
  const ownRecipes = [...ownAsRecipes(owner)].reverse()
    .map((r) => scoreRecipe(r as Recipe, pantry, bundle.relations));

  /**
   * "Nearly there", as one row per BLOCKING ingredient.
   *
   * Built by inverting `nearlyAll`: a recipe two away appears in two rows,
   * because either purchase moves it and the user should see it under both.
   * `unlocks` is counted separately and strictly — recipes needing this and
   * nothing else — which is the strong claim and is often zero, and is exactly
   * why the row's CONTENT is not gated on it.
   */
  const onListNow = new Set(
    Object.values(owner?.ingredients ?? {}).filter((r) => r.on_list)
      .map((r) => resolveId(r.ingredient_id)));
  const blocking = new Map<string, Match[]>();
  for (const m of nearlyAll)
    for (const id of m.missing) {
      const at = blocking.get(id);
      if (at) at.push(m); else blocking.set(id, [m]);
    }
  const nearRows: NearRow[] = [...blocking.entries()]
    .map(([id, ms]) => ({
      id, name: nameOf(id),
      unlocks: ms.filter((m) => m.missing.length === 1).length,
      onList: onListNow.has(id),
      recipes: [...ms].sort((a, b) => a.missing.length - b.missing.length || b.score - a.score)
        .slice(0, 12)
        .map((m) => ({
          id: m.recipe.id, title: m.recipe.title, source: m.recipe.source,
          ...(m.recipe.image ? { image: m.recipe.image } : {}),
          away: m.missing.length,
        })),
    }))
    /* The three foundation jars first when they are missing — the one place
       this shelf's arithmetic is overruled, because it counts recipes and
       cannot see that a bottle of soy sauce is still working next spring.
       Then outright unlocks, then sheer blocking weight. */
    .sort((a, b) => foundationRank(a.id) - foundationRank(b.id)
      || b.unlocks - a.unlocks
      || b.recipes.length - a.recipes.length
      || a.name.localeCompare(b.name))
    .slice(0, 8);

  return {
    found, canCookAll, nearlyAll, nearRows, explored, popular, ownRecipes,
    chipStates: statesOf(owner, resolveId),
    saved, cookCount, empty,
    /** How many the user has hushed, so the shelf never silently shrinks. */
    hushedHere: empty ? 0 : recipes.filter((r) => hushed.has(r.id)).length,
  };
}

/**
 * Does this recipe answer that search term? — `lib/recipes`' rule, over the
 * bundle.
 *
 * Two readings, OR'd, exactly as the server's: the title contains the word, or
 * the recipe wants the ingredient the word names. "kimchi" has to find both
 * the dish called kimchi jjigae and the stew that merely needs a jar of it,
 * and the covers walk goes DOWN the hierarchy only (`coversOf`).
 */
function termFilter(term: string): (r: Recipe) => boolean {
  const t = term.toLowerCase().trim();
  if (!t) return () => true;
  const ing = ingredientNamed(t);
  const covers = ing ? coversOf(ing.id) : null;
  return (r) => r.title.toLowerCase().includes(t)
    || (covers !== null && r.requires.some((need) => covers.has(need)));
}
