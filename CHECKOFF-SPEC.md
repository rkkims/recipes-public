# The per-recipe checkoff — the cook-side conversion surface

How a stranger who came to see one video acquires a pantry without being asked
for one.

Seventh, and the smallest. It specifies one interaction on a page that already
exists. It is filed separately from `INGREDIENT-HOME-SPEC.md` because it runs on
**every** recipe page — crawled, user-added and creator — and not only on a
creator's.

Written 2026-08-12.

---

## 0. The asymmetry this exists to fix

`CONTRIBUTION-SPEC` §0a establishes the gate for the supply side:

> *"Nobody pastes a URL into a product they are not already invested in."*

The same arithmetic runs on the demand side and is currently unanswered. A
visitor arriving from a creator's link has **zero** investment, and the product's
core feature asks them to build a pantry — an inventory task, offered at the
moment of least investment, before anything has been demonstrated.

`DECISIONS` §5 already names this *"the #1 risk"* and gives the rule that solves
it. This spec is that rule applied at the one moment that decides whether a
visitor becomes a resident.

> **Do not ask for a pantry. Ask what they have for the recipe they are already
> holding — and build the pantry out of the answer.**

Eleven lines, bounded, obviously in their own interest, and answerable. "What is
in your kitchen" is none of those things.

---

## 1. The ingredient list *is* the interaction

There is no widget, no wizard and no onboarding step. **The ingredient list
renders as checkboxes.**

That is the whole design, and it is the reason it needs no explanation: a cook
reading a recipe and mentally ticking off what is in the fridge is the behaviour
this replaces. We are not teaching an interaction, we are recording one that
already happens.

Consequences that follow from it being the list rather than a layer on the list:

- **No entry point to find.** Nothing to tap first, no "get started".
- **Scoped by construction.** The list cannot ask about anything the recipe does
  not use. There is no version of this that grows into a 200-item inventory
  screen, because the recipe bounds it.
- **It works on every recipe page**, including a partly-annotated one —
  `CONTRIBUTION-SPEC` §4's unresolved lines simply are not checkable, and are
  shown as unresolved exactly as they are today.

---

## 2. Never a blank field — the starter list does the real work

`DECISIONS` §5: *"never show a blank field. Always show a guess to correct."*

**Staples arrive pre-checked.** `DECISIONS` §11's ~12 hand-picked starter items
are the seed — salt, oil, soy sauce, garlic, sugar and their neighbours — so a
typical eleven-line recipe presents as five or six real decisions, not eleven.

This is the difference between a chore and a glance, and it is measurable:
§11 already requires instrumenting **first-run uncheck rates** from day one, and
this surface is where that number is generated.

**The starter list is a guess and must read as one.** Pre-checked items are
visibly pre-checked, never silently assumed, or the first wrong one costs trust
on a screen that has not yet earned any.

---

## 3. What comes back, and it must be immediate

The payoff cannot be deferred to a next screen or a signup. Two things, in this
order:

| | |
|---|---|
| **the gap** | *"You need 2 things"* → `CREATOR-HUB-SPEC` §1's **shop this recipe** surface, on the creator's tag |
| **the return** | *"You can already make 3 other things"* → `INGREDIENT-HOME-SPEC` §3, **creator-scoped first** |

The second is the conversion. It is the first evidence the visitor has that the
product does something a recipe page does not, and it arrives seconds after an
action they wanted to take anyway.

> **One interaction pays three parties.** The creator earns on the gap and gets
> views on their back catalogue; the cook learns what to buy and what else they
> can make; we acquire a pantry. Nothing here is extracted from anyone.

**The gap is the gap, never the list.** `DECISIONS` §8 — we link the two items
actually missing, because *"linking everything reads as an affiliate farm and
costs them trust."* The checkoff is what makes that possible: without pantry
state there is no gap, only a shopping list of everything.

---

## 4. No account, and no signup wall

`USER-SPEC` §2 already makes an anonymous user a real row with real saves. That
decision is what lets this surface work at all.

- **Checking a box creates nothing the user must consent to.** No email, no
  interstitial, no "sign up to save your pantry."
- **The account ask comes when there is something to lose** — a second visit, or
  a pantry large enough that losing it would sting. Not on the first check, and
  never between the checkoff and §3's payoff.
- Membership stays private (`USER-SPEC` §1); aggregates only above `RECIPE-SPEC`
  §9's floor `k`, under `PRIVACY-SPEC`.

**The cost of this is real and accepted:** anonymous rows make counts inflatable,
which `CONTRIBUTION-SPEC` §9 already has open. Gating the checkoff behind an
account would trade the entire conversion surface for a spam mitigation, which is
the wrong trade at this stage.

---

## 5. What a check writes

```
checked    → user_ingredient row
unchecked  → no row
```

Plain, and deliberately without nuance. *"I have this"* and *"this is in my
pantry"* are the same claim for a first-time user, and distinguishing them costs
a screen to win a distinction nobody asked for.

**No quantity, ever.** `INGREDIENT-SPEC` §2 keeps `portion` *"recorded and never
matched on"*, and `DECISIONS` §8's set optimiser is deliberately **volume-free**.
A checkbox is the correct fidelity and also the only one those decisions permit.

**No brand at this moment.** `brand` lives on `user_ingredient` and is a later,
optional fact. Asking for it here converts a glance back into a form.

**An unresolved line is not checkable** and does not silently become a
`user_vocabulary` entry (`INGREDIENT-SPEC` §5). Resolving it is the user's
existing correction path (`CONTRIBUTION-SPEC` §3), not a side effect of ticking.

---

## 6. The zero-result path is the one that matters

The good case takes care of itself. The case that decides whether this works is:
they check six boxes and we have nothing to show them.

`DECISIONS` §8 already has the pattern and it should be reused verbatim rather
than reinvented:

> *"Nothing you can make with the cabbage right now. Add gochugaru ($4) and you
> get 6 options."*

**It is also the highest-intent affiliate moment in the product, and it only
exists because the match failed.** Which is the argument for treating this path
as primary rather than as degradation.

**And it is where we lose people silently.** A visitor who checks six boxes,
sees nothing, and leaves does not complain — they were never invested enough to.
`cook_event` and the funnel below are the only way that failure is ever visible.

---

## 7. This surface is the measurement instrument for the core gate

`CONTRIBUTION-SPEC` §0a sets the gate that everything else depends on:

> *"Does a realistic pantry — eight or ten things a Korean-American household
> actually has — produce a match somebody would cook tonight."*

That question has so far been asked against imagined pantries. **The checkoff
produces real ones**, and it is the cheapest honest test of the claim the whole
product rests on.

Four numbers, and they are the point of building it early:

| | what it tells us |
|---|---|
| checkoff completion rate | whether the ask is as small as we think |
| uncheck rate per starter item | `DECISIONS` §11's open item, answered from data |
| §3 return: recipes surfaced per completed checkoff | **the gate itself** |
| `cook_event` following a checkoff | whether the match was any good — `RECIPE-SPEC` §4 |

The fourth is the only one that counts as evidence. A save is an intention;
`CONTRIBUTION-SPEC` §0a is explicit that stickiness claims are made against
cook events or not at all.

---

## 8. What this deliberately does not do

- **No signup wall, and no email capture on this screen** (§4).
- **No pantry-building onboarding, no empty-state wizard, no "add 20 items to
  get started."** The recipe bounds the list (§1).
- **No quantities, no units, no brands** (§5).
- **No expansion beyond the recipe's own ingredients.** Never *"while you're
  here, do you also have…"*
- **No writes to the ontology.** `CREATOR-SPEC` §4 and `CONTRIBUTION-SPEC` §3,
  unchanged.
- **No public display of anyone's checkoff.** Membership is private
  (`USER-SPEC` §1); only aggregates above `k` are ever shown, including to
  creators (`CREATOR-SPEC` §7).
- **No deferral of §3's payoff to a second screen.**

---

## 9. Open questions

- **Does unchecking mean "I don't have it" or "I need more"?** §5 takes the plain
  reading. The other reading exists — someone with an empty gochujang tub — and
  it is the same distinction `DECISIONS` §3 declined to compute as urgency. Left
  plain until a user complains, which they may never do (§6).
- **Does the starter list vary by recipe or by user?** Pre-checking soy sauce on
  a Korean recipe is safer than on a Mexican one, and `DECISIONS` §11 treats the
  list as one hand-picked set. A cuisine-scoped list is obvious and unmeasured.
- **When exactly does the account ask fire?** §4 says "when there is something to
  lose" and that is not a threshold. Interacts with `DECISIONS` §11's still-open
  notification-channel item, which needs an account to deliver anything.
- **Does a checkoff on one recipe leak wrong assumptions into the next?** Ticking
  *sesame oil* here should persist, but a stale pantry silently degrades every
  future match, and `DECISIONS` §11's staleness-nudge interval is still open.
  This surface is what fills the pantry, so it is also what will age.
- **Does the anonymous pantry survive a device change, and what do we promise?**
  Saying nothing is honest and loses pantries; promising persistence requires the
  account §4 defers.
- **What is a good §3 return?** *"You can make 3 other things"* is a payoff.
  *"You can make 1"* may be worse than silence, the same floor question
  `INGREDIENT-HOME-SPEC` §8 has open for recirculation, and probably the same
  number.
