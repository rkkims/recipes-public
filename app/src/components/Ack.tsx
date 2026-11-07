"use client";

/**
 * "scallion → pantry · undo" — UX-SPEC §4d.
 *
 * Every write in this product goes straight through; there is no Save button
 * anywhere. That is right, and it leaves a tap with no evidence of itself — on a
 * phone the chip that changed is under the thumb that changed it, so the one
 * piece of feedback the interface did offer was hidden by the hand.
 *
 * ── It reports, it does not ask ────────────────────────────────────────────
 *
 * A blocking dialog on every tap was considered and rejected: §1 is the
 * constraint this product is built on — *"adding an ingredient must never feel
 * like data entry"* — and §4b deliberately exempts direct toggles from
 * confirmation, because asking twice about a direct manipulation is asking
 * twice. Acknowledgement is a different act from confirmation. This one names
 * what happened and gets out of the way.
 *
 * **Undo is what makes an unasked write safe.** It is also cheaper than a
 * dialog: a confirmation taxes every tap to catch the rare wrong one, while undo
 * costs nothing in the overwhelming case where the tap was right.
 *
 * `role="status"` rather than `alert`: this is polite by definition. An
 * assertive live region would interrupt a screen-reader user mid-sentence to
 * tell them the thing they just did happened.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState,
         type ReactNode } from "react";

type Ack = {
  /** Distinguishes consecutive identical messages, so the timer restarts. */
  key: number;
  /**
   * A node, not a string — Richard's call, 2026-08-18.
   *
   * "tofu → grocery list" names a place, and a named place the user cannot go
   * to is a signpost with no road under it. Callers that want the destination
   * to be reachable pass a fragment with a link in it (`.ack-dest`); the rest
   * pass a string and nothing about them changes.
   */
  text: ReactNode;
  undo?: (() => void) | undefined;
};

const Ctx = createContext<{ say: (text: ReactNode, undo?: () => void) => void }>({
  say: () => {},
});

/** How long it sits there. Long enough to read and reach, short enough to ignore. */
const LINGER = 5000;

export function AckProvider({ children }: { children: ReactNode }) {
  const [ack, setAck] = useState<Ack | null>(null);
  const seq = useRef(0);

  const say = useCallback((text: ReactNode, undo?: () => void) => {
    seq.current += 1;
    setAck({ key: seq.current, text, undo });
  }, []);

  /**
   * One at a time, newest wins.
   *
   * A queue would be wrong here: these arrive fastest when someone is ticking
   * through a list, and a backlog would still be announcing the third item while
   * they are on the ninth — an undo pointing at something they have forgotten
   * doing is worse than no undo.
   */
  useEffect(() => {
    if (!ack) return;
    const t = setTimeout(() => setAck((cur) => (cur?.key === ack.key ? null : cur)), LINGER);
    return () => clearTimeout(t);
  }, [ack]);

  return (
    <Ctx.Provider value={{ say }}>
      {children}
      {/* Always present so assistive tech has a region to watch; empty until
          there is something to say. */}
      <div className="ack-wrap" role="status" aria-live="polite">
        {ack && (
          <div className="ack" key={ack.key}>
            <span className="ack-text">{ack.text}</span>
            {ack.undo && (
              <button type="button" className="ack-undo"
                      onClick={() => { ack.undo?.(); setAck(null); }}>
                undo
              </button>
            )}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export const useAck = () => useContext(Ctx);

/**
 * What to call what just happened.
 *
 * Written as the movement rather than the field — "→ pantry", not
 * "in_pantry: true". The user is looking at an ingredient and thinking about
 * where it now lives, and the arrow is the shortest thing that says it.
 *
 * Returns null when nothing meaningful changed, so a no-op tap stays silent.
 */
export function ackFor(
  name: string,
  prev: { in_pantry: boolean; on_list: boolean; use_first: boolean },
  next: { in_pantry: boolean; on_list: boolean; use_first: boolean },
): string | null {
  /* Bought-and-unpacked is one movement, not two, and it is the commonest
     multi-flag change there is — the tick in the aisle (§4d). Named first so it
     never reads as "off the grocery list" plus an unrelated "→ pantry". */
  if (!prev.in_pantry && next.in_pantry && prev.on_list && !next.on_list) {
    return `${name} → pantry, off the grocery list`;
  }
  if (prev.in_pantry !== next.in_pantry) {
    return next.in_pantry ? `${name} → pantry` : `${name} removed from pantry`;
  }
  if (prev.on_list !== next.on_list) {
    return next.on_list ? `${name} → grocery list` : `${name} off the grocery list`;
  }
  if (prev.use_first !== next.use_first) {
    return next.use_first ? `${name} → use first` : `${name} no longer use first`;
  }
  return null;
}
