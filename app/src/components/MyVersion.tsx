"use client";

/**
 * "My version" — UX-SPEC §5 and §8, and the only place a cook is recorded.
 *
 * *"What this user substituted last time and how it went. The single strongest
 * reason to open our modal rather than search the blog again."*
 *
 * ── Two things, not one ────────────────────────────────────────────────────
 *
 * This component used to conflate them, and binding the modal to a date is what
 * exposed it:
 *
 *   - **History** — what you did LAST time, its rating and note. Read-only,
 *     never date-bound, always shown. It is the reason to open the modal at all,
 *     and binding it to today would blank it for every recipe you last cooked in
 *     July — which is most of them.
 *   - **This date** — the cooks recorded on the day the modal is bound to, each
 *     with its meal, rating and note, plus a way to add one.
 *
 * Merged, the stars edited "the latest cook", so rating a Monday meal on Friday
 * silently rewrote Friday's. Separated, each says what it is.
 *
 * ── It is a dialogue now, and it arrives when you get back ─────────────────
 *
 * This sat open in the modal under the heading *After you cook*, which put it on
 * screen at the one moment nobody could answer it — before the cooking — and
 * out of mind at the moment they could. A modal left forty minutes ago is not
 * somewhere people scroll back into to award three stars.
 *
 * So it asks on the way back instead. Tapping through to the source leaves a
 * marker (`lib/cooking`); returning to a tab that has been away long enough to
 * have cooked something opens the form, once.
 *
 * The **Made it!** button opens the same form, because the marker only knows
 * about people who left through our button. Cooking from memory, from a
 * photograph, from the recipe you have made forty times — none of those leave a
 * trace, and a cook is what marks the pantry up. A loop that can only be closed
 * by people who took the scenic route is not closed.
 *
 * ── Nothing is a cook until Save ───────────────────────────────────────────
 *
 * §5's rule is that the tap meaning *I'm cooking this* must not be taxed with a
 * form, and for as long as that tap WAS the record, this component obeyed it by
 * writing first and collecting the answers afterwards against a cook id — which
 * is what `rateCook` and `settleUp` are for, and they still serve the rows of
 * cooks already on the books.
 *
 * A dialogue with a Save button inverts that, and it has to: opening something,
 * reading it and closing it is not a claim, so a record already written by then
 * is a meal the user never said they ate — with their pantry marked up to match,
 * since `recordCook` is additive and only `settleUp` ever subtracts. The tap
 * that is now untaxed is the one that opens the dialogue.
 */
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "./primitives";
import { Dialog, useConfirm } from "./Dialog";
import { backFromCooking } from "@/lib/cooking";
import type { ActionResult } from "@/lib/result";
/* The device-first versions of the four cook writes — same signatures, the
   client store written on this frame and the server mirrored behind it. See
   `live`. */
import { madeIt as liveMadeIt, rateCook as liveRateCook,
         settleUp as liveSettleUp, undoMadeIt as liveUndoMadeIt } from "@/lib/dual-write";
import { dayLabel } from "@/lib/day";

/** A cook recorded on the date this modal is bound to. */
export type DatedCook = {
  id: string; meal?: string; rating?: number; note?: string;
  /**
   * What this cook used, with the pantry's current answer for each.
   *
   * The snapshot on the event (`required`), resolved to names — not the recipe
   * as it stands now, because the point is what THIS cooking consumed.
   */
  used?: Array<{ id: string; name: string; inPantry: boolean; main?: boolean }>;
  /** Requirements this cook was missing — the candidates for "instead of". */
  wanted?: Array<{ id: string; name: string }>;
};

/** An ingredient hit from the shared autosuggest. */
type Hit = { id: string; name: string; recipes: number; via?: string };

export function MyVersion({ recipeId, date, today, dateLabel, meals, todays,
                            search, onSettle, onRate, onCook, onUndo,
                            live = false }: {
  recipeId: string;
  /** `YYYY-MM-DD` this modal is bound to — the form's starting date. */
  date: string;
  /**
   * Today in the OWNER's zone, `YYYY-MM-DD` — the ceiling on the date picker.
   *
   * From the server, which knows the zone (`ownerTz`), rather than from the
   * browser clock. It replaced an `isFuture` boolean about the bound date, which
   * could say nothing useful once the date became something the user could
   * change inside the dialogue.
   */
  today: string;
  /** "today", "Mon 4 Aug" — what to call the date in a sentence. */
  dateLabel: string;
  /** The slots offered. Free text is accepted by the store; this is the menu. */
  meals: readonly string[];
  /** Cooks on THIS date. Usually none or one, but lunch and dinner both happen. */
  todays: DatedCook[];
  /** The same ingredient autosuggest the pantry and Add-a-recipe use. */
  search: (q: string) => Promise<Hit[]>;
  /** Ran out / also used — the pantry's only subtractive signal. */
  onSettle: (cookId: string,
             patch: { ranOut?: string[]; alsoUsed?: Array<{ id: string; insteadOf?: string }> })
    => Promise<ActionResult>;
  onRate: (cookId: string, patch: { rating?: number; note?: string; meal?: string })
    => Promise<ActionResult>;
  /**
   * The single write. Date, slot, stars and note together — see the form below
   * for why this cannot be a create followed by an amend.
   */
  onCook: (recipeId: string, date: string, meal?: string, planId?: string,
           details?: { rating?: number; note?: string }) => Promise<ActionResult>;
  onUndo: (cookId: string) => Promise<ActionResult>;
  /**
   * The page behind this modal reads its pantry from the DEVICE.
   *
   * All four writes are ordinary mirrors now — the device records the cook
   * under an id it minted itself and the server is told behind it
   * (`lib/dual-write`). That matters most for `onSettle`: "the pork ran out" is
   * the pantry's only subtractive signal, and a grid that never heard it goes
   * on badging that dish "have everything", which is the one claim this product
   * cannot get wrong. It lands on this frame now rather than after a round
   * trip, and it lands at all on a build with no server behind it.
   *
   * A prop rather than always-on, because the home page still renders this
   * component from a SERVER-rendered modal and hands it the raw actions.
   */
  live?: boolean;
}) {
  /* Wrapped, not replaced: same signatures, device first. */
  const settle = live ? liveSettleUp : onSettle;
  const rate = live ? liveRateCook : onRate;
  const cook = live ? liveMadeIt : onCook;
  const undo = live ? liveUndoMadeIt : onUndo;
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);

  const run = (fn: () => Promise<ActionResult>, then?: () => void) =>
    start(async () => {
      try {
        const r = await fn();
        setFailed(r.ok ? null : r.error);
        if (r.ok) then?.();
      } catch (e) {
        setFailed(e instanceof Error ? e.message : "Could not reach the server.");
      }
    });

  /** Whether the dialogue is up. Both doors open the same uncommitted form. */
  const [open, setOpen] = useState(false);

  /**
   * The form — held here, written nowhere until Save.
   *
   * This used to record on the way in and let the answers arrive afterwards,
   * which is what UX-SPEC §5's untaxed tap asks for and what `rateCook` exists
   * to serve. A dialogue with a Save button cannot work that way: a user who
   * opens it, reads it and closes it has said nothing, and a cook already on the
   * books by then is a meal they never claimed — with their pantry marked up to
   * match, because `recordCook` is additive.
   *
   * So nothing leaves this component until Save, and Save is one write:
   * `madeIt` carries the date, the slot, the stars and the note together. There
   * is no half-saved state to reconcile because there is no first half.
   */
  const [when, setWhen] = useState(date);
  const [meal, setMeal] = useState("");
  const [stars, setStars] = useState<number | undefined>(undefined);
  const [note, setNote] = useState("");

  /** Open on a blank form. Reopening must never inherit an abandoned draft. */
  const openForm = useCallback(() => {
    setWhen(date);
    setMeal("");
    setStars(undefined);
    setNote("");
    setFailed(null);
    setOpen(true);
  }, [date]);

  /**
   * Back from cooking this? Then ask — and ask is all it does.
   *
   * We know they LEFT to cook this; we do not know that they did. Recording on
   * that inference would drain a pantry for a meal that never happened, and the
   * pantry is the one thing in this product that must not be quietly wrong. So
   * the return opens the same form the button opens, and Save is still the only
   * thing that writes.
   *
   * Both events, because they answer different questions on different devices.
   * On a phone the tab genuinely goes hidden and `visibilitychange` fires; on a
   * desktop the window can lose focus to another window while staying visible,
   * and only `focus` catches that. `backFromCooking` is consuming and cheap, so
   * hearing about a return twice costs one dead read and asks once.
   *
   * Checked on mount as well: a phone that discarded and restored the tab fires
   * neither event, and the marker is exactly as valid.
   */
  /**
   * The one question first, and the form only if the answer is yes.
   *
   * Returning used to open the whole record-a-cook form: a date, a meal, a
   * rating and a note, on the strength of an inference we had already said we
   * did not trust. For the person who did not cook it — went to look, got
   * distracted, came back — that is a form to read and dismiss as the price of
   * having opened a recipe.
   *
   * So the return asks the only thing it actually wants to know. "No" closes
   * and writes nothing, which is now a one-tap answer rather than a form to
   * escape from. "Yes" opens the same form the button opens, and Save is still
   * the only thing in either path that writes.
   */
  const [asking, setAsking] = useState(false);

  const askIfBack = useCallback(() => {
    if (backFromCooking(recipeId)) setAsking(true);
  }, [recipeId]);

  useEffect(() => {
    askIfBack();
    const onVisible = () => { if (document.visibilityState === "visible") askIfBack(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", askIfBack);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", askIfBack);
    };
  }, [askIfBack]);

  /**
   * A cook is a thing that happened, so a day that has not arrived cannot hold
   * one. `recordCook` enforces this; the disabled Save and the line beside it
   * are the courtesy, so the rule is met before the round trip rather than by it.
   */
  const futureDay = when > today;

  /**
   * The chosen day, in words — `2026-08-10` is a date, not an answer.
   *
   * The picker has to hold an ISO string because that is what a `type="date"`
   * input speaks, and it is the least readable form of the one field in this
   * dialogue people will actually look at. So the words sit beside it: "Today"
   * for the overwhelmingly common case, "Yesterday" for the next one, and a
   * written-out date for anything further back, where the weekday is the part
   * that tells you whether you picked the right square.
   */
  const dayBefore = (iso: string) => {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  };
  const whenLabel =
    when === today ? "Today"
      : when === dayBefore(today) ? "Yesterday"
        : new Date(`${when}T12:00:00`)
            .toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  const saveCook = () =>
    run(() => cook(recipeId, when, meal || undefined, undefined, {
      ...(stars !== undefined ? { rating: stars } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    }), () => setOpen(false));

  return (
    <div className="modal-madeit">
      {/*
        The other half of the pair, and it is drawn as one.

        Two things can happen at the bottom of this modal: you go and read the
        recipe, or you tell us you already cooked it. They are peers, so they are
        the same size and the same shape, and only the colour says which is
        which — the exit takes the inverted fill, this takes the accent.

        It opens the same dialogue a return from cooking opens. The marker in
        `lib/cooking` only knows about people who left through our button, and
        cooking from memory leaves no trace; a cook is what drains the pantry, so
        a loop only closeable by people who took the scenic route is not closed.
      */}
      <button type="button" className="btn btn-madeit" onClick={openForm}>
        Made it!
      </button>

      {/*
        Asked on return, and it is the whole interaction for anyone who says no.

        No scrim dismissal into ambiguity: closing it any other way (Escape, the
        backdrop) means the same as "not now" — nothing is written either way,
        so there is no state to be unsure about.
      */}
      {asking && (
        <Dialog label="Did you make it?" onClose={() => setAsking(false)}>
          <h2 className="ask-question">Did you make it?</h2>
          <div className="ask-actions ask-actions-split">
            <button type="button" className="btn"
                    onClick={() => setAsking(false)}>No</button>
            <button type="button" className="btn btn-primary"
                    onClick={() => { setAsking(false); openForm(); }}>Yes</button>
          </div>
        </Dialog>
      )}

      {open && (
        <Dialog label="Made it" onClose={() => setOpen(false)}>
          <h2 className="ask-question">Made it!</h2>

          {/*
            What is already on the books for this date, above the blank form.

            These are saved records and behave as they always have — each field
            writes as you touch it, and settling up needs a cook id to attach to.
            They sit here so that "Made it again" is an obvious act rather than a
            thing you do by accident, having forgotten this morning's entry.
          */}
          {todays.length > 0 && (
            <div className="lastcook">
              <p className="field-label">Already recorded for {dateLabel}</p>
              {todays.map((c) => (
                <CookRow key={c.id} cook={c} meals={meals} dateLabel={dateLabel}
                         pending={pending} search={search} onSettle={settle}
                         onRate={rate} onUndo={undo} run={run} />
              ))}
            </div>
          )}

          <label className="field">
            <span className="field-label">When did you cook it?</span>
            {/* Defaults to the date the modal is bound to — today from the grid,
                the square you tapped from the calendar — and is adjustable
                because people record Tuesday's dinner on Thursday. */}
            <span className="daypick-row">
              <input type="date" className="daypick" value={when} max={today}
                     disabled={pending} onChange={(e) => setWhen(e.target.value)} />
              {/* The same fact in words — see `whenLabel`. `aria-hidden`, since
                  the input already announces its own value and a screen reader
                  reading the date twice is worse than not reading it here. */}
              <b className="daypick-said" aria-hidden="true">{whenLabel}</b>
            </span>
          </label>

          <div className="field">
            {/* No "(optional)" on this or the two below — everything but the
                date is skippable and Save works regardless, so the form's own
                behavior says it; saying it three times was the wordiest
                screen in the product. */}
            <span className="field-label">Which meal?</span>
            {/* Nothing marks it required — an unanswered slot is a normal state
                (see `CookEvent.meal`). Tapping the chosen one clears it. */}
            <div className="meals" role="group" aria-label="Which meal">
              {meals.map((m) => (
                <button key={m} type="button"
                        className={m === meal ? "mealchip on" : "mealchip"}
                        aria-pressed={m === meal} disabled={pending}
                        onClick={() => setMeal(m === meal ? "" : m)}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <span className="field-label">How was it?</span>
            <div className="stars" role="group" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button"
                        className={n <= (stars ?? 0) ? "star on" : "star"}
                        aria-label={`${n} of 5`} aria-pressed={n === stars}
                        disabled={pending}
                        onClick={() => setStars(n === stars ? undefined : n)}>★</button>
              ))}
              {stars === undefined && <span className="note"> not rated</span>}
            </div>
          </div>

          <label className="field">
            {/* Not "How did it go?" — beside "How was it?" the two read as
                the same question asked twice; this one names what the box is
                FOR (the note you find next time you cook it). */}
            <span className="field-label">Anything worth remembering?</span>
            <textarea value={note} rows={2} disabled={pending}
                      onChange={(e) => setNote(e.target.value)} />
          </label>

          {/*
            "Used anything up?" — last in the dialog, and only here.

            It briefly lived on the collapsed cook row, on the argument that it
            is the one question only answerable now. Right about the question,
            wrong about the place: the row is a summary of what was saved, and a
            live pantry control inside a summary makes the summary a form.

            Under the note is where it belongs — it is the last thing you know
            after cooking, and it reads as the end of the same sentence the
            three questions above start.
            It attaches to cooks already on the books, because settling needs a
            cook id and this form has not written one yet. A brand new cook
            settles the next time this dialog is opened, which is also when the
            user actually knows what is left.
          */}
          {todays.map((c) => (
            <Settle key={c.id} cook={c} pending={pending} search={search}
                    onSettle={settle} run={run} />
          ))}

          {futureDay && (
            <p className="note">
              {dayLabel(`${when}T12:00:00`)} has not happened yet. A cook can only
              be recorded afterwards.
            </p>
          )}
          {failed && <p className="fail">Not saved: {failed}</p>}

          {/*
            Half the row each, and both of them full size.

            They are the two ends of the same decision, so neither is furniture:
            a quiet text "cancel" beside a solid Save makes backing out feel like
            the wrong answer rather than an equal one. Cancel keeps an outline so
            it is visibly a button — the fill is what says which one commits.

            Save is the only thing here that writes. Scrim, Escape and Cancel all
            discard alike; three ways out that behave differently is how a form
            loses work.
          */}
          <div className="ask-actions ask-actions-split">
            <Button kind="primary" disabled={pending || futureDay} onClick={saveCook}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button kind="plain" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/**
 * One recorded cook: which meal, how it went, and a way to take it back.
 *
 * The slot is asked HERE rather than at the tap, and nothing marks it as
 * required — an unanswered slot is a normal state (see `CookEvent.meal`). It
 * comes first because it is the cheapest question: one tap, and it is the field
 * that lets two cooks on one day be told apart.
 */
function CookRow({ cook, meals, dateLabel, pending, search, onSettle, onRate, onUndo, run }: {
  cook: DatedCook;
  meals: readonly string[];
  dateLabel: string;
  pending: boolean;
  search: (q: string) => Promise<Hit[]>;
  onSettle: (cookId: string,
             patch: { ranOut?: string[]; alsoUsed?: Array<{ id: string; insteadOf?: string }> })
    => Promise<ActionResult>;
  onRate: (cookId: string, patch: { rating?: number; note?: string; meal?: string })
    => Promise<ActionResult>;
  onUndo: (cookId: string) => Promise<ActionResult>;
  run: (fn: () => Promise<ActionResult>, then?: () => void) => void;
}) {
  const { confirm, dialog } = useConfirm();
  /**
   * Closed until you say otherwise, and that is the fix for two things at once.
   *
   * These controls are the same three questions the blank form below asks —
   * meal, rating, note — so a dialog opened on a day that already had a cook
   * showed all three TWICE, once bound to the saved record and once to a new
   * one. Nothing said which was which, and the pair read as the dialog having
   * rendered itself twice.
   *
   * Collapsed, the row is a summary of what was saved, and "edit" is how you
   * change it. That makes the recorded cook something you can amend on purpose
   * — every field still writes as you touch it — while leaving exactly one set
   * of blank questions on screen.
   */
  const [editing, setEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState(cook.note ?? "");
  const [rating, setRating] = useState(cook.rating);
  const [meal, setMeal] = useState(cook.meal);

  // The server is the authority after a revalidate — see the same note in the
  // pantry. Without this the local copy would win forever.
  useEffect(() => { setNoteDraft(cook.note ?? ""); }, [cook.note]);
  useEffect(() => { setRating(cook.rating); }, [cook.rating]);
  useEffect(() => { setMeal(cook.meal); }, [cook.meal]);

  /**
   * Undo takes the record with it.
   *
   * Reviewer's call, and the honest one: an accidental tap should not leave a
   * permanent event, and a rating attached to a meal that never happened is
   * worse than no rating. What it does NOT reverse is the pantry — "Made it"
   * confirms you had those ingredients (DECISIONS §5), and nothing records which
   * rows it created versus which were already there, so removing them could
   * delete something the user added by hand. The confirmation says so.
   */
  const undo = () =>
    confirm({
      question: `Remove the ${cook.meal ?? "cook"} recorded for ${dateLabel}?`,
      detail: "Its rating and note go with it. Ingredients it added to your pantry " +
              "stay. Remove those from the pantry if you want them gone.",
      confirmLabel: "Remove it",
    }, () => run(() => onUndo(cook.id)));

  const pick = (m: string) => {
    // Tapping the chosen slot again clears it, so a mis-tap is undoable without
    // a second control.
    const next = meal === m ? "" : m;
    setMeal(next || undefined);
    run(() => onRate(cook.id, { meal: next }));
  };

  const rate = (n: number) => {
    setRating(n);
    run(() => onRate(cook.id, { rating: n }));
  };

  /* What the row says when it is closed: everything that was recorded, in one
     line, so "edit" is a decision rather than a way to find out. */
  if (!editing) {
    return (
      <div className="cookrow cookrow-shut">
        <span className="cookrow-said">
          <b>{meal ?? "cooked"}</b>
          {rating !== undefined && <span className="cookrow-stars">{"★".repeat(rating)}</span>}
          {noteDraft && <span className="note cookrow-note">{noteDraft}</span>}
        </span>
        <span className="cookrow-acts">
          <Button kind="quiet" onClick={() => setEditing(true)}>Edit</Button>
          <Button kind="quiet" disabled={pending} onClick={undo}>delete</Button>
        </span>
        {dialog}
      </div>
    );
  }

  return (
    <div className="cookrow">
      <div className="meals" role="group" aria-label="Which meal">
        {meals.map((m) => (
          <button key={m} type="button" className={m === meal ? "mealchip on" : "mealchip"}
                  aria-pressed={m === meal} disabled={pending} onClick={() => pick(m)}>
            {m}
          </button>
        ))}
        <span className="cookrow-undo">
          <Button kind="quiet" onClick={() => setEditing(false)}>Done</Button>
          <Button kind="quiet" disabled={pending} onClick={undo}>delete</Button>
        </span>
      </div>

      {/* Rating is on the EVENT (RECIPE-SPEC §4) — "it was better the second
          time" is a normal thing to be true, and this rates THIS cooking. */}
      <div className="stars" role="group" aria-label={`Rate the ${meal ?? "cook"} on ${dateLabel}`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" className={n <= (rating ?? 0) ? "star on" : "star"}
                  aria-label={`${n} of 5`} aria-pressed={n === rating}
                  disabled={pending} onClick={() => rate(n)}>★</button>
        ))}
        {rating === undefined && <span className="note"> not rated</span>}
      </div>

      <label className="field">
        <span className="field-label">How did it go?</span>
        <textarea value={noteDraft} rows={2}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  onBlur={() => noteDraft !== (cook.note ?? "") &&
                                run(() => onRate(cook.id, { note: noteDraft }))} />
      </label>

      {dialog}
    </div>
  );
}

/**
 * "Run out of anything?" — the pantry's only way to shrink.
 *
 * Every cook marks its whole ingredient list present and nothing ever reverses
 * that, so the pantry ratchets upward until "Cook tonight" is badging things
 * "have everything" that you cannot cook. The correction has to be asked at the
 * one moment the user actually knows the answer, which is now: they have just
 * cooked and just put the packets away.
 *
 * Three rules it inherits from the block it sits in:
 *
 *   - **"still have" is the default and writes nothing.** Ignoring the whole
 *     panel costs nothing, exactly like the meal slot and the rating above it.
 *     The question is never in front of the cook — it is always behind it.
 *   - **One tap per row**, on one target. It was drafted as a three-way
 *     (still have / use soon / ran out) and cut back to two, because this is
 *     the third thing asked after a cook and every extra choice is paid for
 *     by everyone who did not want to answer.
 *   - **Nothing reaches the grocery list.** Running out is not the same act as
 *     deciding to shop, and UX-SPEC §4b is explicit that nothing lands on the
 *     list unreviewed. The line under the rows offers it; it does not do it.
 */
function Settle({ cook, pending, search, onSettle, run }: {
  cook: DatedCook;
  pending: boolean;
  search: (q: string) => Promise<Hit[]>;
  onSettle: (cookId: string,
             patch: { ranOut?: string[]; alsoUsed?: Array<{ id: string; insteadOf?: string }> })
    => Promise<ActionResult>;
  run: (fn: () => Promise<ActionResult>, then?: () => void) => void;
}) {
  const used = cook.used ?? [];
  /**
   * "Still have" for everything, until the user says otherwise.
   *
   * This briefly defaulted the main ingredients to "used up", on the argument
   * that cooking a bulgogi consumes the beef and leaves the soy sauce. Reverted
   * on the reviewer's call, and the reason is sound: the panel's contract is
   * that ignoring it costs nothing, and a default that WRITES is not ignorable
   * — it drains a pantry for someone who never looked. Being usually right is
   * not the same as being safe to assume, and the pantry is the one thing in
   * this product that must not be quietly wrong.
   *
   * The guess is not wasted: `mainsOf` still orders the recipe modal, where
   * being wrong costs a row's position rather than an ingredient.
   */
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  /** Extra ingredients added here, with the requirement each stood in for. */
  const [extra, setExtra] = useState<Array<{ id: string; name: string; insteadOf?: string }>>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => { setGone(new Set()); }, [cook.id]);

  const setRanOut = (id: string, out: boolean) => {
    setGone((s) => {
      const next = new Set(s);
      if (out) next.add(id); else next.delete(id);
      return next;
    });
    // Flipping back is a real correction, not just a UI undo — the row goes
    // back into the pantry.
    run(() => onSettle(cook.id, out ? { ranOut: [id] } : { alsoUsed: [{ id }] }));
  };

  const addExtra = (h: Hit) => {
    if (!extra.some((e) => e.id === h.id)) setExtra([...extra, { id: h.id, name: h.name }]);
    setQ(""); setHits([]); setAdding(false);
    run(() => onSettle(cook.id, { alsoUsed: [{ id: h.id }] }));
  };

  /** Attach (or clear) the requirement an extra ingredient stood in for. */
  const setInsteadOf = (id: string, wanted: string) => {
    setExtra(extra.map((e) => e.id === id ? { ...e, ...(wanted ? { insteadOf: wanted } : {}) } : e));
    if (wanted) run(() => onSettle(cook.id, { alsoUsed: [{ id, insteadOf: wanted }] }));
  };

  if (!used.length && !extra.length && !adding) {
    return (
      <p className="cook-line">
        <Button kind="quiet" onClick={() => setAdding(true)}>Used anything up?</Button>
      </p>
    );
  }

  return (
    <div className="settle">
      {/* "Used up", not "ran out". Running out is something that happens to
    you between shops; using something up is what cooking DID, which
    is the thing being reported and the thing the pantry needs to
    hear. It also matches the button under it word for word. */}
      <p className="field-label">Used anything up?</p>
      <ul className="settle-list">
        {used.map((u) => {
          const out = gone.has(u.id);
          return (
            <li key={u.id}>
              <span className="settle-name">{u.name}</span>
              <span className="settle-choice" role="group" aria-label={u.name}>
                <button type="button" className={out ? "settle-btn" : "settle-btn on"}
                        aria-pressed={!out} disabled={pending}
                        onClick={() => setRanOut(u.id, false)}>Still have</button>
                <button type="button" className={out ? "settle-btn on" : "settle-btn"}
                        aria-pressed={out} disabled={pending}
                        onClick={() => setRanOut(u.id, true)}>Used up</button>
              </span>
            </li>
          );
        })}

        {/* Things the recipe never listed: our parse missed a line, or the cook
            improvised. Either way it is in the kitchen and the pantry should
            know. */}
        {extra.map((e) => (
          <li key={e.id}>
            <span className="settle-name">{e.name}</span>
            {cook.wanted?.length ? (
              <select className="settle-instead" value={e.insteadOf ?? ""}
                      onChange={(ev) => setInsteadOf(e.id, ev.target.value)}>
                <option value="">used as well</option>
                {cook.wanted.map((w) => (
                  <option key={w.id} value={w.id}>instead of {w.name}</option>
                ))}
              </select>
            ) : <span className="note">used as well</span>}
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="search">
          <input value={q} autoFocus placeholder="something else you used…"
                 onChange={(e) => {
                   const v = e.target.value;
                   setQ(v);
                   void search(v).then(setHits).catch(() => { /* typing is not the moment */ });
                 }} />
          <Button kind="quiet" onClick={() => { setAdding(false); setQ(""); setHits([]); }}>
            cancel
          </Button>
        </div>
      ) : (
        <p className="cook-line">
          <Button kind="quiet" onClick={() => setAdding(true)}>+ Something else</Button>
        </p>
      )}

      {hits.length > 0 && (
        <ul className="hits">
          {hits.slice(0, 6).map((h) => (
            <li key={h.id}>
              <button type="button" className="hit" onClick={() => addExtra(h)}>
                <span className="hit-name">{h.name}</span>
                {h.via && <span className="hit-via">«<b>{h.via}</b>»</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {gone.size > 0 && (
        <p className="note">
          Taken out of your pantry.
        </p>
      )}
    </div>
  );
}
