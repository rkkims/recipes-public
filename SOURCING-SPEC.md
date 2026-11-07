# Sourcing — where the gap gets bought

How a missing ingredient becomes somewhere a person can actually get it.

Eighth, and it sits under `CHECKOFF-SPEC.md` §3: the checkoff produces a gap, and
this file decides what the gap points at. It does **not** re-open who earns on
that click — `CREATOR-HUB-SPEC.md` §1 already settled that by surface.

Written 2026-08-13.

---

## 0. The rule the whole file turns on

The obvious model is a store with an address. It breaks immediately: the grocers
most likely to stock doenjang include several with **no storefront at all** — a
warehouse, a website, and a delivery van. Nothing in a POI dataset describes
them, and a directory built from Google Places or OpenStreetMap misses them
entirely.

> **A source is a coverage area and a delivery capability. It is not a location.
> A storefront is the special case where coverage is derived from a point.**

Two consequences that shape everything below: coverage is sometimes a radius and
sometimes a set of postal codes, and **"nearest" is frequently the wrong
question.** A national shipper is nowhere and reaches everyone.

---

## 1. Three kinds, and the useful asymmetry

| | coverage | how the list is built |
|---|---|---|
| **Storefront** | radius around a point | POI data — hundreds, machine-assembled |
| **Regional delivery** | postal codes / named zones | **hand-curated — dozens, not hundreds** |
| **National shipper** | everywhere, with §2's caveat | hand-curated |

**The long tail is automatic and the short head is a reviewed file.** That is
convenient rather than coincidental: the sources that are hard to enumerate are
the ones there are few of, and the ones there are many of announce themselves in
public POI data.

`WEEE-SPEC` §9 step 1 already establishes the posture for the curated half —
*"a reviewed file, not a classifier."* Which shelves hold ingredients was a
judgment made once over 212 rows; which grocers deliver to which regions is the
same kind of judgment over a smaller list, and inference would be both more
expensive and less correct.

---

## 2. The second axis: what can actually arrive

Distance is not the binding constraint. **What a source can ship is.**

A national shipper will send gochujang anywhere. It will not cheaply send fresh
perilla leaves, scallions, tofu or fish cake. So `CHECKOFF-SPEC` §3's gap splits
before it is routed:

| gap contains | reachable from |
|---|---|
| jars, dried, fermented, bottled | any shipper — distance irrelevant |
| fresh produce, tofu, fresh noodles | a storefront in range, or a regional delivery service |

> **This is the preservation class doing a second job.** The same distinction
> that decides what decays out of a pantry decides how it can be replaced.

That matters because it costs nothing. `WEEE-SPEC` §5 already treats shelf
structure as evidence of the preservation class — `dried04/Dried-Vegetables` and
`dried06/Dried-Seafood` existing as shelves *is* that class, confirmed by someone
who staked inventory on it. **No new global attribute is required**, which is the
same test the volume→weight question failed in `INGREDIENT-HOME-SPEC` §2c.

---

## 3. What a source row holds

```
source
  id            src_…    opaque, permanent — same rule as ing_/rec_/crt_
  name          text
  kind          'storefront' | 'regional' | 'national'
  coverage      point+radius | [postal codes] | 'national'
  perishables   bool     -- §2: can fresh things arrive from here at all
  affiliate     text?    -- our tag, where a programme exists
  min_order     money?   -- regional and national only
  delivery_days text?    -- regional only; fixed days per zone are the norm
```

`min_order` is not decoration. `DECISIONS` §513's correction is explicit that with
the referral-and-tail model withdrawn, *"the jar is what pays and the threshold is
our problem again"* — a source whose minimum is $35 against a $9 gap is a bad
answer, and we cannot know that without storing the number.

**No price, no stock, no SKU.** `INGREDIENT-SPEC` §4 admits no global attributes,
and `WEEE-SPEC` §7 forbids price, image, stock and a `sold_at_weee` flag by name.
A stale price shown on a partner's behalf is a claim about their business we have
no right to make (`WEEE-SPEC` §8.3), and it is the field that would rot fastest.

---

## 4. A directory, not a partnership

The tempting version is a deal with each grocer. It fails on data before it fails
on effort: **local Asian grocers are the least digitized retail segment there
is** — most have no readable inventory, no SKU feed, no prices online, often no
site. No agreement conjures a catalog, and there is no affiliate infrastructure
at a corner store to attribute a referral through even when one converts.

And hundreds of individually negotiated relationships is a field sales business,
against the one constraint (`BUSINESS-REVIEW` §6) this whole strategy is built to
respect.

**None of that is needed to be useful.** Telling someone *"three Asian grocers
within five miles, here is the nearest"* requires no contract, no inventory and
no conversation. It is also the only thing that helps the person whose gap is
fresh (§2), whom a national shipper cannot serve at all.

**Sequencing, and it is the point of building the cheap half first.** The
directory becomes the asset that makes any future relationship possible, because
it reveals **which sources our users cluster around** — demand density per store.
That is the only thing a grocer would actually pay attention to, and it is the
same asset being accumulated everywhere else. Approach a source when the data
says there is density, never before.

---

## 5. Where it appears

Only where a gap already exists. This is not a browsable store finder.

- **`CHECKOFF-SPEC` §3's gap**, per recipe and on the merged list
- **`DECISIONS` §8's zero-result path** — *"add gochugaru ($4) and you get 6
  options"* — which that spec calls the highest-intent moment in the product

Unchanged by this file: **which tag fires** (`CREATOR-HUB-SPEC` §1, by surface),
and that we link **the gap, not the list** (`DECISIONS` §8 — linking everything
reads as an affiliate farm).

**Location is optional, coarse, and asked for only when it would change the
answer.** Postal code or city, never precise coordinates; a radius needs nothing
finer. `PRIVACY-SPEC` governs, and a user who declines still gets every national
source — which is most of the shelf-stable gap.

---

## 6. Never rank sources by what they pay

> **The order we show sources in is what serves the person's gap — proximity,
> whether perishables can arrive, and the minimum against the basket. Never
> commission.**

The same hard rule as `CREATOR-HUB-SPEC` §5's *"the linked product always matches
what they specified, never the better-paying neighbour"*, extended from products
to sources. Multiple affiliate programmes create exactly this temptation and it
is the one thing that would destroy the position permanently.

`WEEE-SPEC` §8's posture generalises too: **every source is a counterparty, not a
corpus.** If one asks us to stop listing them, stop.

---

## 7. What this deliberately does not do

- **No SKU mapping, and no grocer-facing mapping UI.** `WEEE-SPEC` §6 settles the
  requirement as *ingredient → a plausible landing URL*, never ingredient → SKU,
  and lists SKU selection, price, stock and basket construction as **not needed**.
  A grocer has no incentive to do data entry for us — the same objection
  `DECISIONS` §1137 raises about the on-page widget, worse because it is typing
  rather than installing. A *correction* UI, over a catalog we mapped ourselves,
  is a different and much later question (§8).
- **No inventory, availability or "in stock" claim**, ever (§3).
- **No delivery fee modelling.** `min_order` is the one commercial number we hold.
- **No precise location** (§5).
- **No store finder as a destination.** Sourcing answers a gap; it is not a tab.
- **No paid placement.** §6.

---

## 8. Open questions

- **Which sources beyond Weee!, and do their programmes exist?** The plausible
  short head — H Mart delivery, Umamicart, Yamibuy, Chowbus, Kim'C Market and a
  handful of regional services — is unresearched, and `DECISIONS` §11's Weee!
  terms are still unread. That email answers the shape of the question for all of
  them.
- **What builds the storefront half?** Google Places is licensed and its terms
  restrict storage; OpenStreetMap is free and thinner on exactly this category.
  Undecided, and it decides whether the long tail is really automatic.
- **How is coverage kept true?** A regional grocer's delivery zone changes and
  nothing tells us. A wrong zone is worse than an absent source, because it sends
  someone to a checkout that refuses them.
- **Does a national shipper's minimum make it useless for a two-item gap?** §3
  stores `min_order` so the question is answerable, and the answer is probably
  "usually" — which would mean the shelf-stable gap is mostly served by whichever
  storefront is in range after all, and the national tier matters less than it
  looks.
- **Is a grocer correction UI ever worth building?** Only behind traffic, and only
  over a catalog we mapped first. Same sequencing as creators: correct, never
  create.
- **Does source density belong in the region probe?** `DECISIONS` §11's GeoLite2
  item measures where visitors are. Overlaying where sources are would say which
  regions the product can actually serve — a better focus signal than visitor
  counts alone, and free once both halves exist.
