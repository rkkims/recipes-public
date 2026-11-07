/**
 * The one switch — STATIC-SPEC §1.
 *
 * `STATIC_MODE=1 npm run build-static` sets `output: "export"` and emits a
 * self-contained site with no Node process behind it. Everything that cannot
 * exist without a server is excluded by the route allowlist (the `*.static.tsx`
 * shims and `pageExtensions`) or answered from the device instead.
 *
 * This module is the runtime half of that decision, and it has to read the same
 * way on both sides of the RSC boundary — a server component deciding not to
 * pass a server action and a client component deciding to answer from the
 * bundle are two halves of one build's behaviour. So the value travels as
 * `NEXT_PUBLIC_STATIC_MODE`, which `next.config.mjs` sets from `STATIC_MODE`
 * and the bundler inlines as a literal. In server mode the comparison is
 * against an empty string, folds to `false` at build time, and every branch
 * below it is dead code the bundler drops: **server mode has no runtime cost
 * and no behavioural difference from this file.**
 */
export const STATIC = process.env.NEXT_PUBLIC_STATIC_MODE === "1";

/**
 * Where the `/go` Worker lives for THIS build — STATIC-SPEC §4.
 *
 * Empty is the answer for the finished state: after the cutover the Worker is
 * routed at `jipbap.com/go`, so a relative `/go?u=…` reaches it and the links
 * in a static page are the same strings the server route serves today.
 *
 * A preview deploy has no such route (publishing to workers.dev only is the
 * standing rule in both wrangler configs), so `GO_ORIGIN` names the Worker's
 * own origin and the links point straight at it. The Worker ignores the path
 * for exactly this reason: `…workers.dev/go` and `jipbap.com/go` are the same
 * request to it.
 */
export const GO_ORIGIN = process.env.NEXT_PUBLIC_GO_ORIGIN ?? "";

/**
 * Where the behavioural beacons post for THIS build — the API Worker's origin.
 *
 * The same rule `GO_ORIGIN` follows, for the same reason. Empty is the answer
 * for the finished state: the API Worker is routed at `jipbap.com/api/*` after
 * the cutover, so a relative `/api/events` reaches it and the beacons send the
 * identical string they send in server mode. A preview deploy on workers.dev
 * has no such route, so `API_ORIGIN` names the Worker's own origin.
 *
 * In SERVER mode this is empty and unread: `lib/beacon` only consults it on the
 * static branch, and the Next route at `/api/events` keeps handling the beacons
 * exactly as it does today.
 */
export const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";

/**
 * Where a recipe card points — the one navigation static mode has to move.
 *
 * `?recipe=` is a query parameter over whichever page you were on, and the
 * sheet it opens is rendered by that page's SERVER component: it needs the
 * relation closure around the recipe's ingredients, the corpus-frequency
 * mains, and the shop links, none of which a device holds (`lib/recipe-props`
 * says why). An exported page has no request and therefore no query, so the
 * modal cannot open — and a card that goes nowhere is the worst possible
 * failure on the surface the whole product is.
 *
 * So static mode sends the card to the recipe's own page, which is a real
 * prerendered file per kept recipe (§3) carrying exactly those four facts. The
 * cost is the modal's argument — you lose your place in the grid — and the back
 * button is what buys it back.
 *
 * A recipe the user added themselves has no page and must never have one: it
 * lives in one browser's blob and `/recipe/[id]` mints Open Graph cards. Those
 * go to the library, which draws them from the device.
 */
export function openRecipeHref(recipeId: string, modalHref: string): string {
  if (!STATIC) return modalHref;
  return recipeId.startsWith("rec_own_") ? "/my-recipes" : `/recipe/${recipeId}`;
}
