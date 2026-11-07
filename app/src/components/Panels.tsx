"use client";

/**
 * Which inventory panels are open — UX-SPEC §4d.
 *
 * The pantry and the grocery list are peers, each with its own control, and
 * either or both can be open. That state has to live above both the nav (which
 * owns the controls) and the shell (which owns the panels), and those two are
 * siblings on every page — so it lives here, in a provider mounted at the root.
 *
 * ── Why not the URL ───────────────────────────────────────────────────────
 *
 * The modal is a query parameter because closing it should be a back-tap and a
 * reload should keep your place (§5). These are the opposite: opening the pantry
 * is not a place you navigated to, back should not have to walk out of it, and
 * a shared link should not carry someone else's open drawers. `localStorage`
 * keeps the preference across pages, which is the part that actually matters —
 * someone who collapsed the pantry wants it collapsed on the next page too.
 */
import { createContext, useCallback, useContext, useEffect, useState,
         type ReactNode } from "react";

export type Panel = "pantry" | "list";

const KEY = "panels";

const Ctx = createContext<{
  open: Record<Panel, boolean>;
  toggle: (p: Panel) => void;
  set: (next: Partial<Record<Panel, boolean>>) => void;
  openBoth: () => void;
  closeAll: () => void;
  anyOpen: boolean;
}>({
  open: { pantry: false, list: false },
  toggle: () => {}, set: () => {}, openBoth: () => {}, closeAll: () => {},
  anyOpen: false,
});

export function PanelsProvider({ children }: { children: ReactNode }) {
  /**
   * Closed on the server and on first paint, then corrected from storage.
   *
   * Reading `localStorage` during render would make the markup disagree with
   * itself on hydration — the same reason `Shell` reads its mode in an effect.
   */
  const [open, setOpen] = useState<Record<Panel, boolean>>({ pantry: false, list: false });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Partial<Record<Panel, boolean>>;
      setOpen({ pantry: !!saved.pantry, list: !!saved.list });
    } catch { /* private browsing, or someone edited it. Closed is a fine default. */ }
  }, []);

  const remember = useCallback((next: Record<Panel, boolean>) => {
    setOpen(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* not worth failing over */ }
  }, []);

  const toggle = useCallback((p: Panel) =>
    setOpen((cur) => {
      const next = { ...cur, [p]: !cur[p] };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    }), []);

  const set = useCallback((patch: Partial<Record<Panel, boolean>>) =>
    setOpen((cur) => {
      const next = { ...cur, ...patch };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    }), []);

  /** The phone's one control opens both, stacked — §4d has no separate icons there. */
  const openBoth = useCallback(() => remember({ pantry: true, list: true }), [remember]);
  const closeAll = useCallback(() => remember({ pantry: false, list: false }), [remember]);

  return (
    <Ctx.Provider value={{ open, toggle, set, openBoth, closeAll,
                           anyOpen: open.pantry || open.list }}>
      {children}
    </Ctx.Provider>
  );
}

export const usePanels = () => useContext(Ctx);
