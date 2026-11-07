"use client";

/**
 * The recipe modal — UX-SPEC §5.
 *
 * **A control panel, not a preview.** Everything needed to DECIDE lives here;
 * the instructions never do. We do not hold the method text and will not render
 * it — the exit is one button at the bottom, and the decision happens before it
 * is pressed.
 *
 * It is the element that threads the three surfaces: the recommendation grid,
 * the calendar, and a recipe's own page all open THIS. Which is why it is
 * addressed by a query parameter (`?recipe=rec_x`) rather than component state —
 * the back button closes it, a reload keeps your place, and the page it is over
 * is whichever page you were on. No parallel routes, no interception: the
 * server page reads the parameter, loads that one recipe's history, and renders
 * this over its own content.
 *
 * The chrome is here; the CONTENT is a server component passed as `children`,
 * because history and notes are the user's data and belong on the server.
 */
import { useGrid } from "./GridStatus";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function RecipeModal({ title, recipeId, onOpened, live = false, children }: {
  /** The dish, for the accessible name. "Recipe" told a screen reader nothing. */
  title?: string;
  /** Which recipe this is, so opening it can be recorded — see `noteOpened`. */
  recipeId?: string;
  /**
   * Records the open, for Explore.
   *
   * Called from here rather than during the server render of this modal
   * because Next PREFETCHES: rendering `?recipe=x` is something that happens
   * when a card is merely hovered. Recording there would mark recipes nobody
   * looked at, and Explore would quietly stop offering exactly the cards the
   * user was closest to choosing.
   */
  onOpened?: (recipeId: string) => Promise<unknown>;
  /**
   * The page behind this modal reads its shelves from the DEVICE.
   *
   * The open mark is Explore's whole memory, and Explore is client-rendered on
   * the home page now (STATIC-SPEC §2, slice B), so a mark that landed only in
   * `owners.json` would leave that shelf offering the same card for ever. With
   * this set, the write goes through `lib/dual-write` — device first, server
   * after — instead of straight to the action.
   *
   * A prop rather than always-on, because the calendar and `/my-recipes` open
   * this same modal and do not pass `onOpened` at all: marking from there would
   * invent a signal those pages never sent.
   */
  live?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  /** Where focus was before we took it, so it can be handed back on close. */
  const opener = useRef<Element | null>(null);
  /** The page's own overflow, restored the moment we start closing. */
  const bodyPrior = useRef("");
  /**
   * Dismissed on screen, before the URL agrees.
   *
   * Closing is `router.push`, which is a SERVER navigation: the page re-renders
   * without the parameter and only then does the sheet disappear. That is a
   * beat of nothing after the click, so the tap read as ignored — the same
   * complaint the cards had, with the same answer. The sheet goes now and the
   * address catches up.
   */
  const [closing, setClosing] = useState(false);

  /**
   * Closing drops the parameter, which is a navigation — so the browser's back
   * button and this button do the same thing, and neither can leave the other's
   * idea of the URL behind.
   *
   * `router.back()` would be wrong: arriving by a shared or reloaded link means
   * there is nothing behind, and back would leave the app.
   */
  const { flush } = useGrid();
  const close = () => {
    /* Anything changed from inside this modal — a chip in the ingredient list —
       lands on the grid now that the grid is the screen again. Started before
       the navigation below rather than after, so the two happen together and
       the spinner is already up when the page reappears. */
    flush();
    if (closing) return;
    setClosing(true);
    // Released here rather than in the unmount cleanup, which does not run
    // until the navigation lands — otherwise the page behind stays locked for
    // as long as the round trip takes.
    document.body.style.overflow = bodyPrior.current;
    /*
      `preventScroll`, or closing MOVES THE PAGE. Handing focus back to the card
      that opened the modal is right — you should land where you were — but a
      bare `.focus()` also scrolls that card into view, and "into view" is not
      "back where it was": the browser scrolls it to the nearest edge, so the
      grid shifted by a card or so on every close. The scroll position was never
      lost; it was being helpfully corrected.
    */
    if (opener.current instanceof HTMLElement) opener.current.focus({ preventScroll: true });
    /*
      Only the modal's own parameters leave with it: `recipe`, and the `date`
      and `view` that qualify it. A bare `"?"` dropped everything — including
      `seed`, which is the ONLY thing holding the shuffled shelves still (see
      `shuffleSeed` in the home page: arrive without one and you are dealt a
      new hand). So closing the sheet reshuffled the grid underneath it, and
      the card you had just read was somewhere else when you got back.
    */
    const params = new URLSearchParams(window.location.search);
    for (const k of ["recipe", "date", "view"]) params.delete(k);
    const rest = params.toString();
    router.push(rest ? `?${rest}` : "?", { scroll: false });
  };

  /**
   * Clicking the space around the sheet closes it.
   *
   * Handled on the WRAPPER rather than on the scrim, because the scrim is one
   * fixed layer among several and any future change to padding, z-index or
   * stacking silently breaks a hit test that depends on its geometry. Asking
   * "was this outside the sheet" cannot break that way.
   *
   * Both ends of the gesture are checked. Selecting text inside the sheet and
   * releasing outside it is a drag, not a dismissal, and closing on it would
   * throw away whatever the user was doing.
   */
  /**
   * "Outside" means the wrapper ITSELF, not "not inside the sheet".
   *
   * The old test was `!box.contains(target)`, and it closed the modal every time
   * you touched the ingredient state widget: `Popover` portals that widget to
   * `document.body`, so although it is visually over the sheet and logically
   * part of it, it is not a DOM descendant of it. Tapping "Will buy" on a chip
   * inside a recipe therefore read as a click on the backdrop — the sheet closed
   * and the flag change was lost with the unmounted popover. That is the exact
   * gesture §1 calls the prime directive and §5 calls one tick, and it did
   * nothing.
   *
   * Identity, not containment: the wrapper is only ever the direct target when
   * the pointer lands on the padding around the sheet, which is precisely the
   * gesture that means "dismiss". The scrim cannot be a target — it is
   * `pointer-events: none` — and anything portalled lands on itself, not here.
   */
  const wrap = useRef<HTMLDivElement>(null);
  const isBackdrop = (t: EventTarget | null) => t === wrap.current;
  const downOutside = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    downOutside.current = isBackdrop(e.target);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (downOutside.current && isBackdrop(e.target)) close();
    downOutside.current = false;
  };

  /*
    Recorded once per mount, detached.

    Nothing on screen waits for it — the effect is on what Explore offers next
    time — so it must not be on the path between the tap and the sheet. A
    failure is silently fine: a lost open costs one recipe being offered again,
    which is a smaller harm than a modal that stalls on a write.
  */
  const noted = useRef(false);
  useEffect(() => {
    if (!recipeId || !onOpened || noted.current) return;
    noted.current = true;
    const write = live
      ? (id: string) => import("@/lib/dual-write").then((m) => m.noteOpened(id))
      : onOpened;
    void write(recipeId).catch(() => { /* an unrecorded glance is not an error */ });
  }, [recipeId, onOpened, live]);

  useEffect(() => {
    opener.current = document.activeElement;

    /**
     * Focus goes into the dialog, and stays there.
     *
     * `aria-modal` is a promise to assistive technology that the rest of the
     * page is inert, and it was a promise this component did not keep: focus
     * never moved in, so Tab walked straight out of the dialog and through the
     * sixty cards behind it, which are visually covered and still reachable.
     * Escape closed the modal but nothing put focus back where it came from.
     */
    const focusables = () => [...(box.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ) ?? [])].filter((el) => el.offsetParent !== null);

    /*
      `preventScroll`, because focusing the sheet scrolls it flush to the top of
      the wrapper — which ate the wrapper's top padding and took the close
      button above it off screen with it. The focus is structural (it is what
      puts assistive tech inside the dialog), so it has no business moving the
      view at all.
    */
    box.current?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close(); return; }
      if (e.key !== "Tab") return;
      const els = focusables();
      const first = els[0], last = els[els.length - 1];
      if (!first || !last) return;
      // Wrap at both ends rather than letting the browser leave the dialog.
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener("keydown", onKey);
    // The page beneath must not scroll while a modal is over it — on a phone
    // the scroll otherwise passes through and you lose your place in the grid.
    bodyPrior.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = bodyPrior.current;
      // Back to the card that opened it, so closing does not dump you at the
      // top of the document — without scrolling, for the reason above.
      if (opener.current instanceof HTMLElement) opener.current.focus({ preventScroll: true });
    };
  }, []);

  if (closing) return null;

  return (
    <div className="modal-wrap" ref={wrap} role="dialog" aria-modal="true"
         aria-label={title ? `Recipe: ${title}` : "Recipe"}
         onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
      {/* Decoration. The dimming is its whole job — the wrapper above owns the
          dismissal, and Escape owns the keyboard. */}
      <div className="modal-scrim" aria-hidden="true" />
      {/*
        A close button, on touch screens — reverses "no close button".

        The old argument was that the scrim, Escape and the back button all
        dismiss it, so a fourth way was not worth a corner of the photo. Two of
        those three are desk affordances: there is no Escape key on a phone, and
        the back GESTURE is a system swipe that people either know or do not.
        That left the scrim, and the scrim on a phone is a strip of dimmed page
        a thumb has to stretch for — the sheet fills nearly the whole screen.

        It sits ABOVE the sheet rather than inside it, which is what keeps the
        original argument intact: it costs no corner of the photo, and the photo
        keeps the heart it has on the card.
      */}
      {/*
        No floating ✕ any more.

        It sat above the sheet as a dark disc, which cost no corner of the
        photo but did cost a control hovering over the page with nothing
        around it to say what it belonged to. The way out is now a button at
        the BOTTOM of the sheet, under "Made it!" — where the other two
        decisions already are, and where a thumb finishing the page arrives
        anyway. See `RecipeDetail`.

        The scrim and Escape still close it, and on a phone the sheet fills
        nearly the whole screen — which is exactly why a reachable button had
        to exist somewhere, and why the bottom is a better somewhere than a
        disc floating off the top edge.
      */}
      <div className="modal-col">
        <div className="modal" ref={box} tabIndex={-1}>
          {children}
          {/*
            The way out, last and full width.

            Rendered here rather than in `RecipeDetail` because closing is the
            modal's own business — this component owns `close()`, the history
            entry and the scroll restoration, and handing all three down through
            a server component to a button would be threading state through a
            place that has no use for it.

            Outline only: it is the third button in a column that already has a
            filled exit ("View full recipe") and a filled claim ("Made it!"), and
            a third fill would make the sheet end in a wall of colour with no
            order to it. Same size as both, because a thumb reaching the bottom
            of the page should not have to aim.
          */}
          <button type="button" className="modal-dismiss" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
