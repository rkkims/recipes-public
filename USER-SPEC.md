# User — entity spec

Third of three, with `INGREDIENT-SPEC.md` and `RECIPE-SPEC.md`. Shorter than
both, because the User is mostly a **key that other things hang off** — and the
interesting decisions are about what it deliberately does not hold.

---

## 1. What a User is

Everything private in the system is owned by exactly one of these:

```
user_ingredient   pantry, grocery list, use-first   (INGREDIENT-SPEC §2)
user_recipe       saved, notes                       (RECIPE-SPEC §4)
cook_event        the log of cooking                 (RECIPE-SPEC §4)
user_vocabulary   privately added ingredients        (INGREDIENT-SPEC §5)
```

```
user
  id            usr_…       opaque, permanent
  created_at    timestamp
  email         text?       null until they sign up
  auth_*        …           whatever the provider needs
  onboarded_at  timestamp?  starter list accepted or dismissed
```

**No demographics and no location.** Both fail the test in `INGREDIENT-SPEC.md`
§4 — name the source, the consumer, and how a wrong value gets noticed. Location
came closest to earning a place, because it is what `sourcing` was really
approximating (DECISIONS §3); with `sourcing` cut, nothing would read it.

**Dietary restrictions DO earn a place** and are specified in §6. They pass all
three: the user declares them, matching reads them, and a wrong value announces
itself the moment a filtered recipe appears.

---

## 2. Anonymous first, and the merge that implies

UX-SPEC §9 is already decided: **the pantry works with zero account**, and signup
is prompted at ~5 items or the first "Made it". That decision has a consequence
it does not spell out.

### An anonymous user is a real row

Not a session, not a cookie holding a pantry. A `user` row with `email = null`,
created on first interaction, referenced by a device-local token.

Storing the pantry client-side would be simpler and is wrong: the whole signup
argument is *"sign up to keep your pantry"*, which only works if the pantry is
already somewhere it can be kept. It also makes the merge below a data problem
rather than a parsing-localStorage problem.

**The risk this creates must be stated plainly:** an anonymous user who clears
site data loses everything, and we cannot recover it because we know nothing
about them. That is exactly what the signup prompt is for, and it is why the
prompt gets stronger after the first "Made it" — that is the moment there is
history worth losing.

### There is no merge

**Reviewer's call: an anonymous pantry is never merged into an existing
account.** Signing UP converts the anonymous row into an account — the pantry
carries over because it is the same row. Logging IN to an account that already
exists does not.

That is a defensible simplification. Merge is the kind of feature that looks like
one function and turns into a fortnight: note conflicts, two `use_first` pins on
the same item, two device clocks. It buys correctness in a case that mostly
affects people who already chose an account.

But it creates one bad moment, and the bad moment must be designed for rather
than discovered:

> Someone with an account opens the site on a new phone, is not logged in, adds
> eight things while cooking, then logs in — and the eight things are gone.

Two requirements follow.

**1. Warn before, not after.** When a logged-out session has a non-empty pantry
and the user chooses *log in* rather than *sign up*, say so plainly first:
*"You have 8 items here. Logging in opens your saved pantry — these will not be
added to it."* We cannot know whether they have an account until they try, so
the warning belongs on the log-in path, not on the prompt that offers both.

**2. Not merging is not deleting.** The anonymous owner row stays. Nothing is
destroyed; it simply stops being the one on screen, and the device token still
points at it. This costs a row and buys two things:

- a user who logs in by mistake has not lost anything, and can be given it back
  by hand if they ask
- the option to add merge later is preserved. If merge is built in v6, the data
  it would have merged still exists. Deleting on login would foreclose that
  permanently, for a saving of nothing.

**The signup copy has to change.** UX-SPEC §9 says *"Sign up to keep your
pantry"*, which is now true only on the sign-up path. On the log-in path it would
be a false promise, and the one place a product must not overpromise is the
moment before it discards someone's work.

---

## 3. Ownership: the thing that is expensive to change later

> **A fridge is shared. A pantry might not belong to one person.**

Two people in a household have one set of ingredients and want one pantry. That
is not a niche case for a cooking product — it is the normal case for anyone who
does not live alone.

If households ever exist, the owner of every private table changes from
`user_id` to something else. That is a migration touching every row of the four
tables above, plus every query. It is the same class of problem as ingredient ids
(`INGREDIENT-SPEC.md` §1): cheap to accommodate now, expensive to retrofit.

**Decided: yes.** The indirection goes in now and resolves trivially in v1.

```
owner
  id        own_…
  kind      'personal' | 'household'

user
  owner_id  own_…        -- in v1, one owner per user, created with them
```

Private tables key on `owner_id`, never `user_id`. In v1 that is a
pointless-looking join that always resolves to one person — one column and one
join today, and the difference between adding households in a week and adding
them in a quarter later.

---

## 4. Deletion and export

The cook history is the user's. It is also the only thing here that cannot be
reconstructed.

- **Export** returns everything private, in a readable format, without asking why.
- **Deletion** removes the private tables outright.
- **Aggregates are recomputed, not decremented.** A deleted user's substitutions
  and skips leave `recipe_substitution` and `recipe_skip` because those are
  derived (RECIPE-SPEC §9) — they are rebuilt from what remains. If that drops a
  statistic below the publishing floor `k`, it stops being published, which is
  the correct behaviour and falls out for free.
- **Comments detach and stay** (§7). They are the one thing a user wrote that
  another user has read, so removing them would silently edit a conversation
  other people took part in. The account link is severed; the text remains,
  unattributed. **Comments themselves are deferred past v2**
  (`RECIPE-SPEC.md` §9) — this rule is what happens when they arrive, and
  nothing here waits on it.

---

## 5. First run

DECISIONS §3: the starter list is **~12 hand-picked items, pre-checked**, not a
computed threshold. `onboarded_at` records that the user has been through it —
accepted or dismissed — so it is asked once and never again.

The principle behind pre-checking is DECISIONS §5: never show a blank field,
always show a guess to correct. An empty pantry on first run is a blank field,
and the starter list is the guess.

---

## 6. Dietary restrictions

**In from day one** — reviewer's call. The design below is what makes that
honest rather than dangerous.

```
user_diet
  owner_id
  excludes    ingredient_id[]     -- specific things: cilantro, pork
  classes     text[]              -- vegetarian | vegan | pescatarian | halal | …
  allergens   text[]              -- peanut | treenut | milk | egg | soy | wheat |
                                  --   fish | shellfish | sesame
  strict      boolean             -- see below
```

### Preference and allergy are different features wearing one name

| | wrong answer costs | so the rule is |
|---|---|---|
| **preference** — vegetarian, dislikes cilantro | an annoying result | filter or downrank freely |
| **allergy** — peanut, shellfish, celiac | a medical event | **never assert safety** |

Collapsing them is the mistake to avoid. A filter that is 95% right is a useful
feature; an allergy filter that is 95% right is a hazard.

### The rule: assert "contains", never "free of"

We can honestly say **this recipe contains peanut** — we found it. We cannot
honestly say **this recipe is peanut-free**, because that is a claim about
everything we did not find.

This is not caution for its own sake; the data says so directly. 3.9% of
ingredient mentions in the corpus are still unresolved, and every recipe carries
its own `unresolved[]` (RECIPE-SPEC §1). **"Contains no peanuts" cannot be
asserted over a list with an unknown in it**, and the field that says so is
already there.

So:

- recipes we KNOW contain an excluded ingredient are **hidden**, and the UI says
  WHAT is being applied — the restrictions control names every setting it is
  enforcing (*"vegetarian · no peanut · not rice"*)

  It does **not** report how many recipes were hidden. That was the original
  rule and it was the wrong instrument: a running count of what the filter
  removed is arithmetic about our machinery, printed above the grid on every
  load, and it grows louder the better the setting works. What this clause is
  protecting against is a filter that shrinks the results *silently* — a user
  who cannot tell why the grid looks thin — and naming the active settings
  answers that without a body count. `applyDiet` still computes the tally, so a
  surface that needs it later has it.
- recipes with any `unresolved[]` entry are **also hidden** when `allergens` is
  set, because we cannot account for them
- nothing is ever labelled *"peanut-free"*, *"safe for you"* or similar
- the copy names the mechanism: *"we hide what we can see. Always check the
  recipe."*

Hiding on uncertainty rather than showing on it is the whole design. It costs
recall — a peanut-allergic user sees fewer recipes than they could — and that is
the correct direction to be wrong in.

### `strict` picks which way to be wrong

For preferences, a user may want to see a near-miss ("this is vegetarian except
the fish sauce") because they can judge it. For allergens they may not. `strict`
defaults **on** for `allergens` and **off** for `classes`, and the two are
separate settings because they are separate questions.

---

## 7. Settled

1. **A `user` row is created on FIRST WRITE**, not on page load. A row per bot
   that loads the page would make every count of "users" a count of crawlers, and
   the branch that avoids it is one `if`.

2. **Comments detach and stay** on account deletion. They are the one thing a
   user wrote that another user has read, and removing them would silently edit
   a conversation other people took part in. The account link is severed; the
   text remains, unattributed.
