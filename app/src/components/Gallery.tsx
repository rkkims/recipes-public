"use client";

import Link from "next/link";
import { Shot } from "./Shot";
import { GridSpinner } from "./GridStatus";
import { useLinkStatus } from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Chip, SourceLabel } from "./primitives";
import { IngredientChips, type ChipItem } from "./IngredientChips";
import type { IngredientState } from "./StateWidget";
import type { ActionResult } from "@/lib/result";
import { sourceRating as believable } from "@/lib/rating";

const NO_STATE: IngredientState = { in_pantry: false, on_list: false, use_first: false };

/** A card label turned into the same chip the pantry and the modal use. */
const chipFor = (
  i: { id: string; name: string }, tone: ChipItem["tone"],
  states?: Record<string, IngredientState>,
): ChipItem => ({
  id: i.id, name: i.name, tone,
  targetId: i.id, targetName: i.name,
  state: states?.[i.id] ?? NO_STATE,
});

/**
 * The card is waiting on the server — say so.
 *
 * Opening a recipe is `?recipe=`, which is a server navigation: the page
 * re-renders with the modal in it. On a kitchen connection that is a beat of
 * nothing at all, so the tap reads as ignored and people tap again. This is the
 * single most-used interaction in the product and it had no feedback of any
 * kind.
 *
 * `useLinkStatus` reports the pending state of the enclosing `Link`, so the
 * indicator belongs to the card that was actually tapped rather than to a
 * page-level bar that cannot say which one.
 */
function LinkSpinner() {
  const { pending } = useLinkStatus();
  return pending ? <span className="card-pending" aria-label="Opening…" /> : null;
}

/**
 * The filter bar and the gallery beneath it.
 *
 * All panels are rendered server-side and switched here, rather than refetched
 * per tab: the lists are already computed by one pass of the matcher, and a
 * round trip to re-rank the same pantry would be slower and could disagree
 * with itself between tabs.
 *
 * The count rides on the tab because it is the answer to the question the tab
 * asks. "Cook tonight" with no number is a category; "Cook tonight 60" is a
 * result.
 *
 * That argument holds for the pantry-driven tabs and fails for Explore, which
 * therefore sets `hideCount`. "Cook tonight 8" and "Almost there 12" are facts
 * about YOUR kitchen and they move when you fix the pantry — that is the whole
 * reason the number is worth reading. Explore's number is a slice of the corpus
 * we have not shown you yet; it answers no question the user asked, changes for
 * reasons they cannot see, and sitting in the same row it borrows the authority
 * of the two counts that mean something.
 */
export function Gallery({ tabs }: {
  tabs: Array<{ id: string; label: string; count: number; empty: ReactNode;
                panel: ReactNode;
                /** Count still decides emptiness and landing — it is just not printed. */
                hideCount?: boolean }>;
}) {
  /**
   * Land on a tab that has something in it.
   *
   * It always opened `tabs[0]`, which on a new or thin pantry is "Cook tonight"
   * — the tab that needs EVERY ingredient of a recipe and is therefore the last
   * one to fill. So the first thing a new user saw was an empty panel with
   * forty results sitting one tab to the right, unnoticed. First non-empty, and
   * `tabs[0]` when they are all empty, because then the leading tab's empty
   * state is the right thing to read.
   *
   * Only the user's own choice is remembered: once they pick a tab it is theirs,
   * and a re-render that moved them would be worse than the problem being fixed.
   *
   * ── Why this is not a `useState` initialiser ───────────────────────────────
   *
   * It was, and a `useState` initialiser runs ONCE. On first paint the pantry is
   * still empty — first run is open over the page — so the only non-empty tab is
   * "Popular", and that choice then froze. Finishing onboarding re-rendered the
   * counts to `Cook tonight 33` and left the user looking at Popular: the moment
   * they had just finished telling us what they own, we showed them the one
   * shelf that ignores it. Only a full reload cleared it, which is exactly the
   * kind of bug that survives being looked at.
   *
   * `null` means "the user has not chosen", so the fallback re-evaluates on
   * every render and follows the data until they do.
   */
  /**
   * Seeded from the address, so a refresh keeps the tab you were on.
   *
   * It was React state and nothing else, so every reload dropped you back on
   * whichever tab the fallback picked — usually "Can cook now". On a page people
   * refresh to see what changed, that is the one thing that should not change.
   *
   * `useSearchParams` rather than `sessionStorage`, and the difference is the
   * first paint: the parameter is known to the server, so the right panel
   * renders immediately. Reading storage would mean rendering the wrong tab and
   * correcting it after mount, which is a visible jump on every load.
   */
  const params = useSearchParams();
  const [chosen, setChosen] = useState<string | null>(params.get("tab"));

  /**
   * The URL is updated WITHOUT a navigation.
   *
   * `router.replace` would re-run the whole server render — the ranking, the
   * diet pass, the grid — to change which of several already-rendered panels is
   * visible. `history.replaceState` writes the address and nothing else, so the
   * tab stays instant and a refresh still lands where you were.
   */
  const setActive = (id: string) => {
    setChosen(id);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
  };
  /* A remembered tab that no longer exists — a build that renamed one, a
     cuisine filter that emptied it — falls back exactly as an unchosen one
     does, rather than showing nothing. */
  const current = tabs.find((t) => t.id === chosen)
    ?? tabs.find((t) => t.count > 0)
    ?? tabs[0];

  return (
    <>
      {/*
        A real tablist: the panel is named, and arrow keys move between tabs.

        `role="tab"` and `aria-selected` were already right; what was missing is
        everything that makes the role mean something — the panel had no id to
        be controlled, and the tabs were reachable only one Tab-stop at a time,
        which is the pattern the role explicitly replaces. Only the selected tab
        is in the tab order; the arrows do the rest.
      */}
      <div className="filters" role="tablist" aria-label="Which recipes"
           onKeyDown={(e) => {
             const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
             if (!step) return;
             e.preventDefault();
             const at = tabs.findIndex((t) => t.id === current?.id);
             const next = tabs[(at + step + tabs.length) % tabs.length];
             if (!next) return;
             setActive(next.id);
             document.getElementById(`tab-${next.id}`)?.focus();
           }}>
        {tabs.map((t) => {
          const on = t.id === current?.id;
          return (
            <button key={t.id} id={`tab-${t.id}`} type="button" role="tab" className="filter"
                    aria-selected={on} aria-controls={`panel-${t.id}`} tabIndex={on ? 0 : -1}
                    onClick={() => setActive(t.id)}>
              {t.label}
              {!t.hideCount && <span className="filter-count">{t.count.toLocaleString()}</span>}
            </button>
          );
        })}
        {/*
          The circle, in the tab row.

          Here rather than over the cards, because what is stale is the COUNTS
          as much as the grid: change your pantry and "Cook tonight 8" is the
          number that is about to move. Beside them, the spinner says which
          numbers are catching up. An overlay on the cards would also hide the
          ones you are reading, which is the opposite of what a background
          update is for.
        */}
        <GridSpinner label="Updating the counts" />
      </div>
      <div role="tabpanel" id={`panel-${current?.id ?? ""}`}
           aria-labelledby={`tab-${current?.id ?? ""}`} tabIndex={0}>
        {current && (current.count === 0 ? current.empty : current.panel)}
      </div>
    </>
  );
}

/**
 * How far the pantry is from cooking this — the distance meter.
 *
 * It replaces a line that read `needs gochujang, doenjang` and a badge that
 * read `2 away`, and it carries something neither could: the SIZE of the
 * recipe. Two ingredients short of a three-ingredient dish and two short of a
 * twenty-eight-ingredient one rendered identically before, and they are not
 * remotely the same proposition.
 *
 * It also fixes a layout problem that was really an information problem. Card
 * height used to vary with how MESSY a recipe was — the ones with long missing
 * lists and parse warnings grew tallest, so the worst results pushed the best
 * ones off the screen.
 *
 * ── Segments, until segments stop working ──────────────────────────────────
 *
 * One tick per ingredient is the honest encoding: you can count them. Past a
 * dozen it stops being countable and becomes a barcode, so it degrades to a
 * proportional bar and lets the ratio beside it carry the detail. The corpus
 * has recipes with 28 requirements, so this is a real case rather than a
 * defensive one.
 *
 * What is lost: the missing ingredients BY NAME. That was a deliberate trade —
 * the names live in the modal, one tap away, where there is room to make each
 * one tappable. `title` carries them for pointer users as a courtesy, never as
 * the mechanism: touch has no hover.
 */
const SEG_LIMIT = 12;

function Distance({ total, missing, names }: {
  total: number; missing: number; names: string[];
}) {
  const have = Math.max(0, total - missing);
  const pct = total > 0 ? Math.round((have / total) * 100) : 0;
  const label = missing === 0 ? `All ${total}` : `${have}/${total}`;

  return (
    <div className="meter" title={names.length ? `Missing: ${names.join(", ")}` : undefined}>
      {total <= SEG_LIMIT ? (
        <div className="meter-segs" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <i key={i} className={i < have ? "on" : "off"} />
          ))}
        </div>
      ) : (
        <div className="meter-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
      )}
      {/* The count is the accessible version of the bar, not a decoration on
          it — which is why the graphic above is hidden from assistive tech. */}
      <span className={missing === 0 ? "meter-count done" : "meter-count"}>
        {label}
        <span className="sr-only">
          {missing === 0
            ? ` ingredients, and you have them all`
            : ` ingredients, and you are missing ${missing}`}
        </span>
      </span>
    </div>
  );
}

/**
 * One recipe, as a card.
 *
 * The image is the point of a gallery — it is what makes a list of 60 dishes
 * scannable — so it leads, and everything else is an overlay or a strip
 * beneath it. Hotlinked for now, which RECIPE-SPEC §1a says should become a
 * cached derivative; that is a pipeline that does not exist yet, and the
 * alternative is a gallery with no pictures.
 */
export function RecipeCard({ title, source, href, image, creatorHref,
                             away, missing, uses, checks, incomplete,
                             sourceRating, warn, total, states, onUpdate,
                             save, cooked = 0, myRating, makeAhead, waitReason,
                             confirmed, hiddenMark, children }: {
  title: string; source: string;
  /**
   * CREATOR-SPEC §5, rendering rule 2: on a claimed creator's list, confirmed
   * and unconfirmed rows must LOOK different, or the profile check silently
   * launders every recipe beneath it. The pen mark is that difference — same
   * glyph as the detail badge, never the profile's check.
   */
  confirmed?: boolean;
  /**
   * Claimant's view only: this row is hidden from visitors. Dims the card and
   * says so — the owner managing their shelf needs to see what others cannot,
   * and needs it to look unmistakably OFF.
   */
  hiddenMark?: boolean;
  /**
   * The source's readers' rating. Never the user's own — see `card-source`.
   *
   * `serves` was surfaced here too and has been taken back out: it is the
   * source's claim about portions, which varies with appetite and with how the
   * dish is served, and it does not help decide what to cook tonight. It stays
   * on `Recipe` because the index carries it; nothing renders it.
   */
  sourceRating?: number;
  /**
   * A dietary caveat that belongs ON the card, because this shelf is not
   * filtered — the user's own saves and cooks (USER-SPEC §6).
   *
   * Filtering those would be absurd: hiding a dish you have cooked because you
   * later set a preference helps nobody. Saying nothing about it was the actual
   * problem — a saved recipe sat on the shelf indistinguishable from one that
   * had passed every check.
   */
  warn?: string;
  /**
   * Where the card goes — the MODAL, not the source.
   *
   * UX-SPEC §5: the modal is a control panel and "the user leaves only after
   * deciding". A card that linked straight out skipped the deciding, and with
   * it the pantry match, the history and the note. The way out is one button at
   * the bottom of the modal.
   */
  href: string; image?: string;
  /** The creator's own page, when the recipe has one — the source name links
      there (same convention as the detail view's `creatorHref`). */
  creatorHref?: string;
  /** How many ingredients short. `0` means you can cook it now. */
  away: number;
  missing: string[];
  /**
   * Total requirements, which turns `away` into a ratio — see `Distance`.
   *
   * Optional, and its absence is meaningful rather than lazy: the shelves on
   * `/my-recipes` answer "what have I cooked" and "what did I mean to cook",
   * deliberately NOT "how close am I". A meter there would invite a comparison
   * that page is designed not to make.
   */
  total?: number;
  /** Ids as well as names — the chips are controls now, not labels. */
  uses: Array<{ id: string; name: string }>;
  checks: Array<{ wants: { id: string; name: string }; have: { id: string; name: string } }>;
  /**
   * Current pantry flags, keyed by ingredient. One shared object for the whole
   * grid rather than a slice per card.
   */
  states?: Record<string, IngredientState>;
  /** Present on the surfaces where a chip may write. Absent = labels only. */
  onUpdate?: (id: string, next: IngredientState) => Promise<ActionResult>;
  /** The heart, laid over the photo. Its own slot because it is not an action row. */
  save?: ReactNode;
  incomplete: boolean;
  /**
   * How many times they have cooked it. Reported, never actionable.
   *
   * Recording a cook moved into the modal, because that is the only place the
   * rating can wake up next to it — a cook logged from the grid would have no
   * prompt anywhere near it and would stay a bare event forever. What survives
   * here is the fact itself, which is what makes a familiar dish recognisable
   * in a grid of sixty.
   */
  cooked?: number;
  /**
   * The user's OWN last rating of this dish, 1–5.
   *
   * Deliberately distinct from `sourceRating`, which is what a blog's readers
   * said. On `/my-recipes` both can be on one card, and a second bare ★ beside
   * the first would read as one number disagreeing with itself. This one is
   * drawn in the rating colour the stars use everywhere else in the product, so
   * "yours" is carried by the mark rather than by a label nobody reads twice.
   */
  myRating?: number;
  /**
   * This dish needs a head start — see `lib/waiting`.
   *
   * A boolean rather than the recipe, because deciding it reads the filesystem
   * (curation and the enrichment pass) and this is a client component. The
   * server decides; the card draws.
   */
  makeAhead?: boolean;
  /** The recipe's own words for why it waits — "overnight", "soak for 1 hour". */
  waitReason?: string;
  children?: ReactNode;
}) {
  return (
    <article className={hiddenMark ? "card card-hidden" : "card"}>
      {/* The heart is a SIBLING of the link, not inside it: a button nested in
          an anchor is invalid, and the tap would open the recipe as well as
          saving it. */}
      <div className="card-media">
      {/*
        Not a link any more — the whole card is the target.

        There were two links to the same recipe on every card: the photo and the
        title. To a screen reader the grid read as sixty pairs, and the first of
        each pair was named after the BADGE, because that is the only text inside
        it: "have everything, link. Yaki Onigiri, link. 5 to buy, link…". To a
        mouse it was worse than it looked too — the photo and the title were
        live, and the gaps between them were not, so half the card ignored a
        click.
        One link, stretched over the whole card by `.card-title::after`, fixes
        both at once: one announcement carrying the dish's name, and a target
        that is the entire card including its whitespace.
      */}
      <div className="card-shot">
        <Shot src={image} fallback={<span className="card-noshot">no photo</span>} />
        {/* The badge says the VERDICT; the meter below says the arithmetic.
            It used to read "2 away", which the meter now states more precisely
            — so it says what to do about it instead of repeating the number. */}
        {away === 0
          ? <span className="card-badge card-badge-have">have everything</span>
          : <span className="card-badge card-badge-away">{away} to buy</span>}
      </div>
      {save}
      </div>

      <div className="card-body">
        {/*
          A real heading, because the grid IS the page's structure.

          The title was a bare link, so the document had no headings below the
          drawer's three and a screen reader skimming by heading found a page
          with a search box, a pantry and a grocery list on it — and no recipes
          at all. `h3` sits under the page's `h1` and the shelf it belongs to.
        */}
        <h3 className="card-title-h">
          {/* `scroll={false}` — opening a modal must not jump the grid to the
              top, or closing it loses the place you were browsing. The spinner
              lives in here now because `useLinkStatus` reports on the Link it
              is rendered inside, and this is the only one left. */}
          {/* Query-param hrefs open the modal over the page you are on — keeping
              your scroll IS the feature. Path hrefs are a new page, and arriving
              mid-scroll on a fresh document reads as landing in the wrong room. */}
          <Link className="card-title" href={href} scroll={!href.startsWith("?")}>
            {title}
            <LinkSpinner />
          </Link>
        </h3>
        <p className="card-source">
          {/*
            The rating sits against the SOURCE NAME rather than repeating it.

            It read "justonecookbook · serves 4 · ★4.6 on justonecookbook" — the
            same name twice on one line of a 200px card. The "on X" was there to
            stop a bare ★ being mistaken for the user's own score, which is a
            real risk beside "made 3×"; adjacency does that job without saying
            the name again, and the title carries the exact claim.
          */}
          {(() => {
            /* Believed or dropped — see `lib/rating`. A scraped number outside
               0–5 is a review count in the wrong field, not a score. */
            const rated = believable(sourceRating);
            return (
              <span title={rated !== undefined
                            ? `${source} readers rated this ${rated.toFixed(1)} out of 5`
                            : undefined}>
                {/* The name links to the creator's shelf when one exists —
                    lifted above the card's stretched link like the chips are,
                    or the whole card would swallow the click. */}
                {creatorHref
                  ? <a className="source-link" href={creatorHref}>
                      <SourceLabel source={source} />
                    </a>
                  : <SourceLabel source={source} />}
                {rated !== undefined && <> ★{rated.toFixed(1)}</>}
              </span>
            );
          })()}
          {confirmed && (
            <span className="card-confirmed"
                  title="The creator confirmed this ingredient list themselves">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
                   strokeLinejoin="round" aria-hidden="true">
                <path d="M17 3l4 4L8 20l-5 1 1-5L17 3z" />
              </svg>
              confirmed
            </span>
          )}
          {/* "Made before", not "made 3×".

              On a card the only question this answers is "have I had this?" —
              a yes/no, scanned in a grid of thirty at arm's length. The exact
              count is a fact about one recipe, and the place you are asking
              about one recipe is the modal, which now spells it out in words.
              A number here made the eye stop and read where it meant to skim. */}
        </p>

        {/*
          Your own history, on its own line.

          It shared the line with the source and the source's rating, which put
          a fact about YOU inside a sentence about a blog — and on a narrow card
          the three wrapped into each other until "made before" looked like part
          of the publication's name. Its own line is also what makes room for
          your rating to sit beside it, which is the only place that number
          belongs: next to the claim it is about.
        */}
        {(cooked > 0 || myRating !== undefined) && (
          <p className="card-mine">
            {cooked > 0 && <span className="card-cooked">Made before</span>}
            {myRating !== undefined && (
              <span className="card-myrating"
                    title={`you rated this ${myRating} out of 5`}>
                {"★".repeat(myRating)}
                <span className="sr-only">you rated this {myRating} out of 5</span>
              </span>
            )}
          </p>
        )}

        {warn && <p className="card-warn">{warn}</p>}

        {typeof total === "number" && total > 0 && (
          /*
            A DIV, not a paragraph.

            `Distance` renders a `<div>`, and a `<div>` inside a `<p>` is
            invalid HTML: the parser closes the paragraph before it, so the
            meter was hoisted out of the wrapper that exists to lay it out and
            the 3/3 bar stopped drawing. Introduced with the head-start badge —
            a wrapper added around something that was previously a direct child.
          */
          <div className="card-meter">
            <Distance total={total} missing={away} names={missing} />
            {/*
              Beside the distance, because it answers the same question.

              "You have everything" and "3 to buy" both say what stands between
              you and this dish; so does "needs a day". Putting it anywhere else
              would let someone read the first line, decide dinner is solved,
              and find out at the method that the marinade wanted overnight.

              The tooltip carries the recipe's own reason where the enrichment
              pass captured one, so the claim is checkable rather than a badge
              the app asserts.
            */}
            {/*
              "Needs a head start" — the words the curation form already uses
              for this exact field, so the product says one thing about it in
              both places.

              "Can eat tomorrow" was wrong twice over: it promised a specific
              day for waits that range from an hour to two days, and it framed
              the wait as happening AFTER cooking, when marinating and proofing
              happen before. A head start says the true thing — begin this
              earlier than you otherwise would — without claiming to know your
              evening.
            */}
            {makeAhead && (
              <span className="tag tag-ahead"
                    title={waitReason ? `Needs a head start: ${waitReason}` : "Needs a head start"}>
                needs a head start
              </span>
            )}
          </div>
        )}

        {/*
          Ingredients read as ingredients — UX-SPEC's one vocabulary.

          These were comma-joined prose while the same names in the drawer and
          the modal were chips, so the thing the whole product is about looked
          like two different kinds of object depending on where you met it.
          Not interactive here: a card is one target, and the chips describe
          the match rather than offering to change it.
        */}
        {uses.length > 0 && (
          <div className="card-uses">
            <span className="card-lead">uses</span>
            {onUpdate
              ? <IngredientChips onUpdate={onUpdate}
                                 items={uses.map((u) => chipFor(u, "have", states))} />
              : <span className="card-chips">
                  {uses.map((u) => <Chip key={u.id} label={u.name} tone="have" pinned />)}
                </span>}
          </div>
        )}

        {/* RECIPE-SPEC §1: never hide that we could not account for a line —
            but say it as a fact about the RECIPE, not about our parser. "some
            ingredients unrecognised" reads as "this recipe is broken"; the
            actual meaning is that our reading of it is partial, so the match
            may be missing something and the source is the authority.

            Shortened here and said in full in the modal. The card is scanned;
            the modal is read, and it is where the source is named as the
            authority. */}
        {hiddenMark && <p className="card-warn">hidden from visitors</p>}
        {incomplete && <p className="card-warn">we couldn’t read every line</p>}

        {/* INGREDIENT-SPEC §3a — per ingredient, because the user can only act
            on it if they know which line. The instruction to check the source
            lives in the modal, where the ingredient is also tappable. */}
        {checks.map((c) => (
          <div className="card-check" key={c.wants.id}>
            <span className="card-lead">calls for</span>
            {onUpdate
              ? <IngredientChips onUpdate={onUpdate}
                                 items={[chipFor(c.wants, "missing", states)]} />
              : <Chip label={c.wants.name} tone="missing" />}
            <span className="card-lead">you have</span>
            {onUpdate
              ? <IngredientChips onUpdate={onUpdate}
                                 items={[chipFor(c.have, "have", states)]} />
              : <Chip label={c.have.name} tone="have" />}
          </div>
        ))}

        {children && <div className="card-actions">{children}</div>}
      </div>
    </article>
  );
}
