/**
 * Client-store tests — the localStorage shell, without a browser.
 *
 * What is under test is the SHELL's own promises, not the reducers (those
 * are `owner-core.test.ts`'s): the blob round-trips, a corrupt blob is set
 * aside and never presents as empty, export/import restores a kitchen, the
 * beacons carry the same fields the server appends, and a write notifies
 * subscribers.
 *
 * localStorage and sendBeacon are mocked BEFORE the module is imported —
 * not because the module reads them at import time (it does not, on
 * purpose), but because a test that depends on that staying true should not
 * find out by accident.
 */

let failures = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) return;
  failures++;
  console.error(`FAIL  ${name}${detail ? `\n      ${detail}` : ""}`);
};

/* A localStorage that is just a Map — the whole contract the shell uses. */
const backing = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (k: string) => backing.get(k) ?? null,
  setItem: (k: string, v: string) => { backing.set(k, String(v)); },
  removeItem: (k: string) => { backing.delete(k); },
};

/* Capture what `beacon` sends. `sendBeacon` returning true stops the fetch
   fallback, so nothing ever touches the network from here. */
const sent: Array<Record<string, unknown>> = [];
(globalThis as unknown as { navigator: unknown }).navigator = {
  sendBeacon: (_url: string, body: string) => {
    sent.push(JSON.parse(body) as Record<string, unknown>);
    return true;
  },
};

const KEY = "jipbap-owner-v1";

async function main() {
const cs = await import("./client-store.js");

// ── a fresh device ─────────────────────────────────────────────────────────
{
  const o = cs.current();
  ok("fresh: an empty device is an empty owner",
      Object.keys(o.ingredients).length === 0 && o.cooks.length === 0);
  ok("fresh: nothing corrupt about a first visit", cs.wasCorrupt() === false);

  const hh = cs.householdId();
  ok("household: minted, prefixed, and worthless-looking", hh.startsWith("hh_"), hh);
  ok("household: stable across calls", cs.householdId() === hh);
  ok("household: persisted alongside the data", backing.get(KEY)!.includes(hh));
}

// ── writes persist, round-trip, and notify ─────────────────────────────────
{
  let pokes = 0;
  const unsub = cs.subscribe(() => { pokes++; });

  cs.setState("ing_1", { in_pantry: true, use_first: true });
  cs.addToList(["ing_2"]);
  cs.toggleSaved("rec_a");
  cs.planRecipe("rec_a", "2026-01-05", "dinner");
  const made = cs.addOwnRecipe({
    title: "Kimchi jjigae", url: "https://youtube.com/watch?v=abc", source: "", requires: ["ing_1"],
  });

  const o = cs.current();
  ok("write: state lands and reads back",
      o.ingredients["ing_1"]?.in_pantry === true && o.ingredients["ing_2"]?.on_list === true);
  ok("write: the reducers behind the shell are the shared ones",
      typeof o.ingredients["ing_1"]?.pinned_at === "string");
  ok("write: recipes, plans and own rows round-trip",
      o.recipes["rec_a"]?.saved === true && o.plans.length === 1 &&
      o.own[0]?.id === made.id);
  ok("write: activity is stamped like the server shell stamps it",
      typeof o.last_active_at === "string");
  ok("subscribe: every write poked the listener", pokes >= 5, String(pokes));

  const blob = JSON.parse(backing.get(KEY)!) as {
    schema: number; revised_at: Record<string, string>;
  };
  ok("blob: carries its schema", blob.schema === 1);
  ok("blob: stamps the groups a write touched",
      !!blob.revised_at["ingredients"] && !!blob.revised_at["recipes"] &&
      !!blob.revised_at["plans"] && !!blob.revised_at["own"] && !!blob.revised_at["meta"],
      JSON.stringify(blob.revised_at));

  unsub();
  const before = pokes;
  cs.setState("ing_1", { in_pantry: true });
  ok("subscribe: unsubscribing stops the pokes", pokes === before);
}

// ── the beacons carry the server's fields ──────────────────────────────────
{
  sent.length = 0;
  const hh = cs.householdId();

  cs.setState("ing_b", { in_pantry: true });
  ok("beacon: a pantry add is emitted with source and household",
      sent.some((e) => e["kind"] === "pantry_event" && e["op"] === "add" &&
        e["node_id"] === "ing_b" && e["source"] === "manual" && e["household"] === hh),
      JSON.stringify(sent));

  // The two-moment checkout: the aisle tick is silent (cart, not pantry),
  // the put-away is the add and carries from_list — matching the server.
  sent.length = 0;
  cs.addToList(["ing_c"]);
  cs.tickOff("ing_c");
  ok("beacon: the aisle tick emits nothing", sent.length === 0, JSON.stringify(sent));
  cs.putAway(["ing_c"]);
  ok("beacon: put-away emits the add with from_list and the checkout source",
      sent.some((e) => e["kind"] === "pantry_event" && e["op"] === "add" &&
        e["from_list"] === true && e["source"] === "gap_resolution"),
      JSON.stringify(sent));

  sent.length = 0;
  cs.addFreeText("Bin bags");
  ok("beacon: free text never enters the record", sent.length === 0, JSON.stringify(sent));

  sent.length = 0;
  const day = new Date(Date.now() - 86_400_000).toISOString();
  cs.recordCook("rec_a", { required: ["ing_d"], cookedAt: day, source: "planned" });
  const cookEv = sent.find((e) => e["kind"] === "cook_event");
  ok("beacon: a cook emits cook_event with the action's source",
      !!cookEv && cookEv["source"] === "planned" && cookEv["recipe_id"] === "rec_a" &&
      cookEv["cooked_at"] === day && typeof cookEv["cook_id"] === "string",
      JSON.stringify(sent));
  ok("beacon: the cook's pantry marks ride along as pantry events with source cook",
      sent.some((e) => e["kind"] === "pantry_event" && e["node_id"] === "ing_d" &&
        e["source"] === "cook"),
      JSON.stringify(sent));

  /* The device mints the cook's id now and hands the same string to the server
     mirror (`lib/dual-write`), so the id can arrive here twice — a retried
     mirror, a double-tapped Save. One meal must still be one `cook_event`:
     BEHAVIOR-SPEC's derivations count them, and the residency figure GO-LIVE's
     distribution plan reads is exactly this row. */
  sent.length = 0;
  const cooksBefore = cs.current().cooks.length;
  cs.recordCook("rec_replay", { id: "ck_given", required: ["ing_e"] });
  cs.recordCook("rec_replay", { id: "ck_given", required: ["ing_e"] });
  ok("beacon: the same cook id twice emits one cook_event",
      sent.filter((e) => e["kind"] === "cook_event").length === 1, JSON.stringify(sent));
  ok("cooks: the same cook id twice records one cook",
      cs.current().cooks.length === cooksBefore + 1 &&
      cs.current().cooks.some((c) => c.id === "ck_given"));

  sent.length = 0;
  const cookId = cs.current().cooks.find((c) => c.recipe_id === "rec_a")!.id;
  cs.undoCook(cookId);
  ok("beacon: undo emits cook_undo, and no pantry reversal",
      sent.length === 1 && sent[0]!["kind"] === "cook_undo" && sent[0]!["cook_id"] === cookId,
      JSON.stringify(sent));
  ok("undo: the pantry kept the cook's marks",
      cs.current().ingredients["ing_d"]?.in_pantry === true);
}

// ── a failed write persists nothing ────────────────────────────────────────
{
  const before = backing.get(KEY);
  let threw = "";
  try { cs.tickOff("ing_nope"); } catch (e) { threw = String(e); }
  ok("throw: the reducer's refusal reaches the caller",
      threw.includes("not on your list"), threw);
  ok("throw: and the stored state did not move", backing.get(KEY) === before);
}

// ── export / import — the manual backup path ───────────────────────────────
{
  const hh = cs.householdId();
  const file = cs.exportFile();
  backing.delete(KEY);
  ok("export: the device can be wiped", cs.current().own.length === 0);

  const restored = cs.importFile(file);
  ok("import: the kitchen comes back whole",
      restored.own.length === 1 && restored.recipes["rec_a"]?.saved === true &&
      cs.current().ingredients["ing_1"]?.in_pantry === true);
  ok("import: the household id survives the restore — no second identity",
      cs.householdId() === hh);
  const blob = JSON.parse(backing.get(KEY)!) as { revised_at: Record<string, string> };
  ok("import: every group re-stamps so sync cannot overwrite the restore",
      ["ingredients", "diet", "recipes", "cooks", "plans", "own", "meta"]
        .every((g) => !!blob.revised_at[g]),
      JSON.stringify(blob.revised_at));

  let threw = "";
  try { cs.importFile("{not json"); } catch (e) { threw = String(e); }
  ok("import: refuses a file that is not a backup", threw.includes("not a jipbap backup"), threw);
  threw = "";
  try { cs.importFile('{"schema":9,"sections":{}}'); } catch (e) { threw = String(e); }
  ok("import: refuses a shape it does not know", threw.includes("not a jipbap backup"), threw);
  ok("import: a refused file touched nothing",
      cs.current().ingredients["ing_1"]?.in_pantry === true);
}

// ── corrupt must never look empty ──────────────────────────────────────────
// Last, deliberately: `wasCorrupt` is sticky for the session, so everything
// above asserts on the clean value first.
{
  const damaged = backing.get(KEY)!.slice(0, 40);
  backing.set(KEY, damaged);
  const o = cs.current();
  ok("corrupt: a fresh state is served so the UI can mount",
      Object.keys(o.ingredients).length === 0);
  ok("corrupt: but the session KNOWS — the UI can say so", cs.wasCorrupt() === true);
  ok("corrupt: the damaged blob is kept, not overwritten",
      cs.corruptBlob() === damaged);

  // A second failure must not cost the first casualty — it holds the data.
  backing.set(KEY, "{even worse");
  cs.current();
  ok("corrupt: an earlier casualty is never replaced", cs.corruptBlob() === damaged);

  // A wrong SHAPE is corrupt too: valid JSON that is not a blob would
  // otherwise quietly present as an empty kitchen.
  backing.set(KEY, JSON.stringify({ hello: "world" }));
  ok("corrupt: a shape that is not a blob is refused the same way",
      Object.keys(cs.current().ingredients).length === 0 && cs.wasCorrupt() === true);
}

console.log(failures === 0 ? "client-store: all checks passed" : `client-store: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
}

void main();
