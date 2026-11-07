# Attribution — spec

What we can know about whether a link earned anything, what we can only be told,
and how to tell the difference.

Written 2026-08-14. Companion to `BUSINESS-REVIEW.md` §§12–13, which set the
commercial frame; this file is the mechanism.

`WEEE-SPEC.md` §6 decided the link. Nothing here changes where a link points. It
adds the record of the click, which does not currently exist.

---

## 0. The asymmetry, stated once

> **The retailer owns the conversion event. We own the click. There is no
> arrangement, at any commission rate, in which we can independently observe a
> purchase.**

This is not a weakness of a particular programme. It is the structure of every
affiliate relationship: the basket, the payment and the receipt all happen on
someone else's domain, and the only reason we ever hear about them is that a
contract says we do. `BUSINESS-REVIEW.md` §7 already named this from the demand
side — *"the decision is the most interesting layer and the only one with no
receipt."* This file is the operational consequence.

So the question is never *"can we verify the number?"* It is:

1. Can we make the reported number **hard to get wrong** — by owning the click
   side completely, so every conversion has a click we recorded?
2. Can we **detect** a number that has gone wrong, without seeing the truth?
3. Can we tell **breakage from underreporting**, since the remedies are opposite?

(1) is engineering and is available now. (2) is statistics over our own data.
(3) is the one that decides whether a partnership conversation is a bug report
or an exit.

---

## 1. The dominant failure is breakage, not fraud

Stated first because it inverts the instinct. A grocer reporting a third of the
conversions you expected is far more likely to have a broken tag than a crooked
one.

| Cause | How common | What it looks like | Remedy |
|---|---|---|---|
| **Cookie loss** — Safari ITP caps script-set cookies at 7 days, often 24 hours; Firefox ETP; ad blockers | Endemic | Conversions vanish on iOS specifically; desktop unaffected | Server-to-server postback, not cookies |
| **In-app browser** — link opened inside Instagram/TikTok webview, purchase completed later in Safari | Endemic for social traffic | The whole social channel appears not to convert | Nothing fully fixes it; coupon code recovers some |
| **Tag dropped on a site change** | Common | A clean step-change to near-zero on a date | Canary order (§5) catches it in days |
| **Category exclusion** in the terms | Common, and legitimate | Conversions reported, values low | Read the terms — §6 |
| **Coupon-extension hijack** at checkout | Common | Clicks steady, conversions decay gradually | Originator-credit clause — §6 |
| **Deliberate underreporting** | Rare | Indistinguishable from the above without §5 | Leave |

**Two consequences.**

First, a reconciliation system built to catch fraud catches breakage twenty
times more often, and that is the return on it. Build it for the common case.

Second, and this is the trap: **the honest failures and the dishonest one produce
the same signal.** Only a canary order separates them. Without one, every
disappointing month is an unresolvable suspicion, which is a bad way to run a
partnership and a worse way to decide to end one.

---

## 2. What we record, on our side

Nothing in the app currently records that a link was ever clicked. Every
outbound link is a bare `<a target="_blank">` in `BuyBlock.tsx` — the shelf
chip, the product rows in the modal, and the *See all* button.

The funnel, as events. Names are the contract; the storage is an
implementation detail.

```
list_viewed        a grocery list was rendered
buyblock_shown     the block rendered — i.e. ≥1 row was hard-to-find
buyblock_opened    the modal opened for one ingredient
outbound_click     a link to a retailer was followed
```

`outbound_click` is the one that matters and the only one with a required shape:

```
outbound_click
  click_id       uuid v4   fresh per click — see §4 on why never reused
  at             timestamp
  retailer       text      weee | amazon | …
  surface        text      chip | modal_product | modal_all
  ingredient_id  text      canonical node id, not the display string
  had_products   boolean   was this a named product or a bare shelf link
  resolved       boolean   did the ingredient resolve to a shelf at all
```

**What is deliberately absent: a user id.** See §4.

**`buyblock_shown` is not optional garnish.** It is the denominator.
`BUSINESS-REVIEW.md` §9's funnel bands are guesses at exactly these ratios, and
three of the five rows become measured the day this ships. Recording clicks
without impressions produces a number that cannot be compared to anything.

**One thing to resist:** do not gate the link behind a tracking request. The
click must fire the navigation whether or not the beacon lands — `sendBeacon`,
or a fire-and-forget fetch with `keepalive`, never an `await` in front of the
`window.open`. A tracker that costs a conversion has inverted its own purpose.

---

## 3. The click id has to ride the link

A record on our side and a conversion on theirs are worth much more joined than
separately, and the join key has to travel with the user.

Every network supports this under a different name — `subId`, `sub_id`, `u1`,
`SubId1`, `sid`. Amazon Associates supports up to three via `ascsubtag`. It
comes back attached to the conversion in their reporting.

**Implementation point — revised when built, 2026-08-15.** This section
originally nominated `withTag` in `weee.ts` as the choke point. Building it
found a better one: `withTag` runs at page render, and a click id is a fact
about a *click*. So the choke point is a redirect route, `/go` — every shopping
link points at it, it records `outbound_click` server-side and 302s onward with
`sub_id=<click id>` appended beside the tag `weee.ts` already applied. A
redirect can never lose the race with navigation, and it works with JS off,
middle-click, and open-in-new-tab, none of which a beacon survives.

The id is minted **client-side at click time** (per-click, as required — not
per-render, which a first draft contemplated), and the device keeps its own
copy, which is §7's design. A link followed without one — JS off, a shared URL
— gets an id minted in the route, so the retailer side is never unkeyed.

**Two properties are required and one is tempting and wrong.**

- **Required — opaque.** A random uuid, carrying nothing. Not the ingredient
  name, not a user id, not a session id, not anything encoded.
- **Required — single-use.** One click, one id. Two clicks on the same
  ingredient in the same minute are two ids.
- **Wrong — a stable per-user subID.** This is the obvious design and it is
  the one thing this spec forbids outright. See §4.

**If the tag is unset, the click id still appends and we still record the
click.** `weee.ts`'s existing comment has this right for the tag — *"an unset tag
produces a working, untagged link rather than a broken one"* — and the same
reasoning applies harder here. `BUSINESS-REVIEW.md` §12's whole argument is that
the funnel data is what makes a negotiation possible, so the measurement must
not wait on the deal it is meant to win.

---

## 4. Privacy: a subID is a disclosure

The tempting design — pass a stable per-user identifier so conversions can be
attributed to users over time — **collides head-on with `PRIVACY-SPEC.md` §1:**

> *"Row-level data is never sold, never shared, never licensed, and no partner
> ever receives a user identifier."*

A stable subID is a user identifier disclosed to a commercial partner, dressed as
plumbing. It would let the retailer join their own purchase history to our
sessions, permanently, which is precisely the disclosure §1 rules out — and it
would do it without ever appearing in a data-sharing agreement, because nobody
thinks of a query parameter as a disclosure.

**So: per-click ids, random, never reused, with no user id stored against them.**

That is a genuine cost and it should be stated rather than glossed. It means:

| We can measure | We cannot measure |
|---|---|
| Conversion rate per retailer | Whether a converting user came back |
| Per ingredient, per surface | Lifetime value of a referred user |
| Per cohort by week | Repeat-purchase rate, first-hand |

The repeat-purchase claim in `BUSINESS-REVIEW.md` §12 — the pantry lock-in
argument — therefore has to come **from the retailer's own aggregate reporting**
in a negotiation, not from our data. That weakens the pitch and it is the right
trade: the alternative is a silent identifier disclosure that `PRIVACY-SPEC.md`
§6's published terms would then be wrong about.

**Retention.** Click records age out. They are a measurement instrument, not a
history — and an old click record has no analytic value that the aggregate does
not already hold. Set the window when the storage is built; long enough to
reconcile a payment cycle plus a dispute, and no longer.

**⚖ Open — flagged, not settled.** Whether `outbound_click` is disclosable in
aggregate under `PRIVACY-SPEC.md` §2 (it is a count over normalised ingredient
ids, so it appears to qualify at `n_users >= k`) and whether the ingredient
dimension can be differenced against a sparse retailer. Not urgent; nothing is
disclosed until there is a partner and a `k`.

---

## 5. Reconciliation: four checks, in order of cost

None of these observe the truth. All of them detect a number that has stopped
tracking reality.

### a. Click discrepancy — free, run weekly

Their reported click count against ours, joined on click id.

Expect a gap; do not expect zero. Bots, prefetch, users who abandon in flight,
and their own filtering all cut legitimately. **What matters is the gap's
stability, not its size.** A steady 12% is a calibration constant. A 12% that
becomes 40% in a week is an event.

**Ask for click-level reporting explicitly, in the first conversation.** Many
programmes report conversions only. Without their click number, the most
diagnostic and cheapest check in this list is unavailable, and its absence should
itself be weighed when choosing between programmes.

### b. Conversion-rate stability — free, run weekly

Conversions ÷ our clicks, segmented by retailer, surface and platform.

This is the tag-breakage detector. A step change with no corresponding product
change on our side is a broken pixel until proven otherwise. Segmenting by
platform is what separates ITP cookie loss (iOS only, gradual, worse over the
cookie window) from a dropped tag (all platforms, instant, dated).

### c. Cross-retailer comparison — free once there are two

The same traffic, the same surface, two retailers, wildly different reported
conversion rates. Coverage and delivery zones explain a lot of that legitimately
— `BUSINESS-REVIEW.md` §11's expected-value formula is mostly a list of reasons
two retailers differ. But it is the only check that uses a *live control* rather
than a historical one.

> **This is the strongest structural argument against early exclusivity**, and it
> is stronger than the commercial one. Grant exclusivity and you delete your own
> control group.

### d. Canary orders — real money, run monthly and after any change on their side

A real purchase, through a real link, from a clean device and browser, recording
the click id. Then check that it appears in their reporting with the right
value, the right click id, and the right commission.

**This is the only check that distinguishes underreporting from breakage,** and
it is the only one that produces evidence usable in a conversation rather than a
suspicion. The cost is one basket a month and a note in `RUNBOOK.md`.

Run it: on integration, monthly, after any redesign of their checkout, and
immediately whenever (b) shows a step change. A canary that converts correctly
while the aggregate has collapsed points at a *segment* — one platform, one
surface — and that is a much better bug report than "our numbers are down."

**Do it honestly.** A real purchase of items actually wanted, kept, not returned.
A canary that games the terms is fraud in the other direction and forfeits the
argument it was run to support.

---

## 6. The terms that decide the number, before the rate does

For any programme, direct or networked, these are read **before** the commission
rate, because each can halve the rate's value without changing it.

| Term | Why it decides more than the rate |
|---|---|
| **Attribution window** | Grocery is a considered weekly purchase — `BUSINESS-REVIEW.md` §11 already flags this. A 24-hour cookie loses the Tuesday-sees-it, Saturday-orders conversion, which is the modal case. 30 days is the ask |
| **Server postback vs cookie** | Decides whether the window above is real. A 30-day cookie under ITP is a 7-day cookie |
| **Category exclusions** | **Fresh and perishable are commonly excluded from grocery commissions.** Read this clause first, every time |
| **"New customer" definition** | Email match? household? does a 12-month-lapsed buyer count? Halves a bounty deal silently |
| **Originator credit vs last click** | Whether a coupon extension at checkout takes credit for a customer we produced |
| **Reversal terms** | Grocery has substitutions and refunds. Demand itemised reversals with reasons, never a net figure |
| **Click-level reporting** | Enables §5a. Its absence is a real cost, not a formatting preference |
| **Payment terms and minimum payout** | A threshold above monthly earnings is an indefinite deferral |
| **Audit right** | Quarterly reconciliation against their order records, under NDA. Cheap for an honest partner to grant, which is what makes asking informative |

**Prefer a network to a direct deal for the first integration.** Impact, Rakuten,
ShareASale, CJ, Awin. Not because networks are honest — because the tag is theirs,
the reporting is standardised, click-level data is normal rather than a
concession, and a third party with a reputation is in the room. A direct deal with
a small grocer means trusting a spreadsheet, and `BUSINESS-REVIEW.md` §12's whole
strategy is direct deals — so the networked integration is where the calibration
constants in §5 get established *before* there is a direct relationship to
calibrate against.

**The coupon code is a second, independent channel and worth having anyway.** A
code typed at checkout survives cookie loss, in-app browsers and ad blockers
entirely. It undercounts differently than links do, which is exactly why running
both is informative. `BUSINESS-REVIEW.md` §10 records Quicklly as code-only and
correctly rejects it as a *primary* mechanism — a gap-link funnel cannot depend on
a user typing a code. As a parallel signal it costs nothing.

---

## 7. Recovering the basket, and the pantry that wants it

The pantry is self-reported. What was actually bought is better evidence than
what someone remembered to tick, and `BUSINESS-REVIEW.md` §10 already concedes
the point against us — Northfork and Cooklist build pantries from real purchase
history, and *"their pantry signal is strictly better than self-report, so do not
compete on pantry accuracy."*

The basket is also the **receipt** that `BUSINESS-REVIEW.md` §7 says we never
have, and whose absence forecloses the upper steps of the staircase.

So it is worth wanting. The question is what to ask for.

### The ask that gets declined, and should not be made

> **"Give us an API that returns order contents for an order number."**

Three reasons, and only the third is about their willingness:

1. **It is a customer-data API, not an affiliate API.** Order contents keyed to
   an order number are personal data about their customer, disclosed to a third
   party. That needs a lawful basis, a processing agreement and notice at
   collection. For a storefront with no privacy counsel, *no* is the correct
   answer and asking marks us as someone who has not considered their exposure.
2. **The order number is the wrong key, and the flaw is ours.** Order numbers are
   sequential or guessable. An endpoint keyed on one is an enumeration
   vulnerability — we would be asking them to build a way to dump their order
   book. Order number plus email is barely better; both are knowable. Any
   competent reviewer on their side kills it, correctly.
3. **The long tail cannot build it.** §10's sweep found these retailers do not
   have affiliate programmes. An authenticated order-lookup API is several orders
   of magnitude past that.

**The principle underneath, which generalises:** *the customer is the only party
who can consent to disclosing their own order. The retailer can build a door;
they cannot hand over the room.* Every workable route below is a version of
asking the user rather than the retailer.

### Three routes, ranked by what they cost the partner

| | What it is | Partner cost | Coverage | Personal data crosses? |
|---|---|---|---|---|
| **a** | **Item-level conversion reporting** | A reporting setting | Wherever we have a programme | **No** |
| ~~**b**~~ | ~~User-supplied receipt~~ | ~~Nothing~~ | ~~Every retailer~~ | **Rejected 2026-08-14 — see below** |
| **c** | **OAuth account linking** | A real build | Instacart IDP; never the long tail | Yes, with user consent |

**Only (a) is live.** (b) was the best route on every column in that table and is
refused anyway, on custody grounds; (c) is not available to us. Read the rejection
before the design, because it is what makes the design small.

**a. Item-level conversion reporting — the small ask, and the one to make.**
Several networks already support basket- or SKU-level conversion data; it is the
same mechanism that powers commission-by-category, so it is a granularity setting
rather than an endpoint. Decisively, **it arrives keyed to our click id, not to
their customer id** — so nothing identifying leaves them, no agreement is needed,
and the thing we receive is already joined to the click we recorded in §2.

Verify per programme; do not assume it. It belongs in §6's list of terms to read
before the rate, and its absence is a reason to prefer one programme over another.

Consequence for the product: conversion reporting lags by hours to days. A
basket recovered this way **cannot update the pantry while the shopper is still
in the kitchen.** It is a next-day correction, not a live one.

**b. ~~User-supplied receipt~~ — rejected 2026-08-14, on custody, not on
mechanics.**

The proposal was: the user pastes or forwards their order confirmation email, we
parse it, we fill the pantry. It was the strongest route in the table. It needed
no partner, it worked for **every** retailer including the ones with no
programme — H Mart, 99 Ranch, Amazon — so it was the only route whose coverage
was not gated on `BUSINESS-REVIEW.md` §10's negative result. It was cheap for us
specifically, because `WEEE-SPEC.md`'s `vocabulary.csv` already maps 6,408
catalogue names to canonical nodes.

**Refused anyway, and the reason is the ratio.** A confirmation email carries the
delivery address, the payment tail, the order total and every other line in the
basket. We want three item names. Accepting the document means taking custody of
all of it — and the mitigation ("parse to node ids, keep those, discard the rest")
is a promise that must hold perfectly, forever, in every log, every error report,
every crash dump and every backup, with **no way for the user to check that it
did.**

`PRIVACY-SPEC.md` §2's second gate — *"no free text ever leaves"* — governs
disclosure, and would technically have been satisfied. That is exactly why this
is worth recording: **the gate did not catch it.** The spec's discipline is about
what we disclose, and this was a question about what we hold. A document we never
accept cannot leak, cannot be subpoenaed, cannot be mis-logged, and needs no
promise attached.

> **Rule this leaves behind, and it generalises past receipts: prefer the input
> that carries only what we need over the richer input plus a promise to discard
> the rest.** Custody is a cost even when disclosure is zero.

**The consequence, stated plainly rather than buried.** Dropping (b) makes basket
recovery **entirely dependent on (a)**, and therefore on having a programme with
the retailer at all. `BUSINESS-REVIEW.md` §10's finding was that most Asian
grocers have no programme — so for those retailers the pantry stays self-reported
and there is no route to a basket. That is a real loss of coverage, accepted
knowingly, and it makes the §7a question to Weee! more load-bearing rather than
less: it is now the only door.

`USER-SPEC.md`'s manual pantry remains the fallback everywhere else, which is
what the product does today and works.

**c. OAuth account linking** is the correct form of the rejected ask — the
customer authorises read access to their own history. It is the Cooklist model
already noted in `BUSINESS-REVIEW.md` §10. Realistic through Instacart IDP,
never through a Shopify storefront. Not a v1.

### The design problem, and how it resolves

§4 forbids storing a click id against a user, because a stable per-user subID is
a user identifier disclosed to a partner. But a recovered basket has to reach the
right pantry. Those look contradictory.

**They are not, if the device holds the mapping.**

```
client                          our server                    retailer
──────                          ──────────                    ────────
mints click_id (uuid v4)
stores it LOCALLY               —                             —
follows link with click_id  →   —                         →   sees a random uuid
                                                              and nothing else
                                ← conversion, item-level, keyed on click_id
                                stores click_id → basket
                                (no user id, because it has none)
asks: "baskets for these ids?"
  ← basket contents
merges into the local pantry
```

Nobody in that diagram holds the whole join. The retailer sees an opaque uuid;
we see a uuid and a basket; **only the device knows which uuids are its own.**
`PRIVACY-SPEC.md` §1 holds intact, and this is the same shape as `UX-SPEC.md`
§9's anonymous-first local pantry rather than a new idea.

**The click id becomes a capability token, and that has consequences.** Anyone
presenting it gets the basket, so:

- **Unguessable is now load-bearing, not hygiene.** v4 uuid, from a CSPRNG. §3
  already requires random and single-use; this is why it is not negotiable.
- **Do not put it anywhere it leaks** — not in a `Referer`-exposed path, not in
  logs shipped off-box, not in an error message.
- **It expires.** The lookup window need only outlive the retailer's reporting
  lag plus a margin. After that the mapping is dead weight and a standing risk.
- **A signed-in user syncing pantry state to the server is a separate decision**
  with a separate consent, and it does not change what the *partner* sees. Do not
  let it quietly reintroduce a server-side click id → user link.

### Two honest checks

**Buying is not having.** A recovered line is excellent evidence for the
shelf-stable items that dominate our gaps — bought gochujang, has gochujang for
six months — and wrong about perishables within a fortnight. So it is **evidence
with a shelf life, not a fact**, and the pantry should treat it that way per item
class rather than uniformly.

**And it is the user's pantry.** A basket that silently rewrites inventory is the
app asserting something about a kitchen it cannot see — including that the item
was not a gift, a return, or someone else's order. Surface it as something to
accept, not as a state change that already happened.

**The tension this sharpens, and it is `BUSINESS-REVIEW.md` §12's:** a more
accurate pantry produces a smaller basket, and a smaller basket is a smaller
commission. Basket recovery makes the pantry better and the revenue line worse.
That is the correct direction and it is worth noticing that the incentive points
the other way, because the incentive will still be there when someone is deciding
how hard to work on this.

---

## 8. Order of work

| When | Do | Blocked on |
|---|---|---|
| ~~Now~~ | ~~`outbound_click` + `buyblock_shown`~~ — **shipped 2026-08-15**, with `buyblock_opened` and `list_viewed` beside them | — |
| ~~Now~~ | ~~Click id on the outbound URL~~ — **shipped 2026-08-15**, via `/go` (§3's revision), as `sub_id` pending Weee!'s answer on their subID parameter name | — |
| On first programme | subID mapping; confirm it appears in their reporting | approval |
| First month | Canary order; establish the §5a discrepancy constant | a live tag |
| Weekly, ongoing | §5a and §5b as a `RUNBOOK.md` check | the above |
| Before any direct deal | §6 read in full, in writing | a conversation |
| With the first programme | **Ask whether item-level conversion data is available** — §7a. Now the only route to a basket, since §7b is refused | the same conversation |

**The first two rows are the whole point of this file and neither needs a
partner, a rate, or a reply to an email.** `BUSINESS-REVIEW.md` §3's finding was
that everything built compounds retention while revenue is acquisition-shaped;
this is the cheapest available instrument pointed at the acquisition half, and
until it exists every number in §9 is a band rather than a measurement.

---

## 9. Open questions

- **Where click records are stored.** There is no analytics dependency in the
  app today and adding a third-party one has its own privacy consequences under
  `PRIVACY-SPEC.md`. First-party, own-database is the presumption; not settled.
- **The retention window** for click records (§4).
- **Whether `outbound_click` aggregates are disclosable** under
  `PRIVACY-SPEC.md` §2, and at what `k` (§4 ⚖).
- **Whether the creator affiliate tag** (`claims.ts`, `ClaimPanel.tsx` — a
  creator's own Weee! tag, saved but not yet used) needs a separate click id
  space, or shares this one. It changes who is paid, not who is measured, but
  the reconciliation is per-tag and this has not been thought through.
- **Amazon's `ascsubtag`** allows three subtags and its reporting granularity
  differs from a network's. Whether §5a is even possible on Associates.
- **What a canary order costs in practice** at Weee!'s minimum-order threshold,
  which `WEEE-SPEC.md` notes is our problem again since the §1 correction.
- **Whether Weee!, Instacart or Amazon actually report item-level conversion
  data** (§7a), and at what lag. This is a question for the same email that asks
  for the terms — it costs one line and it decides whether §7's best route exists
  at all.
- **The click-id lookup window** (§7). It must outlive the reporting lag, which
  we do not yet know, so it cannot be set until the answer above is in.
- **How a recovered pantry line decays** (§7). Shelf-stable and perishable
  need different treatment and the pantry has no notion of either today; that is
  a `USER-SPEC.md` question, not this file's.
- ~~Whether receipt parsing reuses the curation path or is its own~~ — **closed
  2026-08-14: receipts are refused entirely** (§7b). The custody argument that
  closed it is worth re-reading before any future feature that asks a user to
  hand over a document rather than a fact.
- **Whether the custody rule from §7b belongs in `PRIVACY-SPEC.md`** rather than
  here. It is a general principle about what we *hold*, and that spec currently
  only governs what we *disclose* — which is precisely why it did not catch this
  one.
- **Whether a signed-in user's pantry sync could reintroduce a server-side
  `click_id → user` link** by accident (§7). It must not, and nothing currently
  prevents it because neither side exists yet.
