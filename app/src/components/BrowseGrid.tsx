"use client";

/**
 * The tickable kitchen — its own component, and that is the point.
 *
 * ── Why it is not inside `Pantry` any more ────────────────────────────────
 *
 * It was, and it made every tap in the drawer slow. Measured on a throttled
 * phone profile: **600 of the drawer's 968 elements were this grid** — 300
 * ingredients, two nodes each — and `display: none` hides a thing from PAINT,
 * not from React. So flipping one chip re-rendered three hundred checkboxes
 * nobody could see, every time, and the button appeared not to respond.
 *
 * As a sibling of `Pantry` rather than a child, a state change in one does not
 * reconcile the other. React only walks the subtree that changed, and these are
 * now two subtrees.
 *
 * ── It owns its own writes ────────────────────────────────────────────────
 *
 * The cost of the split: it cannot borrow `Pantry`'s optimistic override, so it
 * keeps its own. That is a small duplication and the right one — the alternative
 * is lifting shared state into a parent, which puts both subtrees back under one
 * render and undoes the whole exercise.
 *
 * The write is urgent and the round trip is detached, for the same reason it is
 * in `Pantry`: a transition marks its updates non-urgent, and a tick that waits
 * on the network is a tick that feels broken.
 */
import { memo, useState } from "react";
import { Section } from "./primitives";
import { useGrid } from "./GridStatus";
import type { BrowseAisle } from "@/lib/browse";
import type { IngredientState } from "./StateWidget";
import type { ActionResult } from "@/lib/result";

function Grid({ aisles, held, onSave }: {
  aisles: BrowseAisle[];
  /** Ingredient ids currently in the pantry, from the server. */
  held: string[];
  /** One call for a whole session of ticking — see `savePantryPicks`. */
  onSave: (add: string[], remove: string[]) => Promise<ActionResult>;
}) {
  /** What this component has changed since the page was rendered. */
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const { markDirty } = useGrid();
  const server = new Set(held);
  const on = (id: string) => local[id] ?? server.has(id);

  /*
    Ticking stages, it does not write.

    Filling in a kitchen is one job done in one sitting — twenty or thirty
    boxes — and it used to be twenty or thirty server actions, each rewriting
    the whole store file, all racing each other. Staging them makes it one
    call, and it makes the checkbox honest about itself: a box you can untick
    before saving has not committed to anything.
  */
  const tick = (id: string, next: boolean) =>
    setLocal((m) => {
      const copy = { ...m, [id]: next };
      // Back to what the server already thinks is not a change worth sending.
      if (next === server.has(id)) delete copy[id];
      return copy;
    });

  const changes = Object.entries(local);
  const add = changes.filter(([, v]) => v).map(([k]) => k);
  const remove = changes.filter(([, v]) => !v).map(([k]) => k);
  const dirty = changes.length;

  const save = () => {
    if (!dirty || saving) return;
    setSaving(true);
    setFailed(null);
    /* The grid behind the drawer is stale from this moment; it catches up when
       the drawer closes, like every other pantry write. */
    markDirty();
    void (async () => {
      try {
        const r = await onSave(add, remove);
        if (r.ok) setLocal({});
        else setFailed(r.error);
      } catch (e) {
        setFailed(e instanceof Error ? e.message : "Could not reach the server.");
      } finally {
        setSaving(false);
      }
    })();
  };

  if (aisles.length === 0) return null;

  return (
    <div className="shelf shelf-browse">
      <Section title="Your kitchen" foldable defaultOpen>
        <p className="note">
          Tick what you keep. Everything here is used by recipes we have;
          anything else, type it in the box above.
        </p>
        {aisles.map((g) => (
          <div className="aisle-group" key={g.aisle}>
            <p className="aisle-head">{g.aisle}</p>
            <div className="browse-grid">
              {g.items.map((i) => (
                <label key={i.id} className={on(i.id) ? "browse-item on" : "browse-item"}>
                  <input type="checkbox" checked={on(i.id)}
                         onChange={(e) => tick(i.id, e.target.checked)} />
                  <span>{i.name}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
        {/*
          The Save bar, and it only exists when there is something to save.

          Sticky to the bottom of the drawer's scroller rather than sitting
          under three hundred checkboxes, because the whole point is to tick a
          screenful, scroll, tick more — and a button that has scrolled away is
          a button you have to go looking for to finish the job.

          It says the COUNT, not just "Save". "Save 7" is a receipt for what
          you just did and a check on it: a number you did not expect is the
          only cheap way to notice you mis-tapped something.
        */}
        {dirty > 0 && (
          <div className="browse-save">
            {failed && <p className="fail">Not saved: {failed}</p>}
            <div className="browse-save-row">
              {/* Discard is quiet and second: it undoes work, and the shape of
                  the pair should say which one is the way forward. */}
              <button type="button" className="browse-discard"
                      disabled={saving} onClick={() => { setLocal({}); setFailed(null); }}>
                Discard
              </button>
              <button type="button" className="browse-commit"
                      disabled={saving} onClick={save}>
                {saving ? "Saving…" : `Save ${dirty} ${dirty === 1 ? "change" : "changes"}`}
              </button>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

/**
 * Memoised, and this is the difference between a fast tap and a slow one.
 *
 * Measured with a MutationObserver during a single chip tap: **900 attribute
 * writes**, every one of them on a checkbox in here. These are CONTROLLED
 * inputs, so any commit of this component re-applies `checked` to all three
 * hundred — and moving it out of `Pantry` was not enough on its own, because a
 * client re-render anywhere above still walks into it.
 *
 * The props come from a server component and are therefore stable between
 * server renders, which is exactly the condition `memo` needs: a chip tap
 * changes nothing here, so nothing here re-renders. Its own ticks still work —
 * those are internal state, which `memo` does not block.
 *
 * `held` is a fresh array on every server render, so this does NOT go stale:
 * a new array is a new reference, and the grid re-renders when the server has
 * something new to say.
 */
export const BrowseGrid = memo(Grid);