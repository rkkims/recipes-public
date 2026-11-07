"use client";

/**
 * A stopwatch on the last tap, shown on the device doing the tapping.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * "The button colour is slow" has been measured here at 21–41ms on a 6×
 * throttled CPU with no long tasks — which is fast — while remaining slow in the
 * hand. One of those observations is about a machine nobody is using. A profile
 * taken on the phone is the only thing that settles it, and a phone is the one
 * place a profiler is hard to reach.
 *
 * So: opt in with `?perf=1`, tap something, read the number off the screen.
 * It reports what a person actually waits for — the gap between the pointer
 * going down and the frame on which the pixels changed — rather than anything
 * about React's internals.
 *
 * ── It is a diagnostic, not a feature ─────────────────────────────────────
 *
 * Off unless asked for by query parameter, so it costs nothing and nobody meets
 * it by accident. Delete this file and its one line in the layout when the
 * question is answered.
 */
import { useEffect, useState } from "react";

type Sample = { down: number; paint: number; what: string };

export function TapMeter() {
  const [on, setOn] = useState(false);
  const [last, setLast] = useState<Sample | null>(null);

  useEffect(() => {
    setOn(new URLSearchParams(location.search).get("perf") === "1");
  }, []);

  useEffect(() => {
    if (!on) return;

    const onDown = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.("button, a, label");
      if (!el) return;
      const t0 = performance.now();
      const what = (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 22);
      /*
        Named properties, not `cssText`.

        `getComputedStyle(el).cssText` is the empty string in Chrome — so the
        first version compared "" with "" on every frame, never saw a change, and
        never reported a number. Reading the properties that actually carry
        "this control is on" is both correct and cheaper.
      */
      const look = (n: Element) => {
        const c = getComputedStyle(n);
        return `${c.color}|${c.backgroundColor}|${c.borderColor}|${c.fontWeight}|${c.opacity}`;
      };
      const before = look(el);

      /*
        Poll frames until this element LOOKS different, then report.
        Capped, so a tap that changes nothing does not spin forever — the number
        is about paints that happen, and a miss is its own answer.
      */
      let frames = 0;
      const tick = () => {
        frames += 1;
        if (look(el) !== before) {
          setLast({ down: t0, paint: performance.now(), what });
          return;
        }
        if (frames < 120) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [on]);

  if (!on) return null;

  return (
    <div className="tapmeter" role="status" aria-live="off">
      {last
        ? <>{Math.round(last.paint - last.down)}ms · {last.what}</>
        : <>tap anything</>}
    </div>
  );
}
