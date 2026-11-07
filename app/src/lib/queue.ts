/**
 * Writes made with no signal, kept until there is one — UX-SPEC §12.
 *
 * ── What this is now FOR, which is half of what it used to be ─────────────
 *
 * §12's offline table was corrected once, then corrected back. The first
 * correction: this app kept owner state on the server, so caching alone could
 * never make a write work, and the grocery list — the one screen used where
 * signal is worst — needed a queue of its own to be writable in an aisle.
 *
 * STATIC-SPEC §2's inversion settles it the other way. The pantry lives in
 * `localStorage`, so a tick made behind thick walls IS the write: it lands on
 * the tap's own frame, the row redraws from it, and it survives a reload with
 * no signal because it was never in flight. §12's table is finally true rather
 * than aspirational, and it is true because of where the state is, not because
 * of anything cached.
 *
 * What is still genuinely lost with no signal is the SERVER's copy — the one
 * push reminders read (`src/push/remind.ts`) and a second device would pick up.
 * That is what this queue holds now: the mirror half of a `lib/dual-write`
 * call, parked when `navigator.onLine` is false and replayed by `ListOffline`
 * when the connection returns.
 *
 * ── Deliberately not a general sync layer ─────────────────────────────────
 *
 * The same two operations, and still only two: tick something off, and add
 * something you typed. Everything else the device now handles by itself, and
 * the writes that reach only the server (a cook, a plan) are a round trip by
 * construction and say so.
 *
 * ── Why these two are safe to replay late ─────────────────────────────────
 *
 * Both are IDEMPOTENT in the direction they move. Ticking something off twice
 * lands in the same state as ticking it once; adding "paper towels" twice makes
 * one row, because the store keys on the ingredient. So a queue drained twice,
 * or drained after the same change arrived from another tab, cannot corrupt
 * anything — which is what lets this exist without a merge algorithm.
 *
 * Order is preserved anyway, because "tick gochujang, then add gochujang back"
 * and the reverse are different intentions.
 *
 * ── What went with the inversion ──────────────────────────────────────────
 *
 * `pendingState` and `pendingNotes` — the overlay that told a SERVER-rendered
 * page which of its rows had been ticked since it was cached. There is no
 * server-rendered page to correct any more: `/list` reads the device, and the
 * device is where the tick already is. Keeping them would have meant a second
 * answer to "is this ticked" sitting beside the first.
 */

const KEY = "list-queue";
/** A generous ceiling. A real shop is tens of items; a thousand is a bug. */
const MAX = 500;

export type QueuedWrite =
  | { kind: "tick"; id: string; enough: boolean; at: number }
  | { kind: "note"; text: string; at: number };

function read(): QueuedWrite[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedWrite[]) : [];
  } catch {
    /* Corrupt or unavailable. An empty queue loses the writes, which is bad, and
       throwing here would take the list down entirely, which is worse — and the
       user is standing in a shop. */
    return [];
  }
}

function write(q: QueuedWrite[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(q.slice(-MAX))); }
  catch { /* quota or private mode; nothing useful to do about it here */ }
}

export function queued(): QueuedWrite[] {
  return read();
}

/**
 * `Omit` over a union collapses it to the shared keys, so the parameter is
 * spelled out per branch instead — otherwise `{kind:"note", text}` fails to
 * typecheck against a type that only knows `kind`.
 */
export type NewWrite =
  | { kind: "tick"; id: string; enough: boolean }
  | { kind: "note"; text: string };

export function enqueue(item: NewWrite): void {
  write([...read(), { ...item, at: Date.now() } as QueuedWrite]);
}

export function clearQueue(): void {
  write([]);
}

/** Drop the ones that landed and keep the rest, in order — a partial drain. */
export function keepFrom(items: QueuedWrite[], done: number): void {
  write(items.slice(done));
}
