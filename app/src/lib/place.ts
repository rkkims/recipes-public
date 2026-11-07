/**
 * Which PLACE a URL belongs to — the tab bar's own idea of where you are.
 *
 * It lived inside `Nav`, which is the only thing that needed it while the only
 * consumer was the lit tab and the return memory. `BackLink` needs the same
 * answer to a different question — "would going back leave this tab?" — and two
 * copies of this would drift the day a place is added. So it is one function,
 * here, and `Nav` imports it.
 *
 * Not exported from `Nav` itself: the legal pages carry a Back and no nav at
 * all, and importing `Nav` for one predicate would pull the whole tab bar, its
 * icons and its router wiring into those bundles.
 */

/**
 * The places, in the tab bar's order. Hrefs only — the labels and icons stay
 * with the component that draws them.
 *
 * Kept complete rather than filtered by what this build shows (`lib/surface`
 * decides that): a page under a hidden place is still IN that place, and back
 * must not treat it as homeless.
 */
export const PLACE_HREFS = ["/", "/creators", "/my-recipes", "/calendar", "/list"];

/**
 * Exact matching everywhere except Creators: `/` is a prefix of everything, so
 * `startsWith` on it would light every place at once — but a creator's profile
 * at `/creators/maangchi` IS the Creators tab showing someone, and the tab
 * staying lit is what tells you where you are (CREATORS-TAB-SPEC §1, §3).
 *
 * `null` for everything else — a recipe, the policy, sign-in — which is the
 * honest answer: those pages are not a tab, they are things you opened.
 */
export function placeOf(path: string): string | null {
  if (path === "/creators" || path.startsWith("/creators/")) return "/creators";
  return PLACE_HREFS.includes(path) ? path : null;
}
