/*
 * The share card, as an ordinary route — the static build's only way to keep it.
 *
 * `opengraph-image.tsx` is a METADATA route, and metadata routes are discovered
 * by their filename against `pageExtensions`. Static mode narrows that list to
 * `static.tsx` (which is what makes the route allowlist mechanical, see
 * `page.static.tsx`), and Turbopack's metadata pipeline only ever compiles
 * `.js/.jsx/.ts/.tsx` — so a `opengraph-image.static.tsx` shim is discovered and
 * then cannot be built. That is a dead end, not a bug to work around.
 *
 * So the same drawing is served from a plain route handler instead, and
 * `layout.tsx` names it explicitly in static mode. Not a copy: it calls the
 * metadata route's own default export, so the card is the same file's output in
 * both modes and cannot drift.
 *
 * Inert in server mode — the basename is `route.static`, which Next only
 * recognises when `pageExtensions` says `static.tsx`.
 */
import OpengraphImage from "../opengraph-image";

/** Prerendered to a file: nothing about the card depends on the request. */
export const dynamic = "force-static";

export function GET() {
  return OpengraphImage();
}
