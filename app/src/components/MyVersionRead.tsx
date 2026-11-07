"use client";

/**
 * "My version", the half you READ — UX-SPEC §5 and §8.
 *
 * *"What this user substituted last time and how it went. The single strongest
 * reason to open our modal rather than search the blog again."*
 *
 * ── Why this is a separate component from the recording block ──────────────
 *
 * They are two moments, and the modal's order is a timeline. What you did last
 * time is an INPUT to the decision — you read "too salty, halve the gochujang"
 * and it changes how you cook tonight — so it has to arrive before the way out.
 * What you did THIS time is a record, and it cannot be written until you have
 * cooked, so it belongs after.
 *
 * Merged, they pushed the exit 1,196px down an 844px modal: every repeat cook
 * scrolled past a rating form for a meal they had not made yet in order to reach
 * the tap that §5 says "must not be taxed". The two rules in §5 — *the exit is
 * last* and *the exit is never taxed* — only conflict while the recording block
 * sits above it. Split, both hold.
 *
 * ── The standing note is gone from this screen at v1 ──────────────────────
 *
 * It used to live here — "what you always do differently", advice to read
 * before cooking rather than a thing this evening produced, which is why it
 * belonged with the reading half and not the recording one. It was still a
 * second writing surface inside a modal whose whole argument is that the exit
 * must not be taxed, and it asked for advice most cooks have not formed yet.
 *
 * `setNote` in `app/actions` and the stored `note` field both remain, so
 * nothing anyone wrote is lost and restoring the field is re-adding markup
 * rather than rebuilding a feature.
 *
 * ── So is the link to the full summary ────────────────────────────────────
 *
 * "all cooks & substitutions →" is off at v1 too. The one line above it already
 * carries what a cook standing in a kitchen wants — how many times, how long
 * ago, what they scored it — and the summary behind it is a page for a history
 * that barely exists yet.
 *
 * `Summary` and the `?view=summary` branch in each page are untouched, so the
 * view still renders for anyone who types the URL. Unlisted, exactly like
 * `/my-recipes` and `/calendar` — see `lib/surface`.
 */
import { dayLabel } from "@/lib/day";
import type { ReactNode } from "react";

/**
 * How many times, in words — "3×" is a measurement, not an answer.
 *
 * This line is read while deciding whether to cook something again, and at
 * that moment the difference between four and five is nothing: what matters is
 * new / once / twice / a habit. A numeral invites arithmetic where the reader
 * wanted a shape, and it is the same reason the card beside it now says "made
 * before" rather than carrying the tally into a grid.
 *
 * The full count is not lost — the cook log holds every event, and `/my-recipes`
 * is where a real history belongs.
 */
function timesCooked(n: number): string {
  if (n === 1) return "once";
  if (n === 2) return "twice";
  /* Six and up gets its own word. "Several times" for something cooked twenty
     times understates it into meaninglessness, which is the failure this
     function exists to avoid. */
  return n <= 5 ? "several times" : "many times";
}

export function MyVersionRead({ cooks, last, edit, standing }: {
  /** Total cooks of this recipe, all time. */
  cooks: number;
  /** The most recent cook overall. Never date-bound — see below. */
  last?: { at: string; rating?: number; note?: string };
  /**
   * The amend control, rendered into the history line.
   *
   * Passed in rather than built here because this is a server component and
   * editing needs client state — and because "Cooked twice" is a sentence, so
   * the way to change it belongs at the end of that sentence rather than as a
   * separate control claiming to be about the same thing.
   */
  edit?: ReactNode;
  /**
   * Their standing note on the dish, read-only — restored 2026-08, exactly
   * as the v1 note below promised ("re-adding markup rather than rebuilding
   * a feature"), because the request queue's transfer now lands a user's own
   * words here: a pasted copy that becomes a curated recipe carries its note
   * and steps into this field, and words nobody can see read as words lost.
   * Read-only keeps the v1 argument intact - the exit stays untaxed, no
   * second writing surface, nothing rendered unless they wrote something.
   */
  standing?: string;
}) {
  return (
    <section className="myversion">
      {/* "My cooking history", not "My version".

          "My version" was about the RECIPE — your substitutions, your standing
          note, the way you make it differently. Both of those left this block
          (the note went at v1, the substitutions live behind the summary), so
          what is left is a record of when you cooked it and how it went. The
          heading now names that rather than the thing it used to sit above. */}
      <h3 className="myversion-title">My cooking history</h3>

      {/* Never date-bound: binding it to today would blank it for every recipe
          you last cooked in July, which is most of them. */}
      {cooks === 0 ? (
        <p className="note">You haven’t cooked this yet.</p>
      ) : (
        <p className="note history-line">
          Cooked <b>{timesCooked(cooks)}</b>
          {last && <> · last {dayLabel(last.at)}</>}
          {last?.rating !== undefined && <> · {"★".repeat(last.rating)}</>}
          {edit}
        </p>
      )}
      {last?.note && <p className="note history-note">“{last.note}”</p>}
      {standing && <p className="note standing-note">{standing}</p>}
    </section>
  );
}
