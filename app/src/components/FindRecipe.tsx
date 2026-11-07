"use client";

/**
 * Recipe search, on the page you cook from.
 *
 * The product held 4,874 recipes and offered no way to look for one by name.
 * `searchRecipes` existed and was wired into exactly one place — the calendar's
 * plan picker — so "I want japchae tonight" was answerable only by going to the
 * calendar and pretending to plan a meal.
 *
 * ── It completes a WORD; the grid shows the recipes — UX-SPEC §4j ──────────
 *
 * This used to answer with twelve recipe rows, and that made it a second, worse
 * gallery stacked above the real one: its own card shape, its own ordering, and
 * none of what the grid has — tabs, distance, saved marks, cook counts, the
 * cuisine chips. Two lists of recipes on one screen, disagreeing about how to
 * show a recipe, with the better one pushed below the fold.
 *
 * So the box does the one thing a box above a grid should do: it finishes the
 * word you are typing. `gochu` offers **gochujang** and **gochugaru**; `japchae`
 * offers **japchae**. Picking one gives the term its own SHELF, first in the
 * row, and the grid stays the only place a recipe is ever drawn.
 *
 * ── A shelf, not a filter over the others ─────────────────────────────────
 *
 * The term used to narrow the whole grid, which quietly rewrote every tab:
 * "Can cook now" stopped meaning "what your pantry can cook" and started
 * meaning "japchae your pantry can cook", with nothing on screen saying so. Its
 * own shelf leaves the other three answering the question they always answered,
 * and it is gone the moment the term changes — because it IS the term.
 *
 * ── A link, not component state ───────────────────────────────────────────
 *
 * The same reasoning as `?c=` and `?recipe=`: the back button undoes the
 * search, a reload keeps it, a shared link carries it, and the work happens on
 * the server where the ranking already is.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./primitives";
import { useSearch } from "@/lib/debounce";

export type Completion = { term: string; recipes: number };

export function FindRecipe({ search, chosen, keep = "" }: {
  search: (q: string) => Promise<Completion[]>;
  /** The term the grid is filtered by, or undefined for everything. */
  chosen?: string;
  /**
   * The page's OTHER parameters, already serialised — the cuisine chip, a diet
   * peek — so choosing a word narrows the page rather than resetting it.
   *
   * A string and not the page's own link builder: this is a client component,
   * and a function cannot cross that boundary (`CuisineBar` can take one only
   * because it renders on the server).
   */
  keep?: string;
}) {
  const router = useRouter();
  /**
   * The searched word STAYS in the box, so it can be edited rather than
   * retyped — `japchae` to `japchae noodles` is one word, not a fresh search.
   * The page remounts this on the term (`key`), so a navigation seeds the box
   * with whatever is now being searched.
   */
  const [open, setOpen] = useState(false);

  /**
   * ── The bar follows you down the page, as a disc ────────────────────────
   *
   * On a phone the search sits above the grid, and the grid is thousands of
   * cards long. Four screens down, the one control that changes what the grid
   * is showing is four screens up — so searching means scrolling back to the
   * top, and the way people actually search instead is to not.
   *
   * A sentinel watches the real bar. When it leaves the viewport a magnifier
   * appears at the top left; tapping it opens a floating copy of the same
   * search, tapping it again puts it away. Top LEFT because the pantry disc
   * has the bottom right and two floating controls in one corner is a
   * mis-tap waiting to happen.
   *
   * The sentinel is a separate element rather than the wrapper itself: the
   * floating pieces are `position: fixed` and contribute no height, so a
   * wrapper that held them would collapse and start reporting its own
   * absence.
   */
  const mark = useRef<HTMLDivElement>(null);
  const [away, setAway] = useState(false);
  const [float, setFloat] = useState(false);
  /**
   * Whether the page has scrolled past the top bar. The follower needs BOTH:
   * the real bar gone AND real scrolling. On a phone the first-run panel
   * alone pushes the bar below the fold, so "bar not visible" was true at
   * scroll zero and the disc mounted straight onto the brand — a magnifier
   * sitting on "JipBap" as a stranger's first screen. Past ~the bar's own
   * height, there is nothing up there to cover.
   */
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = mark.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      const gone = !e?.isIntersecting;
      setAway(gone);
      // Scrolled back to the real bar — the floating copy has nothing left
      // to do, and leaving it open would put two search boxes on one screen.
      if (!gone) setFloat(false);
    }, { threshold: 0 });
    io.observe(el);
    const onScroll = () => setScrolled(window.scrollY > 64);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, []);
  const href = (term?: string) => {
    const sp = new URLSearchParams(keep);
    if (term) sp.set("q", term); else sp.delete("q");
    const s = sp.toString();
    return s ? `?${s}` : "?";
  };
  // Debounced, with stale responses dropped — see `useSearch`.
  const { q, setQ, hits, pending, clear } = useSearch(search, 180, chosen ?? "");
  const searched = q.trim().length >= 2;

  /*
    Split in two, because the follower slides one of them and not the other.

    The bar is what moves: it comes out from behind the magnifier, so the
    strip that carries it is clipped while it travels. The results cannot live
    inside that clip — a dropdown inside an `overflow: hidden` strip is a
    dropdown with nowhere to drop — so they are their own panel underneath,
    in both renders.

    Defined once and used in both places, so the floating copy cannot drift.
  */
  /* Enter searches what was typed, even with nothing to complete it.
     `bibimbap` may be spelled in a way no title uses, and a box that can only
     be operated by picking from a list is a box that refuses words. */
  const bar = (
    <form className="search" onSubmit={(e) => {
      e.preventDefault();
      if (!searched) return;
      setOpen(false); router.push(href(q.trim()));
    }}>
      <input value={q} placeholder="Type a recipe or an ingredient"
             aria-label="Find a recipe by name or by ingredient"
             onChange={(e) => { setQ(e.target.value); setOpen(true); }} />
      {/* One meaning of "clear": empty the box AND drop the tab. Emptying
          only the box would leave a shelf on screen named after a word that
          is no longer anywhere, with nothing left to remove it. */}
      {(q || chosen) && (
        <button type="button" className="search-clear" aria-label="Clear search"
                onClick={() => {
                  clear(); setOpen(false); if (chosen) router.push(href());
                }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"
               aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" />
          </svg>
        </button>
      )}
    </form>
  );

  const results = (
    <>
      {open && searched && hits.length === 0 && !pending && (
        <p className="note">No recipe or ingredient by that name.</p>
      )}

      {open && hits.length > 0 && (
        <div className="hitbox">
          <ul className="hits findrecipe-hits">
            {hits.map((h) => (
              <li key={h.term}>
                {/* The count is what the GRID will hold for this word — see
                    `completions`. A different number here would be a promise
                    the next screen breaks. */}
                <Link className="hit" href={href(h.term)} scroll={false}
                      onClick={() => { setQ(h.term); setOpen(false); }}>
                  <span className="hit-name">{h.term}</span>
                  <span className="hit-count">{h.recipes.toLocaleString()} recipes</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );

  return (
    <div className="findrecipe">
      {/* Zero-height, always in flow: the thing the observer actually watches. */}
      <div ref={mark} className="findrecipe-mark" aria-hidden="true" />
      {bar}
      {results}

      {/*
        The follower. Phone-only in CSS, and mounted only once the real bar has
        gone — a fixed control sitting over a bar you can already see is two of
        the same thing on one screen.
      */}
      {away && scrolled && (
        <div className={float ? "findfloat is-open" : "findfloat"}>
          <button type="button" className="findfloat-fab" aria-expanded={float}
                  aria-label={float ? "Hide search" : "Find a recipe"}
                  onClick={() => setFloat((v) => !v)}>
            {/* Drawn, not typed — the same rule the shell’s marks follow. */}
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth={2} strokeLinecap="round"
                 strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="M16.5 16.5L21 21" />
            </svg>
          </button>
          {/*
            The strip the bar travels in. Always mounted and always clipped, so
            the bar can slide out from behind the disc rather than blinking into
            place — an element that appears has no direction, and the direction
            is the part that says where it came from.
          */}
          <div className="findfloat-strip">{bar}</div>
          {/* Outside the clip: a dropdown inside `overflow: hidden` has
              nowhere to drop. Mounted only while open, because a results
              panel is not something to animate. */}
          {float && <div className="findfloat-results">{results}</div>}
        </div>
      )}
    </div>
  );
}
