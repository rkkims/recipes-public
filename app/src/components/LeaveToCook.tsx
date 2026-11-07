"use client";

/**
 * The way out — UX-SPEC §5's one untaxed tap, plus a note to self.
 *
 * `RecipeDetail` is a server component, so the anchor cannot carry a handler
 * there. This is the smallest possible client island around it: the same link,
 * the same markup, plus one `localStorage` write on the way through.
 *
 * The write cannot fail the navigation — `markLeftToCook` swallows everything,
 * and nothing is awaited. If the marker does not land, the user simply is not
 * asked about the cook when they come back, which is exactly the behaviour that
 * existed before this file.
 */
import { markLeftToCook } from "@/lib/cooking";

export function LeaveToCook({ recipeId, url }: {
  recipeId: string;
  url: string;
}) {
  return (
    /* CREATOR-SPEC SS5a's earned table: dofollow on a creator-ADDED link is
       earned, never granted - the abuse payoff grows on the same curve as the
       SEO strategy. Crawled sources keep dofollow; their catalogue is the
       evidence, and the canonical already points at them. */
    <a className="btn btn-primary" href={url} target="_blank"
       rel={recipeId.startsWith("rec_c") ? "noreferrer nofollow" : "noreferrer"}
       onClick={() => markLeftToCook(recipeId)}>
      View full recipe →
      {/* The return trip, named inside the button rather than under it — it is
          read as part of deciding to press, not as a caption to a control the
          eye has already left. */}
      <span className="btn-sub">Come back to update your pantry.</span>
    </a>
  );
}
