import Link from "next/link";
import { openRecipeHref } from "@/lib/static-mode";

/**
 * "These stopped waiting" — the return arc of UX-SPEC §4a.
 *
 * §4a says the list and the calendar are one fact and can be read from either
 * end, and only one end was built: the calendar filled the list. Nothing ever
 * came back. So the payoff for keeping a list — the meals you can now actually
 * cook — arrived nowhere, and the moment it would have meant the most is the
 * moment you have just carried the shopping in.
 *
 * ── Computed, never stored, and never a notification ──────────────────────
 *
 * This is not "what you just bought". It is the standing answer to *which
 * upcoming plans are fully covered right now*, which happens to change when you
 * shop and also changes when you cook something else, when a recipe's parse
 * improves, or when you tick something off by hand. Storing "unlocked by this
 * shop" would be a fact with an expiry date; recomputing it is free and cannot
 * go stale.
 *
 * It sits on the grocery list because that is where the user is standing when
 * the answer changes. The calendar says the same thing on its own squares
 * ("have all"), but the calendar is a page you would have to think to visit.
 */
export function ReadyToCook({ ready }: {
  ready: Array<{ id: string; recipeId: string; title: string; when: string }>;
}) {
  if (ready.length === 0) return null;

  return (
    <section className="ready">
      <p className="ready-lead">
        Ready to cook{ready.length > 1 && <> · {ready.length}</>}
      </p>
      <ul className="ready-list">
        {ready.map((r) => (
          <li key={r.id}>
            {/* Straight into the modal, bound to the day it is planned for —
                the same `?recipe=&date=` the calendar and the grid open. */}
            <Link href={openRecipeHref(r.recipeId, `/?recipe=${r.recipeId}`)} scroll={false}>{r.title}</Link>
            <span className="note ready-when">{r.when}</span>
          </li>
        ))}
      </ul>
      {/* No "well done". It states a fact and gets out of the way — the reward
          is the list of dinners, not a message about the list of dinners. */}
    </section>
  );
}
