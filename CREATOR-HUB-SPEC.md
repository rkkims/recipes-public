# Creator hub — surface and money spec

Where a creator's tag actually fires, and what we give them in return for the one
annotation only they can make.

Fifth alongside `INGREDIENT-SPEC.md`, `RECIPE-SPEC.md`, `USER-SPEC.md` and
`CREATOR-SPEC.md`, and it extends rather than replaces them: the entity is still
the Creator that `CREATOR-SPEC` defines, the tag is still `creator.affiliate_tag`,
and the resolution order is still `DECISIONS` §8's three tiers. What is new is
**which screens exist, which tag wins on each, and what a creator is actually
being offered.**

Written 2026-08-12, after reading the competitive field for the first time (§4).

---

## 0. The defect this exists to fix

`DECISIONS` §8 ships **tier 2 only** — *"creator tag across their recipes"* — and
scopes it:

> **Scope rule:** creator links apply only inside *their* recipe context. On
> rescue landing pages and general matching, our tag always wins.

That rule names two surfaces. The product has a third, and it is the one that
matters:

> **§513 puts the CTA beside the grocery list. The grocery list is merged across
> every planned recipe, so it has no single recipe context — and "inside their
> recipe" is therefore undefined at the exact moment money changes hands.**

Follow it through. A user plans five recipes from five creators, the missing
items merge into one list, they tap the one CTA in the product, and last click
takes the basket. Under the current design the creator's tag resolves on a screen
with no checkout, and the screen with the checkout resolves to nobody in
particular.

**So tier 2 is decorative as specified.** `creator.affiliate_tag` exists in
`CREATOR-SPEC` §1, the resolver has a branch for it, and in the built product it
would never fire. That is not a rounding error in the offer — it *is* the offer,
and §8 calls it *"a real offer, not a token."*

This spec adds the missing surface and states the rule that decides all three.

---

## 1. Three surfaces, one rule

> **Attribution follows whose audience it is.** Traffic a creator sent earns the
> creator. Traffic we generated earns us.

| Surface | Scope of the gap | Tag | Why |
|---|---|---|---|
| **Shop this recipe** | items missing for *this* recipe | creator's, tier 2 | their recipe, usually their visitor |
| **Shop my list** | items missing across the plan | ours | our planner merged it; no creator made this basket |
| Rescue pages, general matching | as today | ours | `DECISIONS` §8, unchanged |

Only the first row is new. The second makes explicit what §8 left undefined
rather than changing it, and the third is quoted so nobody re-opens it.

**Both gap surfaces stay gap-scoped.** `DECISIONS` §8 is emphatic that we link
*the gap* — the two items actually missing — because *"linking everything reads
as an affiliate farm and costs them trust,"* and because the commission is then
incremental rather than cannibalised. A "shop this recipe" button that lists all
twelve ingredients is the affiliate farm that rule exists to prevent. It requires
pantry state, exactly as the merged list does.

**Last click still wins and we say so.** A user who taps a creator's recipe link
and later checks out from the merged list hands the basket to our tag. That is
how the rail works everywhere and we do not control it. Tell creators plainly in
the same sentence that offers the tag; a discovered asterisk costs more than the
disclosure ever will.

**No per-item attribution.** `WEEE-SPEC` §7 forbids a per-SKU mapping on a recipe
or pantry row, and `DECISIONS` §513 — as corrected — keeps *"don't build per-item
attribution"* standing as a cost judgement rather than a consequence of a comp
plan that turned out not to exist. This spec is compatible: it splits by
**surface**, which is a routing decision, not by line item, which is an
accounting system.

---

## 2. The creator page, and what it is for

`CREATOR-SPEC` §8 leaves open whether creators get a public page before they
claim. Two things settled since force the answer.

**First, tier 2 needs somewhere to fire that is not a recipe we happened to
crawl.** A page that collects a creator's recipes is the second surface where
their tag resolves, and the only one they can point their own audience at.

**Second, it is the thing the field does not offer (§4).** A social-first creator
has nowhere durable to put an ingredient list, and no way to group their videos
by topic at all — see `INGREDIENT-HOME-SPEC` §1 for the platform-by-platform
measurement.

> **The offer is a free ingredient home for creators who never wanted a blog.**

**Never a recipe home.** `INGREDIENT-HOME-SPEC` §0 is the governing rule and the
distinction is not cosmetic: a cook who finishes on our page without watching is
a creator losing views, so the method stays in the video. That spec supersedes
this section on everything the page contains; what follows is only its relation
to the tag.

Shape, and the constraints are all inherited:

- **Their recipes, their name, their tag** — a `/creators/<handle>` index over
  recipes already in the corpus. Ingredient lists only; `CONTRIBUTION-SPEC` §3
  and `RECIPE-SPEC` §1 forbid the method here as everywhere, and `canonical`
  still points at the source.
- **One row in their existing Linktree, not a replacement for it** (§6).
- **Subject to the thin-content guard** (`UX-SPEC` §10) and to `CREATOR-SPEC`
  §7's floor `k` for anything with a number on it.
- **Withdrawal takes it down**, `CREATOR-SPEC` §6, unchanged.

**Pre-claim, the page exists but shows no counts.** `CREATOR-SPEC` §7 already
forbids displaying counts before volume — *"an empty dashboard is a worse pitch
than no dashboard"* — and §2's *"a creator row is a fact about our corpus"* is
what makes an unclaimed page defensible at all.

---

## 3. Compensation, not representation — a correction to `CONTRIBUTION-SPEC` §6

`CONTRIBUTION-SPEC` §6 states the motive as a fact about demand plus *"a small
itch about misrepresentation,"* and cites Discogs, IMDb and Genius. That claim is
weaker than it reads, and §4's evidence is why.

| Player | Got creators by | Result |
|---|---|---|
| Chicory | paying them on a site they already own | ~5,200 publishers |
| Samsung Food | paying **and** hosting **and** a hardware brand | 130+, all 200k followers and up |
| ReciMe | not engaging creators at all | ~10M installs, no creator relationship |

**Nobody has recruited food creators on representation alone.** And the ReciMe
line is the sharp one: recipes are being saved at that scale today, and creators
have neither mobilised to correct them nor mobilised against it. The itch does
not appear to exist at volume.

The Discogs analogy fails for a reason worth recording: **those contributors are
fans of the work, and a food creator is the commercial rights-holder.** A fan
annotating a discography is doing a hobby. A creator annotating a recipe is doing
unpaid work on their own inventory.

**This cuts in our favour once, and against us twice.** In our favour: the
scraper-backlash risk is lower than `CONTRIBUTION-SPEC` §3 and `CREATOR-SPEC` §6
assume, because that battle is largely over. Against us: the representation
motive is weak, and the loop's creator step was resting on it.

> **Revision: the demand signal and the money rail ship together, or neither
> works.** §6's sentence is still the right *opening* — it is a fact, it is free,
> and it needs no scale. It is not sufficient as the whole offer.

What does not change: **we still never pay cash.** `DECISIONS` §8 and
`CREATOR-SPEC` §4 both refuse payout infrastructure, and §1107 records why —
*"$5–12/mo per creator reads as insulting."* Samsung confirms the ceiling from
the other side: ~$1,000–1,500/month for a creator with a million followers, which
is less than one brand deal. **Cash was never the lever even for the company that
could afford it.**

> **We provide machinery, not compensation. Their upside is uncapped precisely
> because we are not the one paying it.**

---

## 4. What the field shows

Read once, 2026-08-12. Recorded because every decision above rests on it, and
because none of it was known when `DECISIONS` §8 was written.

**The consumer side is taken, and the leader has forfeited the loop.** ReciMe
does the `CONTRIBUTION-SPEC` paste flow — share-sheet import from Instagram,
TikTok, YouTube, Pinterest — with grocery lists and meal plans, on a freemium
subscription at ~$39.99/year. Their copyright position is that saved recipes are
**private by default, with no public library**, which is a real defence and costs
them everything interesting: no public page, no demand count, nothing to show a
creator. *They cannot run our loop, and their business does not require them to.*

**Creator monetisation exists and is wired to websites.** Chicory is our
ingredient hub already built — a WordPress plugin, cart-to-retailer, blogger
takes ad revenue plus affiliate. Instacart's developer platform does it at
platform scale with Tasty and Hearst. **Both need a site.** A creator who only
ever posted Reels is unreachable by either.

**Samsung fenced off the segment we would want.** The Creator Fund pays $0.15 per
signed-in recipe view and $0.50 per *Made It*, requires 200k+ followers, is
invite-only, and drops creators earning under $250/month. That floor is
arithmetic, not snobbery — per-view economics cannot carry the mid-tail.

Two consequences:

- **The mid-tail, social-first Asian food creator is unserved by all four, structurally.** That is the opening, and it is the only one.
- **Samsung prices a cook above three views.** Independent confirmation that `CONTRIBUTION-SPEC` §0a is right to measure `cook_event` rather than saves.

**Chicory de-risks the mechanic.** ~5,200 publishers already monetise
ingredient-level links. We are not inventing a behaviour, we are porting a proven
one to a surface it cannot reach.

---

## 5. Our revenue and creator adoption are in conflict, and the split is deliberate

Every creator who seeds a tag removes our revenue from their recipes. Perfect
adoption earns us nothing. This is not a flaw to engineer around; it is what
*"we give away the part that isn't the growth engine"* (`DECISIONS` §8) means when
stated as arithmetic.

> **The unclaimed corpus is the revenue engine. Claimed creators are the growth
> engine. Neither is asked to be the other.**

| | pays | grows |
|---|---|---|
| 4,874 crawled recipes, no claim | our tag, indefinitely | no |
| rescue pages, general matching | our tag (`DECISIONS` §8 scope rule) | no |
| claimed creator, own tag | nothing to us | audience, freshness, annotation |

The 4,874 recipes we sourced ourselves keep our tag forever, and nothing about
creator adoption touches them. So the honest internal statement is that **creator
recruitment is a customer-acquisition cost paid in forgone commission**, which is
the cheapest acquisition available to us and the only one `DECISIONS` §1107
permits.

**Do not let this leak into the offer.** The temptation the default creates is to
point a link at whatever pays best rather than at what the creator specified.
`WEEE-SPEC` §8.3 already refuses stale prices on a partner's behalf; the same
posture applies here, and harder:

> **The linked product always matches the ingredient as annotated. Never the
> better-paying neighbour.**

---

## 6. What the hub is not

**Not a link-in-bio product.** Considered and rejected. The bio link is
load-bearing infrastructure for a creator, so switching costs are high and the
saving is $8/month against products with years of analytics, email capture and
payments. Substituting for one would also mean hosting their merch, newsletter
and sponsor links — everything except the thing we are good at.

**We want one row inside their Linktree, not the Linktree.** Same branded
exposure, same inflow, no switching cost, no feature race, and it points at the
surface where their tag fires (§1).

**Bio-link traffic is visitors, not residents**, and `CONTRIBUTION-SPEC` §0a is
explicit that the loop runs on returning users. Treat inflow from a creator page
as reach, and expect the cook-quality gate to do the retention work as it does
for every other channel.

---

## 7. The ask stays small, and it is a correction

Unchanged from `CREATOR-SPEC` §4 — *"the one ask on claim is: confirm the
ingredient list"* — and restated here because §3 changes the pitch around it.

- **Parse before contact.** The page exists and is already slightly wrong. The
  ask is *"three of these eleven lines are unresolved"*, not *"annotate your
  recipes."* `CONTRIBUTION-SPEC` §4's unresolved-line UI is the same surface.
- **Value precedes the ask.** The demand fact arrives first and asks for nothing
  (`CONTRIBUTION-SPEC` §6, rate-limited).
- **Corrections compound.** Every confirmation improves the parser's test set, so
  the next creator's page is more accurate and the next ask is smaller.
- **Never the ontology.** `CREATOR-SPEC` §4 — *"do not ask creators to annotate
  the graph."* A confirmation writes `recipe.requires` and nothing else.

---

## 8. Terms we still have not read

`DECISIONS` §11 has carried *"Weee! affiliate terms to verify"* for months, and
recorded that the $20 / two-delivery / 6% / 6-month structure turned out to be
the consumer **refer-a-friend** programme rather than the affiliate one.

**New evidence, 2026-08-12, and it is still not the agreement.** Weee!'s
programme appears on FlexOffers — an affiliate network listing, which is a
different class of evidence than the consumer referral page — at **~6%
commission with a 48-hour cookie**. One directory instead reports a flat $5 per
sale. Weee!'s own affiliate page did not render for us.

So the state is: *probably a per-order commission, probably around 6%, cookie
probably short.* Three consequences, and only the third is safe to act on:

1. **The jar pays**, as §513's correction already concluded. Nothing here revives
   the referral-and-tail model.
2. **A 48-hour cookie suits this product** better than it suits a blog — planning
   and ordering happen in one session — but it makes §1's last-click caveat
   sharper, not softer.
3. **Whether a hub arrangement is permitted at all is unread.** Networks
   frequently restrict sub-affiliate structures. Our design needs no
   redistribution — creators use their own tag and we use ours, never a split —
   which is likely to be the compliant shape by accident. Confirm it anyway.

**One email still answers this**, to `affiliate@sayweee.com`, and `WEEE-SPEC`
§8.1's product-feed question belongs in the same message.

---

## 9. What this deliberately does not do

- **No revenue share, no payouts, no 1099s.** `DECISIONS` §8 and §1107,
  unchanged. The override is the entire compensation mechanism.
- **No per-item or per-SKU attribution** (§1, `WEEE-SPEC` §7).
- **No cash to creators**, and no per-view fund. §3 explains why the ceiling
  makes it pointless rather than merely unaffordable.
- **No method, anywhere on a creator page.** `CONTRIBUTION-SPEC` §3.
- **No follower counts or platform metrics.** `CREATOR-SPEC` §4 — rented numbers.
  Anything we show a creator is computed from `user_recipe` and `cook_event`.
- **No third-party JavaScript on a creator's own site.** `DECISIONS` §1137's
  widget stays dropped; the install ask is still the hardest thing on the list.
- **No link-in-bio product** (§6).

---

## 10. Open questions

- **Does the "shop this recipe" gap CTA cannibalise the merged list?** Both are
  gap-scoped, so a user who shops per-recipe never reaches the planner's basket —
  which is the surface that pays us. The split in §5 assumes the two audiences
  barely overlap, and that is an assumption, not a measurement. It is the first
  thing to instrument once either surface exists.
- **Does an unclaimed creator's tag ever fire?** Carried unchanged from
  `CREATOR-SPEC` §8. A blogger publishing an Amazon tag on their own page has not
  agreed to ours, and the plausible answer is still no.
- **What does a creator actually see, and is it above `k`?** §3 sells a metric no
  platform gives them — pantry adds, first-time purchases, substitution rates —
  and `CREATOR-SPEC` §7's floor plus current volume means most of it is
  unpublishable for a long time. Which single number crosses `k` first is
  unknown, and it decides what the first outreach can honestly contain.
- **Is a creator page a claim surface or an acquisition surface?** If it must be
  live pre-claim to be findable, it inherits `UX-SPEC` §10's thin-content guard
  at exactly the coverage level where a creator has the fewest recipes.
- **Does the mid-tail creator want any of this?** §4 establishes they are
  unserved. It does not establish demand, and `DECISIONS` §11's rule against
  surveying creators means the instrumented flow is the only test we have
  permitted ourselves.
- **What happens when two creators publish the same recipe?** The scope rule
  resolves per recipe context, and `CONTRIBUTION-SPEC` §2's canonicalisation
  gives one row — so a genuine duplicate across two creators has one tag and one
  loser. Not yet observed; worth answering before it is.
