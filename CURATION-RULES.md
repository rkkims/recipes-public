# Curation rules — the enforcement ledger and the annotator handbook

Companion to `QC-SPEC.md` (the tool), `NORMALIZATION.md` (the engine),
`RESOLUTION-SPEC.md` (generic mentions), `INGREDIENT-SPEC.md` (identity).

Written because on-the-fly curation drifted from its own settled rules — 35
singular/plural node pairs exist right now (`strawberry`/`strawberries`,
`anchovy`/`anchovies`) despite `NORMALIZATION.md` settling the number rule and
`QC-SPEC.md` §6 declaring the annotator must never decide it. The lesson is
general: **rules written as prose for a human to remember are not rules.**

Settled in discussion 2026-08-16/17. Open questions marked `OPEN`.

---

## 0. The three tiers — and the rule about rules

> **Every curation rule is assigned to an enforcement tier. "The annotator
> remembers it" is not a tier.**

| tier | meaning | artifact |
|---|---|---|
| **1 — enforced** | the violation is impossible in the tool | input guards, pre-fills |
| **2 — lint** | a script after each session emits a scannable QC list | `npm run curation-lint` → `data/qc/curation-lint.csv` (built 2026-08-17) |
| **3 — judged** | genuine judgment; written as a **test with worked examples** | §2–§4 of this file, and nothing else |

The point of the split is twofold. It minimises the curator's work: everything
mechanical disappears from the loop. And it makes handoff possible: a future
annotator reads only tier 3, which is three tests, because tier 1 and 2 hold
whether or not anyone read anything.

A proposed rule that cannot name its tier is not adopted.

## 1. The ledger — every decision curation asks, and where it lives

| decision | tier | mechanism |
|---|---|---|
| singular vs plural | **1** | `numberKey` guard on mint: if the number-insensitive key hits an existing node, the tool offers that node and minting is impossible |
| alias / node hit on a line | **1** | resolves silently (QC-SPEC §2); a resolved line is never a question |
| node name format — lowercase, singular, native term, no brand | **1 + 2** | format enforced in the input; NATIVE-table renames caught by lint |
| cuisine | **1** | pre-filled from the source blog; override is the exception |
| resolution tier | **1 + 2** | `RESOLUTION-SPEC` §3 table pre-fills `cuisine-default`; lint flags only the `unless` rows |
| mint discipline | **2** | mint freely mid-flow; every mint lands on the session QC list with mention count and top-3 near-misses. A 1-mention mint is a review row, not a block (QC-SPEC §8.4, answered) |
| make_ahead | **1 + 2** | pre-filled through `isRealWait`; lint catches contradictions (a `make_ahead: false` pickle) |
| ~~quality, dish_type~~ | **removed 2026-08-17** | not curated at all. Quality: the verdict already records keep/drop, and 39 of the first 40 rows said "good" — a field with one answer is a keystroke, not a judgement. Dish type: its one consumer (the `RESOLUTION-SPEC` §3 trigger) reads the classifier's title-derived proposal instead; hand-confirming a derivable field was work with no product behaviour behind it. Saved values round-trip untouched on revisit |
| hierarchy edge accept/reject | **3** (§4), lint-assisted | lint blocks cycles, alias-children (see §4), and allergen-conflict edges |
| recipe verdict + quality | **3** (§2) | |
| agent draft pre-fill | **1** | every queue recipe carries a machine draft (`data/curation/drafts.json`, 2026-08-18, whole queue). The form pre-fills its fields from the draft — suggested verdict shown as a line, never a pressed button; quality and dish_type never carried, they have no on-screen control and a silent pre-fill would write machine output into the test set. Saved judgement outranks the draft; the tool never writes the draft file |
| new surface: junk / split / alias / mint | **3** (§3) | |

**Prerequisite cleanup before the tier-1 guards mean anything:** merge the 35
existing singular/plural pairs behind redirects (`INGREDIENT-SPEC` §1). A guard
that protects an already-split corpus enforces the drift.

---

# The handbook — tier 3, complete

Three tests. Everything else an annotator might wonder about is deliberately
absent: if a question is not one of these three, the tool or the lint owns the
answer, and meeting it as a question means filing a defect, not deciding.

## 2. Recipe verdict — *"would we be right to recommend this to a stranger?"*

Not "is this a good recipe." The matcher will surface this recipe to someone
whose pantry satisfies it, with no human in between — so the test is whether
that act is defensible: ingredients parse to real purchasable things, amounts
are usable, the dish is what its title claims, and it does not duplicate a
kept recipe.

**A drop requires a reason from a closed list:**

```
duplicate | not-a-recipe | incomplete | unparseable | out-of-scope
```

The corpus already contains the counterexample motivating this:
`rec_vqopvgl9ic55` is dropped with `quality: good` and no reason — a decision
that cannot be learned from, audited, or explained to the next annotator.
Free-text notes may *accompany* a reason, never replace it.

**Tea and coffee BEVERAGES are out-of-scope — curator ruling, 2026-08-20**
("it's not our target"). Applied corpus-wide the same day: 63 drops. The line
is drawn at the drink: a dish that merely uses tea or coffee (matcha cake,
coffee jelly, tea eggs, ochazuke, tea-rubbed ribs) is food and stays; a latte
is a coffee drop when it actually contains espresso (burnt-sugar and black-
sesame lattes did). Milk-and-grain café drinks with NO tea or coffee in them
(misugaru, sweet-potato/goguma latte, kinako latte, coffee-less pumpkin-spice
latte) are not covered by this ruling — the curator ruled them IN scope the
same day ("keep them"): 7 keeps on record.

**Quality is not curated — settled 2026-08-17, by deletion.** The draft of this
section proposed pricing quality tiers in consequences; the curator's answer
was to remove the field instead: keep/drop is the record, and 39 of the first
40 rows saying "good" showed the field had one answer. This resolves the former
`OPEN` here. The rule that survives is the test above — a tier with no
behavioral difference does not exist, and *zero tiers* is its honest fixed
point until a product behavior actually needs one.

**Calibration set:** the existing curated recipes in `data/curation/`. New
annotators curate five of them blind and diff against the recorded verdicts
before touching new recipes. The handbook inherits the founder's judgment;
this is the mechanism.

## 3. The four doors — for a surface that resolves to nothing

Ask in this order; each door is cheaper than the next, and stopping at the
first open one is the rule.

**Door 1 — Junk.** Is it an ingredient at all? Serving counts (`for 4`), parse
wreckage (`visible fat`), equipment (`slow cooker`). Mark unparseable; the
line is recorded, nothing enters the ontology. Precedent: `unknown.csv`
rejects `for 2` / `for 4` as "serving count, parse artifact."

**Door 2 — Split.** Two ingredients sharing a line. `salt and pepper` (274
lines), `white and black sesame seeds` — already flagged in `aliases.csv` with
exactly the right instinct: *"should be split: white sesame seeds / black
sesame seeds."* Split writes two lines; each then walks the doors alone.

**Door 3 — Alias.** The **shopper test**: *would a shopper walk out of the
store with the same product?* Same product → alias. Precedents from
`aliases.csv`: `korean solar sea salt` → `salt`; `hard-boiled eggs` → `eggs`
(state the cook produces — the modifier classes of `NORMALIZATION.md` apply
before identity is judged).

> **The named trap: an alias is identity, never substitution.** `miso` →
> `doenjang` fails the shopper test even though many recipes survive the swap.
> Substitution is a *weighted edge* (`substitutes_for`), recorded in the
> substitution table — never an alias. This confusion is the single vector by
> which westernisation would enter the identity layer, which is the layer the
> product differentiates on. When in doubt, it is a substitution, not an alias.

**Door 4 — Mint.** A real ingredient with no node — last resort, and the
purchase test applies: a thing someone could put in a cart. Precedent:
`ground coffee` minted with the reasoning written down ("real ingredient
(dalgona etc.), not instant coffee, no node yet"). That note is the standard:
a mint states what the thing is *and why no existing node covers it*. The
lint will show every mint with its mention count and near-misses; a 1-mention
mint should feel heavy, not forbidden.

## 4. Hierarchy — *"does the child satisfy a recipe that asked for the parent?"*

Directional, always concrete: put the child in the pot of a recipe naming the
parent.

- `pork belly` in a dish asking for "pork" — fine. **Accept** (`is_a`).
- `coconut milk` in a dish asking for "milk" — ruined. **Reject**, regardless
  of what the words share.

Traps, each with recorded precedent in `rejected-edges.csv`:

- **Head-noun direction.** `mozzarella cheese is_a mozzarella` is backwards —
  the head noun is `cheese`; the suffix rule already handles it.
- **Alias children.** An edge whose child is an alias, not a node, can never
  fire — the alias already resolves the surface before matching begins
  (`u10 shrimp is_a shrimp` and 60+ siblings). Lint blocks these; if one
  appears as a question, the bundle is stale.
- **Categories too broad to match.** `vegetable`, `meat`, `sauce`, `spices` —
  rejected with reasons recorded in `categories.csv`; read them before
  proposing a category. The test: does any recipe *call for* this word
  generically? If not, the edge discloses without ever matching.

---

## 5. What the note field revealed — structured decisions hiding in prose

The current `note` fields on curated recipes contain at least six decision
types that have no home, so they were written as sentences addressed to
future tooling:

| hiding in notes | example from `data/curation/recipes.json` | proper home |
|---|---|---|
| line splits | "salt and pepper → pepper is omitted" | the split door (§3), stored per line |
| substitution edges | "rice wine sub: white wine" | `substitutes` — exists, keep using it |
| optionality | "add rice water as optional" | `tier_overrides` — exists |
| equipment requirement | "this recipe requires slow cooker. we need to flag…" | `OPEN` — new recipe field `equipment: []`, closed vocabulary |
| derives-from proposals | "adding kimchi to pantry should add kimchi juice too" | `derives_from` proposal queue |
| parser defects | "scallions parsing error" | `bad_lines` — exists; lint should count them per source |

Rule going forward: **a note that contains a decision is a defect report
against the tool.** Notes are for context; decisions get fields. The lint
greps notes for decision-shaped phrases ("should", "→", "sub:") and lists
them, so prose decisions surface instead of fossilising.

## 6. Build checklist (tier 1 and 2 — the work that deletes curator work)

1. Singular/plural **merge pass** with redirects for the 35 existing pairs.
2. `numberKey` mint guard in the curation tool.
3. Cuisine pre-fill from source; resolution pre-fill from the `RESOLUTION-SPEC`
   §3 table.
4. ~~`npm run curation-lint`~~ — **built 2026-08-17**, `src/qc/curation-lint.ts`.
   Checks: unresolved corrections with near-misses; renamed-form corrections
   (number-only differences excluded — the number rule owns those); unbuilt
   mints; drops without reason; make-ahead/dish-type contradictions (dish type
   from the classifier since curation stopped collecting it); live alias-child
   and dangling edges (tombstoned edges excluded); number-split pairs as the
   merge-pass regression guard; decision-shaped notes. First run: 68 rows, 43
   of them the lint's own false positives (junk-door markers, tombstones,
   number renames) — fixed; 25 real rows remain.
5. The **split door** in the tool (QC-SPEC §7's missing fourth door).
6. ~~Drop-reason enum~~ — **built 2026-08-17.** The form refuses a drop
   without a reason chip (one extra tap, only on the rare verdict); stored as
   `drop_reason`, lint covers only pre-enum rows now.
7. ~~Equipment field~~ — **collected since 2026-08-17** as chips from a closed
   vocabulary (slow cooker, air fryer, oven, grill, blender, stand mixer,
   deep fryer, rice cooker). Still `OPEN`: whether it gates matching or only
   labels the card — the fact is banked either way.
8. Completeness audit, 2026-08-17: everything else the specs name is either
   collected (verdict, cuisines, make-ahead, components, mains, per-line
   corrections/tiers/substitutes/resolutions) or deliberately absent (quality,
   dish type, time). Two gaps deferred with owners: the **split door** is
   parser work and the `should be: A / B` note convention records the fact
   meanwhile; **derives-from proposals** belong to ontology curation, not this
   screen.

The measure of success is the ratio of tier-3 decisions per curated recipe —
it should fall as the ledger absorbs work, and the handbook should never grow
past three tests without this file recording why.
