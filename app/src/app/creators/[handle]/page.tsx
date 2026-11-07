/**
 * A creator's public page, pre-claim — CREATOR-SPEC §2, INGREDIENT-HOME-SPEC §1.
 *
 * A creator row is a fact about our corpus, and this is that fact as a page:
 * their recipes, grouped by cuisine (the topical grouping neither platform
 * gives a mid-tail creator — INGREDIENT-HOME-SPEC §1's measured gap), each
 * linking to the recipe page, which is where ingredients, the checkoff and
 * the link out to the source live. Ingredients only, never the method; the
 * page exists to route a cook to what they can make, not to replace watching.
 *
 * What it deliberately does NOT show, and why:
 *   - counts of any kind — CREATOR-SPEC §7: nothing below the floor `k`, and
 *     "an empty dashboard is a worse pitch than no dashboard"
 *   - a claim button — the claim flow is gated on platform OAuth apps that do
 *     not exist yet; a button to a dead end is worse than absence
 *   - other creators' recipes — recirculation is creator-scoped first
 *     (INGREDIENT-HOME-SPEC §3), and on an index page the scope is the page
 *
 * `robots: noindex` for now: CREATOR-SPEC §8 leaves pre-claim indexing open —
 * it is the inbound acquisition path AND it collides with UX-SPEC §10's
 * thin-content guard at exactly the coverage where a creator has few recipes.
 * Flipping it is one line, and it should be flipped deliberately, not shipped
 * by default.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Page, Note, Section } from "@/components/primitives";
import { Nav } from "@/components/Nav";
import { BackLink } from "@/components/BackLink";
import { RecipeCard } from "@/components/Gallery";
import { SortSelect } from "@/components/SortSelect";
import { ShelfSearch } from "@/components/ShelfSearch";
import { creatorByHandle, domainOf, iconOf, linksOf, recipesOf } from "@/lib/creators";
import { load, nameOf, resolveId } from "@/lib/data";
import { scoreRecipe } from "@/lib/match";
import { getOwner, pantryOf, saveCounts } from "@/lib/store";
import { ownerId } from "@/lib/owner";
import { unlistedRecipeIds } from "@/lib/creators";
import { currentUser } from "@/lib/owner";
import { claimOf, type Collection } from "@/lib/claims";
import { suggestTitles } from "./actions";
import { FollowButton } from "@/components/FollowButton";
import { CreatorLinks } from "@/components/CreatorLinks";
import { Shot } from "@/components/Shot";

export const dynamic = "force-dynamic";

export async function generateMetadata(
  { params }: { params: Promise<{ handle: string }> },
): Promise<Metadata> {
  const { handle } = await params;
  const creator = creatorByHandle(handle);
  if (!creator) return { title: "Creator not found" };
  return {
    title: `${creator.displayName} · JipBap`,
    description:
      `${creator.displayName}'s recipes on JipBap: see which ones you can ` +
      `cook from what's already in your kitchen.`,
    robots: { index: false },
  };
}

export default async function CreatorPage(
  { params, searchParams }: {
    params: Promise<{ handle: string }>;
    searchParams: Promise<{ sort?: string; q?: string; col?: string }>;
  },
) {
  const { handle } = await params;
  const { sort, q, col } = await searchParams;
  const creator = creatorByHandle(handle);
  if (!creator) notFound();

  /**
   * Servable only — a recipe with unresolved lines renders honestly on its own
   * page, but an INDEX of someone's work is a shop window, and stocking it
   * with rows we half-understand misrepresents them to their own audience.
   */
  const iAmHere = await currentUser();
  const myClaim = claimOf(creator.id);
  const isMine = !!iAmHere && myClaim?.user_id === iAmHere.id;
  /* The owner sees EVERYTHING — withdrawn, hidden, unreadable — because this
     page is where they manage it: a hidden row they cannot see is one they
     cannot unhide, and an unreadable row they cannot reach is one they cannot
     confirm (§4). Each off state is marked on its card; visitors get the
     served set, same as everywhere. */
  /* SS5b's split between display and matching, visible right here: a
     creator-added recipe with a quarantined miss stays OUT of matching
     (servable holds it everywhere else) but ON the creator's own page -
     it published the moment they saved it, and only the pantry math waits
     for the vocabulary. Crawled unread rows stay withheld as always. */
  const recipes = isMine
    ? recipesOf(creator.id)
    : ((un) => recipesOf(creator.id).filter((r) =>
        !un.has(r.id) && (r.unresolved.length === 0 || r.id.startsWith("rec_c"))
      ))(unlistedRecipeIds());
  const hiddenSet = isMine ? new Set(myClaim?.hidden ?? []) : new Set<string>();
  if (recipes.length === 0 && !isMine) notFound();

  /**
   * The visitor's own distance, on every card — the same numbers the home
   * shelves show, because this page is a shelf. A stranger with no pantry sees
   * every card at its full count, which is honest, and the checkoff on any
   * recipe page is one tap away from changing it.
   */
  const { relations } = load();
  const owner = getOwner(await ownerId());
  const pantry = pantryOf(owner, resolveId);
  const site = domainOf(creator.id);
  const user = iAmHere;
  const claim = myClaim;
  const mine = isMine;
  /* §6: withdrawn means gone from the public. The claimant still sees their
     own page — with the withdrawn state said plainly — because a restore
     nobody can reach is not reversible. */
  if ((creator.status === "withdrawn" || creator.status === "removed") && !mine)
    notFound();
  const collections: Collection[] = claim?.collections ?? [];
  const activeCol = col ? collections.find((c) => c.id === col) : undefined;

  /**
   * One shelf, newest first — the reviewer's call over the cuisine grouping
   * that shipped first: how a creator's work is sorted is THEIRS to decide,
   * and until they can, publish date is the one order that is a fact rather
   * than our editorial. Undated recipes sink to the end — 375 of 4,874
   * sources declared none, and a guess would interleave lies.
   */
  /**
   * Four orders, the visitor's choice; closeness is the default because it is
   * the product's one claim — what can YOU cook — applied to this shelf.
   *
   * "most saved" orders by a cross-owner aggregate and shows no number:
   * RECIPE-SPEC §9's floor governs displayed counts, and an order is the
   * weakest disclosure there is — ties collapse into closeness and nothing
   * names a figure. The moment a count is rendered it goes through the floor.
   */
  const scored = recipes.map((r) => ({ r, m: scoreRecipe(r, pantry, relations) }));
  const myCooks = new Map<string, number>();
  for (const c of owner?.cooks ?? [])
    myCooks.set(c.recipe_id, (myCooks.get(c.recipe_id) ?? 0) + 1);
  const saves = sort === "saved" ? saveCounts() : new Map<string, number>();

  const byClose = (a: typeof scored[number], b: typeof scored[number]) =>
    a.m.missing.length - b.m.missing.length ||
    (b.r.datePublished ?? "").localeCompare(a.r.datePublished ?? "");
  /* The shelf search — title match, within this creator only. Filter before
     sort so "closest" still means closest among what matched. */
  const inCol = activeCol
    ? scored.filter(({ r }) => activeCol.recipe_ids.includes(r.id))
    : scored;
  const term = q?.trim().toLowerCase();
  const searched = term
    ? inCol.filter(({ r }) => r.title.toLowerCase().includes(term))
    : inCol;
  const rows = [...searched].sort(
    sort === "new"
      ? (a, b) => (b.r.datePublished ?? "").localeCompare(a.r.datePublished ?? "")
      : sort === "mine"
        ? (a, b) => (myCooks.get(b.r.id) ?? 0) - (myCooks.get(a.r.id) ?? 0) || byClose(a, b)
        : sort === "saved"
          ? (a, b) => (saves.get(b.r.id) ?? 0) - (saves.get(a.r.id) ?? 0) || byClose(a, b)
          : byClose,
  );

  /* Labels sized for a dropdown, where a phrase costs nothing — the reviewer
     found the one-worders too terse to mean anything unopened. */
  const SORTS = [
    ["", "Fewest Missing Ingredients"],
    ["new", "Newest First"],
    ["mine", "Cooked by Me"],
    ["saved", "Most Saved"],
  ] as const;

  return (
    <Page>
      <Nav user={!!(await currentUser())} />
      {/* Reached from the creators tab, and also from "View X's recipes" on a
          recipe — that second path had no way back to the recipe it came from.
          `/creators` is the fallback, which is where the tab would land you. */}
      <p className="page-backline">
        <BackLink href="/creators" />
      </p>

      {creator.status === "withdrawn" && mine && (
        <Note>
          This page is withdrawn: it is invisible to everyone but you, and
          your recipes are out of matching.{" "}
          <Link href={`/creators/${creator.handle}/claim`}>Restore it</Link>{" "}
          any time.
        </Note>
      )}
      {/* SS6a: removal is the operator's call, so there is no restore button
          here - the honest banner says what is true and where to write. */}
      {creator.status === "removed" && mine && (
        <Note>
          This page is not listed right now: it is invisible to everyone but
          you, and your recipes are out of display and matching. If you think
          this is a mistake, write to us.
        </Note>
      )}

      <h1 className="page-title creator-title">
        {/* Their favicon, font-sized, from their own host — no third-party
            favicon service, the same posture as every recipe photo on this
            page already loaded from them. */}
        {myClaim?.avatar_url && !myClaim.withdrawn_at ? (
          /* Their chosen face, hotlinked from wherever they host it — the
             probed favicon was our best guess, this is their answer. */
          <img src={myClaim.avatar_url} alt="" loading="lazy"
               referrerPolicy="no-referrer" />
        ) : ((ic) => ic && (
          /* The probed icon, not /favicon.ico — creator-icons found a 180px+
             mark for 14 of 15 sources. The one favicon fallback draws SMALL
             (the reviewer's rule: no high resolution, no big circle), because
             a stretched 16px icon reads as a broken image with ambitions. */
          <img className={ic.lowRes ? "avatar-lowres" : undefined}
               src={ic.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
        ))(iconOf(creator.id))}
        {creator.displayName}
        {creator.status === "claimed" && (
          /* The claim's one public mark — a check beside the name, not a badge
             wall. CREATOR-SPEC §5: recipe-level badges wait for confirmed
             ingredient lists; this says only "the person behind this page is
             the person behind that site". */
          <svg className="creator-claimed" width="15" height="15" viewBox="0 0 24 24"
               fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"
               strokeLinejoin="round" aria-label="claimed by the creator" role="img">
            <path d="M4 12.5l5 5L20 6.5" />
          </svg>
        )}
        {/* Where they live, as icons — extracted so the static creator page
            draws the identical row rather than a copy of it (`CreatorLinks`). */}
        <CreatorLinks name={creator.displayName} links={linksOf(creator.id)} />
        {/* Beside the platform icons (the user's call, 2026-08-16) — the row
            already holds interactive elements, so the button follows the
            claim invite's precedent and rides the title's flex line. Not
            shown to the owner: following yourself is a number nobody needs
            (CREATORS-TAB-SPEC §4). */}
        {!mine && (
          <FollowButton handle={creator.handle} creatorId={creator.id}
                        name={creator.displayName}
                        signedIn={!!user}
                        initial={!!owner?.follows?.some((f) => f.creator_id === creator.id)} />
        )}
        {/* The way in for the person it is about, at the top right where an
            owner's eye goes looking for their controls — moved up from the
            footer on the reviewer's call. Open to everyone because tapping
            grants nothing (INGREDIENT-HOME-SPEC §4e); the proof is on the
            other side. */}
        {creator.status !== "claimed" && (
          <Link className="claim-invite" href={`/creators/${creator.handle}/claim`}>
            Claim this page
          </Link>
        )}
        {/* The claimant's slot in the same corner the invite used — a page
            gets exactly one call-to-action up here, and whose page it is
            decides which. */}
        {mine && (
          <Link className="claim-invite" href={`/creators/${creator.handle}/add`}>
            Add a recipe
          </Link>
        )}
      </h1>

      {/* Their line, under their name -- the one piece of prose on the page
          that is theirs verbatim. Absent until written; never our words. */}
      {myClaim?.bio && !myClaim.withdrawn_at && (
        <p className="creator-bio">{myClaim.bio}</p>
      )}

      {(collections.length > 0 || mine) && (
        <Section title="Collections" count={collections.length}>
          {/* The creator's own grouping of their own work — the cuisine
              grouping we removed, returned as the thing it should have been:
              theirs. A card is a door: title, their one line, and a corner of
              what is inside; four thumbnails, or three and the size of the
              rest. The claimant always sees the "+" card, because an empty
              band with no way to fill it is a feature withheld. */}
          <div className="col-cards">
            {collections.map((c) => {
              const thumbs = c.recipe_ids
                .map((id) => scored.find((x) => x.r.id === id)?.r)
                .filter((r): r is NonNullable<typeof r> => !!r && !!r.image);
              const shown = thumbs.length > 4 ? thumbs.slice(0, 3) : thumbs.slice(0, 4);
              const more = c.recipe_ids.length - shown.length;
              return (
                /* A div holding two separate anchors — the card body and the
                   edit corner — because an anchor inside an anchor is not
                   HTML, however much a card wants to be one link. */
                <div key={c.id} className={`col-card${activeCol?.id === c.id ? " on" : ""}`}>
                  <Link className="col-body" href={activeCol?.id === c.id ? "?" : `?col=${c.id}`}>
                    <span className="col-thumbs">
                      {shown.map((r) => (
                        <Shot key={r.id} src={r.image} fallback={null} />
                      ))}
                      {more > 0 && <span className="col-more">+{more}</span>}
                    </span>
                    <b>{c.title}</b>
                    {c.description && <span className="note">{c.description}</span>}
                  </Link>
                  {mine && (
                    <Link className="col-edit" href={`/creators/${creator.handle}/collections?edit=${c.id}`}>
                      edit
                    </Link>
                  )}
                </div>
              );
            })}
            {mine && (
              <Link className="col-card col-new" href={`/creators/${creator.handle}/collections`}
                    aria-label="new collection">
                <span className="col-plus">+</span>
              </Link>
            )}
          </div>
        </Section>
      )}

      <Section count={rows.length}
               title={<>
                 Recipes
                 {activeCol && (
                   /* The filter, worn as a chip — the reviewer's shape: the
                      header keeps its name, the collection rides beside it,
                      and the chip IS the off switch. */
                   <Link className="filter-chip" href="?" scroll={false}
                         aria-label={`stop filtering by ${activeCol.title}`}>
                     {activeCol.title} <span aria-hidden="true">×</span>
                   </Link>
                 )}
               </>}
               action={
                 <span className="shelf-tools">
                   <ShelfSearch placeholder="search recipes"
                                scope={creator.handle} onSuggest={suggestTitles} />
                   <SortSelect current={sort ?? ""} options={SORTS} />
                 </span>
               }>
          {/* The same card and grid the shelves use — a creator's page is a
              shelf, and inventing a second recipe tile would make it read as
              somewhere else. */}
          <div className="gallery">
            {rows.map(({ r, m }) => {
              return (
                <RecipeCard key={r.id} title={r.title} source={r.source}
                            href={`/recipe/${r.id}`}
                            away={m.missing.length}
                            missing={m.missing.map(nameOf)}
                            uses={m.uses.map((u) => ({ id: u, name: nameOf(u) }))}
                            checks={[]}
                            incomplete={r.unresolved.length > 0 && !r.id.startsWith("rec_c")}
                            {...(r.unresolved.length > 0 && r.id.startsWith("rec_c")
                              ? { warn: "has ingredients we don't know yet, so matching waits" }
                              : {})}
                            total={r.requires.length}
                            {...(r.image ? { image: r.image } : {})}
                            {...(r.confirmed ? { confirmed: true } : {})}
                            {...(hiddenSet.has(r.id) ? { hiddenMark: true } : {})}
                            {...(r.rating !== undefined ? { sourceRating: r.rating } : {})} />
              );
            })}
          </div>
      </Section>

    </Page>
  );
}
