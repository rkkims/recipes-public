"use client";

/**
 * The share sheet's answer for a visitor with no account.
 *
 * A share is an action: someone picked JipBap out of a system menu holding a
 * recipe they wanted to keep. Before this, an anonymous share landed on
 * `/my-recipes` and nothing happened — the add form is account-gated (the
 * §9 argument beside it: a hand-entered recipe is too expensive to let live
 * in a cookie), so the page simply did not contain the thing the share was
 * for. Silence after an action reads as the app ignoring you.
 *
 * So the gate is said, in the same dialog the import itself uses: what
 * signing in is for, and where the link they shared went (nowhere — it is
 * still in the address bar, and this says so rather than letting them wonder).
 *
 * This is a statement, not a wall: closing it leaves them on the page like
 * any other visitor.
 */
import { useState } from "react";
import Link from "next/link";
import { Button } from "./primitives";
import { Dialog } from "./Dialog";

export function ImportGate({ shared }: { shared: string }) {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <Dialog label="Sign in to save recipes" onClose={() => setOpen(false)}>
      <p className="cook-line"><b>Sign in to save this recipe</b></p>
      <p className="note" style={{ overflowWrap: "anywhere" }}>{shared}</p>
      <p className="note">
        A saved recipe is a link, a title and its ingredients: too much to
        keep in a cookie that can vanish. An account is where it lives.
      </p>
      <p className="cook-line">
        <Link href="/signin"><b>Sign in</b></Link>
        <Button kind="quiet" onClick={() => setOpen(false)}>Not now</Button>
      </p>
      <p className="note">
        Your link stays in this page&apos;s address; share it again or paste
        it after signing in.
      </p>
    </Dialog>
  );
}
