/**
 * Whether this owner is a signed-in user — the one place that decides.
 *
 * ── There are no accounts yet, and this returns false ─────────────────────
 *
 * USER-SPEC §3 and Phase A: one owner per browser, keyed by a cookie, no auth
 * and no database. So today this is always `false`, and it exists so that the
 * gate has a single switch rather than a dozen call sites each inventing their
 * own guess. When auth lands, this reads the session and everything gated on it
 * opens at once.
 *
 * ── Why adding your own recipe is gated, when the pantry is not ───────────
 *
 * UX-SPEC §9 is emphatic that the product is anonymous-first, and it names
 * exactly three things that must never sit behind an account: *"never gate
 * matching, search, or the pantry"*. Recipes you type in are not on that list,
 * and the difference is real rather than convenient.
 *
 * A pantry is cheap to rebuild and expensive to gate — it is the argument FOR
 * signing up, so it has to exist first to make the argument (§9). A recipe you
 * entered by hand is the opposite: a link, a title, a dozen ingredients and a
 * method, none of which we can reconstruct if the cookie goes. Letting someone
 * spend ten minutes on that with nowhere for it to live is the failure this
 * gate prevents, not an upsell.
 */
import type { Owner } from "./store";

/**
 * Now answered from the OWNER rather than hard-wired false.
 *
 * `owner.email` is set by `createUser` and by nothing else, so it means
 * exactly "this kitchen has an account attached". That is the right question
 * for the thing this gates — whether a recipe typed in by hand has somewhere
 * durable to live — and it is answerable without a request, which the batch
 * job in `lib/pool.ts` needs and a cookie could never give it.
 *
 * It is NOT "is this request signed in". That is `currentUser()` in
 * `lib/owner`, and the difference still matters: a session resolves to an
 * owner, so anything reading the owner is already looking at the right
 * kitchen by the time it gets here.
 */
export function signedIn(owner: Owner | null): boolean {
  /* `account_at` is the marker since ids landed (CREATORS-TAB-SPEC §6);
     `email` still answers for every account from before it existed. */
  return !!owner?.account_at || !!owner?.email;
}
