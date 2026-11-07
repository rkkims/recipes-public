/**
 * "You left to cook this" — the one fact that lets us ask about it on your way
 * back.
 *
 * The recording block used to sit open in the modal, below the exit, headed
 * *After you cook*. It was in the right place in the timeline and the wrong
 * place in time: it was on screen at the moment the user had not cooked yet,
 * and gone from their attention at the moment they had. Nobody scrolls back
 * into a modal they left forty minutes ago to award a meal three stars.
 *
 * So the block becomes a question asked at the moment it is answerable — the
 * one moment the user is demonstrably back from the kitchen — and the marker
 * written here is what tells the two moments apart.
 *
 * ── Why localStorage and not the owner record ─────────────────────────────
 *
 * This is a fact about a TAB, not about a person: which recipe this browser
 * walked away from, and when. It must survive a background/foreground cycle and
 * nothing longer, it is worthless on another device, and writing it to the
 * server would mean a round trip on the tap that UX-SPEC §5 says must not be
 * taxed. Every access is wrapped: `localStorage` throws outright in some
 * private-browsing modes, and a missed prompt is never worth failing on.
 */

const KEY = "left-to-cook";

/**
 * How long a departure stays interesting.
 *
 * Twelve hours covers leaving at 5pm and coming back after dinner, and stops
 * short of tomorrow — being asked at breakfast about last night's link is the
 * kind of prompt that teaches people to dismiss prompts.
 */
const STALE_MS = 12 * 60 * 60 * 1000;

/**
 * How long you must be gone before coming back counts as having cooked.
 *
 * A mis-tap and an instant return is not a meal — and neither is five minutes
 * of reading the method and coming back (the reviewer's correction to the
 * one-minute version: skimming a recipe is not cooking it). Below this the
 * marker is left ALONE rather than consumed, so the genuine return an hour
 * later still asks.
 */
const AWAY_MS = 5 * 60 * 1000;

type Mark = { id: string; at: number };

function read(): Mark | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as Partial<Mark>;
    if (typeof m?.id !== "string" || typeof m?.at !== "number") return null;
    return { id: m.id, at: m.at };
  } catch {
    return null;
  }
}

/** They tapped through to the source. Record which recipe, and when. */
export function markLeftToCook(recipeId: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ id: recipeId, at: Date.now() } satisfies Mark));
  } catch { /* no marker is no prompt, which is a fine outcome */ }
}

/**
 * Are they back from cooking THIS recipe?
 *
 * Consuming: a true answer fires the question once and clears the marker, so a
 * second tab-switch does not ask again. Everything that is not a genuine return
 * — wrong recipe, too old, back too soon — leaves the marker untouched, because
 * each of those may still become a real return later.
 */
export function backFromCooking(recipeId: string): boolean {
  const m = read();
  if (!m || m.id !== recipeId) return false;

  const elapsed = Date.now() - m.at;
  if (elapsed < AWAY_MS) return false;

  // Too old to ask about, and too old to keep.
  if (elapsed > STALE_MS) { clearLeftToCook(); return false; }

  clearLeftToCook();
  return true;
}

export function clearLeftToCook(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear is fine */ }
}
