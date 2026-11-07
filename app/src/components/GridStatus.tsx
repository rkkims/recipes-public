"use client";

/**
 * "The grid is catching up" — one place that knows, one place that says so.
 *
 * ── The shape this enforces ───────────────────────────────────────────────
 *
 * Three rules, and every control that changes pantry state now obeys them:
 *
 *   1. **The control changes appearance immediately.** Its own state is client
 *      state, applied on the tap, never waiting on anything.
 *   2. **The write goes out detached.** Nothing awaits it; the store is updated
 *      before the action returns, so nothing can be lost.
 *   3. **The server-rendered pages catch up in the BACKGROUND**, and say they
 *      are doing it.
 *
 * Rule 3 is what this file is. `router.refresh()` re-renders every server
 * component on the page — the shelves, the counts, the recipe grid — and that is
 * genuinely expensive. Run in a transition it stops being urgent: React keeps
 * the current screen live and interactive while the new one is prepared, and
 * `isPending` is true for exactly that window.
 *
 * ── Why it waits for the surface to close ────────────────────────────────
 *
 * Not per tap, and not on a timer. Someone opens the pantry to correct four
 * things; the recipe grid behind it is not the thing they are looking at, and
 * re-rendering it between their taps spends the whole interaction's budget on a
 * screen nobody is reading. So writes only set a flag, and the catch-up happens
 * when the drawer or the modal closes — the moment the grid becomes the thing
 * on screen again.
 *
 * Closing is never held for it. The close is ordinary state in the component
 * that owns it and happens on the same frame; this starts afterwards.
 *
 * ── Why a spinner rather than nothing ─────────────────────────────────────
 *
 * Without it, a grid that changes half a second after you touched something
 * unrelated reads as a glitch. With it, the delay is a thing the product is
 * visibly doing, which is the difference between "slow" and "working".
 */
import { createContext, useCallback, useContext, useEffect, useRef,
         useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

type Status = {
  /** Something was written. Does NOT re-render anything. */
  markDirty: () => void;
  /** The surface that was being used has closed: catch up now, in the background. */
  flush: () => void;
  /** True from the moment a catch-up starts until the new render has landed. */
  refreshing: boolean;
};

const Ctx = createContext<Status>({ markDirty: () => {}, flush: () => {}, refreshing: false });

export const useGrid = () => useContext(Ctx);

export function GridStatusProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  /**
   * Whether anything has been written since the last catch-up.
   *
   * A ref, not state, and that is the point: marking something dirty must not
   * re-render a provider that wraps the whole app. Writing to a ref is free.
   */
  const dirty = useRef(false);
  const markDirty = useCallback(() => { dirty.current = true; }, []);

  /**
   * Catch up, and never make anyone wait for it.
   *
   * Called when the surface being used closes — the pantry drawer, the recipe
   * modal. The close itself is not held: it is ordinary state in the component
   * that owns it and happens on the same frame. This starts a transition
   * afterwards, which React runs in the background while keeping the current
   * screen live, and `refreshing` is true for exactly that window.
   */
  const flush = useCallback(() => {
    if (!dirty.current) return;
    dirty.current = false;
    start(() => router.refresh());
  }, [router]);

  return (
    <Ctx.Provider value={{ markDirty, flush, refreshing: pending }}>
      {children}
    </Ctx.Provider>
  );
}
/**
 * The circle itself, wherever something is waiting on the server.
 *
 * Rendered by the surfaces that are actually stale — the grid, the shelf counts
 * — rather than as one global bar, because "this part is catching up" is more
 * useful than "something somewhere is".
 */
export function GridSpinner({ label = "Updating" }: { label?: string }) {
  const { refreshing } = useGrid();
  if (!refreshing) return null;
  return (
    <span className="gridspin" role="status" aria-live="polite">
      <span className="gridspin-dot" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
