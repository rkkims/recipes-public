/**
 * Owner state — pantry, grocery list, cook log. The SERVER shell.
 *
 * File-backed JSON, behind a narrow interface. Phase A has one user cooking at
 * home; a database would be ceremony. What matters is that everything above this
 * line speaks in the vocabulary the specs define, so replacing this file with
 * Postgres is a swap and not a rewrite.
 *
 * The types and every rule for changing an owner live in `owner-core.ts`
 * (STATIC-SPEC §2, stage 1): one set of reducers serves this shell and the
 * localStorage one (`client-store.ts`), so the pantry cannot behave
 * differently depending on where it is held. What stays here is what only a
 * server can do — the file, the atomic write, `StoreCorrupt`, the events log,
 * cross-owner reads (`saveCounts`), and the whole account layer. Every export
 * this module ever had is still here, with the same signature; importers are
 * none the wiser.
 *
 * Keyed on `owner_id`, never `user_id` (USER-SPEC §3). In Phase A one owner is
 * created per browser and there are no users at all.
 */
/**
 * A TYPE-only import, so this file stays free of the matcher at runtime.
 * `ownAsRecipes` has to return something the matcher accepts, and saying so is
 * better than returning a structurally similar object and finding out at the
 * call site that a union has swallowed the optional fields.
 */
import type { Recipe } from "./match";
import { appendEvent, forgetHousehold, type PantrySource } from "./events";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as core from "./owner-core";
import {
  blank, upgrade, snapshot, stampHistory, pantryEvents, rowFor,
  type Owner, type OwnRecipe, type PlanEntry, type CookEvent, type Consent,
  type UserIngredient, type UserRecipe, type StateFlags, type CookDraft,
  type Snap, pinLive,
} from "./owner-core";

/* The shared vocabulary, re-exported so no importer has to know the core
   exists — store.ts remains the one address for owner state on the server. */
export type {
  Owner, UserIngredient, UserRecipe, CookEvent, PlanEntry, OwnRecipe,
  PushSub, Consent, Diet, StateFlags,
} from "./owner-core";
export {
  MEALS, dayKey, freeTextId, isFreeText, PIN_DAYS, pinLive, pinLapsed,
} from "./owner-core";
/* The READ selectors went the same way as the reducers in slice B — they turn
   an owner into what a surface renders, they touch nothing but the owner, and
   the grid needs them in a browser (STATIC-SPEC §2). Re-exported one for one,
   so `@/lib/store` remains the single address for owner state on the server
   and no caller learns where they now live. */
export {
  pantryOf, heldCount, excludesOf, dietOf, dismissedNow, cartOf,
  summaryFor, cooksOnDate, plansOnDate, latestCook, historyFor,
  lastActive, daysAway, consentState, ownNeedingIngredients,
  type RecipeSummary,
} from "./owner-core";

const FILE = resolve(process.cwd(), "..", "data", "app", "owners.json");

/**
 * An account, and the pantry it owns.
 *
 * USER-SPEC §3 keys private state on `owner_id`, never `user_id`, and this
 * respects that rather than working around it: a user POINTS AT an owner. The
 * pantry, the cooks and the plans never move and never learn that an account
 * exists. Signing up is one field being filled in on a record that was already
 * there, which is also why a visitor keeps everything they built anonymously.
 */
export type User = {
  id: string;
  /**
   * Lowercased login id — CREATORS-TAB-SPEC §6. Absent only on accounts from
   * before ids existed, which sign in by email exactly as they always did.
   */
  username?: string;
  /**
   * Lowercased. Was the login handle and the only thing we knew about them;
   * since ids landed (§6, settled 2026-08-15) it is the OPTIONAL recovery
   * address — stored against the day a reset flow exists, absent unless they
   * chose to leave one. Still accepted at sign-in where it exists.
   */
  email?: string;
  /** `scrypt$N$r$p$salt$hash` — see `lib/auth`. Never reversible. */
  pw: string;
  /** The owner record this account opens. Never changes.  */
  owner_id: string;
  created_at: string;
  /**
   * The terms, as agreed at sign-up.
   *
   * A ticked box with no record of WHAT was ticked proves nothing later, so
   * this keeps the version alongside the moment. Same reasoning as the consent
   * record in `lib/consent`, and the same failure it avoids.
   */
  terms: { accepted_at: string; version: string };
};

/**
 * A live sign-in, keyed BY THE TOKEN the cookie carries.
 *
 * The token is the credential, so the key is the secret and the record holds
 * nothing sensitive. Deleting the row is what signing out means, and it works
 * even if the browser never gives the cookie back.
 */
export type Session = { user_id: string; created_at: string };

type Db = {
  owners: Record<string, Owner>;
  /** Optional on the type because every file written before accounts lacks them. */
  users?: Record<string, User>;
  sessions?: Record<string, Session>;
};

/**
 * A corrupt store must never look like an empty one.
 *
 * The previous version returned `{ owners: {} }` on a parse failure, which is
 * the worst possible answer: the pantry renders empty, the user adds one item,
 * and the write that follows replaces a damaged-but-recoverable file with a
 * one-item one. The damage becomes permanent at the moment the user tries to
 * work around it.
 *
 * So a parse failure is an ERROR, not a value. The caller cannot mistake it for
 * emptiness, the page shows what happened, and the file is left untouched for
 * whoever comes to recover it.
 */
export class StoreCorrupt extends Error {
  readonly file: string;
  constructor(file: string, cause: unknown) {
    super(`Owner store at ${file} is not readable JSON. Refusing to overwrite it. ` +
          `Move it aside to start fresh. (${String(cause)})`);
    this.name = "StoreCorrupt";
    this.file = file;
  }
}

function read(): Db {
  if (!existsSync(FILE)) return { owners: {} };
  let text: string;
  try { text = readFileSync(FILE, "utf8"); }
  catch (e) { throw new StoreCorrupt(FILE, e); }
  // An empty file is what a half-completed write used to leave behind. Treat it
  // as empty rather than corrupt: there is nothing to lose and nothing to fix.
  if (!text.trim()) return { owners: {} };
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch (e) { throw new StoreCorrupt(FILE, e); }
  if (!parsed || typeof parsed !== "object" || !(parsed as Db).owners) {
    throw new StoreCorrupt(FILE, "no `owners` key");
  }
  return parsed as Db;
}

/**
 * Write via a temporary file and rename.
 *
 * A truncated write here is the pantry, which is the one thing in Phase A that
 * cannot be regenerated. Rename is atomic on the same filesystem, so a crash
 * mid-write leaves the previous state rather than half of the new one.
 */
function write(db: Db): void {
  mkdirSync(dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp";
  const text = JSON.stringify(db, null, 1);
  // Serialise BEFORE touching either file. A structure that cannot be stringified
  // would otherwise leave a truncated temp file and, worse, a rename over the
  // good one.
  writeFileSync(tmp, text);
  // Read back what we just wrote. Disk-full does not always throw on write —
  // it can produce a short file, and renaming that over the pantry is exactly
  // the failure this whole function exists to prevent.
  const back = readFileSync(tmp, "utf8");
  if (back.length !== text.length) {
    throw new Error(`Short write to ${tmp} (${back.length} of ${text.length} bytes). ` +
                    `the previous state is intact and was not replaced.`);
  }
  renameSync(tmp, FILE);
}

const now = () => new Date().toISOString();

/**
 * How many owners saved each recipe — for ORDERING only, never for display.
 *
 * RECIPE-SPEC §9 puts a floor k under any published aggregate, and at today's
 * volume every count is under it. An order is the weakest disclosure there is
 * — it shows no number and ties collapse into other sort keys — which is why
 * the creator shelf may sort by this while showing nobody the count itself.
 * The moment a count is DISPLAYED, it goes through the floor like everything
 * else.
 */
export function saveCounts(): Map<string, number> {
  const out = new Map<string, number>();
  for (const o of Object.values(read().owners)) {
    for (const r of Object.values(o.recipes ?? {})) {
      if (r.saved) out.set(r.recipe_id, (out.get(r.recipe_id) ?? 0) + 1);
    }
  }
  return out;
}

/**
 * Fetch an owner, creating it ON FIRST WRITE only (USER-SPEC §7).
 *
 * `create` is the caller saying "something is about to be stored". A row per
 * page load would make every count of owners a count of crawlers.
 */
export function getOwner(id: string, create = false): Owner | null {
  const db = read();
  const found = db.owners[id];
  if (found) return upgrade(found);
  if (!create) return null;
  const owner = blank(id);
  db.owners[id] = owner;
  write(db);
  return owner;
}

/**
 * The events log's half of every write — BEHAVIOR-SPEC §§3–4.
 *
 * The descriptors come from the core's diff (`pantryEvents`); what only this
 * shell knows is WHERE they go (`events.jsonl`) and the `source` —
 * BEHAVIOR-SPEC §4's highest-value field, what separates "typed gochujang in
 * during setup" from "bought it after a gap". The caller knows which it was;
 * a diff cannot guess, so it is passed down.
 */
function logPantryEvents(
  ownerId: string, before: Map<string, Snap>, o: Owner, source: PantrySource,
) {
  for (const d of pantryEvents(before, o)) {
    appendEvent("pantry_event", {
      household: ownerId, node_id: d.node_id, op: d.op, source,
      ...(d.from_list ? { from_list: true } : {}),
    });
  }
}

function mutate(ownerId: string, fn: (o: Owner) => void, source: PantrySource = "manual"): Owner {
  const db = read();
  const existing = db.owners[ownerId];
  const owner = existing ? upgrade(existing) : blank(ownerId);
  db.owners[ownerId] = owner;
  const before = snapshot(owner);
  fn(owner);
  stampHistory(before, owner);
  logPantryEvents(ownerId, before, owner, source);
  // Stamped AFTER the mutation, so a write that throws leaves the old value —
  // an owner whose last action failed has not been active.
  owner.last_active_at = now();
  write(db);
  return owner;
}

/* ── writers ─────────────────────────────────────────────────────────────

   Each one is `mutate` around the reducer of the same name in `owner-core`,
   plus whatever only the server knows: the `source` for the behavioural
   record, and the event emissions. The rules themselves live with the
   reducers — one place to read them, two shells that obey them. */

export function setState(ownerId: string, ingredientId: string, flags: StateFlags): Owner {
  return mutate(ownerId, (o) => core.setState(o, ingredientId, flags));
}

export function addOwnRecipe(
  ownerId: string,
  r: { title: string; url: string; source: string; image?: string; requires: string[];
       note?: string; steps?: string },
): OwnRecipe {
  let made!: OwnRecipe;
  mutate(ownerId, (o) => { made = core.addOwnRecipe(o, r); });
  return made;
}

export function addOwnRecipes(
  ownerId: string,
  rows: Array<{ title: string; url: string; source: string; image?: string; note?: string }>,
): { added: number; skipped: number } {
  let res!: { added: number; skipped: number };
  // One `mutate`, so 200 rows are one file write rather than 200.
  mutate(ownerId, (o) => { res = core.addOwnRecipes(o, rows); });
  return res;
}

export function updateOwnRecipe(
  ownerId: string, recipeId: string,
  patch: { title?: string; url?: string; requires?: string[]; note?: string; image?: string;
           steps?: string },
): Owner {
  return mutate(ownerId, (o) => core.updateOwnRecipe(o, recipeId, patch));
}

export function deleteOwnRecipe(ownerId: string, recipeId: string): Owner {
  return mutate(ownerId, (o) => core.deleteOwnRecipe(o, recipeId));
}

/**
 * The user's own recipes as the matcher wants them — `owner-core`'s, widened.
 *
 * The core cannot say `Recipe`: naming that type would cost it the no-import
 * property that lets it run on a device. It returns the same object under a
 * structural type, and this restates the matcher's view of it so every server
 * caller keeps reading `Recipe[]` — including the optional fields a corpus row
 * carries and an own recipe never does.
 */
export function ownAsRecipes(owner: Owner | null): Recipe[] {
  return core.ownAsRecipes(owner);
}

export function addToList(ownerId: string, ingredientIds: string[]): Owner {
  return mutate(ownerId, (o) => core.addToList(o, ingredientIds));
}

export function moveToPantry(ownerId: string, ingredientIds: string[]): Owner {
  // The checkout is the closest thing the record has to an acquisition —
  // BEHAVIOR-SPEC §1's "pantry ADD" step, and the list is where gaps land.
  return mutate(ownerId, (o) => core.moveToPantry(o, ingredientIds), "gap_resolution");
}

export function setManyInPantry(
  ownerId: string, add: string[], remove: string[],
  // The grid's ticking is "manual"; the starter pantry passes "first_run" —
  // same write, different fact about how the kitchen came to say it.
  source: PantrySource = "manual",
): Owner {
  return mutate(ownerId, (o) => core.setManyInPantry(o, add, remove), source);
}

export function markOpened(ownerId: string, recipeId: string): Owner {
  return mutate(ownerId, (o) => core.markOpened(o, recipeId));
}

export function setDetail(
  ownerId: string, ingredientId: string,
  detail: Partial<Pick<UserIngredient, "note" | "portion" | "storage" | "brand" | "buy_instead">>,
): Owner {
  return mutate(ownerId, (o) => core.setDetail(o, ingredientId, detail));
}

export function answerClarification(
  ownerId: string, askId: string, yes: boolean, grants: string,
): Owner {
  return mutate(ownerId, (o) => core.answerClarification(o, askId, yes, grants));
}

export function setExcluded(ownerId: string, ingredientId: string, excluded: boolean): Owner {
  return mutate(ownerId, (o) => core.setExcluded(o, ingredientId, excluded));
}

export function setDiet(
  ownerId: string,
  patch: { classes?: string[]; allergens?: string[] },
): Owner {
  return mutate(ownerId, (o) => core.setDiet(o, patch));
}

export function setConsent(
  ownerId: string,
  answer: {
    purpose: Consent["purpose"];
    granted: boolean;
    policy_version: string;
    copy_hash: string;
  },
): Owner {
  return mutate(ownerId, (o) => core.setConsent(o, answer));
}

export function completeOnboarding(
  ownerId: string,
  answer: { have?: string[]; classes?: string[]; allergens?: string[] },
): Owner {
  return mutate(ownerId, (o) => core.completeOnboarding(o, answer), "first_run");
}

export function toggleDismissed(ownerId: string, recipeId: string): Owner {
  return mutate(ownerId, (o) => core.toggleDismissed(o, recipeId));
}

export function addPushSub(
  ownerId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } },
): Owner {
  return mutate(ownerId, (o) => core.addPushSub(o, sub));
}

export function dropPushSub(ownerId: string, endpoint: string): Owner {
  return mutate(ownerId, (o) => core.dropPushSub(o, endpoint));
}

export function setFollowing(ownerId: string, creatorId: string, on: boolean): Owner {
  return mutate(ownerId, (o) => core.setFollowing(o, creatorId, on));
}

export function toggleSaved(ownerId: string, recipeId: string): Owner {
  return mutate(ownerId, (o) => core.toggleSaved(o, recipeId));
}

/**
 * The request queue's return trip — decided 2026-08, in place of any notify
 * channel: when a recipe the user pasted for themselves later becomes a
 * curated corpus recipe, their copy TRANSFERS. The corpus version lands in
 * their saved shelf carrying everything they added — the standing note, their
 * steps (merged into the note: it is their writing about their cooking, and
 * it survives), their cook history and their plans — and only the ingredient
 * list is dropped, because the curated reading is the one the pantry can
 * actually match against.
 *
 * The twin resolver is a parameter because the corpus lives in `recipes.ts`,
 * which imports this module — the store stays beneath it. Idempotent: a
 * transferred row leaves `own`, so a second call finds nothing to do.
 */
export function transferOwnUpgrades(
  ownerId: string,
  twinIdFor: (url: string) => string | undefined,
): void {
  const o = getOwner(ownerId);
  if (!o || o.own.length === 0) return;
  const moves = o.own
    .map((r) => ({ r, twinId: twinIdFor(r.url) }))
    .filter((m): m is { r: OwnRecipe; twinId: string } => !!m.twinId && m.twinId !== m.r.id);
  if (moves.length === 0) return;
  mutate(ownerId, (own) => {
    for (const { r, twinId } of moves) {
      const from = own.recipes[r.id];
      const to = rowFor(own, twinId);
      to.saved = true;
      // Every word they wrote rides along; nothing of theirs is discarded.
      const words = [to.note, from?.note, r.note, r.steps]
        .filter((x): x is string => !!x)
        .filter((x, i, all) => all.indexOf(x) === i);
      if (words.length) to.note = words.join("\n\n");
      if (from?.dismissed_at && !to.dismissed_at) to.dismissed_at = from.dismissed_at;
      delete own.recipes[r.id];
      for (const c of own.cooks) if (c.recipe_id === r.id) c.recipe_id = twinId;
      for (const pl of own.plans) if (pl.recipe_id === r.id) pl.recipe_id = twinId;
      own.own = own.own.filter((x) => x.id !== r.id);
    }
  });
}

export function setRecipeNote(ownerId: string, recipeId: string, note: string): Owner {
  return mutate(ownerId, (o) => core.setRecipeNote(o, recipeId, note));
}

/* The optional `id` on both is the DEVICE's — see `owner-core.mintPlanId`. The
   client writes first and hands the identity down with the mirror, so the row
   the calendar is holding is the row this file wrote. Absent, `core` mints. */

export function planNote(
  ownerId: string, label: string, date: string, meal: string, id?: string,
): PlanEntry {
  let entry!: PlanEntry;
  mutate(ownerId, (o) => { entry = core.planNote(o, label, date, meal, id); });
  return entry;
}

export function planRecipe(
  ownerId: string, recipeId: string, date: string, meal: string, id?: string,
): PlanEntry {
  let entry!: PlanEntry;
  mutate(ownerId, (o) => { entry = core.planRecipe(o, recipeId, date, meal, id); });
  return entry;
}

export function unplanRecipe(ownerId: string, planId: string): Owner {
  return mutate(ownerId, (o) => core.unplanRecipe(o, planId));
}

export function linkPlanToCook(ownerId: string, planId: string, cookId: string): Owner {
  return mutate(ownerId, (o) => core.linkPlanToCook(o, planId, cookId));
}

export function undoCook(ownerId: string, cookId: string): Owner {
  const owner = mutate(ownerId, (o) => core.undoCook(o, cookId));
  // The record is append-only, so an undo is a new fact rather than an
  // erasure (BEHAVIOR-SPEC §3): the cook line stays, this line withdraws it,
  // and the derivation subtracts. §7's rule about negatives, applied to us.
  appendEvent("cook_undo", { household: ownerId, cook_id: cookId });
  return owner;
}

export function amendCook(
  ownerId: string, cookId: string,
  patch: { rating?: number; note?: string; meal?: string;
           substituted?: CookEvent["substituted"]; skipped?: string[] },
): Owner {
  return mutate(ownerId, (o) => core.amendCook(o, cookId, patch));
}

export function recordCook(ownerId: string, recipeId: string, ev: CookDraft): Owner {
  let cook!: CookEvent;
  /* Whether this call is the one that made the row. A device-minted id can
     arrive twice (see `core.recordCook`), and the reducer answers the second
     arrival with the cook it already holds — so the line below has to ask, or
     one meal would get two `cook_event` rows and every count built on the log
     would inherit it. */
  let made = true;
  const owner = mutate(ownerId, (o) => {
    made = !ev.id || !o.cooks.some((c) => c.id === ev.id);
    cook = core.recordCook(o, recipeId, ev);
  }, "cook");
  /*
    The closing bracket of the loop — BEHAVIOR-SPEC §1. `cooked_at` is when
    the meal happened; `at` on the event line is when it was recorded, and
    keeping both is what lets the derivation treat a Friday tick-off of
    Monday's dinner honestly rather than as a time machine.
  */
  if (made) {
    appendEvent("cook_event", {
      household: ownerId, cook_id: cook.id, recipe_id: recipeId,
      cooked_at: cook.cooked_at, source: ev.source ?? "spontaneous",
    });
  }
  return owner;
}

export function settleCook(
  ownerId: string, cookId: string,
  patch: { ranOut?: string[]; alsoUsed?: Array<{ id: string; insteadOf?: string }> },
): Owner {
  return mutate(ownerId, (o) => core.settleCook(o, cookId, patch), "cook");
}

export function tickOff(ownerId: string, ingredientId: string, enough = true): Owner {
  return mutate(ownerId, (o) => core.tickOff(o, ingredientId, enough), "gap_resolution");
}

export function putAway(
  ownerId: string, moveIds: string[], clearRest = true,
): Owner {
  return mutate(ownerId, (o) => core.putAway(o, moveIds, clearRest), "gap_resolution");
}

export function reviewPantry(ownerId: string, gone: string[]): Owner {
  return mutate(ownerId, (o) => core.reviewPantry(o, gone));
}

export function addFreeText(ownerId: string, text: string): Owner {
  return mutate(ownerId, (o) => core.addFreeText(o, text));
}

/* ── accounts ────────────────────────────────────────────────────────────

   Everything below is the account layer. It sits at the bottom of this file
   rather than beside the owner functions because it is a different subject:
   an owner is a kitchen, a user is a way back into one, and USER-SPEC §3's
   rule that private state never keys on `user_id` is easier to keep when the
   two do not interleave. It is also why none of it moved to `owner-core` —
   accounts are how a server names a kitchen, and a device holding its own
   state has no use for one. */

/**
 * Create an account and hand it the owner the visitor already has.
 *
 * The pantry does not move. Whatever they built anonymously — twenty
 * ingredients, a week of cooks, a grocery list mid-shop — is already stored
 * against `ownerId`, and signing up attaches a way back to it rather than
 * copying anything anywhere. That is the whole reason UX-SPEC §9 can promise
 * the pantry works before you sign up: the anonymous record is not a draft.
 *
 * `email` also lands on the owner, because `lib/pool.ts` asks "has this owner
 * ever signed up" months later in a batch job with no request in sight, and
 * that question has to be answerable from the owner row alone.
 *
 * Throws on a duplicate email. The caller turns that into a message; it is not
 * exceptional enough to be silent and not ordinary enough to be a return value.
 */
export function createUser(
  ownerId: string,
  ident: { username: string; email?: string },
  pwHash: string,
  terms: { version: string },
): User {
  const db = read();
  db.users ??= {};
  if (Object.values(db.users).some((u) => u.username === ident.username)) {
    throw new Error("That id is taken. Pick another, or sign in.");
  }
  /* The recovery address is unique too — it can sign someone in, so two
     accounts behind one address would make "which account" a guess. */
  if (ident.email && Object.values(db.users).some((u) => u.email === ident.email)) {
    throw new Error("That email already belongs to an account. Try signing in.");
  }
  const user: User = {
    id: "usr_" + Math.random().toString(36).slice(2, 12),
    username: ident.username,
    ...(ident.email ? { email: ident.email } : {}),
    pw: pwHash,
    owner_id: ownerId,
    created_at: now(),
    terms: { accepted_at: now(), version: terms.version },
  };
  db.users[user.id] = user;

  /* The owner may not exist yet: someone can sign up before touching anything.
     Creating it here is the same "first write creates it" rule §7 sets out. */
  db.owners[ownerId] ??= blank(ownerId);
  db.owners[ownerId]!.account_at = now();
  if (ident.email) db.owners[ownerId]!.email = ident.email;

  write(db);
  return user;
}

/**
 * By login id or email, one field for both — no `@` can appear in an id
 * (`normaliseUsername`), so nothing here is ambiguous. `null` rather than
 * throwing: a missing user is a wrong password.
 */
export function userByIdentifier(ident: string): User | null {
  return Object.values(read().users ?? {})
    .find((u) => u.username === ident || u.email === ident) ?? null;
}

/** Open a session against a token the caller generated. */
export function startSession(token: string, userId: string): void {
  const db = read();
  db.sessions ??= {};
  db.sessions[token] = { user_id: userId, created_at: now() };
  write(db);
}

/**
 * Who a token belongs to, or null.
 *
 * Reads only — a session that refreshed a timestamp would write to the pantry
 * file on every page load, which is the one file in Phase A that cannot be
 * regenerated and the last one to touch casually.
 */
export function sessionUser(token: string | undefined): User | null {
  if (!token) return null;
  const db = read();
  const s = db.sessions?.[token];
  if (!s) return null;
  return db.users?.[s.user_id] ?? null;
}

/** Sign out. The row goes, so the token is dead even if the cookie survives. */
export function endSession(token: string | undefined): void {
  if (!token) return;
  const db = read();
  if (!db.sessions?.[token]) return;
  delete db.sessions[token];
  write(db);
}

/**
 * Delete an account and everything behind it — one write, no tombstone.
 *
 * ── What "everything" means here ──────────────────────────────────────────
 *
 * The login, every session it opened, and the OWNER RECORD: the pantry, the
 * grocery list, saved recipes, own recipes, the cook log, plans, notes, diet
 * settings, push subscriptions and the consent history. An account whose
 * deletion left the kitchen behind would be deleting the key and keeping the
 * house, and the house is the part that is actually about a person.
 *
 * This is deliberately NOT the same as signing out. `endSession` above kills a
 * token; an anonymous owner survives it and the same cookie walks back in.
 * Here the owner id itself stops existing, so the cookie the caller clears
 * afterwards refers to nothing and the next visit starts a genuinely new one.
 *
 * ── Why every session, not just the current one ──────────────────────────
 *
 * Sessions are keyed by token with the user id inside, so a phone and a laptop
 * signed into the same account hold two rows. Deleting only the token that
 * asked would leave the other one resolving to a user that no longer exists —
 * `sessionUser` would return null and the tab would silently look signed out,
 * which is the right behaviour by luck rather than by design. Sweeping them is
 * the version that is true on purpose.
 *
 * Returns what it removed so the caller can say so and the audit is not a
 * guess. A missing user is not an error: deleting twice is the same request.
 */
export function deleteAccount(userId: string): { ownerId: string | null; sessions: number } {
  const db = read();
  const user = db.users?.[userId];
  if (!user) return { ownerId: null, sessions: 0 };

  const ownerId = user.owner_id;
  let sessions = 0;
  for (const [token, s] of Object.entries(db.sessions ?? {})) {
    if (s.user_id !== userId) continue;
    delete db.sessions![token];
    sessions += 1;
  }
  delete db.users![userId];
  delete db.owners[ownerId];

  // Before the write, not after — `events.jsonl` holds `household` ids on the
  // pantry and cook rows, and the policy's "we keep no copy" covers those too.
  // If this throws, the account is still here and the person can try again;
  // the other order would report a deletion that half happened. It is allowed
  // to throw for exactly that reason (`events.forgetHousehold`).
  forgetHousehold(ownerId);

  write(db);
  return { ownerId, sessions };
}
