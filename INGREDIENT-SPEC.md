# Ingredient — entity spec

Companion to `DECISIONS.md` (the why) and `NORMALIZATION.md` (how strings become
nodes). This file specifies the **entity**: its identity, its states, its
relations, and how the vocabulary grows.

Written before the app, because every table in the product will hold a foreign
key to it, and identity mistakes are the ones you cannot migrate out of cheaply.

---

## 0. The word "ingredient" is doing three jobs

Conflating them is the mistake this spec exists to prevent.

| | what it is | scope | mutable by |
|---|---|---|---|
| **Ingredient** | a thing that exists in the world — `chicken thigh` | global, shared | review |
| **PantryEntry** | *this user's* relationship to one ingredient | per user | the user |
| **UserIngredient** | a name one user invented that the ontology has never seen | per user, private | the user |

**States belong to PantryEntry, never to Ingredient.** "In my pantry" is not a
property of chicken thighs; it is a property of the pair (me, chicken thighs).
This is what makes the attribute list expandable without risk: a user's note and
expiry date live on their own row, and nothing a user writes can alter what
another user sees.

---

## 1. Identity — the part that must be right first

### The problem, stated plainly

Node ids today are **derived from the display name** (`src/ontology/ids.ts`):
`chicken thighs` → `chicken-thighs`. That is fine for a generated file that is
rebuilt from scratch each time. It is **unsafe the moment a user's pantry row
points at one**, because the ontology keeps changing by design:

- a review renames `jalopeno` → `jalapeno` — every pantry row referencing the old
  id is orphaned
- a review merges `light soy sauce` into `soy sauce` — the id disappears entirely
- the slug rule itself changed twice during this build (`all.purpose-flour`)

Each of those silently empties somebody's pantry. There is no error, no log line,
just a fridge that forgot what was in it.

### The rule

> **An ingredient id is opaque, assigned once, and never derived from anything
> that can change.**

```
id            ing_01H8X…        ULID or similar. Meaningless. Permanent.
slug          chicken-thighs     derived, for URLs and debugging. May change.
display_name  Chicken thighs     freely editable. May change.
```

Nothing may key off `slug` or `display_name`. The generated `ontology.yaml`
carries `id` as the contract and `slug` as a convenience.

### Merges need redirects, not deletes

When review decides two nodes are one, the loser is **retired, not removed**:

```
ingredient_redirects
  from_id   ing_01H8X…   (retired)
  to_id     ing_01H9Y…   (surviving)
  reason    "review: light soy sauce is soy sauce"
  at        2026-07-31
```

Resolution follows redirects transitively, forever. A pantry row written in 2026
still resolves in 2030. Deleting a row and rewriting user data is the tempting
alternative and it is wrong: it cannot be audited, cannot be undone, and fails
entirely for users who are offline at migration time.

### A stage of preparation is not a different ingredient

`fermented kimchi` was a node with 80 mentions, with `aged`, `ripe`, `sour` and
`well fermented kimchi` aliased onto it, plus `fully fermented kimchi` beneath
it. Review collapsed all of it into `kimchi`.

The test is the one §0 and UX-SPEC §3 already give: **the pantry is inventory.**
How far along a jar is changes what you should cook with it — old kimchi wants
to be a jjigae — but it does not change what you *own*, and it is not something
you go out and buy separately. A shopper who reads *"kimchi — you have this"*
and *"fermented kimchi — you do not"* has been told they are short of something
that is standing in their fridge. Same for the forms — `baechu kimchi` (baechu
*is* napa cabbage, the default), `bite size kimchi`, `fermented whole cabbage
kimchi`, `fermented napa cabbage kimchi`: cut size and cabbage variety are
descriptions of a jar, not distinct things to acquire.

**`vegan kimchi` merges too, and the reason generalises.** Whether a jar has
jeotgal in it is a *dietary restriction*, and restrictions are answered by the
diet filter — not by carrying a second vocabulary node for every ingredient that
comes in a version somebody cannot eat. Two nodes would be the wrong shape for
it anyway: the vocabulary would then owe us `vegan fish sauce`, `vegetarian
oyster sauce`, `egg-free noodles`, and the pantry would ask a shopper to declare
which one is in their fridge before it could match anything.

The merge costs the filter nothing, because the filter never read the
distinction: `dietVerdict` keys on `animal_source`, and neither `kimchi` nor
`vegan kimchi` carried one before or after.

That leaves a real gap, stated here rather than hidden: `animal_source` is set
on 676 nodes — `fish sauce`, `myeolchi`, `saeujeot` and `shrimp paste` all carry
`fish` — and `kimchi` carries nothing, so a vegan filter currently hides no
kimchi recipe at all. Tagging the node `fish` would be the wrong fix, since it
would hide recipes that work fine with the vegan jar. This is a question for the
user, once, in place — the shape §1 already uses for slots.

**Splits are the hard case and are deliberately not automated.** If `seaweed`
becomes three species, existing pantry rows cannot be assigned to a child
without knowing which the user meant. They redirect to the slot parent and the
user is asked once, in place — the same clarification the slot already requires
(`NORMALIZATION.md`, Slots).

---

## 2. States

Three states. `in_pantry` and `on_list` are independent; `use_first` is a
qualifier on `in_pantry`.

| state | meaning | source |
|---|---|---|
| `pantry` | I have it | DECISIONS §3 — a row means you have it, no row means you don't |
| `list` | I want to buy it | the grocery list |
| `use_first` | I have it AND it needs using | DECISIONS §3 — the entire urgency mechanism |

### Model

```
user_ingredient
  user_id
  ingredient_id
  in_pantry    boolean          -- I have it
  on_list      boolean          -- I want to buy it
  use_first    boolean          -- only meaningful with in_pantry
  added_at     timestamp        -- for the staleness nudge, NOT for expiry
  note         text?            -- user's own words
  portion      text?            -- "2 lb", "half a jar" — free text, NEVER matched on
  storage      'frozen' | 'chilled' | 'ambient' | null      -- see below
  -- grocery-list detail, meaningful only with on_list
  brand        text?            -- "Kikkoman"
  buy_instead  ingredient_id?   -- I'll buy this in place of the listed one
  attrs        jsonb            -- see §4
  primary key (user_id, ingredient_id)
```

**Independent flags, not a location enum.** Reviewer's call: an item can be in
the pantry AND on the list at once. "I have soy sauce and I'm nearly out" is
ordinary, and an enum would force a user to choose between recording what they
have and recording what they need — which loses whichever they do not pick.

**One row per (user, ingredient) — not a table per state.** A user's relationship
to an ingredient is one thing with several facets, and the facets change
independently: buying something flips `on_list` off and `in_pantry` on while
`note`, `added_at` and any pin must survive untouched. Separate tables would make
that a delete plus an insert and lose all three.

**`use_first` is a flag on the pantry row, not a third location.** It is a
property of something you have. Pinning an item you do not have is meaningless,
and the schema should say so rather than relying on the UI to prevent it.

**`added_at` is not an expiry date.** DECISIONS §3 killed `shelf_life_days`
because we never observe a purchase date, and `added_at` can trail the real
purchase by weeks. It exists only for the "this has been here a while" nudge,
which may hint but must never auto-pin.

### `storage` — where it is kept

**Deferred with the staleness nudge, and for the same reason it was accepted.**
The nudge moved out of v1 (`DECISIONS.md` §5), and the argument below is that
`storage` earns its place *by gating the nudge*. With no nudge there is no
consumer, and §4's test — name the source, the consumer, and how a wrong value
gets noticed — fails on the middle term. It ships when the nudge ships; the
design below is settled and needs no rework.

Reviewer's requirement: a pantry item records its current state — frozen, in the
fridge, dried.

**It earns its place because it gates the staleness nudge**, which is currently
broken without it. DECISIONS §3 killed `shelf_life_days` for want of a purchase
date, leaving "this has been here a while" as the only automatic pantry
corrective — and that nudge has no way to know that frozen dumplings from March
are fine while the coriander from Tuesday is not. Storage does not tell us how
long something lasts, but it tells us the ORDER OF MAGNITUDE, which is all the
nudge needs to stop nagging about the freezer.

It passes the test in §4: the value comes from the user, the nudge reads it, and
a wrong value announces itself the first time the nudge fires on something
frozen.

### The third value is `ambient`, not `dried`

The axis is **where the thing is kept**, not what was done to it. That distinction
is not pedantic — `dried` as a pantry state collides directly with the ontology,
where preservation is IDENTITY:

- `dried shiitake` and `shiitake` are different nodes, because drying is not
  something a cook does in one session (`NORMALIZATION.md`, preservation class).
- So a user holding `shiitake` and setting `storage = dried` would be asserting
  something the ontology says is impossible, and two fields would disagree about
  the same fact with no way to tell which is right.

Almost always, a user who means "my shiitake are dried" bought dried shiitake —
and the answer is the node `dried shiitake`, which already exists. If the app
ever wants to offer that, setting the state should *suggest changing the
ingredient*, never silently record a contradiction.

`ambient` covers what the reviewer meant by dried — shelf-stable, in the dry
cupboard — without claiming anything about how it got that way.

### `storage` does not affect matching in v1

Frozen chicken satisfies a recipe wanting chicken; it just needs thawing. That is
a friction the user can see for themselves, and encoding it would mean inventing
a weight for "inconvenient but possible" that nothing can calibrate. The field
drives the nudge and, later, which items are good candidates to suggest for the
Use-first shelf. It does not enter the score.

**Default is null, not `chilled`.** An unset value means we do not know, which is
true; a guessed one is the `shelf_life_days` mistake in miniature — a plausible
value that nothing corrects and that the nudge would then act on.

### Grocery-list detail

An item on the list carries things an item in the pantry does not: **brand**,
**portion to buy**, and **what to buy instead**.

### `portion` — recorded, never matched on

`portion` exists on pantry entries as well as list entries, and **matching reads
neither**. Reviewer's call:

> *"Recipe recommendation will be only based on presence, not portion. It's a
> user's job to track the portion, we will not help with it."*

This is what makes the field safe. DECISIONS §3 killed quantity tracking because
quantities decay invisibly — you cook half the onions and the number is silently
wrong forever. That reasoning was never about STORING the number; it was about
DEPENDING on it. A quantity nothing reads cannot make the system wrong. It is a
note the user keeps for themselves, in the same category as `note`, and free text
for the same reason: "half a jar" is a real answer that a numeric field rejects.

The rule that follows, and it is a hard one: **no query may filter, sort or score
on `portion`.** The moment matching reads it, every criticism DECISIONS §3 makes
of quantity tracking applies in full and the field has to go.

**`buy_instead` is a USER-DECLARED substitution and outranks the global table.**
If someone says they buy serrano in place of cheongyang, that is stronger
evidence for that user than `substitutes_for` — they know their shop. It feeds
matching directly: a recipe wanting cheongyang is satisfied by their serrano,
at exact-match strength rather than the discounted substitution weight.

### One widget, not four gestures

Tapping an ingredient anywhere — pantry, grocery list, or a recipe's ingredient
list — opens a small widget with three toggles:

```
   ┌──────────────────────────┐
   │  Gochujang               │
   │  ▢ In pantry             │
   │  ▢ On grocery list       │
   │  ▢ Use first             │
   └──────────────────────────┘
```

Reviewer's call, replacing the gesture vocabulary in UX-SPEC (double-tap to
add, swipe to remove, long-press to move). Three reasons it is better, and they
are the reasons the gestures existed in the first place:

- **The same control everywhere.** A user learns one thing, and it works
  identically on an ingredient they are reading about in a recipe and one they
  own. The gestures had different meanings in different sections.
- **State is visible before it is changed.** A toggle shows what is currently
  true. A swipe does not, so a user could not tell whether an item was already
  pinned without remembering.
- **Both flags are reachable in one interaction**, which is what makes §2's
  "pantry and list at once" usable rather than theoretical. Under the gesture
  model it was two separate moves and one of them destroyed the other.

The cost is one extra tap versus a double-tap-to-add. That is the right trade
only because add-from-recipe stays a single tap on the widget — UX-SPEC's
central claim is that adding must be effortless, and a toggle is still one tap.

---

## 3. Relations

Already implemented in `src/ontology/edges.ts`; specified here because the
matching semantics are the load-bearing part.

| relation | example | recipe wants A, user has B → match? |
|---|---|---|
| `is_a` (B narrower than A) | `chicken thigh is_a chicken` | **yes** — specific satisfies general |
| `is_a` (B broader than A) | recipe wants thigh, user has chicken | **no** |
| `derives_from` | `lemon juice derives_from lemon` | **yes** — whole satisfies part |
| reverse of derives_from | recipe wants lemon, user has lemon juice | **no** |
| `substitutes_for` | `cheongyang ↔ serrano` | yes, ranked below an exact hit |

**The asymmetry is the product.** DECISIONS §3, on exactly the user's examples:

> *"If a recipe says chicken thigh, the requirement is chicken thigh — not
> 'chicken'. The recipe author chose the cut, and overriding that is the same
> error as collapsing the soy sauces."*

So `light soy sauce is_a soy sauce` is a correct edge, and it must **not** make
generic soy sauce satisfy a recipe calling for light. The direction is what
carries that, which is why relations are stored as ordered pairs and never as an
undirected "related" edge.

**Relations are between global Ingredients only.** A UserIngredient has no
relations until it is promoted — we do not have the evidence to place a private
word in the graph, and guessing would put a wrong edge in front of one user with
no way for anyone else to correct it.

---

## 3a. Hierarchy — DRAFT

**Status: drafted, not built.** The semantics below are settled by the reviewer;
the edges they operate on mostly do not exist yet.

```
is_a edges in the ontology        7
ingredients                   2,885
```

Seven edges. §3 describes a hierarchy the data does not have, which is why
`basa` does not satisfy a recipe wanting `white fish` and why nobody noticed:
there is no edge to get it wrong with.

### The rule, in three cases

Reviewer's call, and it replaces §3's flat "specific satisfies general, never
the reverse":

| user has | recipe wants | | |
|---|---|---|---|
| `chicken thigh` | `chicken thigh` | **match** | silently — it is the same thing |
| `basa` | `white fish` | **match** | silently. Basa belongs to white fish, so there is nothing to check |
| `chicken thigh` | `chicken` | **match** | silently, and for the same reason |
| `white fish` | `basa` | **match, disclosed** | *"the recipe calls for basa and your pantry says white fish — check the source that what you have works"* |
| `chicken` | `chicken thigh` | **match, disclosed** | same shape |
| `chicken thigh` | `chicken breast` | **no match** | siblings. Neither belongs to the other |

**Disclosure follows the inclusion direction, and only one way.** Reviewer:
*"basa belongs to white fish, but white fish does not belong to basa; likewise
chicken thigh belongs to chicken, but not vice versa."*

So the specific in the pantry answers the general in the recipe outright —
basa IS a white fish, and asking the user to check that is asking them to
confirm the ontology. The uncertainty is entirely on the other side: a pantry
that says `white fish` has not said WHICH fish, and the recipe named one. That
row is where the note belongs, because that is the only row where the user
knows something the system does not.

### Why this is not a reversal of DECISIONS §3

§3 says the requirement is the cut the author chose, *"and overriding that is
the same error as collapsing the soy sauces."* That reasoning is right and its
conclusion — silently drop the recipe — is what §6 was later written against:

> *"Where the system cannot know, it ASKS — at the moment the answer matters,
> once, with the reason attached. It does not guess, and it does not silently
> decide the answer is no."*

A recipe saying `chicken` may mean thigh, or may mean breast, and we cannot tell
from the ingredient line. That is not a reason to decide for the user. **The
disclosure is the ask**, and it is the same shape as the yield-limited
clarification §6 already specifies. Nothing is collapsed: the two nodes stay
distinct, the match is ranked below an exact hit, and the user is told exactly
what the difference is.

### Siblings are the guard that makes it safe

`chicken thigh` and `chicken breast` share a parent and neither is an ancestor
of the other. They never match, in either direction, at any rank.

Without that rule, "match anything related" would let a thigh satisfy a breast
recipe through their common parent, which is the failure the whole section is
trying to avoid. **Relatedness travels along an ancestor line, never across
one.**

### The parent must be a real kind, not a shared head noun

Siblings are safe because the parent is honest. When the parent is only a word
the two names happen to end in, the ancestor line carries a claim nobody made —
and unlike a sibling match, nothing in §3a is watching for it.

`sesame oil is_a oil` was the case that proved it. The edge came from
`hierarchy.ts`, which derives a parent from the head noun and was recorded as
`suffix-bulk, "unflagged head-noun derivation, accepted by class"`. Two things
followed from it, both wrong:

- **`oil` in the pantry covered a recipe asking for `sesame oil`**, disclosed as
  "check the source". No amount of checking makes vegetable oil into toasted
  sesame oil. A cooking oil is a medium; a fragrance oil is a seasoning. They
  are not the same kind of thing and one is never the other in a pinch.
- **`sesame oil` in the pantry covered a recipe asking for `oil`, SILENTLY** —
  the descendant direction earns no disclosure at all. This was the worse half:
  1,885 mentions of sesame oil quietly answering 2,106 mentions of `oil`.

The file already contained the refutation. `aliases.csv` maps `canola oil`,
`corn oil`, `frying oil`, `salad oil`, `sunflower oil` and `cooking oil` onto
`oil` with the note **"neutral oil"** — a reviewed decision that `oil` means the
neutral one. A machine-derived edge was contradicting it.

**The rule.** An `is_a` edge asserts a kind, not a spelling. Before accepting a
head-noun derivation, ask whether the child is a *kind of* the parent or merely
a *thing made of* it — and whether the parent names one thing or several. Nine
edges were retired under this: `sesame oil`, `sesame seed oil`, `perilla oil`,
`perilla seed oil`, `chili oil`, `sichuan peppercorn oil`, `truffle oil` and
`anchovy oil` (seasonings, not media), plus `tuna in oil`, `anchovy filets in
oil` and `shrimp paste in oil`, where the head noun is not `oil` at all — a tin
of tuna was covering a recipe that wanted something to fry in. `olive oil`,
`avocado oil`, `peanut oil`, `coconut oil` and `grape seed oil` keep the parent,
because they genuinely are what `oil` means.

Retired, not deleted: the row stays in `is_a.csv` with an empty parent and the
reason in the note, and the build drops parentless rows. The record of the
mistake is worth more than the tidiness.

### The disclosure is per ingredient, not per recipe

It names both terms and it says where to check:

> This recipe calls for **chicken**. You have **chicken thigh**. Check the
> source — it may not work with what you have.

It appears in the recipe modal against the specific line, never as a badge on
the results grid. A recipe can carry more than one.

### Ranking

Specificity orders results and never gates them:

```
exact                 the recipe's own ingredient
ancestor / descendant matched, ranked below exact, disclosed
substitution          already ranked below both (§3)
```

A user holding `beef angus` sees angus-specific recipes above generic-beef ones.
That is the same ordering principle as the substitution weight, applied to a
different relation.

### Building the edges: two halves, and only one is cheap

**Derivable — one node's name is a token-suffix of another.** `beef angus is_a
beef`, `dried shiitake mushroom is_a shiitake mushroom is_a mushroom`. The same
key the merge tool uses, and most of the volume. It is mechanical, it is
reviewable in bulk, and it is wrong often enough to need a pass: `korean radish`
is not a radish in the way `red radish` is (`NORMALIZATION`'s `SYNONYM` table
already records that exact trap).

**Not derivable — the semantic half.** `basa is_a white fish`. `pollock is_a
white fish`. Nothing in either name says so, and this is the case that motivated
the section: people put `basa` in a pantry, not `white fish`.

### Open questions

- **Where does the semantic half come from?** A hand table does not scale to
  2,885 nodes; a model pass needs review and a benchmark before it is trusted.
  Undecided, and it is the whole cost of this section.
- **Does a disclosed match count as "cookable tonight"?** The zero-missing view
  is the product's core claim. A recipe matched only through an ancestor is not
  quite that, and putting it in the same list may weaken the claim the list
  makes.
- **Do disclosures compound?** Three disclosed ingredients in one recipe is
  probably not a recommendation. No threshold is set.
- **Does an ancestor match earn full friction relief?** §4c gives a main
  ingredient a heavier weight; an ancestor match on a MAIN ingredient is a
  bigger claim than one on a garnish, and the score does not currently know the
  difference.

---

## 4. Attributes, and how to add one

### There are no global attributes

`sourcing` is **cut**. Reviewer: *"It's a user's job to find where to source the
ingredient. Our affiliate system is just machinery to help it."*

It had two claimed consumers and neither survived the question:

- **The affiliate does not read it.** DECISIONS §2 calls specialty "the
  unlock/affiliate signal", but the real trigger is *the user is missing this and
  wants it* — known from the grocery list without any attribute. A buy link does
  not need to know the thing is hard to find.
- **The friction term was a global prior for a local fact.** Someone who cooks
  Korean food probably lives near a Korean grocer, so `gochugaru = specialty` was
  wrong for exactly the user we are building for. DECISIONS §4 becomes
  `friction(i) = w_base` — every missing ingredient costs the same, which it
  already did for every pair except supermarket/specialty.

`ubiquity` and `shelf_life_days` went for want of a data source; `sourcing` goes
because nothing read it.

### Except allergens and animal source, which pass

```
allergens      ('peanut' | 'treenut' | 'milk' | 'egg' | 'soy' | 'wheat' |
                'fish' | 'shellfish' | 'sesame')[]
animal_source  'meat' | 'fish' | 'dairy' | 'egg' | null
```

These are the only attributes to survive the test, and they survive it cleanly:
the vocabulary is closed and externally defined (the major-allergen lists are not
ours to invent), the consumer is the dietary filter (`USER-SPEC.md` §6), and a
wrong value announces itself the first time a filtered recipe appears — loudly,
because of what it is about.

`animal_source` is separate from `allergens` because it answers a different
question. Vegetarian is a choice about provenance; milk allergy is a reaction to
a protein. An ingredient can be one without the other — gelatin is meat-derived
and not an allergen; sesame oil is an allergen and not animal.

**Scope, measured against the current node list:** a lexicon pass matches 749 of
3,147 nodes (24%) on at least one allergen and 684 (22%) as animal-derived, with
wheat 260, milk 119, fish 117, soy 98 and shellfish 85 the largest classes. So
this is a review of roughly a quarter of the ontology, not all of it — and unlike
sourcing, the failure mode is not "a slightly worse ranking".

**A missing tag is the dangerous direction**, so review must be biased toward
over-tagging: an ingredient wrongly marked as containing soy costs a hidden
recipe, and one wrongly marked clean costs something else entirely. The
`unresolved` gate in `USER-SPEC.md` §6 is what covers the tags nobody has added
yet.

### PantryEntry — open, per user

`note` and `expiry_date` are first-class columns because they are already known
to be wanted. Everything else goes in `attrs jsonb` until it earns a column.

**The rule for promoting a key out of `attrs`:** it is read by a query, not just
displayed. A field the app only echoes back to the user can live in the bag
forever; a field the matcher filters or sorts on needs a column and an index.

**`expiry_date` is user-entered and optional, and does not resurrect
`shelf_life_days`.** The distinction matters: a date the user typed is an
observation, and a date we computed from a shelf-life table is a guess. The
first may drive a nudge; the second was cut for being confidently wrong.

---

## 5. Vocabulary growth

### The engine is the gate

When a user types a name, it goes through the **same pipeline as the corpus** —
parser → normalize → alias table (`NORMALIZATION.md`). Only then:

```
resolves to a known Ingredient   →  attach to it. No new entity.
does not resolve                 →  create a UserIngredient, private to them.
```

**Most "new" ingredients are not new.** A user typing `Gochujang paste`,
`toasted sesame oil` or `scallions` is naming something we already have under a
different surface. Skipping this step would fill the private vocabulary with
duplicates of the public one and make the promotion queue useless.

### Lifecycle

```
  private          one user's word. Never shown to anyone else. Ever.
     ↓  seen by N distinct users, after normalisation
  candidate        appears in the promotion queue with its usage count
     ↓  review
  global           a real Ingredient; every UserIngredient row redirects to it
```

**Privacy is a hard constraint, not a default.** A UserIngredient is never
visible to another user, never appears in search, never appears in a shared
list. The aggregate that feeds promotion carries **counts and normalised
strings only** — never user ids, never notes, never which user contributed what.

**Aggregation happens on the normalised form**, so `Gochujang`, `gochujang
paste` and `go chu jang` are one candidate with three mentions rather than three
candidates with one. This is the same collapse the corpus review depends on, and
it is the difference between a queue of 50 real gaps and a queue of 4,000
spellings.

**N is set empirically** — reviewer's call — so it is a configuration value, not
a constant in code, and the promotion queue must record what would have been
promoted at each threshold rather than only at the current one. Two things have
to be true whatever N turns out to be:

- the count is over **distinct users**, never mentions — confirmed by the
  reviewer. One person adding an item ten times is one person's opinion.
- the queue reports **precision at each threshold** — of the candidates at N=2,
  N=3, N=5, how many survived review? That is the measurement that sets N, and
  it only exists if the queue is instrumented before the first promotion rather
  than after.

## 6. Clarifications — asking when ambiguous

Reviewer, on whether adding kimchi should also add kimchi juice:

> *"At least it should be ASKED to the user, while mentioning that kimchi juice
> is a useful ingredient for many recipes. This can apply for other cases I
> cannot think of now. But this 'asking when ambiguous' should not be spared in
> our system."*

This is a principle, and it reframes three mechanisms that were already here as
one thing.

### The rule

> **Where the system cannot know, it ASKS — at the moment the answer matters,
> once, with the reason attached. It does not guess, and it does not silently
> decide the answer is no.**

Silently deciding is what the system did before. `kimchi → kimchi juice` was left
out of `derives_from` because a pantry-sized jar may not yield a recipe-sized cup
of brine (§3). That reasoning is right and the conclusion was wrong: not knowing
whether someone has enough brine is a reason to ask them, not a reason to decide
for them. The cost of the silent no is a user who owns kimchi juice being told
they cannot make a dish that needs it.

### Three existing mechanisms, one shape

| | the ambiguity | before |
|---|---|---|
| **slots** | which seaweed is this? | already asked |
| **yield-limited derivatives** | does your kimchi have enough brine? | silently no |
| **substitutions** | would serrano do here? | silently no |

A fourth case turned out NOT to belong here at all. "Green or red chili peppers"
is not an ambiguity to resolve — the author already answered it, for that dish.
Those are recipe-level alternates (`RECIPE-SPEC.md` §1) and they need no
question and no review.

`YIELD_LIMITED` (§3) is already exactly the list of cases where the whole may or
may not supply the part. It was modelled as "no edge". It should have been "a
question", and it is the seed list for the first clarifications.

### Shape

```
clarification
  id
  trigger_ingredient   asking is prompted when this enters the pantry
  question             "Does your kimchi have enough juice to cook with?"
  because              "Kimchi juice is called for in 34 recipes"
  grants               ingredient_id — what a yes adds to the pantry
```

Answers live on the user as a CURRENT STATE, not a settled preference, and are
always visible in the item's own widget. An unanswered clarification is not a
blocker: the pantry works, the matcher simply does not credit the ungranted
ingredient.

### Rules that keep this from becoming nagging

Every one of these exists because a clarification system is easy to build and
easy to make hateful.

- **At the moment it matters, never in a settings screen.** The question fires
  when kimchi is added, where the user is already thinking about kimchi.
- **Say why.** *"Kimchi juice is called for in 34 recipes"* is the difference
  between a question and an interruption. The number is real and computable from
  the corpus, so it must be shown rather than asserted.
- **Every time, not once.** Reviewer: *"it depends on the situation. It should
  ask every time."* Right — this month the kimchi is swimming in brine and next
  month it is not, so an answer stored once and never revisited is a wrong answer
  waiting to happen. The question therefore lives PERMANENTLY in the item's
  widget showing its current answer, rather than firing once and vanishing.
  That is what makes "every time" compatible with "never nagging": the widget
  opens only when the user taps the ingredient, so the question appears exactly
  when they are already looking at the thing it is about. Flipping it is one tap,
  and flipping to no takes the granted ingredient back out.
- **Never block.** No modal, no gate, no required field.
- **Only where the answer changes something.** A clarification whose `grants`
  unlocks nothing in the corpus is noise, and the count in `because` is what
  proves it does not.

---

## 7. Status

Identity is **implemented** — `src/ontology/identity.ts`, asserted by
`npm run test-identity`.

| | before | now |
|---|---|---|
| ids | slug of the display name | `ing_` + 12 opaque chars, in `data/ontology/identity.csv` |
| renames | changed the id | the old name keeps its id forever |
| merges | node vanished | retired behind a redirect, resolves transitively |
| `ontology.yaml` | `id: chicken-thighs` | `id: ing_…` with `slug:` alongside |
| `recipe-index.json` | referenced slugs | references ids |

`data/ontology/identity.csv` is now the most valuable file in the repo, and the
only one that cannot be regenerated. Everything else — the YAML, the index, even
the node list — is derived and rebuildable. Lose this and every id changes, which
means every pantry row ever written points at nothing.

The retirement step runs in the ontology build: a name that has fallen out of the
node list AND has an alias pointing at a live node is retired behind a redirect.
A name that vanishes with no alias is left alone rather than guessed at — it may
be a candidate demoted this run and promoted the next, and inventing a redirect
to a node nobody chose is worse than an id that currently resolves to nothing.

**Still outstanding:** `user_ingredient`, `UserIngredient` and the promotion
queue are specified here but not built — they need the app and its database,
which do not exist yet (BUILD.md Phase A).
