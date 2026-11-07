"use client";

/**
 * The recipe modal's ingredient chips, made actionable — UX-SPEC §1.
 *
 * *"Add is one gesture from anywhere an ingredient name appears. Recipe
 * ingredient lists, search results, SEO pages, substitution notes."*
 *
 * They were inert text. You would open a dish you wanted, read the three things
 * you were missing, and the only actionable thing on the row was the Weee! link
 * — so the product made it easier to buy an ingredient than to put it on your
 * own grocery list. Recording what the screen was already telling you took five
 * actions: close the modal, open the drawer, type the name, pick the hit, set
 * the toggle.
 *
 * One tap now opens the same `StateWidget` the pantry opens. Same control, same
 * three flags, learned once — which is the entire argument the widget won on.
 *
 * ── Which row a tap edits ──────────────────────────────────────────────────
 *
 * Not always the one on the label. A requirement can be covered by something
 * BROADER or NARROWER than the recipe named (INGREDIENT-SPEC §3a) — the recipe
 * asks for `salt`, your pantry holds `coarse salt`. Toggling a row called
 * `salt` would write to a row you have never had and silently do nothing, while
 * the thing you meant to mark gone sat untouched.
 *
 * So a covered chip carries the id of what you ACTUALLY hold, and the widget
 * opens titled with that name. The rename in the header is not a glitch; it is
 * the disclosure doing its job at the moment you act on it.
 *
 * ── One chip, one behaviour ────────────────────────────────────────────────
 *
 * Used by the recipe modal AND by the cards in the grid, and the widget is
 * anchored to whichever chip was tapped in both. An ingredient name behaves the
 * same way wherever it appears — which is the point of having one component,
 * and was not true while the modal opened a panel inline and the pantry opened
 * one beside the chip.
 */
import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { useGrid } from "./GridStatus";
import { Chip } from "./primitives";
import { Popover } from "./Popover";
import { StateWidget, type IngredientState } from "./StateWidget";
import type { ActionResult } from "@/lib/result";

export type ChipItem = {
  /** The recipe's own requirement — what the label says. */
  id: string;
  name: string;
  /** The starting tone. Pantry state overrides it — see `toneOf`. */
  tone: "have" | "missing" | "plain" | "urgent" | "want";
  /** The pantry row a tap edits, and what to call it. */
  targetId: string;
  targetName: string;
  state: IngredientState;
};

export function IngredientChips({ items, onUpdate, pushKey,
                                  states, onApply,
                                  extras, excludedIds, onNote, onExclude }: {
  /** VAPID public key, forwarded to the state widget — §12. */
  pushKey?: string;
  items: ChipItem[];
  onUpdate: (id: string, next: IngredientState) => Promise<ActionResult>;
  /**
   * The optimistic map, held by a PARENT instead of here.
   *
   * The recipe modal needs it: a chip that turns green there also has to leave
   * "You need" and join "You have", and the sections are three separate
   * instances of this component. Three private maps cannot agree on which
   * section a chip belongs to, so the modal owns one — see `RecipeIngredients`.
   *
   * Everywhere else (the grid's cards) a chip only changes colour where it
   * stands, and the internal map below is the right amount of machinery.
   */
  states?: Record<string, IngredientState>;
  onApply?: (targetId: string, next: IngredientState) => void;
  /**
   * The sheet's full depth — had-since, note, don't-recommend — the same
   * props the pantry drawer passes. Optional because the grid's cards get by
   * on the three flags; the recipe surfaces pass everything, because "…" on a
   * chip opening a sheet that says only "not in your pantry" reads as broken
   * (it was — the reviewer caught it).
   */
  extras?: Record<string, { addedAt?: string; sinceAt?: string; note?: string }>;
  excludedIds?: ReadonlySet<string>;
  onNote?: (id: string, note: string) => Promise<ActionResult>;
  onExclude?: (id: string, excluded: boolean) => Promise<ActionResult>;
}) {
  /** The chip that is open, and the element to hang the panel off. */
  const [open, setOpen] = useState<{ item: ChipItem; anchor: HTMLElement } | null>(null);
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  /**
   * Optimistic flags, keyed by the row being written.
   *
   * The server re-renders the whole modal on revalidate, but a chip that waits
   * for that round trip feels broken — and this is the same optimism the pantry
   * runs on, with the same rule attached: a failure must be visible and must
   * say the write did not land.
   */
  const [own, setOwn] = useState<Record<string, IngredientState>>({});
  const local = states ?? own;

  const stateOf = (i: ChipItem) => local[i.targetId] ?? i.state;

  /**
   * Tone follows the pantry's meaning, so a chip says the same thing anywhere.
   *
   * "Use first" is NOT a fourth colour. The palette was carrying more meaning
   * than a glance can separate, and colour alone fails in greyscale and for
   * anyone who cannot tell those hues apart — the rule this codebase applies
   * everywhere else. It gets a leading dot instead.
   */
  const toneOf = (i: ChipItem) => {
    const s = stateOf(i);
    if (s.in_pantry) return i.tone === "missing" ? "have" as const : i.tone;
    if (s.on_list) return "want" as const;
    return i.tone;
  };

  /** The pin, marked structurally — see `Chip`'s `pinned`. */

  /**
   * Told once, on close — the same deal `Pantry` makes.
   *
   * `updateState` no longer revalidates (see the action), because doing it per
   * tap re-rendered the whole page including the grid behind this modal. The
   * chips here read from `local` so they are correct immediately; the server
   * hears about it when the panel shuts.
   */
  const { markDirty, flush } = useGrid();
  /* Closing the little panel is not "leaving the modal" — the recipe modal is
     still open and its grid is behind it. `RecipeModal` does the flush. */
  const closePanel = () => setOpen(null);

  /*
    The chip this panel is pointing at has left the DOM — close.

    In the recipe modal a chip changes SECTION when you mark it had, which
    unmounts it from one list and mounts a new node in another. The panel is
    portalled and anchored to the old node, so without this it would hang in
    mid-air pointing at nothing, positioned against an element that is no longer
    on the page.

    A layout effect with no dependency array: it runs after every render, which
    is exactly when a node can have gone, and before the browser paints — so the
    orphaned panel is never seen.
  */
  useLayoutEffect(() => {
    if (open && !open.anchor.isConnected) setOpen(null);
  });

  const apply = (i: ChipItem, next: IngredientState) => {
    markDirty();
    if (onApply) onApply(i.targetId, next);
    else setOwn((m) => ({ ...m, [i.targetId]: next }));
    /* Detached, and not a transition — see the note on `write` in `Pantry`. The
       chip has already flipped; the round trip is not part of the interaction. */
    void (async () => {
      try {
        const r = await onUpdate(i.targetId, next);
        setFailed(r.ok ? null : r.error);
      } catch (e) {
        setFailed(e instanceof Error ? e.message : "Could not reach the server.");
      }
    })();
  };

  return (
    <>
      {failed && (
        <div className="failbar" role="alert">
          <b>Not saved.</b> {failed}
          <button type="button" onClick={() => location.reload()}>reload</button>
        </div>
      )}

      <span className="chip-row">
        {items.map((i) => {
          const s = stateOf(i);
          return (
            <Chip key={i.id} label={i.name} tone={toneOf(i)} pinned={stateOf(i).use_first}
                  /* What a tap will do, for anyone who cannot see the tone. */
                  title={s.in_pantry ? `${i.targetName}: in your pantry`
                                     : s.on_list ? `${i.targetName}: on your grocery list`
                                                 : `${i.targetName}: not in your pantry`}
                  onClick={(e) => setOpen(
                    open?.item.id === i.id ? null : { item: i, anchor: e.currentTarget })} />
          );
        })}
      </span>

      {/* Anchored to the chip, exactly as in the pantry — see `Popover`. */}
      {open && (
        <Popover anchor={open.anchor} label={open.item.targetName}
                 onClose={closePanel}>
          <StateWidget {...(pushKey ? { pushKey } : {})}
            name={open.item.targetName}
            state={stateOf(open.item)}
            {...((x) => x ? {
              ...(x.addedAt ? { addedAt: x.addedAt } : {}),
              ...(x.sinceAt ? { sinceAt: x.sinceAt } : {}),
              ...(x.note ? { note: x.note } : {}),
            } : {})(extras?.[open.item.targetId ?? open.item.id])}
            {...(onNote ? { onNote: (next: string) =>
              onNote(open.item.targetId ?? open.item.id, next) } : {})}
            {...(excludedIds ? { excluded: excludedIds.has(open.item.targetId ?? open.item.id) } : {})}
            {...(onExclude ? { onExclude: (v: boolean) =>
              { void onExclude(open.item.targetId ?? open.item.id, v); } } : {})}
            onChange={(next) => apply(open.item, next)} />
        </Popover>
      )}
    </>
  );
}
