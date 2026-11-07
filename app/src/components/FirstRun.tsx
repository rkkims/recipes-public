"use client";

/**
 * First run — DECISIONS §3, USER-SPEC §6, UX-SPEC §9.
 *
 * The product answers one question: what can you cook right now. That question
 * has no answer at all until the pantry has enough in it, and "Cook tonight"
 * needs EVERY ingredient of a recipe — so realistically fifteen-odd items before
 * anything appears. Someone who typed in five things and got three empty tabs
 * concluded the app was broken, and nothing on screen argued otherwise.
 *
 * Two screens, in this order, because one of them pays for itself immediately
 * and the other is a tax paid in advance:
 *
 *   1. **The starter list** — twelve hand-picked staples, pre-checked, unticked
 *      to correct. §3's "never show a blank field; always show a guess to
 *      correct", and it takes a new pantry from zero to twelve in one tap. It
 *      is the screen that makes the gallery behind it stop being empty, which
 *      is the entire reason this component exists.
 *   2. **Diet** — a standing instruction (§6), belonging to the account rather
 *      than to a session. Genuinely useful, but its benefit arrives later,
 *      which is why it no longer comes first. Ordering it ahead of the starter
 *      list put a form in front of a stranger who had not yet seen a result.
 *
 * ── It must be skippable, and skipping must stick ──────────────────────────
 *
 * §9's rule about not taxing the first session applies with full force: this is
 * the screen between a stranger and the thing they came for. Skip is a
 * first-class button, not a link hidden in a corner, and it records that the
 * question was asked so it is never asked again.
 *
 * ── What it does NOT do ────────────────────────────────────────────────────
 *
 * It does not ask for an account, a name, or an email. There is nothing here we
 * need before showing results, and §9 is explicit that the ask comes after the
 * product has been useful, never before.
 */
import { useState, useTransition } from "react";
import { Button, Note } from "./primitives";
import type { ActionResult } from "@/lib/result";
/* The device's copy of the same write — see `live`. */
import { finishFirstRun as liveFinishFirstRun } from "@/lib/dual-write";
import { STATIC } from "@/lib/static-mode";
import { useOwner } from "@/lib/use-owner";

export type StarterOption = { id: string; label: string; name: string; recipes: number };

/**
 * Whether to ask at all — the one decision static mode has to move.
 *
 * `page.tsx` gates this on `!owner.onboarded_at`, read from the server. An
 * exported page has no owner, so the gate would be permanently open and every
 * returning visitor would be met by the first-run screen over a pantry they
 * already filled. The device knows the answer, so in static mode the device is
 * asked — and nothing renders until it has answered, because "not onboarded" and
 * "not read yet" look identical and only one of them is a reason to interrupt.
 */
export function FirstRun(props: React.ComponentProps<typeof Ask>) {
  if (!STATIC) return <Ask {...props} />;
  return <DeviceGated {...props} />;
}

function DeviceGated(props: React.ComponentProps<typeof Ask>) {
  const { owner, ready } = useOwner();
  if (!ready || owner?.onboarded_at) return null;
  return <Ask {...props} />;
}

function Ask({ starter, classes, allergens, onFinish, live = false }: {
  starter: StarterOption[];
  classes: readonly string[];
  allergens: readonly string[];
  onFinish: (answer: { have: string[]; classes: string[]; allergens: string[] })
    => Promise<ActionResult>;
  /**
   * The grid behind this screen is the DEVICE's.
   *
   * This is the write that matters most for the inversion: the starter list is
   * how a pantry gets its first twelve rows, and it exists precisely so the
   * gallery behind it stops being empty. Landing only in `owners.json` would
   * leave the user looking at the four empty tabs this screen was built to
   * prevent. `dual-write` still calls the same action, so the server copy —
   * and the pages still reading it — are unchanged.
   */
  live?: boolean;
}) {
  const finishWith = live ? liveFinishFirstRun : onFinish;
  /**
   * The pantry FIRST, diet second — UX-SPEC §9.
   *
   * It opened on the diet question, which put a form in front of a stranger
   * before they had seen a single result. The two screens are not equivalent:
   * the starter list pays for itself immediately (it fills the gallery, which
   * is the whole reason the screen exists), while the diet question is a tax
   * paid in advance against a benefit that only arrives later. §9's rule is
   * that the ask follows usefulness, so the useful one goes first.
   */
  const [step, setStep] = useState<"pantry" | "diet">("pantry");
  // Pre-checked — the guess to correct. Nothing is assumed present: this is the
  // state of a form, and only what survives it is written.
  const [have, setHave] = useState<Set<string>>(new Set(starter.map((s) => s.id)));
  const [pickedClasses, setClasses] = useState<Set<string>>(new Set());
  const [pickedAllergens, setAllergens] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);

  const toggle = <T,>(set: Set<T>, v: T, put: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v); else next.add(v);
    put(next);
  };

  /** `keep` false is the skip: the question is answered "none of it". */
  const finish = (keep: boolean) =>
    start(async () => {
      try {
        const r = await finishWith({
          have: keep ? [...have] : [],
          classes: [...pickedClasses],
          allergens: [...pickedAllergens],
        });
        setFailed(r.ok ? null : r.error);
      } catch (e) {
        setFailed(e instanceof Error ? e.message : "Could not reach the server.");
      }
    });

  return (
    <div className="firstrun">
      {failed && <div className="failbar" role="alert"><b>Not saved.</b> {failed}</div>}

      {step === "diet" ? (
        <>
          <h2 className="firstrun-title">Anything you don’t eat?</h2>
          <Note>
            We’ll keep these out of what we suggest.
          </Note>

          <fieldset className="firstrun-set">
            <legend className="field-label">Diet</legend>
            {classes.map((c) => (
              <button key={c} type="button"
                      className={pickedClasses.has(c) ? "mealchip on" : "mealchip"}
                      aria-pressed={pickedClasses.has(c)}
                      onClick={() => toggle(pickedClasses, c, setClasses)}>{c}</button>
            ))}
          </fieldset>

          <fieldset className="firstrun-set">
            <legend className="field-label">Allergens</legend>
            {allergens.map((a) => (
              <button key={a} type="button"
                      className={pickedAllergens.has(a) ? "mealchip on" : "mealchip"}
                      aria-pressed={pickedAllergens.has(a)}
                      onClick={() => toggle(pickedAllergens, a, setAllergens)}>{a}</button>
            ))}
          </fieldset>

          {pickedAllergens.size > 0 && (
            /* USER-SPEC §6 — we hide what we can SEE, and we never claim a
               recipe is free of anything. Said here, at the moment the setting
               is made, rather than only in the settings panel later. */
            <Note>
              We hide what we can read. We never claim a recipe is free of
              anything. Check the source.
            </Note>
          )}

          <p className="cook-line">
            <Button kind="primary" disabled={pending} onClick={() => finish(true)}>
              {pending ? "Saving…" : "Done"}
            </Button>
            {/* Keeps the pantry answer, drops the diet one — skipping the last
                screen must not throw away the work of the first. */}
            <Button kind="quiet" disabled={pending} onClick={() => finish(true)}>
              No restrictions
            </Button>
          </p>
        </>
      ) : (
        <>
          <h2 className="firstrun-title">Which of these do you have?</h2>
          <Note>
            Untick anything you don’t keep.
          </Note>

          <ul className="firstrun-starter">
            {starter.map((s) => {
              const on = have.has(s.id);
              return (
                <li key={s.id}>
                  <button type="button" className={on ? "starter on" : "starter"}
                          aria-pressed={on}
                          onClick={() => toggle(have, s.id, setHave)}>
                    <span className="starter-tick" aria-hidden="true">{on ? "✓" : ""}</span>
                    <span className="starter-name">{s.label}</span>
                    <span className="hit-count">{s.recipes.toLocaleString()} recipes</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="cook-line">
            <Button kind="primary" onClick={() => setStep("diet")}>
              {`Start with these ${have.size}`}
            </Button>
            {/* Skipping the whole thing stays one tap from either screen —
                nothing here is worth two refusals. */}
            <Button kind="quiet" disabled={pending} onClick={() => finish(false)}>
              Skip
            </Button>
          </p>
        </>
      )}
    </div>
  );
}
