/**
 * Which cuisine the grid is showing — RECIPE-SPEC §4a.
 *
 * `cuisine` has been inferred and stored for every recipe since the corpus was
 * built, and until now nothing read it. 2,166 Korean, 1,129 Chinese, 352
 * Japanese — a real split that the user could not act on, so a Korean-first app
 * showed a Chinese stir-fry between two banchan and offered no way to say
 * "not tonight".
 *
 * ── A link, not a control ─────────────────────────────────────────────────
 *
 * The same reasoning as `?recipe=` (UX-SPEC §5) and `?days=`: the back button
 * undoes the filter, a reload keeps it, a shared link carries it, and the
 * filtering happens on the server where the ranking already is. Component state
 * would put a filter on the grid that the back button walks out of the page to
 * escape.
 *
 * ── Why counts are not shown ──────────────────────────────────────────────
 *
 * A count here would be the count of the CORPUS, not of what you can cook —
 * "Chinese 1,129" next to a tab reading "Can cook now 8" invites the reading
 * that 1,129 Chinese dinners are available. The tab counts already say how much
 * is really there, and they update when this changes.
 *
 * ── `unresolved` is not offered ───────────────────────────────────────────
 *
 * A thousand recipes abstain (§4a: "abstain rather than default"), and they are
 * correctly in every unfiltered view. But "unresolved" is our word for our own
 * uncertainty, and putting it in a row of cuisines asks the user to care about
 * the state of our classifier. They stay visible in "All" and nowhere else.
 * ── Why it FEELS slow, and what actually fixes it ─────────────────────────
 *
 * The server answers a cuisine switch in 35–115ms. The wait is on the client:
 * the payload arrives and React re-renders a grid that can hold hundreds of
 * cards, and until it lands nothing on screen has acknowledged the tap. A
 * control that goes on looking exactly as it did gets tapped again, which is
 * how a third of a second turns into a second and a half.
 *
 * So the chip says it heard you, via `LinkPending` — which is a separate file
 * for a reason worth reading before merging it back in. Nothing about the
 * navigation changes; the feedback is the fix.
 */
import Link from "next/link";
import { LinkPending } from "./LinkPending";

export const CUISINES = ["korean", "chinese", "japanese", "thai", "vietnamese", "filipino"];

/**
 * The tab for dishes whose cuisine is KNOWN and simply not one of the six —
 * indonesian, malaysian, the western bakes the curators kept with honest
 * labels. Distinct from `unresolved`, which stays out of the bar for the
 * reason above: "others" is a fact about the dish, "unresolved" is a fact
 * about our classifier.
 */
export const OTHERS = "others";

export function CuisineBar({ chosen, href }: {
  /** The cuisine being shown, or undefined for all of them. */
  chosen?: string;
  /** Builds the link for a cuisine — the page owns its other parameters. */
  href: (cuisine?: string) => string;
}) {
  return (
    <div className="cuisinebar" role="group" aria-label="Cuisine">
      <Chip href={href()} label="All" on={!chosen} />
      {CUISINES.map((c) => (
        <Chip key={c} href={href(c)} label={c} on={c === chosen} />
      ))}
      <Chip href={href(OTHERS)} label="others" on={chosen === OTHERS} />
    </div>
  );
}

/** One cuisine, and whether the tap has landed yet — see `LinkPending`. */
function Chip({ href, label, on }: { href: string; label: string; on: boolean }) {
  return (
    <Link className={on ? "mealchip on" : "mealchip"}
          aria-current={on ? "true" : undefined}
          href={href} scroll={false}>
      <LinkPending />
      {label}
    </Link>
  );
}

