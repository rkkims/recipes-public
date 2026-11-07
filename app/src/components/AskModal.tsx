"use client";

/**
 * The questions the system asks instead of guessing — INGREDIENT-SPEC §6.
 *
 * These used to render inline inside the state widget, stacked under three
 * toggles in a popover. A question competing for attention with the control
 * that opened the panel is a question people scroll past, and §6's whole
 * premise is that we ask rather than guess *because the answer changes what we
 * can offer*. An answer nobody reads is worth no more than the guess.
 *
 * So a question gets a screen. One at a time, with its reason attached, and
 * nothing else on it to look at.
 *
 * ── It still does not block ────────────────────────────────────────────────
 *
 * §6 is explicit that ignoring a clarification is a "no", and making it modal
 * must not quietly turn it into a demand. Closing answers nothing and records
 * nothing — the question stays unanswered and will be asked again, because an
 * unanswered question is a different state from one answered "no". Escape and
 * the scrim both work, and there is a plain "not sure" out.
 *
 * ── Asked here, adjusted in the widget ─────────────────────────────────────
 *
 * The ANSWER is a current state, not a settled preference: this month the jar
 * has brine and next month it does not. So once answered, the question stops
 * appearing here and lives on as a one-line row in the ingredient's own widget,
 * where flipping it is one tap. Full attention for the asking; no ceremony for
 * the changing.
 */
import { useState } from "react";
import { Button } from "./primitives";
import { Dialog } from "./Dialog";
import type { Ask } from "./StateWidget";

export function AskModal({ ingredient, asks, onAnswer, onClose }: {
  /** What the user has, that prompted the question. */
  ingredient: string;
  /** Unanswered questions for it, asked one at a time. */
  asks: Ask[];
  onAnswer: (ask: Ask, yes: boolean) => void;
  onClose: () => void;
}) {
  const [at, setAt] = useState(0);
  const ask = asks[at];

  if (!ask) return null;

  /** Answer, then move on — or close when that was the last one. */
  const answer = (yes: boolean) => {
    onAnswer(ask, yes);
    if (at + 1 < asks.length) setAt(at + 1); else onClose();
  };

  return (
    <Dialog label={`A question about your ${ingredient}`} onClose={onClose}>
      <p className="ask-eyebrow">
        About your {ingredient}
        {asks.length > 1 && <span className="note"> · {at + 1} of {asks.length}</span>}
      </p>

      <h2 className="ask-question">{ask.question}</h2>

        {/*
          The reason, computed from the corpus and never written by hand —
          "called for in 34 recipes" is the difference between a question and an
          interruption. It is what earns the interruption.
        */}
      <p className="note ask-because">{ask.because}</p>

      <div className="ask-actions">
        <Button kind="primary" onClick={() => answer(true)}>
          Yes, add {ask.grantsName}
        </Button>
        <Button kind="plain" onClick={() => answer(false)}>No</Button>
      </div>

        {/* Closing is not an answer. §6: ignoring it is a "no", and a "no" we
            were told is a different thing from one we assumed — so nothing is
            written and the question comes back. */}
      <p className="cook-line">
        <Button kind="quiet" onClick={onClose}>Not sure, ask me later</Button>
      </p>
    </Dialog>
  );
}
