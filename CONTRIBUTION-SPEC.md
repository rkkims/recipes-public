# Contribution — surface and entity spec

How a recipe enters the corpus without passing through the founder's evenings.

Fourth alongside `INGREDIENT-SPEC.md`, `RECIPE-SPEC.md` and `USER-SPEC.md`, and
it extends rather than replaces them: the entity here is still a Recipe, the
membership is still a UserRecipe, and the creator is still the one `CREATOR-SPEC`
already describes. What is new is **who does the annotating, and what the product
does while the annotation is incomplete.**

Written 2026-08-11, against the growth loop settled the same day.

---

## 0. What this replaces

`UX-SPEC` §11 and `BUSINESS-REVIEW` §6 describe the same mechanism from two
sides. A stranger submits a URL; the queue promises *"we'll prepare this for
pantry matching and let you know when it's ready"*; that promise is serviced by
one person's evenings.

> **`BUSINESS-REVIEW` §6: "The best user is the most expensive user."**

The escape hatch that spec looks for does not open. §8 gates automation on
*"measured accuracy"*, but the 96.2% is on **ingredient mapping** — strings we
already hold, mapped to canonical IDs. The queue's bottleneck is **extraction**
from an arbitrary URL: a different problem, a different error profile, no
benchmark. The impressive number does not unlock the constrained step, and it is
not going to.

**So stop trying to service the promise and change it.** The user does not get
*"we'll prepare this"*. They get the recipe immediately, partly parsed, with the
gaps visible and fixable by them. The queue's failure mode — `/recipe-requests`
reading as *"a list of things we failed to do"* — cannot occur, because nothing
is owed.

This is the load-bearing surface of the growth loop. Users add recipes → demand
accumulates against real creators → creators correct their own → the corpus stays
fresh without the crawl. Every decision below is downstream of that being the
mechanism.

---

## 0a. The precondition this spec does not provide

Everything above and below is step four.

```
match quality  →  they come back  →  they invest  →  they contribute
                                                          ↓
        creator corrects  ←  demand accumulates  ←  ────┘
```

**Nobody pastes a URL into a product they are not already invested in.**
Contribution is the behaviour of a returning user who has a pantry worth matching
against and has been helped by a match at least once. A first-session visitor
does not contribute, and no amount of design on the paste flow changes that.

So the load-bearing factor is not this surface. It is that **pantry matching is
sticky enough to earn a second visit, and the recommendations genuinely help
someone cook.** If that fails, this spec describes a feature nobody reaches.

**This retires `BUSINESS-REVIEW` §3's misallocation critique, and it is worth
recording why.** That section is correct under the model it was written against:
revenue is paid per new user, match quality buys retention, retention pays
nothing, therefore *"96.2% is already past the point where the revenue model can
detect the difference."* Under the loop above, retention is not a terminal
metric — it is the generator. A returning user is the only source of new recipes,
and new recipes are the only source of the demand signal that reaches creators.

> **The ontology is growth infrastructure, not supply infrastructure. §3 priced
> it against the wrong mechanism.**

Two consequences that bind:

- **The measure is cooking, not saving.** `RECIPE-SPEC` §4's `cook_event` already
  logs the thing that matters. A save is an intention; a cook is the product
  having worked. Stickiness claims should be made against cook events or not at
  all.
- **The gate before the first community placement is match quality, not corpus
  size.** The question is not "do we have enough recipes" but "does a realistic
  pantry — eight or ten things a Korean-American household actually has — produce
  a match somebody would cook tonight." A large corpus that fails that test
  spends the placement and returns nothing.

---

## 1. The entity problem

`RECIPE-SPEC` §4 keys the private membership on a corpus recipe:

```
user_recipe
  user_id
  recipe_id      -- must already exist
  primary key (user_id, recipe_id)
```

A pasted URL has no `recipe_id`. Three ways out, and only one survives:

| | Why not |
|---|---|
| Private blob on the user, promoted later | The demand signal never forms. Two users adding the same URL are invisible to each other, and to the creator. |
| New entity, `user_added_recipe` | Every consumer — matching, planning, cook events, the grocery list — needs a second code path forever, to express a distinction that stops mattering ten seconds after the paste. |
| **A `recipe` row, created on paste** | **Chosen.** |

> **A user-added recipe is a Recipe. It differs in provenance and in confidence,
> never in kind.**

Two columns carry the difference:

```
recipe
  …                              -- RECIPE-SPEC §1, unchanged
  origin        enum             -- 'crawl' | 'user' | 'creator'
  annotated_by  enum             -- 'parser' | 'user' | 'creator'
  annotated_at  timestamp?
  confirmed_at  timestamp?       -- null until a human confirmed the ingredient list
```

`origin` is who caused the row to exist. `annotated_by` is who last vouched for
its ingredient list. They are independent: a crawled recipe corrected by a user
is `origin='crawl', annotated_by='user'`, and that is the common case once the
loop turns.

**No `added_by` column.** The user who pastes a URL is not its author and does
not own it — they contributed a pointer to somebody else's public page. What they
own is their `user_recipe` row, which they already owned. Storing the paster
invites the belief that they have rights here, and §7 depends on them not.

---

## 2. Canonicalise before the row exists, or the demand counter lies

`SOCIAL-INGEST` §191 already states this rule for social URLs. It is the same
rule and it is more load-bearing here, because the count is now the product.

Two users pasting the same recipe reached by different routes — a share link, a
tracking suffix, `m.` versus `www.`, an AMP mirror — must converge on **one**
row. If they do not, "saved 138 times" fragments into six counts of twenty-three,
the creator notification in §6 is a lie, and the one asset this loop generates is
worthless.

Order of operations on paste, and it is not negotiable:

1. Canonicalise the URL
2. Look up an existing recipe by canonical URL
3. **Hit** → attach `user_recipe`, done. The user inherits whatever annotation
   already exists, including a creator's. No extraction, no confirmation, no
   second row.
4. **Miss** → create the row, extract, hand it to §3

Step 3 is most of the traffic once the corpus has any density, and it is the step
that makes contribution feel instant rather than like data entry.

---

## 3. Annotation has three sources, and none of them carries it alone

The mistake to avoid is deciding *who annotates*. Nobody annotates. Three parties
each do the part they are best placed to do, and the recipe improves monotonically.

| Source | Motive | What it is good at |
|---|---|---|
| **Parser** | none needed | The 60–80% of lines that are unambiguous |
| **User** | wants *this* recipe to match *their* pantry, right now | The specific lines blocking their own match |
| **Creator** | wants their work represented correctly | Everything, authoritatively — and it is their recipe |

The user's motive is the strongest and the most immediate, and it is the one the
previous design ignored. They are not doing us a favour; an unresolved line is
the reason their recipe is not matching, so fixing it is **finishing their own
task**. That framing decides the UI: never a form titled "help us improve our
data", always the unresolved line sitting in the ingredient list where it
obviously does not belong yet.

**A correction is scoped to the recipe, not to the ontology.** A user resolving
*gochugaru* on their pasted recipe writes `recipe.requires`, and where the string
is genuinely unknown it goes to `user_vocabulary` (`INGREDIENT-SPEC` §5), private
to them. It never writes a canonical ingredient. `QC-SPEC`'s benchmark is the
only path into the ontology and this spec does not open a second one.

**What a contributor may never supply: the method.** The paste flow accepts a URL
and an ingredient annotation. There is no field for instructions, and there will
not be one. `RECIPE-SPEC` §1 and the `canonical` in `recipe/[id]/page.tsx` are
the same decision — we hold a reading of the ingredient list, point search
engines at the author, and send every reader to the source to cook. §6's entire
premise is that a creator discovering us reacts as an owner rather than as a
victim. A text box for the method is what turns the notification email into a
takedown.

---

## 4. The incomplete state is the normal state

The failure that kills the loop is not at the creator step. It is here: a user
pastes a recipe, extraction is imperfect, the recipe does not match, the user
gets nothing back, and leaves. Nothing downstream ever happens.

So the question is whether a partly-annotated recipe participates in matching,
and the answer is **yes, honestly labelled** — the alternative gives the
contributor nothing at the exact moment they have done us a favour.

Precedent exists and does not need inventing. `RecipeDetail` already takes
`incomplete={recipe.unresolved.length > 0}`, and unresolved lines already carry a
friction term. A user-added recipe with three unresolved lines is the same object
the corpus already contains, arriving by a different door.

Rules:

- It matches. Unresolved lines count against the match rather than being ignored,
  so the score is pessimistic and never claims a cook the user cannot do.
- The unresolved lines are shown as unresolved, in place, tappable.
- **It is never presented as ready.** No *"we prepared this for you"* — the
  product's honesty about what it does not know is the thing that makes the fix
  feel like collaboration rather than correcting our mistake.
- It is private to the paster until §5's threshold, and it is excluded from the
  demand count until then.

---

## 5. Public recipe, private membership

The rule already exists and this spec only has to apply it consistently:

> **The recipe is a fact about a public web page. The save is private.**

That is how the crawled corpus already works and it resolves the tension without
a new privacy posture. `user_recipe` stays private, as `USER-SPEC` §1 requires;
the aggregate over it is subject to `RECIPE-SPEC` §9's publishing floor `k` and
`PRIVACY-SPEC`'s aggregate-only disclosure.

Two constraints follow:

**A URL that is not publicly fetchable never becomes a public row.** A private
Google Doc, a photo, a family recipe typed from a card — these are real things
users will paste. They may exist as private recipes owned by the paster, and they
must never enter the corpus, count toward demand, or name a creator. The test is
mechanical: can we fetch it anonymously?

**One paste is not demand.** A recipe with a single save is identifying — it is a
fact about one person's cooking. Nothing enters the public corpus or the demand
count below `k`. This also disposes of most of the spam question in §9 for free:
garbage that nobody else ever saves stays private to whoever pasted it.

---

## 6. What the loop actually produces

The output of everything above is one sentence that can be sent to a stranger:

> *247 people have saved your tteokbokki recipe here. Its ingredient list is
> partly unresolved — here is how it currently looks. You can correct it.*

Note what that is not. It is not a traffic promise; `DECISIONS` §8 already made
one of those and reversed it, and it evaluates to zero at our scale. It is not a
payment; at $0.01–$0.12 of revenue per visitor there is nothing to offer. **It is
a fact about existing demand, plus a small itch about misrepresentation.** That
is the motive Discogs, IMDb and Genius were built on, and it works at any scale
above `k` — including scales far below the point where we are interesting.

`CREATOR-SPEC` §2 already built the half of this that is hard: creator rows exist
from the crawl, `status='indexed'`, and outreach *"carries a count"*. What this
spec adds is that the count no longer depends on what we crawled. It grows from
what users bring, which is the part that stays fresh.

**Notification is a surface with a rate limit, not a mailing list.** One creator,
one message, when their demand first crosses a threshold worth their attention.
The second message needs a new reason. Getting this wrong converts the strongest
asset in the loop into a spam complaint, and creator goodwill is not
recoverable — the same ammunition property as community placements.

---

## 7. When a creator claims what a user added

The question sounds hard and is already answered by decisions in force.

`CREATOR-SPEC` §2: a creator row is a fact about the corpus, not a relationship.
§5: a claim changes `status`, grants display-name editing, and makes the
*Verified by creator* badge available on **recipes whose ingredient list they
confirmed** — not on everything they own.

Applied here:

| On claim | Changes | Does not change |
|---|---|---|
| Recipe added by a user, from that creator's page | `annotated_by` → `'creator'` on confirmation, `confirmed_at` set, badge earned | `origin` stays `'user'` — provenance is history and history is not editable |
| The paster's `user_recipe` | nothing | their save, their note, their cook events — all still theirs |
| Demand count | nothing | it was never the creator's to edit |

**Nobody's rights collide, because the paster never had any.** They pointed at a
public page. The creator confirming their own ingredient list overrides a
stranger's reading of it, which is correct on the merits and needs no
tie-breaking rule.

`CREATOR-SPEC` §6's withdrawal applies unchanged, and is the reason this is safe
to build: a creator who wants out gets out, including recipes users added.

---

## 8. What this deliberately does not do

- **No user-authored recipes.** Paste a URL or nothing. An original-recipe
  feature is a different product with a different moderation cost, and
  `RECIPE-SPEC` §1's link-out posture is the thing protecting the whole loop.
- **No public "my recipes" profile.** The membership is private (§5). A shareable
  collection is a plausible future feature and it is not this one.
- **No editing another user's annotation.** Corrections are per-recipe and
  last-writer-wins between users, with creator confirmation trumping both. A
  revision-history and conflict UI is unjustified before there is any evidence
  users collide.
- **No writes to the ontology** (§3).
- **No promise of preparation.** That was §0's whole point.

---

## 9. Open questions

- **Does an unconfirmed user-added recipe belong in the public corpus at all, or
  only above `k`?** §5 says above `k`, which is the conservative answer and may
  be too conservative — it means the second saver of a good recipe sees nothing
  the first saver contributed. The alternative exposes single-user pastes.
  Undecided, and it changes what §2's step 3 hits.
- **Anonymous users and the demand count.** `USER-SPEC` §2 makes an anonymous
  user a real row, so their saves are real saves. That is right for the product
  and it makes the count trivially inflatable by one person with a script. `k`
  helps and does not solve it. Whether demand counts distinct users or distinct
  *accounts* is a real fork, and the honest version costs signal.
- **A user confirms a wrong ingredient list.** Worse than an unconfirmed one: the
  creator's §6 notification now shows their recipe misrepresented *with
  confidence*, which converts the itch into an insult. Does creator-facing
  display distinguish `annotated_by='user'` from `'parser'`? Probably yes, and
  the wording of that email matters more than anything else in this file.
- **Rate and threshold for §6 notification.** What count is worth a stranger's
  attention, and how long before a second contact is legitimate. No data yet.
- **Do user-added recipes get indexed pages?** `UX-SPEC` §10's thin-content guard
  and the `canonical` posture both point at no. Interacts with `CREATOR-SPEC`
  §8's open question about pre-claim creator pages.
- **What stops 10,000 pastes?** §5's `k` handles the corpus, not the work. Rate
  limiting is obvious and the threshold is not.
- **Does the paster learn a creator later confirmed their recipe?** It is a
  satisfying loop to close and it is also a notification nobody asked for.
