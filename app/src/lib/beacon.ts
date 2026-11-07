"use client";

/**
 * Fire-and-forget event delivery — ATTRIBUTION-SPEC §2's one hard rule made
 * code: nothing may ever wait on this. `sendBeacon` survives navigation;
 * the `keepalive` fetch is the fallback for browsers without it. Either way
 * there is no await, no promise surfaced, and no error a surface could see.
 * A tracker that costs a conversion has inverted its own purpose.
 */
import { API_ORIGIN, STATIC } from "./static-mode";

/**
 * The one address, decided per build — STATIC-SPEC §7b, revised.
 *
 * The six kinds that ride this (`list_viewed`, `buyblock_shown/opened` from the
 * surfaces, `pantry_event`, `cook_event`, `cook_undo` derived by the client
 * store) simply STOPPED in static mode for a while, on the reading that the
 * only Worker was `/go` and folding a household id into an attribution dataset
 * would settle a privacy argument by accident. That reasoning still holds and
 * the conclusion no longer does: the beacons now have a sink of their own
 * (`workers/api.ts` → one D1 row per event), so the argument is answered by
 * keeping the two records separate rather than by dropping one of them.
 *
 * GO-LIVE's distribution plan measures residency by `cook_event`. Firing a
 * community placement into a build with no event sink is flying blind, which is
 * the cost that turned this back on.
 *
 * `API_ORIGIN` is empty for a post-cutover build (the Worker is routed at
 * `jipbap.com/api/*`, so the relative path reaches it) and names the Worker's
 * workers.dev origin for a preview deploy, which has no such route. In server
 * mode it is empty and unread: the address is the same relative `/api/events`
 * it has always been, answered by the Next route — **nothing about server mode
 * changes here.**
 *
 * The one thing to hold in mind, and `build-static` prints it on every build:
 * a PREVIEW deploy that names no origin posts to a relative path its own site
 * does not serve. That is a 404 per tick rather than a row in D1 — harmless,
 * because nothing waits on this, and invisible, which is why the build says so
 * out loud rather than leaving it to be discovered in a console.
 */
const SINK = STATIC && API_ORIGIN ? `${API_ORIGIN}/api/events` : "/api/events";

export function beacon(kind: string, fields: Record<string, unknown> = {}): void {
  /* No events from the static site (2026-11-06): the `/api` Worker was never
     routed at jipbap.com and was dropped. Server mode still records them. */
  if (STATIC) return;
  try {
    const body = JSON.stringify({ kind, ...fields });
    /* Cross-origin before the cutover, and deliberately a plain string: a
       string body makes this a "simple" request (`text/plain`), so there is no
       preflight to answer and no round trip to lose the race with navigation.
       The Worker reads the body rather than the content type. */
    if (!navigator.sendBeacon?.(SINK, body)) {
      fetch(SINK, { method: "POST", body, keepalive: true }).catch(() => {});
    }
  } catch {
    /* an unrecorded impression is a gap; a thrown one is a broken page */
  }
}
