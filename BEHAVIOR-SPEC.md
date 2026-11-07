# Behaviour — spec

What the product must record about households over time, why that record is the
asset rather than a by-product, and the structural decisions that decide whether
it is worth anything.

Written 2026-08-14. Companion to `ATTRIBUTION-SPEC.md`, which covers the click
and the retailer; this file covers everything either side of it.

---

## 0. Why this file exists, and what it reverses

`BUSINESS-REVIEW.md` §8B argues that the durable asset is the ontology plus its
benchmark — *"an LLM maps gochugaru zero-shot; what it cannot supply is a stable
ID space and an accuracy number that can go in a contract."*

**That argument was tested on 2026-08-14 and does not hold as a moat.**

> An ontology is labour, and labour is the input a large company has most of.
> Three thousand nodes with LLM-assisted annotation, a hundred annotators and a
> competent manager is a project measured in weeks. The accuracy number is not
> scarce to someone who can staff their own annotation team and produce their
> own.

The ontology remains real and useful. Its value to an acquirer is that it saves a
quarter, and a quarter is worth something and is not worth a premium.

**What cannot be hired is time in the market.** No headcount produces ten
thousand real kitchens' inventory, or the observed sequence of *pantry → gap →
acquisition → cook*. That is accumulated exposure and there is no shortcut to it.

So the asset is behaviour, and this file specifies it. The consequences reach
into `PRIVACY-SPEC.md`, `USER-SPEC.md` and the build order, and they are set out
here rather than left implied.

**`BUSINESS-REVIEW.md` §8's ranking and §12–13 still argue the earlier thesis and
have not been reconciled with this file.** That is deliberate for now — the
reversal is recorded here, in one place, rather than smeared across a document
written under the older frame.

---

## 1. The loop, and why it closes without the retailer

The product's thesis is a single sequence. Everything else is decoration:

> *A household with a known pantry is matched to something it can nearly cook,
> finds a gap, acquires the missing thing, cooks, and comes back.*

Step four is the one we can never observe. `BUSINESS-REVIEW.md` §7 says so — we
are the only layer with no receipt — and `ATTRIBUTION-SPEC.md` §7 closes the
remaining routes: receipts are refused on custody grounds, and item-level
conversion data exists only where a programme exists, which §10's sweep says is
almost nowhere.

**We do not need the purchase. We need the acquisition, and the user reports it
themselves.**

```
pantry state → match → gap → outbound click → pantry ADD → cook → return
                                                  ↑            ↑
                                         "I have gochujang"  "I used it"
```

A household that hit a gap on gochujang, clicked out, added gochujang to its
pantry four days later, and then marked a gochujang recipe cooked has closed the
loop **with no third party anywhere in the record.**

That is not proof of a purchase and must never be described as one. It is proof
of something else, and for the buyers who pay the most it is the more interesting
fact: an appliance or platform buyer is underwriting kitchen engagement, not
affiliate margin. A household that cooks three times a week is valuable to them
whether or not we earned thirty cents from it.

**And it is the white space, restated.** `BUSINESS-REVIEW.md` §10 concedes that
Cooklist and Northfork infer pantries from loyalty cards and do it better than
self-report, and instructs us not to compete on pantry accuracy. That instruction
stands. What none of them hold is **the gap → acquisition → cook sequence for
Asian home cooking, observed longitudinally.** Purchase history is a better
pantry; it is not this.

---

## 2. The unit is a household over time

Not an event stream. A buyer is not purchasing events; they are purchasing
evidence about behaviour, and evidence about behaviour is longitudinal by
definition.

> **Ten thousand pantry snapshots are a database. Ten thousand pantries observed
> across twelve months are an asset. The difference is entirely time.**

Two consequences, and the first is the reason this file is being written now
rather than when there is traffic worth measuring:

**Time cannot be backfilled.** Every month not recorded is permanently absent
from the longest series we will ever be able to show. The value of shipping the
instrumentation today is not what it teaches us this quarter — at current volumes,
nothing. It is that the clock starts.

**The loop dictates the build order.** The record requires every step to exist.

**Corrected 2026-08-15, against the code rather than the review.** This section
first repeated `BUSINESS-REVIEW.md` §3's claim that "Made it" does not exist.
That was true of the repository the review was written against (2026-08-05) and
is not true now: `recordCook`, the settle-up flow, undo, and plan-to-cook
linking are all live in `store.ts`. The product had every step of the loop
before this file was written — **what did not exist was the record of any of
it**, which is precisely the §2 distinction between a product that works and an
asset that accrues. The build order in §9 is therefore about instrumentation
only, and it shipped the day after this spec was written.

---

## 3. The structural decision: append-only

> **The pantry is stored as an append-only trajectory, never as mutable current
> state.**

This is the decision this file exists to make. A normal application stores *what
is in the pantry now*, because that is what the interface needs, and every edit
overwrites what came before. Do that and the asset is destroyed continuously as
it is created — arriving at any negotiation with ten thousand current snapshots
and no sequences at all.

Current state becomes a projection over the log. That costs a little performance
and preserves the only thing being sold.

It belongs in the same category as the business-transfer clause §6 below finds
missing: a small structural choice, nearly free today, that decides whether an
asset exists later. Both are cheap now and unrecoverable in retrospect, and both
look like paperwork at the moment they must be made.

---

## 4. The schema

```
household
  id            opaque      pseudonymous, internal only
  created_at    timestamp
  consent_state text        see §6

pantry_event                APPEND ONLY — never updated, never deleted
  household     id
  node_id       text        canonical ontology id, never a display string
  at            timestamp
  op            enum        add | remove
  source        enum        manual | first_run | gap_resolution | import | cook
  from_list     boolean?    the checkout fact: it was on the list, now it is held

match_served
  household     id
  at            timestamp
  recipe_id     text
  gap_count     integer
  gap_nodes     text[]      canonical ids
  surface       text

outbound_click              specified in ATTRIBUTION-SPEC §2 — not repeated here

cook_event
  household     id
  at            timestamp   when it was RECORDED
  cooked_at     timestamp   when the meal happened — a Friday tick-off of
                            Monday's dinner keeps both, honestly
  recipe_id    text
  cook_id      text
  source       enum         planned | spontaneous

cook_undo                   an undo is a new fact, not an erasure (§3) —
  household     id          the cook line stays, this line withdraws it,
  cook_id       text        and the derivation subtracts
```

*Amended 2026-08-15, from implementation:* `cook` joined the pantry source enum
— `recordCook`'s additive marks and the settle-up's used-up removals are a
distinct mechanism, neither typed by hand nor bought off a list. `from_list`
was dropped from the cook sources (underivable — a claim, not a fact) and
became the boolean on `pantry_event`, where it is a fact.

**`source` on `pantry_event` is the highest-value field in this schema.**

It is what separates *"typed gochujang in during setup"* from *"added gochujang
after hitting a gap and clicking out."* Without it there are two unrelated event
streams and an anecdote. With it, loop closure is a query. One enum, on one
write, and the entire evidentiary claim in §1 depends on it.

**Everything keys on canonical node ids, never display strings.** Same reason
`INGREDIENT-SPEC.md` §5 gives: a string is unboundedly variable and quietly
identifying; an id is neither, and it survives the ontology's own redirects and
retirements.

**Sessions and returns are not logged.** They are derivable from the timestamps
of everything else, and a separate session event is a second source of truth
about the same fact.

---

## 5. Derive the loop; never store it

Resolution — *gap → pantry add of the same node within window `W` → cook of a
recipe requiring that node* — is **computed by a versioned script over the raw
events**, not written as a conclusion.

The reason is not tidiness. A buyer's analyst will want to re-run it with their
own window, their own definition of a cook, their own exclusions. Handing over
events plus the derivation lets them check us. Handing over conclusions asks them
to trust us, and nobody in diligence extends that.

It costs nothing to do it this way and it is worth a great deal in the room.

The same rule applies to every headline number: **store the events, version the
derivation, regenerate the figure.** A number that cannot be recomputed from
primitives is an assertion regardless of whether it is true.

---

## 6. What stays out — structurally, not by discipline

**Dietary and allergen data.** `PRIVACY-SPEC.md` §3 excludes it from the
commercial pool at any `k`. It lives in a **separate store**, so exclusion is
architectural rather than a filter someone has to remember to apply. Procedural
rules fail exactly once, and this is the category where once is the whole
problem.

**Free text.** Notes, private vocabulary, search strings. `PRIVACY-SPEC.md` §2's
second gate governs disclosure; the rule here is about custody, and it is the one
adopted when receipts were refused in `ATTRIBUTION-SPEC.md` §7b:

> Prefer the input that carries only what we need over the richer input plus a
> promise to discard the rest. Custody is a cost even when disclosure is zero.

**Location.** A buyer would want it, and `USER-SPEC.md` §1 holds none. Adding it
re-triggers `PRIVACY-SPEC.md` §2's per-bucket `k` problem, where a sparse
delivery zone is a name. That is a `DECISIONS.md` question and must not arrive as
a schema convenience.

### The anonymous-first collision, which has a product consequence

`UX-SPEC.md` §9's anonymous-first pantry accrues the most valuable data before
there is anyone to have consented. `PRIVACY-SPEC.md` §5 already names this as a
consent problem. It is also an **asset problem**, and that is new:

> **If anonymous state stays on the device, those households are not in the
> record at all.**

So account conversion stops being a funnel metric and becomes *the rate at which
behaviour becomes property.* That is a real argument for an earlier, gentler
account moment than the product would otherwise want — and it must be made on
those grounds **explicitly**, in `DECISIONS.md`, rather than smuggled in as a UX
improvement. A consent moment designed to enlarge an asset is a thing to be
honest about or not to do.

### The clause without which none of this transfers

**Found missing and added, 2026-08-14 — `PRIVACY-SPEC.md` §6.7.** That section
listed six things the published terms must say before the first user, a
business-transfer clause was not among them, and nothing else in the repository
contained one.

It was survivable under the previous thesis, where the asset was an ontology we
built and therefore owned outright. It is not survivable under this one:

> **If the terms do not say that user data may transfer with the business, the
> record specified in this file cannot lawfully go with a sale.** The asset would
> exist and be unsaleable.

`PRIVACY-SPEC.md` §1's aggregate-only rule is not the obstacle — it governs
*disclosure*, and an acquisition transfers a business rather than selling a data
file. But the permission has to have been given at collection. The remedy after
the fact is re-consenting the entire user base, which is the same
*"cannot be retrofitted quietly"* trap `BUSINESS-REVIEW.md` §8 already identified
for the data-sharing basis — and the FTC has acted against companies that
promised data would never be shared and then transferred it in an acquisition.

**It cost one clause and it is the single highest-value item in this file.** It
lives in `PRIVACY-SPEC.md` §6.7, not here. What remains open there is whether a
successor is **bound** by these commitments or released from them —
`PRIVACY-SPEC.md` §8's question 6, and it is a pricing decision as much as a
privacy one.

### Retention

Minimisation says delete old records. The asset says a twelve-to-twenty-four
month series is the entire point. These do not reconcile; pick a period that can
be defended in the published terms, and know it is being picked for both reasons.

---

## 7. What makes the record persuasive rather than merely present

Every item below is cheaper to prevent than to explain.

| Failure | Rule |
|---|---|
| **Rates without denominators** | Log the denominator for every ratio ever to be quoted. *"500 outbound clicks"* is not a number; *"500 from 4,000 blocks shown"* is. This is why `buyblock_shown` matters as much as the click |
| **Definition drift** | Version metric definitions in a dated changelog. If *"active household"* quietly changes meaning in month seven, the series breaks and nobody can say where |
| **Survivorship** | Cohort by join month and report the leavers. An average over survivors is the commonest way a good product makes a dishonest chart |
| **Missing negatives** | Keep gaps never resolved, matches never cooked, clicks that went nowhere. A record retaining only successes is worthless as evidence — the reader assumes the worst about the absences |
| **Backfill** | Never reconstruct history. If instrumentation starts in month six, the series starts in month six and says so. A reconstructed curve that looks too clean is worse than a short honest one |
| **Unstated `n`** | Report it everywhere. 40% loop closure at n=12 is noise, and quoting it as a headline costs credibility for the numbers that are real |
| **Unstated self-report** | The pantry is *stated* inventory, not observed. Say so first, then show where the cook event and the click corroborate it. Naming a limitation before it is found is worth more than the limitation costs |

---

## 8. The artifact — six curves, regenerated monthly

1. Retention by join cohort
2. Pantry size trajectory by cohort — **does inventory accrete?**
3. Gap → resolution rate, and time-to-resolution distribution
4. Cook frequency per household per month
5. Loop closure — share of households completing gap → add → cook at least once
6. The same, segmented by cuisine and by starting pantry size

**Two readings, one record.** For an appliance or platform buyer, lead with 4 and
2 — kitchen engagement is their business case. For a grocer, lead with 3 — their
case is conversion, and by their frame our numbers will look thin. Do not build
two datasets. Build one and read it twice.

**Keep it live rather than assembling it under deadline.** The honest reason to
build this is not diligence: these six curves are the only instrument that tells
*us* whether the loop works, and `BUSINESS-REVIEW.md` §9 has never measured any
of them — its funnel table is bands, offered explicitly as *"the point is that the
specs contain none of them."* Three of the six answer rows in that table.

---

## 9. Build order this forces

**Shipped 2026-08-15.** The clock (§2) is running.

| | | How it landed |
|---|---|---|
| 1 | **Click instrumentation** — `ATTRIBUTION-SPEC.md` §§2–3 | `/go` redirect route records `outbound_click` server-side and 302s on; `buyblock_shown` / `buyblock_opened` / `list_viewed` arrive as beacons, allowlist-validated |
| 2 | **`source` on every pantry write** | Threaded through `mutate()` — the one choke point every owner write passes — so no writer can forget to log |
| 3 | **Pantry as an append-only trajectory** | `data/events/events.jsonl`, append-only by construction; `owners.json` stays the mutable projection the UI reads. §3 as specified, with the two files' roles swapped from the naive reading: the log is the asset, the state file is the cache |
| 4 | **"Made it"** | Already existed (see §2's correction) — wired into the record: `cook_event` with planned/spontaneous, `cook_undo` as an appended withdrawal rather than an erasure |

Free text (`txt_` rows) is excluded in `events.ts` itself — the caller cannot
log what the module refuses (§6, structurally rather than by discipline).

Nothing here waited on a partner, a rate, a programme or a reply.

---

## 10. Open questions

- ~~The business-transfer clause~~ — **closed 2026-08-14: written into
  `PRIVACY-SPEC.md` §6.7.** What is still open is whether a successor is bound by
  the commitments or released from them (`PRIVACY-SPEC.md` §8.6), which is a
  pricing decision wearing a privacy question's clothes.
- **The resolution window `W`** (§5). Pantry restocking is weekly-to-monthly; a
  window too short undercounts and one too long invents causation. Pick it from
  the time-to-resolution distribution once there is one, and version it.
- **Whether the account moment moves earlier** (§6), and whether that decision is
  honest to make on asset grounds. `DECISIONS.md`, not this file.
- **The retention period** (§6).
- **Whether `cook_event` needs a quantity or outcome** — did they cook it as
  written, substitute, halve it. Rich, and every field here is custody.
- **How current state is projected efficiently** from an append-only log at the
  sizes `BUSINESS-REVIEW.md` §9 contemplates. A materialised view is fine; it
  must never become the source of truth.
- **Whether an anonymous household can be back-filled into the record on
  sign-up** without violating `PRIVACY-SPEC.md` §5's consent basis — i.e. does
  consent reach backwards over data the device already held.
- **What `BUSINESS-REVIEW.md` §8 and §12–13 should say** now that the asset
  thesis has moved (§0). They are currently unreconciled and it is recorded
  rather than quietly fixed.
