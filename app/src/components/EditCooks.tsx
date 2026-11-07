"use client";

/**
 * Amending the cook log — every cook, not just today's.
 *
 * ── Why it is separate from the Made it dialog ───────────────────────────
 *
 * That one is bound to a DATE: it shows the cooks recorded on the day the modal
 * is open on, because its job is "record what I just made". This one is bound to
 * the RECIPE and shows all of them, because its job is "fix the record" — and
 * the thing you want to fix is usually not today's, it is the one from three
 * weeks ago you rated wrong.
 *
 * Reached from the history line, where the count already is: "Cooked twice" is
 * the sentence, and `edit` belongs at the end of it rather than as a button
 * somewhere else claiming to be about the same thing.
 *
 * ── No ingredients here, deliberately ────────────────────────────────────
 *
 * "Used anything up?" lives in the Made it dialog and only there. It is a
 * question about the pantry NOW, answered once, in the minutes after cooking
 * when the packets are still on the counter. Offering it against a cook from
 * three weeks ago would be asking someone to reconstruct what a jar looked like
 * in July, and writing the answer into today's pantry.
 *
 * So this edits what a cook WAS — when, which meal, how it went — and never
 * what it consumed.
 */
import { useState, useTransition } from "react";
import { Dialog, useConfirm } from "./Dialog";
import { Button } from "./primitives";
import { dayLabel } from "@/lib/day";
import type { ActionResult } from "@/lib/result";
/* The device-first versions — same signatures, the client store written first
   and the server mirrored behind it. */
import { rateCook as liveRateCook, undoMadeIt as liveUndoMadeIt } from "@/lib/dual-write";

export type PastCook = {
  id: string;
  at: string;
  meal?: string;
  rating?: number;
  note?: string;
};

export function EditCooks({ cooks, meals, onRate, onDelete, live: onDevice = false }: {
  /** Every cook of this recipe, newest first. */
  cooks: PastCook[];
  meals: readonly string[];
  onRate: (cookId: string, patch: { rating?: number; note?: string; meal?: string })
    => Promise<ActionResult>;
  onDelete: (cookId: string) => Promise<ActionResult>;
  /**
   * The page behind this reads its shelves from the DEVICE.
   *
   * Deleting a cook is the one here that changes what the grid should say: the
   * card's "Made before" mark and Explore's memory both count cooks, so an
   * undo the device never heard leaves a dish marked as cooked and kept out of
   * the shelf that stopped offering it. Both writes are ordinary mirrors now —
   * the device holds the cook under an id it minted, so the row this panel is
   * pointing at exists on both sides. See `lib/dual-write`.
   */
  live?: boolean;
}) {
  /* Renamed on the way in: `live` already names the rows this panel has not
     deleted yet, a few lines down. */
  const rate = onDevice ? liveRateCook : onRate;
  const remove = onDevice ? liveUndoMadeIt : onDelete;
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  /** Rows removed in this session, so the list answers before the page does. */
  const [gone, setGone] = useState<Set<string>>(new Set());

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      try {
        const r = await fn();
        setFailed(r.ok ? null : r.error);
      } catch (e) {
        setFailed(e instanceof Error ? e.message : "Could not reach the server.");
      }
    });

  if (!cooks.length) return null;
  const live = cooks.filter((c) => !gone.has(c.id));

  return (
    <>
      {/* Text, in the sentence. Not a button: it sits inside a line of prose
          about how many times you have cooked this, and a control with a border
          would make that line a toolbar. */}
      <button type="button" className="history-edit" onClick={() => setOpen(true)}>
        edit
      </button>

      {open && (
        <Dialog label="Edit your cooking history" onClose={() => setOpen(false)}>
          <h3 className="account-dlg-h">Your cooking history</h3>
          {failed && <p className="fail">Not saved: {failed}</p>}

          <ol className="editcooks">
            {live.map((c) => (
              <EditOne key={c.id} cook={c} meals={meals} pending={pending} run={run}
                       onRate={rate}
                       onDelete={() => confirm({
                         question: `Delete the ${c.meal ?? "cook"} recorded ${dayLabel(c.at)}?`,
                         detail: "Its rating and note go with it. Ingredients it added to " +
                                 "your pantry stay.",
                         confirmLabel: "Delete it",
                       }, () => {
                         setGone((s) => new Set(s).add(c.id));
                         run(() => remove(c.id));
                       })} />
            ))}
          </ol>

          {live.length === 0 && <p className="note">Nothing left in this history.</p>}

          <div className="account-confirm-row">
            <button type="button" className="account-btn" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </Dialog>
      )}
      {dialog}
    </>
  );
}

/** One cook, editable in place. Every field writes as it is touched. */
function EditOne({ cook, meals, pending, run, onRate, onDelete }: {
  cook: PastCook;
  meals: readonly string[];
  pending: boolean;
  run: (fn: () => Promise<ActionResult>) => void;
  onRate: (cookId: string, patch: { rating?: number; note?: string; meal?: string })
    => Promise<ActionResult>;
  onDelete: () => void;
}) {
  const [meal, setMeal] = useState(cook.meal);
  const [rating, setRating] = useState(cook.rating);
  const [note, setNote] = useState(cook.note ?? "");

  return (
    <li className="editcook">
      <p className="editcook-when">
        <b>{dayLabel(cook.at)}</b>
        {/* "delete", not "undo". Undo means the last thing you did, and this
            list is mostly about cooks from weeks ago — calling it undo invited
            the reading that it reverses something recent. */}
        <button type="button" className="history-edit editcook-del"
                disabled={pending} onClick={onDelete}>delete</button>
      </p>

      <div className="meals" role="group" aria-label="Which meal">
        {meals.map((m) => (
          <button key={m} type="button" className={m === meal ? "mealchip on" : "mealchip"}
                  aria-pressed={m === meal} disabled={pending}
                  onClick={() => {
                    const next = meal === m ? "" : m;
                    setMeal(next || undefined);
                    run(() => onRate(cook.id, { meal: next }));
                  }}>
            {m}
          </button>
        ))}
      </div>

      <div className="stars" role="group" aria-label={`Rate the cook on ${dayLabel(cook.at)}`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" className={n <= (rating ?? 0) ? "star on" : "star"}
                  aria-label={`${n} of 5`} aria-pressed={n === rating} disabled={pending}
                  onClick={() => { setRating(n); run(() => onRate(cook.id, { rating: n })); }}>★</button>
        ))}
        {rating === undefined && <span className="note"> not rated</span>}
      </div>

      <label className="field">
        <textarea value={note} rows={2} disabled={pending}
                  onChange={(e) => setNote(e.target.value)}
                  onBlur={() => note !== (cook.note ?? "") && run(() => onRate(cook.id, { note }))} />
      </label>
    </li>
  );
}
