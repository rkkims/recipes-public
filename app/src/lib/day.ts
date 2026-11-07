/**
 * A calendar day, written so it cannot be read two ways.
 *
 * `toLocaleDateString()` with no options renders `8/7/2026`, which is August 7th
 * to an American reader and the 8th of July to most of the rest of the world.
 * The product had it in exactly the places where being wrong is expensive — the
 * date you last cooked something, the day a plan was filed under — while the
 * calendar two clicks away already wrote `Aug 3 – Aug 9`. So one of the two was
 * going to teach the user the wrong reading of the other.
 *
 * A short month NAME removes the ambiguity outright rather than picking a side:
 * there is no locale in which `Aug 7, 2026` and `7 Aug 2026` mean different
 * days. The locale is still left to the reader's browser (`undefined`), which is
 * what orders the parts — we are fixing the ambiguity, not overriding the
 * preference.
 *
 * **The year is always shown here, unlike the calendar.** These are history
 * lines. A cooking log is the one place in the product that spans years, and
 * "last cooked Aug 7" is a different fact depending on which August it was.
 */
const DAY: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

/**
 * Format an instant (a stored `cooked_at`) as a day.
 *
 * Invalid input renders as nothing rather than `Invalid Date` — a history line
 * missing its date still reads; one carrying that string reads as broken.
 */
export function dayLabel(at: string | Date): string {
  const d = at instanceof Date ? at : new Date(at);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, DAY);
}

/**
 * Format a `YYYY-MM-DD` calendar key as a day.
 *
 * Noon, for the reason every other date-key call site in the app uses noon: a
 * bare `new Date("2026-08-07")` is parsed as UTC midnight and renders as the
 * previous day for anyone west of Greenwich.
 */
export function keyLabel(key: string): string {
  return dayLabel(new Date(`${key}T12:00:00`));
}

/**
 * "3w" — coarse on purpose.
 *
 * The question a pantry age answers is "is this still true?", and that is a
 * question about roughly how long, not about a date. A timestamp would invite
 * precision the data does not have: `added_at` records when the row was made,
 * which is not when the thing was bought.
 */
export function ageOf(iso?: string): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(days) || days < 0) return null;
  if (days < 1) return "today";
  if (days < 7) return `${days}d`;
  if (days < 60) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

/**
 * A `YYYY-MM-DD` in shopping-list terms — "today", "tomorrow", "Thu".
 *
 * `keyLabel` renders "7 Aug 2026", which is right for a cook history read
 * months later and wrong beside a grocery row: everything on a shopping list is
 * within the week, so the year and the month are noise and the weekday is the
 * whole answer. "Thursday" is a thing you can plan a shop around; "7 Aug 2026"
 * is something you have to work out.
 *
 * Past dates render as the plain weekday rather than "3 days ago". A plan in the
 * past is a dinner that did not happen (see `upcomingPlans`) and does not reach
 * the list, so the case should not arise — and if it does, a relative reading
 * would be the more confusing of the two.
 */
export function soonLabel(key: string, todayKey: string): string {
  if (key === todayKey) return "today";
  const t = new Date(`${todayKey}T12:00:00`);
  const d = new Date(`${key}T12:00:00`);
  if (Number.isNaN(d.getTime()) || Number.isNaN(t.getTime())) return "";
  const days = Math.round((d.getTime() - t.getTime()) / 86_400_000);
  if (days === 1) return "tomorrow";
  // Inside a week the weekday is unambiguous; past that it stops being, so the
  // date comes back.
  if (days > 1 && days < 7) return d.toLocaleDateString(undefined, { weekday: "short" });
  return keyLabel(key);
}
