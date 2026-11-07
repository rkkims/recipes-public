# UX Spec

The interaction layer. `DECISIONS.md` says *what* the system does; this says *how it feels*.

**Why this file exists separately:** the stated differentiator is not the recommender — it's *how little effort it takes to add an ingredient*. Every failed pantry app had a working recommender. None of them made inventory painless. So the interaction details below are product substance, not polish, and they are gated accordingly.

**Design constraint above all others: mobile web, one thumb, standing in front of an open fridge.**

---

## 1. The prime directive

> Adding an ingredient must never feel like data entry.

Three consequences, each of which is a hard requirement:

1. **Add is always reachable.** A persistent add-ingredient affordance on *every* page. People remember what's in the fridge at random moments — mid-scroll, mid-recipe, mid-list. If they have to navigate to the pantry to record it, they won't.
2. **Add is one gesture from anywhere an ingredient name appears.** Recipe ingredient lists, search results, SEO pages, substitution notes.
3. **Typing is the fallback, never the primary path.** Autocomplete from the first character, ranked by ontology frequency then by the user's own history.

---

## 2. Gesture vocabulary

Fixed and global. The same gesture means the same thing everywhere.

| Gesture | Context | Action |
|---|---|---|
| **Tap** | Any ingredient, anywhere | Open the state widget (below) |

### The state widget

**Superseded the gesture vocabulary** — double-tap to add, swipe to remove,
long-press to move. Reviewer's call; see `INGREDIENT-SPEC.md` §2.

One tap on an ingredient — in the pantry, in the grocery list, or in a recipe's
ingredient list — opens the same small widget:

```
   ┌──────────────────────────┐
   │  Gochujang               │
   │  ▢ In pantry             │
   │  ▢ On grocery list       │
   │  ▢ Use first             │
   └──────────────────────────┘
```

Why this beats the gestures, on the gestures' own terms:

- **One control, learned once, identical everywhere.** The gestures meant
  different things in different sections, so the pantry and a recipe taught
  different vocabularies.
- **State is visible before it changes.** A toggle shows what is currently true;
  a swipe cannot, so a user had no way to tell whether something was already
  pinned.
- **Pantry and list are both reachable in one interaction.** They are independent
  flags now (`INGREDIENT-SPEC.md` §2) — you can have soy sauce and still need
  more. Long-press *moved*, so recording one destroyed the other.

The cost is one tap versus a double-tap for the commonest action. Acceptable
only because add-from-recipe stays a single tap on the widget: the claim this
file opens with is that adding must be effortless, and one tap still is.

**No drag-and-drop.** Reversed from the earlier sketch. It is unreliable on mobile web inside a scrolling container, has no discoverable affordance, and is inaccessible. The state widget covers the same intent with a visible control.

**Every gesture needs a visible fallback control**, because gestures are undiscoverable by definition. First-time users get a one-off coach mark; the tap-menu always contains every action the gestures perform.

**Double-tap risk to watch:** it can conflict with browser zoom on some mobile targets, and it has no visual affordance at all. If it tests badly, the fallback is single-tap-to-add on recipe ingredient chips with an explicit "+" glyph — the double-tap is worth trying first, but it is not worth defending.

---

## 3. Pantry

Always visible, never a separate destination you have to go "manage."

**Two sections only** — there are no ingredient tiers (DECISIONS §3):

| Section | Contents |
|---|---|
| **Use first** | User-pinned. Drives matching (DECISIONS §4) |
| **Everything else** | Flat list, most-recently-added first |

**"Use first" is the whole urgency mechanism, not a convenience.** There is no computed shelf life and no purchase date (DECISIONS §3), so the user pinning an item *is* the only urgency signal in the system. That raises the bar on this interaction: pinning has to be one tap from the pantry chip, and the shelf has to be visible without scrolling. If nobody pins, ranking degrades to plain "what can I make."

Hard filter at one pinned item, soft boost at two or more.

**Sort order is recency, not urgency** — we don't know what's dying. Recency is honest and happens to correlate: you added it because you just bought it or just noticed it.

**No ingredient photography.** Existing pantry apps sink effort here. Text chips are faster to scan, faster to load, and infinitely easier to extend to a new cuisine.

This is a rule about *ingredients*, not about images generally. Recipe thumbnails do appear, in the grid and the modal (`RECIPE-SPEC.md` §1a) — a user choosing between twenty near-identical stews is choosing on the picture, and there is no text chip that substitutes for that. The distinction is that a thumbnail comes free with the source and carries real information about the dish, whereas an ingredient photo is effort we would have to spend ourselves to tell someone what gochujang looks like.

---


### The pantry is walked too (DRAFT)

The grocery list groups by aisle (§4d) and the pantry does not — it is a chip
cloud in insertion order, and the comment in `PantryDrawer` says why: *"the
pantry is not walked, and a field nothing reads is a field that goes stale."*

That was right when the pantry held twelve starter items and wrong once it holds
sixty. A cloud stops being scannable somewhere around thirty, and the question
asked of a pantry — *"do I have anything in the way of vegetables?"*, *"what
sauces am I sitting on?"* — is the same shape as the question asked of a list.
The kitchen is walked as well: fridge, cupboard, freezer.

So the pantry uses the same grouping, from the same `kind`. Not a second
taxonomy: one function, `aisleOf`, and if it is wrong for eggplant it is wrong in
both places at once, which is how it gets fixed rather than forked.

**`kind` therefore ships for pantry rows too**, and the comment saying it is
list-only comes out with it.

**Open question**

- **Does the pantry want the same aisle ORDER?** A shop is walked produce-first;
  a kitchen is not obviously walked in any order at all. Shipped with the same
  order, on the grounds that one order is easier to unlearn than two.


---

## 4. Grocery list

A persistent first-class list, not a transient cart.

- Populated from recipe gaps, "one ingredient away," and manual adds
- The state widget moves an item into the pantry once bought — tick "In pantry",
  untick "On grocery list". Both in one place, because they are independent flags
- **This is the ONLY place the Weee! affiliate lives** — a list accumulates into
  a real basket, which is the natural conversion moment

**One surface, and it is this one.** Reverses "inside the modal only, never on
the results grid" (§5): the links are now on the grocery list panel and nowhere
else — not the grid, not the recipe modal, and not at the moment something is
added to the list from a recipe or from the pantry.

The modal is where a cook decides what to make; a row of shopping links under the
ingredients answers a question they have not asked yet. On the list, the same
links are the answer to the question the panel exists for. It also means one rule
to reason about when a second affiliate arrives, rather than a rule per screen.

**A list entry carries more than a pantry entry** (`INGREDIENT-SPEC.md` §2):
**brand**, **portion to buy**, and **buy instead of**. All optional, all free
text except the last.

These are shopping intent, not inventory. That distinction is what lets
`portion` exist at all after DECISIONS §3 killed quantity tracking: a quantity
in the pantry decays invisibly the moment you cook half of it, while a shopping
portion is written when the item goes on the list and dies when it comes off. It
is never read after the shop, so it cannot go stale.

**"Buy instead of" is worth more than it looks.** A user recording that they buy
serrano in place of cheongyang is telling us something our global substitution
table cannot know — what their shop actually stocks. It feeds matching at full
strength for that user, not at the discount a generic substitution carries.

---

## 4a. The grocery list and the calendar are one fact

Read from either end:

- **the list needs the calendar.** Planning three dinners is a shopping
  decision, and a list that does not know what you planned makes you work it out
  recipe by recipe. "For your meal plan" names each missing ingredient once,
  with the meals waiting on it — an ingredient three dinners want is the one you
  must not come home without.
- **the calendar needs the list.** A planned meal you cannot cook yet is a
  different thing from one you can, so a square reads *"3 away · 2 on list"*
  while there is still time to do something about it.

**Nothing is added automatically.** The needs are shown, one tap adds each. A
list that fills itself from your calendar is a list you stop trusting, and the
first thing you would do is stop reading it.

**Only upcoming, uncooked plans count.** A past plan that never became a cook is
a dinner that did not happen, not a shopping need — putting its ingredients on
the list would have you buying for last Tuesday. It stays on the calendar, since
deleting the user's own intention is not ours to do.

Both sides are computed, never stored. A saved "shopping list for the week"
would be wrong the moment you bought something, and the pantry already knows.

---

## 4b. Nothing reaches the grocery list unreviewed

Every route by which the app SUGGESTS an ingredient — "For your meal plan",
"Buy one thing", "Shop for this week" — fills a **basket** at the top of the
grocery list rather than writing to it. One row per ingredient, each with an ✕,
and the list only changes when the user confirms.

**The same panel serves one row and a whole week.** A review step that appeared
only for bulk adds would teach people that small adds are unreviewed, which is
exactly the belief that makes a list untrustworthy.

It sits at the top of the grocery list, not in a dialog over it: the user
reviews the basket in the place it is about to change.

**Confirming is one write.** A loop of single writes would be N file writes and
N revalidations for what the user experienced as one decision, and a failure
halfway would leave the list holding an arbitrary prefix of what they agreed to.

**The direct toggle is not affected.** "On grocery list" in the state widget
writes immediately — the user is looking at one named ingredient and setting a
flag on it, and asking them to confirm a direct manipulation is a second
confirmation of a decision already expressed.

## 4c. Timezone is detected, never asked

Every date in the product is a LOCAL calendar day — which square is today,
whether "Made it" is offered, which day a cook is filed under. The server does
not run in the user's zone (this one runs in UTC), so without knowing it, "today"
rolls over at 5pm in California and the calendar is wrong for the whole evening.

The browser reports `Intl.DateTimeFormat().resolvedOptions().timeZone` into a
cookie on first load. Not `getTimezoneOffset()`: an offset is not a zone, and it
is wrong on the far side of a DST boundary.

**The honest limit:** the FIRST render for a new visitor uses the server's zone,
because the cookie does not exist yet. A CDN geo header
(`x-vercel-ip-timezone`, `cf-timezone`) is right on request one and is the
upgrade when this deploys behind one. An unknown or edited cookie falls back
rather than throwing inside a page render.

---

## 4d. The list is a place, not a flag

**The grocery list is the hinge of the whole product and the interface files it
as a subsection of the pantry.** It is where meal planning, shopping, unpacking
and standing at an open fridge all meet — four moments, one object — and it is
drawn as a collapsed panel underneath a bigger one, in the same chips, in the
same drawer, reachable only by opening the pantry first.

That is not a styling accident. It is what the data model looks like when it
leaks: `on_list` is one of three booleans on an ingredient (`INGREDIENT-SPEC`
§2), so the list got rendered as an attribute of the thing it is a flag on. But
§2 also says `in_pantry` and `on_list` are **independent**, and stacking one
under the other draws a hierarchy between two peers.

### What already works, and is not to be rebuilt

Written down because the gap is smaller than it looks, and the temptation is to
start over:

| Built | Where |
|---|---|
| Review basket before anything is written (§4b) | dialog: *"Add 1 to your grocery list? · scallion · unlocks 12 recipes · ✕ · Add 1 · cancel"* |
| Tick one item off in the aisle | the `✓` on each list row |
| Bulk unpack after a shop, one write | *"Got these — move to pantry (1)"* |
| "Did you buy enough?" without lying | `tickOff(enough: false)` — pantry AND list, the state the independent flags exist for |
| Affiliate on the list only, never the grid (§5) | *"get it on Weee!: scallion"* |
| Suggestions know what is already on the list | "Buy one thing" reads `ON LIST` instead of `ADD` |

The mechanics are there. What is missing is that the list has **nowhere to be**
and **nothing to say about itself**.

### The pantry layers; the list is a place

**Reverses "two peer panels".** They were made symmetrical because the flags are
symmetrical (`INGREDIENT-SPEC` §2), and that was the wrong inference: the flags
are peers, the *activities* are not.

The pantry is **reference**. You consult it while doing something else — reading
a recipe, planning a week — and it is never the task. It stays a panel, layered
over whatever page you are on, because taking you somewhere to answer "do I have
garlic" would interrupt the thing that raised the question.

The grocery list is **an activity with its own session**. You stand in a shop
for twenty minutes with it as the only thing on screen. That is a place, and
pretending it is a drawer costs it the room it needs — see §4e, which specs it.

```
   DESK                                  PHONE
   ┌───────────────────────────────┐     ┌──────────────────┐
   │ brand  Cook  Mine  Plan   [🥫]│     │      content     │
   │ ┌─────────┐  ┌────┐ ┌────┐    │     │                  │
   │ │ PANTRY  │  │card│ │card│    │     ├──────────────────┤
   │ │ drawer  │  ├────┤ ├────┤    │     │      [ 🥫 ]      │  ← layer
   │ └─────────┘  │card│ │card│    │     ├──────────────────┤
   └───────────────────────────────┘     │ 🍳  📖  📅  🧺  │  ← places
                                          └──────────────────┘
```

**Desk.** The pantry needs no icon at all — the drawer is already beside the
grid, with its own dock/hide/expand controls, and a second control for a panel
you can see is furniture. The list's icon becomes a **link to `/list`**, not a
toggle.

**Phone.** Four places in the bottom row, icons only: Cook, My recipes, Meal
plan, **Grocery list**. One control on the shelf above them: the pantry. The
shelf is what says "this lays over the page"; the row below it is where you go.

Three rules survive the reversal:

1. **The pantry is never a mode.** The page stays live behind it. This still
   reverses the existing `full` mode, which hides `.main` entirely — a pantry
   that blanks the recipes turns inventory into a chore with no visible payoff,
   and the payoff is the only reason anyone maintains inventory.
2. **The pantry is reachable from every page, including `/list`.** *"Do I already
   have this?"* is the commonest question in a shop, and §1 requires the add
   affordance everywhere regardless.
3. **The list count is visible without opening anything.** On the icon, in both
   bars.

---

## 4e. `/list` — the grocery list page

The one place in the product a user stands still and works through, and the only
surface carrying affiliate links (§4). It is specced separately because it is the
first screen whose job is not *deciding what to cook*.

### What it is for, in order

The page is read top to bottom in the order the day happens:

| Block | Question it answers | Notes |
|---|---|---|
| **Basket** | *"Am I happy to add these?"* | §4b. Only present when something is pending. One row per ingredient, each with an ✕, one confirm, one write |
| **The list** | *"What do I buy?"* | Grouped by aisle (§4d). The body of the page |
| **Bought** | *"What have I already grabbed?"* | CART-SPEC. The cart, at the foot of the list, ending in **Put it away** |
| **For your meal plan** | *"What will I need this week?"* | The calendar join (§4a). Next 7 days, uncooked plans only. Nothing added automatically |
| **Shop** | *"Where do I buy it?"* | The Weee links, and the only place in the product they appear |

**"Buy one thing" is NOT on this page.** It lives on the Cook page and nowhere
else. The row claims *"unlocks 12 recipes"*, and the only place that claim can be
checked is the grid — here it would ask you to buy something on the promise of
results you cannot see. It was briefly on all four pages, on a "the drawer should
say the same thing everywhere" argument that was wrong: a panel belongs where its
payoff is visible, not wherever the panel is.

Keeping it off also keeps this page to its own job — it was the only thing on it
that ranked anything at request time.

**The order is not negotiable and the reason is trust.** What the user chose
comes before what we suggest. A page that opens with our recommendations and
buries their own list underneath is a page that is shopping *at* them.

### A row

```
   ┌──────────────────────────────────────────────┐
   │  ✓   gochugaru          Thu dinner · Sat     │
   │  ✓   scallion           unlocks 12           │
   │  ✓   bin bags                                │
   └──────────────────────────────────────────────┘
```

- **The tick is the primary action and it is thumb-sized.** One tap means "got
  it": `on_list` off, `in_cart` ON — the cart, never the pantry (CART-SPEC) —
  one write, acknowledged with undo (§4d) and by the row moving to the **Bought**
  group at the foot of the list.
- **The name opens the state widget**, the same one everywhere else — that is
  where portion, brand and "buy instead of" live (§4).
- **The reason is on the row**, not only in the panel that suggested it. An
  ingredient three dinners want is the one you must not come home without.
- **Free-text rows are first-class.** "bin bags" has no reason, no aisle and no
  buy link, and it is on the list because they put it there. §4's argument
  stands: ours has to be the whole list, or theirs is the one they take.

### Shopping has no mode, and the page is the mode

§4d rejected an explicit "start shopping" state. It is unnecessary *here*
because the page IS the signal: a phone showing `/list` is a phone in a shop.
So the affordances are simply sized for that everywhere — big ticks, no
accidental edits, nothing that needs precision.

**"Did you buy enough?"** stays as it is: ticking something three meals want asks
one question, after the tick, never before it (`tickOff(enough: false)` leaves it
on the list and in the pantry, which is the state the independent flags exist
for).

### The page has to earn the links, and it is the only page that does

**A slow or awkward list with affiliate links on it is worse than no list at
all.** Every other screen can be mediocre and survive on the strength of what it
is for; this one carries the commercial ask, so the moment it is annoying the
links stop reading as help and start reading as the reason it exists. Then the
page is abandoned, and with it the entire revenue surface — because §4 put the
links here and nowhere else.

So this page is held to a standard the others are not:

- **It opens instantly.** Measured: 15ms server render, 15KB of HTML, against
  35ms and 88KB for the home page. It is the cheapest page in the product and
  must stay that way — it holds no gallery, ranks nothing at request time, and
  the one ranked thing on it ("Buy one thing") comes from the shared cache.
- **Nothing on it can wait on the network to be useful.** Rows, ticks, aisles
  and the pantry beside it are local (§12). The Weee links are the only part
  that needs a connection, and they are the part that may say so.
- **The tick never lags.** It is optimistic, acknowledged, and undoable — a
  shopper ticking twelve things in an aisle must never wait for a round trip
  between them.
- **The links come last, after the user's own list and after the two suggestion
  blocks.** Order is the whole argument (above), and it is also the test: if the
  page would still be worth opening with the links deleted, they are placed
  correctly.

### It must be useful when it is empty

An empty list is the *normal* state between shops, so the empty page cannot be a
dead end. It shows "For your meal plan" and "Buy one thing" — which is to say,
the empty state is the page minus its middle block, not a shrug.

### Offline

§12 says the list works offline and this is where that promise is kept: rows,
ticks and aisle grouping are all local. **The Weee links are the one thing that
needs a connection**, and they are the one thing on this page that may say so.

### A ticked row dims; it does not vanish

**Decided.** Removing it the instant it is ticked is the literally correct
answer — it is off the list — and it is the wrong one in a shop, where you look
back down the list to check you actually picked something up. A row that
disappeared gives you nothing to check against, and the only way to be sure is to
untick and re-tick it.

So it stays, struck through and dimmed, **until you leave the page**. Leaving is
the natural end of a shop, and re-entering gives you a clean list — which is also
what makes this safe: the dimmed rows are a view of this visit, not state.

The write still happens on the tick, immediately. Nothing about this defers it.

### No pantry here — the rows say it in colour

**Reverses "the pantry is docked here".** It was going to sit beside the list on
the argument that *"do I already have this?"* is the commonest question in a
shop. The question is real; a second copy of the whole inventory is a heavy way
to answer it, and it made the one page held to being the cheapest in the product
render every ingredient twice.

The row answers it itself:

| Row | Means |
|---|---|
| **green** | You have some. This is a top-up |
| **amber** | You have none of it |

These are the same two tones the recipe modal uses for owned and missing
ingredients, so nothing new is taught — the vocabulary is already in the user's
hands by the time they reach a shop.

The pantry is still one tap away on this page, as on every page (§1), through
the same floating widget as everywhere else. It is simply not a permanent
column.

### Within an aisle, the order things were added

**Decided.** Not alphabetical. The list is a record of decisions in the order
they were made, and consecutive rows tend to come from one recipe or one planning
session — so added-order keeps related things together, which alphabetical
actively scatters. Aisle grouping already provides the structure that sorting
would otherwise be for.

### Open questions

- **What happens to a row ticked but never confirmed** — does the list remember
  an interrupted shop? Inherited from §4d and still open.

### A row says why it is there

A list row is `scallion`. It should be `scallion — Thu dinner, Sat dinner`, or
`— you ran out`, or `— unlocks 12`. The reason exists at the moment the item is
added and is thrown away on the way in: it survives in the *suggestion* panel and
dies in the *list*.

This is what turns the list from a bag of words into the join §4a claims it is.
It is also the only thing that makes a long list triageable in a shop — an
ingredient three dinners want is the one you must not come home without.

### It is walked, not read

Group the list by where it is found — produce, dairy, dry, freezer. **The
taxonomy already exists**: it is the shelf vocabulary built for Weee
(`WEEE-SPEC` §4, `lib/weee.ts`). Ungrouped, a fifteen-item list is walked four
times.

### The loop closes back to the calendar

§4a says the list and the calendar are one fact, and the arrow currently points
one way: the calendar fills the list. After the shop, nothing goes back. The
meals that were waiting on an ingredient should visibly stop waiting —
*"Thu dinner: ready to cook"* — because that is the payoff for having kept the
list at all, and it is currently thrown away at the exact moment it is earned.

### Every state change is acknowledged, and none of them blocks

An ingredient changing state must produce a visible acknowledgement. Today a tap
can write to the pantry and the only feedback is a chip quietly restyling itself,
which on a phone happens under the thumb that did it.

**A brief, non-blocking confirmation naming what happened, offering undo, and
dismissing itself:**

```
   ┌────────────────────────────────┐
   │  scallion → pantry      undo   │
   └────────────────────────────────┘
```

**Why not a dialog.** A blocking dialog on every tap contradicts §1, which is the
constraint the whole product is built on — *"adding an ingredient must never feel
like data entry"* — and §4b deliberately exempts the direct toggle from
confirmation, because asking twice about a direct manipulation is asking twice.
Acknowledgement is not confirmation: it reports, it does not ask. **Undo is what
makes an unasked write safe**, and it is cheaper for the user than a dialog on
every tap would be, because it costs nothing in the overwhelming case where the
tap was right.

Blocking dialogs stay exactly where §4b put them: **things the app suggested**,
never things the user did with their own thumb.

### Stacked on a phone, side by side everywhere else

There is no room for two columns at 390px, and the shop is the phone case, so it
does not get to be the degraded one.

| Width | Both panels open |
|---|---|
| Phone | **Stacked**, list above pantry — the list is the one with something to do |
| Tablet and desk | **Side by side**, as peers, grid still live beside them |

The order on a phone is not arbitrary: stacking puts one of them under the fold,
and the list is the one you are holding the phone for.

### Shopping has no explicit start

**No "start shopping" mode.** It was considered, for bigger tick targets and a
running *"6 of 11"*; rejected because rule 3 above says neither panel is a mode,
and a state the user has to remember to enter is a state they will forget to
leave. The tick targets should simply be thumb-sized whenever the list is open on
a phone, which costs nothing and needs no mode to switch on.

### Open questions

- **What happens to a row ticked but never confirmed** — does the list remember
  an interrupted shop?

---

## 4f. Suggestions come from what you have bought before

The add box suggests from the ontology — 2,872 ingredient names, ranked by how
many recipes use them. That is right for a recipe app and wrong for a shopping
list. A list is habitual: the same forty things, in cycles, per household. Google
Keep gets this right with no ontology at all, because it suggests **what you
typed last time**, and last time is a far better predictor of this time than the
corpus average is.

So the box offers **your own history first, then the corpus**. Two sources, one
list, and the user's own rows always rank above ours — a name you have used is
not a guess.

**The history already exists.** `UserIngredient` rows now survive going empty
(§ the store's tombstones), so every ingredient the user has ever had is still on
file with `first_added_at`, `removed_at` and a `label` for the typed ones. This
section is the first thing to read them, and it is the reason they are kept:
without a reader, a tombstone is just a row that will not go away.

**A typed row is the most valuable suggestion of the three.** "Bin bags" is not
in the ontology and never will be, and it is on the list every week. Those rows
are exactly what a corpus-backed suggester cannot offer.

**Rank by recency, not frequency.** The thing you bought last week is a better
guess than the thing you bought forty times two years ago, and frequency quietly
freezes a list into whatever a household ate when it started using the app.

---

## 4g. Ticking off fills the cart — SUPERSEDED by CART-SPEC

This section specced a dialog: a tick asked *"is this in your kitchen now?"*, with
a "don't ask me again" checkbox behind it. The diagnosis was right and is worth
keeping — `in_pantry` set by a tick is a guess, and a pantry you do not trust is
one you stop correcting (INGREDIENT-SPEC §2) — but the fix asked the question in
the wrong place. You are in an aisle. The thing will not be in a kitchen for
another half hour.

**A tick now writes `in_cart` and nothing else** (CART-SPEC). The kitchen
question is asked once, at the door, over the whole trip: *"Put 3 away? Remove
anything you didn't keep."* One review instead of a question per item, asked
where the answer is known.

What this section got right and CART-SPEC keeps:

- the tick is one tap and is never taxed by a question in front of it;
- nothing enters the pantry on a guess;
- "did you buy enough?" stays, because that one IS a shop-floor question — you
  are in front of the shelf and can still pick up another.

`tick_to_pantry` remains in the store, written by nothing and read by nothing.
It is in people's files and INGREDIENT-SPEC §1 forbids rewriting their data to
suit a new shape.

---

## 4h. The affiliate is a block, not a decoration

Two changes, and the second is the one with a claim in it.

**It moves out of the list.** Today the buy links are a run of item names in a
`note` under the rows — inside the thing being read, mixed into the task. §4
already holds the line that the list must be *"meaningfully better than Apple
Notes even without the shopping links"*, and the way you keep that promise
visible is to make the links removable in one block: one section, below the list,
that could be deleted tomorrow without touching the list's own design.

**It shows only for things that are hard to buy.** This is the part that changes
what gets a link at all.

The obvious rule was "Asian items", and it does not survive contact with the
data: `butter` and `chicken breast` resolve to real Weee shelves as cleanly as
`gochujang` does, and 343 of the 645 ingredients used by six or more recipes land
on a shelf. A rule that links everything with a shelf is a rule that offers to
deliver butter.

But "Asian" is not the real predicate either — it is a proxy for one, and the
pitch gives the real one away: *"you don't know where to buy sesame oil, soup soy
sauce?"* The value is **findability**. Nobody needs help buying butter, and the
help is worth having for doenjang whatever the shopper's background. Ethnicity
describes the ingredient; findability describes the problem.

So: **a shelf is marked as hard-to-find, or it is not.** A hand-marked list of
Weee shelves — `data/decisions/` alongside `weee-shelf.csv`, the same shape and
the same review posture — where a row means "a mainstream US grocery does not
reliably carry this". Roughly thirty shelves, one sitting, and wrong in ways we
can fix rather than ways we inherit (§4d makes the same argument about aisles).

**The modal.** Clicking the block opens recommended products rather than
throwing the user at a category page. `data/weee/products.csv` carries 2,736
products with shelf and title, so the products for a node are the ones on its
shelf whose title names it — measured at 67 of 98 hand-mapped nodes having at
least one. Every button out carries the reference code; the modal itself sells
nothing and takes no payment.

**What this must not become.** §5 still forbids any of this on the results grid,
and DECISIONS §513 still says a signup prompt rather than a checkout: links out,
no basket, no price comparison, no "customers also bought".

**Open questions**

- ~~**What happens for a hard-to-find item with no products naming it?**~~
  **Settled: a shelf link, and no modal.** A modal headed "recommended for
  doenjang" listing assorted pastes is a recommendation we did not make, and the
  block's whole claim is that it only speaks when it has something to say.
- ~~**Does the block appear when the list holds nothing hard to find?**~~
  **Settled: no.** Silence is what makes its presence mean something — it
  appears when there is a real answer rather than sitting there permanently for
  the eye to learn to skip.

### The shelf is not enough on its own

Marking shelves turned out to be half the rule. `garlic`, `onion`, `scallion`
and `ginger` all resolve to *Spices Herbs* — which is genuinely hard to find, for
gochugaru and sichuan peppercorn — so the shelf rule alone offered to deliver an
onion. It is the same defect §4d measured and rejected the Weee taxonomy over
("garlic and onion under Dried goods"), reappearing one layer up.

So our own `kind` vetoes the retailer's shelf: nothing classed `produce`, `meat`,
`seafood`, `dairy` or `fruit` carries a link. That over-corrects in turn —
`perilla leaf`, `buchu` and `myeolchi` really are produce and really are hard to
buy — so those are named in a short allow-list, and named rather than derived,
because "which greens does a US supermarket stock" is a fact about a market and
not something the ontology knows.

The result on the corpus: **135 of the 645 ingredients used by six or more
recipes** carry a link. `sesame oil`, `doenjang`, `soup soy sauce`, `gochujang`,
`perilla leaf` and `myeolchi` do; `butter`, `chicken breast`, `onion`, `garlic`,
`kimchi`, `tofu`, `rice` and `sugar` do not.

---

## 4i. "Nearly there" is a shopping list, not a shelf of near-misses

It was a grid of recipes ordered by how far away they were, with an unlock band
on top offering one ingredient at a time. Both halves were answering the wrong
question.

**A grid of near-misses tells you what you cannot cook.** Sorted by distance, it
tells you that in order. What a person does with *"you are two ingredients from
eleven dinners"* is go shopping — and the grid made them derive the shopping
list themselves, by reading eleven cards and noticing what they had in common.

**The band claimed a number and hid its evidence.** *"Buy scallion and 12
recipes become cookable"* put the twelve behind a link. The claim and the
recipes are one fact and belong on one screen.

So the shelf is **one row per blocking ingredient**: the ingredient on the left
with an add-to-list button, the recipes it is holding up sliding horizontally
beside it. Reading down the rows is reading a shopping list ordered by how much
each line buys you, and the evidence for every line is on the same line.

### A row is not gated on "exactly one away"

The obvious rule was that a row holds what becomes cookable the moment you buy
that one thing. Measured against a real 21-ingredient pantry it produced
**nothing** — zero recipes one away, eighteen sitting between two and five.

A shelf that stays empty until a pantry passes roughly thirty-five items is a
shelf that teaches new users the product does not work yet, and it would have
been strictly worse than the grid it replaced.

So a row holds everything that ingredient **blocks**, and each card keeps saying
how far away it still is. The strong claim lives in the header and only when it
is true: `unlocks` counts recipes needing this and nothing else, and rows are
sorted by it — so a genuine one-purchase win is always the top row and says so,
while a thin pantry degrades to *"here is what is in your way, most blocking
first"* rather than degrading to nothing.

**"Cook tonight" is now "Can cook now."** Tonight was a claim about when; the
shelf is a claim about what, and the two came apart every time someone opened
the app at nine in the morning.

---

## 4j. The recipe box completes a WORD; the grid shows the recipes

Two boxes were answering each other's questions.

The **pantry search** exists to get things onto your shelves. Tapping a
suggestion opened a dialog with two buttons — *have it* / *want it* — and, above
them, a strip of recipe cards headed *"add it and you can cook 4 of these"*.
That strip was the pantry box answering a question about the **corpus**, inside
a dialog about **inventory**, in a shape that appears nowhere else in a dialog.
It also cost a corpus-wide near-miss walk every time a dialog opened.

The **recipe search** searched titles only, and answered with twelve recipe
rows. That made it a second, worse gallery stacked above the real one: its own
card shape, its own ordering, and none of what the grid has — tabs, distance,
saved marks, cook counts, the cuisine chips. Two lists of recipes on one screen,
disagreeing about how to draw a recipe, with the better one pushed below the
fold.

**So the box completes the word, and the grid stays the only place a recipe is
ever drawn.** Typing `gochu` offers **gochugaru** and **gochujang**; `japchae`
offers **japchae**; picking one sets `?q=`. The pantry dialog went back to being
a decision about a shelf.

### The search is a SHELF, not a filter over the others

The term narrowed the whole grid at first, and that quietly rewrote every tab:
search `japchae` and "Can cook now" stopped meaning *what your pantry can cook*
and started meaning *japchae your pantry can cook*. Three tabs changed their
minds about what they counted and nothing on screen said so.

```
/?q=japchae    japchae 15 | Can cook now 8 | Nearly there 8 | Popular 2,862
```

Its own shelf instead, first in the row and named after what was typed. The
other tabs go on answering exactly the question they always answered, and the
shelf is gone the moment the term changes — because it **is** the term.

`Gallery` keeps the chosen tab in client state, so someone who had clicked
Popular would have searched, got a new tab, and gone on looking at Popular. It
is remounted on the term: choosing a word is choosing what to look at, and
dropping the previous choice is the behaviour rather than a side effect.

Ordered fewest-missing-first, like everything else. Dismissals do **not** apply
— "not now" is discovery only, and asking not to be recommended something is not
asking for it to become unfindable. `servable` does apply: a card claiming "2
away" from an ingredient list we could not fully read is claiming something we
do not know.

### The word stays in the box

No "showing japchae" line under it. The word is in the box and the shelf is
named after it; a third statement of the same fact is the page repeating itself
twice over. Leaving it in the box is also what makes it editable — `japchae` to
`japchae noodles` is one word typed, not a search retyped. **Clear** means one
thing: empty the box and drop the shelf, because emptying only the box would
leave a shelf named after a word that is nowhere on screen, with nothing left to
remove it.

### Where the words come from

Two vocabularies, because neither is enough alone:

- **The ontology**, which knows aliases — so `gochukaru` reaches `gochugaru`.
- **The corpus's own titles**, because `japchae` is not an ingredient and never
  will be. A word is offered once it appears in three or more titles.

Filler is excluded (`easy`, `best`, `recipe`, `video`), and so are the cuisine
words — `korean` heads 956 titles and would top every list, and the chip row
already answers that question better, reading the stored `cuisine` field rather
than the title.

### The count on a row is what the grid will hold

Not the number of titles containing the word, and not the ingredient's corpus
usage. Any other number is a promise the next screen breaks. It is computed by
walking the corpus ONCE with every candidate's ingredient ids in a
`need -> candidates` index; the obvious shape — filter the corpus per candidate
— took 362ms per keystroke.

A word one recipe reaches is not offered. That is where parser leftovers live
(`oil from the jared crab paste`), and a completion list is not the place to
show them. The exact word typed survives regardless: the user typed it, so it
is a word.

### Two readings, OR'd

A recipe reaches the shelf if its **title** contains the word or it **needs the
ingredient** the word names — the dish called kimchi jjigae and the stew that
merely wants a jar of it.

Narrower forms count and broader ones do not: `kimchi` finds a recipe asking for
`cucumber kimchi`, and `oil` does not offer one asking for `sesame oil` —
INGREDIENT-SPEC §3a, "the parent must be a real kind".

### Filters survive a look at their own results

Every link on the page was a bare `?recipe=`, which replaces the whole query.
Filter to Chinese, open a recipe, close it, and the chip was gone. A search term
makes that twice as easy to hit — you would lose the search by looking at one of
its results — so the links are built by one helper that keeps `c`, `q`, `n` and
`allow`. `recipe` and `date` are not kept: they address the modal, so they
belong only to the link that opens it.

---

## 5. Recipe modal

**It is a control panel, not a preview** (DECISIONS §5a). Everything needed to
*decide* lives here; the instructions never do. The user leaves only after
deciding, and the decision is ours.

**It is the element that threads the product.** The recommendation grid, the
calendar and a recipe's own page all open THIS — which is why it is addressed by
a query parameter, `?recipe=rec_x`, over whichever page you were on. Not a route
and not component state:

- the **back button closes it**, which on a phone is the close gesture; with
  component state, back leaves the app from a modal the user opened by tapping a
  card
- a **reload keeps your place**
- the modal's data is loaded server-side for ONE recipe, rather than shipping
  every card's history up front against the chance you open it

Parallel and intercepting routes would buy the same three things plus a
standalone full-page view, at the cost of the App Router's fiddliest corner. A
`/recipe/[id]` page rendering the same component can be added the day it is
wanted.

**Recording a cook lives here, and only here.** The grid card reports *"made
3×"* as text and offers no button. A cook logged from the grid has no rating
prompt anywhere near it and stays a bare event forever; in the modal, "Made it"
can wake the rating that sits directly beneath it (§6).

- Every ingredient opens the state widget on tap — one tick puts it in the pantry
- **Owned / missing** is visually obvious at a glance
- **No cook time at all** — reversed 2026-08-09, see `RECIPE-SPEC.md` §4a. It is
  not that a number was too precise; it is that the fact belongs to the COOK, not
  to the recipe. The same dish is twenty minutes for one person and an hour for
  another, and no band we could store would be true for both
- **Make-ahead is a separate, louder signal than the band.** "Needs a head start"
  is the one time fact that can waste someone's evening, so it is a flag on the
  card, not a line inside the modal
- Substitution notes shown inline, never applied silently
- **"One ingredient away"** — a standing section in the recommendation panel, not only the zero-results fallback
- **No affiliate placement here.** Superseded by §4 — the links live on the
  grocery list and nowhere else. In this modal the user's question is *"am I
  cooking this?"*, and a shopping link answers one they have not asked yet
- **My version** — what this user substituted last time and how it went (§8). The
  single strongest reason to open our modal rather than search the blog again
- **Community** — corrections that have converged, one line, not a thread

### Leaving to cook

The exit is one button — **"View full recipe →"** — and it is the last thing in
the modal, not the first.

- Open the source in an **in-app browser**, so returning is a back-tap rather than
  a re-launch. This is the highest-value item in DECISIONS §5a
- On the way out, say what to come back for: *"when you're done, come back to
  update your pantry and save your version."* It is the only moment they are
  listening, and it names the return trip as *their* benefit
- **Never interstitial, never a delay.** The tap that means "I'm cooking this" is
  the one tap in the product that must not be taxed

---

## 6. After "Made it"

**Additive.** Reversed from binary decrement — see `DECISIONS.md` §5.

Single screen:
1. `Anything new to add to your pantry?` — add field with autocomplete
2. Recipe ingredients rendered as chips below it. Tapping one marks it used up. **Optional, unprompted** — no question is asked, so nobody is taxed for skipping it
3. ❤️ Would you make it again?

### How the answers are actually collected

The deferral above has expired on its own terms: it waited for cooking history
(§8) to exist, and §8 is built. What replaced it is **not** a form.

**One tap logs the cook and asks nothing.** Then "My version" scrolls into view
and the rating glows for a moment. Nothing blocks, nothing must be dismissed, and
ignoring it costs the user nothing — but the ask arrives at the one moment they
are thinking about the dish. A form on the tap would collect more per answer and
fewer answers, and worse: people who learn to avoid "Made it" cost us the EVENT,
which is the ranking signal, the retention signal and the pantry's only automatic
growth. Losing the star is cheap. Losing the cook is not.

**"Made it" can be undone**, and the rating and note go with it. An accidental
tap should not leave a permanent record, and a rating attached to a meal that
never happened is worse than no rating. The pantry is NOT reversed — see
RECIPE-SPEC §4 — and the confirmation says so.

**On the calendar, the tap belongs to a date.** A recipe bound to today or a past
date can be marked made and rated for THAT day's cooking. On a future date no
"Made it" appears at all: it has not happened yet.

---

## 7. Crowd truth correction

The recipe says "onion"; users know it should be red onion.

- Correction is offered **in place**, on the ingredient, in one tap — never a form
- Flip the canonical mapping once reports pass a threshold
- Below threshold, corrections are private to the reporting user — so their own view is right immediately, which is the reward for reporting
- **Never make it feel like moderation work.** If it reads as a chore, only the wrong kind of user does it

### Asking for a contribution: reciprocal, never altruistic

When a recipe has no usable ingredient list, the ask is **not** *"help us improve
our database"*. It is:

> **"Add the ingredients to unlock pantry matching."**

…followed by what that buys them, concretely:

```
  ✓ see how much of this you already have
  ✓ get similar recipes from your pantry
  ✓ save it to your cooking history
  ✓ get told when someone adds a substitution
```

The first framing asks a stranger for unpaid labour. The second describes a
feature they switch on. Same keystrokes, and only one of them is a reason.

**Ask at the moment of intent**, never in a queue or a settings screen — the user
is looking at a recipe they want to cook, which is the only moment the payoff is
real. Same rule as `INGREDIENT-SPEC` §6: at the moment it matters, with the
reason attached.

### Let the first contributor be sloppy — but autosuggest our vocabulary

Sloppy input is accepted. A half-right ingredient list beats a blank one, and
demanding precision from the first contributor is how a recipe stays blank
forever. Later cooks correct it in place, which is what the rest of §7 is for.

**But sloppy must not mean free-text into the void.** As they type, suggest from
our own vocabulary, and let one tap take the suggestion:

- A taken suggestion arrives **already resolved to a node** — no parse, no
  normalisation, none of §4b's three uncertainties. It skips the pipeline that
  every crawled line has to survive.
- What they type when nothing is suggested is the **most valuable signal we get**
  — a real cook naming a real ingredient we do not have. That is exactly the
  promotion-queue input `INGREDIENT-SPEC` §5 describes, arriving pre-motivated.
- The suggestion list is a **prompt, never a constraint.** A field that refuses
  unknown words would discard that second signal entirely, which is the more
  valuable of the two.

The vocabulary behind the suggestions is the one built in `WEEE-SPEC` §4 — retail
names a shopper recognises, rather than the corpus's most frequent surface. That
is the point of having built it: the name suggested to a contributor should be
the name they would read on a shelf.

**Comments are a later feature, not a rejected one.** Reviewer's call: we want them, after v2. Free-text per recipe is the one place a user's writing is shown to another user, which brings moderation, reporting and deletion — none of it hard, all of it absent from every other table here. Deferred so that cost is paid deliberately rather than discovered after the first abusive post (`RECIPE-SPEC.md` §9).

**Structured correction is not a substitute and does not wait for them.** It produces data; comments produce threads. Everything in this section ships without comments and is unaffected by them arriving later.

---

## 8. Cooking history — the reward for answering

The one thing a user gets that they cannot get anywhere else.

Per user, per recipe:
- What they substituted last time, and how it went
- What they reported as wrong
- The system's summary of *other* users' corrections

This is what makes §6 and §7 worth answering. Without it the questions are extraction; with it they're a personal record that improves each time it's used.

---

## 9. Signup timing

**Anonymous-first, always.** The pantry works with zero account.

| Trigger | Prompt |
|---|---|
| Pantry reaches ~5 items | `Sign up to keep your pantry` — dismissible, non-blocking |
| First "Made it" | Same, stronger — there's now history worth losing |
| Return visit with a stored pantry | Persistent but quiet banner |

**Never gate matching, search, or the pantry behind an account.** The pantry *is* the signup argument; it has to exist first to make it.

**"Sign up to keep your pantry" is true on the SIGN-UP path only.** There is no
merge (`USER-SPEC.md` §2) — signing up converts the anonymous session into an
account and the pantry carries over, but logging in to an existing account opens
that account's pantry and leaves the current one behind. So the log-in path
carries its own warning first: *"You have 8 items here. Logging in opens your
saved pantry — these will not be added to it."*

Nothing is deleted; the anonymous session survives and can be returned to. But
the user has to be told before they choose, not after.

---

## 10. SEO → pantry continuity

The SEO page is the top of the pantry funnel, not a dead-end landing page.

1. User lands on `/what-to-cook-with/gochujang-chicken` from search
2. The query ingredients (gochujang, chicken) are **already in the pantry widget** on that page
3. They add more from the page — same double-tap gesture
4. Clicking the logo → homepage, **pantry intact**
5. Persistent: `Sign up to let us remember your pantry`

**Thin-content guard.** Generate a page only where the graph has something real to say — a minimum recipe count, plus genuine editorial (substitutes, pairings, state variants). An ingredient page with two recipes and a stub description is exactly what Google penalizes. **Coverage thresholds, not a page per permutation.**

---

## 11. Recipe requests — the demand board

The page users reach when we don't have what they want. Phase C
(`BUILD.md`), rationale in DECISIONS §8.

**Two failure modes, and the copy is what separates them:**

| Reads as | Result |
|---|---|
| "Our database is incomplete, please wait" | Looks abandoned. User leaves |
| **"These are the recipes people want to cook next"** | Looks alive. User waits |

Same data. Never ship the first framing.

### Submitting

The action is **"I want to cook this"** — never "submit a recipe," never
"contribute," never an upvote. A user saving something for themselves is doing a
natural thing; populating our database is not. One field, a URL, no metadata
asked.

What comes back is a promise about *them*, with the processing step visible and
honest:

```
   ┌────────────────────────────────────────┐
   │  Saved.                                │
   │                                        │
   │  We're preparing this recipe for       │
   │  pantry matching.                      │
   │                                        │
   │  Saved by 38 people                    │
   └────────────────────────────────────────┘
```

**No notify-me checkbox — decided 2026-08.** The return trip is the product,
not a message: when the recipe unlocks, the board's *recently unlocked* block
says so to everyone, and a user who pasted their own copy has it TRANSFERRED —
the curated version lands in their saved shelf carrying everything they added
(standing note, their steps, cook history, plans), and only the ingredient
list is replaced, because the curated reading is the one the pantry can match
against. Email needs an account, push needs permission, and both promise a
delivery this does better silently.

**Never claim instant parsing** (DECISIONS §8). A queue is forgivable; a parser
that confidently returns nonsense on first use is not.

**The saved-by count does two jobs at once** — it measures demand and it builds
anticipation. Show it only once it is not embarrassing; "saved by 1 person" is
worse than no number.

### `/recipe-requests`

Title: **Recipes people want to cook.** Three blocks, in this order:

1. **Trending requests** — count and source creator (no notify-me — see above)
2. **Recently unlocked** — *"now pantry-enabled · unlocked after 428 requests ·
   ✓ verified by @creator."* **Not optional.** Without it the page is a list of
   things we failed to do; with it, it reads as something being built
3. **Recent requests** — the tail, for freshness

**Public/private split.** Multiple independent requests plus a recognized source
to appear publicly; single-user requests and unknown domains stay private.
Otherwise the page becomes a spam surface pointed at our own SEO. Threshold is
open (DECISIONS §11).

### The claim entry

On every request and every unclaimed recipe:

> **Are you the creator? Claim this recipe →**

- **Not "contact us."** That is a dead end wearing a button's clothes
- Self-service, three visible steps, no more: verify your account → confirm the
  ingredients → unlock your insights
- The proof of demand comes *first*, above the button: *"312 cooks are waiting for
  this."* A creator who searches their own dish should see the demand before the
  ask
- The ask is bounded and honest — *"about 2 minutes"* — and names what it unlocks:
  pantry matching, recommendations, community substitutions, analytics

**No comments here either** (§7). A request is a count, not a thread.

---

## 12. Install — a PWA, not an app store

The constraint at the top of this file is already *mobile web, one thumb, standing
in front of an open fridge*. A PWA is that constraint kept rather than abandoned:
the same Next app, deployed the same way, that a user can put on their home
screen. **No store, no review queue, no second codebase.**

Two additions to what already exists:

| Piece | What it buys |
|---|---|
| **Manifest** — name, icon, `standalone`, theme color | Add to Home Screen; launches fullscreen with no address bar |
| **Service worker** — cache + push listener | Opens instantly, works with no signal, receives notifications |

### The install prompt obeys §9's rule, not its own

Anonymous-first applies here too. **Never prompt on first visit.** An install ask
before the pantry has anything in it is asking the user to commit to a product
they have not evaluated, and it trains them to dismiss us.

| Trigger | Prompt |
|---|---|
| Pantry reaches ~5 items *and* a return visit | `Keep this on your home screen` — dismissible |
| First pin of a "use first" item | Stronger, and it names the reason: *"We can remind you before it goes."* |

**Signup wins any collision.** Both asks fire on roughly the same signal, and two
banners on one screen reads as a site that wants things from you. §9's ask
protects data the user would otherwise lose; ours is a convenience. **One ask per
visit, signup first.**

### The offline table is wrong for this build, and the app says so

**Correction, found while building §12.** The table below was written against an
app whose state is local. This one keeps every ingredient, plan and cook in
`owners.json` on the SERVER, keyed by a cookie, and renders every page there. So
"add, remove, pin pantry items — Yes" is not true and no amount of caching makes
it true: with no signal you cannot write, and you cannot read anything you have
not already loaded.

| Offline | §12 claimed | This build |
|---|---|---|
| Add / remove / pin | Yes | **No** — the write goes to the server |
| Matching and ranking | Yes | **No** — ranking runs server-side |
| Grocery list | Yes | **Read only**, and only pages already visited |
| Tapping through to cook | No | No |

**The grocery list is the exception, and it is the only one.** `/list` accepts
two writes with no signal — tick something off, and add something you typed —
because it is the one screen used where signal is worst. You are standing in an
aisle, and a tick that fails because the shop has thick walls is a tick nobody
makes twice. They queue in `localStorage`, replay in order when the connection
returns, and the page says which of offline / catching-up it is in.

Both are safe to replay late because both are idempotent in the direction they
move: ticking twice lands where ticking once did, and adding "paper towels"
twice makes one row. That is what lets this exist without a merge algorithm —
and it is why it does not generalise. Pinning, planning, cooking and the state
widget still need a connection and still say so.

What the service worker buys beyond that is smaller and still worth having: the
app OPENS with no signal instead of showing the browser's error page, static
assets never re-download, and the last version of a page you visited is
readable. The
page says which it is — an offline bar naming exactly what stops working, on
§12's own principle that a cached surface leading to a dead tap is worse than
showing nothing.

**Making the original table true is a real project**, not a setting: owner state
would have to move to the client (IndexedDB), with the server as a sync target
and a conflict story. Worth doing — the fridge is where signal is worst — but it
is a Phase B decision and it should be taken deliberately rather than implied by
a service worker.

### Offline means the pantry, and it must not imply more

We never host recipe text (`RECIPE-SPEC.md` §1), so **"works offline" can never
mean "cook offline."** The method is on someone else's site and needs a
connection. A cached grid that leads to a dead tap is worse than showing nothing —
it promises something the architecture cannot deliver.

| Offline | Works |
|---|---|
| Add, remove, pin pantry items | Yes — local state, and this is the fridge case |
| Matching and ranking | Yes — the logic in `app/src/lib` is local and needs no server |
| Grocery list | Yes |
| Tapping through to cook | **No.** The card says so before it is tapped, not after |

The fridge and the kitchen are where signal is worst and where this product is
used. Offline is not a nice-to-have here; it is the primary environment.

### Notifications are the reason this is worth building

"Use first" is the entire urgency mechanism (§3), and a pin is the user telling us
something is dying. Without a way to reach them later, that signal expires unused
in a tab nobody reopened. **Push is what turns a pin into an action.**

Hard limits, because this permission is spent once:

- **Only ever from a user-initiated pin.** Never re-engagement, never "new recipes
  this week," never anything the user did not personally ask for by pinning.
- **Ask at the first pin, never before.** At that moment the ask has a visible
  reason attached and the user has just demonstrated the need.
- On iOS, web push requires home-screen install first, so the real sequence is
  **pin → install → permission**, in that order, each earned by the last.

### What it does not get us, stated plainly

No store presence, so nobody discovers this by searching an app store — every
install comes through the web funnel (§10). iOS gives PWAs less storage than
native and gates push behind install. Widgets and background work are out.

These are acceptable because **the install rate is the measurement that decides
whether native is worth building at all.** Ship this, watch install and 7-day
return, and the 6–10 week native question answers itself with data instead of
argument. A PWA nobody keeps on their home screen is not a case for spending two
months making the same product harder to deploy.
