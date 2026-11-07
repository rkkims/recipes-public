"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { SaveStatusProvider, SaveStatusIcon } from "./SaveStatus";
import { usePanels } from "./Panels";
import { useGrid } from "./GridStatus";

/**
 * The pantry beside the results, out of the way, or filling the screen.
 *
 * The pantry was a stack of sections above the results, so on any real pantry
 * you scrolled past your own ingredients to reach the recipes they unlocked —
 * the thing you were meant to maintain was the thing in the way. Beside them it
 * is context for the gallery rather than a step before it.
 *
 * ── Three modes, because there are three jobs ──────────────────────────────
 *
 * The docked column served the common case and nothing else. It could not get
 * out of the way when someone wanted the whole width for browsing, and it was
 * far too narrow for the other real task: sitting down and sorting the pantry
 * out properly before looking at a single recipe. That job wants the screen.
 *
 *   - **docked** — beside the gallery. The default, and what you want mid-cook.
 *   - **hidden** — collapsed to a rail, so the results get the full width.
 *   - **full** — the pantry over everything, for a tidy-up session.
 *
 * On a narrow screen "docked" is meaningless — there is no room for two columns
 * — so it slides over the content instead, which is what it always did.
 *
 * ── The mode is remembered ─────────────────────────────────────────────────
 *
 * Someone who collapses the drawer wants it collapsed on the next page too, and
 * a preference that resets on every navigation is worse than no preference.
 * `localStorage` rather than the URL: this is about the person, not the page,
 * and it should not travel in a shared link.
 */
/**
 * Drawn, not typed.
 *
 * These were the characters `⤢`, `⤡` and `⟨` — mathematical arrows and an angle
 * bracket. They are thin by design and occupy a fraction of their em box, so
 * they read as small however large the font-size gets, and the exact weight
 * changes with whatever font the platform substitutes. Raising the size just
 * made faint marks bigger.
 *
 * As SVG the geometry is ours: stroke weight, proportion and optical size stay
 * the same everywhere, and `currentColor` keeps them in step with the button's
 * hover and pressed states without a second rule.
 */
function Icon({ shape }: { shape: "expand" | "shrink" | "hide" | "menu" | "close" }) {
  const common = {
    width: 20, height: 20, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 2,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (shape === "menu") {
    return (
      <svg {...common}>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    );
  }
  if (shape === "close") {
    return (
      <svg {...common}>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    );
  }
  if (shape === "expand") {
    return (
      <svg {...common}>
        <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6" />
      </svg>
    );
  }
  if (shape === "shrink") {
    return (
      <svg {...common}>
        <path d="M3 9h6V3M21 9h-6V3M3 15h6v6M21 15h-6v6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export type ShellMode = "docked" | "hidden" | "full";

const KEY = "pantry-mode";

export function Shell({ drawer, children, listPage = false }: {
  drawer: ReactNode; children: ReactNode;
  /**
   * `/list` docks the pantry instead of layering it — §4e.
   *
   * The one page where the pantry is half the task rather than reference while
   * doing something else. Two columns on a desk, stacked on a phone, and the
   * panel toggles do not apply: there is nothing to open because it is already
   * open.
   */
  listPage?: boolean;
}) {
  const [mode, setMode] = useState<ShellMode>("docked");
  /** Narrow screens have their own idea of "open" — see the note above. */
  const [open, setOpen] = useState(false);

  // Read after mount: `localStorage` does not exist on the server, and reading
  // it during render would make the markup disagree with itself on hydration.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "docked" || saved === "hidden" || saved === "full") setMode(saved);
    } catch { /* private browsing; the default is fine */ }
  }, []);

  const go = (next: ShellMode) => {
    setMode(next);
    try { localStorage.setItem(KEY, next); } catch { /* not worth failing over */ }
  };

  // Full-screen pantry must not leave the page scrolling behind it.
  useEffect(() => {
    if (mode !== "full") return;
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prior; };
  }, [mode]);


  // Escape leaves the full-screen pantry, like every other overlay here.
  useEffect(() => {
    if (mode !== "full") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") go("docked"); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode]);

  /**
   * §4d: the nav owns the controls, this owns the panels.
   *
   * The old `open` state was a single drawer with one toggle. Now each panel has
   * its own control in the nav, so "is the drawer showing" is "is EITHER panel
   * open", and which shelves it contains is decided by the classes below —
   * `Pantry` already renders `.shelf-pantry` and `.shelf-list` as separate
   * blocks, so this needs no surgery on the component that draws them.
   */
  const panels = usePanels();

  /**
   * The page stops moving while the drawer is open — phones only.
   *
   * `overscroll-behavior: contain` on the drawer's own scroller stops a flick
   * from CHAINING into the page once the pantry reaches its end, and that was
   * the whole fix until now. It does nothing for a touch that starts anywhere
   * the drawer does not scroll — its padding, a shelf heading, the gap between
   * the two shelves — and those gestures went straight through to the grid
   * behind. So the pantry sat still while the page slid underneath it, which
   * reads as the panel having come loose.
   *
   * Locking the body is the rest of it. Phone-only, because at desk width the
   * drawer is docked beside the grid rather than over it and the page is
   * supposed to keep scrolling — freezing it there would break reading a recipe
   * with the pantry open, which is the arrangement that width exists for.
   *
   * The prior value is saved and restored rather than cleared, because the
   * modal and the dialogs lock the same property: a blind reset would unlock
   * the page underneath one of them.
   */
  const drawerOpen = open || panels.anyOpen;

  /**
   * Leaving the pantry is what tells the grid to catch up.
   *
   * Not each tap inside it: while the drawer is over the page, the grid is not
   * what anyone is looking at, and re-rendering it between taps spends the
   * interaction's whole budget on a screen nobody is reading. The moment it
   * closes, the grid IS the screen again — so that is when it is worth the work.
   *
   * The close is not held for it. `drawerOpen` has already flipped by the time
   * this runs, so the panel is gone on that frame and the catch-up starts after,
   * as a transition, with the spinner saying so.
   */
  const { flush } = useGrid();
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !drawerOpen) flush();
    wasOpen.current = drawerOpen;
  }, [drawerOpen, flush]);
  useEffect(() => {
    if (!drawerOpen) return;
    if (!window.matchMedia("(max-width: 860px)").matches) return;
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prior; };
  }, [drawerOpen]);
  const cls = listPage
    /*
      `shell-open` still applies here.

      On desk the pantry is docked by a `min-width` rule and the class changes
      nothing; on a phone it is the floating widget's only way to open, and
      leaving it out made the pantry control on `/list` a button that did
      nothing — on the one page the pantry is most wanted.
    */
    ? ["shell", "shell-docked", "shell-listpage",
       panels.open.pantry ? "shell-open" : ""].filter(Boolean).join(" ")
    : ["shell", `shell-${mode}`,
       (open || panels.anyOpen) ? "shell-open" : "",
       panels.open.pantry ? "" : "panels-no-pantry",
      ].filter(Boolean).join(" ");

  return (
    <SaveStatusProvider>
    <div className={cls}>
      {/* Narrow screens: the drawer slides over. Hidden at desk width, where
          the rail below does the same job without covering anything. */}
      <button className="drawer-toggle" type="button" onClick={() => setOpen((v) => !v)}
              aria-expanded={open} aria-controls="pantry-drawer">
        <Icon shape={open ? "close" : "menu"} />
        {open ? "close" : "pantry"}
      </button>

      {/* The rail that brings a collapsed pantry back. Its own control rather
          than a sliver of the drawer, so it cannot be missed or mis-tapped. */}
      {mode === "hidden" && (
        <button className="drawer-rail" type="button" onClick={() => go("docked")}
                aria-label="Show the pantry">
          <Icon shape="menu" />
          <span className="drawer-rail-word">pantry</span>
        </button>
      )}

      <aside id="pantry-drawer" className="drawer">
        <div className="drawer-inner">
          {/* The mode controls live in the drawer, on the thing they resize. */}
          {/*
            Icon-only, and safe to be: all three are reversible, adjacent to the
            thing they resize, and their effect is visible the instant they are
            pressed — which is the condition under which a glyph can carry a
            control on its own. The name still has to exist for anyone who
            cannot see the effect, so each carries a real label rather than
            relying on the tooltip, which touch never shows.
          */}
          <div className="drawer-modes">
            {/* Left of the window controls: it is about the CONTENT, and it
                should not be mistaken for one of them. */}
            <SaveStatusIcon />
            <button type="button" className="drawer-mode"
                    aria-pressed={mode === "full"}
                    aria-label={mode === "full" ? "Shrink the pantry" : "Expand the pantry"}
                    title={mode === "full" ? "Shrink" : "Expand"}
                    onClick={() => go(mode === "full" ? "docked" : "full")}>
              <Icon shape={mode === "full" ? "shrink" : "expand"} />
            </button>
            {mode !== "full" && (
              <button type="button" className="drawer-mode"
                      aria-label="Hide the pantry" title="Hide"
                      onClick={() => go("hidden")}>
                <Icon shape="hide" />
              </button>
            )}
          </div>
          {drawer}
        </div>
      </aside>

      {/* Tapping away closes it — only rendered when it is covering something,
          so it never sits invisibly over the gallery. */}
      {(open || panels.anyOpen || mode === "full") && (
        <button className="drawer-scrim" type="button"
                aria-label={mode === "full" ? "Close the pantry" : "Close pantry"}
                onClick={() => { if (mode === "full") go("docked"); setOpen(false); panels.closeAll(); }} />
      )}

      {/* The skip link's target — see `Nav`. */}
      <main className="main" id="main" tabIndex={-1}>{children}</main>
    </div>
    </SaveStatusProvider>
  );
}
