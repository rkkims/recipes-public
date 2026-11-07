"use client";

/**
 * The permission control — PRIVACY-SPEC §5, `legal/privacy-policy.md` §5.4.
 *
 * ── Four requirements, each a legal one wearing a UX hat ───────────────────
 *
 * 1. **Unticked by default.** Never `defaultChecked`, never a pre-filled truthy
 *    prop: the initial value is the stored answer, and no stored answer is
 *    `false`. A pre-ticked box is not consent under GDPR and reads as a dark
 *    pattern everywhere else.
 * 2. **Not a condition of anything.** It appears beside the account, never in
 *    front of it, and nothing in the product checks it before working. Consent
 *    bundled into access is not freely given.
 * 3. **Withdrawable as easily as given.** The same control, the same words, the
 *    same one tap. No confirmation step, no "are you sure", no retention offer
 *    — a withdrawal flow that argues back is a withdrawal flow that fails the
 *    "as easily as" test.
 * 4. **Versioned.** The action stamps the policy version and a hash of the
 *    words below, so the record says what was on screen rather than merely that
 *    something was.
 *
 * ── It does not render for an anonymous owner, and that is the point ───────
 *
 * PRIVACY-SPEC §5 is explicit that an anonymous session has nobody who could
 * agree, so there is nothing a toggle could truthfully record. Showing one
 * would be worse than showing nothing twice over: it would bank a permission
 * the spec says is void, and it would tell someone we share data on a basis we
 * would then have to refuse to act on. `hasAccount` is false for every owner
 * today (nothing writes `email`), so today this renders nothing at all.
 *
 * The server action refuses the same case independently. This is the courtesy;
 * that is the control.
 *
 * ── No link to the policy, deliberately ───────────────────────────────────
 *
 * `legal/privacy-policy.md` is a draft with unfilled placeholders and has no
 * route. A link to it would be the one broken promise on a control whose entire
 * job is to be believable. When the policy is published, the link belongs here.
 */
import { useState, useTransition } from "react";
import { Note, Toggle } from "./primitives";
import { CONSENT_BODY, CONSENT_HEADING } from "@/lib/consent";
import { updateSharing } from "@/app/actions";

export function ShareConsent({ hasAccount, granted }: {
  /** USER-SPEC §1's `email`, resolved server-side. See `pool.hasAccount`. */
  hasAccount: boolean;
  /** The stored answer. Absent and refused arrive here identically, as false. */
  granted: boolean;
}) {
  const [on, setOn] = useState(granted);
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);

  if (!hasAccount) return null;

  const flip = (next: boolean) => {
    /*
      Optimistic, and reverted on failure. The alternative — wait for the round
      trip — makes withdrawal feel heavier than granting, because a withdrawal
      is the moment someone is already unsure. Reverting on failure is what
      keeps that honest: the control must never show "off" over a stored "on".
    */
    setOn(next);
    start(async () => {
      try {
        const r = await updateSharing(next);
        if (r.ok) setFailed(null);
        else { setOn(!next); setFailed(r.error); }
      } catch (e) {
        setOn(!next);
        setFailed(e instanceof Error ? e.message : "Could not reach the server.");
      }
    });
  };

  return (
    <div className="consent">
      {failed && <p className="fail">Not saved: {failed}</p>}
      <Toggle label={CONSENT_HEADING} checked={on} onChange={flip} />
      <Note>{CONSENT_BODY}</Note>
      {pending && <p className="note">saving…</p>}
    </div>
  );
}
