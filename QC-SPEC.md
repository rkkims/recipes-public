# QC-SPEC — three curations, one loop

Status: **DRAFT.** Open questions in §7 are not rhetorical; they change what
gets built. Nothing here is implemented.

## 1. The shape of the work

Three curations run at once, and they are not three screens:

| curation | what it writes | today |
|---|---|---|
| recipe ingredient annotation | which node each ingredient line means | `data/curation/` |
| ontology curation | nodes, and `is_a` edges between them | `nodes.csv`, hierarchy proposals |
| alias curation | which surfaces resolve to which node | `aliases.csv` |

**The recipe is the entry point. Always.** Not a vocabulary list, not a queue
of edges — a recipe, read top to bottom, with its ingredient lines. The other
two curations are things you fall into when a line will not annotate cleanly,
and you return to the recipe when they are fixed.

That ordering is the whole design. It is also a reversal of how the data was
built: the pipeline goes catalogue → vocabulary → ontology → recipes, and the
review goes the other way. Reviewing in pipeline order means curating 5,698
vocabulary names against no particular purpose. Reviewing recipe-first means
every decision is made while looking at the sentence that needs it.

## 2. What a recipe line does when you type

One input, three things behind it, in this order:

1. **Alias hit** — the surface is already known. `korean red chili pepper
   flake` → `gochugaru`. Resolved silently; the row shows what it resolved to,
   not that an alias was involved. An alias is not a decision the annotator
   should have to think about.
2. **Node hit** — the surface IS a node, exactly or under `numberKey`
   (number-, spacing- and punctuation-insensitive; the rule
   `NORMALIZATION.md` already fixes and the typeahead already uses).
3. **Neither** — the surface is new. This is the interesting case and §5 is
   about it.

Suggestions are ranked on two things, in this order: **how close the strings
are**, then **how many RECIPES use the ingredient**. Reviewer: *"autosuggestion
is the core machinery for making the system use unified vocabulary."*

Recipes, not ingredient lines. They are not the same number and the difference
is not noise — `scallion` is used by 1,997 recipes but parses out of only 1,638
lines, because aliases like `green onion` reach it from lines that never said
the word. Line counts also double-count a recipe that names something twice.
"Used by 2,413 recipes" is a fact an annotator can judge; "2,638 mentions" is
an artefact of parsing.

The count rides on every suggestion row for that reason. It is the same
machinery a user will meet later when they paste an ingredient list from a
recipe we do not hold, so it has to read as a fact about cooking rather than
about our pipeline.

### The hierarchy is shown, not hidden

Typing `basa` shows the path, because the path is the thing most likely to be
wrong and the annotator is the only person who will ever look at it:

```
fish  ›  white fish  ›  basa
```

Each segment is a link into ontology curation (§4). Reading the path is how a
bad edge gets caught — `coconut milk` sitting under `milk` is invisible in a
list of 477 rows and obvious in one line of breadcrumb.

> **This does not work yet.** All ten accepted categories are roots: `white
> fish` has no parent, so today the path reads `white fish › basa`. Placing
> the categories is prerequisite work, not a nicety — see §7.1.

## 3. Immediate reflection — offline, so the page is the system

**Decided: offline.** No server. A self-contained folder on the review laptop,
opened from `file://`, like the vocabulary bundle already there.

This makes "reflected right away" the easy half rather than the hard half.
There is no pipeline to re-run and no server to tell — the ontology, the
aliases and the recipes are all in the page's memory, and an edit is a
mutation the next render already sees. The three curations share one object
graph because there is nowhere else for them to be.

What it costs is at the boundaries, not in the loop:

- **`file://` cannot `fetch()`.** Every byte ships inlined in the HTML. Same
  constraint the vocabulary bundle already works under, and the reason it is
  one file rather than a folder of JSON.
- **The bundle is a snapshot.** It is built from the VM's ontology at a moment
  and goes stale the instant either side moves. This has already bitten once —
  a bundle built at 16:29 was reviewed after merges at 17:50 and still showed
  `eggs` and `egg` as two ingredients. §7.2.
- **Nothing is authoritative until it comes back.** A session produces an
  export; a script on the VM folds it in. That is the existing shape
  (`weee/import.ts`), extended.

**Ids are assigned at import, not in the session.** Offline settles this: the
page cannot mint a permanent id, because `identity.csv` and the redirect
chain live on the VM. So annotations reference nodes by NAME throughout, and
import resolves names to ids — minting the ones that are new, per
`INGREDIENT-SPEC` §1. The page never sees an id, which §6 wanted anyway.

Durability inside a session is the vocabulary tool's existing answer: write
through to a File System Access handle on every edit, with IndexedDB holding
the handle across reloads, because a review session that loses an hour of
judgement to a closed tab is worse than one that never started.

## 4. Falling sideways, and coming back

From a recipe line, two doors:

- **the resolved node** → ontology curation for that node: its parent, its
  children, its mentions, its allergen tags. Fix the edge, close, return to
  the line with the path redrawn.
- **the alias that fired** → alias curation for that surface: what it resolves
  to, why, what else resolves there. Retarget or delete it, return.

Both are **modal over the recipe**, not separate pages. The recipe stays on
screen because it is the reason you are there; losing it to a full page change
is how a curation session turns into aimless list-reading.

Every fix is scoped to one entity. Bulk editing is deliberately absent — the
whole premise is that decisions are made with a specific sentence in view.

## 5. When the surface is new

An unrecognised surface is one of four things, and the QC system should make
the annotator say which:

| it is | the fix | writes |
|---|---|---|
| a spelling of a known node | nothing to record — accept the suggestion | — |
| another name for a known node | an alias | `aliases.csv` |
| a real ingredient we lack | a new node | `nodes.csv` |
| not an ingredient (`visible fat`, `qt water`) | mark the line unparseable | curation record |

The fourth is common — 568 of 1,315 unplaced nodes are parser wreckage — and
having no button for it is how junk becomes ontology.

`INGREDIENT-SPEC` §1 reserves minting to review. **This screen is review**, so
minting here is legitimate; but see §7.4 on what stops it being casual.

## 6. What the annotator must never have to do

- decide singular vs plural (`NORMALIZATION.md` "Number" decides; the display
  name follows)
- fix a typo by editing the ontology (`numberKey` absorbs it)
- know whether a match came from an alias, a node, or the number rule
- see an id

Every one of these is a place where the system knows the answer and asking
would be a defect.

## 7. What the corpus says will happen

The described loop was tested against the real data before speccing further.
`korean red chili pepper flake` does resolve to `gochugaru` — via
`aliases.csv:183`, an alias already curated, with the number rule bridging
`flake`/`flakes`. `basa` does render `fish › white fish › basa`. The described
path works.

It is also the path that needs no curation. The rows curation exists for are
the ones that resolve to **nothing**, and there are more than expected:

> **2,534 distinct heads over 6,446 ingredient lines resolve to neither a node
> nor an alias.**

Four things fall out of looking at them, none of which the described structure
has an answer for:

**`water` is 2,033 of those lines** — nearly a third, and the single largest
unmatched head in the corpus. **Done:** `src/ontology/not-stocked.ts` disposes
of 2,398 lines across 53 heads, touching 2,013 of 4,874 recipes, and the rule
is narrow enough to read in full (`npm run not-stocked` writes the audit).

Two things it settled that were not obvious before writing it:

- Equipment is not worth a rule. It looked like a class; the corpus has ~12
  genuine lines of it, and a pattern broad enough to catch them swallows
  `rack of baby back ribs` and `knife cut noodles`.
- **17 of the heads it caught are confirmed NODES** — `icy water`, `tepid
  water`, `qt water`, `litters water`, `regular sized ice cubes`. The rule
  found parser wreckage that had already reached `nodes.csv`. Retiring them is
  §1's business, behind redirects, and is not done.

**`salt and pepper` is 274 lines, and it is two ingredients.** That is a
PARSER failure surfacing in the QC tool, and the only honest action is "split
this line", which is neither annotation, ontology, nor alias. The three-way
structure has no fourth door for it.

**Ranking and duplicates — both DONE**, in `src/ontology/suggest.ts`. Token
overlap ranked `scallion` above `onion` for `whole onion`, and offered one
node three times when three alias surfaces reached it. Scoring is now F1 over
token sets in both directions plus a head-noun bonus, deduplicated by node,
with frequency demoted to a tiebreak. Measured on the corpus's own top
unresolved heads, top-1 is now right for `sea salt`, `whole milk`, `whole
onion`, `gim`, `cracked black pepper`, `sesame seed`, `cooking sake`,
`cooking rice wine`, `pure vanilla extract` and `whole carrot`.

Two things the measurement exposed, neither of them ranking:

- **`rice water` is not a node**, though the repo already decided it is an
  ingredient. 19 lines ask for it and nothing resolves them, so the suggester
  offers `coconut water` and `lye water` instead. A gap in the ontology, not
  in the ranking.
- **The 17 junk nodes pollute suggestions.** `icy water` is offered as a
  candidate for `rice water` because it is a confirmed node. Retiring them
  (§1, behind redirects) improves every suggestion list, not just the queue.

A bare modifier — `whole`, `korean`, `short` as an entire head — still returns
noise, but that is the parser handing over a fragment, not ranking failing.

## 8. Open questions — settle before building

### 8.1 ~~The ten categories have no parents~~ — DONE
`citrus`, `white fish`, `poultry`, `roe` and the rest are all roots. Until
they are placed, §2's breadcrumb is one level deep and the descendant
direction of matching (`fish` in the pantry → a `basa` recipe) cannot work at
all. Placing ten edges is small work. Doing it before the QC tool is built, or
inside it as the first curation session?

### 8.1b The breadcrumb shows unreviewed work — the sharpest one
Every edge behind `fish › white fish › basa` is a PROPOSAL. 481 drafted
edges, 90 category placements and 10 categories, none accepted. Shown plainly,
the annotator reads LLM output as ontology while making decisions that depend
on it; hidden until reviewed, the breadcrumb is empty for exactly the
ingredients it would help with most. Mark provisional edges visually, or run a
hierarchy pass before annotation starts? This is a sequencing decision, not a
display one.

### 8.2 ~~Server or offline bundle~~ — DECIDED: offline
Self-contained folder, `file://`, no server. §3 records what follows. Two
things it does not settle:

- **Snapshot staleness.** The bundle is built from the VM at a moment. It has
  already gone stale once inside a day. What guarantees the laptop is not
  reviewing yesterday's ontology — a build stamp checked at import, a refusal
  to import against a moved base, or acceptance that the VM must be frozen
  during a review session?
- **Merge.** Vocabulary QC exported append-only verdicts. This exports
  MUTATIONS to a graph three curations were all editing. Import needs a
  conflict story it does not have.

### 8.3 ~~Session ids~~ — DECIDED by 8.2
Offline cannot mint permanent ids. Annotations reference names; import
resolves them. What remains is the consequence below.

### 8.3b Does fixing an alias rewrite earlier annotations
Annotate recipe 3, its line resolving through alias A. At recipe 40, discover
A is wrong and fix it. Recipe 3's stored annotation now means something else —
if annotations store the SURFACE. If they store the resolved NODE instead, the
fix does not propagate and recipe 3 keeps a decision you have since
overturned. Neither is right by default. Storing both, and having import
report divergence, is the obvious third option and needs to be a decision
rather than an accident.

### 8.4 What stops casual minting
Minting is one keystroke away from an annotator who has not found what they
wanted. A frequency floor, a confirmation showing near-misses, a "propose"
verdict distinct from "mint"? The failure mode is a long tail of one-mention
nodes, which is what the corpus already suffers from.

### 8.5 Concurrent sessions
Two sessions, one `aliases.csv`. Single-writer lock, or last-write-wins with
an append-only log? Today's tools assume one writer.

### 8.6 Does annotation change the ontology's frequency counts
Mention counts drive suggestion ranking and the aggregate-plural rule. If
annotation re-points a line from `egg` to `eggs`, do counts move during the
session, changing ranking underneath the annotator?
