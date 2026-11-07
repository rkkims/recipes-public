"use client";

/**
 * The grocery list, writable with no signal — UX-SPEC §12.
 *
 * Holds the queue (`lib/queue`), drains it when the connection returns, and
 * tells the user which of those two things is happening.
 *
 * ── What the banner is honestly reporting, after the inversion ────────────
 *
 * It used to be reporting the LIST: the rows were the server's, so a tick with
 * no signal was a tick the page could not show and the queue's overlay had to
 * draw it. The rows are the device's now (STATIC-SPEC §2) and every tick is
 * already on screen and already persisted, so what is waiting here is only the
 * server's copy of it — which matters (push reminders read `owners.json` from
 * outside the app) and which the user should not have to think about.
 *
 * So the words changed with the mechanism. "Ticking and adding still work" was
 * a promise that needed making when the writes were going nowhere; now it is
 * merely true, and saying it would draw attention to a problem the user does
 * not have. What is left is the small honest statement that this device is
 * ahead of the server, and it disappears when it stops being.
 *
 * ── Draining is sequential and stops on the first failure ─────────────────
 *
 * The writes are ordered intentions — "tick gochujang" then "add gochujang back"
 * is not the same as the reverse — so they replay in order. A failure halfway
 * leaves the rest queued rather than skipping past it: half a shop applied in
 * the wrong order is worse than a shop still waiting.
 *
 * ── No reload at the end ──────────────────────────────────────────────────
 *
 * The drain used to finish with `location.reload()`, because the server's copy
 * was then ahead of the page and a reload was the only honest way to show it.
 * The direction has reversed: the device was ahead the whole time and the
 * server has just caught up, so there is nothing new to show and a reload would
 * throw away the panel the user has open in a shop.
 */
import { useCallback, useEffect, useState } from "react";
import { clearQueue, keepFrom, queued, type QueuedWrite } from "@/lib/queue";
import { useAck } from "./Ack";
/* The SERVER actions directly, not `lib/dual-write`: the device applied these
   when they were made and re-applying them here would be the write happening
   twice. What is being drained is the mirror half alone. */
import { addListNote, tickOffItem } from "@/app/actions";

export function ListOffline() {
  const [offline, setOffline] = useState(false);
  const [count, setCount] = useState(0);
  const [sending, setSending] = useState(false);
  const { say } = useAck();

  const refresh = useCallback(() => setCount(queued().length), []);

  useEffect(() => {
    refresh();
    const sync = () => setOffline(!navigator.onLine);
    sync();
    /* The queue is written by `Pantry` through `lib/queue`, which cannot notify
       React. A cheap poll keeps the banner honest without threading a second
       context through a component that already has one. */
    const tick = setInterval(refresh, 1500);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      clearInterval(tick);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, [refresh]);

  const drain = useCallback(async () => {
    const items = queued();
    if (items.length === 0 || sending) return;
    setSending(true);
    let done = 0;
    try {
      for (const item of items as QueuedWrite[]) {
        const r = item.kind === "tick"
          ? await tickOffItem(item.id, item.enough)
          : await addListNote(item.text);
        // Stop at the first refusal; the rest stay queued, in order.
        if (!r.ok) break;
        done += 1;
      }
    } catch {
      /* Connection went again mid-drain. Whatever landed, landed; the rest is
         still in the queue and the banner will still say so. */
    }
    if (done === items.length) clearQueue();
    else if (done > 0) keepFrom(items, done);
    setSending(false);
    refresh();
    if (done > 0) say(done === 1 ? "1 change saved" : `${done} changes saved`);
  }, [refresh, say, sending]);

  /* Offer the drain the moment the connection returns, rather than waiting for
     the user to notice a banner. */
  useEffect(() => {
    if (!offline && count > 0 && !sending) void drain();
  }, [offline, count, sending, drain]);

  if (!offline && count === 0) return null;

  return (
    <div className="listoffline" role="status">
      {offline ? (
        <>
          <b>Offline.</b>{" "}
          {count > 0
            ? `Your list is on this device and up to date. ${count} ${count === 1 ? "change" : "changes"} will reach the server when the signal is back.`
            : "Your list is on this device, so it keeps working."}
        </>
      ) : (
        <>{sending ? "Catching the server up…" : `${count} to send.`}</>
      )}
    </div>
  );
}
