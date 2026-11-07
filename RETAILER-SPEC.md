# Retailers — one ingredient, many places to buy it

Companion to `RESOLUTION-SPEC.md` (which *identity* a mention means) and
`ATTRIBUTION-SPEC.md` (how a click is recorded). This file specifies what
happens **between** them: an ingredient line has resolved to a node, we have
decided it is worth offering to deliver, and now something must choose *whose
shelf* to point at.

Today that choice does not exist — `lib/weee.ts` is the answer and the question
at once. This spec is the refactor that turns the answer into one row in a
table.

Drafted 2026-08-17 after the grocer sweep (see `BUSINESS-REVIEW.md` §10 and the
distribution notes). Open questions marked `OPEN`.

---

## 0. Why now, and why not sooner

The sweep that prompted this found four affiliate programmes in the whole Asian
grocery category that survive contact — SFMart (US, organic pantry), Discovery
Japan (JP, long tail), WaNaHong (UK), Umall (AU) — plus Instacart covering US
and Canada with a purpose-built recipe API, and Weee! covering the US with the
deepest Asian catalogue and the worst attribution window.

None of that is a reason to integrate five retailers. It is a reason to stop
having *one* hard-coded, for a plainer motive than revenue:

> **The founder is in Metro Vancouver and Weee! does not deliver there.**

The product currently cannot offer a buy link to the person building it. That is
the bug this spec fixes. Revenue is downstream and, at present scale, rounding
error either way.

## 1. The rule

> **A retailer is a row, not a module. The product knows about *shelves*,
> *offers* and *regions*; it never knows about Weee!.**

Corollary, and the load-bearing half: **adding a retailer must not require
touching a page component.** If a second retailer means editing `list/page.tsx`,
the abstraction is in the wrong place and this spec has failed.

## 2. The entities

### `Retailer`

```
id         "weee" | "instacart" | "sfmart" | …   the ATTRIBUTION-SPEC §80 dimension
label      "Weee!"                                modal copy, user-facing
hosts      Set<string>                            feeds /go's allowlist
regions    Set<Region>                            where it can actually deliver
tag        env var name                           absent → working untagged link
perk       env var name                           absent → no perk line
urlFor     (node) → Url | null                    shelf, else search, else null
productsFor(node, limit) → Product[]              may be empty; empty is fine
imageFor   (productId) → path | null              cached thumbnails, may be none
```

`id` already exists as an event dimension — `ATTRIBUTION-SPEC.md` §80 writes it
`weee | amazon | …`, and §c ("Cross-retailer comparison — free once there are
two") was written in anticipation of exactly this. **No event schema change is
required**, which is the strongest evidence the seam was cut in the right place.

`hosts` is the only security-relevant field. `/go`'s allowlist becomes the union
of every registered retailer's hosts, derived rather than typed, so a retailer
cannot be added to the registry and forgotten in the guard.

### `Offer`

What a surface renders. Already shaped correctly in `components/affiliate.tsx`
as `AffiliateOffer` — it gains one field:

```
retailer   Retailer   which one this offer is from
```

The modal's hard-coded `<p className="ask-eyebrow">on Weee!</p>` becomes
`on {offer.retailer.label}`. That is the entire copy change, and it is the
reason `label` exists as data rather than being derived from `id`.

## 3. Region — the open crux

Everything above is mechanical. This is the part that needs settling.

`PRIVACY-SPEC.md` §80 already flags it: *"Region buckets, if they exist at all,
are the weak point."* So the design constraint is not "how do we detect region"
but **how little region can we know and still send someone somewhere real**.

Three candidates:

| | mechanism | cost |
|---|---|---|
| **a** | IP geolocation at render | a location inference on every visitor, server-side, for a feature most never use. Contradicts §80 |
| **b** | Ask at onboarding | spends inventory-friction budget, the #1 risk per `RESOLUTION-SPEC` §6 — and asks everyone to pay for a question only buyers need answered |
| **c** | **Ask inside the modal, remember on device** | costs nothing until the moment someone has already chosen to shop; never leaves the device |

`OPEN` — **recommended: (c)**, for a reason the existing architecture hands us.
`UX-SPEC` §5 already confines the affiliate to *inside the modal only, never on
the results*. The modal is therefore the one surface where a retailer choice is
in scope, it is opened by an explicit act, and the device already holds a capped
list (`click-ids` in `localStorage`, `ATTRIBUTION-SPEC` §7). A retailer
preference is the same kind of fact stored the same way, and the server learns
nothing.

The cost of (c) is that the **server does not know the retailer at render
time**, so it cannot pick one URL. Two ways to live with that:

- **c1** — server emits candidate offers for every retailer; client shows the
  chosen one. Costs page weight proportional to retailer count. Honest, simple,
  and at 2–4 retailers the weight is trivial.
- **c2** — server renders a configured default (`DEFAULT_RETAILER` env); the
  client swaps the href on mount if a different choice is held. Costs a flash
  of the wrong label.

`OPEN` — c1 vs c2. c1 is cleaner and c2 is cheaper; the deciding fact is how
many retailers ship at once, which §8 says is **one** for now, which makes the
question deferrable rather than urgent.

**Not open:** a region with no retailer renders **no link**. That is
`weee.ts`'s existing posture — *"a link that lands somewhere useless is worse
than no link: it spends the one moment the user was willing to click"* — and it
is the same honest default as the empty `assetlinks.json`.

## 4. What `hardToFind` must stop doing

`hardToFind(name, kind)` currently answers "is this worth offering to deliver"
by pulling a shelf code out of a **Weee! URL** and looking it up in
`data/decisions/weee-hard-to-find.csv`.

The judgment is right and the plumbing is wrong. Read §4h's own reasoning: the
rule is *findability* — *"nobody needs help buying butter; doenjang is worth the
help whoever is shopping."* That is a claim about **a mainstream grocery near
the shopper**, not about Weee!'s taxonomy. Keyed on Weee shelf codes it cannot
answer the question for a shopper in Vancouver, and it silently returns `false`
(no shelf → no claim) for every retailer that is not Weee!.

So it moves:

```
hardToFind(node, kind)   →  reads OUR node/kind, not a retailer's shelf
```

The existing `NEVER_LINK_KIND` veto and `ALWAYS_LINK` list already work this way
— they are our data, deliberately, and `weee.ts`'s own comment says why: *"it is
OUR data, wrong in ways we can fix rather than ways we inherit."* The shelf-code
path is the last piece that is not.

`OPEN` — whether findability is market-specific enough to need a per-region
list. Prior: **no, one list**. `ALWAYS_LINK` is a claim about which greens a
Western supermarket stocks, and Vancouver and Seattle do not differ enough to
justify two lists before there is evidence they do. Revisit if a UK or AU
retailer ever ships.

### What the migration exposed

The shelf-level marking was coarse in a way only a per-node file makes visible.
`data/decisions/hard-to-find.csv` carries each row's inherited `why`, and some
of them now read as self-refuting:

```
all-purpose flour,yes,…,sweet potato starch and glutinous rice flour are the ones that send you looking
baking powder,yes,…,sweet potato starch and glutinous rice flour are the ones that send you looking
baking soda,yes,…,sweet potato starch and glutinous rice flour are the ones that send you looking
```

Nobody needs help buying baking soda; those rows inherited a reason about a
different ingredient on the same shelf. **This is a review queue, not a bug** —
the migration was deliberately behaviour-preserving, and the whole value of
owning the marking is that these are now one-line fixes instead of an argument
about a retailer's taxonomy.

`OPEN` — a review pass over the 212 rows. Expect the count to fall.

### Loose coupling left behind

`src/ingest/weee-product-images.ts` still selects what to fetch from the
**shelf** file. Harmless while both answers are 212, and guaranteed to diverge
the first time a row above is fixed — the image cache would hold thumbnails for
things the app no longer offers, and miss ones it does.

Two separate fixes, both deferred because changing a crawler's target set is an
outward-facing act and wants a deliberate decision:

1. Point it at the products `weeeProductsFor` would actually return for each
   marked node, which is both aligned and narrower.
2. It builds its shelf set from **every row** in `weee-hard-to-find.csv` rather
   than filtering `hard_to_find=yes` — all 76 shelves, not the 27 marked. That
   is roughly triple the intended crawl and contradicts the script's own
   "fetching all 2,700 rows would be crawling for crawling's sake." Pre-existing;
   unrelated to this refactor.

## 5. The resolution seam — specified, not yet wired

`RESOLUTION-SPEC.md` §4 is unambiguous about commerce:

> link from the leaf, `cuisine-default` tier or better; **`unknown` → no link**.
> A missing affiliate row is cheaper than a wrong bottle.

The code does not do this. `weeeUrlFor(name: string)` takes a **display name**,
has no access to a node id or a resolution tier, and its final fallback is
always a site search — so an `unknown` line produces a search link for whatever
string it happens to hold. The strict-linking rule is currently a document.

### Revised 2026-08-17 — there is no `unknown` tier

The gate above was drafted from `RESOLUTION-SPEC` §5's ladder, which lists
`unknown` as "no table row applies → no affiliate link". **The implementation
does not work that way**, and the difference matters enough to retire the rule
rather than reword it.

`resolution.ts` types the tier as `curated | explicit | cuisine-default` and
returns `undefined` for a node no row covers — which is the overwhelmingly
common and entirely healthy case. `garlic`, `doenjang` and `beef rib eye` need
no resolution; they are not *unknown*, they are *unambiguous*. Gating on
`undefined → no link` would have stripped the link from 47,493 of 48,890
required lines to protect against a problem four table rows describe.

So the commerce rule is not a gate at all. It is a **substitution**:

```
link from the stamped leaf where one exists, else from the written name
```

Ambiguity that genuinely cannot be resolved does not reach here — it is held by
*slots* (§2 of `RESOLUTION-SPEC`), where the annotator must pick and there is no
default to be wrong about.

**Flagged resolutions change no link.** A flag is machine-derived doubt from a
classifier-supplied dish type, and §3 is explicit that it earns a review row and
never a silent switch. The 356 flagged lines keep the generic link and land in
`data/reports/resolution-flags.csv`.

**The pantry and shopping-list surfaces stay generic.** They have no recipe
context and `RESOLUTION-SPEC` §6 settles that the pantry side is asked nothing.
That is a decision, not a gap — those call sites keep using the retailer
directly.

### Shared shelves — settled 2026-08-17: search on the leaf

Of 174 stamped leaf moves, only 45 changed the URL. Weee! files `rice` and
`short grain rice` both under `dried01/Rice`, so 129 correct resolutions could
not be expressed at all. What that measures is worth naming: **the identity
layer is now finer-grained than the retailer's aisle structure** — the
differentiator working and the catalogue failing to keep up.

`WEEE-SPEC` §6's fallback order (shelf, then search, then nothing) was written
when the name *was* the ingredient. It is still right there, and wrong for the
one case where we hold a name finer than the aisles are. So the rule is
narrowed, not reversed:

> **When the leaf's link is identical to the generic's link, ask for a search
> on the leaf. Otherwise keep the aisle.**

`Retailer` gains `searchUrlFor(name)` — a search *asked for* rather than fallen
back into — and a retailer with no search surface may answer null, leaving the
aisle in place. All 174 moves are now expressive: 129 as searches, 45 still on
curated aisles. Unresolved ingredients never reach this path.

`OPEN` — **this makes `ATTRIBUTION-SPEC` §2's `resolved` flag under-report.**
`/go` computes `resolved: !isSearchUrl(url)`, meaning "we landed them on a real
shelf". Those 129 clicks now record `resolved: false` even though a search for
"short grain rice" is *more* precise than the Rice aisle, not less. The flag's
definition is intact; its usefulness as a precision proxy is not. Fixing it
means carrying a marker from the link to the route, which touches the client and
should be decided with the rest of §3's region work rather than bolted on here.

## 6. `/go` — already right

`app/go/route.ts` needs three changes, all small, none structural:

- `HOSTS` is gone. `retailerForHost(url.hostname)` **is** the allowlist:
  a non-null answer is permission, and the same answer is the label.
- `retailer: "weee"` becomes `retailer.id`, derived from that host.

  **Revised during step 1, 2026-08-17.** This section originally proposed a
  validated `r=` query parameter. Host-derivation is strictly better and the
  reasoning is worth keeping: a parameter is unvalidated input deciding an
  analytics dimension, and two mechanisms — a host set to permit, an id to
  record — can disagree, with the disagreement taking the form of a link that
  redirects correctly and records as the wrong retailer. One lookup cannot
  disagree with itself. It also needs no client change, so `goHref` keeps its
  four arguments and the three call sites are untouched.
- `resolved: !url.pathname.startsWith("/search")` is a Weee-shaped test. It
  moves onto the retailer (`isSearchUrl(url)`), since every retailer knows the
  shape of its own search path.

The one invariant this design rests on — **no host claimed by two retailers** —
is not enforceable by the type system, so it is a test
(`npm run test-retailers`). It is most likely to break on a copy-pasted row
when the second retailer lands, which is exactly when nobody is reading the
registry.

Everything else — the per-click id, the open-redirect guard, the 302-not-beacon
argument, `sub_id` — is retailer-agnostic already and stays untouched.

## 7. Rollout — one retailer, then the second is free

- **Step 1 — done 2026-08-17.** `lib/retailers.ts` holds the type and the
  table; `weee.ts` is unchanged and unaware of it (the import runs one way,
  registry → retailer module). `/go` derives both its guard and its label from
  `retailerForHost`. No page component and no client code was touched.
  Behaviour is provably identical: `retailer.id` is `"weee"` for every host in
  the old `HOSTS` set, and `isSearchUrl` is the same predicate that was inline.
  Both typechecks clean; `test-match`, `test-store`, `test-pool`, `test-import`,
  `test-relations` pass unchanged; `test-retailers` adds 18 assertions.
- **Step 2 — done 2026-08-17.** `hardToFind` moved to `lib/findability.ts`,
  reading `data/decisions/hard-to-find.csv` (212 nodes, migrated once from the
  shelf answer, `source=weee-shelf-migration`). `weee.ts` keeps only what is
  genuinely Weee's — which products to show. The CSV parser both now need moved
  to `lib/csv.ts` rather than being copied.

  **Parity was verified against the pre-change implementation, not assumed:**
  identical answers on all 2,790 ontology nodes, both the with-kind and
  without-kind paths (178 and 212 respectively).

  **The one intended render change** is the onion fix. `list/page.tsx` called
  `hardToFind(name)` with no kind, so `NEVER_LINK_KIND` never fired there and
  the block offered to deliver 34 things nobody needs delivered — garlic,
  scallion, onion, ginger, cilantro, cabbage, plus 8 seafood and 3 meat. It now
  passes `kindOf(id)`, bringing that surface from 212 candidates to the same 178
  the pantry drawer already used. `weee.ts`'s own comment predicted this exact
  failure ("left alone, the block would offer to deliver an onion") — the veto
  existed and one call site was not using it.
- **Step 3 — done 2026-08-17.** Not a gate and nothing fell; see §5 for why the
  premise was wrong. `npm run stamp-resolutions` writes
  `data/ontology/resolutions.json` (174 leaf moves across 173 recipes) plus the
  review queue `data/reports/resolution-flags.csv` (356 rows, all soy sauce in
  soups and sides). `app/src/lib/buy.ts` reads the sidecar and hands
  `detailRows` a recipe-bound `(name) => url`, so no signature changed and the
  three recipe surfaces — recipe detail, calendar, my-recipes — swapped
  `weeeUrlFor` for `buyUrlForRecipe(id)`.

  The app **reads** the stamp and never imports the resolver: `resolution.ts`
  sits outside `app/tsconfig.json`'s include, and §1 wants the answer stored
  rather than computed anyway.

  **Verified by effect, not by presence:** all 174 stamped pairs resolve to the
  leaf's URL, 0 point at the wrong node, and a recipe with no stamp produces
  byte-identical links to before.

  **Shared-shelf handling landed with it** (§5): `searchUrlFor` on the
  `Retailer` row, used only when the leaf's link equals the generic's. All 174
  moves are now expressive — 129 searches (`rice → short grain rice`), 45
  curated aisles (`corn syrup → oligodang` 39, `chili flakes → gochugaru` 6) —
  and `garlic` on the same recipe is byte-identical to before.
- **Step 4.** Add the second retailer. If this step requires touching anything
  outside the registry and one new module, go back to step 1.

~~`OPEN` — which retailer is second.~~ **Settled 2026-08-20: Instacart, through
the affiliate programme, not the Developer Platform.**

The two were one line in this spec's head and they are two different
integrations. The **affiliate** is a tracked link — an ingredient node in, a URL
out — which is precisely the `urlFor` signature, so it is a registry row and step
4 stays the one-row change §1 promised. The **IDP** returns a generated cart URL
for a whole recipe, which `urlFor` cannot express, and it is now deferred
(`GO-LIVE` §4, `BUSINESS-REVIEW` §14) for a reason that is not architectural:
`DECISIONS` §2 and `BUSINESS-REVIEW` §8A rule the recipe cart out on the supply
side. **A gap link monetises the user's pantry state; a recipe cart monetises
someone else's recipe.** The cart survives only as a grocery-list surface, and
that surface is not built.

So the shape that would have strained `urlFor` is the shape we are not building,
and the thing being added fits the table as designed. §3's `c1`-vs-`c2` question
becomes live at the same moment — two retailers now both serve a US visitor, and
Instacart alone serves a Canadian one.

**What step 4 will actually cost, measured 2026-08-20.** The plumbing is ready:
`retailers.ts` holds the row type, `/go` derives its allowlist, `findability.ts`
and `buy.ts` are retailer-agnostic. The **copy is not.** `"Weee!"` is a literal in
at least six components — `affiliate.tsx:101,126,139`, `NearlyRows.tsx:259`,
`Pantry.tsx:1648`, `BuyBlock.tsx:71,86`, `ListAffiliate.tsx:47`. §1's corollary
says adding a retailer must not require touching a page component, and today it
does. **That is step 4's real work, and by §1's own test the spec has failed until
those literals read `offer.retailer.label`.** Do that first; the registry row is
the easy half.

## 8. What this spec deliberately does not do

- **No basket building.** One plausible landing URL per ingredient, per
  `WEEE-SPEC` §6. Multi-item carts are a different spec and a different consent
  conversation.
- **No creator revenue share.** Settled twice (`CREATOR-HUB-SPEC` §3, and again
  2026-08-17 against Instacart's actual terms): default our link, creator
  override keeps 100%. The registry stores no creator tags.
- **No price display.** We do not fetch prices, so we cannot show them, and a
  stale price is a lie with a number attached.
- **No retailer ranking — amended 2026-08-21.** The blanket form of this rule
  ("we never sort retailers by what pays best") lasted while one retailer
  shipped per region. With several stacking on one region, the curator set a
  routing priority — recorded in `BUSINESS-REVIEW` §11 ("Link routing
  priority") — and the rule narrows to what it was always protecting:
  **economics may rank retailers only between equal-quality answers.** Region
  and per-ingredient coverage filter first; a real shelf beats a search
  regardless of rate; only then do rate and cookie order the survivors.
  `CREATOR-HUB-SPEC`'s hard rule ("the linked product always matches what
  they specified, never whatever pays best") is untouched — no user is ever
  sent to a worse answer because it pays better.
