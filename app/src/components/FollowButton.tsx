"use client";

/**
 * Follow / Following, by the creator's name — CREATORS-TAB-SPEC §4.
 *
 * Account-only in server mode, and the signed-out version says so instead of
 * pretending: a follow the server never heard would vanish when the account
 * picked up the pantry on another device, and a button that works and then
 * forgets is worse than one that asks first.
 *
 * **Static mode has no account and no sign-in page to send anyone to**, and it
 * does not need one: a follow is device state (`owner.follows`), it goes
 * through `lib/dual-write` like every other write, and on a static build the
 * device is the only copy there is. So the ask is dropped rather than pointed
 * at a route the export does not contain, and the button simply works.
 *
 * Optimistic like every other tick: the state flips on the tap, the write goes
 * out behind it, and a failure flips it back and says so. The label carries
 * the state ("Follow" / "Following") and `aria-pressed` says it for anyone
 * who cannot see which of the two fills is which.
 */
import Link from "next/link";
import { useState, useTransition } from "react";
import { useAck } from "./Ack";
import { setFollow } from "@/lib/dual-write";
import { STATIC } from "@/lib/static-mode";

export function FollowButton({ handle, creatorId, name, initial, signedIn }: {
  handle: string;
  /** The id the device keys follows by — see `dual-write.setFollow`. */
  creatorId: string;
  /** The display name, for the toast — "Following Maangchi", not "saved". */
  name: string;
  initial: boolean;
  signedIn: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [, start] = useTransition();
  const { say } = useAck();

  if (!signedIn && !STATIC) {
    /* `next` brings them straight back to this profile — signing in must not
       cost them the page they were about to follow. */
    return (
      <Link className="follow-btn"
            href={`/signin?next=${encodeURIComponent(`/creators/${handle}`)}`}>
        Sign in to follow
      </Link>
    );
  }

  const flip = (next: boolean) => {
    setOn(next);
    start(async () => {
      try {
        const r = await setFollow(handle, creatorId, next);
        if (!r.ok) { setOn(!next); say(r.error); return; }
        say(next ? `Following ${name}` : `Unfollowed ${name}`,
            () => flip(!next));
      } catch {
        setOn(!next);
        say("Could not save. Try again.");
      }
    });
  };

  return (
    <button type="button" className={on ? "follow-btn on" : "follow-btn"}
            aria-pressed={on} onClick={() => flip(!on)}>
      {on ? "Following" : "Follow"}
    </button>
  );
}
