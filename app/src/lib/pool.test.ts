/**
 * The consent gate — PRIVACY-SPEC §5.
 *
 * This file is the evidence for a promise made to users in
 * `legal/privacy-policy.md` §5 and to a partner in clause 1 of
 * `legal/partner-data-clauses.md`. Everything else in the app can be checked by
 * looking at it; a gate can only be checked by trying to get past it.
 *
 * So the assertions are written as attempts rather than as descriptions: seed
 * an owner who should not count, and prove they did not.
 *
 * Same temp-directory dance as `store.test.ts` — the store resolves its file at
 * module scope from `process.cwd()`, so the chdir has to happen before the
 * dynamic import or the test writes over the real pantry.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = mkdtempSync(join(tmpdir(), "pool-test-"));
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

async function main() {
const store = await import("./store.js");
const pool = await import("./pool.js");
const { PURPOSE, POLICY_VERSION } = await import("./consent.js");

const GOOD = pool.copyHash();

/** An owner with a pantry, and whatever consent history the caller wants. */
const owner = (
  id: string,
  opts: { email?: string; have?: string[]; consent?: unknown[] } = {},
): unknown => ({
  id, created_at: "2026-01-01T00:00:00.000Z",
  ...(opts.email ? { email: opts.email } : {}),
  ingredients: Object.fromEntries((opts.have ?? []).map((ing) => [
    ing, { ingredient_id: ing, in_pantry: true, on_list: false, use_first: false,
           added_at: "2026-01-01T00:00:00.000Z" },
  ])),
  recipes: {}, own: [], plans: [], cooks: [], answers: {},
  ...(opts.consent ? { consent: opts.consent } : {}),
});

const grant = (over: Record<string, unknown> = {}) => ({
  purpose: PURPOSE, granted: true, policy_version: POLICY_VERSION,
  copy_hash: GOOD, granted_at: "2026-02-01T00:00:00.000Z", ...over,
});

// ── the record itself ──────────────────────────────────────────────────────
{
  seed({});
  store.setConsent("c1", {
    purpose: PURPOSE, granted: true,
    policy_version: POLICY_VERSION, copy_hash: GOOD,
  });
  const o = store.getOwner("c1")!;
  ok("consent: the grant is recorded", o.consent?.length === 1);
  ok("consent: it is live", store.consentState(o, PURPOSE)?.granted === true);

  store.setConsent("c1", {
    purpose: PURPOSE, granted: false,
    policy_version: POLICY_VERSION, copy_hash: GOOD,
  });
  const after = store.getOwner("c1")!;
  ok("consent: withdrawal appends rather than edits", after.consent?.length === 2,
     JSON.stringify(after.consent));
  ok("consent: the old grant is stamped withdrawn",
     !!after.consent?.[0]?.withdrawn_at);
  ok("consent: the current answer is the last one",
     store.consentState(after, PURPOSE)?.granted === false);

  // The audit trail is the whole reason this is an array. If withdrawal ate the
  // grant, "what were they told in February" becomes unanswerable.
  ok("consent: the original wording survives withdrawal",
     after.consent?.[0]?.copy_hash === GOOD);
}

// ── the gate, one refusal at a time ────────────────────────────────────────
{
  const cases: Array<[string, unknown]> = [
    ["anonymous, however willing", owner("a", { consent: [grant()] })],
    ["an account that never answered", owner("b", { email: "b@x.test" })],
    ["an account that said no",
     owner("c", { email: "c@x.test", consent: [grant({ granted: false })] })],
    ["a grant since withdrawn",
     owner("d", { email: "d@x.test",
                  consent: [grant({ withdrawn_at: "2026-03-01T00:00:00.000Z" })] })],
    ["a grant against a superseded policy",
     owner("e", { email: "e@x.test", consent: [grant({ policy_version: "0.9" })] })],
    ["a grant against different wording",
     owner("f", { email: "f@x.test", consent: [grant({ copy_hash: "deadbeef" })] })],
  ];

  for (const [why, row] of cases) {
    seed({ x: row });
    ok(`gate: refuses ${why}`, pool.eligible(store.getOwner("x")) === false);
  }

  seed({ x: owner("g", { email: "g@x.test", consent: [grant()] }) });
  ok("gate: admits an account with a live grant to the current text",
     pool.eligible(store.getOwner("x")) === true);

  // Withdraw-then-regrant. The array now holds three rows and the answer is the
  // last one — the case a "find the first grant" implementation gets wrong.
  seed({});
  const args = { purpose: PURPOSE, policy_version: POLICY_VERSION, copy_hash: GOOD };
  store.setConsent("h", { ...args, granted: true });
  store.setConsent("h", { ...args, granted: false });
  store.setConsent("h", { ...args, granted: true });
  const back = store.getOwner("h")!;
  back.email = "h@x.test";
  ok("gate: readmits after a re-grant", pool.eligible(back) === true,
     JSON.stringify(back.consent));
}

// ── the switch ─────────────────────────────────────────────────────────────
{
  seed({ x: owner("i", { email: "i@x.test", have: ["ing_a"], consent: [grant()] }) });
  let threw = "";
  try {
    pool.ingredientDemand([store.getOwner("x")!], { window: "2026-08" });
  } catch (e) {
    threw = e instanceof Error ? e.name : "";
  }
  ok("switch: the pool is closed and says why", threw === "PoolDisabled", threw);
}

// ── the aggregate, with the switch held open ───────────────────────────────
{
  pool.__enablePoolForTestsOnly(true);

  /*
    Twelve eligible holders of ing_a, three of ing_b, and one free-text row.
    With k = 10 only ing_a may be published — and the free-text row may not be
    published at any k, which is the distinction the two ingredients exist to
    separate.
  */
  const owners: Record<string, unknown> = {};
  for (let n = 0; n < 12; n++) {
    owners[`e${n}`] = owner(`e${n}`, {
      email: `e${n}@x.test`, consent: [grant()],
      have: n < 3 ? ["ing_a", "ing_b", "txt_bin_bags"] : ["ing_a"],
    });
  }
  // Two who must not be counted, holding the same things.
  owners.anon = owner("anon", { have: ["ing_a", "ing_b"], consent: [grant()] });
  owners.refused = owner("refused", {
    email: "r@x.test", have: ["ing_a", "ing_b"], consent: [grant({ granted: false })],
  });
  seed(owners);

  const all = Object.keys(owners).map((id) => store.getOwner(id)!);
  const { rows, report } = pool.ingredientDemand(all, { window: "2026-08", k: 10 });

  ok("aggregate: only the eligible are counted", report.population === 12,
     `population ${report.population} of ${report.owners_seen}`);
  ok("aggregate: one row clears the floor", rows.length === 1,
     JSON.stringify(rows));
  ok("aggregate: it is the right one and the count excludes the ineligible",
     rows[0]?.dimension[0] === "ing_a" && rows[0]?.value === 12,
     JSON.stringify(rows[0]));
  ok("aggregate: the thin row is suppressed, not rounded",
     report.rows_below_floor === 1 && !rows.some((r) => r.dimension[0] === "ing_b"));
  ok("aggregate: free text never reaches a counter",
     report.free_text_dropped === 3 &&
     !rows.some((r) => r.dimension[0]?.startsWith("txt_")));
  ok("aggregate: the row carries its own headcount",
     rows[0]?.n_users === 12 && rows[0]?.window === "2026-08");

  // The assertion that matters most: the switch is not the gate. Opening it
  // does not admit a single anonymous pantry.
  seed({ a: owner("a", { have: ["ing_a"], consent: [grant()] }) });
  const anonOnly = pool.ingredientDemand([store.getOwner("a")!], { window: "w", k: 1 });
  ok("aggregate: an open switch still admits nobody unconsented",
     anonOnly.rows.length === 0 && anonOnly.report.population === 0);

  pool.__enablePoolForTestsOnly(false);
}

// ── today's answer, stated so it fails loudly when auth lands ──────────────
{
  seed({ x: owner("j", { have: ["ing_a"], consent: [grant()] }) });
  ok("today: nothing sets `email`, so the pool is empty by construction",
     pool.hasAccount(store.getOwner("x")!) === false);
}

console.log(failures === 0 ? "pool: all checks passed" : `pool: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
}

void main();
