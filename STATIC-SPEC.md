# Static mode

How the product shrinks to a maintenance floor of one domain renewal a year —
and what that buys the live product on the way there.

Decided with Richard 2026-08-21. The three questions that shaped it were
settled the same night: accounts become a **sync tier that engages when a
server exists**; the static build ships **only the curated shelf**; and
outbound attribution **survives via a Cloudflare Worker**. Everything else
follows from those three calls.

## 0. Why this spec exists

The shrink scenario is real: if the product does not grow into income that
justifies attention, it should be reducible to something that costs nothing
to run and nothing to watch — no VM, no cert renewals, no patching, no
process to crash. A static site on Cloudflare Pages (DNS is already there)
plus one Worker is that floor: ~$15/year for the domain, zero marginal
maintenance between curation sessions.

But this is not only an exit ramp. The architectural inversion it requires —
pantry and matching on the client — makes the live product faster (no server
round-trip per pantry tick), completes the PWA offline story TLS unlocked,
and removes the last per-request server dependency from the core loop. Every
stage below is worth shipping even if static mode never fires.

**The correction this spec records:** the pantry is server-backed today.
`data/app/owners.json` holds pantry, list, and cook log, keyed by an owner
cookie, and the grid matches server-side (`page.tsx` documents its ~35ms
matching floor). USER-SPEC §2's "works with zero account" meant no sign-up,
not no server. Static mode requires inverting that, and the inversion is the
bulk of the work.

## 0b. The operating contract (Richard, 2026-08-21)

The product is a long game and the operator has a living to make. The ONLY
recurring effort the product may demand of him:

1. **Curate** — judged batches and ontology edits are reflected on the live
   site automatically (§6's timer). Curation IS the publish action.
2. **Add a recipe** — a curator path from URL to corpus to queue, so the
   shelf can grow beyond the original crawls.
3. **Map products** — when an affiliate approves, ingredient→product
   mappings are a decisions file he edits (the `weee-shelf.csv` pattern),
   folded in by the bundle generator.

No new product features are planned. Anything that requires troubleshooting,
plumbing, or attention beyond those three activities is out of contract —
which is the standing argument for every simplification below, and the test
any future proposal must pass.

## 1. The switch

One environment flag at build time:

    STATIC_MODE=1 npm run build-static

- **Server mode (default, unchanged):** everything as today. The flag absent
  means no behavioral difference anywhere; static mode must never leak into
  the server product's behavior.
- **Static mode:** `next.config.mjs` sets `output: "export"`; the build
  emits a fully self-contained site to `static-out/`. No Node process serves
  it; anything that cannot exist without a server is excluded (§3) or
  replaced (§4).

The switch is a build artifact choice, not a runtime branch. Both artifacts
build from one tree; there is no fork to maintain.

## 2. The inversion — device-held state as the source of truth

Stage 1 (§6) moves pantry, grocery list, and cook log to the browser
(localStorage, one blob per store, versioned), and ports the matcher to run
client-side against shipped JSON. This lands in **both modes**:

- **In server mode**, the server copy in `owners.json` becomes the **sync
  tier**: an account, when signed in, mirrors the device state so a second
  device can pick it up. The device is authoritative; the server reconciles.
  This is Richard's "sync when a server exists" — accounts stop being where
  the pantry *lives* and become how it *travels*.
- **In static mode**, the sync tier survives — revised 2026-08-21 on
  Richard's proposal of a small cloud store the static site can reach. A
  ~50-line Worker in front of **Workers KV** holds one blob per household:
  `GET/PUT /sync/:key`, `revised_at` last-write-wins per store, ~64 KB size
  cap. **The sync key IS the account**: a device-generated random 128-bit
  key, paired to a second device by entering it once. No email, no password,
  no personal data server-side — losing the key loses sync, never the
  pantry, and nothing stored is worth stealing. KV free tier (1k writes/day)
  covers the product's realistic life with debounced saves. File-vs-DB was
  considered and KV wins: the state is small JSON blobs with LWW semantics,
  which is KV's exact shape; D1 buys structure nobody queries.
  An export/import file button remains the manual fallback and the user's
  own backup.

  Consequence for stage 1: the client store speaks to sync through a small
  **adapter interface** with two implementations — today's server actions
  (server mode) and the KV Worker (static mode). A later decision may unify
  both modes on the Worker and retire `owners.json` accounts entirely; that
  is left open, not assumed.

Sync semantics (deliberately simple, per-store last-write-wins): each store
carries a `revised_at`; sign-in pulls the newer side whole. No merging of
individual rows — a pantry changes as a session, not as a CRDT, and USER-SPEC
§3's owner model already keys everything needed.

The matcher port is mechanical by design: `lib/match.ts` is pure logic over
data. What ships to the client is a build-generated bundle (§5) — curated
recipes with requires/optional lists, and the resolved ontology (nodes,
aliases for search, redirects, glosses). The ~35ms server floor becomes a
client cost paid per keystroke on hardware the user owns; measure it, and if
phones choke on the full corpus, the curated shelf (§3) is small enough that
they will not.

## 3. What the static site contains — the curated shelf only

Ships:

- **Home grid** over recipes with a curated `keep` verdict — nothing else.
  The static site never shows the ungated corpus; the depth gate (GO-LIVE
  step 3) travels with the build.
- **`/recipe/[id]`** via `generateStaticParams`, one page per kept recipe.
  Canonical-to-source, ingredients-never-method — unchanged.
- **Ingredient pages** for every node a kept recipe references.
- **Grocery list, pantry, my-recipes** as client pages over device state.
  My-recipes' *add by URL* requires a parser and is disabled in static mode
  (paste-a-URL renders the same honest note as sync).
- The legal pages, manifest, icons, service worker.

Excluded (no server, no route): `/curate/*` (curation is a local-server
activity by definition), `/api/*`, `/signin`, `/account`, `/user-images`,
`/recipe-requests`, `/go` (replaced, §4). Exclusion is mechanical: export
mode builds from a route allowlist, not by hoping nothing dynamic slipped in.

## 4. Attribution — the `/go` Worker

The outbound choke point survives as a Cloudflare Worker on the same paths
(`jipbap.com/go`), preserving ATTRIBUTION-SPEC's posture exactly:

- **Allowlist**: generated at build from the retailer registry into a JSON
  the Worker imports — same single-source rule as today (RETAILER-SPEC §6:
  the registry IS the allowlist). Exact hosts, never substring tests.
- **Click id**: accepts the client-minted `cid`, mints a UUID when absent,
  appends `sub_id`, 302s. No user id, ever — the Worker never learns who
  clicked, same as the route it replaces.
- **The log**: `outbound_click` events (click_id, retailer, surface,
  ingredient_id, resolved) go to Workers Analytics Engine — free tier,
  queryable, and nothing personal in it so nothing to protect. Losing the
  append-only file on the VM is accepted; the analytics questions the file
  answers survive in the Worker's dataset.
- Free-tier limits (100k requests/day) exceed any plausible traffic by
  orders of magnitude.

The Worker is ~60 lines and deployable before static mode ever fires; in
server mode it simply is not routed to.

## 5. The build pipeline

`npm run build-static` (new, in the repo root):

1. Generate the client data bundle from the same tables the server reads:
   `static-data/recipes.json` (every recipe not dropped — gate lifted 2026-11-06; ~1.4 MB gzip. Only KEPT recipes are prerendered: all 17k pages took 60 GB and ~50k files. Any other `/recipe/<id>` is redirected by `deploy/cloudflare/site-worker.ts` to `/recipe-shell?id=<id>` and drawn in the browser by `RecipeShell`), `static-data/ontology.json`
   (nodes + aliases + redirects + glosses, pruned to what the shelf
   references), `static-data/retailers.json` (the Worker/link allowlist and
   brand rows). Budget: fail above 5 MB gzipped total (raised from 1 MB on 2026-11-06,
   when the curation gate was lifted and the shelf grew from ~124 to ~17,600
   recipes; the old figure was sized for a hand-curated shelf).
2. `STATIC_MODE=1 next build` with `output: "export"` → `static-out/`.
3. Publish: `wrangler pages deploy static-out` (Cloudflare Pages, the
   account that already holds the DNS). DNS cutover between modes is one
   record flip, reversible in seconds.

## 6. Auto-regeneration — the batch hook

Richard's ask: the static files regenerate when a curation batch lands.
Same pattern as the GoAccess timer already on this box:

- `jipbap-static.timer` + `jipbap-static.sh`, every 15 minutes: hash
  `data/curation/recipes.json` + the ontology tables + `retailers.ts`
  against a stamp file; on change, run `npm run build-static` and deploy.
  No change, no work — a quiet timer costs nothing.
- While the VM exists, the timer lives there. In the full-shrink scenario
  (no VM), regeneration moves to the curation machine itself: curation is
  already a local-server activity in static mode, so the publish step is
  the natural end of a curation session (`curate → commit → build-static →
  deploy`, one script).

The timer is stage-independent and ships first: it is harmless before the
static pipeline exists (the script exits on missing flag) and the moment
stage 3 lands, freshness is automatic.

## 7. Migration order — four stages, each shippable alone

1. **The inversion** (the big one): pantry/list/cook-log to localStorage,
   client-side matching, `owners.json` demoted to sync tier. Ships to the
   live product; static mode is not mentioned in its UI. This stage carries
   the export/import file button.
2. **Static params + route allowlist + `STATIC_MODE` flag**: the export
   builds and renders the curated shelf end-to-end locally.
3. **The `/go` Worker + Pages publish path**: `build-static` deploys
   somewhere real (a preview subdomain until the day it is needed).
4. **The timer** (§6) — or first, since it is trivial and inert.

Stage 1 is the only one with meaningful risk, and it pays for itself in
server mode. Stages 2–4 are plumbing over data that is already static.

## 7b. The cutover, decided 2026-08-23 — "move to Cloudflare entirely"

The curator's call: the VM stops serving the product. What that costs, and
what it is allowed to cost, judged against §0b's contract (curate, add a
recipe, map products — nothing else).

**Survives, as static pages over device state:** home grid and drawer
(shipped, slice B), `/list`, `/calendar`, `/my-recipes`, `/recipe/[id]`,
creator pages read-only, the legal pages, manifest, icons, service worker.

**Becomes a Worker:** `/go` attribution (§4). Nothing else needs to.

**Moves off the public site:** `/curate`. Curation becomes a **local**
server the curator runs (`next start` against the same repo), and its
publish step is `build-static` + deploy — which is exactly §0b's promise
that curating IS publishing. The password and the nginx lock retire with the
VM; the firewall of "runs on your machine" replaces them.

**Accounts KEPT — revised 2026-08-23, the curator's call.** Sign-in survives
the cutover on a free tier, and it changes the sync design for the better:
the account IS the sync tier, so §2's random pairing key is not needed
(keep it in mind only as the signed-out fallback).

- **Store: D1, not KV.** §2 chose KV when the only state was one blob with
  last-write-wins. Accounts need lookups *by identifier* and *by session
  token* — that is a table — and D1's free tier carries 100,000 writes/day
  against KV's 1,000. Three tables: `users`, `sessions`, `owners` (the blob
  as JSON, one row per owner).
- **One API Worker**, the `jipbap-sync` script already created, routed at
  `jipbap.com/api/*` so the site and the API share an origin and the
  session cookie keeps working exactly as it does today (httpOnly, secure,
  SameSite=Lax). Five endpoints and no more: signup, signin, signout,
  session, and pantry pull/push.
- **Password hashing moves scrypt → PBKDF2-SHA256**; Workers' Web Crypto
  has no scrypt. There is exactly ONE real account today
  (`data/app/owners.json`, created 2026-08-11), so migration is one password
  set, not a fleet.
- **The contract exception, named:** auth is the one kept feature with real
  operational surface. It is not new risk — it runs today — but it is the
  reason to keep the endpoint list closed: no email flows, no password
  reset, no admin surface, and sign-in rate limited. Anything beyond those
  five endpoints needs the §0b test again.
**Creator claims KEPT too — same call, same day, with its cost named.**
They ride the same Worker and the same D1, but they are a bigger build than
accounts and they change one architectural rule, so they are sequenced
LAST — after the cutover is live and proven.

- **The flow already exists** (`lib/claims.ts`): a signed-in user requests a
  creator, a `jb-…` token is minted, the creator publishes it where only
  they can (bio, page), and verification fetches that page and looks for the
  token. Workers can make that outbound fetch, so the mechanism ports whole.
  Two tables (`claims`, `pending`) and three endpoints (request, verify,
  read) — nothing invented.
- **State today: zero live claims** — two stale test tokens from August,
  no self-annotations, no creator recipes. Nothing is lost by shipping the
  cutover first and claims second; everything is lost by blocking the
  cutover on the largest remaining build.
- **The rule it changes:** a claimed creator's annotations are *content*,
  and content on a static site normally waits for a rebuild — but a rebuild
  runs on the curator's machine, so a creator's edit cannot trigger one.
  So creator annotations become **runtime data fetched from the API and
  overlaid on the static shelf**, exactly as the pantry is device state
  overlaid on it. The static build stays the curated corpus; the overlay
  carries what people who are not the curator have said about it. Write this
  down before building it, because the alternative (waiting for a deploy) is
  how a creator learns their edit did nothing.

**Retires, by the contract:** `/account`,
`/user-images`, `/recipe-requests`, push reminders, the server `/export`
route (the device keeps its own export/import), `/api/events` (the three
client beacons go to the `/go` Worker's dataset or stop). None of these is
one of the three activities, and each is operational surface that has to be
watched. **Accounts specifically:** the pantry never needed one, and the KV
sync Worker (§2) can restore cross-device sync later without restoring
identity — a random key, no email, no password. It is deliberately NOT a
cutover blocker.

**The one real loss to name:** creator *claims* need a server to accept
them, so the creator-page-as-bio-link channel becomes read-only until the
sync-shaped Worker grows a claim endpoint. Recorded here so the distribution
plan's channel 2 is not quietly assumed to still work.

**ADD-BY-URL IS A CUTOVER BLOCKER — decided 2026-08-24.** §3 disabled it in
static mode because parsing someone else's page needs a server. That was the
right description and the wrong conclusion: it is **one of §0b's three
contracted activities** ("I need to be able to add a new recipe"), and it is
step two of the growth loop — users add recipes they saved elsewhere, which
is what accumulates the demand signal creators are later shown. A cutover
that ships without it silently deletes the loop's second step and one third
of the operating contract.

So the parser moves to the edge before the domain does:

- **Its own Worker (`jipbap-parse`), not the API Worker.** It fetches
  arbitrary third-party URLs on request, which is server-side request
  forgery surface by definition; the Worker that holds sessions, password
  hashes and the D1 binding must not be the one making those fetches. The
  same isolation argument that keeps `/go` separate.
- **No D1 binding, no session access.** It takes a URL, returns parsed
  ingredients and title, and the device stores the result — the parse is
  advice, the device is the record.
- **Abuse bounds are part of the build, not a follow-up:** an allowlist of
  schemes (https only), a response size and time cap, a refusal of private
  and link-local address space (an open fetcher on someone else's
  infrastructure is how a Worker becomes a proxy), and rate limiting.
- The demand-board row (`data/app/requests.json`) has no static home and is
  dropped; it is not one of the three activities.

**Also before the move:** the device's export/import needs a control. Stage
1 built the file round-trip and stage 2 hid `/export`, which leaves a build
where the only way out of your own data is the developer console.

**Order:** slice C converts the four remaining owner-state pages; stage 2
adds `output: export` behind `STATIC_MODE` with the route allowlist; stage 3
deploys the `/go` Worker and the first real `wrangler deploy`; then the
domain moves in the dashboard and the VM keeps only the wedding site.

## 8. What static mode gives up, said plainly

Cross-device sync (until a server returns), add-recipe-by-URL, user images,
recipe requests, creator claims, and server-side freshness (the site changes
when curation publishes, not per request). Every one of these is a
growth-scenario feature; the shrink scenario by definition is the one where
they had no users to lose.

## 9. Open questions (marked, not settled)

- **Search in static mode**: client search over the shipped ontology is the
  plan; whether recipe *title* search also ships client-side or drops
  depends on bundle weight at the time.
- **The service worker's cache strategy** under Pages (network-first
  navigations assume a server that always answers; Pages answers, but the
  VERSION-bump discipline in deploy/README needs a static-mode equivalent
  in `build-static`).
- **Sync-tier conflict UX**: last-write-wins per store is settled; whether
  the losing side gets surfaced ("this device's pantry was older and was
  replaced") or replaced silently is a product call for stage-1 review.
