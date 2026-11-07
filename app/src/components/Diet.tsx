"use client";

/**
 * Dietary restrictions — USER-SPEC §6.
 *
 * Two separate settings because they are two separate questions, and the copy
 * has to carry the difference: a vegetarian filter that is 95% right is a
 * useful feature, and an allergy filter that is 95% right is a hazard.
 *
 * So this screen never says "safe", never says "free of", and names the
 * mechanism instead — §6: *"we hide what we can see. Always check the recipe."*
 *
 * ── Collapsed by default ───────────────────────────────────────────────────
 *
 * Twelve toggles and two paragraphs sat permanently at the top of the page you
 * cook from — about 450px, half a phone screen, for a setting most people
 * change twice ever. Closed, it is one line stating what is currently on.
 *
 * The safety copy is NOT lost by folding, which is the only thing that made
 * this defensible. §6's disclosure still appears in all three places it
 * matters: here whenever the control is open (you cannot set an allergen
 * without reading it), on the "hiding N recipes" line the setting produces, and
 * in every recipe modal. What folding removes is shouting it at someone who is
 * browsing, which is not one of those places.
 */
import { useEffect, useState } from "react";
import { Button, Note, Section, Toggle } from "./primitives";
import { useGrid } from "./GridStatus";
import type { ActionResult } from "@/lib/result";
/* The device's copies of the two writes, used when the page this control
   filters draws its shelves from the device — see `live`. */
import { excludeIngredient as liveExclude, updateDiet as liveUpdateDiet }
  from "@/lib/dual-write";
import { STATIC } from "@/lib/static-mode";
import { useOwner } from "@/lib/use-owner";
import { dietOf } from "@/lib/owner-core";
import { nameOf, resolveId } from "@/lib/client-data";

/**
 * What the closed control says — the setting itself, never a count.
 *
 * "2 filters" would be a label about our data model. "vegetarian · no shellfish"
 * is the thing the user actually told us, which is the only version worth one
 * line of permanent space.
 */
/*
  Excluded INGREDIENTS belong here too.

  They were invisible: `diet.excludes` has always filtered recipes (see
  `lib/diet`), but this summary only counted classes and allergens — so telling
  the app "don't recommend recipes with cilantro" changed what you were shown
  and left the restrictions control reading "No dietary filters". A standing
  instruction you cannot see is one you cannot remember making, and the first
  guess when the grid looks wrong is that the app is broken.
*/
function summarise(classes: string[], allergens: string[], excluded: string[]): string {
  if (!classes.length && !allergens.length && !excluded.length) return "No dietary filters";
  const bits: string[] = [];
  if (classes.length) bits.push(classes.join(", "));
  if (allergens.length) bits.push(`no ${allergens.join(", ")}`);
  /* Named, not counted. "2 ingredients" is a number you have to open something
     to understand; "not cilantro" is the instruction itself. */
  if (excluded.length) bits.push(`not ${excluded.join(", ")}`);
  return bits.join(" · ");
}

/**
 * Who says what is currently set — the one thing static mode moves.
 *
 * In server mode the page read the owner and passed the three selections down,
 * which is right: the same request that filtered the grid drew the control. An
 * exported page has no owner to read, so the control would open on "nothing
 * set" for someone who is vegetarian, over a grid that is correctly hiding pork
 * — a restriction you can see working and cannot see SET, which is the same §6
 * hazard as the reverse and reads as the setting having been lost.
 *
 * So static mode sources the selections from the device, and waits for it:
 * `Panel` seeds its own `useState` from these props, so it must not mount until
 * the store has answered.
 */
export function Diet(props: React.ComponentProps<typeof Panel>) {
  if (!STATIC) return <Panel {...props} />;
  return <FromDevice {...props} />;
}

function FromDevice(props: React.ComponentProps<typeof Panel>) {
  const { owner, ready } = useOwner();
  if (!ready) return null;
  const d = dietOf(owner, resolveId);
  return (
    <Panel {...props}
           selectedClasses={[...d.classes]}
           selectedAllergens={[...d.allergens]}
           excluded={[...d.excludes].map((id) => ({ id, name: nameOf(id) }))} />
  );
}

function Panel({ classes, allergens, selectedClasses, selectedAllergens,
                       excluded = [], onUnexclude, onChange, live: onDevice = false }: {
  classes: string[];
  allergens: string[];
  selectedClasses: string[];
  selectedAllergens: string[];
  /** Ingredient NAMES the user has excluded — USER-SPEC §6. */
  excluded?: Array<{ id: string; name: string }>;
  /**
   * The exclusion action itself — same shape as the store's, taking the flag.
   *
   * NOT a wrapper like `(id) => excludeIngredient(id, false)`. `DietBar` is a
   * server component, and an inline arrow is an ordinary function: it cannot be
   * serialised across the boundary, and passing one turns every render of this
   * page into an error. A server action can cross; a closure over one cannot.
   */
  onUnexclude?: (id: string, excluded: boolean) => Promise<ActionResult>;
  onChange: (next: { classes: string[]; allergens: string[] }) => Promise<ActionResult>;
  /**
   * The page this control filters reads its shelves from the DEVICE.
   *
   * Both writes then have to reach `client-store` as well as `owners.json`, or
   * the user sets "vegetarian" here and the grid below goes on offering pork —
   * a restriction you can see set and cannot see working, which is the exact
   * failure USER-SPEC §6 treats as a hazard rather than a bug.
   *
   * The wrappers are imported HERE rather than passed in, for the reason the
   * comment on `onUnexclude` gives: `DietBar` is a server component and cannot
   * hand a client function across the boundary. It hands a boolean instead.
   */
  live?: boolean;
}) {
  /* Renamed on the way in: `live` is already the name of the chips this panel
     has not cleared yet, a few lines down. */
  const setDiet = onDevice ? liveUpdateDiet : onChange;
  const unset = onDevice ? liveExclude : onUnexclude;
  const [c, setC] = useState(new Set(selectedClasses));
  const [a, setA] = useState(new Set(selectedAllergens));
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  /**
   * Exclusions this panel has cleared, before the server has said so.
   *
   * Removing one used to await `excludeIngredient` inside the transition, so
   * the chip stayed on screen — and "saving…" stayed under it — for the write
   * plus the full-page revalidate the write triggered. Clearing three in a row
   * meant three of those, and the buttons disabled themselves in between.
   *
   * Now the chip goes on the click and the round trip is detached. If the write
   * fails it comes back, which is the only honest way to undo an optimistic
   * removal.
   */
  const { markDirty, flush } = useGrid();
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const drop = (id: string, gone: boolean) =>
    setDropped((s) => {
      const n = new Set(s);
      if (gone) n.add(id); else n.delete(id);
      return n;
    });

  const unexclude = (id: string) => {
    if (!unset) return;
    drop(id, true);
    markDirty();
    void (async () => {
      try {
        const r = await unset(id, false);
        if (!r.ok) { drop(id, false); setFailed(r.error); }
      } catch (e) {
        drop(id, false);
        setFailed(e instanceof Error ? e.message : "Could not reach the server.");
      }
    })();
  };

  /** The grid catches up when the panel shuts, not between clicks. */
  const done = () => { setOpen(false); flush(); };

  const live = excluded.filter((e) => !dropped.has(e.id));

  /*
    Forget a removal once the server agrees with it.

    Otherwise `dropped` only ever grows, and an id in it shadows that
    ingredient forever — excluding cilantro again a week later would write to
    the store and show nothing, because this set still remembers clearing it.
    Keyed on the ids so it settles instead of running every render.
  */
  const serverIds = excluded.map((e) => e.id).join(",");
  useEffect(() => {
    setDropped((s) => {
      if (!s.size) return s;
      const ids = new Set(excluded.map((e) => e.id));
      const n = new Set([...s].filter((id) => ids.has(id)));
      return n.size === s.size ? s : n;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverIds]);

  /* Detached, like the removal above: the toggle has already flipped from `c`
     and `a`, and nothing about the interaction depends on the answer. */
  const push = (nc: Set<string>, na: Set<string>) => {
    markDirty();
    void (async () => {
      try {
        const r = await setDiet({ classes: [...nc], allergens: [...na] });
        setFailed(r.ok ? null : r.error);
      } catch (e) {
        setFailed(e instanceof Error ? e.message : "Could not reach the server.");
      }
    })();
  };

  const flip = (set: Set<string>, k: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(k); else next.delete(k);
    return next;
  };

  const anyOn = c.size > 0 || a.size > 0 || live.length > 0;

  if (!open) {
    return (
      <button type="button" className={anyOn ? "dietchip on" : "dietchip"}
              aria-expanded={false} onClick={() => setOpen(true)}>
        <span className="dietchip-what">{summarise([...c], [...a], live.map((e) => e.name))}</span>
        <span className="dietchip-do">{anyOn ? "change" : "set"}</span>
      </button>
    );
  }

  return (
    <Section title="Diet"
             action={<Button kind="quiet" onClick={done}>Done</Button>}>
      {failed && <p className="fail">Not saved: {failed}</p>}
      {/*
        The toggles FLOW, rather than each taking a line of its own.

        A `Toggle` is a block-level row, which is right for a settings form of
        four unrelated switches and wrong for two closed sets of short words:
        five restrictions and nine allergens came to fourteen stacked lines, so
        the panel scrolled and no group could be read as a group. Wrapped, each
        set is a shape the eye takes in at once — which is what a set of
        checkboxes over a fixed vocabulary should be.
      */}
      <div className="dietset">
        {classes.map((k) => (
          <Toggle key={k} label={k} checked={c.has(k)} onChange={(v) => {
            const n = flip(c, k, v); setC(n); push(n, a);
          }} />
        ))}
      </div>
      {/* No note about halal. Nobody asked why an option they cannot see is
          missing, and answering an unasked question is the thing being cut.
          The reasoning lives in `CLASSES` in lib/diet, which is where a
          decision belongs. */}
      <p className="note" style={{ marginTop: 10 }}><b>Allergens</b></p>
      <div className="dietset">
        {allergens.map((k) => (
          <Toggle key={k} label={k} checked={a.has(k)} onChange={(v) => {
            const n = flip(a, k, v); setA(n); push(c, n);
          }} />
        ))}
      </div>
      {live.length > 0 && (
        <>
          <p className="note" style={{ marginTop: 10 }}><b>Ingredients you excluded</b></p>
          {/* Removable HERE, because this is where they are named. Set from a
              chip, undone from a chip or from here — the instruction is one
              thing however it was given. */}
          <div className="dietset">
            {live.map((e) => (
              /* Not disabled while something else is in flight. Clearing three
                 exclusions is one gesture repeated, and a button that goes dead
                 between the taps is the lag wearing different clothes. */
              <button key={e.id} type="button" className="mealchip on"
                      disabled={!onUnexclude}
                      onClick={() => unexclude(e.id)}>
                {e.name} ✕
              </button>
            ))}
          </div>
        </>
      )}
      <Note>
        Also hides recipes with an ingredient we couldn’t identify. We hide what
        we can see and never claim a recipe is free of anything.{" "}
        <b>Always check the recipe.</b>
      </Note>
      {/* No "saving…". It was the visible half of the problem: every control
          here now writes detached and shows its own new state on the click, so
          the only thing worth saying is when a save FAILS — which `failed`
          says, at the top, where it cannot be missed. */}
    </Section>
  );
}
