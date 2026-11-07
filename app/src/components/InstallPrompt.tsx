"use client";

/**
 * "Keep this on your home screen" — UX-SPEC §12.
 *
 * ── It obeys §9's rule, not its own ───────────────────────────────────────
 *
 * *"Never prompt on first visit. An install ask before the pantry has anything
 * in it is asking the user to commit to a product they have not evaluated, and
 * it trains them to dismiss us."*
 *
 * So three conditions, all required:
 *
 *   1. the pantry holds about five things — they have used it
 *   2. this is a RETURN visit — a different day from the first one
 *   3. the browser has offered an install (`beforeinstallprompt`), or we are on
 *      iOS where it never will and the instruction has to be words
 *
 * ── Signup wins any collision ─────────────────────────────────────────────
 *
 * §12: *"Both asks fire on roughly the same signal, and two banners on one
 * screen reads as a site that wants things from you. §9's ask protects data the
 * user would otherwise lose; ours is a convenience. One ask per visit, signup
 * first."* So this checks for the signup prompt on screen and stays quiet if it
 * is there — the sign-up banner has no idea this exists, and it should not.
 *
 * ── Dismissal is remembered, and it is not forever ────────────────────────
 *
 * "Not now" means not now. It comes back after a fortnight, because someone who
 * dismissed it in June may have installed nothing and still want it in July —
 * but a prompt that returns on the next page load is one that gets dismissed
 * permanently by an angry user, which is worse than never asking.
 */
import { useEffect, useState } from "react";
import { Button } from "./primitives";

const FIRST_SEEN = "first-seen";
const SNOOZED = "install-snoozed";
const SNOOZE_DAYS = 14;

/** iOS never fires `beforeinstallprompt`; the gesture has to be described. */
function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

function alreadyInstalled(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    // iOS's own flag, which predates the standard and is still the only one there.
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function InstallPrompt({ pantryCount }: { pantryCount?: number }) {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  /** The deferred browser prompt, when there is one. */
  const [deferred, setDeferred] = useState<(Event & { prompt: () => void }) | null>(null);

  useEffect(() => {
    if (alreadyInstalled()) return;

    /* Condition 2, recorded on the first visit so a return can be detected at
       all. A date rather than a count: "came back another day" is the signal,
       and a reload is not a return. */
    let first: string | null = null;
    try {
      first = localStorage.getItem(FIRST_SEEN);
      if (!first) {
        localStorage.setItem(FIRST_SEEN, new Date().toISOString().slice(0, 10));
        return;                       // first visit ever: §12 forbids asking
      }
      const snoozed = localStorage.getItem(SNOOZED);
      if (snoozed && Date.now() - Number(snoozed) < SNOOZE_DAYS * 86_400_000) return;
    } catch { return; }               // no storage, no way to be polite about it

    if (first === new Date().toISOString().slice(0, 10)) return;   // same day

    setIos(isIosSafari());

    const onPrompt = (e: Event) => {
      e.preventDefault();             // keep it for our own moment
      setDeferred(e as Event & { prompt: () => void });
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    /* iOS will never fire it, so the ask is allowed to stand on the other two
       conditions alone. */
    if (isIosSafari()) setShow(true);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  useEffect(() => { if (deferred) setShow(true); }, [deferred]);

  /* §9 wins. Checked from the DOM rather than through shared state because the
     sign-up prompt is a server component with its own dismissal, and coupling
     the two would make each one's rules the other's problem. */
  useEffect(() => {
    if (!show) return;
    if (document.querySelector(".signup")) setShow(false);
  }, [show]);

  /* The pantry has to have something in it (§9's own threshold). Passed in
     where the count is known; where it is not, the DOM already says it. */
  useEffect(() => {
    if (!show) return;
    if (typeof pantryCount === "number" && pantryCount < 5) setShow(false);
  }, [show, pantryCount]);

  if (!show) return null;

  const snooze = () => {
    try { localStorage.setItem(SNOOZED, String(Date.now())); } catch { /* fine */ }
    setShow(false);
  };

  return (
    <div className="installbar" role="complementary" aria-label="Add to home screen">
      <div className="installbar-copy">
        <b>Keep this on your home screen</b>
        {/* Named for what it buys them, not for what we want. */}
        <span className="note">
          {ios
            ? "Share → Add to Home Screen. It opens straight to your pantry."
            : "Opens straight to your pantry, without the browser bars."}
        </span>
      </div>
      <div className="installbar-actions">
        {!ios && deferred && (
          <Button kind="primary" onClick={() => { deferred.prompt(); setShow(false); }}>
            Add
          </Button>
        )}
        <Button kind="quiet" onClick={snooze}>Not now</Button>
      </div>
    </div>
  );
}
