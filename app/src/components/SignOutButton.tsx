"use client";

/**
 * Sign out, from the account page.
 *
 * The nav has its own — this is not that one duplicated for convenience. The
 * nav's is a corner of every screen and has to be small; this is one of three
 * labelled choices on the page that exists to make those choices, and it sits
 * where someone looking for "how do I get out of this" will actually look.
 *
 * It navigates rather than refreshing, which is the difference from the nav's
 * version: after signing out there is no account page to be on, so staying here
 * would bounce through a redirect and land somewhere by accident. Home is where
 * a signed-out person belongs.
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/result";

export function SignOutButton({ onSignOut }: {
  onSignOut: () => Promise<ActionResult>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button type="button" className="account-btn" disabled={pending}
            onClick={() => start(async () => {
              await onSignOut();
              router.replace("/");
            })}>
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
