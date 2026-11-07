"use client";

/**
 * A small panel anchored to the thing that opened it.
 *
 * The state widget used to render after the WHOLE chip cloud, so tapping the
 * first of forty ingredients opened a panel below all forty — usually off
 * screen, in a drawer that is itself scrolling. You tapped something and
 * nothing appeared to happen.
 *
 * ── Why `position: fixed`, and why portalled on top of that ───────────────
 *
 * `.drawer-inner` sets `overflow-y: auto`, which clips absolutely-positioned
 * descendants. A panel anchored the obvious way would be cut off by the very
 * container it sits in. Fixed coordinates escape the clip, at the cost of
 * having to be recomputed whenever anything scrolls — which is what the
 * capture-phase listener below is for.
 *
 * Fixed alone is still not enough. `.drawer` creates a stacking context
 * (`position: fixed; z-index: 40`) and, in its closed state, a containing block
 * (`transform`) — and a containing block makes "fixed" mean "fixed to the
 * drawer". So this portals to `body` as well, which is the only version that
 * survives someone adding a `filter` or `will-change` up the tree later.
 *
 * ── Flip, then clamp ───────────────────────────────────────────────────────
 *
 * Below the anchor by default, because that is where a panel opened by a tap is
 * expected. Above when there is not room below — a chip near the bottom of a
 * phone screen is the common case, not the exotic one. If neither side fits it
 * takes the roomier one and scrolls internally, so the panel is always fully
 * reachable rather than half off screen.
 *
 * Measured in a layout effect and positioned before paint, so it never appears
 * in the wrong place first.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Breathing room between the anchor and the panel, and from the viewport edge. */
const GAP = 6;
const EDGE = 8;

type Placement = { top: number; left: number; maxHeight: number; above: boolean };

export function Popover({ anchor, onClose, label, children }: {
  /** The element that opened this. Its rect is the anchor. */
  anchor: HTMLElement | null;
  onClose: () => void;
  /** Accessible name — the ingredient, usually. */
  label: string;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<Placement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setHost(document.body); }, []);

  useLayoutEffect(() => {
    if (!anchor) return;

    const place = () => {
      /*
        A re-render can replace the anchor node, and changing state is what does
        it: tick something into the pantry and the chip is unmounted from the
        grocery list and remounted under an aisle heading in the shelf above.
        The element we measured is gone a beat after the tap that used it.

        This used to close on that, reasoning that repositioning against a
        detached node puts the panel at 0,0. The premise is right and the
        conclusion was wrong — the panel was closing itself the instant anyone
        used it, so every state change cost a second tap to get the control
        back, and the one thing it is for (correcting several things about one
        ingredient) could not be done at all.

        So: keep the last placement and stay open. The panel is `position:
        fixed`, so it holds its spot on screen; the chip it points at has
        usually moved a few rows, which is a smaller lie than vanishing. Only
        the user closes this — Escape, or a pointer down outside it.
      */
      if (!anchor.isConnected) return;

      const r = anchor.getBoundingClientRect();
      const w = box.current?.offsetWidth ?? 0;
      const vw = window.innerWidth;

      /*
        The usable bottom is the tab bar, not the viewport.

        On a phone the last ~80px of the screen is a fixed bar. A panel placed
        against the viewport edge ends up UNDER it: visibly cut off, and
        because the bar takes the taps, holding controls that cannot be
        pressed. Measured rather than hardcoded — the bar is a media query
        away from not existing, and a constant would be wrong at desk width.
      */
      const bar = document.querySelector(".tabbar");
      const barTop = bar && getComputedStyle(bar).display !== "none"
        ? bar.getBoundingClientRect().top
        : window.innerHeight;
      const vh = Math.min(window.innerHeight, barTop);

      const roomBelow = Math.max(0, vh - r.bottom - GAP - EDGE);
      const roomAbove = Math.max(0, r.top - GAP - EDGE);

      /*
        ── The decision is made on the CONTENT height, not the rendered one ──

        This read `offsetHeight`, which is the height AFTER the `max-height`
        this function had already applied — so the input to the decision was
        the output of the last one. A chip near the bottom of the drawer got
        40px of room, the panel was capped to 40px, and the next pass then saw
        a 40px panel that "fits" below. It settled at 41px tall, showing the
        top of one tick and nothing else, and flipped side on repeated opens
        as the two passes disagreed.

        `scrollHeight` is the content height regardless of the cap, so it is
        the one measurement this cannot feed back into. With it, a panel that
        genuinely does not fit below flips above and stays there.
      */
      const need = box.current?.scrollHeight ?? 0;
      const above = need > roomBelow && roomAbove > roomBelow;

      const room = above ? roomAbove : roomBelow;
      const height = Math.min(need || room, room);

      /* Then clamp the top edge, so the box is inside the usable area
         whichever side it took. Sizing and placing separately is what let a
         panel be positioned legally and still hang off the bottom. */
      const wanted = above ? r.top - GAP - height : r.bottom + GAP;
      const top = Math.max(EDGE, Math.min(wanted, vh - EDGE - height));

      setAt({
        above,
        top,
        left: Math.max(EDGE, Math.min(r.left, vw - w - EDGE)),
        maxHeight: room,
      });
    };

    place();
    // Capture phase: the drawer scrolls, not the window, and a bubbling
    // listener on window never sees it.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);

    /*
      And when the PANEL grows.

      Placement was computed once from the height the panel happened to have,
      so opening "More" — which adds a note field and a standing control —
      pushed the bottom of an already-tight panel off the screen. Nothing was
      listening for that: the window had not resized and nothing had scrolled.

      A `ResizeObserver` on the box is the honest trigger, because the thing
      that changed is the box.
    */
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null;
    if (ro && box.current) ro.observe(box.current);

    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      ro?.disconnect();
    };
    /*
      `host` is a dependency, and that is the whole fix.

      The portal only renders once `host` is set, in a separate effect, so on
      the first pass `box.current` was still null: `scrollHeight` measured 0,
      the panel "fitted" below, it was capped to the 40px that were there, and
      `ro.observe(box.current)` attached to nothing. Nothing ever measured it
      again — which is why a chip near the bottom of the drawer opened a 41px
      sliver showing the top of one tick, and why it never flipped above.
    */
  }, [anchor, onClose, host]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      // The anchor is excluded so its own click can toggle rather than
      // close-then-reopen.
      if (box.current?.contains(t) || anchor?.contains(t)) return;

      /*
        A click dismisses ONE layer — but only a layer ABOVE this one.

        With a dialog open over this panel, a tap on its scrim reached both:
        the dialog closed itself and this closed too, so a single gesture swept
        away the sheet AND the controls that opened it, and getting back meant
        finding the chip again. Anything inside a dialog stacked on top belongs
        to that dialog; this panel stays open and takes the NEXT click.

        The first version of that rule said "inside any `.modal-wrap`", and the
        modal the ANCHOR lives in is a `.modal-wrap` too — so in the recipe
        modal, where the chips are, every click outside the panel was treated as
        belonging to a layer above it. Clicking the empty space beside the chips
        did nothing, and the panel could only be dismissed by tapping its own
        chip again or leaving the recipe. Nothing that reads as "outside" closed
        it, which is the one thing a popover has to get right.

        So the test is which modal: a click inside the anchor's OWN modal is
        outside this panel and closes it. Only a different one — necessarily
        opened later, hence on top — is spared.
      */
      const layer = t instanceof Element ? t.closest(".modal-wrap") : null;
      if (layer && !layer.contains(anchor)) return;

      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [anchor, onClose]);

  if (!host) return null;

  return createPortal(
    <div ref={box} className="popover" role="dialog" aria-label={label}
         style={at
           ? { top: at.top, left: at.left, maxHeight: at.maxHeight }
           /* Rendered off screen for the measuring pass — never flashed in the
              wrong position. */
           : { top: -9999, left: -9999, visibility: "hidden" }}>
      {children}
    </div>,
    host,
  );
}
