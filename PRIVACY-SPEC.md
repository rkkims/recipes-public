# Privacy & data-sharing — spec

The basis on which pantry and grocery signal may be sold to a commercial partner.

Companion to `USER-SPEC.md` (§4 deletion and export), `INGREDIENT-SPEC.md` (§5
the privacy constraint on promotion aggregates) and `RECIPE-SPEC.md` (§9 the
publishing floor `k`). Those three already contain most of the machinery. This
file supplies the thing they do not have: **the lawful basis and the user-facing
consent** that make the machinery sellable.

**Why this file exists:** `BUSINESS-REVIEW.md` §8 named it as *"the prerequisite
nobody has written"* and gave the deadline —

> Write the data-sharing basis into the terms before the first user, not before
> the first deal. Retrofitting a lawful basis onto an existing user base is the
> one item on this list that cannot be done quietly.

**This is not legal advice and does not substitute for counsel.** It is a
product spec written so that a privacy lawyer's review is a one-hour read rather
than a rewrite. Every rule below is a product decision that a lawyer should
confirm; the ones most likely to be corrected are marked ⚖.

---

## 1. The decision everything else hangs off

**Only aggregates are ever disclosed. Row-level data is never sold, never
shared, never licensed, and no partner ever receives a user identifier.**

Reviewer's call, and it should be treated as settled rather than as the
conservative end of a range, because the entire rest of this spec gets cheap the
moment it holds:

| | aggregate-only | row-level |
|---|---|---|
| CCPA/CPRA | deidentified aggregate is **outside** the definition of personal information, given §4's three conditions | a **"sale"** — notice at collection, a *Do Not Sell or Share* link, opt-out honoured, Global Privacy Control signals respected |
| GDPR | truly anonymous data is **outside the Regulation entirely** (Recital 26) | needs consent, and consent for onward sale is the hardest kind to make stick |
| product | one consent, one sentence, one toggle | a compliance function, permanently staffed |

The commercial argument in `BUSINESS-REVIEW.md` §8C does not need row-level
data. *"N households in your delivery zone are one ingredient from cooking X;
the blocker is doenjang"* is an aggregate by construction. The buyer wants
assortment and merchandising direction, not households. **Nothing on the revenue
staircase requires selling a person.**

So the discipline that already exists — `INGREDIENT-SPEC.md` §5's *"counts and
normalised strings only, never user ids, never notes, never which user
contributed what"* — is not a promotion-queue rule. It is **the company's data
product, and it is already specified.** This file extends it outward to third
parties rather than inventing anything.

---

## 2. What may be disclosed, exactly

A partner-facing aggregate is a row of the form:

```
aggregate_row
  dimension     text[]      normalised ingredient / recipe / region bucket
  metric        text        count | rate | rank | adjacency
  value         number
  n_users       integer     the distinct users behind it
  window        text        the period it covers
```

Three hard gates, enforced **where the aggregate is computed** — never in a
template, never in a report generator, for the same reason `RECIPE-SPEC.md` §9
puts the floor there:

1. **`n_users >= k`.** Same floor, same constant as §9. At n=1 an aggregate is
   one person's pantry wearing a statistic's clothes.
2. **No free text ever leaves.** Notes, private vocabulary
   (`INGREDIENT-SPEC.md` §5), comments, search strings. Free text is
   unboundedly identifying and cannot be gated by a count.
3. **No cell may be differenced back to a person.** Publishing both *"1,000
   users"* and *"999 users who are not X"* discloses X. Suppress complementary
   cells, not just small ones. ⚖

**Region buckets, if they exist at all, are the weak point.** `USER-SPEC.md` §1
holds no location today and that is load-bearing here — the moment a delivery
zone is a dimension, `k` has to be evaluated per bucket rather than globally,
and a sparse bucket is a name. Any partner request framed as *"in your delivery
zone"* re-opens `USER-SPEC.md` §1's no-location decision, and that reopening is
a decision for `DECISIONS.md`, not a query parameter.

---

## 3. What is never in the pool, at any k

**Dietary restrictions are excluded from commercial aggregates entirely.**

`USER-SPEC.md` §6 stores `allergens`, `classes` and `excludes`. Read plainly,
that table holds:

| field | what it discloses |
|---|---|
| `allergens: [peanut, shellfish]` | a medical condition |
| `classes: [halal]` / `[kosher]` | religious belief |
| `classes: [vegan]`, `excludes: [pork]` | belief, or health, or neither |

Under GDPR these are **Article 9 special categories** — health, religious
belief, and by inference ethnic origin. Under CPRA, health and religious data
are **sensitive personal information** with their own limitation right. Several
US state laws (Colorado, Connecticut among them) require opt-in consent for
sensitive data even where ordinary data is opt-out. ⚖

This lands on this product specifically and harder than on most, because the
positioning wedge is Asian cuisine (`DECISIONS.md` §1). **A pantry is an
ethnicity inference with a high hit rate**, and an aggregate sliced by cuisine
and sold to a retailer is doing ethnic-origin analytics whether or not anyone
described it that way. The `k` floor does not fix this: it protects the
individual, and the objection here is to the category.

The rule, therefore:

- `user_diet` is **never a dimension, never a filter, never a segment** in
  anything disclosed to a partner.
- Cuisine-shaped aggregates are permitted **as ingredient demand**, which is
  what a grocer is buying anyway. *"Doenjang demand rose 40% in Q3"* is
  assortment data. *"Korean households buy doenjang"* is a protected-class claim
  about people, and we do not make it or enable it.
- Allergen data is not sold **even in aggregate, even above `k`**, even though
  the aggregate would be lawful. It is the one field where users are told a
  safety story (`USER-SPEC.md` §6: *"we hide what we can see"*), and selling the
  by-product of a safety feature is the kind of thing that is defensible in a
  filing and indefensible in a screenshot.

---

## 4. The deidentification commitment

CCPA/CPRA's carve-out for deidentified and aggregate data is conditional, and
the three conditions are cheap to meet and easy to forget: ⚖

1. **Reasonable measures** to prevent reidentification — §2's gates are the
   measures, and they live in code at the point of computation.
2. **A public commitment** to maintain the data in deidentified form and not
   attempt reidentification — this belongs in the published privacy policy, in
   those words.
3. **A contractual obligation** binding every recipient to the same, with
   onward-transfer and reidentification both prohibited.

Condition 3 is a term in the partner contract, so it is the one that will be
negotiated away under commercial pressure. **It is not negotiable.** A partner
who will not sign a no-reidentification clause is telling you what they intend
to do with the file.

---

## 5. Consent, and the anonymous-user problem

### The collision

`UX-SPEC.md` §9 and `USER-SPEC.md` §2 are unambiguous: **the pantry works with
zero account**, signup is prompted at ~5 items, and an anonymous user is a real
row that has never accepted anything. `UX-SPEC.md` §1's prime directive forbids
putting a wall in front of the first ingredient.

So the most valuable data — a pantry built by someone who never signed up —
accrues **before there is any consent to rely on.** No amount of terms drafting
fixes this, because there is no moment at which the anonymous user agreed.

### The resolution

**Anonymous data is collected and used to run the product, and is excluded from
the commercial pool until an account exists and consent is recorded.**

| user state | product use (matching, ranking, promotion queue) | commercial aggregates |
|---|---|---|
| anonymous | yes | **no** |
| account, consent not given | yes | **no** |
| account, consent given | yes | yes |

Two consequences, both good:

- The consent flag is checked **at aggregate-computation time**, not at
  collection time. Nothing is deleted or duplicated when someone consents; they
  simply start counting. This is the same shape as `USER-SPEC.md` §4's
  *"aggregates are recomputed, not decremented"* — one mechanism serves deletion
  and consent both, and withdrawal falls out for free.
- `INGREDIENT-SPEC.md` §5's promotion queue is **product use, not commercial
  use**, so it keeps running on everyone. Vocabulary promotion is how the
  ontology grows; gating it on consent would degrade the product for the
  consenting user too.

### The consent moment

**At signup, not at first launch, and not buried in the terms checkbox.**

Signup is already the moment `UX-SPEC.md` §9 designs for, the user is already
being asked for something, and it is the first point at which there is a durable
identity to attach a record to. A separate, unticked, plainly worded toggle:

```
   ┌────────────────────────────────────────────────┐
   │  ▢  Help shape what stores stock                │
   │                                                 │
   │     We share counts — never your pantry, your   │
   │     name, or anything you wrote — with grocers  │
   │     and food companies. Nothing that can be     │
   │     traced back to you. Change this any time.   │
   └────────────────────────────────────────────────┘
```

Four requirements on that control, each of which is a legal requirement wearing
a UX hat: ⚖

- **Unticked by default.** Pre-ticked is not consent under GDPR, and a dark
  pattern under FTC scrutiny regardless of jurisdiction.
- **Not a condition of signup.** Consent bundled into service access is not
  *freely given* (GDPR Art 7(4)). The account must complete with the box unticked.
- **Withdrawable as easily as given** — one toggle in settings, same words, no
  retention flow, no "are you sure".
- **Versioned.** If the terms change materially, the old consent does not cover
  the new use.

`UI copy rule` from `UX-SPEC.md` applies: the copy above names the mechanism
(*counts*) and the safety (*never your pantry*) and does not editorialise.

### The record

```
user_consent
  owner_id
  purpose        text        'commercial_aggregate'
  granted        boolean
  policy_version text        which published text they saw
  copy_hash      text        hash of the exact words shown
  granted_at     timestamp
  withdrawn_at   timestamp?
```

`copy_hash` is the field that is always omitted and always wanted later. The
question in a dispute is never *did they consent* — the flag answers that — it
is **what were they told**, and a policy version number does not answer it if
the toggle's own wording differed from the policy. Consent records are retained
after account deletion in stripped form (`owner_id` severed, the rest kept) as
proof the disclosure was lawful when made. ⚖

---

## 6. What the published terms must say

Before the first user, the privacy policy must contain, in substance:

1. **That aggregate data is disclosed to commercial third parties**, described
   in the same plain words as the toggle — not as "partners" or "service
   providers", which mean something narrower and would be misleading.
2. **The categories disclosed** — ingredient counts, demand and adjacency
   signal, assortment gaps — and the categories never disclosed: identity, free
   text, dietary and allergen data, anything below the floor.
3. **The public deidentification commitment** of §4.2, verbatim enough to be
   quotable.
4. **That consent is optional, and how to withdraw it.**
5. **An age floor.** COPPA makes under-13 data a separate regime; the practical
   answer is a floor at signup and no commercial use of a minor's data at all.
   Under-16 opt-in is separately required in California for sale. ⚖
6. **Jurisdiction reach.** If EU/UK users are served at launch, GDPR applies in
   full and §5's opt-in design is what makes that survivable — the design above
   is already GDPR-shaped, so serving the EU costs a DPA, a controller identity
   and a rights process, not a redesign.
7. **That data may transfer with the business.** A merger, acquisition,
   financing or sale of assets passes user data to a successor. If the terms do
   not say so at collection, it cannot lawfully happen later, and the only
   remedy is re-consenting the entire user base.

   **Added 2026-08-14, and it was missing.** This section listed six
   requirements and none of them was this one — survivable while the asset was
   thought to be the ontology, which is owned outright, and not survivable under
   `BEHAVIOR-SPEC.md` §0, where the asset is the behavioural record itself. An
   asset that cannot transfer is not an asset.

   **This is not in tension with §1.** §1 governs *disclosure* — selling,
   sharing, licensing row-level data — and a transfer of the whole business to a
   successor is a different act. But the permission has to have been given at the
   beginning, which is the same *"cannot be retrofitted quietly"* problem
   `BUSINESS-REVIEW.md` §8 identified for the data-sharing basis, arriving a
   second time by the same route.

   **Say that the successor is bound by these commitments**, and say it in the
   same plain words as the rest. A clause that reads *"on acquisition, all of
   this may cease to apply"* is technically the more permissive drafting and it
   destroys the claim §8's question 5 identifies as the sharpest trust asset
   available. It also invites exactly the enforcement that has followed
   companies who promised data would never be shared and then transferred it in
   an acquisition. The narrower clause is worth more than it costs: a buyer
   acquiring a dataset with a clean, documented consent basis is acquiring less
   risk, and risk is what gets discounted in diligence. ⚖ — see §8.6.

---

## 7. Revenue share — flagged, not designed

`chatgpt-thread.md` raises paying users a share for their data. It is a good
trust instinct and it is not free:

- **US:** permitted, but a financial incentive for data requires its own notice
  and a good-faith estimate of the data's value under CCPA. ⚖
- **GDPR:** payment complicates *freely given* — the argument that a user
  consented voluntarily is weaker when withholding consent costs them money.

Not blocking. But it is a v2+ decision and should not appear in launch copy,
because a promise of future payment made at signup is the kind of statement
consent gets challenged on.

---

## 8. Open questions

Marked rather than guessed, per the repo's habit.

| # | Question | Why it can't be defaulted |
|---|---|---|
| 1 | What is `k`, for commercial aggregates specifically? | `RECIPE-SPEC.md` §9 sets a floor for public display. A partner file is a different threat model — a buyer has outside data to join against. It should probably be **higher**, and it is a reviewer's call. |
| 2 | EU/UK at launch, or US-only first? | Changes nothing structural (§5 is already opt-in) but decides whether a DPA, a controller entity and an Art 30 record are launch blockers. |
| 3 | Does a delivery-zone dimension ever get built? | It is the strongest thing to sell (§8C) and it reopens `USER-SPEC.md` §1's no-location rule. Decide in `DECISIONS.md`, not here. |
| 4 | Retention: how long may a partner hold a delivered file? | Deletion cannot recall a file already sent. The only control is contractual, so the term has to exist before the first deal. |
| 5 | Does the "no ads" positioning (`DECISIONS.md` §1) get restated as "no ads, and we never sell you"? | It is the sharpest available trust claim and it is only true if §1 holds. Making it publicly commits the company to §1 permanently — which may be exactly the right cost. |
| 6 | Is a successor **bound** by these commitments, or does the transfer clause release them? (§6.7) | §6.7 recommends bound, and the recommendation is not free: it narrows what a buyer may do with the record and a buyer may price that. The looser drafting is worth more on paper and is the version that gets challenged. It also interacts with question 5 — a public "we never sell you" that a successor can drop was never true. |

---

## 9. Settled

- Aggregate-only; row-level is never sold (§1).
- Dietary, allergen and free-text data are out of the pool at any `k` (§3).
- Consent is opt-in, unticked, not a condition of signup, withdrawable (§5).
- Anonymous and non-consenting users are counted for product, not for partners,
  and the check happens at computation time (§5).
- The terms carrying all of this are published **before the first user** (§6).

---

## 10. Where this lives in code

| Rule | File |
|---|---|
| §5 the eligibility table, entire | `app/src/lib/pool.ts` — `eligible`, `hasAccount`, `consentLive` |
| §2 the `k` floor and the row shape | `app/src/lib/pool.ts` — `ingredientDemand` |
| §3 dietary, allergen and free-text exclusion | same function: those fields are never read, not filtered afterwards |
| §5 the record, append-only | `app/src/lib/store.ts` — `Consent`, `setConsent`, `consentState` |
| §5 the toggle and its four requirements | `app/src/components/ShareConsent.tsx` |
| the exact wording, hashed into every record | `app/src/lib/consent.ts` |
| the whole of it, tested as attempted breaches | `app/src/lib/pool.test.ts` — `npm run test-pool` |

**Two switches, both currently off, both honest about why.** `POOL_ENABLED` in
`pool.ts` refuses to build a partner file until the policy is published, `k` is
settled and a partner has signed §4's clause. `hasAccount` reads USER-SPEC §1's
`email`, which nothing writes, so the eligible population is zero by
construction rather than by configuration. Neither is a stub to be relaxed for a
demo: the way to see output is to finish the prerequisites.

**Note the deliberate non-use of `signedIn()`** (`app/src/lib/account.ts`). That
function asks whether the current request carries a session, which is the right
question for showing a control and the wrong one for a batch job that runs
months later with no request in sight. §5's question is whether an owner ever
signed up — a fact about stored data. Conflating them would make an offline
export depend on a cookie.
