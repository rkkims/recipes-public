/**
 * Store tests — the migration, and the two writes that remove things.
 *
 * `owners.json` is the one file in Phase A that cannot be regenerated. Almost
 * everything else here is derived from the corpus and rebuilt by a script; this
 * is the user's own data, so the code that reshapes it (`upgrade`) and the code
 * that deletes from it (`undoCook`, `toggleSaved`) is worth a test even though
 * the rest of the store is not.
 *
 * The store resolves its file from `process.cwd()`, so the test runs inside a
 * temp directory shaped like the repo. Getting this wrong once already wrote a
 * synthetic ontology over the real one, and this file is a worse thing to lose.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = mkdtempSync(join(tmpdir(), "store-test-"));
mkdirSync(resolve(root, "app"), { recursive: true });
mkdirSync(resolve(root, "data", "app"), { recursive: true });
const FILE = resolve(root, "data", "app", "owners.json");
process.chdir(resolve(root, "app"));

let failures = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) return;
  failures++;
  console.error(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
};

const seed = (owners: unknown) => writeFileSync(FILE, JSON.stringify({ owners }));
const raw = () => JSON.parse(readFileSync(FILE, "utf8")).owners;

/**
 * Imported dynamically, and AFTER the chdir above.
 *
 * `store.ts` resolves its file path at module scope, so a static import would
 * bind it to the real repo before the test could redirect it. Wrapped in a
 * function because tsx compiles this to CJS, where top-level await is not
 * available.
 */
async function main() {
const store = await import("./store.js");

// ── the migration ──────────────────────────────────────────────────────────
{
  seed({
    o1: {
      id: "o1", created_at: "2026-01-01T00:00:00.000Z", ingredients: {},
      saved: ["rec_a", "rec_b"], cooks: [], answers: {},
    },
  });
  const o = store.getOwner("o1")!;
  ok("migration: saved[] becomes rows", Object.keys(o.recipes).length === 2,
      JSON.stringify(o.recipes));
  ok("migration: the flag survives", o.recipes["rec_a"]?.saved === true);
  ok("migration: legacy key is gone", o.saved === undefined);
  // A read must never write. The file on disk is still the old shape until
  // something actually mutates it.
  ok("migration: read did not write", raw().o1.saved?.length === 2,
      "a plain page load rewrote owners.json");

  store.toggleSaved("o1", "rec_c");
  ok("migration: persists on the next real write", raw().o1.saved === undefined);
  ok("migration: rows survive that write", Object.keys(raw().o1.recipes).length === 3);
}

// ── saved and the standing note share a row ────────────────────────────────
{
  seed({ o2: { id: "o2", created_at: "2026-01-01T00:00:00.000Z", ingredients: {}, recipes: {}, cooks: [] } });
  store.toggleSaved("o2", "rec_a");
  ok("save: creates the row", store.getOwner("o2")!.recipes["rec_a"]?.saved === true);

  store.setRecipeNote("o2", "rec_a", "  always double the garlic  ");
  ok("note: trimmed", store.getOwner("o2")!.recipes["rec_a"]?.note === "always double the garlic");

  store.toggleSaved("o2", "rec_a");
  const row = store.getOwner("o2")!.recipes["rec_a"];
  ok("unsave: keeps a row that still holds a note", row?.saved === false && !!row?.note,
      JSON.stringify(row));

  store.setRecipeNote("o2", "rec_a", "");
  ok("unsave + no note: the row goes", store.getOwner("o2")!.recipes["rec_a"] === undefined);

  store.setRecipeNote("o2", "rec_b", "note first, never saved");
  ok("note alone creates a row", store.getOwner("o2")!.recipes["rec_b"]?.saved === false);
}

// ── amending the most recent cook ──────────────────────────────────────────
{
  seed({ o3: { id: "o3", created_at: "2026-01-01T00:00:00.000Z", ingredients: {}, recipes: {}, cooks: [] } });
  store.recordCook("o3", "rec_a", { required: ["ing_1", "ing_2"] });
  // Two cooks of the same dish, distinguishable by timestamp.
  store.recordCook("o3", "rec_a", { required: ["ing_1"] });
  // Both cooks land in the same millisecond, so give them distinct times the
  // way a real month apart would. Mutate ONE read and write that same object —
  // `getOwner` re-reads from disk every call, so a second call would hand back
  // a fresh copy without these edits.
  const o3 = store.getOwner("o3")!;
  o3.cooks[0]!.cooked_at = "2026-01-01T10:00:00.000Z";
  o3.cooks[1]!.cooked_at = "2026-02-01T10:00:00.000Z";
  writeFileSync(FILE, JSON.stringify({ owners: { o3 } }));

  const latest = store.latestCook(store.getOwner("o3")!, "rec_a")!;
  ok("latestCook: picks the later date", latest.cooked_at === "2026-02-01T10:00:00.000Z");

  store.amendCook("o3", latest.id, { rating: 4, note: "  too salty  " });
  const after = store.getOwner("o3")!.cooks;
  ok("amend: hits the event pointed at", after[1]!.rating === 4 && after[1]!.note === "too salty");
  ok("amend: leaves the other one alone", after[0]!.rating === undefined);

  // The calendar's case: rating a meal that is NOT the most recent, because it
  // was cooked on a date the user is looking at.
  store.amendCook("o3", after[0]!.id, { rating: 2 });
  ok("amend: an older cook can be rated by id",
      store.getOwner("o3")!.cooks[0]!.rating === 2);
  ok("amend: rating an older one leaves the newer alone",
      store.getOwner("o3")!.cooks[1]!.rating === 4);

  let threw = "";
  try { store.amendCook("o3", latest.id, { rating: 9 }); } catch (e) { threw = String(e); }
  ok("amend: rejects a rating out of 1..5", threw.includes("1 to 5"), threw);
  ok("amend: a rejected rating changes nothing",
      store.getOwner("o3")!.cooks[1]!.rating === 4);

  threw = "";
  try { store.amendCook("o3", "ck_nope", { rating: 3 }); } catch (e) { threw = String(e); }
  ok("amend: refuses an unknown event", threw.includes("no longer in your history"), threw);

  // Reviewer's call: undo takes the record with it.
  store.undoCook("o3", latest.id);
  const left = store.getOwner("o3")!.cooks;
  ok("undo: removes exactly one", left.length === 1, JSON.stringify(left));
  ok("undo: removes the one pointed at", left[0]!.cooked_at === "2026-01-01T10:00:00.000Z");
  // The event and its rating are gone together — there is nothing left holding
  // the 4. The survivor keeps its OWN 2, which is the other half of the claim:
  // undo removed one record and left the neighbouring one untouched.
  ok("undo: the rating went with the event", !left.some((c) => c.id === latest.id));
  ok("undo: the other cook is untouched", left[0]!.rating === 2);
  // DECISIONS §5 — cooking is additive and stays additive.
  ok("undo: does not strip the pantry",
      store.getOwner("o3")!.ingredients["ing_1"]?.in_pantry === true);

  threw = "";
  try { store.undoCook("o3", latest.id); } catch (e) { threw = String(e); }
  ok("undo: refuses to remove the same event twice",
      threw.includes("no longer in your history"), threw);
}

// ── two cooks in the same millisecond ──────────────────────────────────────
// Not hypothetical from a script, and the reason `id` carries a random suffix
// and the "most recent" scans use `>=`: with a strict comparison both amend and
// undo reached for the EARLIER of two events sharing a timestamp.
{
  seed({ o4: { id: "o4", created_at: "2026-01-01T00:00:00.000Z", ingredients: {}, recipes: {}, cooks: [] } });
  store.recordCook("o4", "rec_a", { required: ["ing_1"] });
  store.recordCook("o4", "rec_a", { required: ["ing_2"] });
  const cooks = store.getOwner("o4")!.cooks;
  ok("same ms: ids are still distinct", cooks[0]!.id !== cooks[1]!.id,
      `${cooks[0]!.id} vs ${cooks[1]!.id}`);

  // Force the tie rather than hoping for it. Left to the clock this branch
  // skipped itself on the first run, which is a check that reports a pass it
  // never made.
  const tied = store.getOwner("o4")!;
  tied.cooks[0]!.cooked_at = tied.cooks[1]!.cooked_at = "2026-03-01T12:00:00.000Z";
  writeFileSync(FILE, JSON.stringify({ owners: { o4: tied } }));

  const pick = store.latestCook(store.getOwner("o4")!, "rec_a")!;
  ok("same ms: latestCook takes the one appended later", pick.required[0] === "ing_2",
      JSON.stringify(pick.required));

  store.amendCook("o4", pick.id, { rating: 5 });
  const after = store.getOwner("o4")!.cooks;
  ok("same ms: the amendment lands on that one", after[1]!.rating === 5,
      JSON.stringify(after.map((c) => c.rating)));

  store.undoCook("o4", pick.id);
  const left = store.getOwner("o4")!.cooks;
  ok("same ms: undo removes exactly that one",
      left.length === 1 && left[0]!.required[0] === "ing_1",
      JSON.stringify(left.map((c) => c.required)));
}

// ── a cook cannot be in the future ─────────────────────────────────────────
// The calendar hides "Made it" on future dates; this is the rule behind it. A
// planned meal is not a cooked one, and a log that accepts tomorrow's dinner
// is a log that cannot be trusted about yesterday's.
{
  seed({ o5: { id: "o5", created_at: "2026-01-01T00:00:00.000Z", ingredients: {}, recipes: {}, cooks: [] } });
  const day = 24 * 60 * 60 * 1000;

  let threw = "";
  const future = new Date(Date.now() + 7 * day).toISOString();
  try { store.recordCook("o5", "rec_a", { required: ["ing_1"], cookedAt: future }); }
  catch (e) { threw = String(e); }
  ok("future: refused", threw.includes("in the future"), threw);
  ok("future: nothing was written", (store.getOwner("o5")?.cooks.length ?? 0) === 0);

  const past = new Date(Date.now() - 3 * day).toISOString();
  store.recordCook("o5", "rec_a", { required: ["ing_1"], cookedAt: past });
  ok("past: a date the calendar supplies is kept",
      store.getOwner("o5")!.cooks[0]!.cooked_at === past);

  threw = "";
  try { store.recordCook("o5", "rec_a", { required: ["ing_1"], cookedAt: "not a date" }); }
  catch (e) { threw = String(e); }
  ok("garbage date: refused", threw.includes("Not a date"), threw);
}

// ── plans and cooks are two rows ───────────────────────────────────────────
{
  seed({ o6: { id: "o6", created_at: "2026-01-01T00:00:00.000Z", ingredients: {}, recipes: {}, plans: [], cooks: [] } });
  // Dates relative to now, not literals. A hardcoded date passes today and
  // starts failing the day it goes stale — and the first version of this test
  // planned a cook for four days in the FUTURE, which `recordCook` refused,
  // correctly.
  const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const day = store.dayKey(past);

  const plan = store.planRecipe("o6", "rec_a", day, "dinner");
  ok("plan: written", store.getOwner("o6")!.plans.length === 1);
  ok("plan: not yet cooked", store.getOwner("o6")!.plans[0]!.cook_id === undefined);

  store.recordCook("o6", "rec_a", { required: ["ing_1"], cookedAt: past.toISOString() });
  const cookId = store.getOwner("o6")!.cooks[0]!.id;
  store.linkPlanToCook("o6", plan.id, cookId);
  ok("plan: points at the cook it became",
      store.getOwner("o6")!.plans[0]!.cook_id === cookId);

  // The whole reason they are two rows: removing the intention must not remove
  // the record of what happened.
  store.unplanRecipe("o6", plan.id);
  ok("unplan: the plan goes", store.getOwner("o6")!.plans.length === 0);
  ok("unplan: the cook stays", store.getOwner("o6")!.cooks.length === 1);

  let threw = "";
  try { store.planRecipe("o6", "rec_a", "10 August", "dinner"); } catch (e) { threw = String(e); }
  ok("plan: refuses a non-calendar date", threw.includes("Not a calendar date"), threw);
}

// ── the summary is computed, not stored (§6) ───────────────────────────────
{
  seed({ o7: { id: "o7", created_at: "2026-01-01T00:00:00.000Z", ingredients: {}, recipes: {}, plans: [], cooks: [] } });
  const empty = store.summaryFor(store.getOwner("o7"), "rec_a");
  ok("summary: nothing cooked reads as zero, not as a rating",
      empty.mine.cooks === 0 && empty.mine.rating === null);
  // §9's slot exists and is explicitly empty — "we have nothing" is a different
  // claim from "nobody did anything".
  ok("summary: the community slot is declared and null", empty.community === null);

  store.recordCook("o7", "rec_a", {
    required: ["ing_1", "ing_2", "ing_3"],
    substituted: [{ wanted: "ing_2", used: "ing_9" }], skipped: ["ing_3"],
  });
  store.recordCook("o7", "rec_a", {
    required: ["ing_1", "ing_2"],
    substituted: [{ wanted: "ing_2", used: "ing_9" }],
  });
  const o7 = store.getOwner("o7")!;
  o7.cooks[0]!.cooked_at = "2026-03-01T12:00:00.000Z";
  o7.cooks[1]!.cooked_at = "2026-05-01T12:00:00.000Z";
  o7.cooks[0]!.rating = 3;
  o7.cooks[1]!.rating = 5;
  writeFileSync(FILE, JSON.stringify({ owners: { o7 } }));

  const sum = store.summaryFor(store.getOwner("o7"), "rec_a");
  ok("summary: counts every cook", sum.mine.cooks === 2);
  ok("summary: averages only the rated ones", sum.mine.rating === 4 && sum.mine.rated === 2);
  ok("summary: first and last are the extremes",
      sum.mine.first === "2026-03-01T12:00:00.000Z" && sum.mine.last === "2026-05-01T12:00:00.000Z");
  ok("summary: newest event first", sum.mine.events[0]!.cooked_at === "2026-05-01T12:00:00.000Z");
  ok("summary: a repeated substitution is counted, not listed twice",
      sum.mine.substitutions.length === 1 && sum.mine.substitutions[0]!.times === 2,
      JSON.stringify(sum.mine.substitutions));
  ok("summary: skips are tallied",
      sum.mine.skips.length === 1 && sum.mine.skips[0]!.ingredient === "ing_3");

  // A rating on one cook must not be read as a rating of the recipe.
  store.amendCook("o7", sum.mine.events[1]!.id, { rating: 1 });
  ok("summary: the average moves with the log",
      store.summaryFor(store.getOwner("o7"), "rec_a").mine.rating === 3);
}

// ── a cook belongs to a local calendar day ─────────────────────────────────
{
  seed({ o8: { id: "o8", created_at: "2026-01-01T00:00:00.000Z", ingredients: {}, recipes: {}, plans: [], cooks: [] } });
  // Late evening local time. `toISOString().slice(0,10)` would call this the
  // NEXT day anywhere west of Greenwich — which is exactly when dinner gets
  // recorded, so it would be wrong most of the time it mattered.
  const d = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const evening = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 22, 30);
  const expected =
    `${evening.getFullYear()}-${String(evening.getMonth() + 1).padStart(2, "0")}` +
    `-${String(evening.getDate()).padStart(2, "0")}`;
  ok("dayKey: uses local time, not UTC", store.dayKey(evening) === expected,
      `${store.dayKey(evening)} vs ${expected}`);

  const next = store.dayKey(new Date(evening.getTime() + 24 * 60 * 60 * 1000));
  store.recordCook("o8", "rec_a", { required: ["ing_1"], cookedAt: evening.toISOString() });
  ok("cooksOnDate: finds the cook on its local day",
      store.cooksOnDate(store.getOwner("o8"), "rec_a", expected).length === 1);
  ok("cooksOnDate: does not find it on the next",
      store.cooksOnDate(store.getOwner("o8"), "rec_a", next).length === 0);

  // Lunch and dinner of the same dish on one day: the reason this returns a
  // LIST. Picking the first would silently drop one of them.
  const lunch = new Date(evening.getFullYear(), evening.getMonth(), evening.getDate(), 12, 30);
  store.recordCook("o8", "rec_a", { required: ["ing_1"], cookedAt: lunch.toISOString(), meal: "lunch" });
  const both = store.cooksOnDate(store.getOwner("o8"), "rec_a", expected);
  ok("cooksOnDate: returns every cook that day", both.length === 2, JSON.stringify(both.map((c) => c.meal)));
  ok("cooksOnDate: earliest first", both[0]!.meal === "lunch");
  ok("meal: recorded when given", both[0]!.meal === "lunch");

  store.amendCook("o8", both[1]!.id, { meal: "dinner" });
  ok("meal: can be answered after the fact",
      store.cooksOnDate(store.getOwner("o8"), "rec_a", expected)[1]!.meal === "dinner");
  store.amendCook("o8", both[1]!.id, { meal: "" });
  ok("meal: clearing it removes the field",
      store.cooksOnDate(store.getOwner("o8"), "rec_a", expected)[1]!.meal === undefined);
}

// ── the viewer's zone decides which day a cook belongs to ─────────────────
// The server runs in UTC. Without a zone, a Californian evening is filed under
// tomorrow — the calendar highlights the wrong square and "Made it" records the
// wrong day, for several hours every single evening.
{
  // 2026-08-05 23:30 UTC. Still the 5th in Berlin (+2 → the 6th, actually),
  // and still the 5th in Los Angeles (16:30 on the 5th).
  const t = new Date("2026-08-05T23:30:00.000Z");
  ok("tz: UTC", store.dayKey(t, "UTC") === "2026-08-05", store.dayKey(t, "UTC"));
  ok("tz: Los Angeles is still the 5th",
      store.dayKey(t, "America/Los_Angeles") === "2026-08-05",
      store.dayKey(t, "America/Los_Angeles"));
  ok("tz: Seoul has already turned over",
      store.dayKey(t, "Asia/Seoul") === "2026-08-06", store.dayKey(t, "Asia/Seoul"));

  // The case that motivated all of this: 6pm Pacific is the NEXT day in UTC.
  const evening = new Date("2026-08-07T01:00:00.000Z");
  ok("tz: 6pm Pacific is not tomorrow",
      store.dayKey(evening, "America/Los_Angeles") === "2026-08-06",
      store.dayKey(evening, "America/Los_Angeles"));
  ok("tz: and UTC would have called it tomorrow",
      store.dayKey(evening, "UTC") === "2026-08-07");

  seed({ o9: { id: "o9", created_at: "2026-01-01T00:00:00.000Z", ingredients: {}, recipes: {}, plans: [], cooks: [
    { id: "ck_e", recipe_id: "rec_a", cooked_at: "2026-08-07T01:00:00.000Z",
      required: [], substituted: [], skipped: [] },
  ] } });
  ok("tz: cooksOnDate files it under the viewer's day",
      store.cooksOnDate(store.getOwner("o9"), "rec_a", "2026-08-06", "America/Los_Angeles").length === 1);
  ok("tz: and not under the server's",
      store.cooksOnDate(store.getOwner("o9"), "rec_a", "2026-08-07", "America/Los_Angeles").length === 0);

  // A junk cookie must not throw inside a page render.
  ok("tz: an unknown zone falls back rather than failing",
      typeof store.dayKey(t, "Not/AZone") === "string");
}

// ── recipes the user added themselves ─────────────────────────────────────
{
  seed({ o10: { id: "o10", created_at: "2026-01-01T00:00:00.000Z", ingredients: {}, recipes: {}, plans: [], own: [], cooks: [] } });

  const made = store.addOwnRecipe("o10", {
    title: "  Aaron's kimchi jjigae  ", url: "https://www.youtube.com/watch?v=abc",
    source: "Aaron and Claire", requires: ["ing_1", "ing_2", "ing_1"],
  });
  ok("own: id is marked as the user's", made.id.startsWith("rec_own_"), made.id);
  ok("own: title trimmed", made.title === "Aaron's kimchi jjigae");
  ok("own: requires deduplicated", made.requires.length === 2, JSON.stringify(made.requires));
  ok("own: stored on the owner", store.getOwner("o10")!.own.length === 1);

  let threw = "";
  try { store.addOwnRecipe("o10", { title: "", url: "https://x.example", source: "", requires: [] }); }
  catch (e) { threw = String(e); }
  ok("own: refuses an empty title", threw.includes("needs a title"), threw);

  threw = "";
  try { store.addOwnRecipe("o10", { title: "x", url: "tiktok.com/@a/1", source: "", requires: [] }); }
  catch (e) { threw = String(e); }
  ok("own: refuses a link that is not one", threw.includes("needs a link"), threw);

  // It has to look like a Recipe to the matcher, or it can be saved and never
  // matched — the failure that would make the whole feature pointless.
  const asRecipes = store.ownAsRecipes(store.getOwner("o10"));
  ok("own: exposed in the matcher's shape",
      asRecipes.length === 1 && asRecipes[0]!.requires.length === 2 &&
      Array.isArray(asRecipes[0]!.unresolved) && asRecipes[0]!.unresolved.length === 0,
      JSON.stringify(asRecipes[0]));

  store.updateOwnRecipe("o10", made.id, { title: "Kimchi jjigae", requires: ["ing_3"] });
  const edited = store.getOwner("o10")!.own[0]!;
  ok("own: edit replaces the ingredient list",
      edited.title === "Kimchi jjigae" && edited.requires.length === 1);

  // Deleting the recipe must not delete the evening you cooked it.
  store.recordCook("o10", made.id, { required: ["ing_3"] });
  store.planRecipe("o10", made.id, store.dayKey(new Date()), "dinner");
  store.deleteOwnRecipe("o10", made.id);
  const after = store.getOwner("o10")!;
  ok("own: delete removes the recipe", after.own.length === 0);
  ok("own: the cook survives it", after.cooks.length === 1);
  ok("own: the plan survives it", after.plans.length === 1);

  threw = "";
  try { store.deleteOwnRecipe("o10", "rec_own_nope"); } catch (e) { threw = String(e); }
  ok("own: refuses to delete something that is not yours", threw.includes("not one of yours"), threw);
}

// ── settleCook: the pantry's only subtractive write ───────────────────────
{
  seed({});
  store.recordCook("o11", "rec_a", { required: ["ing_1", "ing_2", "ing_3"] });
  const cook = store.getOwner("o11")!.cooks[0]!;

  // recordCook is additive, so all three are present before we settle up.
  const before = store.getOwner("o11")!.ingredients;
  ok("settle: the cook put everything in the pantry",
      ["ing_1", "ing_2", "ing_3"].every((i) => before[i]?.in_pantry === true));

  store.settleCook("o11", cook.id, { ranOut: ["ing_2"] });
  const after = store.getOwner("o11")!.ingredients;
  ok("settle: ran out clears in_pantry", after["ing_2"]!.in_pantry === false);
  ok("settle: it leaves the others alone",
      after["ing_1"]!.in_pantry === true && after["ing_3"]!.in_pantry === true);

  // The grocery list is a separate decision — §4b, nothing lands unreviewed.
  ok("settle: ran out does NOT add to the grocery list", after["ing_2"]!.on_list === false);

  // Flipping back is a correction, not just a UI undo.
  store.settleCook("o11", cook.id, { alsoUsed: [{ id: "ing_2" }] });
  ok("settle: still-have puts it back",
      store.getOwner("o11")!.ingredients["ing_2"]!.in_pantry === true);

  // Something the recipe never listed, standing in for something it did.
  store.settleCook("o11", cook.id, { alsoUsed: [{ id: "ing_9", insteadOf: "ing_1" }] });
  const o11 = store.getOwner("o11")!;
  ok("settle: an extra ingredient enters the pantry",
      o11.ingredients["ing_9"]!.in_pantry === true);
  ok("settle: and is recorded as a substitution",
      o11.cooks[0]!.substituted.length === 1 &&
      o11.cooks[0]!.substituted[0]!.wanted === "ing_1" &&
      o11.cooks[0]!.substituted[0]!.used === "ing_9",
      JSON.stringify(o11.cooks[0]!.substituted));

  // Answering twice corrects the first answer rather than claiming both.
  store.settleCook("o11", cook.id, { alsoUsed: [{ id: "ing_8", insteadOf: "ing_1" }] });
  const subs = store.getOwner("o11")!.cooks[0]!.substituted;
  ok("settle: re-answering replaces the substitution",
      subs.length === 1 && subs[0]!.used === "ing_8", JSON.stringify(subs));

  // Never held it, never used it: no row is created saying "absent".
  store.settleCook("o11", cook.id, { ranOut: ["ing_never"] });
  ok("settle: ran out on something we never had creates no row",
      store.getOwner("o11")!.ingredients["ing_never"] === undefined);

  let settleThrew = "";
  try { store.settleCook("o11", "ck_nope", { ranOut: ["ing_1"] }); }
  catch (e) { settleThrew = String(e); }
  ok("settle: refuses an unknown cook",
      settleThrew.includes("no longer in your history"), settleThrew);
}

// ── the list as a real list: typed rows, and ticking off in the aisle ──────
{
  seed({});
  store.addFreeText("o12", "Bin bags");
  const id = store.freeTextId("Bin bags");
  let o12 = store.getOwner("o12")!;
  ok("free text: lands on the list only",
      o12.ingredients[id]!.on_list === true && o12.ingredients[id]!.in_pantry === false);
  ok("free text: carries its own label", o12.ingredients[id]!.label === "Bin bags");
  ok("free text: is recognisable as such", store.isFreeText(id));

  // Adding the same thing twice is one row, not two.
  store.addFreeText("o12", "bin bags");
  ok("free text: same text is the same row",
      Object.keys(store.getOwner("o12")!.ingredients).length === 1);

  // Ticked off, a shopping note is finished — it does not enter the pantry.
  store.tickOff("o12", id);
  ok("free text: ticking removes it entirely",
      store.getOwner("o12")!.ingredients[id] === undefined);

  let ftThrew = "";
  try { store.addFreeText("o12", "   "); } catch (e) { ftThrew = String(e); }
  ok("free text: refuses an empty item", ftThrew.includes("Nothing to add"), ftThrew);

  // A real ingredient: ticked with enough, then ticked short.
  store.addToList("o12", ["ing_1", "ing_2"]);
  store.tickOff("o12", "ing_1", true);
  const one = store.getOwner("o12")!.ingredients["ing_1"]!;
  /* CART-SPEC §2: the till, not the kitchen. The pantry stays untouched until
     `putAway`, which is the whole point of the third flag. */
  ok("tick: enough moves it into the cart and off the list",
      one.in_cart === true && one.on_list === false && one.in_pantry === false,
      JSON.stringify(one));
  ok("tick: stamps the checkout at the till",
      typeof one.checked_out_at === "string", JSON.stringify(one));

  store.tickOff("o12", "ing_2", false);
  const two = store.getOwner("o12")!.ingredients["ing_2"]!;
  ok("tick: not enough is BOTH in the cart and still on the list",
      two.in_cart === true && two.on_list === true && two.in_pantry === false,
      JSON.stringify(two));

  let tickThrew = "";
  try { store.tickOff("o12", "ing_nope"); } catch (e) { tickThrew = String(e); }
  ok("tick: refuses something not on the list", tickThrew.includes("not on your list"), tickThrew);

  /* Home. `ing_1` is kept, `ing_2` was bought and eaten on the way — both
     leave the cart, one enters the pantry. */
  store.putAway("o12", ["ing_1"]);
  const kept = store.getOwner("o12")!.ingredients["ing_1"]!;
  const dropped = store.getOwner("o12")!.ingredients["ing_2"]!;
  ok("put away: what you kept lands in the pantry",
      kept.in_pantry === true && !kept.in_cart, JSON.stringify(kept));
  ok("put away: what you did not keep leaves the cart and enters nothing",
      dropped.in_pantry === false && !dropped.in_cart, JSON.stringify(dropped));
  ok("put away: a row still wanted stays on the list",
      dropped.on_list === true, JSON.stringify(dropped));

  /* An empty cart is not an error, and put-away must not invent rows. */
  const before = JSON.stringify(store.getOwner("o12")!.ingredients);
  store.putAway("o12", ["ing_1", "ing_nope"]);
  ok("put away: an empty cart writes nothing",
      JSON.stringify(store.getOwner("o12")!.ingredients) === before);

  /* Saying you have it means it is home — the cart flag cannot outlive it. */
  store.addToList("o12", ["ing_3"]);
  store.tickOff("o12", "ing_3", true);
  store.setState("o12", "ing_3", { in_pantry: true });
  ok("cart: setting in_pantry clears the cart",
      store.getOwner("o12")!.ingredients["ing_3"]!.in_cart === false);
}

// ── pins have a shelf life, and absence is measured from the last WRITE ────
{
  seed({});
  store.setState("o13", "ing_1", { in_pantry: true, use_first: true });
  const pinned = store.getOwner("o13")!.ingredients["ing_1"]!;
  ok("pin: stamps pinned_at on the transition", typeof pinned.pinned_at === "string");
  ok("pin: a fresh pin is live", store.pinLive(pinned));

  const old = { ...pinned, pinned_at: new Date(Date.now() - 30 * 86400000).toISOString() };
  ok("pin: an old pin has lapsed", !store.pinLive(old) && store.pinLapsed(old));
  ok("pin: a lapsed pin is dropped from the matcher's view",
      !store.pantryOf({ ...store.getOwner("o13")!, ingredients: { ing_1: old } }).useFirst.has("ing_1"));
  ok("pin: a pin with no stamp is treated as live — never silently dropped",
      store.pinLive({ ...pinned, pinned_at: undefined }));

  store.setState("o13", "ing_1", { in_pantry: true, use_first: false });
  ok("pin: unpinning clears the stamp",
      store.getOwner("o13")!.ingredients["ing_1"]!.pinned_at === undefined);

  ok("absence: a write makes the owner active now", store.daysAway(store.getOwner("o13")) === 0);
}

// ── "don't recommend this recipe" ─────────────────────────────────────────
{
  seed({});
  store.toggleDismissed("o14", "rec_a");
  ok("dismiss: hides it now", store.dismissedNow(store.getOwner("o14")).has("rec_a"));
  store.toggleDismissed("o14", "rec_a");
  ok("dismiss: the same control brings it back",
      !store.dismissedNow(store.getOwner("o14")).has("rec_a"));

  // It stands. An old dismissal is as good as a fresh one — the whole change.
  store.toggleDismissed("o14", "rec_b");
  const aged = store.getOwner("o14")!;
  aged.recipes["rec_b"]!.dismissed_at = new Date(Date.now() - 400 * 86_400_000).toISOString();
  seed({ o14: aged });
  ok("dismiss: it does not expire", store.dismissedNow(store.getOwner("o14")).has("rec_b"));

  // Migration: a live `dismissed_until` becomes permanent, a lapsed one is not
  // resurrected, and the old field is gone from what the code sees either way.
  const old = { ...store.getOwner("o14")!, id: "o15", recipes: {
    rec_c: { recipe_id: "rec_c", saved: false, added_at: new Date().toISOString(),
             dismissed_until: new Date(Date.now() + 86_400_000).toISOString() },
    rec_d: { recipe_id: "rec_d", saved: false, added_at: new Date().toISOString(),
             dismissed_until: new Date(Date.now() - 86_400_000).toISOString() },
  } };
  seed({ o15: old });
  const up = store.getOwner("o15")!;
  ok("dismiss: a live fortnight-dismissal carries over as permanent",
      store.dismissedNow(up).has("rec_c") && !store.dismissedNow(up).has("rec_d"));
  ok("dismiss: the old field is dropped",
      up.recipes["rec_c"]!.dismissed_until === undefined);
}

// ── ingredient history ───────────────────────────────────────────────────────
//
// The point of the whole change is one behaviour: running out of something and
// buying it again keeps the history and restarts the age. Everything else here
// exists to prove that the tombstone it depends on is invisible to the readers
// that were written before it existed.
{
  seed({});
  const rowOf = (o: string, i = "ing_h") => raw()[o].ingredients[i];

  store.setState("o15", "ing_h", { in_pantry: true });
  const first = rowOf("o15").added_at;
  ok("history: a new row starts both clocks together",
     !!first && rowOf("o15").first_added_at === first);

  store.setState("o15", "ing_h", { in_pantry: false });
  const dead = rowOf("o15");
  ok("history: an emptied row survives as a tombstone", !!dead, "row was deleted");
  ok("history: the tombstone is stamped", !!dead?.removed_at);
  ok("history: a tombstone is not held", !dead.in_pantry && !dead.on_list);

  // The readers that predate tombstones. Each already filtered on a flag, which
  // is the reason this change needed no downstream edits — so each is asserted
  // rather than assumed.
  const owner = store.getOwner("o15")!;
  ok("history: heldCount ignores tombstones", store.heldCount(owner) === 0);
  ok("history: pantryOf ignores tombstones", store.pantryOf(owner).have.size === 0);

  store.setState("o15", "ing_h", { in_pantry: true });
  const back = rowOf("o15");
  ok("history: rebuying keeps the first purchase", back.first_added_at === first);
  ok("history: rebuying clears the tombstone", back.removed_at === undefined);
  ok("history: rebuying restarts the instance clock",
     back.added_at >= first, `${back.added_at} < ${first}`);

  // `checked_out_at` is the list → pantry transition, wherever it happens.
  seed({});
  store.addToList("o16", ["ing_h"]);
  ok("history: listing something is not a shopping trip",
     rowOf("o16").checked_out_at === undefined);
  store.tickOff("o16", "ing_h");
  const shopped = rowOf("o16").checked_out_at;
  ok("history: ticking it off is", !!shopped);
  store.setState("o16", "ing_h", { in_pantry: true, on_list: false });
  ok("history: re-saving an unrelated flag is not a second trip",
     rowOf("o16").checked_out_at === shopped);

  seed({});
  store.addToList("o17", ["ing_h"]);
  store.moveToPantry("o17", ["ing_h"]);
  ok("history: the whole basket stamps it too", !!rowOf("o17").checked_out_at);
}

console.log(failures === 0 ? "store: all checks passed" : `store: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
}

void main();
