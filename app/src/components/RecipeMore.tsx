"use client";

/**
 * The `⋯` menu on a recipe — rare things, out of the way.
 *
 * "Don't recommend this" belongs on the recipe rather than only on its card:
 * the modal is where you decide, and deciding *against* something is a decision
 * too. It does not belong beside Save and Plan, which are used constantly and
 * would make a standing instruction look like an everyday one — the same
 * reasoning that put the ingredient exclusion behind `⋯`.
 *
 * It is a standing instruction in the full sense: it does not expire, and the
 * only thing that lifts it is this button pressed again. See
 * `UserRecipe.dismissed_at`.
 */
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/result";

function Dots() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

export function RecipeMore({ recipeId, dismissed, onDismiss }: {
  recipeId: string;
  dismissed: boolean;
  onDismiss: (recipeId: string) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  // Optimistic: the state has changed on screen and the write follows.
  const [off, setOff] = useState(dismissed);
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState(false);

  const flip = () => {
    const next = !off;
    setOff(next);
    start(async () => {
      try {
        const r = await onDismiss(recipeId);
        setFailed(!r.ok);
        if (!r.ok) setOff(!next);
      } catch { setFailed(true); setOff(!next); }
    });
  };

  return (
    <div className="moremenu">
      <button type="button" className="widget-more" aria-expanded={open}
              aria-label="More for this recipe" onClick={() => setOpen((v) => !v)}>
        <Dots />
      </button>

      {open && (
        <div className="moremenu-panel" role="menu">
          {/*
            Nothing moves on the click. Same button, same place, same words —
            only the colour changes, and `aria-pressed` says it for anyone who
            cannot see colour. This is the ingredient exclusion's control
            exactly (see `StateWidget`), because it is now the same KIND of
            thing: a standing instruction, not an errand.

            Three things used to move at once: the menu closed under the
            finger, the label became "Recommend this again", and a badge
            appeared beside the ⋯. A control that vanishes at the moment it is
            pressed cannot be pressed twice by mistake, but it also cannot be
            confirmed or immediately undone, and the swapped label meant you
            had to read a sentence to find out what had just happened.
          */}
          <button type="button" className={off ? "standing-btn on" : "standing-btn"}
                  aria-pressed={off} disabled={pending} onClick={flip}>
            Don’t recommend this recipe
          </button>
          {failed && <p className="fail">Not saved.</p>}
        </div>
      )}
    </div>
  );
}
