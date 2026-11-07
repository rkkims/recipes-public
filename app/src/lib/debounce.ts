"use client";

/**
 * Debounced search, with out-of-order results dropped.
 *
 * The add box fired a server action on EVERY keystroke: typing "gochujang" was
 * nine round trips, and because they were nine independent promises the list
 * could settle on whichever came back last rather than whichever was typed
 * last. On a slow connection that means the suggestions under your cursor
 * belong to a prefix you have already finished typing.
 *
 * UX-SPEC §1 puts typing in the fallback position — "typing is the fallback,
 * never the primary path" — but the fallback still has to feel instant, because
 * it is the path everyone takes for anything the starter list did not cover.
 *
 * Two guarantees:
 *
 *   - one request per pause, not one per character
 *   - a stale response is discarded rather than rendered, so what you see always
 *     corresponds to what is in the box
 */
import { useCallback, useEffect, useRef, useState } from "react";

export function useSearch<T>(
  search: (q: string) => Promise<T[]>,
  /** Long enough to skip the middle of a word, short enough not to feel laggy. */
  delay = 180,
  /**
   * What the box starts with — the term already being searched, so it can be
   * edited rather than retyped. It seeds the STATE, not a request: whether the
   * suggestions are showing is the caller's business, and the recipe box keeps
   * them shut until something is typed (see `FindRecipe`).
   */
  initial = "",
): { q: string; setQ: (v: string) => void; hits: T[]; clear: () => void; pending: boolean } {
  const [q, setQ] = useState(initial);
  const [hits, setHits] = useState<T[]>([]);
  const [pending, setPending] = useState(false);
  /** Monotonic, so a response that is not the newest can be recognised as stale. */
  const seq = useRef(0);

  useEffect(() => {
    if (!q.trim()) { setHits([]); setPending(false); return; }
    const mine = ++seq.current;
    setPending(true);
    const t = setTimeout(() => {
      search(q)
        .then((r) => { if (mine === seq.current) { setHits(r); setPending(false); } })
        // Typing is not the moment to shout: an empty list reads the same as a
        // failed one, and the form's own submit path is where a failure is
        // reported.
        .catch(() => { if (mine === seq.current) setPending(false); });
    }, delay);
    return () => clearTimeout(t);
  }, [q, delay, search]);

  /**
   * STABLE, and a no-op when already clear — this function sits in effect
   * dependency arrays (`SuggestInput`). The unstable arrow it replaces
   * looped the whole curation form: new `clear` ref → effect re-runs →
   * `setHits([])` is a fresh array → re-render → new `clear` ref — until
   * React's update-depth cap killed the tree, which surfaced as "drop is
   * not saved" (curator, 2026-08-21). Functional updates bail out when
   * nothing actually changes, so the chain has no fuel.
   */
  const clear = useCallback(() => {
    seq.current++;
    setQ((v) => (v ? "" : v));
    setHits((h) => (h.length ? [] : h));
    setPending((p) => (p ? false : p));
  }, []);

  return { q, setQ, hits, pending, clear };
}
