"use client";

/**
 * Owner state on the DEVICE — the localStorage shell around `owner-core`.
 *
 * STATIC-SPEC §2's inversion: the same reducers `store.ts` runs against
 * `owners.json` run here against one versioned blob, so the pantry obeys one
 * set of rules wherever it lives. Nothing imports this module yet (Slice A is
 * foundation only); the grid converts to it in a later slice.
 *
 * A plain module, deliberately — no React, no hooks. `subscribe` is the whole
 * integration surface: React wraps it in `useSyncExternalStore` later, and a
 * non-React caller (the service worker bridge, a test) needs nothing more.
 *
 * ── The blob ───────────────────────────────────────────────────────────────
 *
 * One key, one JSON value: `{schema, sections, revised_at, household}`.
 * `sections` is the Owner exactly as the server file holds it — the shapes
 * must stay interchangeable or export/import and the sync tier turn into
 * migrations. `revised_at` stamps GROUPS of fields, not fields: the sync
 * tier's unit is per-store last-write-wins (STATIC-SPEC §2), and a pantry
 * changes as a session, not as a CRDT.
 *
 * ── Corrupt must never look empty ──────────────────────────────────────────
 *
 * The same discipline as `StoreCorrupt`, translated: a server can refuse to
 * serve a page, but a device has no one to show an error to before the UI
 * mounts. So a blob that will not parse is MOVED ASIDE (`.corrupt`), never
 * overwritten, and `wasCorrupt()` lets the UI say what happened instead of
 * presenting a silently empty kitchen — the failure where the user's first
 * workaround write makes the damage permanent.
 *
 * ── The behavioural record survives the move ───────────────────────────────
 *
 * `store.ts` derives `pantry_event` / `cook_event` / `cook_undo` on every
 * write; a device holding its own state would silently drop that record. The
 * beacon precedent already exists (`lib/beacon.ts` → `/api/events`, carrying
 * the impression events), so the same descriptors the server appends are
 * beaconed from here — with a `household` id minted on the device: random,
 * meaningless, and NOT the sync key (the sync key is a credential; an
 * analytics id must never be one).
 */

import * as core from "./owner-core";
import {
  blank, upgrade, snapshot, stampHistory, pantryEvents,
  type Owner, type OwnRecipe, type PlanEntry, type CookEvent, type Consent,
  type UserIngredient, type StateFlags, type CookDraft,
} from "./owner-core";
import { beacon } from "./beacon";
import type { PantrySource } from "./events";

const KEY = "jipbap-owner-v1";
const CORRUPT_KEY = KEY + ".corrupt";

/**
 * The sync tier's units — each group is one LWW stamp. `meta` collects the
 * small standing facts (answers, consent, onboarding, follows, activity)
 * that change rarely and never conflict interestingly.
 */
export type SectionGroup =
  "ingredients" | "diet" | "recipes" | "cooks" | "plans" | "own" | "meta";

export type StoredBlob = {
  schema: 1;
  /** The owner, exactly as `owners.json` would hold it. */
  sections: Owner;
  /** Per-group last-write stamps — what the sync adapter compares. */
  revised_at: Partial<Record<SectionGroup, string>>;
  /** Analytics household id. Random, stored with the data it describes. */
  household: string;
};

/**
 * The seam the two sync accents fill in later slices — today's server
 * actions, and the KV Worker (STATIC-SPEC §2). No implementation here:
 * declaring the shape first is what keeps both accents honest to the same
 * LWW-per-group semantics.
 */
export type SyncAdapter = {
  /** Send the whole blob up; `revisedAt` is the per-group clock it carries. */
  push(blob: string, revisedAt: Partial<Record<SectionGroup, string>>): Promise<void>;
  /** The remote blob as stored, or null when the household has never pushed. */
  pull(): Promise<string | null>;
};

/**
 * Whether the behavioural record is this shell's to emit — slice B's
 * dual-write seam.
 *
 * While a write is being mirrored to the server action (`lib/dual-write`),
 * the SERVER derives and appends the same descriptors from the same diff. Two
 * shells emitting one event is not a duplicate row to be de-duplicated later;
 * it is a pantry that appears to have been filled twice, and every figure
 * derived from the log inherits the error. So the mirror turns this off for
 * exactly the length of the reducer call and back on after.
 *
 * A module flag rather than an argument on every writer, because the
 * suppression is a property of the WRITE PATH and not of any one call — and
 * because JavaScript gives the reducer an uninterruptible turn, so a set /
 * restore around a synchronous call cannot leak into another write.
 */
export const config = { beacons: true };

/** Emit, unless something upstream is already emitting for this write. */
function emit(kind: string, fields: Record<string, unknown>): void {
  if (!config.beacons) return;
  beacon(kind, fields);
}

/* Set when a load found a blob it could not read and moved it aside. Sticky
   for the session: the UI's chance to say so is after the fresh state has
   already replaced the view, so the flag must outlive the moment. */
let corrupt = false;

/** Did this session start by setting a damaged blob aside? See `corruptBlob`. */
export function wasCorrupt(): boolean {
  return corrupt;
}

/** The damaged blob, held for whoever comes to recover it. Null when none. */
export function corruptBlob(): string | null {
  try { return localStorage.getItem(CORRUPT_KEY); }
  catch { return null; }
}

/* localStorage can be absent (SSR pass, tests without a mock) or throwing
   (private mode, quota). Absent storage degrades to in-memory state for the
   life of the module — wrong for a product, fine for a render pass that a
   mounted effect immediately supersedes. */
let memory: StoredBlob | null = null;

const now = () => new Date().toISOString();

const mintHousehold = () =>
  "hh_" + Math.random().toString(36).slice(2, 14) + Math.random().toString(36).slice(2, 6);

function fresh(): StoredBlob {
  const household = mintHousehold();
  /* The owner id IS the household id on a device: there is no cookie to mint
     one and nothing else to key on. The sync key, when it exists, is a
     separate secret — this id travels in analytics and must stay worthless. */
  return { schema: 1, sections: blank(household), revised_at: {}, household };
}

function isBlob(x: unknown): x is StoredBlob {
  if (!x || typeof x !== "object") return false;
  const b = x as StoredBlob;
  return b.schema === 1 && !!b.sections && typeof b.sections === "object" &&
    typeof b.household === "string" && !!b.revised_at && typeof b.revised_at === "object";
}

/**
 * Set the unreadable blob aside and start fresh — never overwrite it, and
 * never overwrite an EARLIER casualty either: the first damaged blob is the
 * one with the most user data in it, and a second failure must not cost it.
 */
function keepCorrupt(raw: string): void {
  corrupt = true;
  try {
    if (localStorage.getItem(CORRUPT_KEY) === null) {
      localStorage.setItem(CORRUPT_KEY, raw);
    }
  } catch { /* if even this fails there is nowhere safer to put it */ }
}

function readBlob(): StoredBlob {
  let raw: string | null = null;
  try { raw = localStorage.getItem(KEY); }
  catch { return (memory ??= fresh()); }
  if (raw === null) return memory ?? fresh();
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { keepCorrupt(raw); return fresh(); }
  if (!isBlob(parsed)) { keepCorrupt(raw); return fresh(); }
  return parsed;
}

function writeBlob(b: StoredBlob): void {
  try { localStorage.setItem(KEY, JSON.stringify(b)); }
  catch { memory = b; }
  notify();
}

/* ── change notification ────────────────────────────────────────────────── */

const listeners = new Set<() => void>();
let listening = false;

function notify(): void {
  for (const fn of listeners) fn();
}

/**
 * Hear about changes — this tab's writes AND other tabs', via the storage
 * event (which fires only in the tabs that did not write; our own writes
 * call `notify` directly). Returns the unsubscribe.
 */
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  if (!listening && typeof window !== "undefined") {
    listening = true;
    window.addEventListener("storage", (e) => {
      if (e.key === KEY) notify();
    });
  }
  return () => { listeners.delete(fn); };
}

/* ── reads ──────────────────────────────────────────────────────────────── */

/** The owner as of now, upgraded to the current shape. */
export function current(): Owner {
  return upgrade(readBlob().sections);
}

/** The analytics household id, minting (and persisting) it on first use. */
export function householdId(): string {
  const b = readBlob();
  try {
    if (localStorage.getItem(KEY) === null) writeBlob(b);
  } catch { /* in-memory fallback already holds it */ }
  return b.household;
}

/* ── the single write path ──────────────────────────────────────────────── */

/**
 * The mirror of `store.ts mutate`: upgrade → snapshot → reducer →
 * `stampHistory` → derive pantry events → stamp activity → persist. The
 * derived descriptors go to `/api/events` instead of `events.jsonl`; the
 * diff is the same code, so what the record sees cannot depend on which
 * shell wrote it. Free-text rows and cart moves never produce descriptors
 * (the diff is on `in_pantry` and skips `txt_` structurally), which is what
 * keeps `tickOff` silent here exactly as it is on the server.
 */
function mutate(
  groups: SectionGroup[], fn: (o: Owner) => void, source: PantrySource = "manual",
): Owner {
  const b = readBlob();
  const owner = upgrade(b.sections);
  const before = snapshot(owner);
  fn(owner);
  stampHistory(before, owner);
  for (const d of pantryEvents(before, owner)) {
    emit("pantry_event", {
      household: b.household, node_id: d.node_id, op: d.op, source,
      ...(d.from_list ? { from_list: true } : {}),
    });
  }
  owner.last_active_at = now();
  const stamp = now();
  for (const g of groups) b.revised_at[g] = stamp;
  // Every write is activity, and activity lives in `meta`.
  b.revised_at["meta"] = stamp;
  writeBlob(b);
  return owner;
}

/* ── writers — the server store's names, one for one ────────────────────
   Push subscriptions are the deliberate exception: `src/push/remind.ts`
   reads them out of `owners.json` from outside the app process, so a
   device-held subscription is a reminder that never fires. Push stays a
   server feature tied to the sync tier. */

export function setState(ingredientId: string, flags: StateFlags): Owner {
  return mutate(["ingredients"], (o) => core.setState(o, ingredientId, flags));
}

export function setManyInPantry(
  add: string[], remove: string[], source: PantrySource = "manual",
): Owner {
  return mutate(["ingredients"], (o) => core.setManyInPantry(o, add, remove), source);
}

export function addToList(ingredientIds: string[]): Owner {
  return mutate(["ingredients"], (o) => core.addToList(o, ingredientIds));
}

export function moveToPantry(ingredientIds: string[]): Owner {
  return mutate(["ingredients"], (o) => core.moveToPantry(o, ingredientIds), "gap_resolution");
}

export function tickOff(ingredientId: string, enough = true): Owner {
  return mutate(["ingredients"], (o) => core.tickOff(o, ingredientId, enough), "gap_resolution");
}

export function putAway(moveIds: string[], clearRest = true): Owner {
  return mutate(["ingredients"], (o) => core.putAway(o, moveIds, clearRest), "gap_resolution");
}

export function addFreeText(text: string): Owner {
  return mutate(["ingredients"], (o) => core.addFreeText(o, text));
}

export function reviewPantry(gone: string[]): Owner {
  return mutate(["ingredients"], (o) => core.reviewPantry(o, gone));
}

export function setDetail(
  ingredientId: string,
  detail: Partial<Pick<UserIngredient, "note" | "portion" | "storage" | "brand" | "buy_instead">>,
): Owner {
  return mutate(["ingredients"], (o) => core.setDetail(o, ingredientId, detail));
}

export function answerClarification(askId: string, yes: boolean, grants: string): Owner {
  return mutate(["ingredients", "meta"], (o) => core.answerClarification(o, askId, yes, grants));
}

export function completeOnboarding(
  answer: { have?: string[]; classes?: string[]; allergens?: string[] },
): Owner {
  return mutate(["ingredients", "diet", "meta"], (o) => core.completeOnboarding(o, answer), "first_run");
}

export function setExcluded(ingredientId: string, excluded: boolean): Owner {
  return mutate(["diet"], (o) => core.setExcluded(o, ingredientId, excluded));
}

export function setDiet(patch: { classes?: string[]; allergens?: string[] }): Owner {
  return mutate(["diet"], (o) => core.setDiet(o, patch));
}

export function setConsent(
  answer: {
    purpose: Consent["purpose"];
    granted: boolean;
    policy_version: string;
    copy_hash: string;
  },
): Owner {
  return mutate(["meta"], (o) => core.setConsent(o, answer));
}

export function toggleSaved(recipeId: string): Owner {
  return mutate(["recipes"], (o) => core.toggleSaved(o, recipeId));
}

export function toggleDismissed(recipeId: string): Owner {
  return mutate(["recipes"], (o) => core.toggleDismissed(o, recipeId));
}

export function setRecipeNote(recipeId: string, note: string): Owner {
  return mutate(["recipes"], (o) => core.setRecipeNote(o, recipeId, note));
}

export function markOpened(recipeId: string): Owner {
  return mutate(["recipes"], (o) => core.markOpened(o, recipeId));
}

export function recordCook(recipeId: string, ev: CookDraft): Owner {
  let cook!: CookEvent;
  /* The same question the server shell asks, for the same reason: an id the
     caller minted can arrive twice, and the reducer answers the second arrival
     with the cook it already holds. One meal, one `cook_event`. */
  let made = true;
  const owner = mutate(["cooks", "ingredients"], (o) => {
    made = !ev.id || !o.cooks.some((c) => c.id === ev.id);
    cook = core.recordCook(o, recipeId, ev);
  }, "cook");
  if (made) {
    emit("cook_event", {
      household: householdId(), cook_id: cook.id, recipe_id: recipeId,
      cooked_at: cook.cooked_at, source: ev.source ?? "spontaneous",
    });
  }
  return owner;
}

export function amendCook(
  cookId: string,
  patch: { rating?: number; note?: string; meal?: string;
           substituted?: CookEvent["substituted"]; skipped?: string[] },
): Owner {
  return mutate(["cooks"], (o) => core.amendCook(o, cookId, patch));
}

export function settleCook(
  cookId: string,
  patch: { ranOut?: string[]; alsoUsed?: Array<{ id: string; insteadOf?: string }> },
): Owner {
  return mutate(["cooks", "ingredients"], (o) => core.settleCook(o, cookId, patch), "cook");
}

export function undoCook(cookId: string): Owner {
  const owner = mutate(["cooks"], (o) => core.undoCook(o, cookId));
  // Same rule as the server shell: the record is append-only, so an undo is
  // a new fact rather than an erasure (BEHAVIOR-SPEC §3).
  emit("cook_undo", { household: householdId(), cook_id: cookId });
  return owner;
}

/* `id` is minted by the CALLER on both of these — `lib/dual-write` mints once
   and gives the same string to this store and to the server action behind it,
   so the row the calendar can unplan is the row both copies hold. */

export function planRecipe(
  recipeId: string, date: string, meal: string, id?: string,
): PlanEntry {
  let entry!: PlanEntry;
  mutate(["plans"], (o) => { entry = core.planRecipe(o, recipeId, date, meal, id); });
  return entry;
}

export function planNote(
  label: string, date: string, meal: string, id?: string,
): PlanEntry {
  let entry!: PlanEntry;
  mutate(["plans"], (o) => { entry = core.planNote(o, label, date, meal, id); });
  return entry;
}

export function unplanRecipe(planId: string): Owner {
  return mutate(["plans"], (o) => core.unplanRecipe(o, planId));
}

export function linkPlanToCook(planId: string, cookId: string): Owner {
  return mutate(["plans"], (o) => core.linkPlanToCook(o, planId, cookId));
}

export function addOwnRecipe(
  r: { title: string; url: string; source: string; image?: string; requires: string[];
       note?: string; steps?: string },
): OwnRecipe {
  let made!: OwnRecipe;
  mutate(["own"], (o) => { made = core.addOwnRecipe(o, r); });
  return made;
}

export function addOwnRecipes(
  rows: Array<{ title: string; url: string; source: string; image?: string; note?: string }>,
): { added: number; skipped: number } {
  let res!: { added: number; skipped: number };
  mutate(["own"], (o) => { res = core.addOwnRecipes(o, rows); });
  return res;
}

export function updateOwnRecipe(
  recipeId: string,
  patch: { title?: string; url?: string; requires?: string[]; note?: string; image?: string;
           steps?: string },
): Owner {
  return mutate(["own"], (o) => core.updateOwnRecipe(o, recipeId, patch));
}

export function deleteOwnRecipe(recipeId: string): Owner {
  return mutate(["own"], (o) => core.deleteOwnRecipe(o, recipeId));
}

export function setFollowing(creatorId: string, on: boolean): Owner {
  return mutate(["meta"], (o) => core.setFollowing(o, creatorId, on));
}

/* ── the one-way door from the server copy ──────────────────────────────── */

/**
 * Has this device ever held a blob? The question seeding turns on.
 *
 * Deliberately asks STORAGE rather than `current()`, which mints a blank owner
 * for a device that has none — a perfectly good thing to render and a terrible
 * thing to test for emptiness with. In-memory fallback counts: a private-mode
 * device that has written this session has state, and re-seeding over it would
 * discard the writes.
 */
export function hasStored(): boolean {
  try { return localStorage.getItem(KEY) !== null || memory !== null; }
  catch { return memory !== null; }
}

/**
 * Take the server's copy as this device's starting state — once, ever.
 *
 * The inversion (STATIC-SPEC §2) cannot ask people to retype a pantry. A
 * visitor who has been using the product has everything in `owners.json`, and
 * the first client render is the moment to bring it across.
 *
 * Three rules, and each one is a bug avoided:
 *
 *   - **Never over an existing blob.** The device is authoritative once it
 *     holds anything, so a seed that overwrote would let a stale server copy
 *     erase a pantry filled offline. Returns false and touches nothing.
 *   - **No beacons.** Nothing happened here — the rows being copied were
 *     recorded when the user actually made them, and re-emitting would post a
 *     shopping trip's worth of pantry adds dated today.
 *   - **No history stamping.** `stampHistory` derives from a diff, and the diff
 *     against an empty owner would restart `added_at` on every row, ageing a
 *     three-month-old pantry to zero. The sections are copied verbatim.
 */
export function seed(sections: Owner): boolean {
  if (hasStored()) return false;
  const b = readBlob();
  b.sections = upgrade(sections);
  /* The household id stays this DEVICE's. The server's owner id is a cookie
     name and travels in nothing; this one is the analytics id the blob was
     minted with, and swapping it would rename a household mid-record. */
  const stamp = now();
  const groups: SectionGroup[] =
    ["ingredients", "diet", "recipes", "cooks", "plans", "own", "meta"];
  for (const g of groups) b.revised_at[g] = stamp;
  writeBlob(b);
  return true;
}

/**
 * Take the server's copy as the truth, over whatever is here — the one place
 * that is allowed to.
 *
 * `seed` refuses when a blob exists, because the device is authoritative once
 * it holds anything. This is the deliberate exception, and it now has exactly
 * two callers, both of them about a recipe the user PASTED rather than about
 * their kitchen: `saveOwnRecipe`, whose id is decided by a parser that only a
 * server can run, and `upgradeOwnRecipes`, which needs the recipe index off
 * disk to know which pasted rows the corpus has taken in. After either, the
 * server knows something the device does not.
 *
 * The cook log used to be the third and largest caller, and is not any more:
 * the device mints the cook's id and the server accepts it (`lib/dual-write`),
 * so those writes mirror like a tick and there is nothing to come back and
 * collect. That mattered most for settling up — the user says the pork ran out,
 * and a grid reading a device that never heard would go on badging that recipe
 * "have everything", which is the most expensive thing this product can say.
 *
 * The direction is safe only because of WHEN it is called: immediately after a
 * server-only write that has just succeeded, with every mirrored write already
 * settled (`serverSettled`). Called at any other moment it would be a sync
 * tier with last-write-wins pointed the wrong way, and the real sync tier
 * replaces it rather than widening this.
 *
 * What is kept: the blob's `household`, because that id names this DEVICE in
 * the behavioural record and the server has no opinion about it. Nothing else
 * on the blob is client-only today — `sections` is the Owner exactly as
 * `owners.json` holds it, which is the property that makes this a swap rather
 * than a merge. If a device-only field is ever added to `sections`, it has to
 * be carried across here by name, and the absence of such a list is a claim
 * this comment is making on purpose.
 *
 * No beacons and no `stampHistory`: nothing HAPPENED here. The rows were
 * written when the user did the thing, and re-deriving a diff against the old
 * device state would both re-emit events the server already logged and restart
 * `added_at` on every row that differed.
 */
export function adopt(sections: Owner): Owner {
  const b = readBlob();
  b.sections = upgrade(sections);
  const stamp = now();
  const groups: SectionGroup[] =
    ["ingredients", "diet", "recipes", "cooks", "plans", "own", "meta"];
  for (const g of groups) b.revised_at[g] = stamp;
  // `writeBlob` notifies, so every subscriber — the grid, the drawer — has
  // recomputed before this returns.
  writeBlob(b);
  return b.sections;
}

/* ── the manual backup path — STATIC-SPEC §2's export/import button ─────── */

/**
 * The whole blob, pretty-printed — what the download button saves. The
 * household id rides along on purpose: a restore should reconstruct the
 * device as it was, not mint a second identity for the same kitchen.
 */
export function exportFile(): string {
  return JSON.stringify(readBlob(), null, 1);
}

/**
 * Restore from an exported file. REPLACES the stored state — the file is the
 * user's own backup and they chose it; merging would second-guess them with
 * an algorithm nothing else in the product has. Throws on a file that is not
 * an export, and touches nothing when it does: the same "corrupt input must
 * not cost the good state" posture as `readBlob`.
 */
export function importFile(json: string): Owner {
  let parsed: unknown;
  try { parsed = JSON.parse(json); }
  catch { throw new Error("That file is not a jipbap backup."); }
  if (!isBlob(parsed)) throw new Error("That file is not a jipbap backup.");
  const stamp = now();
  const groups: SectionGroup[] =
    ["ingredients", "diet", "recipes", "cooks", "plans", "own", "meta"];
  // Restored state is NEW state to the sync tier: every group re-stamps, so
  // a later pull cannot quietly overwrite what the user just chose to restore.
  for (const g of groups) parsed.revised_at[g] = stamp;
  writeBlob(parsed);
  return upgrade(parsed.sections);
}
