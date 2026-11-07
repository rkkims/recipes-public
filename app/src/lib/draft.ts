"use client";

/**
 * Half-typed work, kept for a few minutes across an accidental close.
 *
 * ── What is and is not at risk ─────────────────────────────────────────────
 *
 * The pantry itself is not. Every tap writes through to the store immediately
 * and the owner cookie lasts a year, so closing the window loses nothing that
 * has been committed — a "five minute memory" would be a downgrade on what the
 * cookie already gives.
 *
 * What genuinely dies with the tab is text that has been TYPED but not yet
 * committed: a recipe half-entered into the add form, a block of ingredients
 * pasted and not yet reviewed, a note written and not yet blurred. That work is
 * the expensive kind — minutes of it — and it is held nowhere but in React
 * state.
 *
 * So this is a draft buffer, not a session store.
 *
 * ── Five minutes, and why it expires at all ───────────────────────────────
 *
 * Long enough to survive a mis-tapped close, a crashed tab, or following a link
 * and coming back. Short enough that a form does not silently repopulate itself
 * a day later with something the user abandoned on purpose — restoring stale
 * text is its own kind of bug, and it is the one people find alarming.
 *
 * `sessionStorage`, so it is scoped to the tab and never syncs to another
 * window where the user is doing something else.
 */
import { useEffect, useRef, useState } from "react";

const TTL_MS = 5 * 60 * 1000;
const PREFIX = "draft:";

type Held<T> = { at: number; value: T };

/**
 * State that survives a close for `TTL_MS`.
 *
 * Behaves as `useState` otherwise. The stored copy is written on a short delay
 * so that typing does not hit storage on every keystroke.
 */
export function useDraft<T>(key: string, initial: T): [T, (v: T) => void, () => void] {
  const [value, setValue] = useState<T>(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);

  // Restored after mount: `sessionStorage` does not exist on the server, and
  // reading during render would make the markup disagree on hydration.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PREFIX + key);
      if (raw) {
        const held = JSON.parse(raw) as Held<T>;
        if (Date.now() - held.at < TTL_MS) setValue(held.value);
        else sessionStorage.removeItem(PREFIX + key);
      }
    } catch { /* private browsing, or a shape we no longer understand */ }
    loaded.current = true;
  }, [key]);

  const set = (v: T) => {
    setValue(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        sessionStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), value: v }));
      } catch { /* quota or private mode; the draft is a courtesy, not a promise */ }
    }, 400);
  };

  /** Committed or abandoned — either way the draft has served its purpose. */
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    setValue(initial);
    try { sessionStorage.removeItem(PREFIX + key); } catch { /* nothing to do */ }
  };

  return [value, set, clear];
}
