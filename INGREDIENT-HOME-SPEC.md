# Ingredient home — the creator's surface

What we host on a creator's behalf, what we refuse to host, and why the refusal
is the feature.

Sixth alongside `INGREDIENT-SPEC.md`, `RECIPE-SPEC.md`, `USER-SPEC.md`,
`CREATOR-SPEC.md` and `CREATOR-HUB-SPEC.md`. The hub spec decides where a
creator's tag fires; this one decides what the page around it contains.

Written 2026-08-12.

---

## 0. The rule that decides every question below

A creator is paid in views. Not by us — by the platform they actually live on.
So the test any feature has to pass is not whether a cook likes it:

> **A cook who finishes without watching the video is a creator losing money.
> Every feature must produce views, money or saved labour for the creator, and
> none may substitute for the video.**

This kills the obvious product. A well-formatted recipe page with numbered steps
is a better artifact than a caption, cooks would prefer it, and it would make us
a competitor to the person we are trying to recruit. **The thing that reads as
generosity is the thing that causes churn.**

So the method stays where it is, and `CONTRIBUTION-SPEC` §3 stands unamended:

> *"What a contributor may never supply: the method… There is no field for
> instructions, and there will not be one."*

**This was re-opened on 2026-08-12 and closed again the same day**, in favour of
hosting creator-authored methods for verified claimants. Recorded because the
argument for hosting was good and will recur: a rights-holder publishing their
own method is not the stranger §3 was written against, `CONTRIBUTION-SPEC` §1's
`origin` enum already has a `'creator'` value, and it would have fixed the real
complaint that cooks rewind videos to catch quantities. **It was rejected on
views, not on rights** — and that argument beats the rights argument, because it
is the creator's own interest rather than ours.

Four costs it also avoids, which is the consolation: no DMCA agent, no intake
moderation, no `canonical` flip, no hosting posture to defend.

---

## 1. What the page holds

```
creator page  →  one row per recipe (index)
recipe page   →  ingredients, structured
                 + the four features in §2
                 + recirculation (§3)
                 + a link out to the video
```

**Ingredients only.** Not a summary of the method, not "quick steps", not a
timestamped outline. Each of those is the method wearing a disguise, and each
would test as popular.

The link out is the whole point of the page rather than a courtesy on it. A cook
arrives knowing what to buy and what they already have, and then goes and
watches.

### Collections, and why the index is not a minor feature

Checked 2026-08-12. **Neither platform gives a mid-tail creator a way to group
their videos by topic.**

| | |
|---|---|
| TikTok | Playlists exist, on-profile — but gated at ~10,000 followers |
| Instagram | Guides discontinued 15 Dec 2023 → converted to Collections, which are private saves and cannot be browsed from a profile. A Reels "Series" is in limited test. Pinned posts cap at 3 |
| YouTube | playlists, unrestricted |

So a creator who posts Korean and Japanese food has no public way to separate
them, and below 10k followers has no way at all. **That is the same mid-tail
`CREATOR-HUB-SPEC` §4 found unserved by Chicory, Instacart and Samsung**, and it
is unserved here by the platforms themselves.

**Grouping is topical, and the axis is cuisine.** `DECISIONS` §3 already holds
cuisine as data rather than code, so *Korean* and *Japanese* are derivable today.
Generated, then correctable — `DECISIONS` §5's rule again, never a blank field.
Creator-renamable, creator-orderable, one tap to hide.

**Not by ingredient.** Ingredient adjacency is §3's job and doing it twice would
put two mechanisms on one page competing for the same click. One axis here, one
module there.

**The gap above is temporary and we are taking it anyway.** Meta is testing
Series and TikTok's gate is a follower count creators age out of, so both rows
close on someone else's schedule. That is an argument about timing, not about
value: the grouping a creator sets up now persists after the platform ships its
own, and being the place it already exists is worth more than being right about
how long the window stays open.

**A collection is a view, not a graph write.** `CREATOR-SPEC` §4's fence holds:
renaming a collection on their own page touches nothing in the ontology.

TikTok playlist membership is **not** in the Display API's fields (§4), so
existing playlists cannot be mirrored. Derivation is the only route, which is
also the cheaper one.

Inherited without modification:

| | |
|---|---|
| `canonical` → the video/post | `RECIPE-SPEC` §1's link-out posture |
| ingredient lines, unresolved shown as unresolved | `CONTRIBUTION-SPEC` §4 |
| no counts below the floor `k` | `CREATOR-SPEC` §7, `RECIPE-SPEC` §9 |
| withdrawal takes the page down | `CREATOR-SPEC` §6 |
| thin-content guard applies | `UX-SPEC` §10 — and see §8 |

---

## 2. Four features, and each is a thing a caption cannot do

### 2a. Serving auto-adjust

Pure multiplication over whatever units the creator wrote. No density, no
ontology, no new data. Ships first because it costs nothing.

**It does not write anything.** `INGREDIENT-SPEC` §2 keeps `portion` *"recorded
and never matched on"*, and scaling is a display transform, not a stored fact.

### 2b. Creator-designated substitutes

The strongest of the four, and its value is not to the cook.

`DECISIONS` §513 settles substitution: **be strict, no fidelity scores, a curated
positive list only**, because *"every cuisine needs a native validator"* and a
scored long tail is unreviewable.

> **A creator is the native validator for their own recipe.** That is the
> cheapest high-quality substitution data available to us, and it arrives free
> with a claim.

Two fences, both inherited:

- **It writes `recipe.substitutes`, never the ontology.** `CREATOR-SPEC` §4 —
  *"do not ask creators to annotate the graph"* — and `CONTRIBUTION-SPEC` §3's
  identical rule for users. `QC-SPEC`'s benchmark stays the only path in.
- **The negative form matters more than the positive one.** §513's
  *"doubanjiang is not a substitute for doenjang"* is editorial value nobody else
  supplies, and a creator saying it about their own dish is authoritative in a
  way our mapper never is.

### 2c. Unit conversion — pure math only

Conversion **within a dimension**, and nothing else:

| | |
|---|---|
| volume ↔ volume | tsp · tbsp · cup · ml · fl oz |
| weight ↔ weight | oz · lb · g · kg |
| temperature | °F ↔ °C |

No data, no lookup, no per-ingredient anything. A display transform over the
units the creator wrote, exactly like §2a.

**Volume→weight is excluded, deliberately and not as a phase-one convenience.**
*"1 cup of flour in grams"* is not a conversion, it is a physical-property
lookup, and one cup of flour and one cup of gochujang do not weigh the same.
Supporting it would need a gram-per-cup value per ingredient, which
`INGREDIENT-SPEC` §4 forbids as a global attribute; `WEEE-SPEC` §7's ban on
reading pack size closes the only back door. **Do not add it by inferring a
density from anywhere.**

Where a creator themselves writes *"2 tbsp (30 g)"*, both figures are theirs and
both are displayed. That is the creator quoting their own recipe, not us
computing a conversion, and it needs no rule.

### 2d. Recirculation

§3.

---

## 3. Recirculation, and the guardrail that makes it safe

At the foot of a recipe: **more of this creator's videos that share these
ingredients.**

A cook holding gochujang, doenjang and anchovy stock is one ingredient away from
four other things this creator has already filmed. The ingredient graph is what
knows that, and no platform the creator is on can compute it.

> **This is the first time the ontology produces value on the supply side.** The
> 96.2% has always been a matching asset; here it is a distribution asset, and
> it is the only feature on the page that generates views rather than merely not
> destroying them.

### The number this whole spec is judged on

> **Outbound clicks to that creator's videos, per inbound visitor.** One visitor
> producing 1.5–2 additional plays of their back catalogue is the entire creator
> acquisition story, in a form a creator can check.

**Say clicks, never views.** We cannot measure a view: a tap out to TikTok or
Instagram reports nothing back, and there is no referrer inside either app. A
creator who is told "views" will look for the number in their own analytics, fail
to find it, and stop believing the rest. **A defensible 1.6 is worth more than an
unverifiable 2.0**, and this is the same discipline `CREATOR-SPEC` §7 already
applies in refusing to promise completion data we do not hold.

Below 1.0 the module is not earning its place and the offer in §5 is thinner than
we are claiming. It is the first thing to instrument and the last thing to argue
about.

**The guardrail is load-bearing:**

> **Creator-scoped first. Fall through to other creators only when the creator's
> own catalogue has nothing relevant, and label the fall-through.**

An unscoped "similar recipes" module routes a creator's audience to their
competitors, on a page they were persuaded to link to. That is the churn this
whole spec is designed around, arriving through the one feature meant to prevent
it.

**Deliberately passive.** Two stronger versions were designed and cut on
2026-08-12:

| cut | why |
|---|---|
| pantry-triggered push — *"you can make X tonight"* | needs a notification channel `DECISIONS` §11 still has open |
| leftover-driven — *"3 more recipes use that gochujang"* | needs consumption/quantity modelling that §8's set optimiser deliberately refused (*"volume-free… no quantity dependency"*) |

Both were better features. Both import a dependency already declined elsewhere,
and the on-page module needs neither.

---

## 4. Authoring: connect, then correct

**Never a blank form.** A creator who has to type a recipe into a form will open
a website instead, and they would be right to. `DECISIONS` §5's rule is already
the house rule and applies unchanged: *never show a blank field, always show a
guess to correct.*

They already wrote the ingredient list. It is in the caption.

```
1. connect         OAuth; their post list arrives — covers, captions, dates
2. parse           caption → ingredient lines, ONCE (§4a)
3. correct         unresolved lines in place, CONTRIBUTION-SPEC §4's surface
```

Step 1 is the whole onboarding, and their back catalogue becomes searchable
before they have typed anything. **There is no step 4**: the video is already
published, so nothing is waiting on us and nothing is waiting on them.

### 4a. Published only, and the caption is digested once

Two rules, and between them they delete most of the machinery an earlier draft of
this section described.

> **We only ever ingest a post that is already public.**

> **A caption is a seed for the draft list, never a synced field. Digest it
> exactly once. Retry only on error — fetch failure, API error, rate limit —
> never on an empty result.**

What the first rule buys: no draft objects, no private limbo, no stale-draft
expiry, no matching a submission to a later post, no time windows, no ambiguity
queue. The post *is* the row, so the join is identity rather than a score. It
also satisfies `CONTRIBUTION-SPEC` §5 by construction — *"a URL that is not
publicly fetchable never becomes a public row"* — with no test to run.

What the second buys: the parse is **idempotent**, so re-polling is a safe no-op
instead of something needing precedence logic. Instagram allows caption edits at
any time; without this rule a creator fixes their gochujang line here, edits a
hashtag next week, and watches a re-parse undo their work. We do not arbitrate
that conflict, we make it impossible. `CONTRIBUTION-SPEC` §3's monotonic
improvement holds: `annotated_by` moves parser → creator and never back.

**An empty parse is an answer, not a failure.** Some captions are a hook and
hashtags. That yields an empty draft, which is a legitimate state and is **not**
grounds for re-reading later — an outcome is not an error, and a retry keyed on
emptiness has no natural stopping point.

**But an empty draft must not render as a silent void.** It says what happened —
*no ingredient list found in this caption* — with the video present and the list
open. That is `DECISIONS` §5's never-a-blank-field at its limit and
`CONTRIBUTION-SPEC` §4's *"it is never presented as ready."* It is also the
honest prompt for the one thing only the creator can supply, which `CREATOR-SPEC`
§4 already names as the single ask.

### 4b. How a new post is found

One polling loop, doing double duty: it pages the whole history at connect time
to build the library, and afterwards picks up whatever is new. Store the platform
user id, the refresh or long-lived token, and a cursor for the last post already
seen.

Neither platform offers a usable webhook for a creator's own publishes — TikTok
has none, Instagram's are aimed at comments and mentions — so polling is the
mechanism. It is a schedule, not a daemon, and Instagram's ~200 calls/hour/account
is the reason.

> **Token expiry is a first-class state, because it fails silently and looks like
> neglect.** TikTok access tokens are short-lived behind a refresh token;
> Instagram's long-lived tokens need periodic refresh. If a refresh fails and
> nothing surfaces it, their new videos quietly stop appearing and they conclude
> the product is broken. Mark the connection stale, stop presenting the library as
> current, and say so.

**Two things this structurally cannot see:** posts that are not public — TikTok's
list returns the authenticated user's *public* videos — and anything published to
a platform they have not connected. Both land on the fallback below.

**The floor under all of it: let them paste a post URL by hand.** One field,
always available, no cleverness. Every automatic path here is a convenience over
that, which is what keeps an API change or a matching bug from being a dead end.

### What the official APIs actually give us

Read 2026-08-12. Both are **own-content only** — the creator authenticates and
authorises access to their own posts.

| | TikTok Display API | Instagram Login / Graph |
|---|---|---|
| scopes | `user.info.basic`, `video.list` | Business/Creator account |
| returns | id, title, **description**, duration, cover, share URL, embed | id, **caption**, `media_type`, `media_url`, permalink, thumbnail |
| arbitrary accounts | no | no |
| rate | — | ~200 calls/hour/account |

**This resolves a `DECISIONS` §11 open item in passing.** *"Instagram discovery
has no clean answer — hashtag browsing is login-gated"* is true of discovery and
irrelevant here: a creator authorising their own posts is a different problem
with a supported answer. It does **not** resolve the discovery question, and the
Apify/`yt-dlp` item stays open for the crawl.

**The caption is enough, and that is a consequence of §0.** We need ingredient
lines, not steps. Transcription, on-screen-text OCR and `media_url` fetching were
scoped out with the method — they exist to reconstruct instructions, and we do
not want instructions. `DECISIONS` §1137's *"build it cheaply (scrape ingredients
from the caption/description)"* is the right size and remains so.

**Where the caption has no ingredient list**, the creator supplies it. That is
the one thing we ask them to type, it is short, and `CREATOR-SPEC` §4 already
names it as the single ask on claim.

### 4c. Draft-first, considered and dropped

An earlier design had the creator paste their caption into us *before* publishing,
annotate it there, and receive a short URL to put in the caption. Recorded because
the argument for it was good and will recur.

It existed to solve one problem: the caption is written before the post exists, so
a per-recipe link cannot be in it. **That problem dissolved on measurement —
caption text is not clickable on either platform.** TikTok renders a URL in a
caption as plain text, and Instagram feed captions do the same, so the link a
creator would have pasted was never going to be tapped. The bio link is the
channel (§6), and one stable per-creator URL needs nothing at publish time.

It was dropped for a second reason that stands on its own: **expecting a creator
to annotate in the minutes around publishing is not realistic.** It also
reintroduced caption drift, since anything submitted pre-publish can be edited
afterwards.

The cost is real and worth naming: catching them mid-caption was the one moment
the annotation was free, and we give that up. Corrections now **batch** instead —
*"your last six videos have unresolved lines"* is one sitting rather than six
trips — and until `DECISIONS` §11's notification channel exists, freshness depends
on them opening the app at all.

### 4d. Creator mode, not a creator app

A separate creator application was considered and rejected. The reason is not
cost, though the cost is real — a second build, a second deploy, a second auth
path and app-store review, for what amounts to five screens, against
`BUSINESS-REVIEW` §6's one binding constraint, for a population currently at
zero.

The reason is that it would remove creators from the surface that motivates them.

> **A claimed creator edits their own recipe pages, in place, standing exactly
> where their audience stands. Creator mode adds affordances; it never changes
> the layout.**

`CONTRIBUTION-SPEC` §6's whole premise is a creator reacting to **seeing their own
recipe rendered wrong, in public**. That itch is visual and it lives on the page a
viewer lands on. A back-office trades the motive for tidiness. It also inverts
`CONTRIBUTION-SPEC` §4's deliberate design — unresolved lines sitting *in the
ingredient list where they obviously do not belong* — back into a form titled
"help us improve our data", which is the one framing that spec forbids.

**In place, on their own pages:** the unresolved lines (§4), substitute
designation (§2b), collection rename and order (§1). Each is one tap from the
thing it edits.

**One small settings surface** for the few things that are not per-recipe:
connection state including §4b's stale-token warning, `affiliate_tag`
(`CREATOR-SPEC` §1), and whatever of §5's report is above `k`.

**What creator mode must never become:**

- **A dashboard that replaces the page.** The page is the point.
- **A bulk-edit grid.** Faster per row, and it takes them out of the context that
  makes a wrong line obvious — which is the whole correction mechanism. Batching
  across *pages* (§4c) is fine; batching *out of* the page is not.
- **A different layout.** If what a creator sees differs from what a viewer sees,
  they are no longer checking the thing being published.

**The name survives the decision.** *JipBap for Creators* as a named surface costs
nothing and signals the same seriousness; as a separate codebase it costs
everything. Brand it, do not fork it.

### 4e. The share sheet, and the claim prompt in the corner

Half of this is already built: `manifest.ts` declares a `share_target` posting to
`/my-recipes` with `title`, `text` and `url`, and already handles Android's
inconsistency about which field carries the link.

**The default is the user path and stays there.** A shared post is added to *My
recipes* — `CONTRIBUTION-SPEC`'s paste flow arriving through a different door.
Most people sharing a cooking video are cooks.

**In the corner: *Are you the video's creator?*** This is the second inbound
acquisition path, alongside `CREATOR-SPEC` §2's creator-finds-their-own-dish, and
it costs nothing: it catches a creator at the one moment they are holding one of
their own videos.

> **Tapping it grants nothing.** It starts OAuth for the platform the post came
> from, and verification succeeds **only if the connected account is that post's
> author**. Nothing changes until it does.

Three rules follow, and each was nearly got wrong:

- **Never a self-declared yes.** `CREATOR-SPEC` §1 makes verification per-channel
  because *"impersonation across platforms is common enough that conflating them
  would make the ✓ badge a lie in exactly the case it exists for."* A checkbox
  here would be that lie.
- **The prompt is open to everyone, precisely because it grants nothing.** Showing
  it only to already-verified creators would remove the reason it exists — they
  would have had to find the creator path some other way first, which is the
  problem this is solving.
- **Nothing heavier than OAuth.** Manual review or ID checks spend
  `BUSINESS-REVIEW` §6's one constrained resource to defend against an attack
  OAuth already makes impossible. You cannot OAuth as somebody else.

**Not a separate account type.** `CREATOR-SPEC` §1 models this as a
`creator_member` link, put in empty on purpose: writer, filmer and brand owner are
often different people sharing one creator, and *"The Woks of Life is a
four-person family business and it is 26% of the current corpus."* A distinct
Creator login forces one person per creator and breaks that on day one. *Creator
account* is a fine label for the linked state; it is not a second kind of row.

**Frame the payoff as the catalogue, not the recipe.** "Claim this one" is a
chore. What §4b actually does on connect — the whole back catalogue arrives,
parsed, grouped by cuisine — is the onboarding, and it is worth a tap.

**`origin` stays `'user'` if they shared before claiming.**
`CONTRIBUTION-SPEC` §7: provenance is history and history is not editable. Their
confirmation moves `annotated_by` to `'creator'`, which is the part that matters.
Not a defect to be tidied later.

**The constraint that caps all of it: Web Share Target is Chromium/Android only.**
Safari has never shipped it, so an iPhone user cannot share into JipBap at all —
they copy the link and paste. US food audiences skew heavily iOS, so **the paste
flow must carry the same claim prompt**, and the share sheet should be treated as
the minority path until measured otherwise.

### Existing rules that apply unchanged

- **Canonicalise before the row exists** — `CONTRIBUTION-SPEC` §2. A creator
  connecting an account and a user pasting the same post must converge on one
  row, or the demand count fragments.
- **Per-channel verification** — `CREATOR-SPEC` §1. An OAuth connection *is* proof
  of control of that channel and should set `verified_at` on it, and on nothing
  else.
- **`origin` stays `'user'`** where a user pasted first. Provenance is history
  (`CONTRIBUTION-SPEC` §7).

---

## 5. The benefit ledger, stated honestly

What a creator gets, in full, with nothing rhetorical in it:

| | what it is worth |
|---|---|
| Recirculation into their own catalogue (§3) | views — the only item here that is |
| Their affiliate tag on their recipes | `DECISIONS` §8 tier 2, fired on the surface `CREATOR-HUB-SPEC` §1 adds |
| Demand-derived content briefs | *"62% who wanted this lacked doenjang; 34% swapped the anchovy stock"* — a brief no analytics product sells |
| One link that answers the comments | quantity, brand and substitution questions, answered without them typing |
| A searchable back catalogue, grouped | theirs and their audience's, from §4 step 1 — and per §1, the **only** public topical grouping an Instagram creator or a sub-10k TikTok creator can have |

**No cash, ever.** `DECISIONS` §8, §1107 and `CREATOR-SPEC` §4 all refuse payout
infrastructure, and `CREATOR-HUB-SPEC` §3 records why the ceiling makes it
pointless rather than merely unaffordable.

**And the ledger is thin. Say so internally.** Three of the five save labour
rather than make money, and the honest summary is that this is a good deal for a
creator with no blog and a poor one for a creator with a blog — who is right to
refuse, and whom Chicory already serves.

---

## 6. Sponsor slots — deferred, not rejected

A creator pinning a brand to an ingredient across every recipe at once is the
ingredient-centric hub's real payoff, and it is what makes a brand deal
*deliverable* rather than merely posted.

`DECISIONS` §8 already sequenced it: **per-ingredient seeding is v2** — *"no
creator will ask until they're already earning."* That sequencing is right and
this spec does not disturb it.

The objection worth recording, because it decides the shape when it does arrive:
**a creator already maintains sponsor links in their link-in-bio product, and a
second place to maintain is a cost, not a benefit.** So this only earns its place
if pinning is one tap on an ingredient they have already annotated — never a
second inventory. The function is not redundant (a directory a viewer must find,
versus placement at the moment of purchase intent); the *maintenance* would be.

---

## 7. What this deliberately does not do

- **No method, no steps, no summary of steps, no timestamped outline** (§0).
- **No push notifications** (§3).
- **No consumption or quantity modelling** (§3, `DECISIONS` §8).
- **No ontology writes from creators** (§2b, `CREATOR-SPEC` §4).
- **No volume→weight without a source for it** (§2c).
- **No unscoped similar-recipes module** (§3).
- **No third-party JavaScript on a creator's own site** — `DECISIONS` §1137's
  widget stays dropped.
- **No rasterised or image-rendered ingredient lists.** Proposed 2026-08-12 as
  anti-theft and rejected: OCR defeats it, it would destroy matching, shopping
  lists, scaling and the affiliate rail, and it protects the ingredient list —
  which carries no copyright — while structuring the method, which does. The
  defensible measures are a registered DMCA agent, being the fast canonical, and
  disallowing AI crawlers (`WEEE-SPEC` §2 notes Weee! does exactly this).

---

## 8. Open questions

- **Is an ingredients-only page above `UX-SPEC` §10's thin-content floor?**
  Eleven lines and no method is a thin artifact, and §3's module plus pantry
  matching are what make it a destination rather than a stub. If the module is
  empty — a creator's first recipe — the page is at its thinnest exactly when a
  new creator is deciding whether we are worth a link.
- **Where does volume→weight come from, if anywhere?** A curated gram-per-cup
  list over the ~50 ingredients that actually matter is tractable and is still a
  new attribute class on an ontology that `INGREDIENT-SPEC` §4 says has none.
  Creator-supplied grams (§2c) may cover enough of the real cases to make the
  question moot; measure before deciding.
- **Does recirculation need a floor?** A module showing one other video is worse
  than no module. Related to the thin-content question and probably the same
  threshold.
- **What does a content brief require to be publishable?** §5 sells percentages,
  and `CREATOR-SPEC` §7's floor `k` plus current volume means most of them are
  noise wearing a percentage's clothes. Which single number crosses `k` first
  decides what the first outreach can honestly say.
- **Does an OAuth connection alone constitute a claim?** It proves channel
  control, which is `CREATOR-SPEC` §5's identity question, but ownership of the
  indexed recipes is a separate question there. Probably auto-approves; state it
  rather than inferring it.
- **What happens to a creator who connects and then disconnects?** Not
  withdrawal (`CREATOR-SPEC` §6) and not nothing. The page presumably persists
  and stops refreshing, but that is a guess.
- **Is one grouping across a creator's platforms worth anything to them?**
  Structurally we are the only party who can build it — no platform will index a
  competitor's catalogue — but no creator benefit has been articulated, and most
  mid-tail creators cross-post the same content rather than running distinct
  catalogues. Parked deliberately: a durable advantage with no demand behind it
  yet.
- **Does the fall-through in §3 ever pay?** Showing another creator's video is
  the only mechanism that could make this a network rather than a set of
  isolated creator pages, and it is also the one that risks churn. Currently
  fenced shut; whether it should ever open is undecided.
