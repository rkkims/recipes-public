"use client";

/**
 * "Add all 5 to the grocery list" — the tap that stops the list being hand-maintained.
 *
 * This is the product's first real advantage over a notes app, and it was five
 * taps through five state widgets. A note app makes you work out what to write
 * down; we already know, and until this button existed we made the user
 * transcribe our own answer back to us one chip at a time.
 *
 * ── Why it writes immediately, rather than filling the §4b basket ─────────
 *
 * §4b says nothing the app SUGGESTS reaches the list unreviewed, and the review
 * exists because a suggestion is our idea arriving in the user's list. This is
 * not that. The set is already on screen — it is the "You need" chips, directly
 * above the button — the button names its own size, and the user pressed it
 * about a recipe they are looking at. Reviewing a list you are pointing at is
 * the second confirmation §4b explicitly refuses to ask for on a direct toggle.
 *
 * Undo is what makes that safe (§4d), and it is one write either way.
 *
 * Already-listed ingredients are included in the count only if they are not on
 * the list yet — otherwise the number would promise work the tap does not do.
 */
import { useState, useTransition } from "react";
import { Button } from "./primitives";
import { useAck } from "./Ack";
import { addToGroceryList, updateState } from "@/app/actions";
import * as live from "@/lib/dual-write";

export function AddMissing({ items, live: onDevice = false }: {
  /** The missing requirements, with whether each is already on the list. */
  items: Array<{ id: string; name: string; onList: boolean }>;
  /**
   * The page behind this modal reads its shelves from the device — see
   * `RecipeIngredients.live`. The dual-write pair writes both copies, so the
   * grid underneath moves and `/list` stays true; without it, five things
   * would land on a grocery list the drawer over this page cannot see.
   */
  live?: boolean;
}) {
  const add1 = onDevice ? live.addToGroceryList : addToGroceryList;
  const put = onDevice ? live.updateState : updateState;
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  const { say } = useAck();

  const toAdd = items.filter((i) => !i.onList);
  if (toAdd.length === 0) return null;

  const add = () =>
    start(async () => {
      try {
        const r = await add1(toAdd.map((i) => i.id));
        if (!r.ok) { setFailed(r.error); return; }
        setFailed(null);
        say(
          toAdd.length === 1
            ? `${toAdd[0]!.name} → grocery list`
            : `${toAdd.length} added to your list`,
          /* Undo puts each row back exactly as it was: off the list, and
             otherwise untouched. `updateState` is the same path a single chip
             uses, so undo cannot drift from what the add did. */
          () => { for (const i of toAdd) {
            void put(i.id, { in_pantry: false, on_list: false, use_first: false });
          } },
        );
      } catch (e) {
        setFailed(e instanceof Error ? e.message : "Could not reach the server.");
      }
    });

  return (
    <p className="cook-line addmissing">
      <Button kind="plain" disabled={pending} onClick={add}>
        {pending
          ? "Adding…"
          : toAdd.length === 1
            ? `Add ${toAdd[0]!.name} to the grocery list`
            : `Add all ${toAdd.length} to the grocery list`}
      </Button>
      {failed && <span className="fail"> · not saved: {failed}</span>}
    </p>
  );
}
