# Ingredient normalisation

Companion: `RESOLUTION-SPEC.md` — what happens *after* a string settles cleanly
on a generic node ("soy sauce") that the recipe's cuisine makes specific.

The core engine. Turns a raw ingredient string into a settled ontology node, and
is meant to be improved over years and extended to cuisines nobody has crawled
yet — so its design goal is not "correct today" but "correctable forever."

## Three stages

```
  raw line   "2 tablespoons zest of 1 lemon, finely grated"
      │
  1.  │  separate MEASUREMENT from ingredient          frequency.ts
      │  quantities, units, portions, and the awkward shapes where
      │  measurement wraps the name ("zest of 1 lemon" → "lemon zest").
      │  Normalises syntax only. Never decides identity.
      ▼
      "lemon zest"
      │
  2.  │  separate ADJECTIVES from the raw ingredient   normalize.ts
      ▼
      modifiers: [zest]   head: lemon
      │
  3.  │  does each adjective oblige a SEPARATE PURCHASE?
      │  rules.ts for the general answer, exceptions.ts where the
      │  word alone cannot decide.
      ▼
      "lemon"
```

Stage 1 is lexical and cuisine-independent. Stage 3 is where all the judgment
lives. Keeping them apart is what stops quantity bugs from looking like ontology
bugs — and it is why `zest of` is handled in the parser rather than the engine,
despite being about an ingredient part: the parser is the only stage that can
see the quantity sitting between `zest` and `lemon`.

## The test

> **Does this adjective oblige a separate purchase?**

Not "is it a different thing" — plenty of adjectives describe real differences a
cook produces on the spot. The matcher only ever asks *can this person cook this
dish tonight*, so a modifier matters exactly when a pantry holding the
unmodified ingredient does not satisfy the recipe.

| | |
|---|---|
| `hot chicken stock` | you heat what you have → **strip** |
| `dried shiitake` | a different bag on a different shelf → **keep** |
| `granulated garlic` | grind the garlic you own → **strip** |
| `granulated sugar` | nothing in a pantry becomes it → **keep** |

The last pair is why the test is about the **ingredient**, not the word. Where
the word alone cannot decide, the pair is listed in `exceptions.ts`.

## General rules vs exceptions

The distinction that governs maintenance, made structural rather than
documented:

| file | what it is | when it changes |
|---|---|---|
| `src/ontology/rules.ts` | **general** — claims about how ingredient names work | must NOT grow with cuisines |
| `src/ontology/exceptions.ts` | **exceptions** — semantic facts no rule derives | expected to grow with every cuisine |
| `src/ingest/frequency.ts` | lexical parser | rarely; quantity-phrase shapes are near-universal |

General rules are the asset that compounds. Exceptions are the rent paid per
cuisine, and paying it is fine — what is not fine is the general rules
stagnating while the exception file swells, because that is the engine quietly
becoming a lookup table with extra steps.

So it is measured. Every rule application is tagged `general` or `exception`,
and `npm run agreement` reports the split:

```
of the 532 correct answers, what produced them:
  general rules    51   ← carries to the next cuisine
  exceptions       40   ← per-cuisine rent
  untouched       441   ← the proposal was already right
```

The number to watch when adding a cuisine is whether `general` grows with it.
If a new cuisine adds only exceptions, the class model missed something.

`src/ontology/normalize.ts` is the engine and should stay roughly fixed. **If a
new cuisine forces a change to the engine rather than to the tables, the class
model is wrong and that is worth stopping for.**

## The classes

| class | behaviour | test |
|---|---|---|
| `state` | strip | can the cook produce this from the raw form in one session? |
| `preservation` | keep | cannot be made in one session — it is a separate purchase |
| `grade` | strip | a label claim; changes the price, not the dish |
| `size` | strip | a quantity in disguise |
| `cut` | keep | "if a recipe specifies a specific cut of meat, it should be that one" |
| `origin` | **keep by default** | gai lan is not broccoli; strip only for global commodities |
| `variety` | keep | cultivar, colour, grain or texture the cook cannot substitute |

### What the classes cannot decide

Three tables exist because the reviewer showed the rule could not be written:

- **`PURCHASED_FORM`** — `granulated sugar` keeps its modifier, `granulated
  garlic` does not. "Granulated sugar is not possible to create on-site. You
  should buy it. Garlic can be made on site with the whole garlic." The `state`
  test is about the ingredient, not the word.
- **`ORIGIN_PRODUCT`** — `japanese mayonnaise` keeps its origin, `korean
  mayonnaise` does not. "There is no Korean mayo. But there is japanese mayo.
  The distinction is from semantic, it cannot be logiced." Whether a country has
  a distinct version of a commodity is a fact about the world's kitchens.
- **`SYNONYM`** — `korean perilla` is perilla grown in Korea, `korean radish` is
  a different vegetable. Same shape, opposite answers.

Listing these honestly is the point. A rule that quietly gets one of them wrong
is worse than a table that admits it is a table.

Plus four small tables that encode what no class can derive: `NATIVE` (origin
words naming a distinct product, renamed to the native term — `gochugaru`,
`doenjang`), `SYNONYM` (world knowledge: `bird's eye chili` is `thai chili
pepper`), `CATEGORY`/`IMPLIES` (the category noun appears exactly once), and
`SLOTS`.

## Number — singular or plural

A display-name rule, settled because both authorities agreed rather than by
taste.

> **Singular, unless the catalogue never uses the singular.**

| | singular | plural |
|---|---|---|
| Our confirmed nodes | 2,569 (83%) | 515 (17%) |
| Weee! catalogue names | 5,409 (87%) | 818 (13%) |

Per ingredient the catalogue is decisive where it matters — `egg` 3–0,
`bay leaf` 12–0, `strawberry` 9–2 — and the plural cases are a distinct class:
`pine nuts` 0–16.

### The exception is derived, not listed

Some things are only ever handled in the aggregate — `pine nuts`, `red dates`,
`chickpeas` — and "pine nut" reads like a mistake. The tempting fix is a
hand-kept list, and it would be one more table to drift.

The catalogue already answers it. A thing sold only in the aggregate has **zero
singular SKUs**, so the exception falls out of the data and stays true as the
catalogue changes. A floor of **three plural SKUs** stops one oddly-named
product from inventing an exception — `peas` rests on a single SKU and does not
qualify.

92 keys currently qualify. 504 of 3,084 nodes change.

### It is a display name, and nothing else

`INGREDIENT-SPEC.md` §1 makes this free: `display_name` is *"freely editable.
May change."* So the rule is applied **at build time to the display name only**
— the node string stays exactly as it is, because `identity.csv` keys ids to it
and renaming a node would mint a new id and orphan every pantry row pointing at
the old one.

Two consequences that have to be handled, or the rule breaks something:

- **The old surface becomes an alias.** The corpus wrote `onions` 1,022 times
  and that spelling has to keep resolving.
- **Search must be number-insensitive.** It matched substrings on the name, so
  with a node called `onion` a user typing "onions" found nothing. That was
  already wrong for the 83% that were singular; the rule would have extended it
  to the rest.

### It exposed two bugs in `singular()`

Worth recording, because they had been invisible for a reason that generalises:
`singular()` only ever built lookup KEYS, and both sides of a comparison were
mangled identically, so nothing failed. Showing the result to a person is what
made them visible.

- `fungus` → `fungu`, `asparagus` → `asparagu`. Latin singulars, now guarded.
- `cookies` → `cooky`. `-ies` comes from `-y` (anchovies → anchovy) except when
  the singular already ends in `-ie`, which nothing in the spelling reveals — so
  the short list of food words that behave that way is named.

A guard on `-is` was tried and removed: it would have caught `kimchis`,
`zucchinis` and `paninis`, the plural of every food word ending in `-i`, which
is a far larger class here than the `-is` singulars it protects.

Both fixes leave `npm run agreement` unchanged at 87.8%, which is the expected
result and the reason to check.

## Slots

A node that is a **choice**, not an ingredient. A recipe naming one must resolve
to a child; a pantry entry matching one must be clarified before it can match.

Naming convention: `<slot> - <name>/<name>`, most internationally recognised name
first, native romanisation second. The display string is **derived** from the
name list, never stored, so adding an alias cannot leave a canonical stale.

```
seaweed - nori/gim        sheets (Porphyra)     — wraps, garnish
seaweed - wakame/miyeok   soup seaweed (Undaria) — miyeok-guk
seaweed - kombu/dashima   broth kelp (Saccharina) — steeped, discarded
seaweed - aonori          powdered green laver   — topping
```

This is the one thing no modifier table can decide, because the fact lives in
cooking rather than in language: `nori seaweed` and `dried wakame seaweed` look
like one word plus noise, and collapsing them would let a nori-owning user match
a miyeok soup. Slots are how the granularity rule in `DECISIONS.md` §3 is
enforced at the data level.

## Review is a test suite, not a rule source

`npm run agreement` scores the engine against `data/decisions/aliases.csv` and
writes `data/qc/agreement.csv`, conflicts first.

Manual decisions are **test cases**, never transcribed into an alias map.
Transcription bakes the reviewer's mistakes in permanently and has to be redone
for every new cuisine. Scoring instead means a rule change re-runs in a second
and reports exactly which calls it now contradicts; a contradiction is a bug in
*either* the rule or the original call, and only contradictions need a human.

Two numbers, and only one of them is worth trusting:

- **strong** — flags and rejects. The reviewer stopped and typed a target. Intent.
- **weak** — accepts. May mean "correct", may mean "row 340 of 1285". Tuning to
  fit these is fitting noise.

The harness has already caught the reviewer twice (`jasmin rice` for `jasmine
rice`) and caught the engine's author far more often — the `origin` class was
written backwards and only the score revealed it.

## Status

```
scored 553 of 593 decisions
  agreement   96.2%
    strong    82.1%   ← the number that matters
    weak      99.6%
```

`npm run resolve` settles conflicts in the engine's favour, rewriting the
decision and keeping the previous answer in the note. It touches ONLY
`conflict` rows. `engine-missed` rows are left alone on purpose: there the
engine has no opinion, so there is no rule to follow and the reviewer's
judgment is the only information present — overwriting those would destroy work
while claiming to enforce a rule.

The 13 lexical parser defects the reviewer had caught by hand are fixed in
`frequency.ts` and covered by `npm run test-parser` (29 cases). They no longer
reach the engine at all — which is why the scored total dropped from 586 to 552:
those rows stopped existing.

## Relations

Normalisation decides what a node IS. `src/ontology/edges.ts` decides what it
SATISFIES, which is the question the matcher asks. Three directional relations:

| relation | example | matching |
|---|---|---|
| `is_a` | `coarse salt is_a salt` | specific satisfies general, never the reverse |
| `derives_from` | `lemon juice derives_from lemon` | whole satisfies part, never the reverse |
| `substitutes_for` | `cheongyang ↔ serrano` | symmetric, weighted below an exact hit |

Direction is the whole point. Kimchi made with table salt fails, so a recipe
asking for coarse salt has to mean it; `kimchi → kimchi juice` is deliberately
absent because a cup of brine needs more kimchi than a pantry holds, and
modelling that needs a quantity threshold this version does not have.

## What a new cuisine costs

Adding Italian should be: new words in `variety` (`san marzano`, `00`,
`guanciale`), new words in `preservation` (`cured`, `aged` already there), a
handful of `SYNONYM` entries, and one or two slots (`pasta`, `cured pork`). No
engine change. That expectation is the design's falsifiable claim — if it fails,
the class model needs revisiting rather than patching.

## The LLM extraction overlay

Settled 2026-08-20, from a measured pilot (`data/curation/llm-extraction-pilot.md`).

The deterministic parser is the FAST PATH and stays it: reproducible,
testable, free at build time, and fixable in families. The overlay exists for
the lines it cannot read — on the pilot's 5,461 such lines, model extraction
resolved ~59% of the real ingredient lines against the ontology as it stood,
and named the rest instead of dropping them.

- **One file**: `data/ontology/llm-lines.json`, entries keyed by an FNV-1a
  hash of the ORIGINAL crawled line. Keying on the exact bytes is what makes
  an LLM step reproducible: the same line always answers the same way, a
  re-crawl re-extracts only lines the file has never seen, and the build
  itself stays deterministic — the model runs offline, never during a build.
- **Consulted on failure only** (`src/ingest/llm-lines.ts`, read by
  `recipe-index`): when `resolveIngredient` finds no head or a head no node
  answers, the overlay's names are resolved through the SAME engine —
  normalize, aliases, number fold. The model proposes surfaces; identity
  stays the ontology's job (DECISIONS §3). A name the engine cannot resolve
  becomes a NAMED unresolved surface — visible alias work, not silence.
- **Verified at seed time, not trusted**: every stored name must anchor in
  its raw line (fuzzy, edit distance ≤2 per token — typo fixes like
  `tumeric → turmeric` pass; inventions do not) or be Hangul. Entries whose
  names all fail verification are not stored.
- Lines the overlay resolves carry `llm: true` in `recipe-lines.json`, so the
  curation UI and QC can always tell which path answered.
- The curation file remains the parser's test set; overlay lines that a
  curator corrects are corrections of the MODEL's read, and the seed
  verification script is where they feed back.

Future, deliberately not built yet: `npm run llm-lines` to extract only
missing hashes after a crawl; overlay `alternates` feeding the substitutes
harvest.
