# Social Ingest

TikTok / Instagram → ingredient names. A **separate pipeline** from the blog ingest in `DECISIONS.md` §6, because social video has no JSON-LD and therefore shares none of its machinery.

**Status: dropped 2026-11-06, except §0 rank 1 (YouTube → blog → JSON-LD) and §2a (paste-time oEmbed).** No TikTok/Instagram crawling, no caption extraction, no transcript/OCR/vision tiers, no social holdout. Reasons in `DECISIONS.md` §10. The rest of this document is kept as the record of what was measured and why it was rejected — not as a plan.

---

## 0. Source priority — measured, not assumed

**Tested 2026-07-29 with `yt-dlp` 2026.07.04. These are real numbers from real accounts, not estimates.**

| Rank | Source | Why |
|---|---|---|
| **1** | **YouTube → creator's blog → JSON-LD** | Clean structured ingredients *with* quantities. Reuses the §6 blog pipeline entirely. Legitimate API. No NLP, no vocabulary loop, no negation problem |
| **2** | Blogs direct | Same pipeline, already planned |
| **3** | Instagram | Captions are markedly better than TikTok's — creators write recipes out. But discovery is login-gated and extraction risks the account |
| **4** | TikTok | **~2% caption yield.** Near-zero cost though, so a wide-net harvest once the above work |

**This inverts the original plan**, which treated TikTok as the primary target. It is the weakest of the four.

### TikTok caption yield — n=130 across 4 food accounts

| Account | n | Mean chars | Usable (≥3 qty tokens or `Recipe:` marker) |
|---|---|---|---|
| `cookingwithlynja` | 40 | 58 | 0 |
| `chefchrischo` | 40 | 86 | 1 |
| `thekoreanvegan` | 25 | 92 | 1 |
| `aaron_and_claire` | 25 | 64 | 0 |
| **Total** | **130** | | **2 — 2%** |

**Zero captions were list-shaped.** TikTok captions are single-line. Where a recipe *does* appear it's inline with abbreviated units — `3T Greek yogurt 1T soy sauce 1T apple vinegar 1/2T fish sauce`. **Any detector must handle `3T` / `1t` / `1/2T`, not just `tbsp`/`tsp`** — a spelled-out-units regex scores this caption as having no quantities at all. That mistake was made and caught during measurement; don't repeat it.

**The 2% is not automatically fatal.** Cost is ~1 request per 40 videos at ~5s, so 100k videos is an afternoon and yields ~2,000 recipes — and §6 targets 1,000–2,000 total. Low yield × trivial cost ≠ worthless. It is, however, clearly worse per unit of effort than YouTube→blog, hence rank 4.

**Caveat on the sample:** 4 accounts, skewed to short-form entertainment creators. 2% is far enough below useful that a larger sample would have to differ wildly to change the ranking, but the number itself should be re-measured before sizing a real crawl.

---

## 0a. The source layer is replaceable, and that is a constraint

> **The asset is recipe identity, the ingredient graph, pantry matching and
> community knowledge. It is not a TikTok database.**

Stated as a constraint because we already behave this way and nothing currently
stops a change from violating it. Every platform in §0 is rented: APIs close,
posts are deleted, URLs break, and a creator can withdraw (`CREATOR-SPEC` §6).
A pipeline that quietly grows a dependency on one of them converts all of that
from an ingest problem into a product outage.

Three rules that follow, all of which the current design already satisfies:

- **Nothing downstream of ingest may key off a platform id.** `rec_` ids are ours
  and permanent (`RECIPE-SPEC` §2); a TikTok video id is a `source_url`, which
  §1 already says *"may change; never a key"*.
- **Losing a source must cost recipes, never structure.** The ontology, the alias
  harvest (§4b) and the substitution table survive a platform's disappearance —
  the same rule `CREATOR-SPEC` §6.2 applies to a withdrawing creator, for the
  same reason: those facts are about ingredients, not about the source.
- **A new source is a config entry plus a set of line rules**, not a schema
  change. If adding one requires touching the entity specs, the coupling this
  section forbids has already happened.

The test is simple and worth running before any ingest work: **if this platform
vanished tomorrow, what in `data/ontology/` would be wrong?** The answer must be
nothing.

---

## 1. What we extract

**Ingredient names. No quantities, no steps, no prose.**

Consequences, all of them good:

| Because we only need names | We avoid |
|---|---|
| No quantity parsing | Ranges, fractions, "1 large onion", "1 cup (250ml)", "salt to taste" |
| No unit normalization | **The per-ingredient density table.** A cup of flour ≠ a cup of honey — and we'd never use the numbers anyway (§3: boolean presence) |
| No structured list required | Captions don't have to *be* lists. Rambling prose and speech both work |
| Nothing copyrightable retained | Bare ingredient lists are facts (§6) |

**Do not build unit normalization.** It's advised by the general literature on recipe scraping and it is wasted work here — the recommender is boolean, so a gram value has no consumer.

---

## 2. Discovery — crawl by account, not by hashtag

**`#recipe` is a seeding strategy, not a filter.** It fails in both directions: recall (recipe videos tag `#food`, `#easydinner`, `#mealprep`, cuisine tags, or just `#fyp` — and the best accounts often don't tag at all), and precision (bolted onto non-recipe content for reach, plus "recipe for disaster" noise).

**The decisive argument:** our own ingredient-count test is a *better* recipe classifier than the hashtag is. "Contains ≥3 discriminative ingredients" nearly measures recipe-ness directly; the hashtag is a noisy proxy for it. Don't spend recall on the proxy — crawl broad, let the classifier decide.

**So: identify a few hundred recipe accounts and take their back catalogues.** Hit rate approaches 100% (that's all those accounts post), thousands of videos per account, and it sidesteps Instagram's hashtag problem entirely. Seed the account list with one `#recipe` pass plus collab/tag graph — recipe creators cluster socially, so a small seed snowballs.

**Measurement confirmed this is also the cheap path.** `--flat-playlist` against an account page returns full metadata for a page of videos in a single request — 40 videos in ~5s — with no per-video fetches. Account-crawling is not just higher-precision than tag-crawling, it's an order of magnitude fewer requests. See §3 for the mandatory backoff flag.

This also aligns with §8: accounts are how creator partnerships get sourced anyway.

### A third discovery channel: user submissions

From Phase C there is a channel neither crawling nor tagging can match —
**users pasting URLs of videos they want to cook** (DECISIONS §8). Its properties
are different from a crawl's in the ways that matter here:

| | Account crawl | User submission |
|---|---|---|
| Volume | Thousands per account | Trickle |
| Precision | ~100% recipe content | ~100%, *and* wanted by a named person |
| Ordering | Ours to choose | **Ranked by demand, for free** |
| Extraction | Must be automatic to be worth it | Hand-parsing is justified — someone is waiting |

**The consequence for this document: the ~2% TikTok caption yield stops being
disqualifying for submitted videos.** §0 ranks TikTok last because low yield times
high volume is a bad trade — you cannot hand-rescue thousands of videos. A video
with 84 people waiting is worth opening by hand, watching, and transcribing.
Measured yield still governs the *crawl*; it does not govern the queue.

Submissions do not change source priority, and they are not a reason to build
transcript or OCR tiers. They are a reason to keep the manual path open longer
than the crawl economics alone would suggest.

---

## 2a. Paste-time metadata — the confirmation, not the extraction

**Two different operations happen to a submitted URL, on two different clocks,
and conflating them is the mistake this section exists to prevent.**

| | Paste-time | Extraction |
|---|---|---|
| Question answered | *"Is this the video you meant?"* | *"What ingredients are in it?"* |
| Budget | Sub-second, synchronous | Async, up to days (§2 — hand-parsing is justified) |
| Output | Thumbnail, caption, author | `requires[]` |
| Failure | Submission still succeeds | Video drops out of the queue |

The user pasting a URL needs one thing back immediately: visual proof we got the
right video. That is a metadata fetch, not an ingest. **Nothing in this section
touches ingredient extraction**, and the queue must never wait on it.

### oEmbed, not scraping

Every platform publishes an endpoint returning title, thumbnail and author in a
single request — no HTML parsing, no yt-dlp, none of §3's fragility.

| Platform | Endpoint | Auth | Verdict |
|---|---|---|---|
| **YouTube** | `youtube.com/oembed?url=…&format=json` | None | **Works.** Stable for years |
| **TikTok** | `tiktok.com/oembed?url=…` | None | **Works, with a shelf life.** Expect payload churn (§3) |
| **Instagram** | Facebook oEmbed Read | **App token + review** | **No clean path** — same conclusion DECISIONS §11 reached from the discovery side |

YouTube has a free shortcut: thumbnails sit at a predictable path off the video
id, so a card can render before the oEmbed request returns.

Instagram falls back to `og:` tags through the existing extractor
(`src/ingest/extractors.ts`), which works on public posts and fails on
login-gated ones. That is acceptable because of the fail-open rule below, and
because submissions are a demand signal rather than a volume play — **an
Instagram submission with no thumbnail still carries its whole value.**

> **Unverified.** All three endpoints are assumed, not tested — the same status
> as the yt-dlp residential-IP question in DECISIONS §11. Check with three real
> URLs before building against this table.

### The caption is not a title, and must never become one

§0 measured what these strings actually look like: `POV: the best pasta ever 🍝
#fyp`. oEmbed returns that in a field called `title`, which is an invitation to
write it straight into `recipe.title`.

**Don't.** The oEmbed string is a confirmation affordance with a lifespan of one
screen. `recipe.title` is set during curation, from the dish. Promoting the
caption would fill the corpus with emoji, hashtags and engagement bait, and it
would do so silently — every row would look populated.

Store it, if at all, as submission metadata that curation reads and discards.

### Thumbnails follow `RECIPE-SPEC` §1a, and social makes the case harder

Same rule as blog thumbnails: **derive a resized copy, never store the original,
revalidate.** Social adds an argument blogs did not have — **TikTok and Instagram
CDN thumbnail URLs are signed and expire**, often within days. A hotlinked social
thumbnail is not at risk of dying; it is *scheduled* to. Deriving at submission
makes the expiry irrelevant.

This cuts the other way for revalidation: a 403 on an expired signed URL is not a
takedown and must not be treated as one. §1a deletes the derivative on 403 — that
rule is written for blog origins. **For social sources, expiry and withdrawal look
identical over HTTP**, and the distinction has to come from the post still
existing, not from the CDN response. Open below.

### Canonicalise before dedupe, or the demand counter is a lie

The table in §2 claims submissions come *"ranked by demand, for free."* That is
true only if the same video submitted by eighty-four people collapses to one row.

It does not collapse on its own:

- `vm.tiktok.com` short links vs the resolved `@user/video/<id>` form
- `youtu.be/<id>` vs `watch?v=<id>` vs `/shorts/<id>`, plus `&t=`
- Instagram `/reel/` vs `/p/` for the same post
- Tracking params on all of the above

**Normalise to a platform-agnostic canonical form before the dedupe key is
computed.** Skip it and the demand board (`UX-SPEC` §11) shows eighty-four
requests of one instead of one request by eighty-four — which inverts the ranking
it exists to produce, while looking like it works.

Per §0a, the canonical form is a `source_url`, never a key. The dedupe key is
derived from it; `rec_` ids stay ours.

### Two rules that are easy to leave out

**Fail open.** oEmbed 404, timeout, private post, rate limit — **the submission
still succeeds, with no thumbnail.** A request is a count (`UX-SPEC` §11), and
losing a demand signal because a CDN was slow is the one outcome with no upside.
Metadata is decoration on a record whose value is that somebody asked.

**Allowlist the hosts.** A user-supplied URL that our server fetches is an SSRF
hole pointed at our own network. Fetch only hosts on an explicit list — which
§0a already wants, since a new source is *"a config entry plus a set of line
rules."*

### Open

- **Verify the three endpoints** against real URLs. The Instagram row is a
  conclusion; the other two are assumptions.
- **Distinguishing expiry from withdrawal on social CDNs.** §1a's revalidation
  deletes on 403, which is right for blogs and wrong for signed URLs that expire
  by design. Probably means re-resolving through oEmbed rather than HEADing the
  CDN — but that is a guess until the first thumbnail expires.

---

## 3. Platform reality

**TikTok — the tooling works. The content mostly isn't there (§0).**

`--flat-playlist` on an account page is the efficient call. It returns caption, hashtags, view/like/comment/save counts, timestamp, duration, uploader and thumbnails for a whole page of videos **in one request, without touching individual video pages** — 40 videos in ~5s, verified.

```bash
yt-dlp --flat-playlist --dump-json --playlist-end 40 \
       --sleep-requests 3 "https://www.tiktok.com/@<account>"
```

**`--sleep-requests` is mandatory, not politeness.** Verified failure: the same command without it returned **1** video for an account that has hundreds. It does **not** error — pagination silently stops. Crawl without backoff and you will conclude that accounts are nearly empty and never know why.

**yt-dlp cannot extract TikTok comments.** Verified: `comment_count: 10`, `comments: []`. Comments are the one place creators reliably park full recipes, so this closes TikTok's cheapest path to better yield. Getting them needs Apify or custom work — priced against a 2% baseline, not against zero.

Single-video extraction works fine (`--dump-json` on a real video URL). The extractor does break when TikTok changes its web payload — run `yt-dlp -U` often, expect to pin a known-good version.

**YouTube — the best source, and the one both source threads ignored.**

Three reasons, in increasing order of importance:

1. **A legitimate API exists.** YouTube Data API v3, free tier ~10,000 units/day. `playlistItems.list` costs 1 unit and returns up to 50 items, so a channel's whole back catalogue is ~1 unit per 50 videos — on the order of hundreds of thousands of records/day within the free quota. **No scraping, no ToS violation, no throwaway account, no extractor that breaks.** A categorically better posture than TikTok or Instagram. (Re-check quotas in the console; Google adjusts them.)
2. **Descriptions are long-form.** The opposite of TikTok's ~60 characters. Recipe channels routinely write the full ingredient list out.
3. **Auto-captions are a free transcript** via `--write-auto-subs` — no Whisper. Note the split: the official API **cannot** give you captions (`captions.download` requires the channel owner's OAuth), so this tier is scraping-only. Don't plan the API path around it.

### The actual play: use YouTube to find blogs, not to extract recipes

**Maangchi, Korean Bapsang, Just One Cookbook, The Woks of Life** are all already named as corpus sources in `DECISIONS.md` §3/§6 — and all are YouTube creators whose video descriptions link to their own blog, which publishes `schema.org/Recipe` JSON-LD.

```
YouTube channel → video description → blog URL → §6 JSON-LD pipeline
```

That gets clean ingredient lists **with quantities**, reuses the deterministic pipeline already planned, and needs none of §5's vocabulary bootstrap, §6's negation handling, or any LLM verification pass. Videos with no blog link are dropped.

**This is why YouTube ranks first (§0):** it is the only source that feeds the *good* pipeline instead of requiring a second one.

**Untested here:** this machine has a datacenter IP and YouTube returns *"Sign in to confirm you're not a bot"* for yt-dlp. It normally works from a residential IP. Verify before planning around it:

```bash
yt-dlp --flat-playlist --dump-json --playlist-end 20 \
       "https://www.youtube.com/@Maangchi/videos"
```

**Instagram — genuinely hard. Set expectations low.**

| Problem | Reality |
|---|---|
| Official API | Basic Display shut down Dec 2024. Graph API covers only Business/Creator accounts *you own*, 200 calls/hr, app review required. Useless for us |
| **Discovery** | Hashtag and keyword browsing are login-gated. No public hashtag endpoint. Workaround: Google, since posts are indexed — `site:instagram.com/reel/ chicken recipe` |
| Extraction | `yt-dlp` / `gallery-dl` work but need browser cookies. **A logged-in account doing automated requests is the account most likely to get actioned — use a throwaway** |

**Hosted alternative if maintenance cost exceeds patience:** Apify (~$1.50/1,000 results, dedicated reel/comment/hashtag actors), Bright Data, HikerAPI. They absorb blocking and fingerprinting, which is most of the actual work. Worth costing against solo-dev hours before committing to self-hosting.

---

## 4. Extraction tiers

**The gotcha that sinks recipe-scraping projects: the caption often isn't the recipe.** On TikTok especially it's frequently `POV: the best pasta you'll ever make 🍝 #fyp`, with the real content in on-screen text, a pinned comment, or spoken aloud. Instagram captions are markedly better — creators there do write recipes out — but inconsistently.

Because we need names only (§1), all of these are usable input. **Concatenate everything available into one text blob per video and match against it:**

| Tier | Source | Phase |
|---|---|---|
| 1 | **Blog link in the description** → §6 JSON-LD | **C — the primary path.** YouTube especially |
| 2 | Caption / description text | C |
| 3 | Hashtags | C |
| 4 | YouTube auto-captions | Later — free, but scraping-only |
| 5 | Audio transcript (Whisper) on TikTok/IG | Later |
| 6 | On-screen text (frame sample → OCR or vision model) | Later |
| — | ~~Pinned / top comments~~ | **Cut — yt-dlp can't extract TikTok comments (§3)** |

**Tier 1 is new and it reorders everything.** Following the creator's own blog link converts a hard extraction problem into the deterministic pipeline we already have. Try it before parsing any caption.

**Hashtags disappointed in measurement.** The claim was that `#gochujang #koreanfood` are pre-normalized high-precision tokens. True in principle — but only 8 of 40 Lynja videos carried hashtags at all, and those were brand tags (`#shopwithgoogle`). Keep the tier, drop the expectation.

**Tiers 4–6 stay unbuilt in Phase C.** Names-only extraction means we can afford to be lossy: drop any video that doesn't yield a confident ingredient set and move on. Add them only if measured yield (§7) is too low to be useful — and note that on TikTok the measured baseline is already 2% (§0), so "too low" is the expected starting state there.

**Precision over recall, always.** A wrong ingredient list produces a broken dish and an invisible loss of trust (§4, substitution strictness — same principle). A missing video costs nothing.

---

## 5. Vocabulary — the actual problem

With quantities gone, this stops being a parsing problem and becomes a **matching** problem. The controlled vocabulary is the whole system.

### Sources and licences

| Source | Licence | Verdict |
|---|---|---|
| **USDA FoodData Central** | CC0 1.0 | Clean. Broad but skewed to branded/packaged foods; cooking names are awkward |
| **FoodOn** | CC-BY 4.0 | Clean with attribution. Good for produce/meat/dairy hierarchy. **Zero Asian coverage** (§3) |
| **Open Food Facts taxonomy** | **ODbL — share-alike** | ⚠️ Best synonym handling of the three, but share-alike attaches to derived databases. Our SEO pages arguably publish a derived view. **Avoid for the vocabulary spine** until someone reads the licence properly |
| **Our corpus** | Ours | The real source — see the bootstrap loop |

Seed from USDA/FoodOn and **prune hard**. These carry "modified corn starch"-type industrial terms that never appear in a TikTok, and lack most of what does.

### Granularity is per-family, not global

**The one rule that matters, and the received advice gets it wrong.** General guidance says pick a single granularity for the use case — coarse for pantry matching, since nobody cares thigh vs. breast. Applied globally that would destroy the moat: it collapses the seven soy sauces (§3).

**Rule: split where the distinction changes the dish. Collapse where it doesn't.**

| Split | Collapse |
|---|---|
| `ganjang.guk` vs `soy_sauce.light` vs `soy_sauce.dark` | `chicken.thigh` ≈ `chicken.breast` for matching |
| `gochugaru` vs crushed red pepper | `scallion` = `green onion` = `spring onion` |
| `vinegar.rice` vs distilled white | Onion colours, unless a recipe is specific |
| `oil.sesame` vs `oil.perilla` | Brand variants |

This is already the shape of `ONTOLOGY-SEED.md` — the *not-substitutions* table **is** the split list, and the *substitutions* table is the collapse list. No new artifact needed; the vocabulary inherits both.

**Note we do not need allergen hierarchy** (`soy_sauce` inherits `soy` + `wheat`). That's the use case that forces fine-grained modelling everywhere, and it isn't in the product.

### The bootstrap loop

Vocabulary mining **cannot be a preprocessing step** — you need a corpus to mine from and vocabulary to build the corpus. It's a loop:

1. Seed from USDA / FoodOn + `ONTOLOGY-SEED.md`
2. Run over a broad sample at a deliberately **loose** threshold
3. Mine unmatched n-grams **from documents already scored high-confidence-recipe**
4. Review by hand, promote real ingredients, record synonyms
5. Re-run over everything

Two or three iterations converges. **Step 3's restriction is what makes it work** — unknown terms inside a confident recipe are probably ingredients; mining the whole corpus just surfaces generic slang.

This is the same principle as the corpus-first ordering in `BUILD.md`, applied to social text instead of blog JSON-LD.

**Mine by syntactic slot, not embedding similarity.** Embedding neighbourhoods are a trap: the nearest neighbours of `chicken` include `chicken coop`, `rotisserie`, `delicious`, `Nando's`. Embeddings encode topical relatedness, not *is-an-ingredient*. What discriminates is **position** — terms appearing where known ingredients appear:

- after `add the ___`, `throw in some ___`
- after a quantity+unit: `2 tbsp of ___`
- at the start of a bulleted or line-broken item
- adjacent to an already-confirmed ingredient

Rank candidates by corpus frequency and review the top ~2,000 by hand. That's a couple of afternoons and beats any unsupervised clustering.

**This loop is where `gochujang`, `kewpie`, `tajin`, `maggi`, `everything bagel seasoning` come from.** USDA and FoodOn have none of them — which is the §3 point restated: the public vocabularies are missing exactly the ingredients that matter to us.

---

## 6. False positives — the real failure mode

Not missed ingredients. Matching bare names against free text over-fires:

| Failure | Example |
|---|---|
| **Negation** — the frequent one | "no dairy, no refined sugar", "skip the anchovies" |
| Simile / flavour talk | "tastes like caramel", "cheesy without any cheese" |
| Substitution mentions | "use butter instead of oil" → yields both |
| Unrelated context | "$4 at the corn store", a dog named Basil |

**Fix: one short LLM verification pass over the candidate list against the source text** — *"which of these are actually used?"* Only a handful of candidates per video, so it's affordable. A dependency-parse negation-scope check is the cheaper alternative if cost becomes real.

**Store the evidence span for every match** — which tier it came from and the triggering snippet. Costs nothing, and turns matcher debugging from guesswork into inspection. Also feeds the crowd-correction UI (`UX-SPEC` §7): showing *why* we think a recipe needs gochujang makes a correction one tap instead of a report.

### Stopword ingredients

`salt`, `pepper`, `oil`, `water`, `butter`, `sugar` appear in nearly every food video including non-recipes. **Weight them near zero in the recipe-detection threshold** and require a minimum of *discriminative* ingredients — a protein, a produce item, a named condiment. Otherwise "I put salt and pepper on my fries" scores as a recipe.

Note these are largely the same items as the first-run **starter list** (§3) — high-presence, low-information. The overlap is not a coincidence; it's the same property viewed from two directions.

---

## 7. Measurement — before any tuning

**Hand-label a holdout of 300–500 videos, sampled exactly the way the real pipeline samples, marked recipe/not-recipe with ingredients written out. Do it before tuning anything.**

**Why this is not optional: recall is invisible without it.** You cannot see what a filter discarded by inspecting what it kept — and a two-stage filter is exactly the architecture that hides its own misses. Tune without a holdout and you tune against your intuitions about the data instead of the data.

**This is a second, separate artifact from the mapping benchmark** in `BUILD.md` Phase B:

| Artifact | Tests | Unit |
|---|---|---|
| Mapping benchmark (200 strings) | Does a string map to the right canonical ID? | Ingredient string |
| **Social holdout (300–500 videos)** | Is this a recipe, and did we get its ingredients? | Video |

Both exist for the same reason and neither substitutes for the other. Pick the accuracy bar before looking at results.

---

## 8. Legal posture

Consistent with `DECISIONS.md` §6 — **link out, never host.** Additional notes specific to social:

**Scraping public logged-out data is not a CFAA violation** — *Meta v. Bright Data* (N.D. Cal., Jan 2024), consistent with the Ninth Circuit in *hiQ v. LinkedIn*. **But that's criminal liability, not contract:** both platforms' ToS prohibit automated collection and they can ban accounts and IPs regardless. Plan for account loss, not for permission.

**What we retain is clean.** A set of ingredient names is a list of common nouns — no protectable expression in "garlic, soy sauce, scallion" under any theory. Bare ingredient lists aren't copyrightable in the US (Copyright Office Circular 33; *Publications International v. Meredith*, 1996). The creator's prose caption **is** protectable — so it is an input to extraction and never stored or displayed.

Canada applies a "skill and judgment" threshold (*CCH v. Law Society*) rather than the US originality test; a bare list would very likely fail there too.

**Not legal advice.** Get a real opinion before republishing anything at scale. The link-out architecture (§6) is what keeps this posture defensible, and it is the reason not to relax it for social.
