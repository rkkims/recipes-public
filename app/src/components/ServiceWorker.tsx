"use client";

/**
 * Registers the service worker, and says when the app is offline — §12.
 *
 * ── The registration ──────────────────────────────────────────────────────
 *
 * After load rather than during it: registering competes with the first render
 * for the same connection, and the worker is worth nothing on the visit that
 * installs it.
 *
 * ── The notice ────────────────────────────────────────────────────────────
 *
 * §12's hard rule is that a cached surface must not lead to a dead tap: *"we
 * never host recipe text, so 'works offline' can never mean 'cook offline'. A
 * cached grid that leads to a dead tap is worse than showing nothing — the card
 * says so before it is tapped, not after."*
 *
 * This app is stricter than §12 assumed, because its state is on the server
 * too: with no signal you cannot add an ingredient either. So the notice says
 * the whole truth rather than the recipe half of it.
 */
import { useEffect, useState } from "react";

export function ServiceWorker() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const on = () => navigator.serviceWorker.register("/sw.js").catch(() => {
        /* A failed registration is not a failed page. Private modes and
           insecure origins both refuse, and neither is worth an error. */
      });
      if (document.readyState === "complete") on();
      else { window.addEventListener("load", on); return () => window.removeEventListener("load", on); }
    }
    return;
  }, []);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="offline-bar" role="status">
      Offline. You can read what is already here. Adding, ticking and opening a
      recipe all need a signal.
    </div>
  );
}
