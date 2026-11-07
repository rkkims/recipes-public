"use client";

/**
 * The two things every converted surface waits for: this kitchen, and the
 * vocabulary to describe it.
 *
 * Both live on the device now (STATIC-SPEC §2), and both are read in a MOUNT
 * EFFECT rather than during render. That is not a style preference — the
 * server has no `localStorage` and no bundle, so a render that read either
 * would produce markup the hydration cannot match, and `layout.tsx` removed
 * `suppressHydrationWarning` deliberately. `Shell.tsx` reads its pantry mode
 * the same way and for the same reason.
 *
 * So the first paint is honest about what it knows: `ready` false, and the
 * surface draws its skeleton. One frame later the store answers.
 */

import { useEffect, useState } from "react";
import { current, subscribe } from "./client-store";
import { seedFromServer } from "./dual-write";
import type { Owner } from "./owner-core";
import { load, type ClientData } from "./client-data";

/**
 * This device's owner, and every change to it — including changes made in
 * ANOTHER TAB, which is what `subscribe`'s storage listener is for.
 *
 * Seeding happens first and exactly once (`seedFromServer`), because a
 * returning visitor's pantry is in `owners.json` and asking them to retype it
 * is not a migration anyone would forgive. A visitor the server has never
 * heard of simply starts empty, which is what first run is for.
 */
export function useOwner(): { owner: Owner | null; ready: boolean } {
  const [state, setState] = useState<{ owner: Owner | null; ready: boolean }>(
    { owner: null, ready: false });

  useEffect(() => {
    let live = true;
    let unsubscribe = () => {};
    const read = () => { if (live) setState({ owner: current(), ready: true }); };
    void (async () => {
      try {
        await seedFromServer();
      } catch (e) {
        /* A seed that could not reach the server is a visitor who sees an
           empty kitchen for this visit — bad, and survivable, and it must not
           stop the grid from rendering at all. The next load tries again:
           nothing was written, so `hasStored` is still false. */
        console.warn("[seed] could not read the server's copy:", e);
      }
      if (!live) return;
      read();
      unsubscribe = subscribe(read);
    })();
    return () => { live = false; unsubscribe(); };
  }, []);

  return state;
}

/** The shipped corpus and vocabulary. Cached by `client-data` for the page's life. */
export function useBundle(): ClientData | null {
  const [data, setData] = useState<ClientData | null>(null);
  useEffect(() => {
    let live = true;
    void load()
      .then((d) => { if (live) setData(d); })
      .catch((e) => console.warn("[bundle] could not load the shelf:", e));
    return () => { live = false; };
  }, []);
  return data;
}

/**
 * The seed that fixes this visit's shuffle, and the moment the visit began.
 *
 * ── The invariant this exists to keep ─────────────────────────────────────
 *
 * The shelves are ranked, and a ranking over a corpus that did not change
 * overnight opens on the same cards every time. Reshuffling per render fixes
 * that and breaks something worse: opening a recipe re-renders the page it was
 * opened from, so the grid would reorder under the modal and paging would lose
 * your place. The mint TIME rides inside the seed for the same reason —
 * Explore ignores seen-marks made after it (`explore.arrivedAt`), so clicking
 * a card cannot remove it from the pool it was clicked out of.
 *
 * On the server that seed came from the address, minted per request when
 * absent. On the device the address still wins — a shared or paged URL must
 * open the order it names — and when there is none, the seed is minted ONCE
 * PER VISIT into `sessionStorage`. That is the closest true reading of "a
 * fresh arrival reshuffles" now that arrivals are no longer requests: a new
 * tab is a new visit; a reload inside one is the same visit holding still.
 */
const VISIT_KEY = "jipbap-visit-seed";

export function useVisitSeed(fromUrl: string | undefined): string | null {
  const [seed, setSeed] = useState<string | null>(fromUrl ?? null);
  useEffect(() => {
    if (fromUrl) { setSeed(fromUrl); return; }
    let mine: string | null = null;
    try { mine = sessionStorage.getItem(VISIT_KEY); } catch { /* private mode */ }
    if (!mine) {
      mine = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
      try { sessionStorage.setItem(VISIT_KEY, mine); } catch { /* held in state only */ }
    }
    setSeed(mine);
  }, [fromUrl]);
  return seed;
}

/**
 * When this visit began, read back out of the seed — `page.tsx`'s rule, kept
 * to the letter.
 *
 * A seed that does not carry a plausible timestamp (hand-edited, or from a
 * link someone shared last week) falls back to now rather than to a moment in
 * the past that would filter this visit's own opens out of Explore.
 */
export function arrivalFrom(seed: string | null): number {
  const t = parseInt((seed ?? "").split(".")[0] ?? "", 36);
  return Number.isFinite(t) && t > 1.5e12 && t < Date.now() + 6e4 ? t : Date.now();
}
