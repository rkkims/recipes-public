"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { saveCuration, type Curation } from "@/lib/curation";
import { idForName } from "@/lib/data";
import type { Draft } from "@/components/Curate";

/** Only lines actually written on — an emptied box leaves no row behind. */
const lineNotes = (d: Draft) =>
  Object.entries(d.line_notes)
    .map(([raw, note]) => ({ raw, note: note.trim() }))
    .filter((x) => x.note);

/**
 * Main-ingredient keys, resolved.
 *
 * A resolved line already stored its node id and passes straight through. An
 * unresolved one stored `raw:<the line>`, and the answer is in the correction
 * the curator typed beside it in the same pass — "should be…" is exactly the
 * field that says what the line is, and it now autosuggests real nodes, so the
 * text it holds is usually a node name verbatim.
 *
 * A key that still will not resolve is DROPPED rather than stored. §4c makes
 * main ingredients ids because ids survive renames and merges; a raw line stored
 * as if it were an id would be a dangling reference that `nameOf` echoes back as
 * itself, and the curation file is the parser's test set — it has to hold facts,
 * not intentions.
 */
function resolvedMains(d: Draft): string[] {
  const out: string[] = [];
  for (const key of d.main_ingredients) {
    if (!key.startsWith("raw:")) { out.push(key); continue; }
    const raw = key.slice(4);
    const id = idForName(d.line_notes[raw] ?? "");
    if (id) out.push(id);
  }
  return out;
}

/** The write itself, with no navigation — both entry points below share it. */
function save(verdict: "keep" | "drop" | "skip", d: Draft) {
  saveCuration({
    recipe_id: d.recipe_id,
    verdict,
    ...(verdict === "drop" && d.drop_reason
      ? { drop_reason: d.drop_reason as Curation["drop_reason"] } : {}),
    ...(d.equipment.length ? { equipment: d.equipment } : {}),
    ...(d.quality ? { quality: d.quality } : {}),
    /* The primary keeps riding the legacy field so nothing re-reads old
       rows; the list is only written when there is genuinely more than one. */
    cuisine: d.cuisines[0] ?? "unresolved",
    ...(d.cuisines.length > 1 ? { cuisines: d.cuisines } : {}),
    ...(d.dish_type ? { dish_type: d.dish_type } : {}),
    make_ahead: d.make_ahead,
    ...(Object.keys(d.tiers).length
      ? { tier_overrides: Object.entries(d.tiers).map(([raw, optional]) => ({ raw, optional })) }
      : {}),
    /* Variant resolutions, names → ids, unresolvable answers dropped — the
       same contract as main ingredients: this file holds facts, and a name
       that is not a node is an intention (RESOLUTION-SPEC §1). */
    ...((() => {
      const rs = Object.entries(d.resolutions)
        .map(([raw, name]) => ({ raw, to: idForName(name.trim()) }))
        .filter((x): x is { raw: string; to: string } => !!x.to);
      return rs.length ? { resolutions: rs } : {};
    })()),
    ...(d.substitutes.length ? { substitutes: d.substitutes } : {}),
    /* Ingredients the source omitted — names → ids, the resolutions contract
       again: what will not resolve is dropped, not stored. `pending:` ids are
       excluded too — a promotion not yet applied has no durable id, and this
       file must hold references that still resolve years from now. */
    ...((() => {
      const ids = [...new Set(d.added.map((n) => idForName(n.trim()))
        .filter((x): x is string => !!x && !x.startsWith("pending:")))];
      return ids.length ? { added_ingredients: ids } : {};
    })()),
    /* Per-line recipe links, ids only — the titles were the form's
       convenience. Their ids already rode into `components` at pick time. */
    ...(Object.keys(d.line_components).length
      ? { line_components: Object.entries(d.line_components)
          .filter(([, r]) => r.id !== d.recipe_id)
          .map(([raw, r]) => ({ raw, recipe_id: r.id })) }
      : {}),
    ...(d.bad_lines.length ? { bad_lines: d.bad_lines } : {}),
    ...(lineNotes(d).length ? { line_notes: lineNotes(d) } : {}),
    ...(resolvedMains(d).length
      ? { main_ingredients: resolvedMains(d).slice(0, 2) } : {}),
    /* Ids only — the titles were the form's convenience. Self-reference
       cannot happen (the picker filters it) but is stripped anyway: the
       curation file is the parser's test set, and a recipe requiring itself
       is a fact about a bug, not about a dish. */
    ...(d.components.length
      ? { components: d.components.map((c) => c.id)
          .filter((cid) => cid !== d.recipe_id).slice(0, 5) }
      : {}),
    ...(d.note ? { note: d.note } : {}),
  });
  revalidatePath("/curate");
  revalidatePath("/curate/list");
}

/**
 * Save, then GO TO THE NEXT RECIPE.
 *
 * `revalidatePath` alone did not move the queue on. The write landed and the
 * server was right — a fresh request returned the next recipe and the count had
 * advanced — but the open page kept showing the one just judged, so a reviewer
 * pressing Keep saw nothing happen and had no way forward. On a screen whose
 * entire design is "decide fast and move", that is the whole loop broken.
 *
 * A redirect is the fix rather than a harder refresh: the queue is defined as
 * "the next uncurated recipe", so asking for `/curate` again IS asking for the
 * next one. It also makes the back button walk back through the recipes judged,
 * which is what a reviewer expects of a queue.
 */
export async function submitCuration(verdict: "keep" | "drop" | "skip", d: Draft) {
  save(verdict, d);
  /*
    No navigation here. The client does it — see `Curate.commit`.

    Four attempts at moving the queue on from the server or the router failed,
    each for its own reason, and they are written down so nobody repeats them:

      - `revalidatePath` alone: the write landed and the server was right, but
        the open page kept showing the recipe just judged
      - `redirect("/curate")`: a same-URL navigation, answered by the client
        Router Cache from the copy it already held
      - `router.refresh()` after the awaited action: the code after the await
        never runs — the RSC update re-renders the component and the transition
        goes with it
      - `redirect("/curate?after=…")`: the server answered the action POST with a
        303 and the router did not follow it

    A queue screen loads one recipe at a time and is used for hours; a full
    navigation per verdict costs a few hundred milliseconds and guarantees the
    next recipe and fresh data. That trade is worth making here and nowhere else.
  */
}

/**
 * Same save, but for a revisit — land back on the list instead of on the next
 * queue item.
 *
 * A reviewer who opened one row from the list wants to be back in the list, not
 * dropped into the queue at a different recipe. Being silently moved somewhere
 * else is how a correction gets applied to the wrong recipe.
 */
export async function submitAndReturn(verdict: "keep" | "drop" | "skip", d: Draft) {
  /* Not `submitCuration` — that redirects to the queue now, and a redirect
     throws, so this one would never run. */
  save(verdict, d);
  redirect("/curate/list");
}
