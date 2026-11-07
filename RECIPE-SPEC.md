# Recipe — entity spec

Companion to `INGREDIENT-SPEC.md`. Same shape: a public thing, a private
relationship, and the rules for how they meet.

---

## 0. Three entities again

| | what | scope |
|---|---|---|
| **Recipe** | a dish that exists on someone else's website | global, shared |
| **UserRecipe** | this user's relationship to it — saved, notes | per user, private |
| **CookEvent** | one occasion of cooking it | per user, private, append-only |

The split matters more here than for ingredients, because a Recipe is **not
ours**. We never host it (DECISIONS §2). Everything a user creates around it —
their rating, what they substituted, that they cooked it on a Tuesday — is ours
and theirs, and lives entirely on the private side.

---

## 1. What a Recipe stores, and what it must not

```
recipe
  id            rec_…            opaque, permanent (§2)
  source_url    https://…        where it lives. May change; never a key
  source_id     koreanbapsang    which blog
  title         text
  thumb         hash?            cached derivative, never the original (§1a)
  thumb_src     https://…        the og:image it came from — attribution, revalidation
  thumb_at      date             when we last confirmed thumb_src (§1a)
  lqip          text?            ~20px base64, inlined for first paint
  cuisine       korean | …       inferred, abstains (§4)
  dish_type     main | side | …  controlled vocabulary (§4)
  requires      ingredient_id[]  the join to the pantry
  alternates    {id: [id]}       substitutions THIS RECIPE offers (§3a)
  optional      ingredient_id[]  garnishes; missing one costs nothing
  unresolved    text[]           surfaces we could not place
  yield         text?
  first_seen    date
  last_seen     date             (§5)
  content_hash  text             (§5)
```

**No instructions. Not now, not later.** DECISIONS §2 is link-out only, and this
is where that decision becomes a schema constraint rather than a policy. An
ingredient list is a list of facts; a method is authored expression. Storing the
method would make us a host, would break the affiliate framing, and would put the
legal position of the whole product on a field nothing needs — matching reads
`requires` and the user clicks through to cook.

**Images are a cached derivative or absent** — see §1a, which reverses an earlier
rule and explains what that costs.

---

## 1a. Thumbnails are cached derivatives

**This section reverses "images are hotlinked or absent."** That rule was right
about the risk and wrong about the product. Worth keeping the original reasoning
visible, because the reversal is narrow and the parts it does not touch are the
parts that matter.

### Why it changed

The product is browse-first. A pantry match returns twenty near-identical stews
(§10.3) and the user chooses between them — that choice is made on a grid, and a
grid of titles is a worse instrument than a grid of pictures. Recipe thumbnails
earn their place in a way ingredient photography never did (`UX-SPEC.md` §3).

Hotlinking made page speed a function of twenty other people's origins. `og:image`
is a share card — typically 1200px and 200–500KB, sized for Facebook's crawler,
not our grid. Forty of those, fetched from forty blogs we do not control, is the
slowest possible way to render a list. A 300px WebP derivative is ~20KB and comes
off our own disk. **Caching is how this product gets both pictures and speed**;
hotlinking offered neither.

### What it costs, stated plainly

Hotlinking is not a copy — the bytes never touch our server. Caching makes us the
one serving them. We move from *no copyright question* to *a copyright question
with a good answer*, and the answer is the one `DECISIONS.md` §6 was already
written around: reduced-size thumbnails, visible attribution, no cropped
watermarks, same-day takedown. That posture is the strongest ground in image law,
and it is entirely conditional on staying small.

So the rule is not "cache the image." It is:

> **Cache a resized derivative. Never store the original.**

At 300/600px we are serving an index, not a substitute for the source's own asset.
At 1200px we are serving the asset, and the defence we are relying on stops
applying. The original bytes are resized in flight and discarded — **the full-size
image must never land on disk**, not in a temp dir, not in a cache, not "just
during ingest." A pipeline that writes it and deletes it later has already made
the copy this rule exists to prevent.

### The fail-safe has to be rebuilt, not dropped

The old rule fails safe by construction: pull the image at the source and it
vanishes from our site the same moment. **Caching inverts that** — we keep serving
what the source withdrew, which is the exact scenario the original line was
written to prevent. Nobody notices, because everything still looks fine.

So the mechanism has to be replaced explicitly, or the change is a straight
downgrade:

- `thumb_at` records when `thumb_src` was last confirmed to exist.
- A revalidation pass re-checks `thumb_src` on a fixed interval. **404, 403, or a
  host that stops resolving deletes the derivative and nulls `thumb`.**
- Takedown by request is the same code path, run immediately rather than on
  schedule — which is what makes "same-day" in `DECISIONS.md` §6 an operation
  rather than an intention.

Staleness (§5) already re-fetches pages for `content_hash`; revalidation belongs
in that pass, not in a job of its own.

### `null` is a first-class value, not an error

Some sources block hotlinking by referrer, some publish no `og:image`, some 404 on
their own CDN. Offline ingest turns all of that into a known `thumb = null` at
crawl time rather than a broken image in a user's grid — **which is the second
reason this belongs in the pipeline and not in a request-time optimizer.**

The grid must therefore be designed for a mixed result: a text-only card is a
normal card, appearing alongside thumbed ones, and it must look deliberate rather
than broken.

#### Field note, 2026-08-20 — the block is the user-agent, not the address

`check-images.ts` and `dead-images.json` both record futuredish as *"a
SiteGround CAPTCHA page — an HTML body under a 200, to every datacentre IP, for
every image on the host"*, and conclude *"those load fine in a real browser."*
**Both halves of that are now wrong, and the second one is the expensive half.**

Measured against `futuredish.com/wp-content/uploads/2019/01/KoreanSausageBread.jpg`,
every request from this same VM, same IP, varying only the agent:

| agent | result |
|---|---|
| Mac Safari | **200** |
| iPhone Safari | **200** |
| `curl/8.5.0` | **200** |
| bare `Mozilla/5.0` | **200** |
| Windows Chrome | **403** |
| Linux Chrome | **403** |
| HeadlessChrome | **403** |

It is not a CAPTCHA and it is not a 200 with an interstitial body — it is a hard
403. It is not the IP: the same IP is served happily under Safari. And it is not
hotlinking, which is the reading the file name `dead-images.json` invites. The
referer makes no difference in any direction:

```
Chrome UA + futuredish's OWN recipe page as referer   →  403
Chrome UA + our site as referer                       →  403
Chrome UA + no referer                                →  403
Safari UA + our site as referer                       →  200
```

A rule that blocks Chrome and permits curl is nobody's anti-hotlink policy. It
is a misconfigured bot filter, and the thing worth sitting with is that **it
breaks futuredish's own site for its own Chrome visitors** — which is most of
the web. Confirmed host-wide on a six-URL sample: Chrome 403, Safari 200, all
six.

**What is NOT established:** every probe here left a datacentre IP. Whether a
Chrome browser on a domestic connection is also refused is untested and untestable
from this box, and it is the whole question — it decides whether 362 images are
broken for most visitors or for none. `RUNBOOK` §1's home-machine pattern
answers it in five minutes and nothing else does. **Until someone runs it, treat
"those load fine in a real browser" as an assumption, not a finding.**

Two consequences already in the code:

- **`check-images.ts` probes with a Windows Chrome agent** — precisely the
  blocked class. Its whole-host exclusion still saves it from blanking the
  corpus, so the safeguard holds and the diagnosis under it does not.
- **`maangchi.com` is a different animal and the existing rule already covers
  it**: 403 under Safari, Chrome and iPhone alike, while siblings on the host
  return 200. That is this file's stated test for dead, and 24 of its images are
  eligible. The other 344 Maangchi recipes point at `i.ytimg.com` and are fine —
  a source is not its host.

Shipped alongside this: `components/Shot.tsx`, a client-side fallback so a
photograph that fails renders the surface's own "no photo" treatment instead of
the browser's broken glyph. **It is a net, not a cure** — this section still
wants the cached derivative, and `cache-images.ts` is still the sanctioned route
for a challenge-walled host. What the net buys is that the next host to start
refusing does not put a broken tile on the home grid before anyone notices. `lqip` covers the other direction — the ~20px inline placeholder
holds the layout at final aspect ratio so a slow or missing image never shifts the
page.

### What this does not license

- **Instructions are still never stored.** §1 is unchanged and unaffected.
- **Ingredient photography is still out** (`UX-SPEC.md` §3). Recipe thumbnails are
  a browse affordance; ingredient chips stay text.
- **Attribution is not optional.** `thumb_src` exists to be displayed, not merely
  to be revalidated. A cached thumbnail with the source stripped is a different
  legal object than the one this section argues for.

---

## 2. Identity

Same rule as ingredients (`INGREDIENT-SPEC.md` §1), for the same reason: user
data points at these forever.

> **The id is opaque and permanent. `source_url` is an attribute, not a key.**

URLs are worse than ingredient names, not better. They change on site
redesigns, acquire tracking parameters, get 301-redirected, and are frequently
served in two forms (`/recipe/x` and `/recipe/x/`). Keying off one would break a
user's cook history the first time a blogger moved to a new CMS.

**A recipe survives its source dying.** If the URL 404s the recipe becomes
unmakeable — it drops out of matching and the app says the source is gone — but
the row stays and so does every CookEvent pointing at it. Deleting it would erase
the user's record of having cooked something, which is theirs, not the
blogger's. This is the one place where our data outliving the source is
correct rather than presumptuous.

---

## 3. `requires` changes underneath the user

The ingredient list on a Recipe is not a fact about the world; it is **our
current parse of someone's HTML**, and it changes when the engine improves or the
blogger edits the post. Between two cooks of the same recipe, `requires` can gain
or lose nodes.

**A CookEvent snapshots what was required at the time.** Without that,
"I substituted X for Y" becomes unreadable the moment Y stops being in the list,
and "I had everything" silently becomes false. The snapshot is small, immutable
and the only thing that makes cook history trustworthy over years.

The live `requires` drives matching. The snapshot drives history. They are
different questions and it is a mistake to answer both from one field.

---

## 3a. Recipe-level alternates

"1 - 2 green or red chili peppers" is the author saying red works **in this
dish**. Reviewer: *"it's not a global substitute. The recipe said red chili
pepper as a substitute."*

That distinction carries real weight:

| | claim | needs review? | strength when matching |
|---|---|---|---|
| `substitutes_for` (ontology) | red chili substitutes for green, generally | **yes** | discounted |
| `alternates` (this recipe) | red chili works in THIS dish | **no** | **full** |

The second needs no review because the author already made the judgement, and it
must not be discounted: a recipe offering red chili in place of green is not
making a compromise, it is describing itself.

1,087 recipes carry at least one, 1,779 in total — `prawns ← shrimp`,
`soft tofu ← silken tofu`, `yukon potatoes ← russet potatoes`. All of it was
being thrown away at the `or` split before the curation screen surfaced it.

### An alternative is a GROUP, not an item

```
alternates  { requirement_id: [ [id], [id, id, id] ] }
                               └ OR ─────────────┘
                                     └ AND ────┘
```

**Some substitutes are a combination.** The curated case is tempura mix:

> `1 cup twiguim garu (premade tempura batter mix*)` → *"subs: egg + ice + flour"*

Three ingredients that stand in **together**. A flat `string[]` cannot say that,
and flattening it is not a lossy simplification — it is a false claim: it asserts
flour alone substitutes for tempura mix, so the matcher reports a recipe as
cookable when it is not. That is the failure mode this whole file is organised
against (§1: never quietly understate what a recipe needs).

So `cover()` uses **`every`, not `some`**, over each group, and reports the route
as `recipe-alternate-combo` when the group has more than one member — worth
distinguishing in the UI, because "you can swap in sriracha" and "you can swap in
three things you'd have to assemble" are different offers to a cook.

**`length && every` — the guard is load-bearing.** `[].every(...)` is `true`, so an
empty group would satisfy every requirement it appeared under. There is a test.

**Every group in the artifact today has exactly one member.** The shape changed
first, on purpose: the parser does not yet read combinations, and adding them to a
flat list later would have meant either a second migration of a 4,874-row artifact
or a window where combinations were recorded wrongly.

### The 125 lines we know we are still dropping

Measured, not estimated — lines with a conjunction inside an `or`:

| source | lines | source | lines |
|---|---:|---|---:|
| seonkyounglongest | 24 | twoplaidaprons | 7 |
| koreanbapsang | 23 | futuredish | 6 |
| thewoksoflife | 21 | mykoreankitchen | 5 |
| maangchi | 17 | beyondkimchee | 7 |

Real ones, all currently recorded as `alts: []`:

- `(or boned chicken thighs and drumsticks)`
- `(or 1:1 mix of all-purpose flour and cake flour)`
- `(or equal parts cheddar and Monterey jack cheese)`

**The current cost is silent loss, not wrong answers** — `alternatives()` requires
each side to resolve to a known node, and `chicken thighs and drumsticks` does
not, so the whole alternative is discarded. That is why the model change had to
land first: harvesting these into the old shape would have converted 125 quiet
omissions into 125 false positives.

Also visible in the same measurement and also unbuilt: verb-phrase substitutes —
`(or substitute with 1 Jalapeno)`, `(or replace with soy sauce)`, `(or replace half
with Russet potatoes)`. The last one is a **partial** replacement, which the group
model still cannot express and probably should not try to.

---

## 4. UserRecipe and CookEvent

```
user_recipe
  user_id
  recipe_id
  saved         boolean          -- explicit save
  note          text?            -- their standing note on the dish
  first_cooked  date?            -- denormalised, see §6
  last_cooked   date?            -- denormalised, see §6
  cook_count    int              -- denormalised, see §6
  attrs         jsonb
  primary key (user_id, recipe_id)

cook_event
  id
  user_id
  recipe_id
  cooked_at     timestamp
  rating        int?             -- 1..5, this cooking
  note          text?            -- "too salty, halve the gochujang"
  required      ingredient_id[]  -- SNAPSHOT of recipe.requires (§3)
  substituted   [{ wanted, used }]  -- both ingredient_ids
  skipped       ingredient_id[]  -- left out entirely
```

**A row exists as soon as the user saves OR cooks.** Reviewer's model: saving
creates the private membership, and every "Made it" appends an event. Saving
without cooking is a real state (a plan), and cooking without saving is too (a
whim) — neither implies the other, so `saved` is a flag rather than the row's
existence condition.

**CookEvent is append-only, with one boundary and one exception.**  It is a log
of things that happened. Editing a past cook is editing history; correcting a
mistake means adding a note, not rewriting the row. This also makes the
aggregates in §6 safe to cache.

The **boundary** is WHICH FIELDS, not which event. `amendCook` fills in a cook's
rating, note and substitutions after the fact, because UX-SPEC §5 forbids taxing
the "Made it" tap with a form — the event is logged instantly and the answers
arrive whenever the cook gets to them. What it can never write is the facts of
the cooking: `cooked_at`, `required`, `recipe_id`.

It takes a COOK ID, not a recipe id. "Most recent" was the obvious guard and the
calendar breaks it: a meal planned for Monday can be ticked off and rated on
Friday, by which time Wednesday's dinner is the recent one. Pointing at the event
says which meal is meant, whichever surface the user came from — `latestCook` is
what the modal uses when it was opened from the grid and there is no date in play.

**`cooked_at` may be supplied, and may not be in the future.** The calendar binds
a recipe to a date, so the event belongs to the day it was cooked rather than the
day it was recorded. A future date is refused at the store, not merely hidden in
the UI: a cook is a thing that happened, and a log that accepts tomorrow's dinner
cannot be trusted about yesterday's. One day of slack, so a user in a timezone
ahead of the server is not told their dinner is impossible.

The **exception**: `undoCook` removes the most recent cook entirely, and its
rating and note go with it. Reviewer's call, and the honest one — an accidental
tap should not leave a permanent event, and a rating attached to a meal that
never happened is worse data than no rating. It does NOT reverse the pantry:
`recordCook` is additive (DECISIONS §5) and nothing records which rows it created
versus which were already there, so undoing could delete ingredients the user
added by hand. The UI says so rather than guessing.

Ties matter here. Two cooks can share a millisecond, so `cooked_at` alone does
not order them — both scans prefer the event appended LATER, and event ids carry
a random suffix so a same-millisecond pair stays distinguishable.

**Rating lives on the event, not the recipe.** "It was better the second time" is
a normal thing to be true, and a single recipe-level rating cannot express it.
What the UI shows as "your rating" is the latest event's rating — a display
choice, revisable, not a storage one.

**"Made it" is additive to the pantry** (DECISIONS §5): the cook event is the
moment we learn the user actually had those ingredients, so it confirms pantry
presence. It never decrements — DECISIONS §3 killed quantity tracking, so there
is nothing to decrement.

---

## 4d. PlanEntry — the calendar

```
plan_entry
  id
  user_id
  recipe_id
  date       YYYY-MM-DD    -- a DAY, not a timestamp
  meal       text          -- breakfast | lunch | dinner | snack | anything typed
  created_at
  cook_id    ?             -- the CookEvent it became, once it did
```

**A plan and a cook are two rows, not one row with a status.** A plan is an
intention; a CookEvent is a record of something that happened. Collapsing them
breaks in both directions — cooking something never planned would write a plan
retroactively for a thing nobody planned, and a plan that was never cooked, which
is real data about what you meant to do, would be indistinguishable from one that
was. So the plan points AT the cook.

It follows that **unplanning does not delete the cook.** Removing Monday's dinner
from the calendar after you ate it must not remove the record that you ate it;
that is `undoCook`, and it is a separate decision.

`meal` is free text rather than an enum with an escape hatch, because the escape
hatch would be the same field. The four common slots are what the UI offers.

**CookEvent carries a `meal` too, and it is asked AFTER the tap.** Without it,
two cooks of one dish on one day are one ambiguous row — lunch and dinner are
different meals. It is optional because the question comes after the cook is
already recorded: the tap is never taxed (UX-SPEC §5), so an unanswered slot is a
normal state rather than a defect. Unlike `cooked_at`, it stays writable — the
user is reporting a fact late, not overwriting one we observed.

**Ticking off a planned meal links to its plan** rather than writing a second,
unrelated record of the same dinner. The calendar renders a linked plan as done
and does not list its cook again. A cook with no plan behind it is still shown:
it happened, and a calendar of intentions only is not a record.

### The calendar is a column of days

**A week across is the wrong axis.** Seven columns gives each day a seventh of
the screen and each meal inside it a sliver, so the layout's widest dimension is
spent on the thing there are fewest of — days — and its narrowest on the thing
that varies — what is in them. A phone already stacks them (`.week` collapses to
one column under 720px), which is the tell: the stacked version was the readable
one all along and the desktop grid was the exception.

So the calendar is a **column of days, always**. One row per day, full width.
Within a day, entries sit **side by side**, because a day with three things in it
is a row of three cards and not a stack — the day is the unit you scan, and
scanning a column means each unit should be one line of the eye, not three.

**The meal slot stops being a container and becomes a label.** Seven days x four
slots is 28 boxes, most of them empty, and an empty box is a question the product
is asking that the user did not ask for. An entry carries its meal as text; a day
with nothing in it is one empty row saying so.

### A day can hold something that is not a recipe

```
plan_entry
  recipe_id  ?             -- absent on a note
  label      text ?        -- what to call it when there is no recipe
```

"Eat out". "Uber". "Leftovers". "At mum's". These are the most useful entries on
a meal plan and the schema had nowhere to put them, because `recipe_id` was
required and every entry was assumed to be something you cook.

The precedent is already in the store: a grocery row the user typed carries a
`txt_` id and a `label`, resolves to nothing, and matches no recipe. A plan note
is the same shape one level up.

**A note is not a meal you have not chosen yet — it is a meal you have.** That
distinction is the whole reason it earns a row rather than being a blank square:

- It **removes** the day from the shopping question. `planNeeds` walks the next
  seven days asking what you are short of; a day marked "eat out" is a day that
  needs nothing, and counting it would put ingredients on a list for a dinner
  the user has already told us is not happening.
- It is never `done`, never links to a cook, and never offers "Made it". There is
  nothing to record; the note IS the record.

**Open questions**

- ~~**How many days?**~~ **Settled: a rolling seven from today, scrolling for
  more.** Not a calendar week — on a Friday "this week" means three days, and a
  plan that shrinks as the week runs out is at its least useful exactly when
  shopping is most imminent. The seven-day window `planNeeds` already walks then
  means the same thing on every day of the week, which it did not before.
- **Does a note suppress recommendations for that day too**, or only shopping?
  Only shopping, as built: a note contributes nothing to `planNeeds` because
  `planStatuses` needs a recipe to compute anything. Recommendations are not
  day-scoped, so there is nothing there to suppress yet.

### The modal carries a date

The recommendation grid, the calendar and a recipe's own page open the SAME
modal, and what distinguishes them is one parameter: `?recipe=X&date=Y`,
defaulting to today. The grid opens today implicitly; a calendar cell opens its
own square; a recipe page opens today and lets you change it.

**History is not bound to that date.** The two were conflated once and binding
the modal to a date is what exposed it: "what I did last time, and how it went" —
which UX-SPEC §5 calls the strongest reason to open the modal at all — would be
blank for every recipe last cooked before today, which is nearly all of them.
So the modal shows history unconditionally and acts on the date separately.

---

## 4a. Classification: cuisine and dish type

Two controlled fields, both derived, both allowed to abstain.

### Where the data already stands

```
cuisine     4,025 / 4,874 resolved (83%)     korean 2,531 · chinese 1,076 · japanese 281 · thai 96 · …
category    3,721 / 4,874 present  (76%)     raw JSON-LD recipeCategory — unusable as-is
```

`cuisine` is inferred by `src/ingest/cuisine.ts` with weighted evidence and a
margin threshold, and the 17% it leaves blank is **abstention, not failure**. A
recipe we cannot place stays unplaced; guessing would put Chinese recipes in a
Korean index, which is worse than a gap.

`category` is the raw `recipeCategory` string and it **mixes at least four axes**:

| axis | examples in the corpus |
|---|---|
| dish type | main course 405, appetizer 337, dessert 247, side dish 246, soup 114 |
| meal time | dinner 208, breakfast 106 |
| main ingredient | pork 92, beef 78, chicken 59 |
| difficulty | easy 130, medium 49 |

So it cannot be used directly. This is the ingredient problem again — a messy
surface vocabulary that needs mapping to a controlled one — and it takes the same
machinery: a lexicon, an abstention rule, and a review queue for what neither
places.

### `dish_type` is one axis, not a bag

Only **role at the table**. Meal time, main ingredient and difficulty are
different questions, and merging them produces a field that cannot be filtered on
— "show me sides" would return pork.

Proposed vocabulary, shaped by how the target cuisine actually structures a meal:

| value | Korean | note |
|---|---|---|
| `main` | 메인 | the centrepiece |
| `side` | 반찬 banchan | **not a lesser dish.** A Korean meal is several of these |
| `soup-stew` | 국 / 찌개 guk, jjigae | its own role; a jjigae is often the centrepiece |
| `rice-noodle` | 밥 / 면 bap, myeon | the staple base |
| `pickle-preserve` | 김치 / 장아찌 | made ahead, kept for weeks — distinct from `side` |
| `sauce-condiment` | 장 jang | a recipe in its own right in this cuisine |
| `snack-street` | 분식 | |
| `dessert` | | |
| `drink` | | |

**`side` and `soup-stew` are separate values on purpose.** Collapsing them into
a Western main/side/dessert frame is the same category error as collapsing the
soy sauces (DECISIONS §3): it describes the cuisine in someone else's terms and
loses the distinction a user is actually shopping for. Banchan is the reason
"what else can I make with what is left" is a real question for this user.

### Inference, and the signal already in the titles

For the 24% with no category, **Korean dish names carry their type as a suffix** —
`-jjigae`/`-guk`/`-tang` → `soup-stew`, `-muchim`/`-namul` → `side`,
`-bokkeum` → `main`, `-jeon` → `side`, `-bap` → `rice-noodle`, `-kimchi`/
`-jangajji` → `pickle-preserve`. That is a strong, cheap signal and it is the
same trick the cuisine classifier uses.

**Abstain rather than default.** An unclassified recipe is a gap in a filter; a
wrongly classified one is a wrong answer, and `main` is the tempting default that
would swallow every unplaced side dish.

### The structural value beats being the centrepiece

**The curator's decision, 2026-08-09.** Jajangmyeon, kimbap and curry rice are
`rice-noodle`. Tteok mandu guk and haemul jeongol are `soup-stew`. All five are
the whole meal on the table and none of them is `main`.

The rule was implicit and therefore went both ways. §4a already said a jjigae "is
often the centrepiece" and is still its own role — but the first 38 curated rows
filed five of these as `main`, and a drafting pass filed them structurally. One
of the two had to be wrong, and the question that settles it is what the field is
FOR: `main` has to mean something a filter can return, and "the important one"
is not a property of a dish. **`main` is a centrepiece that is not a soup, a
staple base, a pickle, a sauce, a snack, a dessert or a drink** — a grilled meat,
a braise, a stir-fry of meat or seafood.

Two consequences, both deliberate:

- **A vegetable dish is `side` whatever its suffix says.** `-bokkeum` reads as
  `main` in the suffix table above, and stir-fried garlic scapes is banchan.
  The suffix hint holds for meat and seafood only.
- **Five of the first 38 curated rows are stale under this rule** and are left
  standing rather than rewritten. Editing a human's saved judgement to match a
  rule settled afterwards would make the curation file — which is the parser's
  test set — a record of what we currently believe rather than of what a person
  decided. They get corrected when they are next revisited, by hand.

### `make_ahead` means started on an earlier day

**The curator's decision, 2026-08-09.** Not "has a wait", and not the derived
`leadMinutes >= 60` the form defaults to. Kimchi and other ferments, an overnight
marinade, a long brine, a dough left to rise overnight. A 30-minute marinade, an
hour in the fridge, and a three-hour braise are all `false`.

The bar is deliberately high because the field is asymmetric. §12 of UX-SPEC
spends the one urgency mechanism this product has on the same idea: a short wait
is an inconvenience, and **a wrong `true` makes a perfectly cookable dinner look
impossible**. Under-reporting costs someone an inconvenience; over-reporting
costs them the recipe.

The first 38 curated rows disagree with each other on this — Oi Sobagi and flank
steak bulgogi were filed `true`, yeolmu kimchi `false` — which is what a field
with no written bar produces, and is the reason the bar is now written.

### Cook time is not collected — reversed

**The curator's decision, 2026-08-09.** This section used to specify five
buckets and the rules for bucketing them. None of it is collected any more.

The band was the right answer to the wrong question. Banding fixed FALSE
PRECISION — "47 min" claims a reading nobody took — and what it could not fix is
that **the number is a fact about the cook, not about the dish**. The same recipe
is twenty minutes for someone who preps fast and an hour for someone who does
not, and there is no bucket that is true for both. A band is a more honest way of
stating something we should not be stating.

It also failed the test any curation field has to pass: **it cost a judgement on
every single recipe and the product never showed it.** `cook_band` reached the
form, reached the store, and was read by nothing — 33 of the first 35 curations
carry one, and not one of them ever appeared on a card, in the modal, or in
ranking. That is the whole case on its own, and the "who is cooking" argument
just means it should not come back later.

**What survives, and why it is different:**

- **Make-ahead stays.** *"Needs a head start"* is a property of the DISH — a
  marinade sits overnight whoever owns the fridge. It is one binary tap, it is
  the one time fact that can waste someone's evening (`UX-SPEC` §5), and it does
  not vary with the cook.
- **`data/enriched` keeps its derived minutes.** Generated, re-derivable, and
  read by the make-ahead pre-fill. Nothing asks a human for it.
- **The 33 stored bands are kept, not purged.** Deleting a human's answer to
  un-ask a question is worse than a dead field. `cook_band` is marked deprecated
  and read by nothing, the same posture as `Owner.saved`.


### What a site rule may and may not do

| May | May not |
|---|---|
| **Drop** a line, with a reason | Resolve a line to a node |
| **Rewrite** syntax — a quantity run, a purpose clause, a part-of prefix | Rename an ingredient |
| **Harvest** alias and alternate candidates | Promote either without review |

**The line it must not cross is naming.** A rule rewriting `gim nori` → `gim` looks
like parsing and is really an identity claim — that these are one pantry item.
Identity belongs to the ontology and its review step (§7), never to a regex keyed
on one observation. Five such rewrites were written and then removed; the score
did not move, which is what confirmed they were overfitting rather than parsing.
Names now leave as **proposals** (`data/reports/site-aliases.json`).

### Three states for a line, not two

`dropped` is the third. "We know this is a colander" and "we could not read this"
were the same state in the data, so both rendered as a warning and the reviewer
wrote *"not ingredient"* on every kimchi recipe. A dropped line stays visible —
the call should be disagreeable — but it is styled as settled, not asked.

### Three uncertainties, not one

A line can fail in three different places, and today they arrive as one signal —
`unresolved` — which says a line did not land without saying where it fell.

| | the question | the stage that answers it | what it looks like when wrong |
|---|---|---|---|
| **A. read** | did we get an ingredient out of the text? | `frequency.ts` | `for 2`, `gas stove` |
| **B. place** | is it the right node? | `normalize.ts` + aliases | `Korean fermented chili paste` not reaching `gochujang` |
| **C. tier** | is it actually required? | the required/optional split | `sesame seeds, for garnish` charged as a requirement |

**They are not interchangeable and they do not have the same cost.** A failure at
A is a parser bug and shows up as nonsense a reviewer spots instantly. A failure
at B is invisible — the line looks fine and quietly matches nothing, which is the
worst of the three. A failure at C makes a cookable recipe look uncookable, or
the reverse.

So the QC queue **sorts by which stage is unsure**, rather than presenting one
undifferentiated pile. The reviewer's own tools already speak this vocabulary
without naming it: `bad_lines` is A, `line_notes` is usually B, and
`tier_overrides` is exactly C.

**This does not add a score to the ontology.** `INGREDIENT-SPEC` §4 has no global
attributes and this changes nothing about that — the uncertainty is a property
of *this parse of this line*, not of the ingredient, and it dies when the line is
re-parsed.

**B is the one to instrument first**, because it is the only one that fails
silently. A and C announce themselves.

### The alias harvest is the real prize

This author glosses Korean terms as `English (romanization, 한글)`. That is a
hand-authored alias table by a native cook, published across 249 pages, and it
survives into the JSON-LD — so unlike Maangchi's glossary slugs (`extractors.ts`)
it needs no bespoke HTML extractor. **414 candidates, 119 containing hangul**:
`무`/`mu`, `고추가루`/`gochugaru`, `국간장`/`guk ganjang`, `당면`/`dangmyeon`.

Precision had to be measured, not assumed. The first version returned 447
candidates whose most frequent entries were `thinly sliced`, `adjust to taste` and
`etc.` — bare modifiers fit "short, no digits" perfectly. Two filters fixed it: a
meta-phrase list, and rejecting anything that reduces to nothing once the general
parser strips processing words.

### A site rule is a liability, so keep it visible

Every `recipe-index` run prints what the rules dropped, by reason. A pattern that
starts swallowing real ingredients shows up as a number that jumped. Two bugs were
caught exactly this way while building the first source:

- a `" - "` clause split truncated **106 spaced numeric ranges** across **9 sources**
  to their own quantity — a general parser bug, fixed in `frequency.ts` with
  regression cases, not papered over per-site
- a defensive `" to "` collapse rewrote **`salt to taste` → `salt taste`** on 21
  lines. Removed; the one case it was for was already covered

**Fixing the range bug lowered `fully_resolved` from 3450 to 3441, and that is an
improvement.** Those lines were previously dropped for having an empty head, so
their recipes were *silently understating* their requirements — the exact failure
§1 says `unresolved` exists to prevent. 26 real ingredients became visible
(`turkey stock`, `agave syrup`, `baby octopus`). Recorded alternates rose
1,573 → 1,779, and koreanbapsang's more than doubled, because this author writes
substitutions inside brackets and `alternatives()` strips brackets before it looks
for "or".

---

## 4c. `main_ingredients` — what the dish is *of*

A third controlled field, curated rather than derived, holding **at most two**
ingredient ids. Bulgogi is beef. Kimchi jjigae is kimchi and pork.

§4a already separated this from `dish_type` — *"meal time, main ingredient and
difficulty are different questions"* — and excluded it from that field rather
than rejecting it. This is that axis, given its own home.

### What reads it, and why the field earns its place

`src/match/score.ts` today:

```
score(R) = β · |use_first ∩ R| − λ · Σ friction(i)
friction(i) = w_base                       ← every missing ingredient costs the same
```

So missing the beef in bulgogi costs exactly what missing the sesame seeds
costs. That flatness is not an oversight — friction collapsed to `w_base` when
`sourcing` was cut (DECISIONS §4, INGREDIENT-SPEC §4) — but the reason
`sourcing` was wrong is precisely why this is right:

> **`sourcing` was a global prior about an ingredient. `main_ingredients` is a
> fact about a dish.**

"Gochugaru is hard to find" was wrong for the user who lives near a Korean
grocer. "Bulgogi is a beef dish" is not a claim about anyone's neighbourhood; it
is true in every kitchen, and it is the one thing a cook already knows before
they open the recipe.

Second consumer, and the reason to curate rather than infer: §7 calls
substitutions the most valuable thing here, and **a substitution on a main
ingredient is a different claim from one on a garnish.** Pork bulgogi is a real
dish; sesame-free bulgogi is just bulgogi. The matcher cannot tell those apart
without knowing which ingredient carries the dish.

### It penalises heavily. It never blocks.

Reviewer's call. `friction` gains one term:

```
friction(i) = w_base · (i ∈ main_ingredients ? w_main : 1)
```

Missing a main ingredient should sink a recipe far below one missing three
garnishes, and should not remove it from the results.

Three reasons blocking is wrong, and they are all already settled elsewhere:

- **INGREDIENT-SPEC §6** — *where the system cannot know, it ASKS; it does not
  guess, and it does not silently decide the answer is no.* Hiding the recipe is
  the silent no.
- **Substitution stays live.** Beef → pork is exactly the swap a user wants
  offered, and a blocked recipe can offer nothing.
- **`main_ingredients` is curated and therefore incomplete for a long time.** A
  field that blocks is a field whose gaps delete recipes from the product. A
  field that penalises has gaps that merely rank slightly wrong.

`w_main` is a **configuration value set empirically**, not a constant — the same
rule INGREDIENT-SPEC §5 applies to the promotion threshold `N`. Sinking a
recipe and hiding it are different, and only measurement says where the line is.

### Up to two, ordered

Reviewer's call: one by default, two where the dish genuinely has two.

The cap is the whole design. Three is not a compromise — it is `requires` again
with extra steps, and a field that names half the ingredient list has stopped
distinguishing anything. Where the honest answer is three, the answer is one or
two and the rest are ordinary requirements.

Ordered, because the first is the one the dish is named for and the one a
substitution prompt should lead with.

### Curated, but never from a blank field

The proposer guesses and the reviewer corrects — the same shape as every other
queue here. Three signals already exist and are currently thrown away:

| signal | strength | where it is now |
|---|---|---|
| `recipeCategory` naming an ingredient | **strong** — the source said so | §4a counted `pork 92, beef 78, chicken 59` and discarded them as axis noise |
| the ingredient is in the title | strong | `propose.ts` already computes `in_title` |
| largest measured quantity in the recipe | weak | derivable, never used |

The third is weak on its own and must stay weak: stock and water are the largest
quantity in every soup, and `UNIVERSAL` already exists to say they are not
ingredients at all.

**Bulgogi is the case that proves guessing is not enough.** The title says
bulgogi, the category is often blank, and beef is not the largest quantity in a
marinade-heavy recipe. The dish name carries the answer only for someone who
already knows the cuisine — which is what curation is.

### The reference must survive a re-parse

`main_ingredients` holds `ing_` ids, and §3 warns that `requires` changes
underneath us when the engine improves or the blogger edits the post. So:

- **It is stored on the curation record, not on the parsed recipe.** A re-parse
  rewrites `requires` and must not touch a human's judgment.
- **A main ingredient not in the current `requires` is a flag, not a deletion.**
  Either the parse regressed or the recipe changed, and both are worth a human
  look. Silently dropping it would erase the review and leave the field quietly
  wrong.
- **Ids, never names.** INGREDIENT-SPEC §1 — a rename or merge follows the
  redirect, and a curated judgment from 2026 still resolves.

---

## 5. Staleness

Recipes rot. Blogs die, posts get edited, ingredient lists change.

- `last_seen` and `content_hash` on every crawl.
- If the hash changes, re-parse and update `requires`. Existing CookEvents are
  untouched — they carry their own snapshot (§3).
- If the URL 404s for N consecutive crawls, mark `dead`. Dead recipes leave
  matching and stay in history (§2).

**A changed ingredient list is not an error and must not be reported as one.**
The blogger edited their post; that is the normal life of a recipe on the open
web. The only thing worth alerting on is a mass change across one source, which
means the site's markup moved and our parse broke — a crawler bug wearing a
content-change costume.

---

## 6. The summary question

> *"I'm not sure if it's worth it to keep this summary as a separate entity. It
> could be just dynamically calculated."*

**Compute it. Do not model it.** `cook_count`, `first_cooked` and `last_cooked`
are all `SELECT count(*)`/`min`/`max` over one user's events for one recipe —
a handful of rows, indexed by `(user_id, recipe_id)`. A separate summary entity
would buy nothing and introduce the one bug this class of table always has:
drifting out of sync with the log it summarises.

**Denormalise onto `user_recipe` only when a query needs to SORT by it.** "My
most-cooked recipes" across a whole library is that query, and it cannot be
answered from the log without a scan. The three fields are listed in §4 as
denormalised for exactly that reason, and they are derived — recomputable from
`cook_event` at any time, which is what makes drift a repairable bug rather than
data loss.

This is the same rule as `attrs` in `INGREDIENT-SPEC.md` §4: a field the app
merely displays can be computed; a field the app queries needs a column.

### The summary is two-sided from the start

`summaryFor` returns `{ mine, community }`, and `community` is `null` — declared
in the shape while absent from the data. §9 specifies what belongs there
(`recipe_substitution`, `recipe_skip`, `recipe_comment`) and none of it exists.
Declaring the slot buys two things:

- adding §9 later fills a hole rather than reshaping the panel and every caller
- it keeps the numbers **honest now**. "Yours" is labelled as yours, so an
  average over three of your own cooks can never be read as what everyone
  thinks — which is precisely how one person's 5★ becomes "a rating"

`null` means *we have nothing*, never *nobody did anything*. The UI says which.
§9's publishing floor stays where the aggregate is computed, never in a template.

---

## 7. Substitutions are the most valuable thing here

Every CookEvent's `substituted` list is a user telling us **"X worked in place of
Y"** — from doing it, not from theorising. That is better evidence than anything
in our curated table.

Same lifecycle as user-added ingredients (`INGREDIENT-SPEC.md` §5):

```
  private     one user did it once. Visible only to them.
     ↓  N distinct users substitute the same pair
  candidate   enters the substitution review queue with its count
     ↓  review
  global      joins substitutes_for; suggested to everyone
```

**Never auto-promote.** A substitution that is merely popular can still be wrong
— people substitute what they have, not what works, and the loudest signal will
be "I used regular soy sauce instead of the one the recipe asked for", which is
the exact error DECISIONS §3 spent the ontology preventing. Count is a filter for
the queue, never a decision.

**`skipped` is a distinct and equally useful signal.** An ingredient many users
omit with good ratings is one the recipe does not really need — that is a
candidate for an *optional* flag on the requirement, which would directly improve
matching. It is not in v1, but recording `skipped` now is what makes it possible
later, and it costs one array.

---

## 8. Ranking twenty near-identical recipes

§10 keeps twenty kimchi jjigae recipes as twenty rows, which moves the problem
to ranking. Reviewer's answer:

> *"That's how the community-based recommendation system will work. We could
> provide sorting by Saved, Made it, or Rating (when there's enough ratings). But
> the ranking will be based on users' choices, not from us, which is
> defensible."*

Right, and it is the only ordering we could defend — we have no basis for
declaring one blogger's stew better than another's. Four things follow.

### The signals are not interchangeable

| signal | cost to produce | what it means |
|---|---|---|
| **Saved** | one tap | intent, often never acted on |
| **Made it** | cooking a meal | the strongest signal in the system |
| **Rating** | cooking, then returning | strongest and sparsest |

`Made it` should be the default sort wherever it exists. A save is a bookmark and
bookmarks are cheap; ranking by them measures which recipe photographs well.

### Cold start is the real problem, and the corpus already solves it

With no users every community signal is zero and twenty stews tie. That state
lasts months, so the FALLBACK is what users actually see — it is the default
ranking, not an edge case.

**75% of the corpus (3,684 of 4,874) already carries `ratingValue` and
`ratingCount` from the source's own JSON-LD.** That is a community signal too;
it is simply someone else's community, and it is defensible on exactly the
reviewer's grounds — readers of that blog chose it, we did not.

So: rank by our own signal where we have enough of it, by the source's rating
where we do not, and say which is being used. Median `ratingCount` is 8 and the
10th percentile is 1, so a floor is needed there as well — a 5.0 from one rater
must not outrank a 4.6 from three hundred.

### "Users' choices, not ours" is a claim about accountability, not neutrality

We still choose which signal counts, what the threshold for "enough ratings" is,
and what happens before any of them exist. That is fine — someone has to — but
the defence only holds if the mechanism is **disclosed**: the sort control names
what it sorts by, and the fallback says it is using the source's rating. Ranking
that hides its own basis is editorial whatever it is computed from.

### Rich-get-richer, and why it is mostly already handled

Position drives the signal that determines position: a recipe that lands on top
collects the saves that keep it there, and after a year the ranking reports its
own history. That is the §9 feedback loop one layer up.

**Ingredient compatibility dilutes it structurally**, which is a better fix than
any weighting. Reviewer's point, and it holds for a reason worth stating: the
candidate set is a function of the USER'S PANTRY, so there is no single global
top position for a winner to occupy. A recipe that matches what you have outranks
a popular one you cannot cook, and different pantries surface different recipes.
Popularity is a tiebreaker inside an already-filtered set, not a ranking.

The obvious objection is that it stops helping exactly where the concern started
— inside a cluster of near-identical recipes, compatibility ties and community
signal decides everything. **Measured on the corpus, that cluster barely
exists:**

```
pairs sharing a rare ingredient, compared      2,766
pairs with >= 80% ingredient overlap              34
recipes sitting in such a cluster            66 of 3,173   (2%)
largest cluster                                    3 recipes
```

Twenty kimchi jjigae recipes are twenty different ingredient lists. Dish names
converge; ingredient sets do not, and compatibility discriminates on the sets.
The "twenty near-identical stews" scenario that motivated this section is not in
this corpus.

*(Method: recipes bucketed by their rarest shared ingredient, Jaccard on
`requires`, fully-resolved recipes only. The bucketing can miss a cluster whose
members share no rare ingredient, so 2% is a floor rather than an exact figure.)*

So the mitigations stay, but as cheap insurance rather than load-bearing: **rate
per impression rather than per total**, and keep an exploration slot. Both cost
one query, both are impossible to add retroactively — the impression counts
simply will not exist — and the argument above is a claim about a corpus that
will change as it grows.

---

## 9. Derived public attributes

A Recipe gains attributes it did not have when we crawled it, computed from what
users did with it:

```
recipe_substitution        recipe_id, wanted, used, n_users
recipe_skip                recipe_id, ingredient_id, n_users
recipe_comment             recipe_id, user_id, body, at
```

**These are ours in a way the recipe is not.** §1 forbids storing the blogger's
method because it is their expression; a comment written on our page and a count
we computed are our content entirely. This is also what makes a page worth
existing next to the source link rather than merely redirecting to it — the
Phase C SEO play (BUILD.md) is thin without it and strong with it.

### Recipe-scoped, not global

`recipe_substitution` is **not** the same claim as `substitutes_for` in the
ontology. "For this recipe, 12 people used serrano instead of cheongyang" is a
narrow, checkable fact. "Serrano substitutes for cheongyang" is a general one,
and general claims need review (§7). The recipe-scoped stat can be published
without promoting anything into the ontology, and it is the safer artifact.

### A publishing floor, not a display rule

**Nothing is shown below `n_users >= k`.** At n=1 the aggregate is one person's
behaviour with a label on it, and a user who substituted something unusual in a
recipe with few cooks is identifiable to anyone who knows them. `k` needs setting
empirically like the promotion threshold (§7), but it is a property of the DATA
and must be enforced where the aggregate is computed — not in the template, where
the next feature to read the table will forget it.

The same rule as `INGREDIENT-SPEC.md` §5: the aggregate carries counts and
ingredient ids, never user ids, never notes, never who did what.

### The feedback loop is real and must be watched

Showing "12 people used serrano" causes the thirteenth to use serrano. The
statistic changes the behaviour it measures, and after a while it is reporting
its own suggestion back to itself.

That is tolerable for a genuinely common swap and corrosive for a marginal one
that happened to cross `k` early. Two cheap mitigations, both worth having from
the start because neither is retrofittable:

- record whether the user saw the suggestion before substituting, so the two
  populations can be told apart afterwards
- rank by proportion of cooks, never by raw count, so a recipe that is cooked
  often does not manufacture consensus

### Comments — wanted, and deferred past v2

Reviewer's call: they are a real feature we intend to have, not one refused.
`UX-SPEC.md` §7 previously read "no comments section"; that is now a schedule,
not a verdict.

Free text on a public entity makes them the one place in this system where one
user's writing is shown to another. That brings moderation, reporting and
deletion — none of it hard, all of it absent from every other table here. The
reason to defer is that the cost should be paid deliberately rather than
discovered after the first abusive post.

**What is already decided, for when they ship:** `USER-SPEC.md` §4 — a deleted
user's comments **detach and stay**. They are the one thing a user wrote that
another user has read, so removing them would silently edit a conversation other
people took part in. The account link is severed; the text remains,
unattributed. That rule was written before the schedule was settled and it
survives unchanged.

---

## 10. Open questions

The first three are answered by the reviewer. §1a added two that are not, and they
are deferred until after QC rather than settled here.

1. **User-added recipes: not in v1.** Possible later. Until then, "every recipe
   comes from the corpus" is a safe assumption for code to make — and it is
   written down here so that when it stops being true, the places that assumed it
   are findable.

2. **A save is just a save.** No `planned` split. "Saved" carries both bookmark
   and intent, and separating them is a guess about a behaviour nobody has
   exhibited yet.

3. **Twenty blogs means twenty recipes.** Reviewer: *"every recipe is
   different."* No cross-source de-duplication, no canonical-dish entity, no
   retire-and-redirect for recipes — the machinery in `INGREDIENT-SPEC.md` §1
   stays an ingredient concern.

   This is right on the substance: two kimchi jjigae recipes genuinely differ,
   and merging them would destroy the thing a user is choosing between. It does
   hand a problem to RANKING rather than removing it — a pantry match will
   surface twenty near-identical stews, and "show me the best one" becomes a
   scoring question (DECISIONS §4) rather than a data one. Worth knowing which
   layer owns it before results look repetitive and the instinct is to fix it in
   the wrong place.

4. **Revalidation interval — open.** §1a requires the pass; it does not say how
   often. This is not a free knob: too slow and "same-day takedown" is false
   advertising for everything except a direct request, too fast and we are
   re-hitting twenty blogs for no reason. It should almost certainly inherit §5's
   staleness cadence rather than invent its own, but that needs checking against
   what §5 actually re-fetches once the corpus is curated.

5. **Retina derivatives — open, and probably defer.** 300w alone is ~100MB across
   the corpus; adding 600w takes it past 400MB. Disk is cheap enough that this is
   not really a storage question — it is a question about whether a 300px card
   looks bad enough on a modern phone to be worth doubling the pipeline's output.
   Answerable by looking at one, which is a reason not to decide it in a document.
