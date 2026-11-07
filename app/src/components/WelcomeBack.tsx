"use client";

/**
 * "Still got these?" — the pantry review after an absence.
 *
 * The product has exactly one corrective for a pantry that has drifted out of
 * date, and it fires after a cook. Which means it never fires for the person
 * who most needs it: someone who has been away for three weeks has not cooked,
 * so nothing has asked them anything, and the app greets them with *Cook
 * tonight: 41* computed from an inventory that is largely fiction. They tap
 * something badged **have everything**, get to the kitchen, and it is wrong.
 *
 * That is the most expensive failure available to this product, because "have
 * everything" is the one claim it makes.
 *
 * ── Why it is a prompt and not decay ───────────────────────────────────────
 *
 * DECISIONS §5 deferred the staleness nudge to v2 and this does not undo that.
 * Nothing here expires on its own, nothing is guessed from a shelf life we do
 * not have, and no row changes unless the user says so. It is the same question
 * the post-cook block asks, asked at the other moment it is answerable.
 *
 * ── Rules it inherits ──────────────────────────────────────────────────────
 *
 *   - **Oldest first.** `added_at` has been on every row since the store was
 *     written and has never been shown; this is the one screen where age is the
 *     entire point.
 *   - **"Still have" is the default and writes nothing.** Dismissing the whole
 *     panel is free, and dismissing it is recorded so it does not reappear on
 *     the next page load.
 *   - **Staples are not asked about.** Salt did not go off. Asking teaches
 *     people to dismiss the panel without reading it, and then it is worthless
 *     on the day it matters.
 *   - **Nothing reaches the grocery list.** Running out is not the same act as
 *     deciding to shop (UX-SPEC §4b).
 */
import { useState, useTransition } from "react";
import { Button, Note } from "./primitives";
import type { ActionResult } from "@/lib/result";
/* The device's copy of the same write — see `live`. */
import { reviewPantryAfterAbsence as liveReview } from "@/lib/dual-write";

export type StaleItem = { id: string; name: string; age: string };

export function WelcomeBack({ items, days, onSettle, onDismiss, live = false }: {
  /** Pantry rows, oldest first, staples already removed by the caller. */
  items: StaleItem[];
  /** How long they were gone, so the panel can say why it is here. */
  days: number;
  onSettle: (ranOut: string[]) => Promise<ActionResult>;
  /** Records that the question was asked, so it does not ask again today. */
  onDismiss: () => Promise<ActionResult>;
  /**
   * The grid behind this panel is the DEVICE's.
   *
   * This is the pantry's only subtractive path outside a cook, and the whole
   * point of it is that the shelves stop claiming things the user no longer
   * has. A removal that reached only `owners.json` would leave the grid
   * badging "have everything" on exactly the recipes this panel was opened to
   * correct — the most expensive failure available to the product.
   */
  live?: boolean;
}) {
  /* Skipping writes too — an empty review is a real answer, and it is what
     stamps the owner active so the panel does not reappear. Both paths go
     through the same pair. */
  const settle = live ? liveReview : onSettle;
  const dismiss = live ? () => liveReview([]) : onDismiss;
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      try {
        const r = await fn();
        setFailed(r.ok ? null : r.error);
      } catch (e) {
        setFailed(e instanceof Error ? e.message : "Could not reach the server.");
      }
    });

  const toggle = (id: string) =>
    setGone((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <div className="welcomeback">
      {failed && <div className="failbar" role="alert"><b>Not saved.</b> {failed}</div>}

      <h2 className="firstrun-title">Welcome back. Still got these?</h2>
      <Note>
        It has been {days} days. Oldest first.
      </Note>

      <ul className="settle-list">
        {items.map((i) => {
          const out = gone.has(i.id);
          return (
            <li key={i.id}>
              <span className="settle-name">
                {i.name} <span className="note">· {i.age}</span>
              </span>
              <span className="settle-choice" role="group" aria-label={i.name}>
                <button type="button" className={out ? "settle-btn" : "settle-btn on"}
                        aria-pressed={!out} disabled={pending}
                        onClick={() => toggle(i.id)}>Still have</button>
                <button type="button" className={out ? "settle-btn on" : "settle-btn"}
                        aria-pressed={out} disabled={pending}
                        onClick={() => toggle(i.id)}>Gone</button>
              </span>
            </li>
          );
        })}
      </ul>

      {/* One write at the end rather than one per row: this is a review, and a
          review that saves as you go cannot be abandoned halfway. */}
      <p className="cook-line">
        <Button kind="primary" disabled={pending}
                onClick={() => run(() => settle([...gone]))}>
          {pending ? "Saving…"
            : gone.size ? `Remove ${gone.size} and carry on`
                        : "All still here"}
        </Button>
        <Button kind="quiet" disabled={pending} onClick={() => run(dismiss)}>
          Skip
        </Button>
      </p>
    </div>
  );
}
