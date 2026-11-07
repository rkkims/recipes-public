"use client";

/**
 * A week of the meal plan — RECIPE-SPEC §4d.
 *
 * Renders rows the server built; it holds no idea of what a plan or a cook IS.
 * Every entry links to the recipe modal bound to that square's date, which is
 * how the calendar and the recommendation grid end up being the same product
 * rather than two.
 *
 * **"Made it" is only offered on today and in the past.** A future square shows
 * the plan and nothing to tick — a cook is a thing that happened. The store
 * refuses a future cook too; this is the courtesy, not the rule.
 */
import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "./primitives";
import { useConfirm } from "./Dialog";
import type { ActionResult } from "@/lib/result";
import { openRecipeHref } from "@/lib/static-mode";

export type PlannedEntry = {
  id: string;
  /** Absent on a NOTE — "eat out", "uber". Nothing to open, nothing to cook. */
  recipeId?: string;
  title: string; meal: string; done: boolean;
  /**
   * How many ingredients short, and how many of those are already on the
   * grocery list. Absent once cooked — a meal that happened needs no shopping
   * advice.
   */
  away?: number;
  listed?: number;
};
export type UnplannedCook = {
  id: string; recipeId: string; title: string; meal: string; rating?: number;
};
export type Day = {
  date: string;
  isToday: boolean;
  isPast: boolean;
  planned: PlannedEntry[];
  unplanned: UnplannedCook[];
};

export type RecipeHit = { id: string; title: string; source: string; away: number; image?: string };

export function Week({ days, meals, onUnplan, onCook, onPlan, onNote, searchRecipes }: {
  days: Day[];
  meals: string[];
  onUnplan: (planId: string) => Promise<ActionResult>;
  onCook: (recipeId: string, date?: string, meal?: string, planId?: string) => Promise<ActionResult>;
  onPlan: (recipeId: string, date: string, meal: string) => Promise<ActionResult>;
  /** Put a NOTE on a day — "eat out", "uber". No recipe, nothing to cook. */
  onNote: (label: string, date: string, meal: string) => Promise<ActionResult>;
  searchRecipes: (q: string) => Promise<RecipeHit[]>;
}) {
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  const [failed, setFailed] = useState<string | null>(null);
  /** Which day's "+" is open, and which slot it will write to. */
  const [planning, setPlanning] = useState<{ date: string; meal: string } | null>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<RecipeHit[]>([]);

  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      try {
        const r = await fn();
        setFailed(r.ok ? null : r.error);
      } catch (e) {
        setFailed(e instanceof Error ? e.message : "Could not reach the server.");
      }
    });

  /** Order slots the way a day runs, with anything typed falling to the end. */
  const slotRank = (meal: string) => {
    const i = meals.indexOf(meal);
    return i < 0 ? meals.length : i;
  };

  return (
    <>
      {failed && (
        <div className="failbar" role="alert">
          <b>Not saved.</b> {failed}
          <button type="button" onClick={() => location.reload()}>reload</button>
        </div>
      )}

      <div className="week">
        {days.map((d) => {
          const entries = [...d.planned].sort((a, b) => slotRank(a.meal) - slotRank(b.meal));
          const loose = [...d.unplanned].sort((a, b) => slotRank(a.meal) - slotRank(b.meal));
          const empty = entries.length === 0 && loose.length === 0;

          return (
            <section key={d.date}
                     className={d.isToday ? "day day-today" : d.isPast ? "day day-past" : "day"}>
              <h3 className="day-head">
                <span className="day-name">
                  {new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" })}
                </span>
                <span className="day-num">
                  {new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined,
                    { day: "numeric", month: "short" })}
                </span>
                {d.isToday && <span className="day-today-tag">today</span>}
              </h3>

              {empty && <p className="day-empty">·</p>}

              <div className="day-body">
              {entries.map((p) => (
                <div key={p.id}
                     className={!p.recipeId ? "slot slot-note" : p.done ? "slot slot-done" : "slot"}>
                  <span className="slot-meal">{p.meal}</span>
                  {/* A note has nothing to open. It is the whole entry, so it is
                      plain text rather than a link to a page that does not
                      exist. */}
                  {p.recipeId
                    ? <Link className="slot-title"
                            href={openRecipeHref(p.recipeId, `/calendar?recipe=${p.recipeId}&date=${d.date}`)} scroll={false}>
                        {p.title}
                      </Link>
                    : <span className="slot-title">{p.title}</span>}

                  {/* Whether you can actually cook it, said while there is
                      still time to do something about it. */}
                  {!p.done && p.away !== undefined && (
                    <span className={p.away === 0 ? "slot-away slot-can" : "slot-away"}>
                      {p.away === 0
                        ? "have all"
                        : p.listed
                          ? `${p.away} away · ${p.listed} on list`
                          : `${p.away} away`}
                    </span>
                  )}

                  {/* A note is never cooked and offers no tick — there is
                      nothing to record, because the note IS the record. */}
                  {!p.recipeId ? null : p.done ? (
                    <span className="slot-tick" title="cooked">✓</span>
                  ) : d.isPast || d.isToday ? (
                    /* Ticking a PLANNED meal links the cook to the plan rather
                       than writing a second, unrelated record of the same
                       dinner (§4d). */
                    <Button kind="quiet" disabled={pending}
                            onClick={() => run(() => onCook(p.recipeId!, d.date, p.meal, p.id))}>
                      Made it
                    </Button>
                  ) : null}

                  <Button kind="quiet" disabled={pending}
                          onClick={() => confirm({
                            question: `Remove ${p.title} from ${p.meal}?`,
                            detail: p.done
                              ? "The cook you recorded stays in your history."
                              : "Nothing else is affected.",
                            confirmLabel: "Remove it",
                          }, () => run(() => onUnplan(p.id)))}>
                    ✕
                  </Button>
                </div>
              ))}

              {/* Cooked but never planned. Shown because it happened — a
                  calendar that only lists intentions is not a record. */}
              {loose.map((c) => (
                <div key={c.id} className="slot slot-loose">
                  <span className="slot-meal">{c.meal || "cooked"}</span>
                  <Link className="slot-title"
                        href={openRecipeHref(c.recipeId, `/calendar?recipe=${c.recipeId}&date=${d.date}`)} scroll={false}>
                    {c.title}
                  </Link>
                  {c.rating !== undefined && (
                    <span className="stars-inline">{"★".repeat(c.rating)}</span>
                  )}
                </div>
              ))}

              {/* Plan straight onto this day, at the foot of the cell so it
                  never sits above what is already planned. It sets the DATE;
                  the slot is chosen in the picker, because a "+" per slot would
                  put four buttons in a cell only a few lines tall. */}
              <button type="button" className="day-add"
                      aria-expanded={planning?.date === d.date}
                      aria-label={`Plan something for ${d.date}`}
                      onClick={() => {
                        setQ(""); setHits([]);
                        setPlanning(planning?.date === d.date
                          ? null
                          : { date: d.date, meal: meals[2] ?? "dinner" });
                      }}>
                {planning?.date === d.date ? "cancel" : "+"}
              </button>
              </div>
            </section>
          );
        })}
      </div>

      {/*
        The picker sits BELOW the grid, not inside the cell that opened it.

        The state widget's lesson was that an editor belongs under the thing it
        edits, and this is the case that qualifies it: a day column is a seventh
        of the width, and a search box in it would be unusable. The grid is one
        row tall, so directly beneath it IS directly beneath the day — and the
        heading names the day so there is no doubt which square is being filled.
      */}
      {planning && (
        <div className="picker">
          <p className="field-label">
            Planning for{" "}
            <b>{new Date(`${planning.date}T12:00:00`).toLocaleDateString(undefined,
              { weekday: "long", day: "numeric", month: "long" })}</b>
          </p>

          <div className="meals" role="group" aria-label="Which meal">
            {meals.map((m) => (
              <button key={m} type="button"
                      className={m === planning.meal ? "mealchip on" : "mealchip"}
                      aria-pressed={m === planning.meal}
                      onClick={() => setPlanning({ ...planning, meal: m })}>
                {m}
              </button>
            ))}
          </div>

          <form className="search" onSubmit={(e) => e.preventDefault()}>
            <input autoFocus value={q} placeholder="bibimbap, bulgogi, kimchi stew…"
                   onChange={(e) => {
                     const v = e.target.value;
                     setQ(v);
                     start(async () => {
                       try { setHits(await searchRecipes(v)); }
                       catch { /* typing is not the moment to shout */ }
                     });
                   }} />
          </form>

          {/*
            Not a recipe — RECIPE-SPEC §4d.

            Offered beside the search rather than behind a mode switch, because
            the two are the same decision: what is happening that evening. Half
            the useful answers are not dishes, and a calendar that can only hold
            dishes quietly asks you to pretend takeaway is not a plan.

            It reuses whatever is typed in the search box, so "eat out" is one
            field and two taps rather than a second input to find.
          */}
          {q.trim().length > 0 && (
            <p className="cook-line">
              <Button kind="plain" disabled={pending} onClick={() => {
                const label = q.trim(), at = planning;
                run(() => onNote(label, at.date, at.meal));
                setPlanning(null); setQ(""); setHits([]);
              }}>
                Not a recipe: put “{q.trim()}” on {planning.meal}
              </Button>
            </p>
          )}

          {q.length >= 2 && hits.length === 0 && !pending && (
            <p className="note">No recipe matching “{q}”.</p>
          )}

          <ul className="hits">
            {hits.map((h) => (
              <li key={h.id}>
                <button type="button" className="hit"
                        disabled={pending}
                        onClick={() => {
                          run(() => onPlan(h.id, planning.date, planning.meal));
                          setPlanning(null); setQ(""); setHits([]);
                        }}>
                  <span className="hit-name">{h.title}</span>
                  <span className="hit-via">{h.source}</span>
                  {/* The distance is why this is a picker and not a text field:
                      planning Thursday is a shopping decision too. */}
                  <span className={h.away === 0 ? "hit-count hit-have" : "hit-count"}>
                    {h.away === 0 ? "have everything" : `${h.away} away`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {dialog}
    </>
  );
}
