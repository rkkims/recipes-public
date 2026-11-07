"use client";

/**
 * The recipe modal's three ingredient shelves — "You have", "You need", "Optional".
 *
 * ── Why this exists at all ────────────────────────────────────────────────
 *
 * The split used to be computed on the server, in `RecipeDetail`, from the
 * pantry as it was when the modal was rendered. The chips were already
 * tappable, and tapping one already turned it green — but green in the wrong
 * section. You would open a dish, notice the pantry was wrong about soy sauce,
 * tick "Have it", and be left looking at a green chip sitting under a heading
 * that said **You need 3**, with the count still reading 3.
 *
 * That is the modal contradicting itself at the exact moment the user has
 * corrected it, on the screen whose entire job is answering "can I cook this
 * tonight". The answer changed and the screen did not.
 *
 * So the partition moved here, to the client, where it is recomputed from the
 * same optimistic map the chips already colour themselves from. Ticking the
 * last missing thing empties "You need", the section disappears, and the modal
 * says what the grid behind it will say as soon as it catches up.
 *
 * ── It re-sorts on the tap, and the panel gets out of the way ─────────────
 *
 * The first attempt deferred the re-sort until the state panel closed, to avoid
 * unmounting the chip the panel is anchored to. That was wrong twice over.
 *
 * It did not happen. At the time, `Popover` ignored every click that landed
 * inside a `.modal-wrap` — including the modal the chips themselves live in —
 * so the panel had no ordinary way to close and a re-sort gated on it was a
 * re-sort that never ran. Measured, with the server action blocked: nothing
 * moved, ever. (`Popover` has since been fixed to close on a click in its own
 * modal, but the reasoning below is why this does not depend on that.)
 *
 * And it should not happen. The user tapped "Have it" to correct a claim this
 * screen is making; the screen should stop making it immediately, not once they
 * have found their way out of a panel. So the section changes with the colour,
 * and `IngredientChips` closes a panel whose chip has moved out from under it —
 * which is the honest thing for it to do, since the control it was editing is
 * no longer where it is pointing.
 *
 * ── What the server still decides ─────────────────────────────────────────
 *
 * `have` on a row is the SERVER's answer, and it is not a plain lookup — a
 * requirement can be covered by something broader or narrower than the recipe
 * named (INGREDIENT-SPEC §3a), which is also why a chip carries a `targetId`
 * that may differ from its own. So an untouched row keeps the server's verdict;
 * only a row the user has actually edited is judged from `in_pantry` here.
 */
import { useState } from "react";
import { IngredientChips, type ChipItem } from "./IngredientChips";
import type { IngredientState } from "./StateWidget";
import type { DetailIngredient } from "./RecipeDetail";
import type { ActionResult } from "@/lib/result";
import { AddMissing } from "./AddMissing";
/* The device's copy of the one chip write — used only when the page behind
   this modal reads its shelves from the device. See `live`. */
import { updateState as liveUpdateState } from "@/lib/dual-write";

const NO_STATE: IngredientState = { in_pantry: false, on_list: false, use_first: false };

const targetOf = (i: DetailIngredient) => i.targetId ?? i.id;

const asChip = (i: DetailIngredient, tone: ChipItem["tone"],
                edits: Record<string, IngredientState>): ChipItem => ({
  id: i.id, name: i.name, tone,
  targetId: targetOf(i),
  targetName: i.targetName ?? i.name,
  state: edits[targetOf(i)] ?? i.state ?? NO_STATE,
});

export function RecipeIngredients({ ingredients, onUpdate, sheet, live = false }: {
  ingredients: DetailIngredient[];
  onUpdate: (id: string, next: IngredientState) => Promise<ActionResult>;
  /**
   * The page behind this modal computes its shelves from the DEVICE.
   *
   * A chip here is the same write as a chip in the drawer, and on the home
   * page the grid it changes is client-rendered (STATIC-SPEC §2, slice B) — so
   * the write has to reach `client-store` or the card underneath goes on
   * saying "2 away" about an ingredient the user has just ticked. `dual-write`
   * still calls the same server action behind it, so the surfaces that read
   * `owners.json` are unaffected.
   *
   * A prop rather than always-on: the calendar, `/my-recipes` and a recipe's
   * own page render this same component and are converted in slice C, and
   * writing a device copy from a page that does not read one yet would be a
   * side effect nobody asked for.
   */
  live?: boolean;
  /** The "…" sheet's full depth, passed straight through to the chips. */
  sheet?: {
    extras?: Record<string, { addedAt?: string; sinceAt?: string; note?: string }>;
    excludedIds?: ReadonlySet<string>;
    onNote?: (id: string, note: string) => Promise<ActionResult>;
    onExclude?: (id: string, excluded: boolean) => Promise<ActionResult>;
  };
}) {
  /** Every edit made since the modal opened — colour AND section come from it. */
  const [edits, setEdits] = useState<Record<string, IngredientState>>({});

  /* Untouched rows keep the server's verdict — see the note on §3a above. */
  const hasIt = (i: DetailIngredient) => {
    const edit = edits[targetOf(i)];
    return edit ? edit.in_pantry : i.have;
  };

  const have = ingredients.filter(hasIt);
  const need = ingredients.filter((i) => !hasIt(i) && !i.optional);
  const extras = ingredients.filter((i) => !hasIt(i) && i.optional);

  /* One map, three instances — the whole reason this component exists. */
  const wiring = {
    onUpdate: live ? liveUpdateState : onUpdate,
    states: edits,
    onApply: (targetId: string, next: IngredientState) =>
      setEdits((m) => ({ ...m, [targetId]: next })),
    ...(sheet?.extras ? { extras: sheet.extras } : {}),
    ...(sheet?.excludedIds ? { excludedIds: sheet.excludedIds } : {}),
    ...(sheet?.onNote ? { onNote: sheet.onNote } : {}),
    ...(sheet?.onExclude ? { onExclude: sheet.onExclude } : {}),
  };

  return (
    <>
      <section>
        <h3 className="modal-h3">You have <span className="count">{have.length}</span></h3>
        {have.length === 0
          ? <p className="note">Nothing in this one yet.</p>
          /* Tappable: this is where you notice the pantry is wrong, because you
             are looking at a claim about tonight rather than at a list of sixty
             chips in a drawer. */
          : <IngredientChips {...wiring} items={have.map((i) => asChip(i, "have", edits))} />}
      </section>

      {/*
        Absent, not empty, when nothing is missing — and now that is a state the
        user can reach without leaving the modal. Ticking the last chip removes
        this whole section, which is the modal saying "you can cook this" in the
        only way that does not require a sentence claiming it.
      */}
      {need.length > 0 && (
        <section>
          <h3 className="modal-h3">You need <span className="count">{need.length}</span></h3>
          <IngredientChips {...wiring} items={need.map((i) => asChip(i, "missing", edits))} />
          {/* The one tap that fills the list — see `AddMissing`. */}
          <AddMissing live={live} items={need.map((i) => ({
            id: targetOf(i), name: i.name,
            onList: !!(edits[targetOf(i)] ?? i.state)?.on_list,
          }))} />

          {/*
            No affiliate here — reverses §5's "inside the modal only".

            The links now live in ONE place, the grocery list panel, and nowhere
            else: not on the grid, not in the modal, and not at the moment
            something is added to the list from a recipe or the pantry. The
            modal is where a cook decides what to make, and a row of shopping
            links under the ingredients answers a question they have not asked
            yet. On the list they are the answer to the question the panel
            exists for.

            One surface also means one thing to reason about when a second
            affiliate arrives, instead of a rule per screen.
          */}
        </section>
      )}

      {extras.length > 0 && (
        <section>
          <h3 className="modal-h3">Optional</h3>
          <IngredientChips {...wiring} items={extras.map((i) => asChip(i, "plain", edits))} />
        </section>
      )}
    </>
  );
}
