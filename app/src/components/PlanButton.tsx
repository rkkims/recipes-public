"use client";

/**
 * "Add to meal plan" — put a recipe on a date and a meal.
 *
 * Lives in the modal beside Save, because planning is a decision about a recipe
 * and the modal is where decisions are made (UX-SPEC §5). It is a disclosure
 * rather than a dialog: the button reveals a date and four slots in place, so
 * nothing covers the recipe you are deciding about.
 *
 * Defaults to TOMORROW. Planning is about future cooking — "I'll make this
 * tomorrow" — and a picker that opens on today invites you to plan a dinner you
 * are already having. Past dates are still reachable by typing one; the store
 * allows them, because backfilling a week you forgot to log is legitimate and
 * only COOKS are barred from the future.
 */
import { useState, useTransition } from "react";
import { Button } from "./primitives";
import type { ActionResult } from "@/lib/result";
import { keyLabel } from "@/lib/day";
/* The catch-up version — same action, device re-read once it lands. */
import { planMeal as livePlanMeal } from "@/lib/dual-write";

export function PlanButton({ recipeId, meals, defaultDate, onPlan, live = false }: {
  recipeId: string;
  meals: readonly string[];
  /** `YYYY-MM-DD`, computed on the server so the button agrees with the page. */
  defaultDate: string;
  onPlan: (recipeId: string, date: string, meal: string) => Promise<ActionResult>;
  /**
   * The page behind this reads its shelves from the DEVICE.
   *
   * A plan reaches two of them: the drawer's "for your meal plan" shopping
   * rows, and Explore, which treats a planned recipe as one it need not offer
   * again. Written on the server and re-read here (`lib/dual-write`) rather
   * than mirrored, so the plan keeps the id the calendar knows it by.
   */
  live?: boolean;
}) {
  const send = live ? livePlanMeal : onPlan;
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(defaultDate);
  const [meal, setMeal] = useState<string>(meals[2] ?? "dinner");
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const plan = () =>
    start(async () => {
      try {
        const r = await send(recipeId, date, meal);
        if (r.ok) {
          setFailed(null);
          setDone(`${meal}, ${keyLabel(date)}`);
          setOpen(false);
        } else setFailed(r.error);
      } catch (e) {
        setFailed(e instanceof Error ? e.message : "Could not reach the server.");
      }
    });

  return (
    <div className="planner">
      <p className="cook-line">
        <Button kind="plain" onClick={() => { setOpen((v) => !v); setDone(null); }}>
          {open ? "cancel" : "Add to meal plan"}
        </Button>
        {/* Confirmed in place. A plan made and not acknowledged is a plan the
            user makes twice. */}
        {done && <span className="note"> · planned for {done}</span>}
      </p>

      {open && (
        <div className="planner-form">
          <label className="field">
            <span className="field-label">Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <div className="meals" role="group" aria-label="Which meal">
            {meals.map((m) => (
              <button key={m} type="button" className={m === meal ? "mealchip on" : "mealchip"}
                      aria-pressed={m === meal} onClick={() => setMeal(m)}>
                {m}
              </button>
            ))}
          </div>

          <Button kind="primary" disabled={pending || !date} onClick={plan}>
            {pending ? "Saving…" : "Add to plan"}
          </Button>
        </div>
      )}

      {failed && <p className="fail">Not saved: {failed}</p>}
    </div>
  );
}
