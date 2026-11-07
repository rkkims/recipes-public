# Decisions & Structure

Working record of what's settled. Reversals are noted so they don't get re-litigated.

Companions: `BUILD.md` (order of work), `UX-SPEC.md` (interaction model), `ONTOLOGY-SEED.md` (the v0 graph), `SOCIAL-INGEST.md` (the TikTok/Instagram pipeline).

---

## 1. Product

**Core (2026-11-06):** Jipbap is a "what do I cook with this?" tool: enter 1–2 ingredients from a flyer and get Asian recipes you can filter by creator and by how many more ingredients you'd need. A full pantry and the cart are optional extras, and the main purpose is the owner's own meal planning plus a sandbox for testing work, not revenue.

**The moment it serves:** the 3–10 minutes of deciding what to cook, usually while looking at a flyer. Not pantry upkeep — users don't keep a pantry current, so a pantry cannot be the main feature.

**Moat (revised 2026-11-06): correct filters, and the ingredient data behind them.** The main competitor for the deciding moment is **Pinterest**, not Google. Pinterest is built for browsing (visual inspiration ranked for engagement and ads), and narrowing to an answer ends its session, so it has no incentive to help. Its recipe support is shallow: Rich Pins pull ingredients and time from blogs, plus some diet filters, but most pins are an image and a link. **The filter UI is not the moat — anyone can add a checkbox. Correct results are**, and they depend on ingredient identity for Asian cooking: 고춧가루 = gochugaru ≠ crushed red pepper; guk-ganjang ≠ regular soy sauce; green onion = scallion. Pinterest won't build that graph and Google matches words.

**Filters, in build order:** (1) uses this ingredient — the flyer item, matched by identity, not text; (2) how many more to buy (0, ≤2, ≤5); (3) creator. **Ruled out (2026-11-06): cuisine, time and diet** — each needs human judgement per recipe (pan-Asian blogs, unreliable scraped times, diet edge cases), and that curation time is not available for a side project. Only filters that come from data the pipeline already produces without review.

**Why this also serves the portfolio:** a correct filter is testable as invariants — searching "scallion" finds green-onion recipes; gochugaru never matches crushed red pepper. The moat and the SDET tests are the same work.

**SuperCook is the closest comparable product** (pantry-first, weak on Asian food); Pinterest is the main competitor for the moment itself. We don't try to beat SuperCook's 11M recipes.

**Superseded 2026-11-06 (see git history for the full text):** pantry-first core, the rescue/spoilage graph as moat, SEO rescue-query entry, grocery-affiliate monetization (§2), the inventory and link-out risk sections (§5, §5a), the creator platform (§7), distribution (§8) and the competitive research (§9). Removed rather than parked so they don't pull the project sideways.

## 1a. v1 scope

**Korean only. Functionality-first, not corpus-first.**

Build (revised 2026-11-06): ingredient lookup (1–2 must-use pins), matching with filters (creator, how many more ingredients), Save, plan. Pantry is optional; no affiliate. Korean is the single cuisine loaded into a cuisine-agnostic system (§3).

**Dogfooding is the primary v1 validation.** Founder is the exact target user for Korean, uses it daily, gets an immediate read on the mechanics.

**Rebuild from scratch (2026-11-06).** The current app was vibe-coded and the owner can't explain it, so the backend is rewritten by hand, test-first (Vitest), with a reviewer reading each piece like a PR. Scope of the new core: ingredient lookup (1–2 ingredients) → matching → filters (creator, how many more ingredients) → Save/plan. **Creators: needed** (filter and creator pages). **Pantry: kept, smaller** — a few staples that improve matching, not a maintained inventory. **Cart: a button widget on the recipe**, not a page. The current site stays live until the rebuild does the core flow better. Data files (`recipe-index.json`, `ontology.json`) are reused as inputs and test fixtures. **The UI is kept** and changed as the backend is rebuilt. **The data pipeline (scraping, parsing, ontology build) is not rebuilt now** — later work.

**Gate lifted (2026-11-06).** Jipbap's job is now a personal meal-planning tool (1–2 plans a week) and a sandbox for testing practice, not a curated public shelf; reading 17k recipes one by one would never finish. `load().recipes` and the static bundle now ship **every recipe not dropped** (17,655 of 17,728); a `drop` verdict still hides a recipe and any dish using it as a component. Accepted cost: a recipe with an unresolved line can look cookable when it isn't. Static bundle budget raised 1 MB → 5 MB (`STATIC-SPEC` §5). Side effect fixed the same day: `allCurations()` re-parsed the curation file per call, which made the home page 16 s; now cached by mtime (1.1 s). The paragraph below is the original rule, kept for history.

~~**The hard gate (2026-08-16/17).** Pantry matching is the core value, so **no corpus recipe reaches a user until the curator gives it a clear go** (`verdict: keep`). Implemented in `app/src/lib/data.ts`: `load().recipes` is the gated list every public surface reads; the full corpus is `allRecipes`, read only by surfaces whose job is the ungated set (curation queue/list, creator claim flow, request dedupe). The default is flipped on purpose — a consumer nobody remembered to update shows less, never more. User-added recipes are exempt: they live in the user's own store and were never gated. Queue sourcing follows the same bar: Asian cuisines from curator-validated sources only (`queueable` in `lib/curation.ts`) — authorship is a judgement about real people, so the source list is explicit and curator-owned, never inferred.~~

**What dogfooding proves:** does a flyer ingredient lead to a dish I actually cook; is the matching good enough to change what gets cooked; does a weekly meal plan take under 10 minutes.

**What it does not prove — and must not be mistaken for it:**
- **Founder blind spot.** Knowing Korean cooking means under-building romanization, flavour description, and "where do I buy this" — everything a non-Korean user needs.
- **Friction tolerance.** A bad mapping gets manually corrected because the right answer is known. A real user just leaves. Founder retention is not evidence of anyone else's.

**Personal gate:** still using it in week 6 without forcing it. Answer honestly.

## 3. Architecture

**Rule: cuisine is data, never code.** Adding cuisine #2 must be a data task. Ship-check: grep the source for cuisine names — anything outside seed data or copy strings is a hardcoded wedge.

**Flat ingredient model — no tiers.** Reversed from the earlier three-tier design (universal staples / cuisine staples / perishables).

**One rule: a pantry row means you have it. No row means you don't.** No defaults, no per-tier branching, no "assumed present unless marked out."

**Exactly one attribute replaces the tiers:**

| Attribute | Type | Drives |
|---|---|---|
| ~~`sourcing`~~ | ~~`supermarket` \| `specialty`~~ | **CUT.** See below |

**Dropped: `shelf_life_days` and `ubiquity`.** Both were proposed and cut in the same pass — reasons below, because each cut has a consequence that has to be absorbed somewhere.

**Why `shelf_life_days` had to go: we never learn a purchase date.** Urgency needs `purchased_at + shelf_life`. All we ever observe is `added_at`, and because the pantry is built up lazily — a tap here, a "Made it" there — `added_at` can trail the actual purchase by weeks. Computed urgency would be *confidently* wrong, which is worse than absent. This is the same failure mode that killed quantity tracking: data that decays invisibly and can't be audited by the user.

**Consequence — urgency becomes declared, not inferred.** The `urgency(i)` term leaves the score function (§4). The **"Use first" shelf** is now the entire urgency mechanism: the user says what's dying, because only the user knows. This is a smaller system that is *more* accurate, and it needs no new UI — the shelf already exists.

**`state_variants` survive, as declared state.** "My bananas are overripe" is a tag the user applies, not a state the system computes from a timer. Rescue SEO pages are unaffected — they're static views keyed on a state ("wilting spinach"), and never needed per-user shelf life to begin with.

**Why `sourcing` had to go: nothing read it.** Finding an ingredient is the
user's job; the affiliate is machinery to help, not a reason to model difficulty.
Its two claimed consumers both failed on inspection — the affiliate fires on *the
user is missing this and wants it*, which the grocery list already knows without
an attribute, and the friction term was a **global prior for a local fact**
(gochugaru is a supermarket item to someone near an H-Mart, i.e. to exactly our
target user). §4 becomes `friction(i) = w_base`.

**Consequence: the ingredient now carries NO attributes.** Identity, names and
relations are the whole model. Every attribute proposed for this entity has now
failed one of the two tests — no data source, or no consumer — which is itself
evidence that an ingredient really is just a name with edges.

**Why `ubiquity` had to go: no data source.** Initial values would be pure judgement with no way to validate them, and friction is too load-bearing to hang on a guessed float. (`sourcing` was introduced to carry friction as a binary and has since been cut too — see above.)

**Consequence — first-run pre-check is a hand-picked starter list**, not a `ubiquity` threshold. ~12 items, literally enumerated in `ONTOLOGY-SEED.md`. Preserves the §5 principle (never show a blank field; always show a guess to correct) with no computed attribute behind it.

**`state_variants`** — general decay-state field. Overripe banana → bread. Stale bread → croutons. Day-old rice → fried rice. Wilting greens → soup. Souring milk → pancakes. *Some ingredients are better past their prime for specific dishes* — this is the moat data.

### Ontology sourcing — reuse for enrichment, never as the canonical vocabulary

**Our YAML is the source of truth.** Public ontologies are enrichment passes, not the spine. This was tested, not assumed.

**FoodOn was queried directly (EBI OLS API) and has zero coverage of the moat:** `gochujang`, `doenjang`, `ganjang`, `gochugaru`, `tteok`, `aekjeot`, `doubanjiang`, `shaoxing` — **all 0 hits.** Its 20 "soy sauce" terms split by *food-science processing method* (acid-hydrolyzed, proteolytic fermentation) and EFSA FoodEx2 regulatory codes — an axis orthogonal to the culinary one. It structurally cannot express guk-ganjang vs. 生抽 vs. 老抽 vs. kecap manis.

Worse, FoodOn treats **perilla ↔ shiso** as near-equivalent — a pair already on our *not-substitutions* table. Inheriting its structure would import a known error.

**The gaps are evidence, not an obstacle.** The leading public food ontology has no term for gochujang. That is the clearest confirmation available that this work is unbuilt and that normalization accuracy is a real asset.

#### Slot ingredients — the second reason no public ontology fits

Recipes routinely specify a **role rather than a substance**:

```
12 oz. Protein of your choice, I like to mix chicken and shrimp
handful of baby bok choy, yu choy, napa cabbage or other greens
Any kinds of grated cheese
5 oz. Shimeji mushrooms (Beech mushrooms) or any mushroom
```

Measured across the corpus, slot phrasing appears in **7 of the sources independently** — `protein`, `vegetable`, `mushrooms`, `nuts`, `noodles`, `greens`, `cheese`, `herbs`. It is normal recipe grammar, not sloppiness.

**Public food ontologies structurally cannot supply these.** FoodOn, USDA FDC and Open Food Facts all model foods as *substances* — scientific or regulatory taxonomies of things that exist. "Protein of your choice" is not a substance; it is a culinary instruction meaning *any member of this class*. No taxonomy of foods will ever contain it, however complete, because it isn't a food. This is a different gap from the Asian-coverage one and it would not close even if FoodOn added every Korean ingredient tomorrow.

**So the ontology needs two node kinds:**

| Kind | Example | Behaviour in matching |
|---|---|---|
| **Leaf** | `gochujang`, `chicken.thigh` | Satisfied by having that item |
| **Slot** | `protein`, `greens`, `noodles` | Satisfied by having **any** member |

**Slots make recipes *more* matchable, not less** — a recipe asking for "protein of choice" is satisfiable by whatever the user has, which is exactly the product promise. But it means the matcher's requirement set is no longer purely conjunctive: a slot is a disjunction over its members. Worth building deliberately rather than discovering when "protein" fails to map to anything.

**This is the strongest argument yet for owning the ontology outright** rather than extending someone else's: the two things we most need — Asian granularity and culinary slots — are both things a public food taxonomy is not trying to represent.

| Source | Use it for | Do not use it for |
|---|---|---|
| **Our corpus** | Node list, English aliases, cuisine priors, unlock counts, pairings | Anything about kitchen presence — see the trap below |
| **FoodOn** (CC-BY 4.0) | Produce, meat cuts, dairy hierarchy; crosswalk IDs. Licence permits reuse with attribution | Asian ingredients. Substitutions |
| **Wikidata** | CJK labels + romanization (gochujang: 37 languages; doubanjiang: 豆瓣醬/豆板醤) | English aliases — near-empty. `gochugaru`, `aekjeot` absent entirely |
| **Open Food Facts** (ODbL) | Barcode-level product data for receipt OCR, Phase D | ⚠️ **The vocabulary spine.** ODbL share-alike attaches to derived databases, and SEO pages arguably publish a derived view. Best synonym handling of the three, but not worth the obligation |
| **USDA FDC** (CC0) | Clean-licence seed for produce/meat/dairy names | Asian ingredients; anything nutrition-shaped |
| **Hand-built (validator)** | Substitutions, not-substitutions, state variants, the starter list | — |

Carry optional `foodon:` / `wikidata:` crosswalk IDs on each ingredient. Near-zero cost, useful for later interop; no runtime dependency on either.

#### Measured ontology scope — the 95% target was the wrong instruction

**Corpus of 1,498 recipes, 19,756 ingredient lines, 2,869 distinct heads** (crawled 2026-07-29).

| Nodes | Coverage of ingredient mentions |
|---|---|
| 31 | 50% |
| 80 | **62.8%** ← the original Phase A estimate |
| 250 | 76.8% ← the original Phase B estimate |
| **337** | **80%** |
| 1,002 | 90% |
| 1,891 | 95% ← what this section used to ask for |

**"Define nodes to ~95% coverage" implied ~1,891 hand-curated ingredients.** That is not a Phase A task, and stating it as one was wrong. **62% of distinct heads appear exactly once** (1,777 of 2,869) — the tail is single-mention strings, brand names and parse fragments, not ingredients anyone needs matched.

**Revised target: 80% coverage ≈ 337 nodes.** Beyond that, each additional percentage point costs disproportionately more curation for ingredients that appear in one recipe. Phase A's ~80 nodes buys 63%, which is a legitimate thin slice; Phase B should aim at 337, not 250.

**And the head is almost entirely stopword ingredients.** The top 5 — salt, sugar, garlic, sesame oil, water — are exactly the items §4 assigns near-zero friction and §3 puts on the starter list. **31 nodes covering 50% of mentions is a statement about how little the frequent ingredients discriminate**, not about how easy the problem is. The value is in the middle of the distribution.

#### Coverage of *mentions* is the wrong metric — completeness per recipe is

Mean recipe = 13.1 ingredients, so per-mention coverage flatters badly:

**Corpus 4,874 recipes, 60,312 ingredient lines, 8,378 distinct heads** (final, after the carousel-duplication fix below):

| Nodes | Mentions covered | **Recipes 100% mapped** | Count | Mean unmapped |
|---|---|---|---|---|
| 337 | 72.3% | 6.3% | 305 | 3.4 |
| 500 | 76.5% | 9.9% | 482 | 2.9 |
| 731 | 80.0% | 14.1% | 687 | 2.5 |
| **1,000** | 82.7% | **17.6%** | **859** | 2.1 |
| 1,500 | 85.9% | 25.0% | 1,217 | 1.7 |
| 2,579 | 90.0% | 36.5% | 1,777 | 1.2 |

**Budget: 1,000 nodes → 859 fully-mapped recipes**, which meets the §6 v1 corpus target on its own. Marginal return is flat at roughly 0.5–1.1 recipes per node curated, with no knee in the curve — so this is a straight time-budget choice, not an optimum to find.

**At 337 nodes only 10.6% of recipes are fully understood.** For the rest we hold 2–3 unidentifiable strings, and "can the user make this?" has no honest answer: treat unknowns as owned and we promise meals people can't cook; treat them as missing and nothing is makeable.

**Normalization does not fix this. Measured, not assumed.** Collapsing singular/plural plus 15 hand-curated synonym families (four generic oils, salt variants, scallion/green onion, egg/eggs) removed **132 heads of 2,869 and gained 2 percentage points** — 10.6% → 12.6%. The tail is not redundancy; it is 1,777 genuinely distinct single-mention strings. Aliasing was proposed here as the lever and it is not one.

**Two conclusions follow, and they compose:**

**1. v1 ships ONLY fully-mapped recipes. There are no unmapped ingredients.**

Reversed from an earlier draft here, which proposed showing unknown ingredients to the user as literal strings to resolve. Rejected: it pushes the system's incompleteness onto the user at the exact moment they're deciding what to cook, and it makes "can I make this?" unanswerable by the product itself.

**So a recipe containing any unmapped ingredient is excluded from v1**, not degraded.

**But "unmapped" is a property of the mapper, not the ontology — and that distinction was measured wrong here twice.** An earlier draft concluded the ontology budget *is* the corpus size. That was an artifact of measuring with `headName()`, which is documented in its own source as a crude grouping aid rather than a parser. Treating its output as a count of distinct ingredients inflated the problem enormously.

What the tail actually contains: `shakes of black pepper`, `slab of pork belly with the skin on`, `hand-sized piece of dashima`, `rice for 4 samgak-gimbap`, `for the vegetable broth`, `bowls`. **74% of tail heads contain a top-1000 head as a substring** — they are qualified variants of ingredients already in the ontology, not new ingredients.

**Measured, with a deliberately naive containment mapper** (an unmapped head resolves to the longest known head it contains):

| Nodes | Fully mapped, no mapper | **With naive mapper** | Gain |
|---|---|---|---|
| 500 | 482 | 1,784 | +1,302 |
| **1,000** | 859 | **3,041** | **+2,182** |
| 1,500 | 1,217 | 3,434 | +2,217 |
| 2,000 | 1,512 | 3,787 | +2,275 |

At 1,000 nodes that is **62% of the crawled corpus shippable**, and it is a floor — §6's LLM mapper with ontology context does better than substring matching.

**Consequence: invest in the mapper and the alias table, not in dropping recipes or inflating the node count.** The residual 1,882 unresolved heads are mostly genuinely rare ingredients (`ponzu`, `mitsuba`, `chinese sausage`) plus romanization variants of nodes we already have — `guk kanjang`, `dasima`, `mu` are soup soy sauce, dashima and Korean radish. Those are alias rows, and Maangchi's 136 canonical slugs already supply many of them.

**User-introduced ingredients are deferred, not dropped.** Once the system is community-governed (the correction mechanism in `UX-SPEC` §7), users adding ingredients becomes viable because there's a review path. Without one it is an unbounded write to the moat asset. Not v1.

**2. Grow the corpus, not the ontology.** This makes "1,500 well-mapped recipes beat 100,000 badly-mapped ones" operational:

| Corpus | Nodes | Recipes fully mapped |
|---|---|---|
| 1,498 | 1,000 | 472 |
| **4,874** | **1,000** | **859** |

Measured, not projected: the corpus grew 3.3× and fully-mapped recipes grew 1.8× at **identical curation effort**. Note the *percentage* fell (31.5% → 17.6%) because a broader corpus is more diverse — the absolute count is what the product ships, so don't optimise the percentage. **Crawling is free; curation is the scarce resource.** So corpus breadth is the cheaper lever, and the ~337 figure is a *curation budget*, not a coverage goal.

#### The soy-sauce split, quantified

§3's central claim, now measured against the real corpus:

| Head | Mentions | Rank |
|---|---|---|
| `soy sauce` | 421 | 8 |
| `light soy sauce` | 365 | 11 |
| `dark soy sauce` | 276 | 17 |
| `soup soy sauce` (guk-ganjang) | 38 | 67 |

**1,100 mentions across four distinct products that every competitor collapses into one node** — three of them inside the top 20 ingredients by frequency. This is no longer a thesis; it's the shape of the data.

#### The corpus is the primary source — and it sets the build order

Recipes tell us **which nodes to build at all**, which no ontology can. Frequency-sort the raw ingredient strings from the first 100 recipes and stop at ~95% coverage; that list *is* the Phase A ontology scope.

**Consequence for `BUILD.md`: ingest before defining.** The dependency looks like ontology → corpus, but the node list comes *from* the corpus. Week 1 ingests raw strings first.

**Trap — corpus frequency measures *recipe demand*, never *kitchen presence*.** Buttermilk is frequent in recipes and rare in fridges; gochugaru is the reverse for our user. So frequency sets the **node list only**. It must not be used to pick the starter list (§3) — that is hand-set, because the two quantities genuinely differ. (This trap is also why `sourcing` was cut rather than derived.)

### Normalization accuracy is the moat — not corpus size

**SuperCook has ~11M recipes and it doesn't help them.** Most of it is noise. What matters is *coverage of common ingredients × accuracy of match*. 1,500 well-mapped recipes beat 100,000 badly-mapped ones on every query we care about.

**Granularity: the recipe's own specificity is authoritative.**

If a recipe says chicken *thigh*, the requirement is chicken thigh — not "chicken". The recipe author chose the cut, and overriding that is the same error as collapsing the soy sauces. Reversed from an earlier draft here that said `chicken.thigh ≈ chicken.breast`; that was borrowed from generic pantry-matching advice and is wrong for this product.

**Three distinct mechanisms, and they must not be confused:**

| Mechanism | Source of truth | Scope |
|---|---|---|
| **Leaf node** | The ontology | `chicken.thigh` is its own node |
| **Recipe-level alternate** | The recipe text | "thighs or breasts" → satisfiable by either, **for that recipe only** |
| **Slot** | The recipe text | "protein of your choice" → satisfiable by any member of `protein` |

**Recipe-level alternates are not ontology substitutions.** A recipe saying "thighs or breasts" licenses that swap *in that recipe*, because its author endorsed it. It says nothing about whether thigh substitutes for breast in general, and must not be promoted into the substitution table. Capturing them is free — the alternate is already sitting in the ingredient string — and it raises matchability with zero curation.

Pure aliasing (`scallion` = `green onion` = `spring onion`) is unaffected: those are the same thing named differently, not a coarsening.

**We do not need allergen hierarchy** (`soy_sauce` inheriting `soy` + `wheat`). That's the use case that forces fine granularity everywhere, and it isn't in the product.

**The core problem: the same string means different things in different recipes.**

"Soy sauce" is at least seven products:

| Canonical | Reality |
|---|---|
| `shoyu` | Japanese, brewed, balanced |
| `soy_sauce.light` (生抽) | Chinese, saltier, thinner — for seasoning |
| `soy_sauce.dark` (老抽) | Chinese, thick, sweet — for colour |
| `ganjang.guk` (국간장) | Korean soup soy — much saltier, different flavour entirely |
| `ganjang.jin` | Korean general purpose |
| `tamari` | Wheat-free |
| `kecap_manis` | Indonesian, sweet, syrupy — barely the same category |

A Japanese blog writing "soy sauce" means shoyu. A Chinese blog means light soy. A Korean soup recipe means guk-ganjang. **Mapping all of them to one node is exactly why SuperCook fails on Asian food** — and it's the technical reason behind our positioning objective in §1.

**Three requirements follow:**

1. **Context-aware mapping at ingest.** The LLM mapping step must receive the recipe's cuisine tag and dish type, not just the raw ingredient string. Same string, different canonical ID depending on context.
2. **A generic fallback node.** The user checked "soy sauce" and owns one bottle (probably Kikkoman). `soy_sauce.generic` is endorsed into most recipes and explicitly *not* endorsed into Korean soup recipes. Model both the distinction *and* the acceptable-substitution graph — max precision kills recall, max looseness kills trust. **No fidelity scores anywhere — see §4.** Endorsed or not endorsed, with a reason.
3. **Surface the note; don't hide it.** *"This calls for Korean soup soy sauce (guk-ganjang). Regular soy sauce works but will taste different."* That is editorial value nobody else provides — the substitution note is a feature, not an apology.

**Build a benchmark or the moat is just a claim.** Hand-label ~200 ingredient strings with correct canonical IDs across cuisines, run the mapper, measure accuracy. Without a test set there's no way to know the asset is real or whether a pipeline change made it worse.

### Cuisine expansion protocol

**One cuisine at a time. Expansion is not additive — it can degrade what already ships.**

Fish sauce exists in Thai, Vietnamese, Filipino *and* Korean cooking, but nam pla, nuoc mam, patis and aekjeot are different products. Add Thai and reuse Korean's node and both are now wrong. Same for chili pastes, vinegars, rice varieties, noodles. Every addition requires **revisiting shared ingredients**, not just appending new ones.

**The gating resource is a validator, not engineering time.** Korean is self-validated. Every other cuisine needs a native cook to review the staple set and substitution table before launch. Line that up before the work starts.

**Launch checklist, per cuisine:**

1. Staple set defined (~15 items)
2. Top 50 ingredients with aliases and romanizations
3. Substitution table with honest fidelity scores
4. **False-friend audit** — which existing shared strings now need splitting?
5. ~50 labelled ingredient strings added to the benchmark
6. ~200–300 recipes from English-native sources
7. **Native validator sign-off**
8. **Regression check — every existing cuisine's benchmark still passes**

Item 8 is the one that gets skipped and the one that matters.

**Order: Korean → Japanese → Chinese → …**

Chosen for execution feasibility over differentiation gap, which is the right trade for a solo dev:
- **Ontology compounds** — Korean/Japanese/Chinese share the soy family, rice, sesame oil, scallion, ginger, tofu, noodles. Southeast Asian brings a more distant set (fish sauce, tamarind, galangal, lemongrass, shrimp paste).
- **Corpus is easiest** — Just One Cookbook (~1,200) and The Woks of Life (1,000+) are the strongest English Asian corpora that exist.
- **Audience is largest.**

**Known trade-off:** Japanese and Chinese are the *best-served* in English, so corpus scarcity isn't the differentiator there — **normalization is.** Chinese is in fact where normalization matters most (light vs. dark soy, Shaoxing vs. sherry, doubanjiang vs. douchi, black vs. rice vinegar). The moat still holds; it just shows up as accuracy rather than availability.

**No quantity in recommendations.** Boolean presence only.
- Rationale: a wrong presence flag is visible and self-corrects; a wrong quantity is invisible and compounds.
- Users may log quantity if they want; the recommender ignores it.
- Quantity is asked **at cook time only**, for 1–2 items where it plausibly bites (protein, primary vegetable, small-format/expensive items).

**Cook time is banded, for the same reason** — five buckets (under 15 / 15–30 /
30–60 / 1–2 hr / 2 hr+), never exact minutes (`RECIPE-SPEC.md` §4a). Sources
often state no time, so the curator estimates from the method; and stated times
understate prep anyway. `35` would be a precision we never had, shown to the user
as if the author had said it. **The rule this and quantity and the dropped
`shelf_life_days` all follow: store each field at the precision its consumer
actually reads.** Nothing downstream needs minutes — "something quick tonight"
filters on bands.

**Instrument everything, surface little.** Staple-checklist edits, unmapped ingredient strings, unused-ingredient duration, like counts — all collected from day one, displayed only when useful/flattering.

---

## 4. Matching

```
score(R) = β · |use_first ∩ R|      declared urgency — the "Use first" shelf
         − λ · Σ friction(i)        for i ∈ R \ pantry
```

**Urgency is declared, never computed.** The first term used to be `Σ urgency(i)` over perishables, derived from shelf life. That's gone (§3) — no purchase date means no trustworthy timer. What the user pins to "Use first" *is* the urgency signal.

**Friction is flat** (was binary, from `sourcing`, now cut — see §3):

```
friction(i) = w_base          -- one cost per missing ingredient
```

| Missing item | `sourcing` | Friction |
|---|---|---|
| Cilantro, chicken thigh, onion | `supermarket` | Low — any grocery, this week |
| Doenjang, gochugaru, aekjeot | `specialty` | High, but **one-time** — unlocks permanently |

**Accepted loss:** missing salt and missing chicken thigh now score identically. Tolerable, because the starter list (§3) means staples are in the pantry from first run and rarely appear in the missing set at all. Revisit only if "you're missing salt" shows up in real output.

### Substitution strictness

**Be strict.** The v1 audience has no reference point — an experienced cook who swaps red miso for doenjang knows what they're trading and can compensate; our user concludes *"kimchi jjigae isn't that good"* or that they cooked it wrong. Either way the damage is invisible to them and permanent to us. It also protects the §1 positioning objective, which collapses the moment the food doesn't taste right.

**No fidelity scores. A curated positive list only.**

```
ingredient.substitutes:     [id]              # short, curated, endorsed
ingredient.not_substitutes: [{id, reason}]    # common wrong assumptions
```

Why scores were dropped:
- **False precision.** Is guk-ganjang → generic soy 0.4 or 0.5? Nobody knows. The number implies rigour that doesn't exist.
- **A scale invites a long tail.** Once there's a 0.3 band you fill it, and then it gets used.
- **Unreviewable.** Every cuisine needs a native validator (§3a). 55 scored entries is unreviewable; ~15 endorsements is a conversation.
- **It's not how cooks think.** Nobody says "0.6 substitute." They say "you can use X" or "you need the real thing."

**Two buckets, not three:**

| Bucket | Rule |
|---|---|
| **Can make it** | Has the ingredient, or has something on its `substitutes` list |
| **Missing something** | Shopping prompt |

**Keep the negative knowledge as a note, not a number.** *"Doubanjiang is not a substitute for doenjang — it's chili-based, different category."* That's editorial value nobody else provides, and it's exactly what a user without a reference point needs told to them.

**Never substitute silently.** Always show what's being swapped.

**Consequence, and it's the mechanic working:** if cross-country soy sauces aren't substitutes, guk-ganjang has essentially *no* substitute — so Korean soup recipes are hard-gated on owning it, which makes it a high-value unlock item. Not a problem to route around.

**Must-use pins — the core lookup (2026-11-06): the 1–2 flyer ingredients.** Not a hidden setting: a visible shelf at the top of the pantry that users drop things into.

Hybrid filter/boost, because a pure hard filter empties the screen too easily:
```
1 pinned item   → hard filter:  R ∋ pinned
2+ pinned items → soft boost:   rank by score(R) + β · |pinned ∩ R|
```
- Rationale: you rarely own three urgent things that co-occur in one recipe. Hard-filtering on all of them returns nothing most of the time, which trains users to stop pinning.
- The zero-result path (below) still applies at 1 pinned item — which is where it's most useful anyway.
- **User-set, not auto-suggested.** Auto-suggestion needed computed urgency, which is gone (§3). An optional hint from time-in-pantry is allowed — *"this has been here a while"* — but it must never silently pin anything.
- Works with a pantry of **one item** → delivers value before any inventory exists.
- Persists into the weekly plan as a constraint.

**Zero-result degradation** (hard filters can return nothing):
> "Nothing you can make with the cabbage right now. Add gochugaru and you get 6 options."

**Set optimizer** (weekly plan), volume-free:
```
minimize  new items used in exactly 1 recipe
maximize  new items used in 2+ recipes
```
Same behavior as a waste model (buy cilantro once, spend it across three meals) with no quantity dependency.

---

## 6. Content

### Verified 2026-07-29 — the blog pipeline works, and the corpus is already sufficient

Tested by actually crawling, not assumed.

| Source | Posts in sitemap | Recipe JSON-LD hit rate | Mean ingredients |
|---|---|---|---|
| `koreanbapsang.com` | 275 | **12/14 (86%)** | 13.0 |
| `thewoksoflife.com` | 1,561 | **10/14 (71%)** | 11.9 |
| `maangchi.com` | — | **Blocked** — see below | — |
| `justonecookbook.com` | — | **Blocked** — see below | — |

**The two blocked sources need a paid residential proxy. Investigated and closed on 2026-07-29 — don't redo this.**

| Finding | Evidence |
|---|---|
| Not client fingerprinting | `curl` and `undici` behave **identically**: 200 on `/`, 403 on `/sitemap_index.xml` and every recipe path. It's path-based WAF, not TLS/UA detection |
| Maangchi's homepage 200 is misleading | `/` is edge-cached; everything behind it is protected. An early 200 on `/` reads as "the site is reachable" and isn't |
| Just One Cookbook is a WAF rule, not a challenge | Serves Cloudflare *"Attention Required!"*, not *"Just a moment…"*. There is no JS challenge to solve — the request is refused |
| Apify Proxy doesn't fix it on the free plan | An Actor was built, deployed and run. `createProxyConfiguration({groups:["RESIDENTIAL"]})` *succeeds* (validation is lazy), but the FREE plan grants only `BUYPROXIES94952` — datacenter. Both sources still 403'd through it |
| Apify Proxy is Actor-only on this account | *"Access from external HTTP clients (outside of Actors) isn't enabled."* Hence the Actor exists at all |

**The Actor is correct and kept** (`src/actor/main.ts`, deployed as `recipe-corpus-crawler`). It reuses the local crawler's sitemap/JSON-LD/normalize modules so the extractor can't fork. It needs only a proxy tier the plan doesn't include.

**Not worth pursuing, for now.** Two working sources already yield ~1,300 recipes against a 1,000–2,000 target. If more Korean coverage is wanted later, **finding an unblocked Korean source is cheaper than defeating Cloudflare** — and a browser-based fetch is the fallback after that, not before.

**The misses are correct, not failures.** Every non-hit was a genuinely non-recipe page — roundups (`/16-easy-korean-recipes/`), technique posts (`/how-to-cook-chinese-meal-one-wok/`), `/blog/`. Effective hit rate on actual recipe pages is ~100%.

**Two domains alone yield ~1,300 recipes with clean ingredient lists.** §6 targets 1,000–2,000 total. **The corpus problem is solved by sitemap crawling — social ingest is not needed to reach v1 scale.** That reframes `SOCIAL-INGEST.md` from a corpus necessity to a coverage extra.

**Entry point is `/sitemap_index.xml` → `post-sitemap*.xml`.** Do not crawl homepages — link extraction from nav markup is unreliable and both sites' listing pages are JS-heavy.

**Practical findings that will bite otherwise:**

1. **Sitemap order is not random.** The first URLs skew heavily to non-recipe pages. Sampling the head of the list produced a false 0/5 during testing. Sample spread, or filter, but never take the head.
2. **Require ≥3 ingredients.** `/how-to-break-down-a-chicken/` publishes a valid Recipe card with **one** ingredient. Technique posts carry recipe markup.
3. **`recipeCuisine` is inconsistent *and* low quality — the source domain always wins.** It's absent on `koreanbapsang`; on `thewoksoflife` it's free text, and a first crawl produced `Asian`, `Southeast Asian inspired` and `American` on Chinese recipes. §3's context-aware mapping needs a small closed set, so letting JSON-LD override polluted the field with values the mapper can't consume. **Cuisine is derived from the domain and normalized; `recipeCuisine` is retained verbatim as `cuisineRaw`, informational only.** (An earlier version of this section had the precedence the other way round; the crawl corrected it.)
4. **`aggregateRating` is present on both** (e.g. 4.81 with a rating count). That's a free corpus-ranking signal before any "Made it" data exists — it solves cold-start ordering, which §7 otherwise had no answer for.
5. **`recipeInstructions` is fully present in the payload.** It is the copyrightable half. **Parse past it; never store it.** The temptation is structural — the field is right there — so the drop has to be explicit in the ingest code, not implied.
6. **`robots.txt` is clean.** `koreanbapsang` publishes no `User-agent: *` rules; `thewoksoflife` disallows only admin and query paths. The `Disallow: /` entries on `maangchi` and `justonecookbook` belong to **AI-crawler user-agent groups, not `*`** — a distinction worth reading carefully before concluding a site is off-limits.

---

- **Link out only.** Never host recipe text.
- **Pipeline:** parse `schema.org/Recipe` JSON-LD (deterministic, no model call) → map raw strings to canonical ingredient IDs with `claude-opus-5` + structured outputs → review queue for anything `confidence < 0.9` or missing quantity. Cache the ontology system prompt.
- **Legal posture:** ingredient lists are facts, not copyrightable. Instructions-as-written, headnotes, and photos are.
- **Thumbnails:** derive from `og:image` metadata (published for exactly this purpose), thumbnail size only, visible attribution, never crop a watermark, same-day takedown on request. Email top sources for explicit permission. **We cache a resized derivative and never the original** — the size limit is what the whole posture rests on, and it comes with a revalidation duty to replace the fail-safe that hotlinking gave for free (`RECIPE-SPEC.md` §1a).
- **Respect `robots.txt`.** Hand-curate at low volume — robots.txt governs crawlers, not a person in a browser.
- **Scope:** ~1,000–2,000 general English recipes covering the top ~100 perishables.

**English-written sources only. No translation from other languages.**

The decisive reason is structural, not editorial: **translation forces us to host.** You cannot link out to a translation you made — the moment we translate, we're publishing derivative content, which breaks the link-out architecture that is our entire legal and economic posture.

The quality reasons hold independently:
- **Ingredient availability** — a Korean-language recipe assumes Korean grocery shelves; an English-written one has already resolved what's findable in a US store or H Mart
- **Measurements** — 종이컵, 밥숟갈, 合. Translation converts the words, not the cultural encoding
- **Technique assumptions** — source-language recipes assume you know how; English-written ones explain
- **Editorial filter** — writing in English for an English audience *is* the usability signal

**Accepted cost:** a corpus ceiling (~1,500 recipes for Korean). Fine — see §3, corpus size is not the moat.

### English-language Korean source inventory — probed 2026-07-29

There is no registry of "Korean recipe sites in English," so the answer that matters is *how many are usable*: **16 candidates probed, 12 usable, ~2,958 recipes with JSON-LD ingredient lists.** Use `npm run probe -- <domain>` to test any new candidate — it reports sitemap size, JSON-LD hit rate and robots rules in about 8 requests.

**Korean-only sources now enabled: ~1,469 estimated recipes** — Korean Bapsang 165, Future Dish 314, Kimchimari 309, My Korean Kitchen 230, Beyond Kimchee 223, The Subversive Table 178, The Korean Vegan 50. **This confirms the ~1,500 ceiling this section predicted, and it is reachable without Maangchi.**

Rejected, with reasons recorded in `sources.ts`: `maangchi` and `justonecookbook` (Cloudflare WAF), `aeriskitchen` (681 posts, **0/5 JSON-LD** — no recipe-card markup), `ahnestkitchen` (0/5, plus 27 robots rules), `crazykoreancooking` (no usable sitemap).

**Two findings from the probe that change how ingest works:**

**1. Never trust a `*post*-sitemap.xml` filename match.** A naive `/post/i` filter also matches `post_tag-sitemap.xml`. On `seonkyounglongest.com` that counted **6,305 tag-archive pages as recipes** — and archives are the worst possible false positive, because WordPress recipe plugins emit Recipe JSON-LD on them too. They pass the JSON-LD check *and* the ≥3-ingredient check, then duplicate real recipes and skew the ingredient frequency distribution that sets the ontology's scope. Nothing downstream would have flagged it. Taxonomy sitemaps are now excluded before the "post" preference is applied; the corrected count is 611.

**2. Domain-derived cuisine breaks on pan-Asian blogs, and that gates the best source.** The rule above assumes one cuisine per domain, which holds for Korean Bapsang and fails for Seonkyoung Longest, Two Plaid Aprons, Drive Me Hungry, CJ Eats and Carving A Journey — together **~1,489 more recipes, including the single highest-yield source found (611 posts at 5/5)**.

They are registered with `multiCuisine: true` and **disabled**, because a wrong cuisine tag is worse than none: §3's context-aware mapping would send "soy sauce" to the wrong canonical ID, which is the precise failure the ontology exists to prevent. Unblocking them needs per-recipe cuisine inference (title/URL/category keywords, or an LLM pass) — a well-defined piece of work worth roughly 1,500 recipes.

---

## 10. Reversed / dropped — do not re-litigate

| Dropped | Why |
|---|---|
| **Pantry-first core** (2026-11-06) | Users don't keep a pantry current. The core is now 1–2 ingredient lookup; pantry is optional (§1) |
| **Grocery affiliate / cart monetization** (2026-11-06) | Not realistic at this scale, and it pulled the build toward cart and pantry features. Jipbap is not a revenue project (§1) |
| **Creator platform, request queue, SEO distribution** (2026-11-06) | Serve growth and revenue, which are no longer goals. Removed with §7–§8 |
| **Recipe-by-recipe curation gate** (2026-11-06) | Every recipe not dropped ships (§1a) |
| Subscription / freemium | All-free maximizes reach; affiliate is downstream of the intelligence, so paywalling the optimizer would *reduce* revenue |
| Paywalling automation | Would paywall the fix for the core retention problem → free tier degrades → churn before conversion |
| User-facing waste report ("$47 wasted") | Backward-looking, negative, needs quantity. Replaced by the forward-looking expiry nudge. **Prevent, don't report.** |
| Quantity in recommendations | Highest-decay data; fails invisibly |
| Display ads | Kills the trust position; worse per-user revenue than affiliate anyway |
| Smart-fridge play | Samsung/Whisk and Whirlpool/Yummly both happened; Yummly was shut down with 20M users |
| Recipe DB / API licensing | Commoditized (Spoonacular, Edamam) and being eaten by LLMs |
| Selling receipt images to AI labs | Wrong buyer, PII/CPRA exposure; the real market is consumer purchase panels |
| Creator revenue-share infrastructure | Weeks of pre-revenue build; $5–12/mo per creator reads as insulting. Replaced by "seed your own tag, keep 100%" |
| Widget embedded on blogger pages | Bloggers won't send traffic off-page — their revenue is impressions. Widget only makes sense where there's no page to protect |
| Social import as a differentiator | Commoditized — a dozen apps ship it, LLMs made it trivial |
| "Virality replaces SEO" | Rented vs. owned attention. Creators are a second pillar, not a substitute |
| Translating non-English recipes | Forces us to host derivative content, which breaks link-out. Also loses ingredient-availability and measurement adaptation. Closes the earlier "Korean-language sources don't cannibalise US traffic" idea |
| Chasing corpus size | Not the moat. SuperCook's 11M recipes don't help them — normalization accuracy does |
| **Promising creators traffic** | Unguaranteeable, and identical to every other platform's pitch. Replaced by proof of existing demand — a fact, not a forecast (§8) |
| **Instant automatic extraction on URL submission** | Breaks visibly at current accuracy, on the user's first interaction. Replaced by an honest queue: "we'll prepare this for pantry matching" (§8) |
| **Browser extension as the answer to link-out leakage** | Mobile is where cooking happens and extensions don't install there. Kept as a Phase D standalone acquisition product, not a retention fix (§5a) |
| **Paid promotion into ranked results** | Rank manipulation. Match integrity is the one asset SuperCook lacks; selling it is selling the moat (§2) |
| **Upvoting on the request queue** | Popularity contest, vote-stuffable. "I want to cook this" is a stronger signal and maps onto the affiliate funnel (§8) |
| **Marketing as "AI recipe recommendations"** | Crowded category, weakest ground, and false to the actual product — we route to curated recipes, we don't generate them (§9) |
| **Asking creators to annotate the ontology** | Aliases, taxonomy, substitutions — they won't, and their guess isn't better than the mapper. Ask for the ingredient list only (§7) |

### Revived

**The Korean/Asian cuisine focus stays** (reason revised 2026-11-06: it is what the owner cooks and where SuperCook is weak, not affiliate revenue). Architecture is still cuisine-agnostic: cuisine is data, never code (§3).

~~**Social recipe import is also revived — as table stakes, not as a differentiator.** Commoditized and necessary are not in conflict: a dozen apps ship it, so it wins nothing, but its absence is a visible gap. Build it cheaply (scrape ingredients from the caption/description), spend no differentiation budget on it.~~

**Dropped 2026-11-06:** no TikTok/Instagram caption crawling and no video parsing (transcripts, OCR, vision). The platforms own the content and their ToS ban automated collection; accuracy can't be guaranteed; web recipes already cover the corpus (§6: two domains ≈ 1,300 recipes) and the Asian-recipe gap; it would eat the project and proves nothing the project is for. Kept: YouTube → creator's blog → JSON-LD (link-following via the Data API) and paste-time oEmbed metadata. Removed rather than parked so it doesn't come back as a temptation.

---

## 11. Open items

- **Whether crosswalk IDs are worth populating before Phase B** — near-zero cost, but also near-zero Phase A benefit
- **Starter-list membership** — the ~12 pre-checked items are hand-picked judgement (§3). Instrument first-run uncheck rates from day one and correct the list from real data
- **Open Food Facts ODbL share-alike** — read the licence properly before using OFF's synonym taxonomy. It has the best alias handling of the three sources and the worst licence for us
- **YouTube Data API key + current quota** — the free tier is generous enough that this is likely a non-issue, but confirm before sizing a crawl

- **No database, decided 2026-08-13 — and when the day comes, SQLite for one
  file, not Postgres for the repo.** "The data storage" is three things: corpus
  and ontology are build artifacts (immutable per build, cached in-process — a
  DB adds a hop to nothing); decisions and curation CSVs are review artifacts
  whose design DEPENDS on being files (diffable in git, regenerable-around,
  copyable to the offline laptop — a DB breaks all three on purpose-built
  properties); `data/app/owners.json` is the only live mutable state and the
  only candidate, ever. It is not due: one Next process serializes writes,
  temp-and-rename keeps them atomic, users are single digits. Revisit when the
  symptoms exist — write contention, serialization taking real milliseconds, a
  second app instance, multi-device accounts — none of which arrives before
  distribution does. Then it is SQLite on the same VM (transactions, zero ops
  surface, `store.ts`'s read-mutate-write maps directly); Postgres buys
  multi-instance concurrency this deployment does not have and costs a server
  operated alone against §6's constraint. If Postgres is ever right, the
  business changed shape enough that this whole entry deserves re-making.
- **`myeolchi aekjeot` and `anchovy fish sauce` are both nodes, and they are the
  same ingredient** (멸치액젓). Found 2026-08-13 while clearing dangling edges.
  Responsibilities are split: the reviewer's alias family (korean/fermented
  anchovy sauce, myulchiaekjeot, now anchovy sauce too) targets `myeolchi
  aekjeot`; the hierarchy edges (is_a `fish sauce`, derives_from `anchovies`)
  hang off `anchovy fish sauce`. So the alias family never inherits the fish
  sauce relation, and whichever node a pantry holds, recipes naming the other
  spelling still match only by luck. Collapsing them is a **merge** — identity,
  reserved for review (`INGREDIENT-SPEC` §1) — which is why the tooling refused
  to do it in passing. Same family as the 4 display-name collisions
  `build-ontology` reports into `data/qc/name-collisions.csv`.
- **Region probe — done 2026-08-13, and it needed no app code.** `/_stats` now
  carries a Geo Location panel. **Decided against an in-app probe:** GoAccess is
  built `--enable-geoip=mmdb` and reads the nginx logs the privacy policy already
  discloses, so region costs no app code, no cookie, no consent banner and no new
  PII. `--anonymize-ip` stays on and **does not block it** — verified, because a
  /24 still geolocates.
  **DB-IP City Lite, not MaxMind GeoLite2.** MaxMind is free of charge but wants
  an account, a licence key and a signed EULA, and the keys expire every 90 days —
  a cron job that breaks silently one quarter later. DB-IP needs no account, is
  CC BY 4.0, monthly, and drops into the same `.mmdb` slot. **The attribution in
  the report title is a licence condition, not decoration** — CC BY 4.0 requires
  credit wherever results are shown. The refresh is manual and monthly:
  `download.db-ip.com/free/dbip-city-lite-YYYY-MM.mmdb.gz` → `/var/lib/geoip/`.
  Nothing breaks if it goes stale or missing; the flag is simply omitted.
- **Datacenter origins are blocked at nginx (2026-08-14).** The probe's
  finding became a door: `conf.d/datacenter-block.conf` reads the same DB-IP
  ASN database per request (ngx_http_geoip2_module) and 403s hosting networks
  before the app spends a render — the day it shipped it caught Tencent
  wearing a fake iPhone UA while the reviewer's own Videotron connection
  passed. Three deliberate exceptions: search and link-preview bots by
  user-agent (blocking Googlebot undoes the shipped SEO carve-outs; blocking
  Discord/Reddit previews breaks share cards, and share-into-a-thread is the
  distribution plan — a UA is spoofable, so this is a noise gate, not a
  security boundary); private/loopback addresses; and this instance's own
  egress IP, per the reviewer. To make the block total, empty the
  `$dc_allowed_ua` map. **Operational consequence that outranks the feature:
  nginx now fails to start if `/var/lib/geoip/dbip-asn-lite.mmdb` is missing**
  — the monthly DB-IP refresh stopped being optional hygiene the moment the
  web server grew a dependency on the file. Never delete it without touching
  the nginx config first.
- **Metro granularity — `/usr/local/bin/jipbap-regions` (2026-08-13).** GoAccess's
  Geo Location panel is Continent > Country and has no city level even with a City
  database, but the question is an LA / SF Bay / NYC-NJ / Seattle one, because that
  is the granularity Asian grocery density varies at. So a second pass reads the
  same logs against the same databases and aggregates one level finer. Aggregate
  only: an address is resolved in memory and counted, never printed or written, so
  it stays inside `PRIVACY-SPEC` and the 14-day retention. Runs from
  `/opt/jipbap-geo/venv` (just `maxminddb`), off cron, on demand.
  **The finding that justifies the tool: user-agent and volume filtering are not
  enough, and fail in the flattering direction.** On the first run they dropped 31
  of 336 addresses and left Santa Clara, Ashburn, Frankfurt and Singapore heading
  the "likely human" table — all cloud regions, arriving with innocuous
  user-agents. Adding an ASN check (DB-IP ASN Lite, also free and CC BY) dropped
  **245 of 336**, Tencent alone accounting for 168. *A visitor from Amazon's
  network is not a visitor, and the network is the only field that says so.*
  All three filter counts print, and `--asn` lists the networks with the dropped
  ones flagged, so the call is inspectable rather than trusted. Known gap: the
  hosting pattern still misses some real hosters (IP Volume, Amarutu, CariNet) —
  a one-line tune when it matters. **Baseline reading 2026-08-13: 11 US visitors
  across 7 metros, ones and twos.** No signal, as expected pre-domain — the value
  is that this is now visible rather than inferred.
  **Two things it cannot yet tell us:** no domain is live — the code now names
  `jipbap.com` (`layout.tsx` `SITE`) while the nginx vhost still says `.app` in a
  comment and serves `server_name _`, so every request arrives at a bare IP and
  is scanner noise (`--ignore-crawlers` only partly helps); and
  once placements start, region measures *where our distribution reached*, not
  where demand is. The point of wiring it now is that it is running before the
  first placement fires, not that this week's numbers mean anything.
*Resolved: FoodOn is CC-BY 4.0 — reuse permitted with attribution.*
- Corpus sourcing plan for the general (non-Korean) index
