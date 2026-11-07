# Ingredient resolution — generic mentions in a cuisine that means something specific

Companion to `NORMALIZATION.md` (how strings become nodes) and
`INGREDIENT-SPEC.md` (what a node is). This file specifies what happens **after**
both: a recipe line has normalised cleanly to `soy sauce`, and that answer is
correct about the string and wrong about the kitchen.

Settled in discussion 2026-08-16. Open questions marked `OPEN`.

---

## 0. The problem — one field holding two facts

Curation so far has respected the source text: a Korean recipe that writes "soy
sauce" is annotated `soy sauce`, not `jin-ganjang`. That faithfulness is right
and stays. But the annotation was silently doing a second job — feeding the
Weee! link — and there it fails: a generic `soy sauce` node linked to a Chinese
light soy SKU under a Korean recipe is exactly the mismatch the identity layer
exists to refuse. "We don't pretend your ingredients are something else"
includes not pretending a generic mention is cuisine-less.

The corpus says this is the majority case, not an edge:

| surface form | lines |
|---|---|
| `soy sauce` (bare) | ~2,025 |
| `light soy sauce` | ~496 |
| `dark soy sauce` | ~425 |
| `soup soy sauce` / `korean soup soy sauce` | ~176 |

The generic form outnumbers every explicit variant combined. A policy for it is
worth more than any amount of variant vocabulary.

## 1. The rule — two facts, two fields

> **What the recipe wrote and what the ingredient is are different facts.
> Store both, and never let one impersonate the other.**

Per recipe ingredient line, additively:

```
written      "soy sauce"                      verbatim. Never rewritten.
resolved     <node id of jin-ganjang>         the identity this mention means here
resolution   explicit | creator-confirmed | user-confirmed | cuisine-default | unknown
```

- `written` is the parser's output and the parser's test set. Its job does not
  change. This is what keeps `data/decisions/` honest — resolution adds a layer,
  it does not retrofit judgments into extraction.
- `resolved` points at an ontology node, leaf-level where the context can
  support it. It is stamped **at curation time**, not computed per query: the
  cuisine prior is a curation-level judgment, and a stored answer is testable
  while an on-the-fly one is not.
- `resolution` is provenance, and provenance is load-bearing — consumers behave
  differently by tier (§4).

Both fields live **on the recipe line**. Nothing about resolution is a property
of a creator, a cuisine, or the node itself (§5 for why that was tempting and is
wrong).

## 2. Where this sits relative to normalisation

`NORMALIZATION.md` answers *what node does this string name* — lexical parsing,
modifier classes, purchase test. Resolution answers a question normalisation is
forbidden to ask: *which sibling in the family does this correctly-normalised
generic mention mean, given whose recipe it is*. It runs after stage 3, takes a
node plus recipe context (cuisine, dish type), and returns a node.

The separation is the same one the parser/engine split already earns: quantity
bugs don't look like ontology bugs, and now westernisation bugs don't look like
either. `npm run agreement` keeps scoring extraction; resolution is scored by
its own table (§3), separately.

### Relation to slots

Slots are this exact problem solved with a hard rule: `seaweed` is a choice, a
recipe naming it **must** resolve to a child, a pantry holding nori must not
match a miyeok soup. Resolution is the soft case of the same shape, and the
criterion for which mechanism a family gets is:

> **Is there a cuisine default that is right nearly all of the time?**

`seaweed` — no. A Korean recipe writing "seaweed" could mean gim, miyeok or
dashima, and guessing destroys the one distinction the slot exists to hold. It
stays a slot; the annotator must pick.

`soy sauce` in a Korean recipe — yes, jin-ganjang, with one known and nameable
exception class (§3). It gets a default, stamped with `cuisine-default` so the
guess is never mistaken for knowledge.

A slot is `resolution: explicit` or nothing. A resolvable family may pass
through `cuisine-default` on its way to better tiers. Same ladder, different
floor.

## 3. The table — per term, per cuisine, small enough to read

The resolver is a **table, not an inference engine**. Per cuisine, a handful of
rows:

```
term          cuisine   default        unless                        then
soy sauce     korean    jin-ganjang    dish_type ∈ {soup, side/namul} guk-ganjang, flag for review
sesame oil    korean    toasted        —                              —
chili flakes  korean    gochugaru      —                              —
```

- The `unless` column is why the resolver sees **dish type, not just cuisine**.
  Dish type left curation on 2026-08-17 (`CURATION-RULES.md` §1) — the input is
  now the classifier's title-derived proposal (`npm run classify`), which is
  machine output, never a human judgement. Guk-ganjang recipes also just write
  "soy sauce", and that is the one substitution a Korean cook actually notices.
  So the dish-type rows default *and* flag, and the flag is not optional: a
  resolution triggered by a machine-derived dish type is always a review row in
  the backfill QC list (§6), never a silent default.
- The table lives with the substitution table and rides the same
  cuisine-expansion protocol: **a native validator signs off the resolution
  rows for a cuisine before that cuisine launches** (`DECISIONS.md` §3a). For
  Korean, the founder is the validator.
- Growth discipline mirrors `rules.ts` vs `exceptions.ts`: the *mechanism* must
  not grow with cuisines, only the rows. If a cuisine needs the resolver to get
  smarter rather than the table to get longer, stop — the model is wrong.

**Settled 2026-08-17 — the Korean table is four rows**, in
`src/ontology/resolution.ts`: `soy sauce` (self, with the guk-ganjang dish
trigger), `chili flakes → gochugaru`, `rice → short grain rice`,
`corn syrup → oligodang`. Two candidates were checked and deliberately left
out, with the reasons in the module so they are not re-proposed: `sesame oil`
(review already settled `toasted sesame oil → sesame oil` — the generic node
IS the toasted product here, no sibling to resolve to) and `vinegar` (fails
the nearly-always test).

**The westernisation audit ran 2026-08-17, and the table above owes it a row.**
Two equivalences were poisoned and are fixed:

- `corn syrup → oligodang` — contradicted the reviewer's own node note
  ("corn syrup is glucose syrup from corn, not oligodang", 2026-08-09). Bare
  corn syrup is its own node; `korean corn syrup → oligodang` stays as identity
  (and got the alias row it was missing — a standing engine miss); the Korean
  reading of the bare term became the table's fourth row. The reviewer's two
  decisions were never in conflict — they were about different fields.
- `red pepper flakes → gochugaru` (alias + SYNONYM) — by the reviewer's own
  hot-pepper-flakes reasoning, the generic term is not gochugaru. Retargeted to
  `chili flakes`; the Korean reading is the table's second row. Korean-prefixed
  forms stay, as identity.

**Found and deferred — the same shape, awaiting the curator's call** (each was
a deliberate review decision under the old one-field model; they are corpus-
safe today because the corpus is Korean-blog-sourced, and they will poison
cuisine expansion): `soybean paste`/`fermented soybean paste → doenjang` (a
Japanese recipe's fermented soybean paste is miso — the spec's own flagship
example), `glass noodles`/`starch noodles → dangmyeon` (Chinese glass noodles
are mung bean), `rice cakes → tteok`, `green chili (pepper) → serrano pepper`,
`dried red chili peppers → gochugaru` (whole peppers are not flakes),
`anchovy sauce → aekjeot`, `hot/red pepper paste → gochujang`,
`salted/fermented shrimp → saeujeot`. Scope note: the engine resolves through
`data/ontology/aliases.csv`; `exceptions.ts`'s SYNONYM feeds hierarchy and
integrity checks — both were audited.

## 4. Consumers — loose matching, strict linking

The two consumers of `resolved` use it in **opposite** directions, and the
direction of each default is the point:

| consumer | behaviour | why |
|---|---|---|
| **Matching** (pantry → recipe) | match at family level via `is_a`; rank exact-variant hits higher | a pantry saying "soy sauce" must still match a jin-ganjang recipe — refusing is pedantry, and pedantry is churn |
| **Commerce** (recipe → Weee!) | link from the leaf, `cuisine-default` tier or better; **`unknown` → no link** | a missing affiliate row is cheaper than a wrong bottle. Same honest default as the empty `assetlinks.json` |

Loose linking is what westernisation feels like from the inside; strict matching
is what makes users bounce. Hold the asymmetry.

The third behaviour, between the two: pantry says generic, recipe resolved to a
variant the generic doesn't obviously satisfy (guk-ganjang). That is a **match
with a note** — "this wants soup soy sauce; regular works, but salt and colour
differ" — the existing substitution-strictness machinery pointed at intra-family
variants. It fires exactly for the user who can appreciate the differentiator.

## 5. The provenance ladder — and why every rung is per-recipe

```
explicit           the recipe wrote the variant               980 lines stamped
curated            the curator named the variant on the line (the "means…" box)
creator-confirmed  the creator answered "we guessed jin-ganjang — right?"
user-confirmed     the user resolved their own added recipe
cuisine-default    the §3 table                               619 lines stamped
unknown            no table row applies                       no affiliate link
```

(`curated` added at build time, 2026-08-17: the curation page pre-fills the
table's guess per line and the curator confirms or overrides through the same
autosuggest as everything else — the CURATION-RULES propose-and-confirm
pattern. A curated answer is stored on the curation record by raw line,
outranks the table in `recipe-index`, and never propagates.)

**Settled 2026-08-16: confirmation is a per-recipe fact, stored on the recipe
line — never per creator.** The tempting version was hub-level: a creator's
"soy sauce" is one object across their 60 recipes, confirm once, 60 upgrade.
It is wrong for the same reason the cuisine default needs an `unless` column:
the same creator's "soy sauce" legitimately resolves differently across their
own recipes — jin-ganjang in the bulgogi, guk-ganjang in the doenjang-guk. A
blanket confirmation bakes the majority case into the exceptions.

What the hub keeps is **presentation**: it groups the asks ("we guessed
jin-ganjang in these 12, guk-ganjang in these 3 — confirm?") so the creator
answers in batches, but each tap writes one per-recipe confirmation and an
unanswered recipe stays at `cuisine-default`. The hub saves clicks, not
judgments. Nothing propagates silently.

This also produces the cheapest ask in the creator flow — one tap, yes/no,
about *their* recipe rendering correctly with *their* affiliate default under
it. A wrong bottle under their video is their credibility, which makes this the
rare correction where the creator's motive outruns ours.

**Guardrail:** a creator override is a fact about **their recipe line**, never
a new equivalence in the ontology. If someone insists their "soy sauce" means
Kikkoman in a Korean dish, that is their annotation; it must not teach the
resolver that jin-ganjang ≈ Kikkoman, or the override channel imports the exact
westernisation the identity layer refuses.

The ladder doubles as QC for free: *what fraction of soy-sauce lines still run
on `cuisine-default`* is a single number that should fall over time, and it is
the honest measure of how much of the corpus is guessed versus known.

## 6. Rollout — additive schema, mechanical backfill, propose-and-confirm UI

**Built 2026-08-17.** Where everything landed: the table and resolver in
`src/ontology/resolution.ts` (tested, `npm run test-resolution`); stamps in
`data/ontology/recipe-lines.json` (`resolved`/`resolution` per line) and
`data/ontology/recipe-index.json` (`resolved` map per recipe, for commerce);
the ledger in `data/qc/resolution.csv`, flags first. First backfill across the
corpus: **619 cuisine-default, 980 explicit, 404 flagged** (bare soy sauce in
soups and sides — the guk-ganjang doubt). Curation storage:
`resolutions: [{raw, to}]` on the curation record.

- **Schema change is additive only.** `written` is the existing field renamed in
  spirit, not in storage; `resolved`/`resolution` are new. Existing consumers
  keep working while the new fields land.
- **The curated recipes are not re-curated.** A backfill pass applies §3
  mechanically, then emits a QC list of only the flagged lines (dish-type
  triggers, `unknown`s). Review the list, not the recipes — the
  throughput-over-strictness pattern.
- **The curation UI proposes; the curator confirms.** Pre-fill
  `soy sauce → jin-ganjang (cuisine-default)`; curation becomes accept/override.
  Every override is a missing table row or `unless` clause — the corrections
  are the rule-mining, same as the parser's decision harness.
- **Scoring:** resolution decisions accumulate in `data/decisions/` alongside
  alias decisions and are scored the same way — test cases, never transcribed
  into the table wholesale. The table stays small because contradictions are
  reviewed, not absorbed.

`OPEN` — whether pantry entries ever need resolution. Current answer: no — the
pantry side stays generic and matching is family-level, so a user typing "soy
sauce" is asked nothing. Revisit only if the match-with-a-note (§4) proves
annoying in dogfooding, because the fix (asking users to classify their soy
sauce at add time) spends inventory-friction budget, which is the #1 risk.
