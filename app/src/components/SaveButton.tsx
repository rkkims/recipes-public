"use client";

/**
 * Save — DECISIONS §5's first of two buttons.
 *
 * "Save" and "I'll cook it" mean the same thing to a user and are merged, and
 * RECIPE-SPEC §10 settles the rest: a save is just a save, with no `planned`
 * split, because separating bookmark from intent is a guess about a behaviour
 * nobody has exhibited yet.
 *
 * Optimistic, because a heart that waits for a round trip feels broken. Honest
 * about failure for the same reason CookButton is: the write is the whole point.
 *
 * ── Two shapes, one behaviour ──────────────────────────────────────────────
 *
 * `heart` renders it as a mark over the photo, which is where saving lives on a
 * card: the grid is scanned rather than read, and a word-button competing with
 * the title for a 200px column costs more than it earns. Everywhere there is
 * room to read — the modal, a recipe's own page — it stays a labelled button,
 * because an unlabelled heart beside Plan and Made it would be the odd one out.
 */
import { useState, useTransition } from "react";
import { Button } from "./primitives";
import type { ActionResult } from "@/lib/result";

export function SaveButton({ recipeId, saved, heart, onSave }: {
  recipeId: string; saved: boolean;
  /** Render as a mark over the photo rather than a labelled button. */
  heart?: boolean;
  onSave: (id: string) => Promise<ActionResult>;
}) {
  const [pending, start] = useTransition();
  const [on, setOn] = useState(saved);
  const [failed, setFailed] = useState<string | null>(null);

  const toggle = () => {
    const next = !on;
    setOn(next);
    start(async () => {
      try {
        const r = await onSave(recipeId);
        if (r.ok) setFailed(null);
        else { setOn(!next); setFailed(r.error); }   // put the UI back
      } catch (e) {
        setOn(!next);
        setFailed(e instanceof Error ? e.message : "Could not reach the server.");
      }
    });
  };

  if (heart) {
    return (
      <button type="button" className={on ? "card-save on" : "card-save"}
              aria-pressed={on} title={on ? "Saved" : "Save"}
              aria-label={on ? "Saved. Tap to unsave" : "Save this recipe"}
              onClick={toggle}>
        {/* Filled when saved, outlined when not — the state IS the fill, so it
            survives greyscale and needs no second colour. */}
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"
             fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2}
             strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 0 0 0-7.1z" />
        </svg>
      </button>
    );
  }

  return (
    <>
      <Button kind={on ? "primary" : "plain"} disabled={pending} onClick={toggle}>
        {on ? "Saved ♥" : "Save it"}
      </Button>
      {failed && <span className="fail"> · not saved: {failed}</span>}
    </>
  );
}
