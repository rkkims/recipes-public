/**
 * Owner-core tests — the reducers, without either shell.
 *
 * `store.test.ts` pins the same semantics THROUGH the server shell (file,
 * events, `mutate`), and stays; this file pins them at the seam the
 * extraction created, so a reducer cannot drift while both shells still
 * pass their own tests. Everything here runs against plain objects — no
 * temp directory, no chdir, no mocks — which is the property the extraction
 * exists to provide.
 */
import {
  blank, upgrade, snapshot, stampHistory, pantryEvents,
  setState, setManyInPantry, addToList, moveToPantry, tickOff, putAway,
  addFreeText, reviewPantry, setDetail, answerClarification, completeOnboarding,
  setExcluded, setDiet, setConsent, toggleSaved, toggleDismissed, setRecipeNote,
  markOpened, recordCook, amendCook, settleCook, undoCook, planRecipe, planNote,
  unplanRecipe, linkPlanToCook, addOwnRecipe, addOwnRecipes, updateOwnRecipe,
  deleteOwnRecipe, setFollowing, addPushSub, dropPushSub,
  rowFor, eventAt, freeTextId, isFreeText, dayKey, pinLive, pinLapsed,
  mintCookId, mintPlanId,
  type Owner,
} from "./owner-core.js";

let failures = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) return;
  failures++;
  console.error(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
};

const fresh = (): Owner => blank("o_test");

/** Run a reducer the way a shell would: snapshot, mutate, stamp the clocks. */
const apply = (o: Owner, fn: (o: Owner) => void) => {
  const before = snapshot(o);
  fn(o);
  stampHistory(before, o);
  return pantryEvents(before, o);
};

// ── blank and upgrade ──────────────────────────────────────────────────────
{
  const o = fresh();
  ok("blank: every collection starts present and empty",
      Object.keys(o.ingredients).length === 0 && o.own.length === 0 &&
      Object.keys(o.recipes).length === 0 && o.plans.length === 0 && o.cooks.length === 0);

  const legacy = {
    id: "o1", created_at: "2026-01-01T00:00:00.000Z",
    saved: ["rec_a", "rec_b"],
  } as unknown as Owner;
  const up = upgrade(legacy);
  ok("upgrade: saved[] becomes rows", Object.keys(up.recipes).length === 2);
  ok("upgrade: the flag survives", up.recipes["rec_a"]?.saved === true);
  ok("upgrade: added_at floors at the owner's creation",
      up.recipes["rec_a"]?.added_at === "2026-01-01T00:00:00.000Z");
  ok("upgrade: legacy key is gone", up.saved === undefined);

  const dated = fresh();
  dated.recipes["rec_c"] = { recipe_id: "rec_c", saved: false, added_at: "2026-01-01T00:00:00.000Z",
    dismissed_until: new Date(Date.now() + 86_400_000).toISOString() };
  dated.recipes["rec_d"] = { recipe_id: "rec_d", saved: false, added_at: "2026-01-01T00:00:00.000Z",
    dismissed_until: new Date(Date.now() - 86_400_000).toISOString() };
  upgrade(dated);
  ok("upgrade: a live fortnight-dismissal carries over as permanent",
      !!dated.recipes["rec_c"]!.dismissed_at);
  ok("upgrade: a lapsed one is not resurrected",
      dated.recipes["rec_d"]!.dismissed_at === undefined);
  ok("upgrade: the old field is dropped either way",
      dated.recipes["rec_c"]!.dismissed_until === undefined &&
      dated.recipes["rec_d"]!.dismissed_until === undefined);
}

// ── setState: flags, pins, the cart rule ───────────────────────────────────
{
  const o = fresh();
  apply(o, (x) => setState(x, "ing_1", { in_pantry: true, use_first: true }));
  const row = o.ingredients["ing_1"]!;
  ok("setState: creates the row", row.in_pantry === true);
  ok("setState: pin stamps pinned_at on the transition", typeof row.pinned_at === "string");

  const stamp = row.pinned_at;
  apply(o, (x) => setState(x, "ing_1", { in_pantry: true, use_first: true, on_list: true }));
  ok("setState: re-saving an unrelated flag does not renew the pin",
      o.ingredients["ing_1"]!.pinned_at === stamp);

  apply(o, (x) => setState(x, "ing_1", { use_first: false }));
  ok("setState: unpinning clears the stamp", o.ingredients["ing_1"]!.pinned_at === undefined);

  apply(o, (x) => setState(x, "ing_1", { in_pantry: false, use_first: true }));
  ok("setState: a pin cannot outlive the pantry flag",
      o.ingredients["ing_1"]!.use_first === false);

  apply(o, (x) => setState(x, "ing_2", { in_cart: true }));
  apply(o, (x) => setState(x, "ing_2", { in_pantry: true }));
  ok("setState: saying you have it takes it out of the cart",
      o.ingredients["ing_2"]!.in_cart === false);
}

// ── the two clocks, derived at the seam ────────────────────────────────────
{
  const o = fresh();
  apply(o, (x) => setState(x, "ing_h", { in_pantry: true }));
  const first = o.ingredients["ing_h"]!.added_at;
  ok("history: a new row starts both clocks together",
      o.ingredients["ing_h"]!.first_added_at === first);

  apply(o, (x) => setState(x, "ing_h", { in_pantry: false }));
  const dead = o.ingredients["ing_h"]!;
  ok("history: an emptied row survives as a tombstone", !!dead);
  ok("history: the tombstone is stamped", !!dead.removed_at);

  apply(o, (x) => setState(x, "ing_h", { in_pantry: true }));
  const back = o.ingredients["ing_h"]!;
  ok("history: rebuying keeps the first purchase", back.first_added_at === first);
  ok("history: rebuying clears the tombstone", back.removed_at === undefined);

  const trip = fresh();
  apply(trip, (x) => addToList(x, ["ing_t"]));
  ok("history: listing something is not a shopping trip",
      trip.ingredients["ing_t"]!.checked_out_at === undefined);
  apply(trip, (x) => tickOff(x, "ing_t"));
  ok("history: ticking it off at the till is",
      typeof trip.ingredients["ing_t"]!.checked_out_at === "string");

  const basket = fresh();
  apply(basket, (x) => addToList(x, ["ing_b"]));
  apply(basket, (x) => moveToPantry(x, ["ing_b"]));
  ok("history: the whole basket stamps it too",
      typeof basket.ingredients["ing_b"]!.checked_out_at === "string");
}

// ── the pantry-event diff ──────────────────────────────────────────────────
{
  const o = fresh();
  let ev = apply(o, (x) => setState(x, "ing_1", { in_pantry: true }));
  ok("events: entering the pantry is one add",
      ev.length === 1 && ev[0]!.op === "add" && ev[0]!.node_id === "ing_1" && !ev[0]!.from_list,
      JSON.stringify(ev));

  ev = apply(o, (x) => setState(x, "ing_1", { on_list: true }));
  ok("events: a list flag alone says nothing", ev.length === 0, JSON.stringify(ev));

  ev = apply(o, (x) => setState(x, "ing_1", { in_pantry: false, on_list: false }));
  ok("events: leaving is one remove", ev.length === 1 && ev[0]!.op === "remove");

  // The two-moment checkout: tick fills the cart (no pantry event), put-away
  // lands it with the from_list fact carried across both moments.
  const shop = fresh();
  apply(shop, (x) => addToList(x, ["ing_s"]));
  ev = apply(shop, (x) => tickOff(x, "ing_s"));
  ok("events: the aisle tick is cart, not pantry — nothing emitted",
      ev.length === 0, JSON.stringify(ev));
  ev = apply(shop, (x) => putAway(x, ["ing_s"]));
  ok("events: put-away is the add, and it remembers the list",
      ev.length === 1 && ev[0]!.op === "add" && ev[0]!.from_list === true,
      JSON.stringify(ev));

  // Free text stays out structurally (BEHAVIOR-SPEC §6).
  const noted = fresh();
  ev = apply(noted, (x) => addFreeText(x, "Bin bags"));
  ok("events: free text never enters the record", ev.length === 0, JSON.stringify(ev));

  // A row deleted outright while held is a removal too.
  const gone = fresh();
  apply(gone, (x) => setState(x, "ing_d", { in_pantry: true }));
  ev = apply(gone, (x) => { delete x.ingredients["ing_d"]; });
  ok("events: deleting a held row is a remove", ev.length === 1 && ev[0]!.op === "remove");
}

// ── the list, the cart, the door ───────────────────────────────────────────
{
  const o = fresh();
  apply(o, (x) => addToList(x, ["ing_1", "ing_2"]));
  ok("addToList: only ever turns the list flag on",
      o.ingredients["ing_1"]!.on_list === true && o.ingredients["ing_1"]!.in_pantry === false);

  apply(o, (x) => setState(x, "ing_1", { in_pantry: true, on_list: true }));
  apply(o, (x) => addToList(x, ["ing_1"]));
  ok("addToList: cannot claim you already have something",
      o.ingredients["ing_1"]!.in_pantry === true);

  apply(o, (x) => tickOff(x, "ing_2", true));
  const two = o.ingredients["ing_2"]!;
  ok("tickOff: enough moves it into the cart and off the list",
      two.in_cart === true && two.on_list === false && two.in_pantry === false);

  apply(o, (x) => addToList(x, ["ing_3"]));
  apply(o, (x) => tickOff(x, "ing_3", false));
  const three = o.ingredients["ing_3"]!;
  ok("tickOff: not enough is BOTH in the cart and still on the list",
      three.in_cart === true && three.on_list === true);

  let threw = "";
  try { apply(o, (x) => tickOff(x, "ing_nope")); } catch (e) { threw = String(e); }
  ok("tickOff: refuses something not on the list", threw.includes("not on your list"), threw);

  apply(o, (x) => addFreeText(x, "Bin bags"));
  const txt = freeTextId("Bin bags");
  apply(o, (x) => tickOff(x, txt));
  ok("tickOff: a free-text row is deleted outright, never enters the pantry",
      o.ingredients[txt] === undefined);

  apply(o, (x) => putAway(x, ["ing_2"]));
  ok("putAway: what you kept lands in the pantry",
      o.ingredients["ing_2"]!.in_pantry === true && !o.ingredients["ing_2"]!.in_cart);
  ok("putAway: clearRest empties the rest of the cart having entered nothing",
      o.ingredients["ing_3"]!.in_cart === false && o.ingredients["ing_3"]!.in_pantry === false);
  ok("putAway: a row still wanted stays on the list", o.ingredients["ing_3"]!.on_list === true);

  const select = fresh();
  apply(select, (x) => addToList(x, ["ing_a", "ing_b"]));
  apply(select, (x) => { tickOff(x, "ing_a"); tickOff(x, "ing_b"); });
  apply(select, (x) => putAway(x, ["ing_a"], false));
  ok("putAway: the select path leaves the rest in the bags",
      select.ingredients["ing_b"]!.in_cart === true);
  apply(select, (x) => putAway(x, ["ing_never"]));
  ok("putAway: does not invent rows", select.ingredients["ing_never"] === undefined);
}

// ── moveToPantry and setManyInPantry ───────────────────────────────────────
{
  const o = fresh();
  apply(o, (x) => addToList(x, ["ing_1"]));
  apply(o, (x) => moveToPantry(x, ["ing_1", "ing_new"]));
  ok("moveToPantry: off the list, into the pantry",
      o.ingredients["ing_1"]!.in_pantry === true && o.ingredients["ing_1"]!.on_list === false);
  ok("moveToPantry: an unlisted id is still a coherent request",
      o.ingredients["ing_new"]!.in_pantry === true);

  const grid = fresh();
  apply(grid, (x) => setState(x, "ing_p", { in_pantry: true, use_first: true }));
  apply(grid, (x) => setManyInPantry(x, ["ing_q"], ["ing_p"]));
  ok("setMany: adds land, and unticking clears the pin",
      grid.ingredients["ing_q"]!.in_pantry === true &&
      grid.ingredients["ing_p"]!.in_pantry === false &&
      grid.ingredients["ing_p"]!.use_first === false);
  apply(grid, (x) => setManyInPantry(x, [], ["ing_absent"]));
  ok("setMany: removing something never held creates nothing",
      grid.ingredients["ing_absent"] === undefined);
}

// ── free text ──────────────────────────────────────────────────────────────
{
  const o = fresh();
  apply(o, (x) => addFreeText(x, "  Bin bags  "));
  const id = freeTextId("Bin bags");
  ok("freeText: lands on the list only, with its label",
      o.ingredients[id]!.on_list === true && o.ingredients[id]!.label === "Bin bags");
  ok("freeText: recognisable as such", isFreeText(id) && id.startsWith("txt_"));
  apply(o, (x) => addFreeText(x, "bin BAGS"));
  ok("freeText: same text is the same row", Object.keys(o.ingredients).length === 1);
  let threw = "";
  try { apply(o, (x) => addFreeText(x, "   ")); } catch (e) { threw = String(e); }
  ok("freeText: refuses an empty item", threw.includes("Nothing to add"), threw);
  threw = "";
  try { apply(o, (x) => addFreeText(x, "x".repeat(81))); } catch (e) { threw = String(e); }
  ok("freeText: refuses an essay", threw.includes("too long"), threw);
  threw = "";
  try { apply(o, (x) => addFreeText(x, "---")); } catch (e) { threw = String(e); }
  ok("freeText: refuses a name with nothing in it", threw.includes("letters or numbers"), threw);
}

// ── reviewPantry and setDetail ─────────────────────────────────────────────
{
  const o = fresh();
  apply(o, (x) => setState(x, "ing_1", { in_pantry: true }));
  apply(o, (x) => reviewPantry(x, ["ing_1", "ing_never"]));
  ok("review: gone rows leave the pantry", o.ingredients["ing_1"]!.in_pantry === false);
  ok("review: an absence is never a row", o.ingredients["ing_never"] === undefined);

  apply(o, (x) => setDetail(x, "ing_1", { note: "the good brand" }));
  ok("detail: lands on an existing row", o.ingredients["ing_1"]!.note === "the good brand");
  apply(o, (x) => setDetail(x, "ing_ghost", { note: "nope" }));
  ok("detail: never creates a row", o.ingredients["ing_ghost"] === undefined);
}

// ── clarifications ─────────────────────────────────────────────────────────
{
  const o = fresh();
  apply(o, (x) => answerClarification(x, "ask_kimchi", true, "ing_kimchi"));
  ok("clarify: yes grants the ingredient",
      o.ingredients["ing_kimchi"]!.in_pantry === true && o.answers?.["ask_kimchi"] === true);
  apply(o, (x) => answerClarification(x, "ask_kimchi", false, "ing_kimchi"));
  ok("clarify: changing to no takes it back out",
      o.ingredients["ing_kimchi"]!.in_pantry === false && o.answers?.["ask_kimchi"] === false);
  ok("clarify: the row survives as a tombstone", !!o.ingredients["ing_kimchi"]);
}

// ── onboarding ─────────────────────────────────────────────────────────────
{
  const o = fresh();
  apply(o, (x) => completeOnboarding(x, { have: ["ing_1"], allergens: ["shellfish"] }));
  ok("onboarding: the ticked rows land", o.ingredients["ing_1"]!.in_pantry === true);
  ok("onboarding: the diet lands with them", o.diet?.allergens?.[0] === "shellfish");
  ok("onboarding: answered is stamped", typeof o.onboarded_at === "string");

  const skip = fresh();
  apply(skip, (x) => completeOnboarding(x, {}));
  ok("onboarding: skipping still counts as answered — asked once is a courtesy",
      typeof skip.onboarded_at === "string");
  ok("onboarding: skipping writes no diet", skip.diet === undefined);
}

// ── the diet split — the data-loss regression ──────────────────────────────
{
  const o = fresh();
  apply(o, (x) => setDiet(x, { classes: ["vegetarian"], allergens: ["shellfish"] }));
  apply(o, (x) => setExcluded(x, "ing_cilantro", true));
  ok("diet: excluding one ingredient must not wipe the other axes",
      o.diet?.classes?.[0] === "vegetarian" && o.diet?.allergens?.[0] === "shellfish",
      JSON.stringify(o.diet));
  apply(o, (x) => setDiet(x, { classes: [] }));
  ok("diet: setting one axis keeps the excludes",
      o.diet?.excludes?.[0] === "ing_cilantro", JSON.stringify(o.diet));
  ok("diet: and keeps the axis not named",
      o.diet?.allergens?.[0] === "shellfish", JSON.stringify(o.diet));
  apply(o, (x) => setExcluded(x, "ing_cilantro", false));
  ok("diet: un-excluding removes exactly that id", o.diet?.excludes?.length === 0);
}

// ── consent ────────────────────────────────────────────────────────────────
{
  const o = fresh();
  apply(o, (x) => setConsent(x, { purpose: "commercial_aggregate", granted: true,
    policy_version: "v1", copy_hash: "abc" }));
  apply(o, (x) => setConsent(x, { purpose: "commercial_aggregate", granted: false,
    policy_version: "v1", copy_hash: "abc" }));
  ok("consent: appends, never edits", o.consent?.length === 2);
  ok("consent: the superseded grant is stamped withdrawn",
      !!o.consent?.[0]?.withdrawn_at && o.consent?.[1]?.withdrawn_at === undefined);
}

// ── saved, notes, dismissed, opened ────────────────────────────────────────
{
  const o = fresh();
  apply(o, (x) => toggleSaved(x, "rec_a"));
  ok("save: creates the row", o.recipes["rec_a"]?.saved === true);
  apply(o, (x) => setRecipeNote(x, "rec_a", "  double the garlic  "));
  ok("note: trimmed", o.recipes["rec_a"]?.note === "double the garlic");
  apply(o, (x) => toggleSaved(x, "rec_a"));
  ok("unsave: keeps a row that still holds a note",
      o.recipes["rec_a"]?.saved === false && !!o.recipes["rec_a"]?.note);
  apply(o, (x) => setRecipeNote(x, "rec_a", ""));
  ok("unsave + no note: the row goes", o.recipes["rec_a"] === undefined);

  apply(o, (x) => toggleDismissed(x, "rec_b"));
  ok("dismiss: sets the stamp", !!o.recipes["rec_b"]?.dismissed_at);
  apply(o, (x) => toggleDismissed(x, "rec_b"));
  ok("dismiss: the same control takes it back", o.recipes["rec_b"]?.dismissed_at === undefined);

  apply(o, (x) => markOpened(x, "rec_c"));
  ok("opened: a glance is never a save",
      o.recipes["rec_c"]?.saved === false && !!o.recipes["rec_c"]?.opened_at);
}

// ── cooks ──────────────────────────────────────────────────────────────────
{
  const o = fresh();
  const cook = recordCook(o, "rec_a", {
    required: ["ing_1", "ing_2", "ing_3"],
    substituted: [{ wanted: "ing_2", used: "ing_9" }], skipped: ["ing_3"],
  });
  ok("cook: returns the event it minted", o.cooks[0]?.id === cook.id);
  ok("cook: additive — what was used is now held",
      o.ingredients["ing_1"]?.in_pantry === true && o.ingredients["ing_9"]?.in_pantry === true);
  ok("cook: a skipped ingredient is not claimed",
      o.ingredients["ing_3"] === undefined);
  ok("cook: the substituted-away ingredient is not claimed either",
      o.ingredients["ing_2"] === undefined);

  let threw = "";
  const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
  try { recordCook(o, "rec_a", { required: [], cookedAt: future }); }
  catch (e) { threw = String(e); }
  ok("cook: refuses the future", threw.includes("in the future"), threw);
  ok("cook: a refused cook wrote nothing", o.cooks.length === 1);

  threw = "";
  try { recordCook(o, "rec_a", { required: [], cookedAt: "not a date" }); }
  catch (e) { threw = String(e); }
  ok("cook: refuses garbage dates", threw.includes("Not a date"), threw);

  amendCook(o, cook.id, { rating: 4, note: "  too salty  ", meal: "dinner" });
  ok("amend: reflective fields land, trimmed",
      o.cooks[0]!.rating === 4 && o.cooks[0]!.note === "too salty" && o.cooks[0]!.meal === "dinner");
  amendCook(o, cook.id, { meal: "" });
  ok("amend: clearing the meal removes the field", o.cooks[0]!.meal === undefined);
  threw = "";
  try { amendCook(o, cook.id, { rating: 9 }); } catch (e) { threw = String(e); }
  ok("amend: rejects a rating out of 1..5", threw.includes("1 to 5"), threw);
  threw = "";
  try { amendCook(o, "ck_nope", { rating: 3 }); } catch (e) { threw = String(e); }
  ok("amend: refuses an unknown event", threw.includes("no longer in your history"), threw);

  settleCook(o, cook.id, { ranOut: ["ing_1", "ing_never"] });
  ok("settle: ran out clears in_pantry", o.ingredients["ing_1"]!.in_pantry === false);
  ok("settle: and the grocery list is left alone — nothing lands unreviewed",
      o.ingredients["ing_1"]!.on_list === false);
  ok("settle: never-held creates no row", o.ingredients["ing_never"] === undefined);
  settleCook(o, cook.id, { alsoUsed: [{ id: "ing_8", insteadOf: "ing_1" }] });
  ok("settle: an extra ingredient enters the pantry and is recorded as a swap",
      o.ingredients["ing_8"]!.in_pantry === true &&
      o.cooks[0]!.substituted.some((s) => s.wanted === "ing_1" && s.used === "ing_8"));
  settleCook(o, cook.id, { alsoUsed: [{ id: "ing_7", insteadOf: "ing_1" }] });
  ok("settle: re-answering replaces the substitution rather than claiming both",
      o.cooks[0]!.substituted.filter((s) => s.wanted === "ing_1").length === 1 &&
      o.cooks[0]!.substituted.some((s) => s.used === "ing_7"));

  const pinned = fresh();
  apply(pinned, (x) => setState(x, "ing_p", { in_pantry: true, use_first: true }));
  const pc = recordCook(pinned, "rec_p", { required: ["ing_p"] });
  settleCook(pinned, pc.id, { ranOut: ["ing_p"] });
  ok("settle: the pin goes with the ingredient",
      pinned.ingredients["ing_p"]!.use_first === false &&
      pinned.ingredients["ing_p"]!.pinned_at === undefined);

  undoCook(o, cook.id);
  ok("undo: removes exactly the event pointed at", o.cooks.length === 0);
  ok("undo: does NOT reverse the pantry — cooking stays additive",
      o.ingredients["ing_9"]?.in_pantry === true);
  threw = "";
  try { undoCook(o, cook.id); } catch (e) { threw = String(e); }
  ok("undo: refuses the same event twice", threw.includes("no longer in your history"), threw);

  // eventAt points by id, never "most recent" — two cooks in one millisecond.
  const tied = fresh();
  const c1 = recordCook(tied, "rec_a", { required: ["ing_1"] });
  const c2 = recordCook(tied, "rec_a", { required: ["ing_2"] });
  ok("ids: two cooks in one millisecond stay distinct", c1.id !== c2.id);
  ok("eventAt: finds by id", eventAt(tied, c2.id).cook.required[0] === "ing_2");

  /* The device mints and the server accepts — the arrangement that let the cook
     log move off the server at all. What is under test is that the id ARRIVES,
     because every amendment addresses a cook by it. */
  const given = fresh();
  const mine = mintCookId();
  const made = recordCook(given, "rec_a", { id: mine, required: ["ing_3"] });
  ok("ids: a given id is the cook's id", made.id === mine && given.cooks[0]!.id === mine);
  ok("ids: an amendment finds the given id", (() => {
    amendCook(given, mine, { rating: 4 });
    return given.cooks[0]!.rating === 4;
  })());

  /* A mirror retried, a queue drained twice, a double-tapped Save: the same id
     arriving again is a replay of one dinner, not a second one. Two rows here
     would be two `cook_event`s in the record for one meal. */
  const again = recordCook(given, "rec_a", { id: mine, required: ["ing_4"] });
  ok("ids: the same id twice records one cook",
      given.cooks.length === 1 && again.id === mine);
  ok("ids: the replay does not rewrite what the first call recorded",
      given.cooks[0]!.required.join() === "ing_3" &&
      given.ingredients["ing_4"] === undefined);
}

// ── plans ──────────────────────────────────────────────────────────────────
{
  const o = fresh();
  const past = new Date(Date.now() - 30 * 86_400_000);
  const day = dayKey(past);
  const plan = planRecipe(o, "rec_a", day, "dinner");
  ok("plan: written, not yet cooked", o.plans.length === 1 && plan.cook_id === undefined);
  ok("plan: blank meal defaults to dinner", planRecipe(o, "rec_a", day, "  ").meal === "dinner");

  const cook = recordCook(o, "rec_a", { required: [], cookedAt: past.toISOString() });
  linkPlanToCook(o, plan.id, cook.id);
  ok("plan: points at the cook it became", o.plans[0]!.cook_id === cook.id);

  unplanRecipe(o, plan.id);
  ok("unplan: the plan goes, the cook stays",
      o.plans.length === 1 && o.cooks.length === 1);

  let threw = "";
  try { planRecipe(o, "rec_a", "10 August", "dinner"); } catch (e) { threw = String(e); }
  ok("plan: refuses a non-calendar date", threw.includes("Not a calendar date"), threw);
  threw = "";
  try { unplanRecipe(o, "pl_nope"); } catch (e) { threw = String(e); }
  ok("unplan: refuses an unknown plan", threw.includes("no longer on your calendar"), threw);
  threw = "";
  try { linkPlanToCook(o, "pl_nope", cook.id); } catch (e) { threw = String(e); }
  ok("link: refuses an unknown plan", threw.includes("no longer on your calendar"), threw);

  const note = planNote(o, "  Eat out  ", day, "");
  ok("note: trimmed, capped, defaulted",
      note.label === "Eat out" && note.meal === "dinner" && note.recipe_id === undefined);
  threw = "";
  try { planNote(o, "   ", day, "dinner"); } catch (e) { threw = String(e); }
  ok("note: needs a name", threw.includes("Give it a name"), threw);

  /* Same arrangement as the cook log's: the DEVICE mints and this accepts, so
     `unplanRecipe` names a row both copies hold. A fresh owner, because the
     counts above are asserted exactly. */
  const minted = fresh();
  const givenPlan = mintPlanId();
  ok("plan: a given id is the entry's id",
      planRecipe(minted, "rec_b", day, "lunch", givenPlan).id === givenPlan);
  const noteId = mintPlanId();
  ok("note: a given id is the entry's id",
      planNote(minted, "Eat out", day, "lunch", noteId).id === noteId);
  unplanRecipe(minted, givenPlan);
  ok("unplan: the device's own id clears the square",
      minted.plans.length === 1 && minted.plans[0]!.id === noteId);
}

// ── own recipes ────────────────────────────────────────────────────────────
{
  const o = fresh();
  const made = addOwnRecipe(o, {
    title: "  Aaron's kimchi jjigae  ", url: "https://www.youtube.com/watch?v=abc",
    source: "", requires: ["ing_1", "ing_2", "ing_1"],
  });
  ok("own: id is marked as the user's", made.id.startsWith("rec_own_"));
  ok("own: title trimmed, requires deduplicated",
      made.title === "Aaron's kimchi jjigae" && made.requires.length === 2);
  ok("own: a blank source falls back to the host", made.source === "youtube.com");

  let threw = "";
  try { addOwnRecipe(o, { title: "", url: "https://x.example", source: "", requires: [] }); }
  catch (e) { threw = String(e); }
  ok("own: refuses an empty title", threw.includes("needs a title"), threw);
  threw = "";
  try { addOwnRecipe(o, { title: "x", url: "tiktok.com/@a/1", source: "", requires: [] }); }
  catch (e) { threw = String(e); }
  ok("own: refuses a link that is not one", threw.includes("needs a link"), threw);

  // The import path dedupes on host+path, so tracking parameters and www
  // cannot multiply the same dinner. (Deliberately blunt: a YouTube /watch
  // URL keys its video in the QUERY, so two different /watch links also
  // collapse — accepted, since imports come from share links that key the
  // video in the path.)
  const res = addOwnRecipes(o, [
    { title: "Same video", url: "https://www.tiktok.com/@a/video/1?utm=1", source: "" },
    { title: "Same video", url: "https://tiktok.com/@a/video/1/", source: "" },
    { title: "New video", url: "https://tiktok.com/@a/video/2", source: "" },
    { title: "", url: "https://tiktok.com/@a/video/3", source: "" },
  ]);
  ok("import: dedupes against what is there and within the batch, drops bad rows",
      res.added === 2 && res.skipped === 2, JSON.stringify(res));
  ok("import: rows land with no ingredients — nothing was parsed",
      o.own.find((r) => r.title === "New video")?.requires.length === 0);

  updateOwnRecipe(o, made.id, { title: "Kimchi jjigae", requires: ["ing_3"], note: "  x  " });
  const edited = o.own.find((r) => r.id === made.id)!;
  ok("own: edit replaces what was named and only that",
      edited.title === "Kimchi jjigae" && edited.requires.length === 1 && edited.note === "x");
  updateOwnRecipe(o, made.id, { note: "  " });
  ok("own: a blank note clears it", o.own.find((r) => r.id === made.id)!.note === undefined);
  threw = "";
  try { updateOwnRecipe(o, made.id, { title: "  " }); } catch (e) { threw = String(e); }
  ok("own: an edit cannot blank the title", threw.includes("needs a title"), threw);

  deleteOwnRecipe(o, made.id);
  ok("own: delete removes the recipe", !o.own.some((r) => r.id === made.id));
  threw = "";
  try { deleteOwnRecipe(o, "rec_own_nope"); } catch (e) { threw = String(e); }
  ok("own: refuses to delete something that is not yours",
      threw.includes("not one of yours"), threw);
}

// ── follows and push ───────────────────────────────────────────────────────
{
  const o = fresh();
  setFollowing(o, "cr_a", true);
  setFollowing(o, "cr_a", true);
  ok("follow: an explicit on cannot double-flip", o.follows?.length === 1);
  setFollowing(o, "cr_a", false);
  ok("follow: an empty list leaves no field behind", o.follows === undefined);

  const sub = { endpoint: "https://push.example/1", keys: { p256dh: "k", auth: "a" } };
  addPushSub(o, sub);
  addPushSub(o, { ...sub, keys: { p256dh: "k2", auth: "a2" } });
  ok("push: re-subscribing the same endpoint updates rather than grows",
      o.push?.length === 1 && o.push[0]!.keys.p256dh === "k2");
  addPushSub(o, { ...sub, endpoint: "https://push.example/2" });
  dropPushSub(o, "https://push.example/1");
  ok("push: dropping removes exactly that endpoint",
      o.push?.length === 1 && o.push[0]!.endpoint === "https://push.example/2");
}

// ── the small pure helpers ─────────────────────────────────────────────────
{
  const t = new Date("2026-08-05T23:30:00.000Z");
  ok("dayKey: honours the viewer's zone",
      dayKey(t, "Asia/Seoul") === "2026-08-06" && dayKey(t, "America/Los_Angeles") === "2026-08-05");
  ok("dayKey: an unknown zone falls back rather than failing",
      typeof dayKey(t, "Not/AZone") === "string");

  const row = { ingredient_id: "ing_1", in_pantry: true, on_list: false,
    use_first: true, added_at: "x", pinned_at: new Date().toISOString() };
  ok("pin: fresh is live", pinLive(row) && !pinLapsed(row));
  const old = { ...row, pinned_at: new Date(Date.now() - 30 * 86_400_000).toISOString() };
  ok("pin: old has lapsed", !pinLive(old) && pinLapsed(old));
  ok("pin: no stamp is treated as live — never silently dropped",
      pinLive({ ...row, pinned_at: undefined }));

  const o = fresh();
  const r = rowFor(o, "rec_z");
  ok("rowFor: mints an unsaved row on demand", r.saved === false && o.recipes["rec_z"] === r);
}

console.log(failures === 0 ? "owner-core: all checks passed" : `owner-core: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
