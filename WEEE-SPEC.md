# Weee! catalogue — naming authority spec

Companion to `NORMALIZATION.md` (the engine) and `INGREDIENT-SPEC.md` (the
entity). This file specifies a **third evidence source** alongside the recipe
corpus and the reviewer, and the rules that keep it from becoming a fourth
ontology.

Its primary job is narrow and was chosen because nothing else does it: deciding
the **representational name** of an ingredient. The purchase-test evidence in §5
is a by-product, valuable but secondary.

Written before the import, because the failure mode is not subtle. The catalogue
is 250,000 rows, the ontology is 3,085, and an import that goes the wrong
direction is not a bad merge — it is the end of the node list as a curated
object.

---

## 0. The rule this whole file exists to hold

> **The catalogue is EVIDENCE about ingredients. It is never a source of
> ingredients, and it names things it does not create.**

It writes to `data/weee/` and to QC proposals. It never mints an id, never adds
a node, and reaches `ontology.yaml` only by passing the same review every other
proposal passes.

Stated the way `CREATOR-SPEC.md` §0 states its three words:

| | what it is | scope | example |
|---|---|---|---|
| **Ingredient** | a thing that exists in the world | our ontology | `gochujang` |
| **Product / SKU** | a thing a retailer sells | Weee!'s catalogue | `CJ Haechandle Gochujang 500 g — $8.99` |
| **Shelf** | where a retailer files it | Weee!'s taxonomy | `seasoning05/Hot-Sauce` |

A SKU decomposes into brand + ingredient + pack size, and the ontology already
has a settled opinion about two of those three that this import must not
overturn (§7).

---

## 1. The gap this fills

Today a node's representational name is decided by **corpus frequency and
nothing else**.

```
data/qc/aliases.csv     proposed_canonical   ← the most common surface across 15 blogs
        ↓  npm run promote
data/ontology/nodes.csv node
        ↓  npm run build-ontology
ontology.yaml           name:                ← build.ts:207, that string, sentence-cased
```

So the display name of an ingredient is *whatever fifteen food bloggers happened
to type most often*. That is a real anchor for `garlic` and a coin-flip for
everything the corpus saw four times. And it gets worse, not better, as recipes
are added: every new source contributes surfaces with no mechanism to decide
which of them is the name.

**A retail catalogue is a naming authority in exactly the sense required.** The
name on the shelf is the name the user will read when they go to buy the thing —
which is the moment the product exists to serve (`DECISIONS` §2). Frequency
across blogs is a proxy for that; a store's own product name is the thing
itself.

**And this is safe by construction.** `INGREDIENT-SPEC` §1: the `id` is
permanent, `display_name` is *"freely editable. May change."* Adopting catalogue
names touches only the mutable field. It is the one use of this data that
carries no migration risk at all — which is why it is Job 1 and why §7 is so
strict about everything else.

---

## 2. The shelf-scoped crawl — the primary path

The naive import is: pull 250,000 product URLs from the sitemaps and filter out
the non-food. That does not work, for a mechanical reason and a quality reason.

**Mechanically:** the product sitemaps carry no category. `/en/product/Laoganma-Fried-Chili-in-Oil/78`
is a name and an id, nothing else. There is no field to filter on.

**By quality:** the non-food half is not a rounding error. Of 212 category
branches, roughly half hold no cooking ingredient — `care` (15: facial cleanser,
makeup), `health` (8), `grocery` (10: household, office supplies, *Anime*),
`alcohol` (9) — and a large further block is prepared food (`snack` 15,
`freshbakery` 14, `instant` 12, `freshgourmet` 10, `bakery` 8).

### So enumerate the shelves you want, and never fetch the rest

`sitemap-en-category.xml` gives 212 categories with stable codes. About **90 leaf
shelves are almost purely cooking ingredients**:

```
green01..16      Leafy-Vegetables · Peppers · Peas-Beans · Mushrooms · Onions-Shallots
                 Potatoes-Yams · Root-Vegetables · Cucumbers · Squash-Zucchini
                 Tomatoes · Corn · Herbs · Frozen-Vegetables …
dried01..09      Rice · Grains · Noodles · Dried-Vegetables · Flour-Starch
                 Dried-Seafood · Spices-Herbs · Dried-Nuts-Seeds
seasoning01..10  Cooking-Oil · Cooking-Seasoning · Dipping-Sauces · Dry-Seasoning
                 Hot-Sauce · Salt-Pepper · Soup-Base · Soy-Sauce · Sugar · Vinegar
tofuplantbased   Tofu · Bean-Curd · Miso · Rice-Cake · Kimchi · Pickled-Vegetables
meat01..07       Pork · Beef · Lamb · Poultry · Exotic-Meat · Deli-Meat
seafood01..06    Shrimp · Shellfish · Whole-Fish · Fish-Fillets-Steaks
dairy01..05      Milk-Cream · Eggs · Yogurt · Butter · Cheese
fruits01..13     Stonefruits · Apples · Pears · Melons · Grapes · Dates · Berries
                 Citrus · Persimmons · Tropical
canned01..03     Canned-Food · Packaged-Food · Preserved-Fermented
```

**Non-food is excluded by never being fetched.** No filter to maintain, no
classifier to be wrong, no 200 GB crawl to discard 60% of.

### What a shelf page yields, and the limit

A category page is server-rendered: **60 products in the HTML**, with names in
the product links. Then it stops.

- `?page=2` and `?p=2` return the **identical 60** — the param is ignored.
- "Load more" calls the `/api/` endpoint, disallowed under `User-agent: *`.
- **No page states how many products the shelf holds.** An earlier draft of this
  section claimed `seasoning08/Soy-Sauce` reports `total: 411`. It does not —
  that number was read out of SVG path data. So how much of a shelf 60 products
  represents is honestly unknown, and §10 keeps the question open rather than
  answering it with a number nothing supports.

### Measured, on the first full run

76 shelves marked `ingredient=yes`, one request each:

| | |
|---|---|
| shelves fetched without error | **76 / 76** |
| shelves that yielded products | **71** |
| shelves rendering **zero** products server-side | 5 — `fruits11` Persimmons, `green04` Frozen-Vegetables, `meat05` Exotic-Meat, `seafood05` Seafood-Hot-Pot, `tofuplantbased06` Rice-Cake |
| distinct products captured | **2,731** |
| shelves returning a full 60 | 29 — the rest hold fewer |

The five zeroes are deterministic, not a race: repeated fetches, the bare
`/category/<code>` form and an explicit zip all return the same page with no
product links in it. Their grids are client-rendered, so those shelves are
simply not reachable this way. Persimmons in August may also be genuinely out
of season — but the other four are not, so seasonality is not the explanation.

The reachable catalogue is therefore **~2,700 SKUs, not the ~5,400 a flat 60
per shelf would predict.**

**The limit and the goal coincide, which is the reason to accept it rather than
work around it.** A shelf's first page is its top-ranked products. For a
*naming* vocabulary that is the right sample and the deep tail is the wrong one
— we want the name of the soy sauce people buy, not the 411th. A mechanism that
caps us at the head of each shelf is doing the sampling we would otherwise have
to design.

**Do not route around it.** The `*/api/` endpoint is disallowed and §8 is why
that matters more here than it would for a blog.

### The sitemap tier, and its one permitted use

`sitemap-en-product-01..25.xml` — **241,997 SKU titles**, free, no page fetches,
no category. Originally permitted for exactly one question:

> **Is this string the name of something somebody sells?**

That is the unknown-confirmation job in §4b.

### The admission gate — this rule was amended, and why

The original rule was *membership test, never a name source*, to keep the
250,000-row prepared-food tail out. Measurement forced an amendment: shelf pages
alone offer an autosuggest hit for only **71%** of corpus ingredient lines, and
the misses are not exotic — `mirin` (293 lines), `kosher salt` (519),
`shaoxing wine` (577), `green onions` (480). Those sit on shelves we crawled and
truncated at 60, so **no amount of shelf selection fixes it; only more titles
do.**

So a sitemap title may enter the vocabulary, under a gate with two parts:

1. **It must name something we already have** — an ontology node, or a head the
   corpus produced. `selfheating beef hot pot tomato flavor` joins to nothing
   and never appears.
2. **At most three per ingredient, shortest first.** This is the part that does
   the real work. Both looser rules failed, measured:

| gate | vocabulary |
|---|---|
| any suffix match | **40,629** — admits `korean bbq beef bulgogi marinade sauce` as a way of saying `sauce` |
| exact/plural only | 2,871 — but loses `mirin`, because the catalogue sells `mirin sweet cooking seasoning` and never plain `mirin` |
| **join + 3 shortest per ingredient** | **6,408**, and 84% line coverage |

**This does not make the sitemap a source of ingredients.** Nothing admitted
here can mint a node; §7 is unchanged. It is coverage for names we already have,
bounded by a cap rather than by trust.

Measured: 4% of it (10,000 SKUs) already contains 31% of confirmed nodes and 14%
of the 1,947 strings in `data/qc/unknown.csv`.

### robots.txt, plainly

Under `User-agent: *`: `*/goods/*`, `*/item*`, `*/search`, `*/api/`, `*/mgp/*`
and `*/grocery-near-me/*` are disallowed. `/product/`, `/category/` and
`/brand/` are **not**, and the sitemaps advertise them. Both paths above are
compliant.

`ClaudeBot`, `GPTBot`, `CCBot` and sixteen other AI crawlers get `Disallow: /`
outright. We are none of those. It is still a stated preference about machine
reading, and §8 takes it seriously rather than lawyering it.

---

## 3. The pipeline, and what it actually achieves

Measured on real data, not estimated.

| pipeline | 10,000 sitemap SKUs → distinct names |
|---|---|
| brand-strip only | 9,584 — **4% collapse** |
| + `headName` + `normalize.ts` | 7,587 — 24% collapse, but **93% singletons** |
| **food-only shelves** (7 shelves, 536 SKUs) | 264 — **50% collapse**, clean head |

**Brand-stripping is not the operation that aggregates.** The tail was never
brands; it was `liuyishou spicy hot pot soup base`, `selfheating beef hot pot
tomato flavor`, `trai cay say mix fruit chips`. Prepared food. Cutting non-food
does not tidy the result, it *is* the result — which is what §2 is built on.

### Stages

`INGREDIENT-SPEC` §5: *"the engine is the gate."* A SKU title is a new kind of
input and gets no special path.

```
  "Laoganma Fried Chili in Oil 275 g"
      │
   a. │  strip brand         ← brands.csv (2,290) + frequency pass, §3.1
      ▼   "Fried Chili in Oil 275 g"
      │
   b. │  strip measurement   ← frequency.ts, UNCHANGED
      ▼   "fried chili in oil"
      │
   c. │  head + modifiers    ← normalize.ts, UNCHANGED
      ▼   modifiers: [fried]  head: chili oil
      │
   d. │  shelf-scoped family ← group by (shelf, head); pick the representative
      ▼   chili oil
```

Only (a) and (d) are new code.

**If a SKU title forces a change to `normalize.ts`, stop.** Same falsifiable
claim `NORMALIZATION.md` makes about new cuisines: the engine should not move. A
catalogue that breaks it has found a real gap in the class model, and that is
worth stopping for rather than patching.

### 3.1 Three defects the raw output has, with real examples

None are fatal and all are measured. Listing them is the point — a naming
authority that quietly emits `shiiitake` is worse than one that admits it needs
a pass.

**The brand sitemap catches 68%.** Prefix-matching the 2,290-brand list hits
6,844 of 10,000 titles. Survivors in the output: `chuan zhi wei`, `czw`, `nature
joy`, `donglong`, `gong he`, `hsu s`, `lkk`, `haday`, `golden gate`, `chang
shing`. Needs a frequency-based second pass — a leading token that recurs across
unrelated shelves is a brand, whatever the sitemap says.

**The catalogue needs the same alias work the corpus needed.** It emits `oyster
mushrooms` and `oyster mushroom`, `tofu firm` and `firm tofu`, and `shiiitake` —
a typo in their own metadata, the `Sue | My Koran Kitchen` of this source. A
naming authority is not a clean vocabulary out of the box.

**Retail grade-words survive:** `superior light soy sauce`, `grade a light soy
sauce`, `delicious light soy sauce`, `premium`, `original`, `no preservatives
added`, `less sodium`. These are `NORMALIZATION.md`'s `grade` class — strip —
and unlike cuisine exceptions **these words are general**: they carry to any
retailer, so they belong in `rules.ts` rather than `exceptions.ts`. That makes
them the kind of rule the doc says should compound, and the number to watch when
this lands is whether `general` grows.

### What comes out, unedited, after the food-only cut

```
soy sauce · dark soy sauce · light soy sauce · sweet soy sauce · soy sauce paste
soft tofu · firm tofu · silken tofu · bean curd roll
oyster mushroom · king oyster mushroom · shiitake · enoki · maitake · wood ear
bay leaf · star anise · sichuan peppercorn · fennel seeds · cardamom · cinnamon
perilla leaf · thai basil · galangal · lemongrass · curry leaves · culantro · shiso
shishito · poblano · serrano · anaheim · fresno · korean chili pepper
```

---

## 4. Job 1 — the naming authority

### 4a. It renames; it does not add

Of 17 head names checked against `nodes.csv`, **11 already exist** —
`light soy sauce`, `silken tofu`, `galangal`, `perilla leaf`, `shishito`,
`star anise`, `bay leaf`, `curry leaves` are all nodes today. Absent:
`king oyster mushroom`, `maitake`, `enoki`, `poblano`, `wood ear` (and `kombu`,
already a slot child).

So the catalogue is **not a vocabulary source**. The corpus already has the
ingredients; what it lacks is an answer to *which surface is the name*. That is
what this writes, and the output shape follows from it:

```
data/weee/naming.csv
  node               the existing node the shelf family joined to
  current_name       what corpus frequency chose
  shelf_name         what the retailer calls it
  shelf              seasoning08/Soy-Sauce
  sku_support        how many SKUs on that shelf carry the name
  agrees             yes | no        ← the only column a reviewer must read
```

**Rows where `agrees = yes` are the finding, not the noise.** Every agreement is
an independent confirmation that corpus frequency picked the name a shopper
would recognise, which is the claim §1 could not otherwise test. The
disagreements are the queue.

### 4b. Unknown-confirmation, from the sitemap tier

`data/qc/unknown.csv` holds 1,947 strings the corpus produced and the ontology
could not place. 14% of them appear in a 4% sitemap sample — `chinkiang
vinegar`, `ichimi togarashi`, `fermented bean curd`, `king oyster`, `mugwort
powder`.

A hit answers one question only — *somebody sells this* — and that does not
promote anything. It raises the string out of the undifferentiated unknown pile
into the existing `npm run propose` queue with a reason attached.

**The join is on parsed heads, never substrings.** Substring matching produced
`for 2`, `hard` and `gas stove` as hits in the measurement above. That noise is
the reason stage (c) exists.

### 4c. Slot children

`NORMALIZATION.md` calls slots *"the one thing no modifier table can decide,
because the fact lives in cooking rather than in language."* But a slot is also
a shelf: `snack/Seaweed` is the aisle behind `seaweed - nori/gim` versus
`wakame/miyeok`.

The catalogue does not decide that a slot is needed. It reports **which children
a US shopper can actually buy**, which is the part that currently requires
someone to already know the cuisine. Reported, not proposed — §10 has the open
question about why.

---

## 5. Job 2 — shelf evidence for the purchase test (by-product)

`NORMALIZATION.md`'s engine turns on one question: *does this adjective oblige a
separate purchase?* Today that is the reviewer plus three tables the doc admits
no rule derives — `PURCHASED_FORM`, `ORIGIN_PRODUCT`, `SYNONYM`.

A retail shelf is a direct record of what is sold as a separate purchase. Not an
analogy — it is what a shelf is. `dried04/Dried-Vegetables` and
`dried06/Dried-Seafood` existing as shelves is the `preservation` class,
confirmed by someone who staked inventory on it.

### The evidence ladder

| rung | evidence | strength |
|---|---|---|
| **shelf** | the modified form has its own category | **strong** |
| **stocked apart** | both forms are distinct SKUs on different shelves | medium |
| **title token** | the modifier merely appears in some SKU title | **weak** |

Only **shelf** may contradict the reviewer unchallenged. **Title token** is noise
alone and enters only as a tiebreak — a SKU title is marketing copy, and
adjectives are free there in a way shelf space is not.

### Scored, never transcribed

`npm run weee-agreement` scores the engine's class calls against shelf evidence
and writes `data/qc/weee-agreement.csv`, conflicts first. Same discipline as
`agreement.ts`, for a stronger reason: `data/decisions/aliases.csv` can only
confirm the reviewer's judgment back to them, while the catalogue is an
independent party. **Where the two scorers disagree is the most informative row
in the repo.**

**Demoted to a by-product deliberately.** It is real value, but it arrives free
once §2 and §3 exist, and it cannot justify a crawl on its own.

---

## 6. Job 3 — the affiliate landing, which needs almost none of this

`DECISIONS` §513: *"The unlock link is a signup prompt, not a checkout… we earn
on the referral and the 6-month tail, not on the jar."*

So the requirement is **ingredient → a plausible landing URL**, not ingredient →
SKU. The 212-category map plus a search URL satisfies it in full.

| | |
|---|---|
| Needed | one URL per ingredient landing on something recognisable |
| Not needed | SKU selection, price, stock, basket construction, per-item attribution |
| Fallback order | mapped shelf → site search on the display name → home, with the tag |

`Disallow: */search` is a **crawl** rule and says nothing about sending a human
there. We may link users to search results; we may not crawl them.

**The job that pays needs the least data.** Worth stating plainly, because the
opposite assumption is what would justify the 200 GB crawl, and it is false.

---

## 7. What the import may never write

Each line is a decision made in another spec, recorded here because an import is
precisely the event that re-opens them.

| Forbidden | Already decided |
|---|---|
| A new node, or an `ing_` id | `INGREDIENT-SPEC` §1 — ids are permanent and must not derive from anything that changes. SKUs are discontinued, repackaged, seasonal |
| A brand, as an ingredient or an alias | `INGREDIENT-SPEC` §2 — `brand` lives on `user_ingredient`. "Kikkoman" is a fact about what someone buys, not about soy sauce |
| Pack size, anywhere a query reads it | `INGREDIENT-SPEC` §2 — `portion` is recorded and **never matched on**. `275 g` is that field arriving 250,000 times |
| Price, image, stock, a `sold_at_weee` flag | `INGREDIENT-SPEC` §4 — there are no global attributes. `sourcing` was cut for being a global prior on a local fact; availability is that mistake plus weekly churn |
| A per-SKU mapping on a recipe or pantry row | `DECISIONS` §513 — *"do not build per-item cart attribution — it isn't what pays"* |
| Direct edits to `nodes.csv`, `aliases.csv`, `identity.csv` | Those are review outputs. The catalogue proposes; `learn` and `promote` still decide |

**Renaming is the only write, and it is only ever a proposal.** §1's safety
argument covers `display_name` and nothing else. A catalogue row must never
cause a merge, a split, a retirement or a redirect — those change identity, and
`INGREDIENT-SPEC` §1 reserves them for review.

---

## 8. Weee! is a counterparty, not a corpus

`CREATOR-SPEC.md` §6 exists because a creator is a real party who can object.
Weee! is the same shape, one degree sharper: they are the **primary revenue
line** (`DECISIONS` §2), and the relationship is worth more than the data.

1. **Ask for the affiliate product feed before crawling for more.** Programmes
   ship feeds; that is a licensed copy of everything here with terms attached and
   no bandwidth argument. `DECISIONS` §1137 already flags the affiliate terms as
   unverified — the feed question belongs in that same conversation, and it is
   one email.
2. **~90 shelf pages is proportionate. Routing around "Load more" is not.**
   The `*/api/` endpoint is disallowed. Honour it, and accept the ~5,400-SKU cap
   — §2 explains why that cap is not even a cost.
3. **Store no pricing, ever.** Not because we cannot fetch it, but because a
   stale price shown to a user is a claim about a partner's business we have no
   right to make and no ability to keep true.
4. **Identify the crawler and rate-limit it.** Existing `src/ingest/http.ts`
   conventions, no special case.
5. **If they ask us to stop, stop.** Same arithmetic as `CREATOR-SPEC` §6: the
   derived naming decisions are ours and stay; the catalogue mirror goes.

---

## 9. Build order

Nothing here needs the app, and nothing blocks Phase A.

| step | command | writes |
|---|---|---|
| 1 | `npm run weee-shelves` | `data/weee/shelves.csv` — the ~90 leaf shelves, from `sitemap-en-category.xml`, reviewed once by hand |
| 2 | `npm run weee-pull` | `data/weee/products.csv` (shelf, id, title), `brands.csv` |
| 3 | `npm run weee-parse` | `data/weee/parsed.csv` — brand- and measurement-stripped, head + modifiers |
| 4 | `npm run weee-name` | `data/weee/naming.csv` — §4a, `agrees` column |
| 5 | `npm run weee-agreement` | `data/qc/weee-agreement.csv` — §5, conflicts first |
| 6 | `npm run propose` *(existing)* | catalogue-backed rows join the normal QC queue |

**Step 1 is a reviewed file, not a classifier.** Which shelves hold ingredients
is a judgment made once over 212 rows, and it is cheaper and more correct than
anything that would infer it. It is also the file to edit when the answer turns
out wrong.

Reuses `src/ingest/robots.ts`, `sitemap.ts`, `http.ts`, `frequency.ts`'s
`headName`, and `ontology/normalize.ts` unchanged. New code: the brand stripper,
the shelf-family grouper, and two scorers.

**Step 6 is the point.** Catalogue evidence reaches the ontology only as a
proposal in the QC UI the reviewer already runs, carrying its shelf and its
evidence rung. No new review surface, no separate import path, no bulk apply.

---

## 10. Open questions

- **Does the affiliate programme ship a product feed?** Unknown, and it decides
  whether anything beyond the ~5,400 shelf SKUs ever exists (§8.1). Cheapest
  possible answer, and it should precede any further crawling.
- **Is ~60 SKUs per shelf enough to name confidently?** **Answered: no, not for
  mapping the corpus.** Shelf pages alone covered 71% of ingredient lines; the
  sitemap gate in §2 took it to 84%. `sku_support` in `naming.csv` remains the
  test for any individual name — a name backed by one SKU is a product, not a
  vocabulary.
- **When shelf and reviewer disagree, who wins by default?** §5 says a human
  reads it, which does not scale to hundreds. Probable answer: **shelf** beats a
  `weak` reviewer accept and never a `strong` one — the distinction
  `NORMALIZATION.md` already draws — but measure it on the first run before
  making it a rule.
- **Does a rename propagate to aliases automatically?** If `enoki mushroom`
  becomes `enoki`, the old surface must become an alias or the corpus stops
  matching. Mechanically simple; it is listed because forgetting it silently
  breaks matching for the renamed node, which is the worst failure mode here.
- **Do slot children get proposed, or only reported?** §4c reports. The risk of
  proposing is a slot growing children nobody cooks with because a grocer stocks
  them.
- **Does a US-Asian grocer's shelf structure generalise?** The `origin` class is
  *"keep by default"*, and Weee! merchandises by ethnicity — `sitemap-en-ethnic.xml`
  exists. That may make origin evidence circular: their shelves keep origin
  because their shoppers shop by origin, which is not the same claim as gai lan
  not being broccoli.
- **What is the real ceiling on autosuggest coverage?** 84% of lines get a
  suggestion. Some of the remaining 16% can never be closed: `neutral oil`,
  `hot water` and `salt and pepper` are a recipe writer's abstractions, and no
  grocer stocks them. Others are catalogue phrasing we have not cracked —
  `shaoxing wine` is absent because the search hits `shaoxing`-region preserved
  vegetables, a false friend the parser cannot see through.
- **Does the 3-per-ingredient cap pick good names?** It picks the shortest,
  which is usually right and sometimes not: `mirin` currently suggests `jcc
  squid mirin`. That is a QC row, not a bug, but if the cap systematically
  surfaces odd phrasings the ranking needs a better tiebreak than length.
- **What happens to western staples?** A US-Asian grocer does not stock what
  fifteen blogs assume — `all-purpose flour`, `butter`, `heavy cream`. Those
  nodes get no shelf name and keep their corpus name, which is correct but means
  coverage is uneven by cuisine and the `agrees` rate is not comparable across
  the ontology.
