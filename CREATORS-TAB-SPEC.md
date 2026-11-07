# CREATORS-TAB-SPEC — the Creators place, Follow, id-only sign-up, affiliate surfaces, offline list

Scope: the feature batch requested 2026-08-15. Six things, one spec, because
four of them meet in the same entity (the creator) and the other two touch
surfaces this spec has to name anyway. Related: CREATOR-SPEC (the profile and
claim), CREATOR-HUB-SPEC, WEEE-SPEC + ATTRIBUTION-SPEC (affiliate), USER-SPEC
+ PRIVACY-SPEC (accounts), UX-SPEC §12 (PWA).

Open questions are marked `OPEN On` inline and gathered in §9. Nothing below
an OPEN gets built until it is settled.

---

## 1. The place

A fifth entry in `ALL_PLACES` (`Nav.tsx`), between Cook and My recipes:

    { href: "/creators", label: "Creators" }

It appears in both bars — the top `.nav-places` and the phone `.tabbar` — by
existing mechanics; nothing new to build in `Nav` beyond the entry and the
icon. `lib/surface.ts` gains nothing: the tab ships listed.

**Icon.** The set is hand-drawn inline SVG (cook = the brand mark, book,
calendar, fridge, basket). Creators is **two people** — a larger head-and-
shoulders with a smaller one beside it, same stroke weight as the rest of the
set. Two figures, not one: one person is "account", and the Account control
already exists in `.nav-end`. Two is a community you browse — which is what
the tab is. Drawn, not typed (no emoji), per the shell's standing rule.

**Active state.** `aria-current` today tests `path === p.href`. The Creators
entry tests `path === "/creators" || path.startsWith("/creators/")` so a
profile opened inside the tab keeps the tab lit. The other entries keep exact
matching (a recipe page under `/` should not light Cook — it doesn't today,
and nothing changes).

## 2. Entering without context — search, your creators, the invitation

`/creators/page.tsx`, server component, `Nav` + no `Shell` (the pantry drawer
has no business here; same framing as the standalone recipe page).

Top and centered: **one search input**. It searches creators by name — display
name, handle, aliases (`creator_alias.csv`) — via a server action, debounced
client-side like the ingredient autosuggest.

Each suggestion row: avatar (from `icons.csv` / cached `avatar-*.jpg`; no
avatar → no placeholder disc, just the name), the name, and the recipe count
(`recipesOf(creator).length`, the listed count — unlisted rows stay uncounted,
same rule the profile page applies). Click → that creator's page, in-tab (§3).

When the user follows anyone, suggestions come in two groups: **Following**
first, then **All creators** — same query, the followed ones surfaced, never
duplicated below.

Under the search bar, entering with no query: the **followed list** — avatar +
name rows, most recently followed first. Empty state: one quiet line ("Creators
you follow will live here") — no accent, no illustration.

Bottom center: the text link **"Are you a creator?"** → `/creators/start`
(§5). Text link, not a button: it is an aside to most visitors and the door
for a few.

## 3. A creator's page, inside the tab

The existing `/creators/[handle]/page.tsx` IS the creator page; it stays the
only one. Because §1 lights the tab on the `/creators/*` prefix, every
existing link — including the source link in the recipe modal
(`RecipeDetail`'s `creatorHref`) — now lands "in the Creators tab" with no
routing change at all.

**Coming back to Cook where you left.** Tab links become last-URL links: `Nav`
(client) records `location.pathname + location.search` into
`sessionStorage["place:" + href]` keyed by which place the current path
belongs to, and each tab link `href`s the stored URL when one exists, falling
back to the bare place. So: reading the grid at `/?seed=x`, open a recipe,
tap the creator's name (→ Creators tab), tap Cook — and you are back at
`/?seed=x`, same deal of the cards (the seed carries the order — see
`shuffleSeed`). sessionStorage, not localStorage: "where I left" is a
session-scale fact; yesterday's position is stale, not helpful.

## 4. Follow

The entity is a row on the owner, not on the creator:

    owner.follows: Array<{ creator_id: string, followed_at: string }>

in `owners.json` via `lib/store.ts`, written by server actions
`followCreator` / `unfollowCreator`. **Account-only** (settled 2026-08-15):
a follow is a standing relationship worth keeping across devices, so it needs
the thing that crosses devices. Signed out, the button reads "Sign in to
follow" and routes to `/signin` — it never pretends to work and then forgets.

Surfaces:
- **Creator page**: a Follow / Following button by the title. Follow is the
  quiet outline; Following is the filled state. Optimistic, undoable toast
  (`useAck`), like every other tick.
- **Creators tab**: the followed list (§2) and the Following group in
  autosuggest.
- Follower counts exist in the data by derivation but are shown nowhere, to
  anyone, at v1 (settled 2026-08-15) — follows shape the follower's own tab,
  and a small number on a creator's page helps nobody yet.

Export (`/app/export`) includes follows; account deletion removes them with
the owner. PRIVACY-SPEC applies unchanged.

## 5. "Are you a creator?" — onboarding

`/creators/start` already exists (`SelfRegister`, open self-registration).
It becomes the one onboarding door, restructured to say what the claim page
says (who we are, what a page gets you, what it costs: nothing) — shared copy,
not a shared component; the two pages address different rooms.

The addition for new creators: **platforms, one by one.** An established
(indexed) creator arrives with channels already in `creator_channel.csv`; a
self-registering one arrives with none. The form takes one platform link at a
time — paste a profile URL, we derive the platform and the handle, it appears
as a row, add another — rather than a grid of optional fields. A claimed
established profile can also add a further platform from `ClaimPanel`; same
action, same validation, different door.

Verification of self-added channels stays as CREATOR-SPEC has it (the page is
`self_registered`, unverified until claimed/proven) — this spec adds no new
trust, only new fields.

## 6. Sign-up takes an id, not an email

Decided (user, 2026-08-15): minimize what we hold. New shape:

- Sign-up form: **username + password** (+ confirm + terms), and one optional
  **recovery email** field, empty by default and plainly labelled as the only
  way back into a lost account (settled 2026-08-15). Username: 3–30 chars,
  `[a-z0-9-_.]`, case-folded, unique among users.
- `signedIn()` (`lib/account.ts`) currently means `!!owner.email` — it becomes
  "has a user record", carried by the record itself, not by any particular
  field.
- No reset flow exists today and none ships with this; the recovery email is
  stored against the day one does. An account without one: lose the password,
  lose the account, and the form says so beside the empty field.
- Existing accounts keep working unchanged (settled 2026-08-15): email remains
  a valid sign-in identifier where it exists; new records get one only if the
  recovery field was filled.

## 7. Affiliate surfaces

Two placements, one modal. Funnel unchanged: every link-out is `/go` with a
click id; impressions beacon to `/api/events`; disclosure per ATTRIBUTION-SPEC.

**Prerequisite — product images.** `data/weee/products.csv` is
`product_id, title` only. A pipeline step fetches and caches product
thumbnails to `public/cached-images/weee-<product_id>.jpg` (the avatar cache's
pattern). A product with no cached image renders as title-only — the surfaces
below must not depend on the fetch having run.

**The affiliate modal.** Opened from either placement. Contents, top to
bottom: product thumbnail(s) + title(s); one paragraph on what Weee is (the
service, not the deal); the perk if one is configured (e.g. first-delivery
discount) — `OPEN O5`, the perk copy and its source of truth (env var beside
`WEEE_AFFILIATE_TAG`, so it can change without a deploy of copy); a link-out
button (via `/go`); Close. Same modal chrome/focus rules as the recipe modal.
Affiliate relationship stated inside the modal, not only in the footer.

**"Almost there" placement.** `NearlyRows` is one row per blocking
ingredient. On the FIRST row whose ingredient resolves to an assigned product
(`weee-shelf.csv` decisions → product), the row's actions gain the product
thumbnail as a small card beside "Add to grocery list". Click → the modal,
that product. First eligible row only — one ad per screen; the placement rule
in `BuyBlock` ("never on results rows") is amended by this spec to "never on
results rows, once per shelf".

**Grocery list placement.** At the bottom of `/list`: one combined block —
products matching the items currently on the list (up to ~4 thumbnails, then
"and N more"). Click → the same modal, multi-product variant, one link-out
(the basket/search link `weeeUrlFor` already builds). Below the list, never
between aisles: the list is a tool, the ad is a footer.

## 8. The grocery list works offline

What exists: hand-rolled SW (`public/sw.js`, network-first navigations, cached
fallback), an offline write queue (`lib/queue.ts` → `ListOffline`).

The gap: `/list` is only cached if it was visited this SW generation, and a
stale cached page renders stale items with no way to know.

Target behavior, spec'd as three commitments — and what building it found
(2026-08-15): two of the three already existed.
1. **The shell is always there.** `/list` is precached at SW install
   (best-effort, beside `/offline`), so the tab opens offline even on a cold
   start. `VERSION` bumped. ← the one real gap; built.
2. **The items are locally true.** Already true by a different mechanism than
   the mirror this spec first proposed: `lib/queue`'s `pendingState` overlays
   the cached page's rows with every tick made since it was rendered, and
   `ListOffline` says "Offline. Ticking and adding still work." A second
   localStorage mirror would be the same fact stored twice.
3. **Ticks survive.** Already built: tick and typed-add queue in
   `localStorage["list-queue"]` and drain in order on reconnect. Removals
   stay online-only by `lib/queue`'s own argument — two operations, both
   idempotent, no merge algorithm; a removal is neither of them.

Out of scope: offline recipe browsing, offline pantry. The list is the tab
you hold in a store aisle with one bar of signal — that is the case being
served.

## 9. Open questions

Settled 2026-08-15: recovery email is an optional field (§6); existing email
accounts keep working (§6); follows are account-only (§4); follower counts
shown to nobody at v1 (§4).

Still open:

- **O5** the perk line in the affiliate modal: exact copy, and confirm
  env-var-beside-the-tag as its home. Ships without a perk line until copy
  arrives.
