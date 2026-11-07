"use client";

/**
 * `app/actions.ts` with the server taken away — STATIC-SPEC §1 and §7b.
 *
 * `next.config.mjs` aliases `@/app/actions` to this file in static mode, and
 * that alias is not a nicety: Next refuses to export a site if a single server
 * action is compiled into the build at all, whether or not any exported page
 * could reach it. So the module carrying `"use server"` has to be gone from
 * the graph, and something with the same 37 names has to stand where it stood.
 *
 * ── What it means for a write to arrive here ──────────────────────────────
 *
 * Nothing is lost. Every write in this product already lands on the DEVICE
 * first and synchronously (`lib/dual-write`), and the server half was only ever
 * the mirror — the copy push reminders and a second device read. On a static
 * site there is no second reader, so the mirror has nowhere to go and these
 * report success rather than failing: the user's tick DID happen, in
 * `localStorage`, before this was ever called. Reporting failure would put an
 * error bar over a change the user can see on screen.
 *
 * `dual-write` also skips the mirror outright in static mode, so in practice
 * almost nothing here is called. These are the floor under that, not the plan:
 * a surface that reaches for an action directly (`AddMissing`, `ListOffline`,
 * `DietBar`, the queue drain) finds a no-op instead of an undefined import.
 *
 * ── The three that must NOT pretend ───────────────────────────────────────
 *
 * `lookupLink`, `lookupBatch` and `saveOwnRecipe` need a parser, an outbound
 * fetch and an image mirror — server work by construction (§3: *"my-recipes'
 * add by URL requires a parser and is disabled in static mode"*). They return
 * the honest refusal, and `MyRecipesLive` shows the same sentence in place of
 * the form so nobody reaches them by accident.
 *
 * ── The one that answers, rather than no-ops ──────────────────────────────
 *
 * `currentOwner` returns null, and that is a real answer rather than a shrug:
 * on a static site there IS no server-held owner, so seeding and resyncing have
 * nothing to read. `dual-write` short-circuits both before they get here.
 */
import type { ActionResult } from "./result";
import type { ParsedLine } from "./paste";
import type { StateFlags } from "./owner-core";
import type { Owner } from "./owner-core";

/** The sentence every server-only path says, once, in one place. */
const NO_SERVER =
  "This copy of JipBap runs entirely in your browser, so there is nothing to " +
  "read a link for. You can still add ingredients by name.";

/** A write that already landed on the device — see the header. */
const done = async (): Promise<ActionResult> => ({ ok: true });

/* ── the pantry, the list, the diet ───────────────────────────────────────── */

export async function updateState(_id: string, _flags: StateFlags) { return done(); }
export async function savePantryPicks(_add: string[], _remove: string[]) { return done(); }
export async function answerAsk(_askId: string, _yes: boolean, _grants: string) { return done(); }
export async function addToGroceryList(_ids: string[]) { return done(); }
export async function moveListToPantry(_ids: string[]) { return done(); }
export async function excludeIngredient(_id: string, _excluded: boolean) { return done(); }
export async function updateDiet(_patch: { classes: string[]; allergens: string[] }) { return done(); }
export async function addListNote(_text: string) { return done(); }
export async function tickOffItem(_id: string, _enough: boolean) { return done(); }
export async function putAwayCart(_moveIds: string[], _clearRest = true) { return done(); }
export async function reviewPantryAfterAbsence(_gone: string[]) { return done(); }
export async function setIngredientNote(_id: string, _note: string) { return done(); }
export async function finishFirstRun(_answer: {
  have: string[]; classes: string[]; allergens: string[];
}) { return done(); }

/* ── recipes, cooks, plans ────────────────────────────────────────────────── */

export async function setNote(_recipeId: string, _note: string) { return done(); }
export async function dismissRecipe(_recipeId: string) { return done(); }
export async function saveRecipe(_recipeId: string) { return done(); }
export async function noteOpened(_recipeId: string) { return done(); }
/* The trailing id on these three is the DEVICE's, and it is why they can be
   no-ops at all: the client store has already written the cook or the plan
   under that exact id (`lib/dual-write`), so there is nothing here to mint and
   nothing for a later amendment to fail to find. */
export async function madeIt(
  _recipeId: string, _date?: string, _meal?: string, _planId?: string,
  _details?: { rating?: number; note?: string },
  _cookId?: string,
) { return done(); }
export async function settleUp(
  _cookId: string,
  _patch: { ranOut?: string[]; alsoUsed?: Array<{ id: string; insteadOf?: string }> },
) { return done(); }
export async function rateCook(
  _cookId: string,
  _patch: { rating?: number; note?: string; meal?: string;
            substituted?: Array<{ wanted: string; used: string }> },
) { return done(); }
export async function undoMadeIt(_cookId: string) { return done(); }
export async function planMeal(
  _recipeId: string, _date: string, _meal: string, _planId?: string,
) { return done(); }
export async function planNoteEntry(
  _label: string, _date: string, _meal: string, _planId?: string,
) { return done(); }
export async function unplanMeal(_planId: string) { return done(); }

/* ── the user's own recipes ───────────────────────────────────────────────── */

/**
 * Editing and deleting keep working, and it matters that they do.
 *
 * An own recipe is device state — it lives in the browser's blob and nowhere
 * else. `dual-write` applies both on the device and only MIRRORS them here, so
 * a static build loses the mirror and keeps the edit. What it cannot do is
 * CREATE one from a URL, because the id, the parse and the thumbnail all come
 * from the server (see `saveOwnRecipe`).
 */
export async function editOwnRecipe(
  _recipeId: string,
  _patch: { title?: string; url?: string; requires?: string[]; note?: string; steps?: string },
) { return done(); }
export async function removeOwnRecipe(_recipeId: string) { return done(); }

export async function saveOwnRecipe(_r: {
  title: string; url: string; source: string; image?: string;
  requires: string[]; note?: string; steps?: string;
}): Promise<ActionResult> {
  return { ok: false, error: NO_SERVER };
}

/** A pasted recipe folded into the corpus needs the recipe index — server work. */
export async function upgradeOwnRecipes(): Promise<{ moved: boolean }> {
  return { moved: false };
}

/* ── the parser and the link lookups ──────────────────────────────────────── */

export async function lookupLink(_url: string): Promise<
  { ok: true; meta: { url: string; source: string; title?: string; image?: string } }
  | { ok: false; error: string }
> {
  return { ok: false, error: NO_SERVER };
}

export async function lookupBatch(_urls: string[], _cap = 60): Promise<Array<{
  url: string; source: string; title?: string; image?: string; failed?: boolean;
}>> {
  return [];
}

/**
 * Reading a pasted ingredient BLOCK needs the whole vocabulary and the parser's
 * amount/unit stripping, neither of which ships. Empty rather than a guess: a
 * half-read paste that silently drops three lines is worse than a paste that
 * says it found nothing, and the autosuggest beside it adds the same
 * ingredients by name.
 */
export async function readPastedIngredients(_block: string): Promise<ParsedLine[]> {
  return [];
}

export async function readExport(_text: string): Promise<string[]> { return []; }
export async function readPastedLinks(_text: string): Promise<string[]> { return []; }
export async function importRecipes(_rows: Array<{
  url: string; title?: string; source?: string; image?: string;
}>): Promise<ActionResult> {
  return { ok: false, error: NO_SERVER };
}

/* ── the account, the record, the reminders ───────────────────────────────── */

/**
 * There is no server-held owner on a static site.
 *
 * Null is what `seedFromServer` and `resyncFromServer` are built to receive
 * from a visitor the server has never seen, so both already do the right thing
 * with it — start empty, adopt nothing. They short-circuit before reaching
 * here in any case (`dual-write`), and this is the floor under that.
 */
export async function currentOwner(): Promise<Owner | null> { return null; }

/** Accounts return on the API Worker (§7b), not here. */
export async function updateSharing(_granted: boolean) { return done(); }
export async function savePushSub(_sub: unknown, _tz?: string) { return done(); }
/** The dogfooding report board is a file on the VM; `layout` hides the button. */
export async function fileReport(_r: { kind: string; note: string; where?: string }) {
  return done();
}
