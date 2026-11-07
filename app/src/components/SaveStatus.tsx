"use client";

/**
 * "saving… / autosaved" — the answer to a question an anonymous user is right
 * to ask.
 *
 * There is no Save button anywhere in this product. Every tap writes straight
 * through, which is correct and gives no evidence of itself, so someone with no
 * account and a pantry they have spent ten minutes on has nothing telling them
 * it is kept. This says so.
 *
 * ── It reports, it does not promise ───────────────────────────────────────
 *
 * `saved` is set only after a write has actually come back. A label that said
 * "autosaved" on a timer would be worth less than nothing — the one moment it
 * matters is the moment the write failed, and that is exactly when a timer
 * would still be claiming success. Failures are still shouted separately by the
 * failure bar; this is the quiet half of the same honesty.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState,
         type ReactNode } from "react";

type Status = "idle" | "saving" | "saved";

const Ctx = createContext<{
  status: Status;
  begin: () => void;
  end: (ok: boolean) => void;
}>({ status: "idle", begin: () => {}, end: () => {} });

export function SaveStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("idle");
  /** Concurrent writes are normal — the pantry is optimistic. Count them. */
  const inFlight = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const begin = useCallback(() => {
    inFlight.current += 1;
    if (timer.current) clearTimeout(timer.current);
    setStatus("saving");
  }, []);

  const end = useCallback((ok: boolean) => {
    inFlight.current = Math.max(0, inFlight.current - 1);
    if (inFlight.current > 0) return;
    // A failure is the failure bar's story, not this one's. Going quiet is
    // better than a tick beside an error.
    setStatus(ok ? "saved" : "idle");
  }, []);

  // "Autosaved" fades rather than sitting there forever, which would make it
  // furniture and stop it meaning anything when it appears.
  useEffect(() => {
    if (status !== "saved") return;
    timer.current = setTimeout(() => setStatus("idle"), 4000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [status]);

  return <Ctx.Provider value={{ status, begin, end }}>{children}</Ctx.Provider>;
}

export const useSaveStatus = () => useContext(Ctx);

export function SaveStatusIcon() {
  const { status } = useSaveStatus();
  if (status === "idle") return null;

  return (
    <span className={`savestate savestate-${status}`} role="status">
      {status === "saving" ? (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth={3} strokeLinecap="round" aria-hidden="true" className="savespin">
            <path d="M12 3a9 9 0 1 0 9 9" />
          </svg>
          saving…
        </>
      ) : (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          autosaved
        </>
      )}
    </span>
  );
}
