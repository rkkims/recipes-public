"use client";

/**
 * Ending the account — the confirmation, and what it is confirming.
 *
 * ── A dialog, because it is a question ───────────────────────────────────
 *
 * The house rule: questions get a dialog, never an inline panel. This is the
 * most consequential question the product asks, so it is the last place to make
 * an exception — and a panel that unfolds under a button can be triggered by
 * the same tap that scrolls.
 *
 * ── Why it asks you to type the word ─────────────────────────────────────
 *
 * Not ceremony. Every other destructive thing here is undoable — a chip goes
 * back, a cook can be amended, a struck-through row comes back until it
 * refreshes — so a person has learned, correctly, that this app lets them take
 * things back. This one does not, and the typing exists to break that
 * expectation on purpose, in the half second before it matters.
 *
 * ── It names the count, not just the act ─────────────────────────────────
 *
 * "Delete everything" is a phrase and slides past. "42 ingredients and 7 cooks"
 * is a fact about the thing you built, and it is the version that makes someone
 * stop if they should stop. The numbers come from the server on this page load,
 * so they are what is actually there rather than what we last remembered.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "./Dialog";
import type { ActionResult } from "@/lib/result";

/** The word, in one place, so the check and the instruction cannot disagree. */
const WORD = "delete";

export function CloseAccount({ held, cooks, saved, own, onDelete }: {
  held: number; cooks: number; saved: number; own: number;
  onDelete: () => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ready = typed.trim().toLowerCase() === WORD;

  /* Only the parts that exist. A line reading "0 cooks recorded" in a list of
     what you are about to lose is noise in the one place noise is expensive. */
  const parts = [
    held ? `${held} ${held === 1 ? "ingredient" : "ingredients"}` : null,
    saved ? `${saved} saved ${saved === 1 ? "recipe" : "recipes"}` : null,
    own ? `${own} of your own ${own === 1 ? "recipe" : "recipes"}` : null,
    cooks ? `${cooks} ${cooks === 1 ? "cook" : "cooks"}` : null,
  ].filter(Boolean) as string[];

  const close = () => { setOpen(false); setTyped(""); setFailed(null); };

  const go = () => {
    if (!ready || pending) return;
    setFailed(null);
    start(async () => {
      const r = await onDelete();
      if (!r.ok) { setFailed(r.error); return; }
      /* `replace`, not `push`: there is no account to go back to, and leaving
         this page in history would put a dead destination one gesture away. */
      router.replace("/");
    });
  };

  return (
    <>
      <button type="button" className="account-btn account-danger"
              onClick={() => setOpen(true)}>
        Close my account
      </button>

      {open && (
        <Dialog label="Close your account" onClose={close}>
          <h3 className="account-dlg-h">Close your account?</h3>
          {/* The count, then the two facts that are not obvious: no copy, no
              undo. Everything else the dialog could say, it does not. */}
          <p className="note">
            {parts.length > 0
              ? <>Permanently deletes <b>{parts.join(", ")}</b> and your login.</>
              : <>Permanently deletes your login.</>}
            {" "}We keep no copy and it cannot be undone.
          </p>
          {/* Offered here as well as on the page behind: this is the last
              moment it is possible and the first moment it occurs to most
              people. */}
          <p className="note">
            <a href="/export" download>Download my data first</a>
          </p>

          <label className="account-confirm">
            <span>Type <b>{WORD}</b> to confirm</span>
            {/* 16px, or iOS zooms the page on focus and the dialog jumps under
                the finger — the same reason the ingredient note field is 16. */}
            <input type="text" value={typed} autoComplete="off"
                   autoCapitalize="off" spellCheck={false}
                   onChange={(e) => setTyped(e.target.value)} />
          </label>

          {failed && <p className="fail">Not deleted: {failed}</p>}

          <div className="account-confirm-row">
            <button type="button" className="account-btn" onClick={close} disabled={pending}>
              Keep my account
            </button>
            <button type="button" className="account-btn account-danger"
                    disabled={!ready || pending} onClick={go}>
              {pending ? "Deleting…" : "Delete everything"}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
