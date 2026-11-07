"use client";

/**
 * The batched queue — a page of recipes, one unfolded at a time.
 *
 * The curator's ask (2026-08-17): stop visiting one page per recipe. So the
 * queue's head arrives as a BATCH; every recipe is a folded row, exactly one is
 * open, and judging it collapses the row to a one-line receipt and unfolds the
 * next. No navigation inside the batch — state moves, the URL does not — which
 * also sidesteps the Router Cache trap written up in `Curate.commit`. One hard
 * load happens only when the batch is spent, and that fetches the next batch.
 *
 * A settled row does not reopen here. The client-side draft it was judged with
 * is gone, and re-editing against the server's pre-fill would silently bury the
 * judgement just made — that is what revisit mode is for, so the receipt links
 * to it.
 */
import { useEffect, useState } from "react";
import { Curate, type Draft, type Subject } from "./Curate";
import type { SheetActions } from "./IngredientSheet";
import { Note, Panel } from "./primitives";
import type { Suggestion } from "./SuggestInput";

type Verdict = "keep" | "drop" | "skip";

export function CurateBatch({ subjects: liveSubjects, done: liveDone, total: liveTotal,
                              onSave, ingredient, search, searchRecipes }: {
  subjects: Subject[];
  /** Curated count and corpus size at the time the batch was cut. */
  done: number; total: number;
  onSave: (verdict: Verdict, draft: Draft) => Promise<void>;
  /** The ingredient sheet's actions, passed through to the open recipe. */
  ingredient?: SheetActions;
  search: (q: string) => Promise<Suggestion[]>;
  /** Takes the SOURCE too — same-source-first ordering is per recipe now that
      one page holds recipes from potentially several sources. */
  searchRecipes: (source: string, q: string)
    => Promise<Array<{ id: string; title: string; source: string }>>;
}) {
  /**
   * FROZEN at arrival. Every save's `revalidatePath("/curate")` answers the
   * action POST with a fresh RSC payload, and the router applies it in place:
   * the server recomputes the queue WITHOUT the recipe just judged, and
   * `queueMix`'s rotation slides that creator's next recipe into the same
   * slot — so the row under `open` became a recipe the curator never saw,
   * and the form unfolded for it (curator report, 2026-08-21: "pulls up a
   * different recipe from the same website"). The ingredient-sheet actions
   * revalidate mid-form the same way. The batch the curator is working IS
   * the batch that arrived; the next one is a hard load (`nextBatch`), which
   * never reads these props.
   */
  const [{ subjects, done, total }] = useState(
    { subjects: liveSubjects, done: liveDone, total: liveTotal });

  /**
   * One state object, not two. Settling a recipe must record the verdict AND
   * pick the next open row in the same update — computed separately, the
   * advance would read a `settled` that does not yet contain the row just
   * judged and reopen it.
   */
  const [state, setState] = useState<{ open: number; settled: Record<string, Verdict> }>(
    { open: 0, settled: {} });

  /** The next unsettled row after `from`, wrapping; -1 when the batch is spent. */
  const nextOpen = (settled: Record<string, Verdict>, from: number) => {
    for (let i = from + 1; i < subjects.length; i++) if (!settled[subjects[i]!.id]) return i;
    for (let i = 0; i <= from && i < subjects.length; i++) if (!settled[subjects[i]!.id]) return i;
    return -1;
  };

  /* The batch is spent: a hard load, same reasoning as `Curate.commit` — a
     fresh request for /curate IS the next batch. */
  const nextBatch = () => window.location.assign("/curate");

  const advance = () =>
    setState((s) => {
      const n = nextOpen(s.settled, s.open);
      if (n < 0 || n === s.open) { nextBatch(); return s; }
      return { ...s, open: n };
    });

  /**
   * Judging STOPS the page — the curator's ask (2026-08-21): "I want it left
   * with the decision until I move to next". The auto-advance this replaces
   * swapped the form for the next recipe in the same breath as the save, so
   * the judgment was never seen landing — corrosive exactly when saves had
   * just been flaky. Now the row collapses to its receipt and stays; the
   * NEXT is a button (or Enter / N), and the page turns only when the
   * curator advances past the last one.
   */
  const settle = (id: string, verdict: Verdict) =>
    setState((s) => ({ ...s, settled: { ...s.settled, [id]: verdict } }));

  const judged = Object.keys(state.settled).length;
  /** No form is open: the pointed-at row is settled (or out of range). */
  const resting = !subjects[state.open] || !!state.settled[subjects[state.open]!.id];

  // Enter / N advance while resting — the hands never leave the keyboard.
  // Never while a form is open: Enter there belongs to the suggest boxes.
  useEffect(() => {
    if (!resting) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      if (e.key === "Enter" || e.key === "n") advance();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <>
      <Note>
        a batch of {subjects.length} · {judged} judged on this page ·{" "}
        {done + judged} of {total} overall ·{" "}
        <a href="/curate/list">all recipes</a>
      </Note>
      {subjects.map((s, i) => {
        const verdict = state.settled[s.id];
        if (!verdict && i === state.open) {
          return (
            <Curate key={s.id}
                    subject={{ ...s, mode: "batch" }}
                    onSave={async (v, d) => { await onSave(v, d); settle(s.id, v); }}
                    onAdvance={advance}
                    ingredient={ingredient}
                    search={search}
                    searchRecipes={(q) => searchRecipes(s.source, q)} />
          );
        }
        return (
          <Panel key={s.id}>
            {verdict ? (
              <Note>
                <span className="tag">{verdict}</span> {s.title}{" "}
                · <a href={`/curate?id=${s.id}`}>revisit ↗</a>
                {/* The just-judged row carries the way forward — the page
                    only moves when the curator does. */}
                {i === state.open && (
                  <>{" "}· <button type="button" className="btn btn-quiet"
                              onClick={advance}>Next recipe (N) →</button></>
                )}
              </Note>
            ) : (
              <button type="button" className="hit"
                      onClick={() => setState((st) => ({ ...st, open: i }))}>
                <span className="hit-name">{s.title}</span>
                <span className="hit-count">{s.source}</span>
              </button>
            )}
          </Panel>
        );
      })}
    </>
  );
}
