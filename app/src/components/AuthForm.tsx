"use client";

/**
 * The whole account interface: two forms on one page.
 *
 * ── Why one page and not two ──────────────────────────────────────────────
 *
 * "Sign in" and "Sign up" are the same question asked of two people, and a
 * visitor who lands on the wrong one has to find a link, navigate, and retype
 * what they had started. Both are here, one tap apart, and the fields that are
 * shared stay filled when you switch.
 *
 * ── What is not here ──────────────────────────────────────────────────────
 *
 * No strength meter, no rules text, no "must contain a number", no verification
 * notice. There are no rules, so there is nothing to explain — and a form that
 * explains constraints it does not have is a form that invents them. The second
 * password field is the only check, and it exists because there is no reset:
 * a typo is not recoverable, so it has to be caught here.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "./primitives";
import type { ActionResult } from "@/lib/result";

type Mode = "in" | "up";

export function AuthForm({ start = "in", next = "/", onSignIn, onSignUp }: {
  /** Which form opens first. `/signin?new=1` arrives wanting the other one. */
  start?: Mode;
  /** Where signing in lands, already validated by the page (internal only).
      Defaults to home, which is what it always did. */
  next?: string;
  onSignIn: (f: { id: string; password: string }) => Promise<ActionResult>;
  onSignUp: (f: { username: string; recovery?: string; password: string;
                  confirm: string; terms: boolean })
    => Promise<ActionResult>;
}) {
  const [mode, setMode] = useState<Mode>(start);
  /* The id — and on the sign-in form the same field takes the email of an
     account from before ids existed (CREATORS-TAB-SPEC §6). */
  const [id, setId] = useState("");
  const [recovery, setRecovery] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [terms, setTerms] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, start_] = useTransition();
  const router = useRouter();

  const up = mode === "up";

  const submit = () =>
    start_(async () => {
      setFailed(null);
      try {
        const r = up
          ? await onSignUp({ username: id,
                             ...(recovery.trim() ? { recovery } : {}),
                             password, confirm, terms })
          : await onSignIn({ id, password });
        if (!r.ok) { setFailed(r.error); return; }
        /* Back to the task that sent them, or home for a cold arrival —
           `next` is the page's validated return path. `refresh` is what makes
           the server re-read the session so the page they land on already
           knows who they are. */
        router.replace(next);
        router.refresh();
      } catch (e) {
        setFailed(e instanceof Error ? e.message : "Could not reach the server.");
      }
    });

  return (
    <div className="authbox">
      <h1 className="auth-title">{up ? "Create an account" : "Sign in"}</h1>
      {/*
        Say what it costs before they weigh it.

        The hesitation at a sign-up form is rarely the form — it is not knowing
        what comes after: a verification mail to go and find, a password rule
        to fight, a marketing list. Naming the absence of all three is worth
        more than any wording of the button, and it is only credible BEFORE the
        fields rather than as reassurance afterwards.
      */}
      <p className="note auth-lead">
        {up
          ? "Free, permanently. No email needed."
          : "Welcome back."}
      </p>

      {failed && <p className="fail" role="alert">{failed}</p>}

      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {/* An id, not an email — §6: the account holds nothing that
            identifies a person unless they choose to leave the recovery
            address below. Signing in, the one field takes either. */}
        <label className="field">
          <span className="field-label">{up ? "Pick an id" : "Your id (or email)"}</span>
          <input type="text" value={id} autoComplete="username" required
                 autoCapitalize="none" spellCheck={false}
                 placeholder={up ? "3–30 letters or numbers" : undefined}
                 disabled={pending} onChange={(e) => setId(e.target.value)} />
        </label>

        <label className="field">
          <span className="field-label">Password</span>
          <input type="password" value={password} required disabled={pending}
                 autoComplete={up ? "new-password" : "current-password"}
                 onChange={(e) => setPassword(e.target.value)} />
        </label>

        {up && (
          <>
            {/* The only validation in the product, and it is a typo check
                rather than a rule. There is no reset, so a mistyped password is
                a lost account. */}
            <label className="field">
              <span className="field-label">Password again</span>
              <input type="password" value={confirm} required disabled={pending}
                     autoComplete="new-password"
                     onChange={(e) => setConfirm(e.target.value)} />
            </label>

            {/* Optional, and the label says what it is FOR — the only way
                back in — so leaving it empty is an informed choice rather
                than a missed field (§6, settled: optional recovery email). */}
            <label className="field">
              <span className="field-label">Recovery email (optional)</span>
              <input type="email" value={recovery} autoComplete="email"
                     disabled={pending}
                     onChange={(e) => setRecovery(e.target.value)} />
              <span className="note">
                Without one, a lost password means a lost account.
              </span>
            </label>

            {/* Checked on the server too — a `required` checkbox is a hint to
                the browser, not a guarantee to us. */}
            <label className="toggle auth-terms">
              <input type="checkbox" checked={terms} disabled={pending}
                     onChange={(e) => setTerms(e.target.checked)} />
              <span>
                I accept the <Link href="/terms">Terms</Link> and the{" "}
                <Link href="/privacy">Privacy Policy</Link>.
              </span>
            </label>
          </>
        )}

        <p className="cook-line auth-actions">
          <Button kind="primary" type="submit" disabled={pending}>
            {pending ? "…" : up ? "Create account" : "Sign in"}
          </Button>
        </p>
      </form>

      {/* The other form, one tap away, keeping whatever has been typed.
          `linklike`, not a button: it sits inside a sentence, and a button
          chrome there competes with the form's real actions above it. */}
      <p className="note auth-swap">
        {up ? "Already have an account? " : "No account yet? "}
        <button type="button" className="linklike" disabled={pending}
                onClick={() => { setMode(up ? "in" : "up"); setFailed(null); }}>
          {up ? "Sign in" : "Create one"}
        </button>
      </p>
    </div>
  );
}
