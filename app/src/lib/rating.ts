/**
 * The SOURCE's rating, out of five — or nothing.
 *
 * Ratings are scraped from other people's pages, and two of the 3,932 we hold
 * came back as `27` and `28` — a review COUNT that landed in the rating field.
 * Rendered, they read `★28.0`; ranked, they sorted to the very top of the
 * "Popular" shelf, which is the first thing a visitor with no pantry sees. Two
 * bad rows out of four thousand were the product's first impression.
 *
 * So the range is enforced at the point of use rather than trusted from the
 * corpus. A value we cannot believe becomes `undefined`, which every call site
 * already handles — the rating is optional everywhere, because most sources
 * publish none. Showing nothing is the honest answer to "we do not know what
 * this number is", and it is the same rule `RECIPE-SPEC` §4a applies to times.
 *
 * NOT clamped to 5. Clamping would turn a count into a perfect score and put
 * the same two recipes back at the top of Popular wearing a plausible number,
 * which is worse than the bug: wrong and no longer visible.
 */
export function sourceRating(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 5
    ? value
    : undefined;
}
