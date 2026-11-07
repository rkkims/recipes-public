# Build Plan

Companion to `DECISIONS.md` — that file holds the *why*, this one holds the *order*.

**Stack:** Next.js + TypeScript, Postgres (Supabase), Vercel. Web PWA — no app-store review, ships in hours, camera available when receipt OCR arrives.

---

## Sequencing principle

**Get to "I can use this for tonight's dinner" as fast as possible, then deepen.**

The tempting order is ontology → pipeline → corpus → app, because that's the dependency order. Don't. Eight weeks of graph-building before the first real cook means eight weeks of decisions made without feedback — and dogfooding is the primary v1 validation (§1a).

Instead: a thin vertical slice that works end-to-end on a small ontology and a hand-mapped corpus. Once you're actually cooking from it, every later decision is informed by use rather than guesswork.

| Phase | Weeks | Goal | What it validates |
|---|---|---|---|
| **A** | 1–4 | You cook from it | The mechanics (DECISIONS §1a) |
| **B** | 5–9 | It's accurate and self-maintaining | Match quality at corpus scale |
| **C** | 10–14 | Strangers can find it | Demand aggregation |
| **D** | post-launch | Expand | The creator ecosystem, then commerce |

**The right label for A–B is "mechanics validation," not "content"** (DECISIONS
§1a). The recipes are test material. Progress is activation, match quality and
retention — never recipe count, sources crawled, or node count. Phases C and D
then run in the only order that works: **collect demand, then use it to pull
supply.** Recruiting creators before demand data exists is the standard
marketplace failure (DECISIONS §8).

---

## Where this actually stands (2026-08-05)

**This plan and the repository have come apart, and the gap is the plan's own
risk #1 materialising.** Recorded here rather than quietly rewritten, because
the divergence is the useful information.

*Updated 2026-08-06. The App row below was wrong for weeks and was believed —
it is worth re-checking against the code rather than the table.*

*Second update, 2026-08-06: a UX pass over the built app. It found four things
that did not work at all rather than four things that were missing, which is
the more useful kind of finding and the kind a feature table cannot show. See
"The UX pass" below.*

| | plan | actual |
|---|---|---|
| Corpus | Phase B → ~400 recipes | **4,874**, 15 sources |
| Ontology | Phase B → ~1,000 nodes | **2,869 confirmed**, plus opaque ids, redirects and a retirement pass |
| Benchmark | Phase B, "the single most important ordering" | exists in a stronger form — 1,455 reviewed decisions scored continuously by `npm run agreement` at 87.6% |
| Matching | Phase A | built and tested; relations wired, so `is_a` and `derives_from` match with §3a's disclosure (`npm run test-relations`) |
| App | Phase A: pantry, list, match, save, Made it | pantry drawer on all three pages, grocery list, Save, Made it, gallery, recipe search, first run, diet/allergens, affiliate. **No accounts, no database** — state is a file-backed JSON store keyed by an owner cookie |
| Curated recipes | — | **35 of 4,874** |
| QC | — | offline tool (`npm run offline-qc`) for recipe, ontology and alias curation; `npm run qc-import` folds a session back with a staleness gate |

So the pipeline is past Phase B, and the app now has Phase A's *features* — what
it lacks is accounts and a real database, which dogfooding does not need.

**"Has the features" was doing a lot of work in that sentence.** A feature table
counts nouns, and every row above could be true while the flows joining them
were broken — which is what the UX pass found. Read that section before trusting
this one.

**The gate is still the gap.** "You cook from it 3+ times in week 4" has never
been run, and it is the only thing v1 actually hangs on. Every row above is
input to that question rather than an answer to it.

**Phase A's gate has not been run.** "You cook from it 3+ times in week 4" is
the check that everything downstream waits behind, and it is the one thing here
with no evidence either way. Risk #1 in the critical-path section names this
exactly: *"building ontology depth without ever cooking from it — the most
enjoyable work and the easiest to over-invest in."*

**Not everything ahead of schedule was wrong.** Ingredient identity, the
retirement pass and the Weee-derived vocabulary are all expensive to retrofit
and cheap to have early. The claim being made is narrower: **more corpus and
more nodes are no longer what v1 is waiting on.** It is waiting on persistence,
accounts and the closing half of the cook loop.

### The UX pass (2026-08-06)

A review of the interaction layer rather than the feature list. The headline is
that **the feature table was right and the product still did not work**, because
four flows were broken end to end and nothing in a checklist of nouns could say
so:

| | |
|---|---|
| **"Made it" on your own recipes** | `madeIt` resolved through `load().recipes` — the corpus cache, which by design never holds own recipes. So the one action that closes the cook loop threw *"no longer in the index"* on every recipe the user added, and reloading could not help. Fixed in `lib/recipes.ts`, which is now the single place that knows a user's recipes are corpus **+** own |
| **Writes from two of three pages** | Actions revalidated `"/"` and whichever route the author had in mind. The pantry drawer also sits on `/calendar`, so editing your pantry there left the day still reading "3 away" — indistinguishable from a failed write. One `revalidateOwner()` now |
| **Tab counts** | `limit: 30` was applied before the count, so "Cook tonight 30" was what you saw whether you could cook thirty recipes or three hundred — the one number measuring whether the pantry pays off flatlined exactly when it started working |
| **Own recipes when planning** | The calendar's picker searched the corpus only, so you could plan any of 4,874 strangers' dinners but not your own |

Four things that were genuinely absent, each traceable to a spec line already
written:

- **First run** (DECISIONS §3, ONTOLOGY-SEED Tier 1) — the starter list was
  specified, argued for, and never built. "Cook tonight" needs *every*
  ingredient of a recipe, so nothing appears until ~15 items are in; a new user
  added five, saw three empty tabs, and concluded it was broken. Twelve
  pre-checked staples, plus the diet question, both skippable.
- **Actionable ingredient names** (UX-SPEC §1) — modal chips were inert text.
  Recording something the screen was already showing you took five actions, and
  the only actionable thing on a missing ingredient was the affiliate link. So
  the product made it easier to *buy* an ingredient than to put it on your own
  list.
- **A subtractive pantry signal** — see the Phase A staleness row below.
- **Recipe search** (`searchRecipes` existed, wired only into the calendar's
  plan picker) — 4,874 recipes and no way to ask for one by name.

Two mode indicators, both for states that changed what the whole page meant with
nothing on screen saying so: a single Use-today pin is a **hard filter** in
`rank`, and dietary exclusions applied on one page out of three.

`CookEvent.substituted` deserves its own line: the field existed, `amendCook`
wrote it, `Summary` rendered it in two places, and **nothing in the app had ever
set it**. Every history line linked to "all cooks & substitutions" and the
substitutions could not be anything but empty. UX-SPEC §8 calls that record
*"the single strongest reason to open our modal rather than search the blog
again."* It has a writer now.

**What this does not change:** the gate. "You cook from it 3+ times in week 4"
is still unrun, and this pass is input to that question rather than an answer.
What it removes is the excuse — the loop it measures now completes.

### The persona walk-through (2026-08-06)

The UX pass above reviewed the product as a whole. This one walked six people
through it — a dogfooder at 6pm, someone back after three weeks, a Sunday
planner, an allergic user, a stranger from a shared link, and someone who cooks
from TikTok. Three patterns came out of it, and two are the same root cause:

**1. The system could only accumulate.** Every signal was positive — save, cook,
plan, pin, add. There was no *no*, no *not now*, no *not any more*. That single
absence produced symptoms in four of the six walk-throughs: the pantry
ratcheted, the ranking never learned a rejection, pins never lapsed, plans
rotted, list items never aged. Answered as one theme — *not tonight* on a card,
pins with a shelf life, pantry age from `added_at`, and a welcome-back review
for the person the post-cook question can never reach because they have not
cooked.

**2. Built, and never surfaced.** `substituted` was found in the first pass;
this one found four more. `yield` on 4,174 recipes and the source `rating` on
3,932 — both in `recipe-index.json` since the day it was built, read by nothing,
not even typed. `added_at` on every pantry row. `forMeals`, computed and
discarded one tap before it was useful. There is a cheap standing check here:
**which fields exist in the data and render on no screen?**

**3. Disclosure stopped where it was first written.** The diet caveat was on the
grid and not in the modal — the screen where the decision is made — and not on
`/my-recipes` at all. `page.tsx` carried the comment *"the modal says so
instead"*; `RecipeDetail` mentioned diet nowhere. Honesty had been implemented
once, at the point it was thought of, rather than everywhere the claim is read.

Also fixed: a `"rating": null` on 942 recipes made `rating !== undefined` true,
which inflated the new Popular shelf to 4,872 and left `rating.toFixed(1)` one
tab away from throwing. Normalised at load, so the optional field on `Recipe`
now describes what callers actually get — *a type that says `rating?: number`
and delivers null is the lie that caused it*.

Two things this pass deliberately did **not** do. Quantities stay cut
(DECISIONS §3); the shopping consequence is answered instead by asking *"three
dinners want this — did you buy enough?"* when an item is ticked off, which
produces the `in_pantry && on_list` state INGREDIENT-SPEC §2 made the flags
independent for and nothing had ever written. And the paste-a-list reader in
`lib/paste.ts` is **not** the pipeline's parser — the app cannot import across
its package boundary, so it is a modest reader whose every guess is reviewed
before it is saved. If it earns its keep, the honest next step is a shared build
step, not a bigger copy.

### Built since this plan was written, and absent from it

| | |
|---|---|
| `WEEE-SPEC.md` | the catalogue as a naming authority — 6,408 names, 84% autosuggest coverage of corpus ingredient lines |
| Offline review bundle | `npm run weee-pack` — vocabulary QC and recipe mapping with no network |
| `main_ingredients` | RECIPE-SPEC §4c, with the friction term and a proposer |
| `CREATOR-SPEC.md` | the fourth entity, written before it is built |
| RECIPE-SPEC §1a | thumbnails as cached derivatives, reversing hotlink-or-nothing |
| PWA, paste-time oEmbed | UX-SPEC and SOCIAL-INGEST §2a |

---

## Phase A — Usable slice (weeks 1–4)

Goal: **you cook from it.** Ugly is fine, incomplete is fine.

| Piece | Scope |
|---|---|
| Corpus **first** | Sitemap-crawl `koreanbapsang.com` + `thewoksoflife.com` → JSON-LD → **raw ingredient strings**, before defining any node. **Verified: ~1,300 recipes available, 71–86% hit rate** (DECISIONS §6). Collection is automatic — no hand-curating URLs |
| Ontology v0 | Frequency-sort those raw strings, define the top ~150 nodes. Thin slice by design — enough to cook from, not to match broadly (DECISIONS §3) |
| Pantry | Flat model, boolean presence, add/remove, **"Use first" shelf** |
| Grocery list | Persistent list, move items to/from pantry |
| Matching | Score function + must-use pin (hard filter at 1, boost at 2+) |
| Actions | Save, Made it (**additive**) |
| ~~Staleness nudge~~ | **Deferred to v2** (DECISIONS §5). It was promoted here for being the only *automatic* corrective, so deferring it means the v1 pantry only shrinks when a user removes something — swipe-to-remove becomes load-bearing, and `storage` (INGREDIENT-SPEC §2) defers with it. **Partly answered without it (2026-08-06):** `recordCook` marks every ingredient present and nothing reversed it, so the pantry ratcheted until "Cook tonight" badged *have everything* on dishes that could not be cooked — a false claim there costs more than an empty tab. The correction is asked immediately after the cook, where the user has just put the packets away and knows the answer: *run out of anything?*, two states, "still have" the default no-op. Not decay, and not a replacement for it — but it is a subtractive signal that costs nothing to ignore, and it does not need a purchase date |

**Deliberately skip:** SEO pages, affiliate links, onboarding polish, the automated pipeline, the review queue, social import, crowd correction.

**Automatic collection does not mean automatic mapping.** The sitemap → JSON-LD crawl is verified and free, so fetching 1,300 recipes costs nothing. Hand-mapping the first 100 *strings → canonical IDs* keeps every bit of its value — that's where the ontology gets learned, and it's unaffected by how the strings arrived.

**Why hand-map the first 100.** Doing it manually is how you discover what the ontology actually needs — which strings are ambiguous, where the soy-sauce problem bites, what the substitution table has to encode. Automating before you understand the shape means automating the wrong thing. The Phase B mapping prompt will be far better for having done 100 by hand. It also produces your benchmark labels for free.

**Gate: you cook from it 3+ times in week 4.**

If you keep opening the app and then cooking something else, stop and diagnose before building further. That's the whole product failing in miniature, and it's much cheaper to learn at week 4 than week 14.

---

## Phase B — Make it real (weeks 5–9)

| Piece | Scope |
|---|---|
| Ontology | → **~1,000 nodes → 859 fully-mapped recipes**, which meets the v1 corpus target alone. Measured on the full 4,874-recipe corpus; the earlier 337 figure came from a corpus 3× smaller (DECISIONS §3) |
| **Benchmark** | 200 hand-labelled ingredient strings across contexts |
| Pipeline | JSON-LD parse → context-aware Opus 5 mapping → review queue below 0.9 confidence |
| Corpus | → ~400 recipes |
| Features | Urgency/decay, expiry nudge, shopping gap, unlock counter |
| **Link-out mitigations** | In-app browser for the cook click + the "come back to update your pantry" line (DECISIONS §5a). Cheap, and the largest single effect on the #2 risk |

**Build the benchmark before you automate the mapper.** This is the single most important ordering in the plan. The benchmark is the only instrument that tells you whether the moat is real — and once the pipeline exists you'll be changing prompts and ontology constantly with no way to know whether a change helped or quietly broke something.

Phase A gives you the labels almost free: you already decided the right answer for ~1,200 strings. Sample 200, weighted toward the hard cases (soy sauce across cuisines, chili pastes, vinegars, noodles), and that's the test set. Pick the accuracy bar *before* you see results.

**Context-aware mapping** (§3): the model receives the recipe's cuisine tag and dish type, not just the raw ingredient string. Same string → different canonical ID depending on context. Cache the ontology system prompt.

**Gates:**
- Mapping accuracy on the benchmark clears the bar you set in advance
- **You're still using it in week 6 without forcing yourself** (§1a)

---

## Phase C — Discoverable (weeks 10–14)

| Piece | Scope |
|---|---|
| SEO | Generate rescue-query and ingredient-query pages from the graph |
| Onboarding | The explanation layer — romanization, flavour notes, where to buy |
| Money | **Weee! affiliate** in the recipe modal and grocery list (DECISIONS §2) |
| **YouTube → blog** | Crawl recipe channels, follow the description's blog link, run the §6 JSON-LD pipeline. **Highest-value source; measured** (`SOCIAL-INGEST` §0) |
| Correction | Crowd truth-correction above a report threshold |
| **URL submission** | "Save this recipe" on any URL → counted demand. No extraction promised; the honest queue message instead (DECISIONS §8) |
| **Request queue page** | `/recipe-requests` — trending requests, *notify me*, recently unlocked, and the "are you the creator?" claim entry (UX-SPEC §11) |

**URL submission and the queue are Phase C, not D, and they are not creator
features.** They exist first for retention: a user who can't find their recipe
currently leaves permanently. The demand data that makes Phase D's outreach
possible is a by-product — which is the only reason it will be accurate. Building
them in D would mean opening creator outreach with nothing to show.

**Parse by hand, ordered by request count.** The queue *is* the content roadmap,
so there is no separate prioritization step and no guessing which recipes to add.

**SEO pages are generated, not written.** The database is the content — every rescue query and ingredient query is a filtered view you already compute.

**The onboarding work is the part you'll want to skip and shouldn't.** As a Korean speaker you don't need *"gochugaru is a coarse Korean chili flake, mildly sweet, sold at H Mart or on Amazon."* Every other user does. This is the documented founder blind spot (§1a) — treat it as a real build item, not polish.

**Gates:** organic traffic exists at all; week-1 → week-3 return ≥ 30%.

---

## Phase D — Expand (post-launch)

- Amazon Associates as a second affiliate surface
- Local farmer / produce partnerships by user location
- Social creator partnerships — structured home for their video, they keep 100% via their own tag (§8)
- **Creator claim flow** — identity by bio/site code or platform sign-in, auto-approve when the source domain matches, one ask only: confirm the ingredient list (§7)
- **Manual creator outreach** — 20–50 mid-sized accounts, DM'd tokenized claim links, no verification infrastructure built. Automate only when uncontacted creators start claiming inbound (§7)
- **Creator analytics** — saves and requests first; completion rate and ingredient drop-off only once "Made it" has volume. An empty dashboard is worse than none (§7)
- **Japanese** — full §3a checklist, including the regression run against Korean
- Receipt OCR, CSV import
- Browser extension — "see pantry compatibility on any recipe site," as an acquisition product, not a leak fix (§5a)

Nothing here starts before Phase C's gates pass. Each is a multiplier on a working product and a distraction from a broken one.

**Order within D is fixed by one dependency:** outreach needs demand counts (Phase
C), and the claim flow needs somewhere for a claim to land. So: claim flow →
outreach → analytics. Marketplace revenue (sponsored placement, CPG — DECISIONS
§2) comes after all three and is gated on volume, not on time.

---

## Critical path

```
corpus (raw strings) ──> ontology ──┬──> pipeline ──> corpus (mapped) ──┬──> matching ──> app
                                    └──> benchmark ──────────────────────┘      ├──> SEO pages
                                                                                └──> affiliate
```

**Note the corpus appears twice, and that's the point.** Raw ingredient strings come first and define the ontology's scope; the mapped corpus comes after the ontology exists. Treating this as a single "corpus" step is what produces an ontology scoped by guesswork.

Everything else hangs off the ontology. The benchmark is the only thing that tells you whether the ontology is any good — so it sits *on* the critical path, not in a QA phase at the end.

**The two genuine risks in this plan:**

1. **Building ontology depth without ever cooking from it.** Phase A's gate exists to prevent this. It's the most enjoyable work and the easiest to over-invest in.
2. **Automating the mapper before you can measure it.** Then every later change is a guess.

---

## What not to build

| Skip | Why |
|---|---|
| Ingredient photography | Existing pantry apps over-invest here. Users are time-poor and want the recipe, not a picture of an onion |
| Weekly meal planner | Same — a feature users don't have time to explore. The set optimizer (§4) covers the real need without a planning UI |
| Drag-and-drop | Not mobile-viable. Tap/long-press to move between pantry and grocery list |
| Per-item cart attribution | Weee! pays on referral + 6-month tail, not per basket (§2) |
| Unit normalization / density tables | Recommender is boolean — a gram value has no consumer (`SOCIAL-INGEST` §1) |
| Social caption crawling, Whisper transcripts, frame OCR | **Dropped 2026-11-06** (DECISIONS §10): platform ToS ban automated collection, accuracy unguaranteeable, web sources already cover the corpus. YouTube → blog link-following stays |
| Allergen hierarchy | The one use case that would force fine granularity everywhere. Not in the product |
| Quantity tracking | Highest-decay data, fails invisibly (§3) |
| Revenue-share infrastructure | Weeks of pre-revenue work; "use your own tag" gives 100% with none (§8) |
| Creator dashboard before demand data | Supply-side-first is the classic marketplace failure. It also renders empty, which is a worse pitch than no dashboard (§7) |
| Automatic extraction promised to users | Breaks visibly on first use at current accuracy. Promise the outcome and a queue instead (§8) |
| Creator verification infrastructure | The DM to their own account already proves control for the first 20–100. Build it when inbound claims arrive (§7) |
| Identity documents | We need account control, not legal identity (§7) |
| Comments / free-text on requests | Same reason as recipe comments — moderation liability, no graph value (UX-SPEC §7) |
| Native apps | PWA is enough through Phase C |
| Recipe hosting | Breaks link-out — the entire legal and economic posture (§6) |
| Waste dashboards | Prevent, don't report (§10) |
| Accounts beyond persistence | Every signup field costs users |

---

## Open before week 1

- Seed artifacts: the ~12-item starter list, top-50 substitution table (endorsed / not-endorsed + reason, **no scores**). ~~80 ingredients with `sourcing` set~~ — `sourcing` was cut (INGREDIENT-SPEC §4: nothing read it), so this artifact is dead work
- Source list and `robots.txt` check for the English-native Korean blogs
- **Weee! affiliate account** — primary monetization, needed by Phase A end
- Amazon Associates account (secondary; approval takes time and has activity requirements)
- Decide the Phase B accuracy bar
