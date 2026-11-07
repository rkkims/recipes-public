"use client";

/**
 * Every question this product asks, in one shell.
 *
 * ── Why it is portalled ────────────────────────────────────────────────────
 *
 * A dialog rendered inside the pantry drawer was trapped in it. Two separate
 * causes, both in `.drawer`:
 *
 *   - at ≤860px it is `position: fixed; z-index: 40`, which creates a STACKING
 *     CONTEXT — anything inside paints within the drawer's layer regardless of
 *     its own z-index;
 *   - its closed state sets `transform: translateX(-102%)`, and a transform
 *     creates a CONTAINING BLOCK — so `position: fixed` resolves against the
 *     drawer rather than the viewport.
 *
 * No z-index can win either of those from the inside. Portalling to `body`
 * leaves both behind, and it is the only fix that keeps working when someone
 * later adds a `filter` or a `will-change` somewhere up the tree.
 *
 * ── The shell, not the content ─────────────────────────────────────────────
 *
 * Scrim, escape, scroll lock and focus live here so that every question behaves
 * the same way. What differs between a clarification and a delete confirmation
 * is the words, not the mechanics.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "./primitives";

export function Dialog({ label, onClose, children }: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  /**
   * `onClose` is an inline arrow at nearly every call site, so its identity
   * changes whenever the parent re-renders — which, for a dialog holding a
   * form, is every keystroke. The focus effect below must not re-run on that:
   * its re-run calls `box.current?.focus()`, which steals the caret out of
   * whatever input the user is typing in. Held in a ref so the effect can
   * depend on `host` alone.
   */
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });

  // `document` does not exist while this renders on the server.
  useEffect(() => { setHost(document.body); }, []);

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
  const downOutside = useRef(false);
  const onPointerDown = (e: React.PointerEvent) => {
    downOutside.current = !box.current?.contains(e.target as Node);
  };
  /*
    Closing happens on CLICK, not on pointerup — and that is the whole of
    "other buttons should not be clickable" (Richard, 2026-08-18).

    A touch fires pointerup and then, a moment later, a compatibility click.
    Closing on the pointerup meant the wrapper was already gone by the time that
    click arrived, so it landed on whatever the sheet had been covering: one
    tap, two effects, the second one invisible in the code that caused it.
    `preventDefault` on the pointerup does not reliably suppress it either,
    because the click is generated from the touch sequence rather than from the
    pointer event.

    On click the wrapper is still mounted and still `inset: 0`, so it receives
    that click itself and nothing reaches the page. The pointerdown guard below
    is unchanged: both ends of the gesture must be outside the sheet, so
    selecting text inside it and releasing outside still does not dismiss.
  */
  const onPointerUp = (e: React.PointerEvent) => {
    if (downOutside.current && !box.current?.contains(e.target as Node)) {
      e.preventDefault();
      /* Remembered, and acted on in `onClick` below. */
      closeOnClick.current = true;
    }
    downOutside.current = false;
  };

  const closeOnClick = useRef(false);
  const onClick = (e: React.MouseEvent) => {
    if (!closeOnClick.current) return;
    closeOnClick.current = false;
    if (box.current?.contains(e.target as Node)) return;
    e.preventDefault();
    e.stopPropagation();
    onClose();
  };

  useEffect(() => {
    if (!host) return;
    opener.current = document.activeElement;
    /*
      `preventScroll`, and it is the whole of Richard's "closing the add-recipe
      modal jumps to the first card" (2026-08-18, on a phone).

      Focusing an element scrolls it into view by default. The sheet is inside a
      `position: fixed` wrapper, so there is nothing to scroll it into — but the
      browser measures against the document anyway and lands the page at the
      top. It happens on OPEN; the jump is only noticed on close, when the page
      behind is uncovered somewhere the reader never was.

      Focus still moves, which is the part that matters for a keyboard and a
      screen reader. Only the scrolling is refused.
    */
    box.current?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close.current(); return; }
      if (e.key !== "Tab") return;
      // `aria-modal` promises the rest of the page is inert. Keep the promise.
      const els = [...(box.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ) ?? [])].filter((el) => el.offsetParent !== null);
      const first = els[0], last = els[els.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener("keydown", onKey);
    const prior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prior;
      // Back to whatever opened it, so answering a question does not lose your place.
      // Same reason as above: coming back must not move the page either.
      if (opener.current instanceof HTMLElement)
        opener.current.focus({ preventScroll: true });
    };
  }, [host]);

  if (!host) return null;

  return createPortal(
    <div className="modal-wrap modal-wrap-dlg" role="dialog" aria-modal="true" aria-label={label}
         onPointerDown={onPointerDown} onPointerUp={onPointerUp} onClick={onClick}>
      <div className="modal-scrim" aria-hidden="true" />
      <div className="askbox" ref={box} tabIndex={-1}>{children}</div>
    </div>,
    host,
  );
}

export type Confirmation = {
  question: string;
  /** The consequence, when there is one worth stating before the tap. */
  detail?: ReactNode;
  confirmLabel: string;
  /*
   * No `destructive` flag. It existed to draw the commit button down a level,
   * and the button scheme now spends fill on consequence rather than on
   * danger — an irreversible action is the MOST consequential thing here, so
   * drawing it quieter than a save was backwards. What cannot be taken back is
   * said in `detail`, in words, which is where a warning belongs.
   */
};

/**
 * Ask before doing — without `window.confirm`.
 *
 * The native dialog blocks the whole JS thread, cannot be styled, is announced
 * by the browser rather than by us, and on some mobile browsers offers to
 * suppress every future dialog on the site — which would silently disable
 * confirmations the user has not seen yet.
 *
 * Returns the asker and the element to render. Call sites stay one line:
 *
 *     const { confirm, dialog } = useConfirm();
 *     onClick={() => confirm({ question: "Remove it?", confirmLabel: "Remove" }, doIt)}
 *     ...
 *     {dialog}
 */
export function useConfirm() {
  const [pending, setPending] =
    useState<{ c: Confirmation; go: () => void } | null>(null);

  const dialog = pending ? (
    <Dialog label={pending.c.question} onClose={() => setPending(null)}>
      <h2 className="ask-question">{pending.c.question}</h2>
      {pending.c.detail && <p className="note ask-because">{pending.c.detail}</p>}
      {/* Filled commits, outlined declines — see `.btn` in globals.css. The
          destructive branch used to draw "Delete it" outlined and leave the
          fill unspent, which under that rule says the button does nothing.
          Irreversibility is stated in the words above it, not by dressing the
          commit down. */}
      <div className="ask-actions ask-actions-split">
        <Button kind="primary" onClick={() => { pending.go(); setPending(null); }}>
          {pending.c.confirmLabel}
        </Button>
        <Button kind="quiet" onClick={() => setPending(null)}>Cancel</Button>
      </div>
    </Dialog>
  ) : null;

  return {
    confirm: (c: Confirmation, go: () => void) => setPending({ c, go }),
    dialog,
  };
}
