"use client";

/**
 * The state widget — INGREDIENT-SPEC §2, UX-SPEC §3.
 *
 * One tap on an ingredient anywhere opens this. It replaced the gesture
 * vocabulary (double-tap to add, swipe to remove, long-press to move) for three
 * reasons, and the implementation has to preserve all three:
 *
 *   - the same control everywhere, so one thing is learned once
 *   - state is VISIBLE before it is changed, which a swipe can never show
 *   - pantry and list are reachable in one interaction, because they are
 *     independent flags and a gesture that MOVED destroyed one to record the other
 *
 * It holds no product logic. It renders three booleans and calls back.
 *
 * ── Why these stopped being checkboxes ─────────────────────────────────────
 *
 * Three stacked checkbox rows read as a FORM — something you fill in and then
 * submit — and nothing here works that way: every tap writes immediately. The
 * mental model is "where is this thing", which is a state you flip, not a field
 * you complete. Stacked, they also made the panel three rows tall for what is
 * one decision.
 *
 * Now three pressed-state buttons on one row, which is the pattern this product
 * already uses everywhere a small state is set — the meal slots, the starter
 * list, "still have / ran out". Same control, learned once, which was the whole
 * argument for the widget in the first place.
 *
 * ── The exclusion is behind "more" ─────────────────────────────────────────
 *
 * "Never show me recipes with this" sat at the same weight as "In pantry", and
 * they are not remotely the same kind of act: two are about today's kitchen and
 * one is a standing instruction that removes hundreds of recipes from view. A
 * rule between them was not enough — the frequency was the problem. It is used
 * once in a while and was on screen every single time.
 *
 * Behind a `⋯` now, which is the right shape for it: rare, consequential, and
 * always in the same place when it is wanted.
 *
 * ── No close button ────────────────────────────────────────────────────────
 *
 * Tapping outside dismisses it, which people already expect from anything that
 * opens over what they were looking at, and Escape does the same. A button
 * whose only job is to undo the tap that opened it earns less than the space it
 * costs in a panel this small.
 */
import { startTransition, useEffect, useState } from "react";
import { Dialog } from "./Dialog";
import { ackFor, useAck } from "./Ack";
import { offerReminders } from "@/lib/push-client";

/**
 * Three dots, drawn.
 *
 * `⋯` as a character is thin and sits differently in every substituted font.
 * Circles are circles everywhere.
 */
function More() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

/** One of the three states, as a button that shows whether it is on. */
function Flag({ label, on, wide, onFlip }: {
  label: string; on: boolean; wide?: boolean; onFlip: () => void;
}) {
  /* Never disabled while a write is in flight. The state has already changed
     on screen — greying the control out is what made it feel laggy. */
  return (
    <button type="button"
            className={`flag${on ? " on" : ""}`}
            aria-pressed={on} onClick={onFlip}>
      {/* Rendered only when it is on, and inline beside the words rather than
          pinned to the edge. An always-present tick reserved width whether or
          not there was a mark in it, which pushed an unset label off centre;
          an absolutely-placed one fixed that and left the tick stranded at the
          far edge, a thumb's width from the thing it refers to. */}
      {/* Drawn, not typed — the rule the rest of this shell follows.

          It was the character ✓, which is thin, sits differently in every
          substituted font, and on the wide "Use first" flag lands at the very
          top-left of the panel, where whatever the platform renders is the
          first mark the eye meets. As SVG the geometry is ours. */}
      {on && (
        <svg className="flag-tick" width="13" height="13" viewBox="0 0 24 24"
             fill="none" stroke="currentColor" strokeWidth="3.2"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 13l5 5L19 7" />
        </svg>
      )}
      {label}
    </button>
  );
}

/** A question the system asks instead of guessing (INGREDIENT-SPEC §6). */
export type Ask = {
  id: string; grants: string; grantsName: string; question: string; because: string;
  /** The current answer, or null if never given. Not a suppression flag. */
  answer: boolean | null;
};

export type IngredientState = {
  in_pantry: boolean;
  on_list: boolean;
  use_first: boolean;
  /**
   * Bought, not yet put away — CART-SPEC.
   *
   * Carried on the state so the optimistic override in `Pantry` can move a row
   * into the cart the instant it is ticked. This widget deliberately does NOT
   * draw a control for it: the cart is where a shopping trip puts things, not
   * a box you tick about your kitchen, and the two ways out of it are the tick
   * itself and putting it away.
   */
  in_cart?: boolean;
};

/**
 * How long this has been yours — one line, never a list.
 *
 * The store now keeps a row after it goes empty, so an ingredient carries two
 * clocks: when THIS jar arrived, and when the user first ever had it. The
 * second one only says something the first does not when they differ — when
 * the thing has been bought, finished and bought again — so that is the only
 * case that gets the longer sentence.
 *
 * "on and off" is doing real work: `first_added_at` spans the gaps, and a plain
 * "had it since March" would claim continuous possession of something that was
 * absent for most of it.
 *
 * A date rather than a relative age — see the note inside `Since` for why that
 * reversed.
 */
function Since({ addedAt, sinceAt }: { addedAt?: string; sinceAt?: string }) {
  /*
    A DATE, not an age.

    This said "had it for 3w", on the argument that the row records when we
    were told rather than when the thing was bought, so a calendar date would
    dress that up as precision we do not have. True, and the wrong trade in a
    sheet you opened deliberately to look at one ingredient: "3w" has to be
    converted back into a week before it means anything, and the conversion is
    the part the reader wanted done.

    The imprecision is honest either way — "since 4 Aug" says when we were
    told, which is exactly what the row knows.
  */
  const on = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined,
                                     { month: "short", day: "numeric", year: "numeric" });

  /* Both clocks: when THIS one arrived, and when it was first ever here. The
     second only says something the first does not when they differ. */
  const returned = !!(sinceAt && addedAt && sinceAt.slice(0, 10) !== addedAt.slice(0, 10));
  if (returned && sinceAt) {
    return <p className="note">Had it on and off since {on(sinceAt)}.</p>;
  }
  if (addedAt) return <p className="note">Had since {on(addedAt)}.</p>;
  return null;
}

export function StateWidget({ name, state, addedAt, sinceAt, asks = [], excluded = false,
                              note, pushKey, onChange, onAnswer, onExclude, onNote }: {
  name: string;
  state: IngredientState;
  /** When the current instance entered — `UserIngredient.added_at`. */
  addedAt?: string;
  /** When it FIRST ever entered — `UserIngredient.first_added_at`. */
  sinceAt?: string;
  /** Unanswered clarifications triggered by this ingredient. */
  asks?: Ask[];
  /** USER-SPEC §6 — recipes containing this are hidden. */
  excluded?: boolean;
  /**
   * The VAPID public key, when notifications are configured — §12.
   *
   * Passed in rather than read from the environment here, because this is a
   * client component and the key belongs to the deployment, not the widget.
   * Absent means push is not set up and no permission is ever requested.
   */
  pushKey?: string;
  onChange: (next: IngredientState) => void;
  onAnswer?: (ask: Ask, yes: boolean) => void;
  onExclude?: (next: boolean) => void;
  /**
   * What the user wrote about this ingredient — INGREDIENT-SPEC §2's `note`.
   *
   * Optional, like `onExclude`: a surface that has no business writing can show
   * the same widget without offering a control that goes nowhere.
   */
  note?: string;
  onNote?: (next: string) => void;
}) {
  /** The read-and-write detail sheet, opened from the ⋯. */
  const [detail, setDetail] = useState(false);
  const [draft, setDraft] = useState(note ?? "");

  // The server is the authority after a revalidate — the same rule the pantry
  // and the cook rows follow. Without this the local copy would win forever.
  useEffect(() => { setDraft(note ?? ""); }, [note]);
  const { say } = useAck();

  /**
   * What the BUTTONS show, held here.
   *
   * They used to read the `state` prop directly, which lives in `Pantry`. So a
   * tap could not change a colour until the whole drawer had re-rendered —
   * every chip, every list row, and the sort and aisle-grouping that produce
   * them, all recomputed before the button you were touching could turn green.
   * That is why the colour lagged when nothing else obviously did.
   *
   * Now the flip is a tiny state change in this component: four buttons
   * re-render, nothing else. `Pantry` still gets told and still catches up —
   * just not on the critical path between a finger and a pixel.
   */
  const [shown, setShown] = useState(state);

  /*
    The parent wins when it genuinely disagrees.

    Compared field by field rather than by identity: `state` is a fresh object
    on every `Pantry` render, so an identity check would reset this constantly
    and undo the whole point.
  */
  useEffect(() => {
    setShown((cur) =>
      cur.in_pantry === state.in_pantry && cur.on_list === state.on_list
      && cur.use_first === state.use_first ? cur : state);
  }, [state.in_pantry, state.on_list, state.use_first]);

  /**
   * The exclusion paints from HERE, for the same reason the flags above do.
   *
   * It was the one control in this widget still reading its appearance from a
   * prop — `excluded` is derived in `Pantry` from server state, so the red
   * could not arrive until the action had been awaited AND the page re-rendered.
   * Measured on the device: **468ms** between the tap and the colour, while the
   * four flags beside it were at 26ms. Same fix, same shape: this component
   * owns the pixel, the server owns the truth, and the server corrects it below
   * if they ever disagree.
   */
  const [isExcluded, setIsExcluded] = useState(excluded);
  useEffect(() => { setIsExcluded(excluded); }, [excluded]);

  const set = (k: keyof IngredientState, v: boolean) => {
    const next = { ...shown, [k]: v };
    /*
      A pin is a property of something you HAVE, and that rule runs both ways.

      Dropping it from the pantry drops the pin, rather than leaving one on an
      item the user no longer holds. And pinning something implies holding it:
      "use first" on an empty cupboard is not a state anyone means, and a pin
      is a HARD FILTER in `rank` — so the one that steers the grid most would
      otherwise be set from a widget still reading "Have it: off", and the user
      would have to notice the second tap to make the first one work.

      The note under the flags said this in words. Doing it is better than
      explaining it.
    */
    if (k === "in_pantry" && !v) next.use_first = false;
    if (k === "use_first" && v) next.in_pantry = true;
    /* And the expensive one, deferred. `onChange` re-renders the drawer that
       owns this panel; as a transition React finishes the button first and
       does that work when it can. */
    startTransition(() => onChange(next));
    /*
      §4d: say what happened, and offer the way back.

      Here rather than at each call site because this is the one funnel every
      flag change passes through — the pantry chips, the grocery rows and the
      chips inside a recipe all arrive at this function. Undo replays the
      PREVIOUS state through the same path, so it cannot drift from what the
      change actually did.
    */
    /* Paint first. This is the urgent update and it is the only one on the
       path between the tap and the colour. */
    setShown(next);

    const said = ackFor(name, shown, next);
    if (said) say(said, () => onChange(shown));

    /*
      §12: the first pin is the ONLY moment this product asks for notification
      permission. "Use first" is the user saying something is dying, which is
      the one fact worth reaching them about later — and the ask arrives with
      that reason visibly attached, immediately after they supplied it.

      Fire-and-forget: a permission dialog must not gate the pin that opened it,
      and every guard about not spending the permission lives in `offerReminders`.
    */
    if (k === "use_first" && v && pushKey) void offerReminders(pushKey);
  };

  return (
    <>
      {/*
        A vertical stack, and it never changes size.

        That second part is the whole design. Every version of this panel that
        could GROW — a menu opening inside it, a note field unfolding — moved
        under the finger, because the layer is usually flipped above the chip
        and growing pushes its top edge up. So nothing here opens anything in
        place: four rows, always, and the one control that leads somewhere else
        opens a dialog rather than more of this.

        The order is urgency, not taxonomy:

          Use first — the one with a clock on it, and the reason the panel is
                      usually open. It used to sit third on the argument that
                      it modifies "have it", which is true and is a statement
                      about the data model rather than about the person: they
                      opened this because something is going off. It also
                      implies having it, so reaching it first costs no second
                      tap — see the rule in `set`.
          Have it   — where it is, and the answer people correct most
          Will buy  — the other half of that question
          ⋯         — everything that is not a state at all
      */}
      {/*
        Toggled against `shown`, not against `state`.

        They used to flip `!state.x` — the SERVER's value — while rendering
        `shown`, the local one. That was harmless while every write refreshed
        the page immediately, because the two were never apart for long. Now
        that the grid deliberately waits for the drawer to close, they disagree
        for the whole session: turning "Have it" off set `shown` false while
        `state` stayed true, so the next tap computed `!true` and asked for
        false again. The flag could be turned off and never back on.

        A control that reads one value and writes another is a bug waiting for
        someone to change the refresh policy, which is exactly what happened.
      */}
      <div className="chipbar" role="group" aria-label={`${name}: where it is and whether it needs using`}>
        <Flag label="Use first" on={shown.use_first}
              onFlip={() => set("use_first", !shown.use_first)} />
        <Flag label="Have it" on={shown.in_pantry}
              onFlip={() => set("in_pantry", !shown.in_pantry)} />
        <Flag label="Will buy" on={shown.on_list}
              onFlip={() => set("on_list", !shown.on_list)} />
        {/* Straight to the sheet. It was a dropdown that opened two items
            inside this layer, which is what made it grow and jump. */}
        <button type="button" className="chipbar-more"
                aria-label={`More for ${name}`}
                onClick={() => setDetail(true)}>
          <More />
        </button>
      </div>

      {/*
        Everything that is not one of the three states, in one sheet.

        It is read as much as tapped — how long the thing has been there, what
        you wrote about it — and it is the only part with any reason to grow,
        which is exactly why it is not balanced on the edge of a chip.
      */}
      {detail && (
        <Dialog label={name} onClose={() => setDetail(false)}>
          <h2 className="ask-question">{name}</h2>
          {shown.in_pantry
            ? <Since addedAt={addedAt} sinceAt={sinceAt} />
            : <p className="note">Not in your pantry.</p>}

          {onNote && (
            <label className="field">
              <span className="field-label">Note</span>
              {/* No placeholder (Richard, 2026-08-18). "the one in the door…"
                  was an example pretending to be a prompt: it suggested one
                  kind of note and left the field looking pre-filled at a
                  glance. The label says what it is. */}
              <textarea value={draft} rows={3} className="notefield"
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => { if (draft !== (note ?? "")) onNote(draft); }} />
            </label>
          )}

          {/*
            The label does not change; the colour does.

            It used to swap to "Recommend it again" when on, which is the
            standard toggle-as-verb pattern and reads badly on a control that
            is red: the state and the label were both moving, so you had to
            read the sentence to find out what was true. One fixed name, one
            colour that means on, and `aria-pressed` says the same thing to
            anyone who cannot see it.
          */}
          {onExclude && (
            <button type="button"
                    className={isExcluded ? "standing-btn on" : "standing-btn"}
                    aria-pressed={isExcluded}
                    onClick={() => {
                      const next = !isExcluded;
                      /* Urgent, and first. Everything else this click causes —
                         the write, the grid — happens after the colour. */
                      setIsExcluded(next);
                      onExclude(next);
                    }}>
              Don’t recommend recipes with this
            </button>
          )}

          {/* No "Done". Nothing in this sheet is a form to submit — every
              control writes as it is touched — so a button that only closes is
              a third way to do what the scrim and Escape already do. */}
        </Dialog>
      )}
    </>
  );
}
