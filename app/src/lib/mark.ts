/**
 * The brand mark — a bowl of rice, drawn once.
 *
 * It lives here rather than in any one surface because it is drawn in three
 * places at three sizes (the home-screen icon, the link-preview card, the nav)
 * and a mark that is copied is a mark that drifts. Same argument as
 * `icons/[size]`: one definition, several renderings.
 *
 * ── Why it is stroke-only ──────────────────────────────────────────────────
 *
 * Nothing here is filled. That is the whole design, and it has one consequence
 * worth stating because it looks like an omission: `RIM` is only the FRONT arc
 * of the bowl's rim, not the full ellipse. Reference art of a rice bowl fills
 * the rice white, which hides the rim's far edge behind it. With no fill
 * nothing can hide anything, so a full ellipse would draw a line straight
 * through the mound. The mound's base lands on the front arc's ends instead,
 * and no line crosses another anywhere in the mark.
 *
 * ── Why the stroke width is a function and not a constant ──────────────────
 *
 * The eight scallops are what make the mound read as rice rather than as a
 * dome, and a dome at this position reads as an eye. Scallops survive only
 * while the stroke is thin relative to them: at 2.1 — the weight the nav's
 * icons use — the gaps close and the mound becomes a blob. But a 0.9 stroke on
 * a 32px favicon lands under one pixel and washes out. So weight rises as the
 * mark shrinks, and the detail drops to `RICE_SIMPLE` at the size where eight
 * scallops could not survive anyway.
 */

/** Eight scallops, on a circle of radius 6.6 about (12, 11.5). */
export const RICE =
  "M5.4 11.5 Q4.25 9.96 5.9 8.97 Q5.43 7.11 7.33 6.83 Q7.61 4.93 9.47 5.4 " +
  "Q10.46 3.75 12 4.9 Q13.54 3.75 14.53 5.4 Q16.39 4.93 16.67 6.83 " +
  "Q18.57 7.11 18.1 8.97 Q19.75 9.96 18.6 11.5";

/** Five, for sizes where eight would merge into one lump. */
export const RICE_SIMPLE =
  "M5.4 11.5 Q4.0 8.6 7.0 7.2 Q7.8 4.4 10.4 5.2 Q12 3.4 13.6 5.2 " +
  "Q16.2 4.4 17.0 7.2 Q20.0 8.6 18.6 11.5";

/** The front of the rim only — see the note above. */
export const RIM = "M3.4 11.0 Q12 13.8 20.6 11.0";

export const BOWL =
  "M3.4 11.0 C4.0 17.0, 7.6 20.3, 12 20.3 C16.4 20.3, 20.0 17.0, 20.6 11.0";

/** The footed base. First detail to go when the mark gets small. */
export const FOOT = "M9.6 20.3 L9.6 21.7 Q12 22.4 14.4 21.7 L14.4 20.3";

/**
 * Stroke width for a mark rendered `px` wide, in the 24-unit coordinate space.
 *
 * 0.9 is the drawn weight and the floor is the legibility one: below roughly
 * 1.5 device pixels a stroke greys out rather than thins, so `36 / px` holds
 * the rendered line at that thickness once 0.9 would fall under it.
 */
export function markStroke(px: number): number {
  return Math.max(0.9, 36 / px);
}

/**
 * The paths to draw for a mark rendered `px` wide, most detailed first.
 *
 * Under 64px the foot closes up against the bowl and the eight scallops merge,
 * so both step down together — one threshold rather than two, because they
 * fail at the same place.
 */
export function markPaths(px: number): string[] {
  return px >= 64 ? [RICE, RIM, BOWL, FOOT] : [RICE_SIMPLE, RIM, BOWL];
}
