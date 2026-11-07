/**
 * What v1 puts in front of a user — LAUNCH-V1 §1.
 *
 * v1 exists to be dogfooded and to be reviewable by an affiliate programme.
 * `/calendar` is not ready for either: it is a weekly planning surface that has
 * never been used for a real week, and nothing else depends on a user reaching
 * it.
 *
 * ── `/my-recipes` came back ────────────────────────────────────────────────
 *
 * It was hidden on the grounds that its add-a-recipe half is account-gated and
 * therefore dark. That was the wrong half to reason from. The page has two other
 * shelves — **Cooked** and **Saved** — and neither needs an account, because
 * both are computed from state a cookie already holds.
 *
 * Hiding it made the heart a write into a room nobody can open: you save a
 * recipe on Tuesday and hunt for it again on Thursday. UX-SPEC §8 calls the
 * cook record "the one thing a user gets here that they cannot get anywhere
 * else", and it was reachable only by URL. Every persona who comes BACK — which
 * is every persona that matters — was paying for a decision made about the one
 * part of the page that is switched off anyway.
 *
 * The add and import controls stay dark on their own terms (`lib/account`), so
 * nothing here re-opens what the account gate closed.
 *
 * ── Hidden, not deleted, and the difference is load-bearing ────────────────
 *
 * `/list` READS the plan. `app/list/page.tsx` builds its "for your meal plan"
 * shelf from `upcomingPlans`, and every row's provenance — *"gochujang — Korean
 * Fried Chicken, Thu"* — is the calendar join UX-SPEC §4a calls one fact. Delete
 * the calendar and that code has to be torn out of the list too, then written
 * again for v2. So the pages stay live and stop being LISTED: no nav entry, no
 * manifest shortcut, no in-body link. A bookmark still works, which is what
 * "hide from surface" means and is also how the author reaches their own cook
 * log during dogfooding.
 *
 * The cost is that §4a goes untested through v1 — with no way to create a plan,
 * that shelf is permanently empty. Known, accepted, and written down here rather
 * than discovered at v2.
 *
 * ── Why a constant and not an environment variable ─────────────────────────
 *
 * Turning these back on at v2 should be a diff with a commit message explaining
 * what changed, not a server restart with a different env file that nobody can
 * later find the reason for.
 */

/** Places that exist and work, but that v1 does not advertise. */
/* `/recipe-requests` joined 2026-08: the board works, but a demand board with
   no demand on it pitches emptiness — the one framing UX-SPEC §11 forbids.
   The paste-flow capture keeps recording while it is dark, so the day it is
   listed it opens with real rows instead of an apology. Same deal as the
   calendar: live at the URL, linked from nowhere, noindex while unlisted. */
const HIDDEN = new Set(["/calendar", "/recipe-requests"]);

/** Does this destination get a nav entry, a shortcut, a link? */
export function listed(href: string): boolean {
  return !HIDDEN.has(href);
}

/**
 * "Add to plan", on the recipe modal.
 *
 * Off with the calendar, because it is the only thing that writes a plan and a
 * plan you cannot go and look at is a write into the dark.
 *
 * Its two neighbours on that button row stay:
 *
 *   - **"Made it"** is a PANTRY action (DECISIONS §5 — additive to the pantry),
 *     not a my-recipes feature. It is also the single most valuable dogfooding
 *     signal there is: pantry drain is the behaviour most likely to be wrong,
 *     and this is the tap that drives it. Its readback living on an unlisted
 *     page is fine — the write is the point.
 *   - **The heart** keeps saving into `/my-recipes`. Bookmarkable is enough for
 *     one user, and the saves accumulate for v2 instead of starting at zero.
 *
 * Read on every surface v1 SHOWS — which now includes `/my-recipes`, so its own
 * plan button goes with the rest. Only `/calendar` keeps one: it is behind the
 * unlisting, and stripping "Add to plan" from the calendar would break the one
 * page for the one person who can still reach it.
 *
 * Typed `boolean` rather than left as the literal `false`, so that flipping it
 * at v2 is a one-word change and not a cascade of narrowed types.
 */
export const PLAN_BUTTON: boolean = false;

/**
 * Bulk import from a TikTok archive — off at v1.
 *
 * Not because it is broken. Because it is the widest, least-supervised way into
 * the corpus and the one this product can least afford to be wrong about while
 * it is being dogfooded by one person: an archive drops dozens of links in at
 * once, each becoming an owned recipe with a title lifted from a caption. When
 * something looks wrong two weeks later there is no way to tell whether the
 * parser did it or the import did.
 *
 * `AddRecipe` stays, and it is the same job done one link at a time with the
 * confirmation step in front of it — which is exactly what SOCIAL-INGEST §2a
 * asks for and what the share target now feeds.
 *
 * Same shape as `PLAN_BUTTON`: typed `boolean` so turning it on at v2 is one
 * word rather than a cascade of narrowed types.
 */
export const TIKTOK_IMPORT: boolean = false;
