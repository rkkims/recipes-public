/**
 * The summary view of a recipe — RECIPE-SPEC §6 and §9.
 *
 * Reachable from any date-bound modal, and it is the answer to a different
 * question than the one the date asks. The date asks "did I cook this on the
 * 6th"; this asks "how has this dish gone for me, ever".
 *
 * **Computed, never stored** (§6): *"Compute it. Do not model it."* Every number
 * here is a count or an extreme over a handful of cook events. A stored summary
 * would buy nothing and would drift out of sync with the log beneath it.
 *
 * ── Two columns, one of them empty ─────────────────────────────────────────
 *
 * `community` is rendered as a labelled, explicitly empty panel rather than
 * omitted. RECIPE-SPEC §9 specifies what goes there — `recipe_substitution`,
 * `recipe_skip`, `recipe_comment`, other people's ratings and swaps — and none
 * of it exists yet. Declaring the slot does two things:
 *
 *   - adding §9 later is filling a hole, not reshaping this panel and every
 *     caller that feeds it
 *   - it keeps the numbers honest NOW. "Yours" is labelled as yours, so an
 *     average over three of your own cooks can never be read as what everyone
 *     thinks — which is exactly how a 5★ from one person becomes a rating.
 *
 * §9's publishing floor (`n_users >= k`) is a property of the DATA and belongs
 * where the aggregate is computed, never here. A template that filters is a
 * template the next feature forgets to copy.
 */
import Link from "next/link";
import type { RecipeSummary } from "@/lib/store";
import { dayLabel } from "@/lib/day";

export function Summary({ summary, nameOf, backHref }: {
  summary: RecipeSummary;
  nameOf: (id: string) => string;
  /** Back to the date-bound view this was opened from. */
  backHref: string;
}) {
  const { mine, community } = summary;

  return (
    <section className="summary">
      <p className="summary-back">
        <Link href={backHref} scroll={false}>← back</Link>
      </p>

      <h3 className="myversion-title">Yours</h3>

      {mine.cooks === 0 ? (
        <p className="note">You haven’t cooked this yet.</p>
      ) : (
        <>
          <p className="summary-head">
            {/* An average over a handful of cooks is a weak number, so it says
                how many it is over rather than standing alone. */}
            {mine.rating !== null
              ? <><b className="summary-rating">{mine.rating.toFixed(1)}</b>
                  <span className="note"> average over {mine.rated} rated
                    {mine.rated === 1 ? " cook" : " cooks"}</span></>
              : <span className="note">No ratings yet</span>}
          </p>
          <p className="note">
            Cooked <b>{mine.cooks}×</b>
            {mine.first && <> · first {dayLabel(mine.first)}</>}
            {mine.last && <> · last {dayLabel(mine.last)}</>}
          </p>

          {mine.substitutions.length > 0 && (
            <>
              <h4 className="modal-h3">What you swapped</h4>
              <ul className="summary-list">
                {mine.substitutions.map((s) => (
                  <li key={`${s.wanted}-${s.used}`}>
                    <b>{nameOf(s.used)}</b> for {nameOf(s.wanted)}
                    {s.times > 1 && <span className="note"> · {s.times}×</span>}
                  </li>
                ))}
              </ul>
            </>
          )}

          {mine.skips.length > 0 && (
            <>
              <h4 className="modal-h3">What you left out</h4>
              <ul className="summary-list">
                {mine.skips.map((s) => (
                  <li key={s.ingredient}>
                    {nameOf(s.ingredient)}
                    {s.times > 1 && <span className="note"> · {s.times}×</span>}
                  </li>
                ))}
              </ul>
            </>
          )}

          <h4 className="modal-h3">Every cook</h4>
          <ul className="summary-list">
            {mine.events.map((e) => (
              <li key={e.id}>
                {dayLabel(e.cooked_at)}
                {e.rating !== undefined && <span className="stars-inline"> {"★".repeat(e.rating)}</span>}
                {e.substituted.length > 0 && (
                  <span className="note">
                    {" "}· used {e.substituted.map((s) => nameOf(s.used)).join(", ")}
                  </span>
                )}
                {e.skipped.length > 0 && (
                  <span className="note">
                    {" "}· skipped {e.skipped.map(nameOf).join(", ")}
                  </span>
                )}
                {e.note && <div className="history-note">“{e.note}”</div>}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* RECIPE-SPEC §9. Empty and SAID to be empty — "we have nothing" is a
          different claim from "nobody did anything", and only one of them is
          true. */}
      <h3 className="myversion-title">Everyone else</h3>
      {community === null ? (
        <p className="note">
          Other cooks’ notes will appear here. Nothing above is anyone’s but yours.
        </p>
      ) : null}
    </section>
  );
}
