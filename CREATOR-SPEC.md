# Creator — entity spec

Fourth of four, with `INGREDIENT-SPEC.md`, `RECIPE-SPEC.md` and `USER-SPEC.md`.
Written now and built later: the Creator is not a v1 entity and nothing in Phase
A or B reads it. It is specified early for the same reason the Ingredient was —
every recipe in the corpus already carries an author string, and deciding what
that string *is* after 4,874 rows exist is a migration rather than a decision.

**The one way it differs from the other three.** Ingredient, Recipe and User are
ours to define; the worst case of getting one wrong is that we are wrong. A
Creator is a **counterparty** — a real person with their own interests, who can
object, claim, correct, or ask to leave. That is what §6 is for, and it is the
section that has no equivalent in the other three specs.

**"Written now and built later" is now history.** The creator side was built in
August 2026, on the ux-pass branch, section by section against this file. The
ledger below is the honest map of which sentences here are running code and
which are still only sentences — kept current so a reader never has to diff the
spec against the app to know.

---

## Build ledger — as of 2026-08-14

Statuses: **built** (running in the app, verified), **partial** (built with a
named remainder), **no surface** (the spec sentence is right but the page it
governs does not exist yet), **open** (undecided by design, §8).

| Section | Status | Where, and what remains |
|---|---|---|
| §0 source ≠ creator ≠ user | built | `data/creators/creators.csv` + `recipe-creators.json` minted by the pipeline; the app reads creators through `app/src/lib/creators.ts`, never the source string |
| §1 five-state status | built | All five states live: `indexed` from the crawl CSV, `self_registered` from `self.json`, `claimed`/`withdrawn` from `claims.json`, `removed` from `removals.json`. Derivation in `creators.ts:withClaim`, removal outranking all |
| §1 creator_channel | built | Crawl channels in `creator_channel.csv`, claimant links merged over them (`linksOf`); the claim records the one proved channel. Per-channel `verified_at` and per-channel badges: cut, decided 2026-08 — icons are links, never badges, so no mark can lie about an unproved channel |
| §1 members (multi-manager) | no surface | One claimant per creator (`claims.json` `user_id`); writer/editor/manager roles stay deferred, as DECISIONS §7 said |
| §2 rows precede claims | built | ~100% of rows are unclaimed and public, exactly as specced — and the inbound half now runs: `/recipe-requests` shows the source creator on every public request with the claim entry beneath the demand count |
| §3 aliases, person-URIs | partial | Alias resolution runs in the pipeline (`npm run creators`); the person-URI parse fix shipped for most sources, justonecookbook's re-run is still on the off-VM errand list |
| §4 what is not held | built | By omission, which is the point — the claim row carries what §1 and §5 list and nothing else |
| §5 claiming, both questions | built | Domain proof (meta tag, `/jipbap-claim.txt`, DNS TXT) and YouTube (description token) in `claims.ts:findChannelProof`; Instagram/TikTok honestly disabled. Settings: display name, bio, avatar, links, tag (stored, unresolved) |
| §5 two badges, two glyphs | built | Profile check vs Creator-confirmed pen, never shared; rendering rule 2 holds — the pen marks confirmed rows on every grid a claimed creator's recipes appear in |
| §5a the open door | built | `/creators/start` mints `self_registered` rows; duplicate domains answer with the claim link, never a second row |
| §5a entry criterion | built | The add action refuses, by name, a link not living on the proved channel or not answering a HEAD request — self-registered creators only, since a crawled catalogue is its own evidence |
| §5a earned tier | no surface | Nothing is earned yet because the mechanical counters do not exist: affiliate tags are stored and never resolved, and every creator-added recipe's outbound link is `nofollow` (`LeaveToCook`). Nothing shipped ungated — the earned features are simply off |
| §5b vocabulary, quarantined misses | built | Select-only autocomplete; a miss is kept as written (dotted inert chip), publishes on the creator's own page with honest copy, and holds the recipe out of matching via `servable` with zero new machinery |
| §5b misses as backlog | partial | The misses sit on the rows in `data/creators/recipes.json`; the queue generator does not harvest them into `data/qc/unknown.csv` yet |
| §6 withdrawal | built | Self-serve toggle, honoured immediately, reversible; recipes leave every pool at `unlistedRecipeIds`, the name comes down at `creatorOfRecipe`, the direct link keeps working |
| §6 rule 3 request-board copy | built | `/recipe-requests` (UX-SPEC §11), unlisted at v1 (`lib/surface`) — live at the URL, linked from nowhere, noindex, capture still recording, so the board opens with real rows the day it is listed. Copy as built: withdrawn rows say "unavailable at the creator's request", removed rows say "no longer listed here", and both stop collecting — the copy switch `removed` exists for. Notify-me: decided against, 2026-08 — the return trip is the unlocked block plus the transfer, next row |
| the transfer (queue's return trip) | built | `transferOwnUpgrades` (`store.ts`) runs on every My Recipes load, resolved through `corpusTwin` (`recipes.ts`): a pasted copy whose recipe is now a servable corpus recipe moves into the saved shelf — standing note, steps (merged into the note), cook history and plans carried, own row retired, only the ingredient list replaced by the curated one. The standing note got its read-only display back (`MyVersionRead`) in the same commit, because transferred words nobody can see read as words lost |
| §6a removal for cause | built | `npm run creator-removal`, two grounds, refuses a third by name; behaves as withdrawn on every rail, differs only in copy (the claimant's banner offers no restore) |
| §6a disputed claims | built | The proof panel shows to a signed-in non-claimant with their own token; a pass takes the page, the fresh claim reverts every custom setting by construction, and a standing claimant's re-run is refused as already theirs. Re-claiming after removal works and does not relist |
| §7 analytics | built | By omission again: no counters on any row, nothing displayed |
| §8 open questions | open | All still open. Two have moved: the door shipped with the earned tier entirely off, so the missing thresholds gate nothing yet; and `creatorByDomain` refuses the asserted-vs-observed collision at the door, but a later crawl of a registered domain still creates it |

---

## 0. Three words that are not synonyms

The corpus currently collapses all three, and that collapse is the thing this
spec exists to prevent.

| | what it is | scope | example |
|---|---|---|---|
| **Source** | a site we crawl | crawler config (`src/ingest/sources.ts`) | `thewoksoflife` |
| **Creator** | whoever made the recipe | global, shared | Bill, Judy, Sarah, Kaitlin |
| **User** | an account in our product | private (`USER-SPEC.md`) | someone with a pantry |

`RECIPE-SPEC.md` §1 stores `source_id`, and today that is all we resolve. It is
not a creator, and the corpus already proves it:

- **The Woks of Life is four people.** 1,250 recipes, nine distinct author
  strings, at least four real authors publishing under one domain.
- **Maangchi is one person across three channels** — a blog we crawl, a YouTube
  channel we intend to crawl (`SOCIAL-INGEST` §0), and social. One creator,
  several sources.

So the mapping is many-to-many in both directions, and a `creator_id` on Recipe
that is really a source id would be wrong on day one, not eventually.

---

## 1. What a Creator is

```
creator
  id             crt_…      opaque, permanent — same rule as ing_/rec_
  display_name   text       what we show; editable by them on claim
  status         'indexed' | 'self_registered' | 'claimed' | 'withdrawn' | 'removed'
  claimed_at     timestamp?
  affiliate_tag  text?      DECISIONS §8, tier 2 — their tag, their 100%
```

**`self_registered` is not a synonym for `indexed`.** An `indexed` row is an
observation: we crawled a source and they were on it. A `self_registered` row is
an assertion: someone with no crawled presence walked through §5a's open door and
told us. Both are legitimate, both can be claimed, but only one of them is
evidence — and §2's defensibility posture is that we describe what is on the
public web, so we must be able to tell them apart permanently rather than at
audit time.

**`removed` is not a synonym for `withdrawn`** either, for a reason that is
narrow and concrete: §6's third rule puts *"unavailable at the creator's request"*
on the request board. That sentence is a lie about someone we ejected (§6a). The
status is separate so the copy can be honest.

Channels are separate rows, because ownership is proved against a channel and a
creator has more than one:

```
creator_channel
  creator_id   crt_…
  kind         'domain' | 'youtube' | 'instagram' | 'tiktok'
  handle       text        koreanbapsang.com · @maangchi
```

**The proof runs against a channel; the claim records which one.** Proving
control of `maangchi.com` says nothing about who runs `@maangchi` on TikTok,
which is why the proof is always a check against one named channel and the
claim stores exactly the channel that passed (`verified_channel`).

**But there is no per-channel `verified_at`, and no per-channel badge —
decided 2026-08.** One proved channel makes the page claimed; the profile
wears the one ✓; every channel icon is a link and never a badge. The
per-channel ledger was designed to stop the profile mark from vouching for
unproved channels, and the cheaper fix is for nothing to vouch for channels at
all: a row of unbadged links claims nothing, so there is nothing to be a lie.
What the claimant lists in settings is their say-so, labelled by being
unlabelled — the same posture as the bio.

And the recipe side:

```
recipe
  creator_id   crt_…?     nullable — see §3
```

Nullable is deliberate and permanent, not a gap to be filled. Some recipes will
never resolve to a person, and a required foreign key would force us to invent
one.

### Members: who may act as a creator

DECISIONS §7 says *"support multiple managers per creator account later — writer,
filmer and brand owner are often different people."* Later is expensive; the
indirection is one table.

```
creator_member
  creator_id   crt_…
  user_id      usr_…
  role         'owner' | 'manager'
```

**Reviewer's call: put the join table in now, empty.** This is the identical
argument to `USER-SPEC.md` §3's `owner_id` — one table today that always resolves
to one person, against a migration touching every creator-scoped query later. The
Woks of Life is a four-person family business and it is 26% of the current
corpus; the multi-manager case is not hypothetical, it is our largest source.

---

## 2. A creator row is created by the crawl, not by a claim

> **A creator row is a fact about our corpus, not a relationship with a person.**

`status = 'indexed'` is the default and will be the state of ~100% of rows
indefinitely. Three things break if we wait for a claim to create the row:

1. **UX-SPEC §11 displays the source creator on trending requests** — before any
   claim exists, by design. That is the inbound half of creator acquisition: a
   creator searching their own dish finds proof people are waiting for it.
2. **DECISIONS §8's outreach carries a count** — *"saved 138 times"*. The count
   has to already be attributed to someone we have never contacted.
3. **A claim needs something to claim.** "Claim your profile" (§7 — acquiring,
   not verifying) is meaningless if the profile is created by the act of claiming.

The consequence to accept: we will hold rows for people who never asked us to,
naming them, publicly. That is ordinary for a search index and it is the same
posture as §6's link-out — we describe what is on the public web and send traffic
to it. §6 of this file is what makes it defensible.

---

## 3. Identity is a raw-string problem, and it is the ingredient problem again

Every recipe in the corpus already has an author. It is not usable as a key.

| Measured on 4,874 recipes, 15 sources | |
|---|---|
| Recipes carrying an `author` value | **4,874 / 4,874 (100%)** |
| Sources where the value is a schema.org person-URI hash, not a name | **10 / 15** |
| Distinct author strings on `thewoksoflife` | 9, for ~4 real people |
| Distinct author strings on `mykoreankitchen` | 6, for **one** person |

The `mykoreankitchen` row is the whole argument in one line: `Sue`,
`Sue Pressey`, `Sue | My Korean Kitchen`, `My Korean Kitchen`, a person-URI, and
`Sue | My Koran Kitchen` — a typo in the source's own metadata. Also present
elsewhere: `Seonkyoung Lon gest`, `Lis lam`, and one genuine co-author line,
`Mrs. Jenny Leong + Lis Lam`.

So the model is the one `INGREDIENT-SPEC.md` §1 already settled, applied
unchanged:

```
creator_alias
  raw       text     the author string exactly as crawled
  creator_id crt_…
  source_id text     aliases resolve within a source, never globally
```

**The raw author string is an alias, never a key.** Same rule, same reason: the
string is the source's, it changes without telling us, and two sources will use
the same string for different people.

**Aliases resolve within a source.** `Sue` on `mykoreankitchen` is one person;
`Sue` on another blog is not evidence of anything. Cross-source identity — the
Maangchi blog and the Maangchi YouTube channel being one creator — is a
`creator_channel` fact established at claim time or by hand, never inferred from
a matching display name. Name collision across the open web is the norm, and a
wrong merge here attributes someone's work to a stranger.

**Fix the person-URI at parse time, not by hand.** Ten of fifteen sources emit
`https://site/#/schema/person/<hash>` because the crawler flattened the JSON-LD
`@graph` instead of following the `@id` to the `Person` node that holds the name.
That is a parser fix in `src/ingest/jsonld.ts` and it recovers real names for
about two thirds of the corpus. Doing it before creator rows are minted is
cheap; doing it after means re-keying them.

---

## 4. What a Creator does not hold

Each line is a decision already made elsewhere, recorded here so it is not
re-opened when the table is finally built.

| Not stored | Why |
|---|---|
| Legal name, ID documents | We need account control, not legal identity (§7) |
| Ontology contributions — aliases, cuisine tags, substitutions | *"Do not ask creators to annotate the graph"* (§7). They will not, and their guess is not better than our mapper plus a benchmark |
| Recipe text or instructions | We never host (§6). A claim changes attribution, never that |
| Payout details, revenue share, 1099 data | *"Use your own tag"* gives them 100% with zero infrastructure (§8) |
| Follower counts, platform metrics | Rented numbers we cannot verify and would have to keep fresh. The analytics we offer are ours (§7) |
| A rating or quality score | Ranking is per recipe (`RECIPE-SPEC.md` §8). A creator-level score is a reputation system, with all of the moderation cost and none of the graph value |

**The one ask on claim is: confirm the ingredient list.** That writes to Recipe,
not to Creator — same principle as §5 for users, never a blank field, always a
guess to correct.

---

## 5. Claiming: two questions, already answered

DECISIONS §7 settles the mechanism — *identity* (do you control this account?)
and *ownership* (may you manage this recipe?) are separate questions with
separate answers, verification is per channel and never per person, and
ownership auto-approves when the indexed source already belongs to the verified
channel. Not re-litigated here.

What this spec adds is only **what a claim changes in the data**:

| Changes | Does not change |
|---|---|
| `status` → `claimed`, `claimed_at` set | The recipe's `source_url`, or who hosts it |
| `verified_channel` on the claim — which channel passed | Anything about other channels; icons stay unbadged links (§1) |
| `affiliate_tag` becomes resolvable (§8 tier 2) | Our tag on rescue pages and general matching — the §8 scope rule is unchanged |
| ✓ on the profile — the page is claimed | Any per-channel mark; no icon vouches for a channel (§1, decided 2026-08) |
| ✓ *Creator-confirmed* on recipes whose ingredient list they confirmed | The two other badges: *community validated* and *N cooks completed* stay independent (§7) |
| `display_name` becomes theirs to edit | Their `creator_id`, permanently |

### Two badges, and they must never share a glyph

The claim pitch already promises *"a verified check by your name"*
(`app/src/app/creators/[handle]/claim/page.tsx`), so the person-level mark ships.
It is legitimate. It also answers a different question from the recipe mark, and
rendering both as the same checkmark collapses the two.

| | **Claimed profile** | **Creator-confirmed** |
|---|---|---|
| Claims | this page really is Maangchi's | the creator confirmed this ingredient list |
| Attaches to | the profile, once, whichever channel proved it (§1) | one recipe |
| Evidence | channel proof — binary, cheap, instant | per-recipe review — expensive, earned |
| Granted | at claim, automatically | only on recipes they actually opened |

The original rule survives the split and is restated, not repealed: **a creator
who claims the profile and confirms nothing has confirmed nothing.** Marking their
300 unreviewed recipes as authentic would spend the trust signal on exactly the
case it exists to distinguish. Two consequences for rendering, and they are the
whole point of separating the marks:

1. The profile mark may never imply the recipe mark.
2. A claimed creator's recipe list must show confirmed and unconfirmed recipes
   *visibly* differently — otherwise the profile check silently launders every
   unconfirmed recipe beneath it, which is the blue-check failure mode.

**Identity is not quality.** The person mark does not reopen §4's refusal of a
creator-level score, as long as it never drifts into meaning *good*. The moment it
reads as an endorsement rather than an identity, it has become the reputation
system §4 declined to build.

---

## 5a. Entry is open. Privileges are earned

**The door is open to any recipe creator.** No application, no review, no follower
minimum — §4 already refuses to store follower counts, so a threshold would be
unenforceable even if we wanted one. Anyone who publishes recipes somewhere they
control may be a creator here, and a `self_registered` row is minted for those the
crawl has never seen (§1).

That is defensible because the architecture does the filtering, not a policy: **we
never host instructions.** Which yields the one entry criterion, and it is not a
judgement call about anyone:

> **No recipe without a live `source_url` on a channel the creator has proved.**

A recipe with no home elsewhere is one we structurally cannot accept, because
accepting it would mean hosting it. The check is a HEAD request against the
verified channel's domain. It is not a parse (§5b).

**That is a cost bar, not a quality bar.** It excludes people with nothing
published. It excludes nobody with a motive, because a domain costs twelve
dollars. So the gate belongs on the payoff rather than on the person:

| Granted at claim | Earned |
|---|---|
| Profile, editable `display_name`, the profile ✓ | **`affiliate_tag` resolution** (DECISIONS §8 tier 2) — the only feature that pays cash, therefore the only one worth attacking |
| Their recipes visible on their own creator page | **Dofollow on the outbound link.** `nofollow` until earned. Worth nothing today and worth exactly our domain authority later — the abuse payoff grows on the same curve as the SEO strategy BUSINESS-REVIEW §4 flags as load-bearing |
| ✓ *Creator-confirmed* on recipes they confirm | Inclusion in matching for recipes carrying an unresolved ingredient line (§5b) |

Deferring costs nothing now and is decisive later, which is the whole argument for
writing it before the door opens rather than after the first abuse.

**Earned means mechanical, never reviewed.** A count of recipes whose ingredient
lines resolved cleanly, or cook completions above §7's publishing floor — both are
computed and neither requires a person to form an opinion. The moment a human has
to approve a creator, we have built the reputation system §4 declined.

**Crowd signal ranks; it cannot gate.** Upvotes were the obvious alternative and
they fail three ways: they need traffic that does not exist at launch, so the
window where we are most open is the window where the crowd is absent; they are
cheaper to forge than the domain they would be defending; and §4 already refused
to carry a score at the creator level. *N cooks completed* is the better signal
because it is behavioural rather than an opinion — but it accrues after the fact,
which is the definition of a ranking lever rather than an entry gate.

---

## 5b. Creator-entered recipes use our vocabulary, not their strings

We are not building a parser for arbitrary recipe pages to serve this door. The
creator enters the ingredient list themselves — **against our controlled
vocabulary**, selecting canonical entries from autocomplete, never typing free
strings.

**This is not the graph annotation §4 refuses.** §4 forbids creators *extending*
the ontology — aliases, cuisine tags, substitutions — because their guess is not
better than our mapper plus a benchmark. Selecting an existing `ing_…` is the
opposite operation: it yields a canonical id at the moment of entry, so there is
nothing to normalize, nothing to map and nothing added to the decision queue in
`data/decisions/`. **This is the cleanest ingest path we have** — cleaner than the
crawl, which spends all of `NORMALIZATION.md` recovering exactly what this door
receives already resolved.

**The author's word beats a scrape.** The list is self-asserted and nothing
verifies it against the linked page. That is correct rather than a gap: on their
own recipe the creator is the authority, and any drift between the list here and
the prose there is theirs to own, not ours to arbitrate.

Two rules make it hold:

1. **A creator may never mint an ingredient.** Autocomplete over existing entries
   only. Nothing a creator types enters the ontology directly, ever. One accepted
   free string reinstates the raw-string problem §3 exists to prevent, and it
   arrives with a verified creator's authority attached.
2. **A miss is quarantined — not blocked, not swallowed.** The vocabulary will not
   have it: regional items, a gochujang variety, a brand. Blocking publication
   kills the flow for precisely the specialist creators we most want; silently
   accepting free text reinvents raw strings. So the line is captured as free
   text, the recipe publishes and appears on the creator's own page, and the
   unresolved line holds that recipe **out of matching** until the entry is
   curated.

**The misses are the prize.** Each one is a real creator telling us which
ingredient our vocabulary lacks, ordered by who actually needed it — a
demand-ranked ontology backlog, and a better queue than the hand pass currently
working through the corpus in source order.

---

## 6. Withdrawal — the section the other three specs do not need

A creator asks to be removed. This will happen, and the answer must exist before
the first email rather than be improvised under one.

**Honour it, immediately, without a review process and without an argument.**
`status = 'withdrawn'`: their recipes drop out of matching, SEO generation and
the request queue; their name stops being displayed. No form, no justification
asked, no retention flow.

The reasoning is not sentiment, it is arithmetic. The cost of honouring a
withdrawal is a handful of recipes out of thousands. The cost of contesting one
is the entire partner posture that DECISIONS §7 is built on — *"converts
publishers from a legal risk into partners"* — plus the public account of a
recipe site refusing to stop naming someone. One is cheap and the other is not
survivable, and no plausible traffic number moves that.

Three rules that follow:

1. **Withdrawal is reversible.** `withdrawn` is a status, not a deletion. Set it
   back and everything returns. Most withdrawals are a reaction to a surprise —
   being indexed without being asked — and the honest first response is to stop,
   not to permanently destroy the row and force a re-crawl if they change their
   mind.
2. **Derived data stays, de-attributed.** Ingredient mappings, aliases harvested
   from their pages (`RECIPE-SPEC.md` §4b: *"the alias harvest is the real
   prize"*) and substitution statistics remain in the ontology. Those are ours,
   they are about ingredients rather than about them, and they are not
   reconstructible. This is exactly `USER-SPEC.md` §4's rule — aggregates are
   recomputed, not decremented — applied to the supply side.
3. **The queue tells the truth.** If a withdrawn recipe has outstanding requests,
   `/recipe-requests` says *"unavailable at the creator's request"* and stops
   collecting them. Silently dropping it makes the board look like a list of
   things we failed to do, which UX-SPEC §11 identifies as the one framing that
   kills the page.

**Withdrawal does not touch the link.** We can stop indexing someone. We were
never hosting their content, so there is nothing else to take down — which is
the entire reason this section is short.

---

## 6a. Removal and disputed claims — §6 in the other direction

§6 answers the creator who asks to leave. §5a's open door makes the two mirror
cases live, and both need an answer written before the first one arrives rather
than improvised under it.

**Removal for cause is mechanical and narrow.** Two grounds only: recipes with no
live `source_url` on the proved channel — §5a's single entry criterion, violated —
and affiliate tag abuse. Not *low quality*. Nothing in this spec judges a recipe,
and adding a quality ground here would smuggle in the moderation cost §4 refused.
`status = 'removed'`, which behaves exactly like `withdrawn` in the pipeline
(§6's three rules apply unchanged) and differs only in what the request board is
allowed to say (§1).

**Disputed claims are the urgent half**, because §5 auto-approves ownership when
the indexed source belongs to the verified channel — so a false claimant holds the
profile's ✓ from the instant they pass channel proof, against a real creator's
name.

- **The proved channel wins, and proof can be re-run.** A later claimant who
  passes the same proof on the same channel takes it; the earlier verification is
  void, not senior. Whoever controls the channel today is who the channel belongs
  to — the only fact we can actually check. Seniority would mean preferring our
  record over the evidence.
- **Contested fields freeze rather than race.** On a second successful proof,
  `display_name` and `affiliate_tag` revert to their pre-claim values until
  exactly one claimant can prove the channel.
- **The recipes never move.** Attribution follows `creator_id`, which is permanent
  (§5). A dispute is about who manages the row, never about who wrote what.

**Re-claiming is allowed on the same proof as the first claim**, after withdrawal
or removal alike. Channels are sold, transferred and inherited, and the person at
the other end is often not the person who left.

---

## 7. Analytics are derived, never stored

No counters on the creator row. Saves, requests, click-throughs, completion rate
and ingredient drop-off are computed from `user_recipe`, `cook_event` and the
request table at read time.

DECISIONS §7 fixes the sequence and it is a data-availability fact, not a product
preference: **counts are available immediately and are enough for outreach;
completion and drop-off need consumer volume that does not exist yet.** Do not
promise the second set while holding only the first.

Two constraints inherited rather than invented:

- **A publishing floor.** The same `k` that governs `RECIPE-SPEC.md` §9's public
  attributes governs anything shown to or about a creator. *"37% didn't have
  gochujang"* computed over eleven cooks is noise wearing a percentage's clothes.
- **Do not display counts until volume** (§7). They read as abandoned at launch,
  and an empty dashboard is a worse pitch than no dashboard.

---

## 8. Open questions

- **Do creators get a public page before they claim?** A `/creators/<handle>`
  page is generated content and falls under UX-SPEC §10's thin-content guard, but
  it is also the most natural landing spot for a creator searching their own
  name — which is the inbound acquisition path §8 depends on. Coverage threshold
  undecided.
- **Where does the person-URI fix land in the build order?** It is a small parser
  change, it recovers names for ~10 of 15 sources, and it is strictly cheaper
  before creator rows exist than after. Probably belongs with the Phase B
  pipeline work rather than waiting for Phase D.
- **Is a co-author string one creator or two?** `Mrs. Jenny Leong + Lis Lam`
  appears once today, so the honest answer is that the corpus has not yet forced
  the decision. If recipes need multiple creators, `recipe.creator_id` becomes a
  join table — which is why it is worth answering before the column ships, not
  after.
- ~~**What happens to a withdrawn creator's outstanding demand?**~~ Resolved
  2026-08, both halves. The board says *"unavailable at the creator's request"*
  and stops collecting (§6 rule 3). The people who already asked are not
  notified and never will be — there is no notify channel by decision
  (DECISIONS §11): the return trip everywhere is the product surface, and for
  a withdrawn recipe there is honestly no trip to return from.
- **What are §5a's numbers?** Tag resolution and dofollow are deferred until *"a
  count of recipes whose lines resolved cleanly"* or cook completions above §7's
  floor. Neither threshold is set. Both should be read off the miss queue's actual
  throughput once the door is open, not guessed now — but shipping the door
  without a number means shipping it ungated in practice.
- **Does a `self_registered` creator ever become `indexed`?** If we later crawl a
  site whose owner already signed up, one person holds an asserted row and an
  observed one. The merge rule is undecided, and it is §3's cross-source identity
  problem arriving from the opposite direction — with the same rule against
  inferring a merge from a matching display name.
- **Is there a submission rate limit?** §5b removes the *normalization* cost of an
  open door but not the *review* cost of the quarantine queue, which is serviced
  by one person. A limit framed as capacity rather than suspicion is probably
  right; the number is unknown until the queue has a real arrival rate.
- **Claim-link token expiry and reuse** — carried over from DECISIONS §11,
  unchanged. It is a creator-entity question and it belongs on this list too.
- **Does an unclaimed creator's affiliate tag ever exist?** Tier 2 assumes a
  claim. A blogger who already has an Amazon tag on their own page is publishing
  it — whether we may read and honour it unclaimed is a live question with a
  plausible "no" (attributing purchases to a tag whose owner never agreed to it).
