"use server";

/**
 * Server actions — the only writes in the product.
 *
 * Thin by design: each one resolves the owner, calls the store, and revalidates.
 * No matching, no scoring, no vocabulary decisions. Those live in `lib/match.ts`
 * and the offline pipeline, where they can be tested without a request.
 */
import { revalidatePath } from "next/cache";
import { currentUser, ownerId, ownerTz, setOwnerCookie } from "@/lib/owner";
import { addFreeText, addOwnRecipe, addOwnRecipes, addToList, tickOff, completeOnboarding, moveToPantry, amendCook, answerClarification, deleteOwnRecipe, updateOwnRecipe, dayKey, getOwner, linkPlanToCook, planNote, planRecipe, recordCook, unplanRecipe, setDetail, markOpened, setDiet, setExcluded, setManyInPantry, setRecipeNote, setState, settleCook, reviewPantry, toggleDismissed, toggleSaved, undoCook, type StateFlags , addPushSub, dietOf, pantryOf, putAway} from "@/lib/store";
import { setConsent } from "@/lib/store";
import { copyHash, hasAccount } from "@/lib/pool";
import { POLICY_VERSION, PURPOSE } from "@/lib/consent";
import { load, resolveId } from "@/lib/data";
import { nearMisses } from "@/lib/match";
import { applyDiet } from "@/lib/diet";
import { corpusTwin, findRecipe } from "@/lib/recipes";
import { transferOwnUpgrades } from "@/lib/store";
import { attempt, type ActionResult } from "@/lib/result";
import { fetchMeta } from "@/lib/oembed";
import { cacheUserImage } from "@/lib/user-images";
import { recordRequest } from "@/lib/requests";
import { parseLines, type ParsedLine } from "@/lib/paste";
import { linksFromExport, linksFromText } from "@/lib/import";
import { addReport } from "@/lib/reports";
import { REPORT_KINDS, type ReportKind } from "@/lib/report-kinds";

/**
 * Refresh every page that reads owner state — which is all three of them.
 *
 * Actions used to revalidate `"/"` and whichever other route the author had in
 * mind, and the set drifted: `updateState` refreshed only `"/"`, while the
 * pantry drawer it writes from also sits on `/calendar`. So editing your pantry
 * from the calendar left Thursday still reading "3 away" — indistinguishable
 * from a failed write, on a control whose whole design is that state is visible
 * before it changes.
 *
 * Every owner-state write now revalidates all three. The pages are cheap to
 * re-render and the alternative is a per-action judgement that has already been
 * got wrong seven times.
 */
function revalidateOwner() {
  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath("/my-recipes");
}

/**
 * The one write that does NOT revalidate, and the reason is cost.
 *
 * Every other action here happens once: you record a cook, you tick a row off
 * in a shop. This one happens over and over in a burst — someone opens a chip
 * and taps Have it, then Use first, then Will buy, correcting one ingredient.
 * Each of those was calling `revalidateOwner()`, which re-renders every page
 * that reads owner state: the shelves, the notices, and the recipe grid with
 * up to 300 cards in it. That is a full-tree reconciliation per tap, and it is
 * what makes the buttons feel stuck.
 *
 * Nothing about the write is deferred — the store is updated before this
 * returns, so nothing can be lost by navigating away or closing the tab. What
 * is deferred is telling the SERVER-rendered pages about it, and the client
 * does that once, when the panel closes (`Pantry`, `IngredientChips`).
 *
 * The panels themselves do not go stale in the meantime: they render from
 * `items` merged with a local override, so the chips, the shelf a chip sits
 * in, and the counts on both headings are all computed client-side from the
 * state just written.
 */
export async function updateState(ingredientId: string, flags: StateFlags): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);        // first write is what creates the owner
    // Resolve on WRITE as well as read, so a stale id from an open tab does not
    // create a second row for an ingredient that has since been merged.
    setState(id, resolveId(ingredientId), flags);
  });
}

/**
 * The browse grid's Save — a session of ticking, in one call.
 *
 * Ticking three hundred checkboxes one action at a time meant one round trip
 * and one rewrite of the store file per box, all racing to write the same file.
 * The grid stages the changes and sends them here once.
 *
 * No revalidate, like the other pantry writes: the grid shows its own ticks
 * already, and the recipe list catches up when the drawer closes.
 */
export async function savePantryPicks(add: string[], remove: string[]): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    // Resolved on write for the same reason `updateState` does it: a tab open
    // since before a merge would otherwise create a second row.
    setManyInPantry(id, add.map(resolveId), remove.map(resolveId));
  });
}

export async function answerAsk(askId: string, yes: boolean, grants: string): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    answerClarification(id, askId, yes, resolveId(grants));
    revalidateOwner();
  });
}

/**
 * Put a confirmed basket on the grocery list.
 *
 * Every suggestion-driven route into the list goes through a review step first
 * (UX-SPEC §4b), so what arrives here is what the user actually agreed to —
 * which is why it writes without asking anything more.
 */
export async function addToGroceryList(ingredientIds: string[]): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    addToList(id, ingredientIds.map(resolveId));
    revalidateOwner();
  });
}

/** Shopping done: the confirmed basket moves from the list into the pantry. */
export async function moveListToPantry(ingredientIds: string[]): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    moveToPantry(id, ingredientIds.map(resolveId));
    revalidateOwner();
  });
}

/** USER-SPEC §6 — hide recipes we can see contain this. */
/**
 * Also does not revalidate — same reason as `updateState`, same cost.
 *
 * This is a burst write too: the exclusion is set from a chip's detail sheet
 * while the drawer is open, and unset from the restrictions panel where several
 * are usually cleared at once. Revalidating each time re-rendered the recipe
 * grid under the finger, and the callers awaited it, so "saving…" covered the
 * write AND a full-tree reconciliation. Measured complaint, both directions.
 *
 * The write itself is complete before this returns, as ever. Both callers hold
 * the appearance locally and flush when their surface closes — `Pantry` on the
 * drawer, `Diet` on "done".
 */
export async function excludeIngredient(ingredientId: string, excluded: boolean): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    setExcluded(id, resolveId(ingredientId), excluded);
  });
}

/**
 * USER-SPEC §6 — the two axes, written together so a partial save cannot drop one.
 *
 * No revalidate, for the third time and the same reason: this is the other
 * control on the restrictions panel, and leaving it to re-render the grid on
 * every toggle would make one half of that panel instant and the other half
 * slow. `Diet` paints from its own copy and flushes on "done".
 */
export async function updateDiet(patch: { classes: string[]; allergens: string[] }): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    setDiet(id, patch);
  });
}

/**
 * Grant or withdraw permission to count this owner in partner aggregates —
 * PRIVACY-SPEC §5.
 *
 * Two things it refuses to do, both deliberately:
 *
 * **It will not record consent from an anonymous owner.** §5 says there is
 * nobody there to agree, so a record written now would be evidence of something
 * that did not happen — worse than no record, because it would look like one.
 * `ShareConsent` already declines to render in that case; this is the half that
 * cannot be routed around by a client that has been tampered with or a stale
 * page left open across a sign-out.
 *
 * **It will not accept the wording from the client.** `policy_version` and
 * `copy_hash` are read from `lib/consent.ts` here, on the server. Taking them
 * from the request would let the record attest to whatever text the caller
 * claimed was on screen, which is precisely the thing the hash exists to stop.
 *
 * The write itself moves no data. What the user is agreeing to is a question
 * asked later, by `lib/pool.ts`, when figures are built.
 */
export async function updateSharing(granted: boolean): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    const owner = getOwner(id);
    if (!owner || !hasAccount(owner)) {
      throw new Error(
        "Sharing needs an account. Nothing was recorded. See PRIVACY-SPEC §5.");
    }
    setConsent(id, {
      purpose: PURPOSE, granted,
      policy_version: POLICY_VERSION, copy_hash: copyHash(),
    });
    revalidateOwner();
  });
}

/**
 * First run answered — DECISIONS §3.
 *
 * One write for both halves, and it also creates the owner: this is usually the
 * first thing a visitor does, so the cookie is set here exactly as it is on
 * every other first write.
 */
export async function finishFirstRun(answer: {
  have: string[]; classes: string[]; allergens: string[];
}): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    completeOnboarding(id, {
      have: answer.have.map(resolveId),
      classes: answer.classes,
      allergens: answer.allergens,
    });
    revalidateOwner();
  });
}

/** RECIPE-SPEC §4 — the standing note on a dish, not on one cooking of it. */
export async function setNote(recipeId: string, note: string): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    setRecipeNote(id, recipeId, note);
    revalidateOwner();
  });
}

/**
 * How the last cooking went — rating, note, what was swapped.
 *
 * Separate from `madeIt` on purpose: the tap that records a cook stays free of
 * questions (UX-SPEC §5), and this is where the answers arrive if they arrive.
 */
export async function rateCook(
  cookId: string,
  patch: { rating?: number; note?: string; meal?: string;
           substituted?: Array<{ wanted: string; used: string }> },
): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    amendCook(id, cookId, {
      ...patch,
      // Ingredient ids can be stale in an open tab exactly as they can in the
      // pantry — resolve both ends through the redirect map (INGREDIENT-SPEC §1).
      ...(patch.substituted
        ? { substituted: patch.substituted.map((s) =>
            ({ wanted: resolveId(s.wanted), used: resolveId(s.used) })) }
        : {}),
    });
    revalidateOwner();
  });
}

/**
 * What survived the cook — UX-SPEC §6, and the pantry's only way to shrink.
 *
 * Separate from `rateCook` because it is a different kind of answer: the rating
 * is about the dish, this is about the kitchen. Separate from `madeIt` for the
 * reason §5 insists on — the tap that records a cook asks nothing at all, and
 * every question waits behind it.
 */
export async function settleUp(
  cookId: string,
  patch: { ranOut?: string[]; alsoUsed?: Array<{ id: string; insteadOf?: string }> },
): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    // Both ends through the redirect map, exactly as the pantry does — an open
    // tab can hold an id that has since been merged (INGREDIENT-SPEC §1).
    settleCook(id, cookId, {
      ...(patch.ranOut ? { ranOut: patch.ranOut.map(resolveId) } : {}),
      ...(patch.alsoUsed
        ? { alsoUsed: patch.alsoUsed.map((a) => ({
            id: resolveId(a.id),
            ...(a.insteadOf ? { insteadOf: resolveId(a.insteadOf) } : {}),
          })) }
        : {}),
    });
    revalidateOwner();
  });
}

/**
 * "Don't recommend this recipe" — and the same call brings it back.
 *
 * The product's only negative signal about a recipe. See `UserRecipe.dismissed_at`
 * for why it stands rather than expiring.
 */
export async function dismissRecipe(recipeId: string): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    toggleDismissed(id, recipeId);
    revalidateOwner();
  });
}

/**
 * The welcome-back review — the pantry's other subtractive path.
 *
 * `gone` may be empty: "all still here" is an answer, and the write is what
 * marks the owner active again so the panel does not reappear on the next load.
 * Skipping calls this with nothing, for the same reason.
 */
export async function reviewPantryAfterAbsence(gone: string[]): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    reviewPantry(id, gone.map(resolveId));
    revalidateOwner();
  });
}

/**
 * A typed item onto the grocery list — see `addFreeText`.
 *
 * No `resolveId`: the whole point is that this id is not in the vocabulary.
 */
export async function addListNote(text: string): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    addFreeText(id, text);
    revalidateOwner();
  });
}

/**
 * Tick one thing off while standing in the shop — into the cart (CART-SPEC).
 *
 * `enough: false` answers "three dinners want this — did you buy enough?" by
 * leaving it on the list while the one you did pick up goes in the cart, which
 * is the state the independent flags were designed for.
 *
 * The `toPantry` argument is gone with §4g's question: nothing this action
 * writes can reach the pantry, so there is nothing to answer here.
 */
export async function tickOffItem(
  ingredientId: string, enough: boolean,
): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    tickOff(id, resolveId(ingredientId), enough);
    revalidateOwner();
  });
}

/**
 * Home: the cart onto the shelves — CART-SPEC §2.
 *
 * Takes what to KEEP. Everything else in the cart leaves it without entering
 * the pantry, which is the honest record of a thing bought and eaten on the way
 * home. One write for the lot, like every other basket in this file.
 */
export async function putAwayCart(
  moveIds: string[], clearRest = true,
): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    putAway(id, moveIds.map(resolveId), clearRest);
    revalidateOwner();
  });
}

/**
 * Record this device for reminders — UX-SPEC §12.
 *
 * Called only after the browser has granted permission, which is only ever
 * asked at a user's first pin. The action does not ask for anything itself; it
 * stores what the browser handed over.
 */
export async function savePushSub(
  sub: { endpoint: string; keys: { p256dh: string; auth: string } },
): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    addPushSub(id, sub);
    /* No revalidate: nothing on screen depends on this, and re-rendering the
       page behind a permission dialog would be a visible jolt for a write the
       user did not initiate directly. */
  });
}

export async function saveRecipe(recipeId: string): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    toggleSaved(id, recipeId);
    revalidateOwner();
  });
}

/**
 * "Made it" — additive to the pantry (DECISIONS §5).
 *
 * The snapshot of `requires` is taken HERE, from the recipe as it stands right
 * now, because RECIPE-SPEC §3 says a cook event must record what was required at
 * the time. Reading it later from the live recipe would make the history lie the
 * first time the parse improves.
 */
export async function madeIt(
  recipeId: string, date?: string, meal?: string, planId?: string,
  /**
   * The reflective fields, when the caller already has them.
   *
   * `rateCook` exists for the case §5 is built around — the untaxed tap, with
   * the answers arriving later against a cook id. The "Made it!" dialogue is the
   * other case: it holds a form that is not committed until Save, so by the time
   * anything is written the rating and the note are already known and there is
   * no id yet to attach them to. Passing them here makes it one write instead of
   * a create-then-amend that could half-fail.
   *
   * `recordCook` has always accepted both — this only stops the action from
   * being the narrow spot in the pipe.
   */
  details?: { rating?: number; note?: string },
  /**
   * The cook's identity, when the caller already minted it — `dual-write` does.
   *
   * The device is the writer for the cook log now (STATIC-SPEC §2), and every
   * amendment addresses a cook BY ID. Two shells minting separately meant the
   * id the modal held did not exist on the other side, which is precisely what
   * kept these writes server-only for a slice. The client mints, this accepts,
   * and `recordCook` falls back to minting its own when it is absent — so a
   * caller that has not been converted behaves exactly as it did.
   */
  cookId?: string,
): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    /**
     * The corpus AND the user's own recipes.
     *
     * This read `load().recipes` alone, which holds the corpus only — own
     * recipes are merged per request and deliberately never enter that shared
     * cache. So "Made it" on a recipe you added yourself failed with "no longer
     * in the index", and reloading could not help, because the recipe had never
     * been there. The one action that closes the cook loop was the one action
     * own recipes could not perform.
     */
    const recipe = findRecipe(getOwner(id), recipeId);
    // A recipe id that no longer resolves is a real condition — the index is
    // regenerated and ids are stable, but a stale tab can hold an old one. It
    // used to return silently, which reads as "cooked" and records nothing.
    if (!recipe) throw new Error("That recipe is no longer in the index. Reload the page.");
    /**
     * The DATE is the calendar's: a meal planned for Monday and ticked off on
     * Friday belongs to Monday. Absent, or if it is today, the cook is stamped
     * `now` so the time of day is real.
     *
     * A past date becomes NOON local, not midnight. Midnight sits on the
     * boundary, and any timezone arithmetic downstream lands it on the wrong
     * square; noon has twelve hours of slack in both directions.
     */
    const tz = await ownerTz();
    const cookedAt = !date || date === dayKey(new Date(), tz)
      ? undefined
      : new Date(`${date}T12:00:00`).toISOString();
    const owner = recordCook(id, recipeId, {
      required: recipe.requires,
      ...(cookId ? { id: cookId } : {}),
      ...(cookedAt ? { cookedAt } : {}),
      ...(meal ? { meal } : {}),
      ...(details?.rating !== undefined ? { rating: details.rating } : {}),
      ...(details?.note ? { note: details.note } : {}),
      // This action is the only place that knows whether a plan was being
      // ticked off — the store sees a cook either way. BEHAVIOR-SPEC §4.
      source: planId ? "planned" : "spontaneous",
    });
    /**
     * A planned meal ticked off links to its plan rather than becoming a loose
     * second record of the same dinner. Two rows stay two rows — the plan keeps
     * being the intention, and now it points at what it became.
     */
    if (planId) linkPlanToCook(id, planId, owner.cooks[owner.cooks.length - 1]!.id);
    revalidateOwner();
  });
}

/**
 * Put a recipe on the calendar.
 *
 * `planId` is the device's, when it has one — the same arrangement `madeIt`
 * explains: one minter, so `unplanMeal` names a row both copies hold.
 */
export async function planMeal(
  recipeId: string, date: string, meal: string, planId?: string,
): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    planRecipe(id, recipeId, date, meal, planId);
    revalidateOwner();
  });
}

/**
 * Put something on the calendar that is not a dish — RECIPE-SPEC §4d.
 *
 * "Eat out", "uber", "at mum's". The same call as `planMeal` from the client's
 * point of view, and a different row: a note has no recipe, so it contributes
 * nothing to `planNeeds` and never offers "Made it".
 */
export async function planNoteEntry(
  label: string, date: string, meal: string, planId?: string,
): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    planNote(id, label, date, meal, planId);
    revalidateOwner();
  });
}

/**
 * Take a recipe off the calendar.
 *
 * The cook it points at, if any, STAYS — unplanning Monday after you ate it must
 * not delete the record that you ate it (RECIPE-SPEC §4d).
 */
export async function unplanMeal(planId: string): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    unplanRecipe(id, planId);
    revalidateOwner();
  });
}

/** Remove one cook, with its rating and note. */
export async function undoMadeIt(cookId: string): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    undoCook(id, cookId);
    revalidateOwner();
  });
}

/**
 * Look up a pasted link — SOCIAL-INGEST §2a.
 *
 * A server action rather than a client fetch, because the oEmbed endpoints do
 * not all send CORS headers and because it keeps the outbound request on our
 * side rather than the user's browser.
 */
export async function lookupLink(url: string): Promise<
  { ok: true; meta: Awaited<ReturnType<typeof fetchMeta>> } | { ok: false; error: string }
> {
  try {
    return { ok: true, meta: await fetchMeta(url) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Read a pasted ingredient block — see `lib/paste.ts`.
 *
 * A server action because the vocabulary lives on the server; nothing is
 * written, so it takes no owner and returns proposals for review.
 */
export async function readPastedIngredients(block: string): Promise<ParsedLine[]> {
  return parseLines(block);
}

/**
 * Look up a batch of pasted or exported links — SOCIAL-INGEST §2a at scale.
 *
 * ── Why this is throttled and capped ───────────────────────────────────────
 *
 * oEmbed is one HTTP request per video. Firing 200 at once is both rude and
 * self-defeating: TikTok throttles, and what comes back is a screen of failures
 * that looks like our bug. Four at a time, and a hard cap per batch, so a large
 * collection arrives in several deliberate passes rather than one that half
 * works.
 *
 * ── A failed lookup is not a failed import ────────────────────────────────
 *
 * A link we could not resolve still gets a row, with `title` absent. §2a is
 * clear that a caption must never silently become a title; by the same logic a
 * URL must never silently become one either, so the review screen shows it as
 * needing a name rather than inventing one.
 */
export async function lookupBatch(urls: string[], cap = 60): Promise<Array<{
  url: string; source: string; title?: string; image?: string; failed?: boolean;
}>> {
  const take = urls.slice(0, cap);
  const out: Array<{ url: string; source: string; title?: string; image?: string;
                     failed?: boolean }> = new Array(take.length);

  const CONCURRENCY = 4;
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= take.length) return;
      const url = take[i]!;
      try {
        const meta = await fetchMeta(url);
        out[i] = {
          url: meta.url, source: meta.source,
          ...(meta.title ? { title: meta.title } : {}),
          ...(meta.image ? { image: meta.image } : {}),
        };
      } catch {
        // The URL is still worth importing — the user knows what it is.
        let host = url;
        try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* keep the raw */ }
        out[i] = { url, source: host, failed: true };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, take.length) }, worker));
  return out;
}

/**
 * Read a TikTok data export — see `lib/import.ts`.
 *
 * Takes the file as text rather than as a `File`, because the client reads it
 * anyway to check the size, and shipping the parsed text keeps this action from
 * needing multipart handling for what is ultimately a string.
 */
export async function readExport(text: string) {
  return linksFromExport(text);
}

/** Read pasted links. Pure, but here so the client needs no bundle for it. */
export async function readPastedLinks(text: string) {
  return linksFromText(text);
}

/**
 * Commit a reviewed batch into "My recipes".
 *
 * Everything lands without ingredients, which is the honest state — nothing was
 * parsed. The count is returned so the screen can say what actually happened,
 * including how many were already there.
 */
export async function importRecipes(rows: Array<{
  title: string; url: string; source: string; image?: string;
}>): Promise<ActionResult<{ added: number; skipped: number }>> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    // Thumbnails mirrored like the single save, but in small batches — an
    // import can carry hundreds of rows, and hundreds of parallel fetches of
    // other people's CDNs is both rude and a way to time out the action.
    const cached = [...rows];
    for (let i = 0; i < cached.length; i += 8) {
      await Promise.all(cached.slice(i, i + 8).map(async (r, j) => {
        if (!r.image) return;
        const local = await cacheUserImage(r.image, 4000, r.url);
        if (local) cached[i + j] = { ...r, image: local };
      }));
    }
    const result = addOwnRecipes(id, cached);
    revalidateOwner();
    return result;
  });
}

/** Save a recipe of the user's own. */
export async function saveOwnRecipe(r: {
  title: string; url: string; source: string; image?: string;
  requires: string[]; note?: string; steps?: string;
}): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    // The thumbnail, mirrored NOW while its URL is known to work — a remote
    // image dies with someone else's CDN, and a user's own shelf must not
    // (user-images.ts). Best-effort: failure keeps the remote URL.
    const image = r.image ? (await cacheUserImage(r.image, 6000, r.url)) ?? r.image : undefined;
    // Resolve on write, exactly as the pantry does: a stale id from an open tab
    // must not enter a recipe that will then match nothing (INGREDIENT-SPEC §1).
    addOwnRecipe(id, { ...r, ...(image ? { image } : {}), requires: r.requires.map(resolveId) });
    // UX-SPEC SS11: saving your own copy of an off-corpus recipe is "I want to
    // cook this" in its strongest form, so it feeds the demand board's tally.
    // The recipe itself stays private; only the URL and a count ever surface,
    // and only past the board's public threshold.
    try {
      recordRequest(r.url, id, { title: r.title, ...(image ? { image } : {}) });
    } catch { /* the board must never break the save */ }
    revalidateOwner();
  });
}

export async function editOwnRecipe(
  recipeId: string,
  patch: { title?: string; url?: string; requires?: string[]; note?: string; steps?: string },
): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    updateOwnRecipe(id, recipeId, {
      ...patch,
      ...(patch.requires ? { requires: patch.requires.map(resolveId) } : {}),
    });
    revalidateOwner();
  });
}

export async function removeOwnRecipe(recipeId: string): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    deleteOwnRecipe(id, recipeId);
    revalidateOwner();
  });
}

export async function currentOwner() {
  return getOwner(await ownerId());
}

/**
 * Fold pasted recipes that curation has since taken into the corpus.
 *
 * `/my-recipes` did this in its server component's BODY — a write during
 * render, which is exactly what it looks like. The page reads its shelves from
 * the device now (STATIC-SPEC §2), so there is no render to hang it off; it is
 * an action the page calls once on mount, and it answers whether anything
 * actually moved so the caller knows whether the device needs to re-read
 * (`dual-write.upgradeOwnRecipes`). Nothing moved is the common case and must
 * cost nothing.
 */
export async function upgradeOwnRecipes(): Promise<{ moved: boolean }> {
  const id = await ownerId();
  const before = getOwner(id)?.own.length ?? 0;
  transferOwnUpgrades(id, (url) => corpusTwin(url)?.id);
  return { moved: (getOwner(id)?.own.length ?? 0) !== before };
}


/**
 * A note on an ingredient — INGREDIENT-SPEC §2's `note`, read for the first time.
 *
 * The field has been on `UserIngredient` since the store was written and nothing
 * has ever shown it. It is the answer to the things a pantry cannot express in
 * three flags: *the one in the door*, *buy the big jar*, *this brand is too
 * salty*. A kitchen has those facts and the product had nowhere to put them.
 *
 * `setDetail` writes only the row that exists — a note is about something you
 * already have or want, so there is nothing to create.
 */
export async function setIngredientNote(ingredientId: string, note: string): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    setDetail(id, resolveId(ingredientId), { note: note.trim() });
    revalidateOwner();
  });
}

/**
 * File a bug report from wherever the person is standing — see `ReportButton`.
 *
 * A dogfooding tool, deliberately thin: no triage, no severity, no email. The
 * owner and the signed-in address are attached here rather than sent by the
 * client, because the client should not be trusted to say whose kitchen it is
 * and would have to be told in order to lie about it.
 */
export async function fileReport(r: {
  what: string; kind?: string; url: string;
  viewport?: string; ua?: string; sw?: string;
}): Promise<ActionResult> {
  return attempt(async () => {
    const what = r.what.trim();
    if (!what) throw new Error("Nothing to report.");
    const user = await currentUser();
    addReport({
      at: new Date().toISOString(),
      /* Capped. A paste of a whole stack trace is welcome; a paste of a whole
         page is a log file nobody will scroll. */
      what: what.slice(0, 4000),
      /* Validated against the list rather than trusted: this is a client value
         and an unknown one would sort into a bucket nobody looks at. */
      ...(r.kind && (REPORT_KINDS as readonly string[]).includes(r.kind)
        ? { kind: r.kind as ReportKind } : {}),
      url: r.url.slice(0, 500),
      owner: await ownerId(),
      ...(user?.email ? { email: user.email } : {}),
      ...(r.viewport ? { viewport: r.viewport } : {}),
      ...(r.ua ? { ua: r.ua.slice(0, 300) } : {}),
      ...(r.sw ? { sw: r.sw.slice(0, 40) } : {}),
    });
  });
}

/**
 * Note that a recipe was opened — the signal Explore is built on.
 *
 * Fired from the client on mount rather than during the server render of the
 * modal, and that is not a style choice: Next prefetches links, so rendering
 * `?recipe=x` is something that happens when a card is merely HOVERED. Marking
 * opened there would record recipes nobody looked at and quietly empty Explore
 * of exactly the cards the user was closest to choosing.
 *
 * No revalidate, like the other high-frequency writes. Nothing on screen
 * depends on it: the effect is on what Explore offers next time.
 */
export async function noteOpened(recipeId: string): Promise<ActionResult> {
  return attempt(async () => {
    const id = await ownerId();
    await setOwnerCookie(id);
    markOpened(id, recipeId);
  });
}
