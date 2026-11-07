"use client";

/**
 * The one destructive control a creator has, so the one that asks first.
 *
 * Hiding is a toggle and withdrawal is a toggle; removing an own-added recipe
 * actually discards the ingredient annotation they built chip by chip. The
 * link restores nothing — re-adding means redoing the chips — so a stray tap
 * must not be enough.
 */
import { useTransition } from "react";

export function RemoveRecipeButton({ onRemove }: { onRemove: () => Promise<void> }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="linklike" disabled={pending}
            onClick={() => {
              if (confirm("Remove this recipe from your page? Your ingredient list goes with it."))
                start(() => onRemove());
            }}>
      Remove from your page
    </button>
  );
}
