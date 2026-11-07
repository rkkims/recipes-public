"use client";

/**
 * "Your tap landed" — the smallest possible client island inside a `Link`.
 *
 * ── Why this is its own file ───────────────────────────────────────────────
 *
 * `useLinkStatus` is a hook, so whatever calls it must be a client component,
 * and it only reports anything when rendered INSIDE the `Link` whose navigation
 * it is describing. The obvious move — mark the whole bar `"use client"` — does
 * not work here: `CuisineBar` takes `href` as a FUNCTION, so the page can own
 * its other query parameters, and a function cannot cross the server/client
 * boundary as a prop. Making the bar a client component turned a working filter
 * into a 500.
 *
 * So the boundary goes here instead, one span deep. The bar stays a server
 * component, `Link` is happy to be rendered by one, and only this leaf ships.
 *
 * ── Why it exists at all ───────────────────────────────────────────────────
 *
 * The server answers a cuisine switch in 35–115ms; the wait is the client
 * re-rendering a grid that can hold hundreds of cards. Until that lands nothing
 * on screen has acknowledged the tap, so the control goes on looking exactly as
 * it did — and a control that looks untouched gets tapped again. That is how a
 * third of a second becomes a second and a half. Nothing here makes the
 * navigation faster; it makes it visible, which is the part that was missing.
 */
import { useLinkStatus } from "next/link";

export function LinkPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  /* In the flow of the label rather than over it, so the control keeps its size
     and the row cannot reflow under a finger that is still on it. */
  return <span className="mealchip-wait" aria-hidden="true" />;
}
