/**
 * The computation-time gate — PRIVACY-SPEC §5, and the only door to the
 * commercial pool.
 *
 * ── Why the check is here and not at collection ────────────────────────────
 *
 * UX-SPEC §9 and USER-SPEC §2 make the pantry work with zero account, and the
 * signup prompt only fires at about five items. So the most valuable pantries
 * accrue *before* there is anybody who could have agreed to anything, and no
 * amount of drafting fixes that after the fact.
 *
 * The resolution in PRIVACY-SPEC §5 is that nothing is segregated, tagged or
 * copied at write time. Every owner's data is collected and used to run the
 * product; eligibility for partner aggregates is decided **here**, when the
 * figures are built. Three things fall out of that and all three matter:
 *
 *   - granting consent is not a migration; the owner simply starts counting
 *   - withdrawing is not a deletion; they stop counting on the next run
 *   - a bug in this file cannot corrupt anyone's pantry, because it never
 *     writes
 *
 * It is the same shape as USER-SPEC §4's "aggregates are recomputed, not
 * decremented" — one mechanism serves deletion, consent and withdrawal.
 *
 * ── The pool is empty today, and that is the correct output ────────────────
 *
 * `signedIn()` is hard-wired false (`lib/account.ts`), so `eligible()` returns
 * false for everyone and every aggregate is empty. That is not a stub: PRIVACY-
 * SPEC §5's eligibility table has no row in which an anonymous owner counts, and
 * an anonymous owner is the only kind that exists. Nothing here should be
 * "temporarily relaxed" to see output — the way to see output is to ship auth.
 */
import { createHash } from "node:crypto";
import { consentState, isFreeText, type Owner } from "./store";
import { CONSENT_COPY, POLICY_VERSION, PURPOSE } from "./consent";

/** The hash stored on a consent record. Server-side only; see `lib/consent.ts`. */
export const copyHash = (text: string = CONSENT_COPY): string =>
  createHash("sha256").update(text, "utf8").digest("hex").slice(0, 32);

/**
 * The publishing floor for partner files — PRIVACY-SPEC §8, open question 1.
 *
 * **Provisional. Not the number to publish.** RECIPE-SPEC §9's floor governs
 * what a visitor sees on a page; this governs a file handed to a company that
 * holds its own customer data to join against, which is a different threat
 * model with a different answer. It should be materially higher, and it is a
 * reviewer's call that has not been made.
 *
 * It is deliberately not `1`, not `5`, and not the display floor, so that
 * nobody can mistake an unmade decision for a made one. Once settled it is
 * quoted in two binding documents — `legal/privacy-policy.md` §5.2 and clause 1
 * of `legal/partner-data-clauses.md` — and lowering it afterwards needs
 * re-consent under §14 of the policy.
 */
export const K = 50;

/**
 * The master switch. Off until the paperwork it depends on actually exists.
 *
 * `legal/privacy-policy.md` is a draft with unfilled placeholders and has not
 * been published; no partner has signed the clauses that
 * `legal/partner-data-clauses.md` §3 and §4 require. PRIVACY-SPEC §4 makes the
 * de-identification carve-out conditional on all three of those being true, so
 * producing a partner file today would break a commitment the company has
 * written down but not yet earned.
 *
 * Modelled on `lib/account.ts`: one switch, in one file, that reads honestly
 * rather than a TODO that silently becomes `true` when someone tidies up.
 */
export const POOL_ENABLED = false;

let enabled = POOL_ENABLED;

/**
 * Test-only. Named so that it cannot appear in production code with a straight
 * face, and so `grep` finds every use in one pass.
 *
 * The counting, the floor and the free-text drop are all worth testing, and
 * they sit behind the switch. Flipping the switch does NOT bypass `eligible` —
 * a test that enables the pool and passes anonymous owners still gets nothing,
 * which is the most useful assertion in the file.
 */
export function __enablePoolForTestsOnly(on: boolean): void {
  enabled = on;
}

export class PoolDisabled extends Error {
  constructor() {
    super(
      "The commercial aggregate pool is disabled. It requires a published " +
      "privacy policy (legal/privacy-policy.md still has placeholders), a " +
      "settled k (PRIVACY-SPEC §8 open question 1), and a partner bound by " +
      "legal/partner-data-clauses.md §§3-4. Flip POOL_ENABLED in lib/pool.ts " +
      "when all three are true.",
    );
    this.name = "PoolDisabled";
  }
}

/**
 * Row 1 of PRIVACY-SPEC §5's table: is there an account at all?
 *
 * Deliberately NOT `signedIn()` from `lib/account.ts`. That function answers
 * "does this request carry a session", which is the right question for showing
 * a button and the wrong one here — aggregates are built in a batch job where
 * there is no request, no cookie and no session to consult. The question this
 * file needs is whether the owner ever signed up, which is a fact about stored
 * data (USER-SPEC §1's `email`, null until they do).
 *
 * Since ids landed (CREATORS-TAB-SPEC §6) the durable marker is `account_at`;
 * `email` still answers for accounts from before it existed, and for anyone
 * who left a recovery address.
 */
export const hasAccount = (owner: Owner): boolean =>
  !!owner.account_at || !!owner.email;

/**
 * Rows 2 and 3: is there a live grant, to the text currently published?
 *
 * Split from `eligible` because it is the half that carries the actual policy
 * logic and the half worth testing exhaustively — and because "has an account"
 * and "has agreed" are independently meaningful states that a single boolean
 * would blur.
 */
export function consentLive(owner: Owner): boolean {
  const c = consentState(owner, PURPOSE);

  // Never asked, answered no, or since withdrawn. Absent and refused are the
  // same answer to this question; the difference is kept for the audit trail.
  if (!c || !c.granted || c.withdrawn_at) return false;

  /*
    The condition the table leaves implicit: consent is to a specific text.
    `legal/privacy-policy.md` §14 promises that a change widening what we share
    does not carry the old permission forward, and these two lines are what keep
    that promise. Version first, then wording — a policy bump invalidates every
    grant, and a re-worded toggle under an unchanged version invalidates the
    grants that saw the old words.
  */
  if (c.policy_version !== POLICY_VERSION) return false;
  if (c.copy_hash !== copyHash()) return false;

  return true;
}

/**
 * May this owner's data appear in a partner aggregate?
 *
 * The whole of PRIVACY-SPEC §5's eligibility table, in one place, so that no
 * call site invents its own version of the question.
 */
export const eligible = (owner: Owner | null): boolean =>
  !!owner && hasAccount(owner) && consentLive(owner);

/**
 * What the permission control should show — the one place a page asks.
 *
 * `granted` is `consentLive`, not the raw stored answer, and the difference
 * shows up exactly once: after a policy bump, someone who agreed to the old
 * text has a stored "yes" that no longer counts them. The toggle reads unticked
 * then, because it reports what is actually happening, and the alternative is a
 * control that says we share data while `eligible` refuses to.
 */
export const sharingState = (owner: Owner | null) => ({
  hasAccount: !!owner && hasAccount(owner),
  granted: !!owner && consentLive(owner),
});

/** A row as PRIVACY-SPEC §2 defines it. Nothing else is ever handed over. */
export type AggregateRow = {
  dimension: string[];
  metric: "count";
  value: number;
  n_users: number;
  window: string;
};

/**
 * What was dropped and why — for the operator, never for the partner.
 *
 * PRIVACY-SPEC's "no silent caps" instinct: a file that quietly omitted a third
 * of its rows reads as complete coverage. Counts only, never ids.
 *
 * **This must not be delivered alongside the rows.** `population` plus a
 * suppressed row is the differencing attack PRIVACY-SPEC §2's third gate names:
 * publish "1,000 eligible users" and a row for 997 of them, and the other three
 * are described by subtraction. Internally it is the number you need to know
 * whether a run is worth doing at all.
 */
export type PoolReport = {
  owners_seen: number;
  population: number;
  rows_published: number;
  rows_below_floor: number;
  free_text_dropped: number;
  k: number;
};

/**
 * Ingredient demand, over owners who may be counted.
 *
 * The only aggregate built so far, and the shape of every one that follows: it
 * reads two fields — an ingredient id and whether it is held — and cannot reach
 * anything else, because the alternative is a function that *could* read a note
 * and merely does not today.
 *
 * Explicitly never read here, per PRIVACY-SPEC §3: `diet` (health, religion and
 * an ethnicity inference), `note`, `label`, `own`, `cooks[].note`. Those are not
 * filtered out downstream — they are never loaded into a counter in the first
 * place, which is the only version of this that survives someone adding a field
 * later without reading the spec.
 */
export function ingredientDemand(
  owners: Owner[],
  opts: { window: string; k?: number },
): { rows: AggregateRow[]; report: PoolReport } {
  if (!enabled) throw new PoolDisabled();

  const k = opts.k ?? K;
  const counted = owners.filter(eligible);
  const holders = new Map<string, number>();
  let freeTextDropped = 0;

  for (const owner of counted) {
    /*
      Distinct ingredients per owner, so one person cannot move a count on their
      own by any means the UI offers. `in_pantry` only — the grocery list is an
      intention rather than a holding, and mixing the two would make "N people
      have doenjang" a claim we cannot stand behind.
    */
    for (const row of Object.values(owner.ingredients ?? {})) {
      if (!row.in_pantry) continue;

      // §5.3: anything the user typed. A free-text row IS their words, and no
      // group size makes a phrase safe to count.
      if (isFreeText(row.ingredient_id)) { freeTextDropped++; continue; }

      holders.set(row.ingredient_id, (holders.get(row.ingredient_id) ?? 0) + 1);
    }
  }

  const rows: AggregateRow[] = [];
  let belowFloor = 0;

  for (const [ingredientId, n] of holders) {
    if (n < k) { belowFloor++; continue; }
    // `value` and `n_users` are the same number for a headcount metric and will
    // diverge for rates. Both are carried now so the row shape does not change
    // when the second metric arrives.
    rows.push({
      dimension: [ingredientId], metric: "count",
      value: n, n_users: n, window: opts.window,
    });
  }

  // Stable order, and not by value: sorting by count makes adjacent rows
  // differenceable by eye and hands a reader the ranking of everything that was
  // suppressed just below the floor.
  rows.sort((a, b) => (a.dimension[0] ?? "").localeCompare(b.dimension[0] ?? ""));

  return {
    rows,
    report: {
      owners_seen: owners.length,
      population: counted.length,
      rows_published: rows.length,
      rows_below_floor: belowFloor,
      free_text_dropped: freeTextDropped,
      k,
    },
  };
}
