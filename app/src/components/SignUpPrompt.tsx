/**
 * "Keep this pantry" — UX-SPEC §9's ask, at the only moment it is honest.
 *
 * ── Why it is here and not in the chrome ──────────────────────────────────
 *
 * It used to be a button in the top bar on every page. That asks on arrival, of
 * someone who has been given nothing yet, which is exactly what §9 forbids:
 * *the ask comes after the product has been useful, never before.*
 *
 * Inside the pantry, above the thing it is about, it is a different sentence.
 * By the time it appears the user has told us five things about their kitchen,
 * and there is something worth keeping.
 *
 * The wording stops at the benefit. It used to explain the mechanism as well,
 * which was true, was the actual reason, and was a sentence about browser
 * storage said to somebody holding a jar of gochujang. What it would cost them
 * is the part they can act on; how it would happen is our problem.
 *
 * ── Five, and it does not go away ─────────────────────────────────────────
 *
 * Below five items there is no argument to make and the ask would be noise.
 * Above it, there is no "not now".
 *
 * That is a deliberate reversal, and it needs a reason better than wanting
 * sign-ups. A dismissible prompt is right when the thing it offers is optional
 * to the user — and this one is not: without an account the pantry lives in one
 * browser, and the way it goes is a cleared cookie, a new phone, a reinstall.
 * None of those announce themselves, and every one of them is unrecoverable.
 * A banner dismissed in week one is a banner that was not on screen in week
 * six, which is when it mattered.
 *
 * What keeps it from being a nag is that it is ignorable and it ENDS: one line
 * of quiet text above the shelf, never a modal, never over the content, and it
 * disappears permanently the moment there is an account. It costs a glance
 * until it costs nothing.
 *
 * ── It no longer lies ─────────────────────────────────────────────────────
 *
 * This component used to open a dialog headed *"Accounts aren't ready yet"* and
 * offer a file download instead. Accounts exist now, so it links to the form.
 * The export is still there, in the footer, where it belongs for everyone.
 *
 * No longer a client component: with the dismiss gone there is no state, no
 * effect and no handler left in it — just a count and a link.
 */
import Link from "next/link";

/** §9's trigger. Below this there is no argument to make. */
const ENOUGH = 5;

export function SignUpPrompt({ items }: {
  /** How many things are in the pantry. */
  items: number;
}) {
  if (items < ENOUGH) return null;

  return (
    <p className="signup">
      <span>Sign up to keep your pantry.</span>
      <span className="signup-do">
        {/* Straight to the form with the sign-up half open, rather than a
            dialog that explains the thing the form is about to say. */}
        <Link className="btn btn-plain" href="/signin?new=1">Sign up</Link>
      </span>
    </p>
  );
}
