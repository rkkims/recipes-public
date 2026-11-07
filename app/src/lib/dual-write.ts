"use client";

/**
 * One tap, two copies — the bridge the inversion crosses on.
 *
 * STATIC-SPEC §2 moves the pantry to the device, and §7 stages that so each
 * slice ships alone. Slice B was the awkward middle: the home grid and the
 * pantry drawer read the DEVICE's copy, while `/list`, `/calendar`,
 * `/my-recipes`, the recipe modal, the reminder script and the creator shelves
 * still read `owners.json`. A write that landed in only one of them would make
 * the two halves of the product disagree about the same kitchen — the grocery
 * list missing the thing you just added from the grid.
 *
 * So every mutation the converted surfaces can reach goes through here:
 *
 *   1. **The device first, synchronously.** The client reducer runs and the
 *      store notifies before this function returns, so the grid has already
 *      recomputed by the time the tap's frame ends. That is the whole point of
 *      the inversion — no round trip between a chip and its consequences.
 *   2. **The server after, detached.** The same arguments go to the same server
 *      action that has always handled this control. Nothing awaits it. It
 *      carries its own `resolveId`, its own cookie handling and its own
 *      revalidation, so the unconverted pages catch up exactly as they do
 *      today.
 *   3. **Failures are logged and dropped.** No retry queue in this slice, on
 *      purpose: the device holds the truth, and the next successful write of
 *      the same section carries the whole section with it — the server copy
 *      self-heals rather than needing a replay log that could apply an old
 *      intention to a newer state. `lib/queue` remains the offline path for
 *      the grocery page, which is a different problem (a device with no
 *      signal, not a server that refused) — see `mirror`'s `defer`.
 *
 * ── Why the beacons are silenced ──────────────────────────────────────────
 *
 * Both shells derive `pantry_event` / `cook_event` / `cook_undo` from the same
 * diff (`owner-core.pantryEvents`) or the same write, and BOTH would emit here:
 * the client store beacons to `/api/events`, and the server action appends to
 * `events.jsonl` from inside `store.mutate` / `store.recordCook`. That is not a
 * duplicate row to be cleaned up later — BEHAVIOR-SPEC's derivations count
 * adds, so one tick would read as two, and every figure built on the log
 * inherits it. The client's emission is switched off for exactly the length of
 * the reducer call (`client-store.config.beacons`) and the server's stays,
 * because the server's is the one with somewhere durable to write.
 *
 * **In static mode the flag stays ON**, which is the other half of the same
 * argument: there is no server emission to collide with, so silencing the
 * device's would leave the behavioural record empty rather than accurate. The
 * somewhere-durable is `workers/api.ts` now — see `mirror`'s static branch.
 *
 * The cook log arriving here (below) puts `cook_event` and `cook_undo` under
 * exactly the same rule, and it is worth saying which emitter wins where,
 * because the answer differs by build and by nothing else:
 *
 *   - **Server mode** — `guarded` silences the device for the length of the
 *     reducer, and `store.recordCook` appends the row. ONE `cook_event`, in
 *     `data/events/events.jsonl`.
 *   - **Static mode** — no server half runs at all, the flag never goes down,
 *     and `client-store.recordCook` beacons the row. ONE `cook_event`, at
 *     `API_ORIGIN/api/events`.
 *
 * Neither mode has a path where both fire, and neither has one where neither
 * does. The third case — the same id arriving twice — is answered a layer
 * down, in the reducer: `owner-core.recordCook` returns the cook it already
 * holds, and both shells ask whether they are the ones who made it before
 * emitting.
 *
 * ── The cook log is mirrored too now, and the id is why it can be ─────────
 *
 * `madeIt`, `settleUp`, `rateCook`, `undoMadeIt` and the calendar's three
 * writers ran on the server ALONE for a slice, with the device re-reading the
 * owner afterwards (`resyncFromServer`). The reason was one fact: three of them
 * address a cook BY ID, and two shells minting their own ids means the id the
 * modal is holding does not exist on the other side. Mirroring the create and
 * not the amendments would have left the device with a cook nobody could
 * correct, which is worse than a cook it had not heard of.
 *
 * That arrangement had to end, and static mode is what ended it: there is no
 * server there, so the action no-ops, `resyncFromServer` answers "none", and
 * the device records NOTHING. A cook leaves no trace, `cook_event` never fires,
 * and the residency figure GO-LIVE's distribution plan turns on cannot be
 * measured on the one build it will be measured from.
 *
 * The fix is not a mapping table. **The DEVICE mints the id and the server
 * accepts it** (`owner-core.mintCookId` / `mintPlanId`; the reducers and the
 * actions take an optional id and fall back to minting when it is absent). One
 * identity, minted once, in both copies — so `settleUp` on the device and
 * `settleUp` on the server name the same cook, and the amendments mirror like
 * any tick. What the device could not compute for itself is small and named at
 * `requiresOf`: the snapshot of what the recipe required at the time.
 */

import * as client from "./client-store";
import { load, resolveId } from "./client-data";
import { STATIC } from "./static-mode";
import { expandComponents, type Recipe } from "./match";
import { dayKey, mintCookId, mintPlanId, ownAsRecipes } from "./owner-core";
import type { ActionResult } from "./result";
import type { StateFlags } from "./owner-core";
import type { NewWrite } from "./queue";
import {
  addListNote as srvAddListNote,
  addToGroceryList as srvAddToGroceryList,
  answerAsk as srvAnswerAsk,
  dismissRecipe as srvDismissRecipe,
  editOwnRecipe as srvEditOwnRecipe,
  excludeIngredient as srvExcludeIngredient,
  finishFirstRun as srvFinishFirstRun,
  madeIt as srvMadeIt,
  moveListToPantry as srvMoveListToPantry,
  noteOpened as srvNoteOpened,
  planMeal as srvPlanMeal,
  planNoteEntry as srvPlanNoteEntry,
  rateCook as srvRateCook,
  removeOwnRecipe as srvRemoveOwnRecipe,
  saveOwnRecipe as srvSaveOwnRecipe,
  settleUp as srvSettleUp,
  setNote as srvSetNote,
  undoMadeIt as srvUndoMadeIt,
  unplanMeal as srvUnplanMeal,
  putAwayCart as srvPutAwayCart,
  reviewPantryAfterAbsence as srvReviewPantryAfterAbsence,
  saveRecipe as srvSaveRecipe,
  savePantryPicks as srvSavePantryPicks,
  setIngredientNote as srvSetIngredientNote,
  tickOffItem as srvTickOffItem,
  updateDiet as srvUpdateDiet,
  updateState as srvUpdateState,
  upgradeOwnRecipes as srvUpgradeOwnRecipes,
} from "@/app/actions";
import { setFollow as srvSetFollow } from "@/app/creators/actions";
import { enqueue } from "./queue";

/**
 * Apply on the device, then tell the server — the shape every writer below has.
 *
 * `apply` runs inside the beacon suppression and inside a try, because the
 * reducers throw for real reasons a person can act on ("that is not on your
 * list. Reload the page.") and the surfaces already know how to show an
 * `ActionResult`. A device write that threw must NOT reach the server: the two
 * copies would then differ by exactly the write that failed here.
 */
/**
 * Every server call this module has in the air.
 *
 * The mirror sends detached, which is the point — a tap must not wait on a
 * network. It also means a `resyncFromServer` running a moment later could
 * read the owner file BEFORE a tick made two seconds ago has reached it, and
 * then overwrite the device with a copy that is missing the tick. The user's
 * ingredient would come back from the dead, which is the exact class of bug
 * this bridge exists to prevent.
 *
 * So the promises are tracked and `serverSettled` waits for them. Nothing else
 * reads this set: it is not a queue, and a failed call leaves it exactly as an
 * ignored failure should — see the module header on self-healing.
 */
const inflight = new Set<Promise<unknown>>();

function track<T>(p: Promise<T>): Promise<T> {
  inflight.add(p);
  void p.catch(() => {}).finally(() => inflight.delete(p));
  return p;
}

/**
 * Wait until nothing this module sent is still in the air.
 *
 * A loop rather than one `allSettled`, because settling one call can start
 * another — an undo fired from a toast, a second chip under a fast finger —
 * and a resync that read between the two would have the same hole.
 */
export async function serverSettled(): Promise<void> {
  while (inflight.size > 0) await Promise.allSettled([...inflight]);
}

/**
 * The two writes a shop can swallow — UX-SPEC §12, after the inversion.
 *
 * `defer` names the queued form of a mirror's SERVER half. It is set for
 * exactly the two operations `lib/queue` was ever about (tick something off,
 * type something in), and only those, because they are the two taps that happen
 * where the signal is worst and they are the two that replay safely: both are
 * idempotent in the direction they move, so a queue drained twice cannot
 * corrupt anything.
 *
 * What changed with the device holding the pantry: the tick itself no longer
 * needs the queue at all. It lands in `localStorage` on the tap's own frame and
 * survives a reload with no signal because it was never in flight. What is
 * still lost without a queue is the SERVER's copy — the one push reminders and
 * a second device read — so that half, and only that half, is what gets parked.
 */
function mirror(
  apply: () => void, send: () => Promise<ActionResult>, defer?: NewWrite,
): ActionResult {
  /**
   * In static mode there is no second copy, so there is nothing to mirror TO.
   *
   * STATIC-SPEC §2: the device is the only truth until the API Worker lands.
   * The server half is skipped here rather than left to no-op inside the
   * aliased action module, because "skipped" and "attempted and ignored" differ
   * in one visible way — a queued write. `defer` parks a SERVER copy for a
   * shop with no signal, and parking one for a server that does not exist
   * would fill `lib/queue` with writes that can never drain and put "catching
   * up" in the status bar forever.
   *
   * The unsettled-seed deferral below goes with it, and for the same reason:
   * it exists because a write that beat the SERVER's copy home would become
   * the blob and strand the real pantry. With no server copy to lose the race
   * to, the write is simply the write.
   */
  if (STATIC) {
    try {
      /**
       * `apply` rather than `guarded(apply)` — the flag flips here, and this is
       * the moment the module header predicted it would.
       *
       * The suppression exists because BOTH shells derive the same
       * `pantry_event` / `cook_event` from the same diff, and two emissions
       * for one tick would read as two ticks in every figure built on the log.
       * The server's was the one kept, because it had somewhere durable to
       * write. In static mode there is no server half at all, so silencing the
       * device's emission does not prevent a double count — it prevents the
       * ONLY count, and the behavioural record goes quietly empty on exactly
       * the build GO-LIVE measures residency from (`workers/api.ts` is the
       * somewhere durable now).
       */
      apply();
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    return { ok: true };
  }

  if (defer && typeof navigator !== "undefined" && !navigator.onLine) {
    /* Parked rather than attempted: a fetch with no signal is a rejected
       promise and a warning in a console nobody is reading in an aisle. */
    enqueue(defer);
  } else {
    void track(send())
      .then((r) => {
        if (!r.ok) console.warn("[dual-write] server copy refused:", r.error);
      })
      .catch((e) => console.warn("[dual-write] server copy unreachable:", e));
  }

  /**
   * A write before the seed has landed would BE the seed — and the wrong one.
   *
   * `client-store.seed` refuses to write over an existing blob, which is the
   * right rule and the reason this exists: the first write of the session
   * creates a blob, so a write that beat the seed home would leave the device
   * holding one ingredient and the server's whole pantry unreachable. It is
   * not hypothetical — `noteOpened` fires from the recipe modal's mount, which
   * races the grid's seed on the very first `?recipe=` navigation.
   *
   * So an unsettled seed defers this half a turn. Every converted surface
   * renders a skeleton until the seed has settled, so nothing a person can tap
   * takes this path; what does take it reports success, because the server copy
   * is already on its way and the device's copy is a queued certainty rather
   * than a maybe.
   */
  if (!seeded) {
    void seedFromServer().catch(() => {}).then(() => {
      try { guarded(apply); }
      catch (e) { console.warn("[dual-write] device copy refused:", e); }
    });
    return { ok: true };
  }
  try {
    guarded(apply);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  return { ok: true };
}

/** The reducer runs with the behavioural record silenced — see the header. */
function guarded(apply: () => void): void {
  try {
    client.config.beacons = false;
    apply();
  } finally {
    /* Restored in a `finally` rather than after the call: a reducer that
       throws would otherwise leave the record silenced for the rest of the
       session, and the symptom would be a behavioural log that quietly stops. */
    client.config.beacons = true;
  }
}

/* The wrappers keep the ACTIONS' names and signatures exactly, so a converted
   surface swaps one import line and nothing else. Ids are resolved through the
   bundle's redirect map before they reach a device row — the server action
   resolves through its own copy of the same table, so the two stores key on the
   same id and a merge cannot split one ingredient into two rows.
   `txt_` rows pass through untouched, as they do everywhere. */

export async function updateState(
  ingredientId: string, flags: StateFlags,
): Promise<ActionResult> {
  return mirror(
    () => { client.setState(resolveId(ingredientId), flags); },
    () => srvUpdateState(ingredientId, flags),
  );
}

export async function savePantryPicks(
  add: string[], remove: string[],
): Promise<ActionResult> {
  return mirror(
    () => { client.setManyInPantry(add.map(resolveId), remove.map(resolveId)); },
    () => srvSavePantryPicks(add, remove),
  );
}

export async function addToGroceryList(ingredientIds: string[]): Promise<ActionResult> {
  return mirror(
    () => { client.addToList(ingredientIds.map(resolveId)); },
    () => srvAddToGroceryList(ingredientIds),
  );
}

export async function moveListToPantry(ingredientIds: string[]): Promise<ActionResult> {
  return mirror(
    () => { client.moveToPantry(ingredientIds.map(resolveId)); },
    () => srvMoveListToPantry(ingredientIds),
  );
}

/** No `resolveId`: the whole point of a typed row is that it is not vocabulary. */
export async function addListNote(text: string): Promise<ActionResult> {
  return mirror(
    () => { client.addFreeText(text); },
    () => srvAddListNote(text),
    { kind: "note", text },
  );
}

export async function answerAsk(
  askId: string, yes: boolean, grants: string,
): Promise<ActionResult> {
  return mirror(
    () => { client.answerClarification(askId, yes, resolveId(grants)); },
    () => srvAnswerAsk(askId, yes, grants),
  );
}

export async function finishFirstRun(answer: {
  have: string[]; classes: string[]; allergens: string[];
}): Promise<ActionResult> {
  return mirror(
    () => {
      client.completeOnboarding({
        have: answer.have.map(resolveId),
        classes: answer.classes,
        allergens: answer.allergens,
      });
    },
    () => srvFinishFirstRun(answer),
  );
}

export async function dismissRecipe(recipeId: string): Promise<ActionResult> {
  return mirror(
    () => { client.toggleDismissed(recipeId); },
    () => srvDismissRecipe(recipeId),
  );
}

export async function saveRecipe(recipeId: string): Promise<ActionResult> {
  return mirror(
    () => { client.toggleSaved(recipeId); },
    () => srvSaveRecipe(recipeId),
  );
}

/**
 * Follow a creator — CREATORS-TAB-SPEC §4, through the same bridge as a tick.
 *
 * It was a server action alone (`app/creators/actions.setFollow`), gated on an
 * account, and that was always one layer too high: `owner.follows` is a group
 * in the owner blob like any other and `client-store.setFollowing` has held it
 * since slice A. So it becomes an ordinary mirror — the device first and
 * synchronously, the server copy behind it — and in static mode the server half
 * is skipped exactly as every other write's is.
 *
 * TWO ids, and both are needed. The device keys follows by `creator_id`, which
 * is the id every reader joins on; the server action takes the HANDLE, because
 * resolving one to the other is a claim-overlay read that only a filesystem
 * can answer. Passing both is cheaper than teaching either side the other's
 * vocabulary, and the caller has them both already.
 */
export async function setFollow(
  handle: string, creatorId: string, on: boolean,
): Promise<ActionResult> {
  return mirror(
    () => { client.setFollowing(creatorId, on); },
    () => srvSetFollow(handle, on),
  );
}

/**
 * The lightest write in the product, and the one Explore is built on.
 *
 * It has to reach the DEVICE, because the shelf that reads `opened_at` is the
 * device's now — a mark that only landed on the server would leave Explore
 * offering the same card forever.
 */
export async function noteOpened(recipeId: string): Promise<ActionResult> {
  return mirror(
    () => { client.markOpened(recipeId); },
    () => srvNoteOpened(recipeId),
  );
}

export async function excludeIngredient(
  ingredientId: string, excluded: boolean,
): Promise<ActionResult> {
  return mirror(
    () => { client.setExcluded(resolveId(ingredientId), excluded); },
    () => srvExcludeIngredient(ingredientId, excluded),
  );
}

/** The other diet axis, and it stays a separate write — see `setDiet`. */
export async function updateDiet(
  patch: { classes: string[]; allergens: string[] },
): Promise<ActionResult> {
  return mirror(
    () => { client.setDiet(patch); },
    () => srvUpdateDiet(patch),
  );
}

export async function tickOffItem(
  ingredientId: string, enough: boolean,
): Promise<ActionResult> {
  return mirror(
    () => { client.tickOff(resolveId(ingredientId), enough); },
    () => srvTickOffItem(ingredientId, enough),
    /* The UNRESOLVED id, deliberately: the server action resolves through its
       own copy of the redirect table when the queue finally drains, exactly as
       it does for a live call. Sending the device's already-resolved id would
       be fine today and wrong the day the two tables differ. */
    { kind: "tick", id: ingredientId, enough },
  );
}

export async function putAwayCart(
  moveIds: string[], clearRest = true,
): Promise<ActionResult> {
  return mirror(
    () => { client.putAway(moveIds.map(resolveId), clearRest); },
    () => srvPutAwayCart(moveIds, clearRest),
  );
}

export async function setIngredientNote(
  ingredientId: string, note: string,
): Promise<ActionResult> {
  return mirror(
    () => { client.setDetail(resolveId(ingredientId), { note: note.trim() }); },
    () => srvSetIngredientNote(ingredientId, note),
  );
}

export async function reviewPantryAfterAbsence(gone: string[]): Promise<ActionResult> {
  return mirror(
    () => { client.reviewPantry(gone.map(resolveId)); },
    () => srvReviewPantryAfterAbsence(gone),
  );
}

/** The standing note on a recipe — "my version", the sentence that outlives a cook. */
export async function setNote(recipeId: string, note: string): Promise<ActionResult> {
  return mirror(
    () => { client.setRecipeNote(recipeId, note); },
    () => srvSetNote(recipeId, note),
  );
}

/* ── the user's own recipes ──────────────────────────────────────────────────

   Server-MINTED, device-mirrored. `saveOwnRecipe` runs the parser, mirrors the
   thumbnail off someone else's CDN and files the demand-board row — server work
   by construction (STATIC-SPEC §7b keeps add-by-URL a server action for this
   slice), and it is what decides the recipe's id. So the create goes through
   `afterServer` and the device ADOPTS the result, which is what makes the id on
   the device the same id the server holds.

   That is the precondition for the two below being ordinary mirrors: an edit
   and a delete address a recipe BY ID, which is exactly the shape that could
   not be mirrored for the cook log (two shells minting their own ids). Own
   recipes have one minter, so they can. */

export function saveOwnRecipe(r: {
  title: string; url: string; source: string; image?: string;
  requires: string[]; note?: string; steps?: string;
}): Promise<ActionResult> {
  return afterServer(srvSaveOwnRecipe, r);
}

export async function editOwnRecipe(
  recipeId: string,
  patch: { title?: string; url?: string; requires?: string[]; note?: string; steps?: string },
): Promise<ActionResult> {
  return mirror(
    () => {
      client.updateOwnRecipe(recipeId, {
        ...patch,
        ...(patch.requires ? { requires: patch.requires.map(resolveId) } : {}),
      });
    },
    () => srvEditOwnRecipe(recipeId, patch),
  );
}

export async function removeOwnRecipe(recipeId: string): Promise<ActionResult> {
  return mirror(
    () => { client.deleteOwnRecipe(recipeId); },
    () => srvRemoveOwnRecipe(recipeId),
  );
}

/**
 * A pasted recipe that curation has since taken into the corpus, folded in.
 *
 * The return trip of the request queue: a URL the user typed in themselves
 * becomes a curated recipe, and their note, steps, cooks and plans move onto
 * the corpus row while the hand-entered ingredient list is replaced by the
 * curated one. Deciding WHICH rows move needs `corpusTwin`, which reads the
 * recipe index off disk, so this cannot be a device write and is not one.
 *
 * It ran in `/my-recipes`'s server component BODY — a write during render,
 * which the stage-1 map flagged. As a mounted call it is the same write at a
 * moment that is allowed to have one, and the device is told afterwards only
 * when something actually moved: a resync is an adoption of the server's whole
 * owner, and doing that on every visit to a page would be a sync tier pointed
 * the wrong way.
 */
export async function upgradeOwnRecipes(): Promise<"moved" | "none"> {
  await serverSettled();
  const r = await srvUpgradeOwnRecipes();
  if (!r.moved) return "none";
  await resyncFromServer();
  return "moved";
}

/**
 * Bring the server's copy across on first run — STATIC-SPEC §2's seeding step.
 *
 * Called once per device, from the first client mount that finds no blob. The
 * owner comes back through `currentOwner`, which is the same read every page
 * does; a visitor the server has never seen returns null and the device simply
 * starts empty, which is what first run is for.
 *
 * NOT a sync tier. There is no pull-on-every-load here and there must not be:
 * the device is authoritative the moment it holds anything (§2), so a later
 * pull would let a stale server copy overwrite a pantry filled offline. The
 * real sync is slice C's, with `revised_at` deciding per group.
 */
/* One attempt per page life, however many surfaces ask. The grid and the
   drawer both mount wanting the same answer, and two concurrent asks would
   mean two reads of the owner file and a race to write the same blob — the
   guard inside `seed` would refuse the loser, so the damage is a wasted round
   trip rather than lost data, but a promise costs nothing and says so. */
let asked: Promise<"seeded" | "held" | "new"> | null = null;
/* Settled, whichever way it went — the flag `mirror` reads. A refused or
   failed seed still counts as settled: the device is then genuinely empty and
   its own writes are the only truth it will get this visit. */
let seeded = false;

/**
 * Bring the device back into step after a write only the server could make.
 *
 * ── What is left of this, now that the cook log has moved ─────────────────
 *
 * This was built for the cook log, and the cook log does not need it any more:
 * the device mints the ids and mirrors the writes like everything else (see the
 * header). What remains are the TWO writes that are genuinely the server's,
 * and both are about a recipe the user pasted rather than about their kitchen:
 *
 *   - **`saveOwnRecipe`** (through `afterServer`) runs the parser, mirrors the
 *     thumbnail off someone else's CDN and files the demand-board row. It is
 *     what DECIDES the recipe's id, by construction — STATIC-SPEC §7b keeps
 *     add-by-URL a server action and §3 disables it in static mode outright.
 *   - **`upgradeOwnRecipes`** decides which of the user's own rows have become
 *     corpus recipes, which needs `corpusTwin` and therefore the recipe index
 *     off disk.
 *
 * Nothing else calls either function, and nothing about the cook log does. Both
 * survivors are server-minted by nature rather than by an unresolved id
 * question, which is the distinction that matters: minting could be moved for
 * a cook, and cannot be for a parse.
 *
 * It reads the owner back and ADOPTS it (`client-store.adopt`), which is the
 * one direction `seed` refuses.
 *
 * ── The race, and how it is closed ────────────────────────────────────────
 *
 * Mirrored writes are fired detached, so at the moment one of these runs there
 * may be a tick from four seconds ago still in flight — or, now, a cook. Reading
 * the owner file before that lands would adopt a copy without it, and the
 * ingredient the user just ticked would come back. `serverSettled()` waits for
 * every mirrored call first — including any that start while waiting.
 *
 * A failed action must NOT resync: the wrappers below only reach here on
 * `ok`, because adopting after a refused write would replace good device state
 * with a server copy that never received the change.
 */
export async function resyncFromServer(): Promise<"adopted" | "none"> {
  /* Static mode has no server owner, so there is nothing to come back into
     step WITH — and the answer must arrive without a request. A fetch to an
     endpoint the export does not contain would be a 404 in the console on
     every cook, which is exactly the class of noise §7b retires. */
  if (STATIC) return "none";
  /* Everything this module sent, landed first — see `serverSettled`. */
  await serverSettled();
  const { currentOwner } = await import("@/app/actions");
  const owner = await currentOwner();
  /* No owner at all means the server has nothing to teach: a visitor whose
     cookie has not minted a row yet. Adopting `null` would empty a kitchen
     to fix a divergence that cannot exist. */
  if (!owner) return "none";
  client.adopt(owner);
  return "adopted";
}

/**
 * Run a server-only write, then bring the device back into step.
 *
 * ONE caller left: `saveOwnRecipe`. The cook log used to come through here and
 * does not any more — see `resyncFromServer` for which two writes are still the
 * server's and why the distinction is real rather than historical.
 *
 * The cost is one extra round trip on a write that is rare by nature: pasting a
 * link. It is not on the path of anything a person does sixty times a session.
 */
async function afterServer<A extends unknown[]>(
  send: (...args: A) => Promise<ActionResult>, ...args: A
): Promise<ActionResult> {
  const r = await track(send(...args));
  if (r.ok) {
    try {
      await resyncFromServer();
    } catch (e) {
      /* The write landed; only the catch-up failed. Saying "not saved" here
         would be a lie about the thing the user actually did, so the failure
         is logged and the device stays one write behind until the next
         resync or reload. */
      console.warn("[dual-write] could not re-read the server's copy:", e);
    }
  }
  return r;
}

/* ── the cook log and the calendar ───────────────────────────────────────────

   Ordinary mirrors, with the same names and signatures the actions have, so no
   surface changed a line to get here. The one thing they do that a tick does
   not is mint an id first and hand the SAME string to both halves — see the
   header, and `owner-core.mintCookId`. */

/**
 * What the recipe required, at the moment of cooking — RECIPE-SPEC §3.
 *
 * The one judgement `madeIt` could not simply move: the server action reads the
 * recipe index off disk and snapshots `requires` from it, because reading it
 * back later off the live recipe would make the history lie the first time the
 * parse improves. The device's copy of that index is the shipped bundle, and
 * asking it the same question is what makes the two halves record the same
 * ingredient list rather than two readings of one dish.
 *
 * Corpus AND own, folded exactly as every other client surface folds them
 * (`expandComponents` over both, own last so ids collide toward theirs): a dish
 * that uses a stock requires the stock's anchovies, and a recipe the user
 * pasted lives only in the blob. The bundle ships the curated shelf, which is
 * the same set `/recipe/[id]` and the grid can reach in EITHER mode — a recipe
 * with no page and no card is not one anybody can press "Made it" on.
 *
 * A miss throws the sentence the action throws, because it means the same
 * thing: a tab old enough to be holding an id the shelf no longer has.
 */
async function requiresOf(recipeId: string): Promise<string[]> {
  const bundle = await load();
  const hit = expandComponents(
    [...bundle.recipes, ...ownAsRecipes(client.current())] as Recipe[])
    .find((r) => r.id === recipeId);
  if (!hit) throw new Error("That recipe is no longer in the index. Reload the page.");
  return hit.requires;
}

export async function madeIt(
  recipeId: string, date?: string, meal?: string, planId?: string,
  details?: { rating?: number; note?: string },
): Promise<ActionResult> {
  /**
   * Minted here, before either copy is touched, and sent to both.
   *
   * This is the whole of what kept the cook log off the device. `settleUp`,
   * `rateCook` and `undoMadeIt` all address a cook by this string; minting it
   * in one place and passing it down means the modal's next tap finds the same
   * row on the device and on the server, and an `adopt` from either of the two
   * surviving server-only writes lands the same id on top of itself.
   */
  const cookId = mintCookId();
  let required: string[];
  try {
    required = await requiresOf(recipeId);
  } catch (e) {
    /* Resolved BEFORE the mirror, so a recipe the device cannot name writes
       nothing anywhere — the two copies stay equal by never diverging. */
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  /**
   * The DATE is the calendar's, and the zone is this device's own.
   *
   * The action reads a timezone cookie the browser wrote (`ownerTz`); here the
   * browser's clock IS that fact, one indirection earlier. A past date becomes
   * NOON local for the action's reason: midnight sits on the boundary and any
   * arithmetic downstream lands it on the wrong square.
   */
  const cookedAt = !date || date === dayKey()
    ? undefined
    : new Date(`${date}T12:00:00`).toISOString();
  return mirror(
    () => {
      client.recordCook(recipeId, {
        id: cookId, required,
        ...(cookedAt ? { cookedAt } : {}),
        ...(meal ? { meal } : {}),
        ...(details?.rating !== undefined ? { rating: details.rating } : {}),
        ...(details?.note ? { note: details.note } : {}),
        /* The caller is the only one who knows whether a plan was being ticked
           off — the store sees a cook either way. BEHAVIOR-SPEC §4, and the
           discriminator the residency figure is grouped by. */
        source: planId ? "planned" : "spontaneous",
      });
      /* A planned meal ticked off points at what it became, rather than
         becoming a loose second record of the same dinner. */
      if (planId) client.linkPlanToCook(planId, cookId);
    },
    () => srvMadeIt(recipeId, date, meal, planId, details, cookId),
  );
}

export async function settleUp(
  cookId: string,
  patch: { ranOut?: string[]; alsoUsed?: Array<{ id: string; insteadOf?: string }> },
): Promise<ActionResult> {
  return mirror(
    /* Both ends through the redirect map, exactly as the action does it: an
       open tab can hold an id that has since been merged (INGREDIENT-SPEC §1),
       and the two stores have to key on the same row or a merge splits one
       ingredient in two. */
    () => {
      client.settleCook(cookId, {
        ...(patch.ranOut ? { ranOut: patch.ranOut.map(resolveId) } : {}),
        ...(patch.alsoUsed
          ? { alsoUsed: patch.alsoUsed.map((a) => ({
              id: resolveId(a.id),
              ...(a.insteadOf ? { insteadOf: resolveId(a.insteadOf) } : {}),
            })) }
          : {}),
      });
    },
    () => srvSettleUp(cookId, patch),
  );
}

export async function rateCook(
  cookId: string,
  patch: { rating?: number; note?: string; meal?: string;
           substituted?: Array<{ wanted: string; used: string }> },
): Promise<ActionResult> {
  return mirror(
    () => {
      client.amendCook(cookId, {
        ...patch,
        ...(patch.substituted
          ? { substituted: patch.substituted.map((s) =>
              ({ wanted: resolveId(s.wanted), used: resolveId(s.used) })) }
          : {}),
      });
    },
    () => srvRateCook(cookId, patch),
  );
}

export async function undoMadeIt(cookId: string): Promise<ActionResult> {
  return mirror(
    () => { client.undoCook(cookId); },
    () => srvUndoMadeIt(cookId),
  );
}

/* The calendar's three. `planId` is minted here for the same reason `cookId`
   is: `unplanMeal` addresses a row, and a row only one copy has heard of is a
   square the other cannot clear. */

export async function planMeal(
  recipeId: string, date: string, meal: string,
): Promise<ActionResult> {
  const planId = mintPlanId();
  return mirror(
    () => { client.planRecipe(recipeId, date, meal, planId); },
    () => srvPlanMeal(recipeId, date, meal, planId),
  );
}

export async function planNoteEntry(
  label: string, date: string, meal: string,
): Promise<ActionResult> {
  const planId = mintPlanId();
  return mirror(
    () => { client.planNote(label, date, meal, planId); },
    () => srvPlanNoteEntry(label, date, meal, planId),
  );
}

export async function unplanMeal(planId: string): Promise<ActionResult> {
  return mirror(
    () => { client.unplanRecipe(planId); },
    () => srvUnplanMeal(planId),
  );
}

export function seedFromServer(): Promise<"seeded" | "held" | "new"> {
  return (asked ??= (async () => {
    try {
      /* Nothing to seed FROM. "held" when the device already has a blob and
         "new" when it does not — the same two answers a visitor the server has
         never seen would get, reached without asking anyone. */
      if (STATIC) return client.hasStored() ? "held" : "new";
      if (client.hasStored()) return "held";
      const { currentOwner } = await import("@/app/actions");
      const owner = await currentOwner();
      if (!owner) return "new";
      return client.seed(owner) ? "seeded" : "held";
    } finally {
      seeded = true;
    }
  })());
}
