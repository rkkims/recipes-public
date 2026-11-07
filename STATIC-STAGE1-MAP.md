# Stage 1 map — what the inversion actually touches

Reconnaissance for STATIC-SPEC §7 stage 1, surveyed 2026-08-21 by a read-only
pass over the whole app. This file records what IS, so the refactor argues
with facts. File:line refs are as of commit f5a8f1b.

## The three facts that shape the design

1. **`lib/match.ts` is pure — zero import statements.** 470 lines of
   functions over plain data; runs in a browser unchanged. Also pure or
   type-import-only: `explore.ts`, `detail.ts`, `plan.ts` (one `dayKey`
   value-import), `shelves.ts`, `diet.ts`, `aisle.ts`, `queue.ts` (already
   localStorage). The matcher was never the problem.
2. **What feeds it is server-bound.** `lib/data.ts` (`load()`, `resolveId`,
   `nameOf`, `displayOf`, relations building) reads ontology + recipe index +
   curation + pending-edit overlay off disk. The client equivalent is the
   static-data bundle (`src/static/build-data.ts`) plus a client data module.
3. **Owner state is the whole product, not just the pantry.**
   `ingredients` (pantry/list/cart/pins/details), `diet`, `recipes`
   (saved/dismissed/note/opened_at), `cooks`, `plans`, `own` recipes,
   `answers`, `consent`, `push`, `follows`, onboarding stamps — one blob in
   `data/app/owners.json` alongside `users`/`sessions`.

## What must STAY server-side (not opinions — dependencies)

- **Push reminders**: `src/push/remind.ts:40` reads `owners.json` directly
  (pins, `in_pantry`, `push[]`) from outside the app process. Client-held
  pins would silently kill reminders. Push stays a server feature tied to
  the sync tier.
- **Creator save-counts**: `saveCounts()` walks EVERY owner
  (`creators/[handle]` shelf ordering). No client equivalent by
  construction; needs server data or retirement.
- **Accounts/sessions**: `users`/`sessions` in the same file; sign-in makes
  `ownerId()` return the account's owner. Sign-up attaches, never merges;
  sign-in switches the view; the anonymous cookie survives sign-out.

## Owner identity today

`lib/owner.ts`: cookie `owner` (httpOnly, 1yr), session cookie `sid` wins
over it via `currentUser()`. `ownerId()` mints but does NOT persist — every
mutating action calls `setOwnerCookie` itself (~25 sites in `app/actions.ts`).
No middleware anywhere. Two concurrent first-writes can mint two ids.

## The single write path

`store.ts mutate(ownerId, fn, source)` (:803): read → upgrade → snapshot →
fn → `stampHistory` (added_at/removed_at/checked_out_at diffs) →
`logPantryEvents` (derives `pantry_event` analytics from the same diff) →
stamp `last_active_at` → atomic write. ~30 writer exports go through it
(setState, setManyInPantry, addToList, moveToPantry, tickOff, putAway,
addFreeText, reviewPantry, completeOnboarding, setExcluded, setDiet,
toggleSaved, toggleDismissed, setRecipeNote, markOpened, recordCook,
amendCook, settleCook, undoCook, planRecipe/Note, unplanRecipe,
linkPlanToCook, addOwnRecipe(s), updateOwnRecipe, deleteOwnRecipe, …).
The account layer bypasses `mutate` and writes the db directly.

Ids are `resolveId`'d on BOTH write (in actions) and read (`pantryOf`,
`statesOf`, PantryDrawer row-building); `txt_` free-text ids pass through
unchanged by design.

## The home grid flow (page.tsx, 1,157 lines)

`getOwner` → `load()` → `allRecipesFor(owner)` (corpus + own) → `pantryOf` →
`dietOf`/`applyDiet` → cuisine filter → `dismissedNow` → memoised
`shelves(shelfKey(...))` → `rank`/`nearMisses`/`oneAway`/`unlocks` →
seedful `shuffleDaily` (seed carries arrival time so a click can't reshuffle
— `explore.seenBy` ignores `opened_at` newer than arrival) → `picturedFirst`.
Client islands receive PRE-RENDERED server trees (Gallery tab panels) and
scalar props + action refs; `RecipeCard` gets a deduped
`states: Record<id, IngredientState>` object. Search shelf is server-built
from `?q=`; `completeAction` reads the owner per keystroke for own-recipe
titles.

Optimistic machinery: `Pantry.tsx` holds per-id local overrides released
when incoming props agree; `GridStatus` defers `router.refresh()` to
drawer/modal close. Under client-held state this becomes dead weight AND
its release condition loses meaning — plan its removal with the grid
conversion, not before.

## Events that die if writes move client-side (must be re-plumbed)

Emitted inside `store.ts` today: `pantry_event` (sources manual /
gap_resolution / first_run / cook, incl. `from_list` on checkout),
`cook_event` (with planned/spontaneous — only `madeIt` knows), `cook_undo`.
Precedent for browser-origin events exists: `lib/beacon.ts` →
`/api/events` (sendBeacon + keepalive fallback) already carries
`list_viewed`, `buyblock_shown/opened`.

## Risks written down by the recon

- Pages `/`, `/list`, `/calendar`, `/my-recipes`, `/recipe/[id]` are dynamic
  ONLY because `cookies()` is reached transitively. Removing owner reads
  flips them prerenderable — which changes build behavior; do it knowingly.
- Zero `<Suspense>` in the tree; everything above the fold is owner-derived
  HTML today. A client-state grid must handle its own first-paint (skeleton
  or bundle-then-render) without reintroducing `suppressHydrationWarning`
  (layout.tsx explicitly removed it; localStorage reads go in mount
  effects — `Shell.tsx:112` is the precedent).
- Service worker: network-first navigations + precached per-owner `/list`
  HTML exist BECAUSE state is server-side. Old cached copies will
  contradict a client-state build → needs a VERSION bump and a rethink of
  the `/list` precache when the grid converts.
- `StoreCorrupt` has bespoke recovery UI on four pages; the client store
  needs the same "corrupt must never look empty" guarantee.
- Writes-during-render exist: `my-recipes` calls `transferOwnUpgrades` in a
  server component body; `page.tsx:396` fires `retryOwnImages` un-awaited.
- Diet writes are deliberately split (`setExcluded` vs `setDiet`) after a
  data-loss bug; preserve the split in any reducer port.
- `tickOffItem` emits no event today (cart ≠ pantry); don't "fix" that in
  the port.
- Tests pin behavior: `store.test.ts` (2,315-line module), `match.test.ts`,
  plus five more. The extraction below must keep them green.

## The slice plan this map produces

- **Slice A (foundation, zero behavior change):** extract the pure owner
  core — types, `blank`, `upgrade`, `stampHistory`, and every reducer —
  from `store.ts` into `lib/owner-core.ts` (no imports beyond types).
  `store.ts` becomes the server shell: fs + events + accounts around the
  core. New `lib/client-store.ts`: localStorage shell around the same core
  (versioned blob, `revised_at` per section, corrupt-guard, export/import,
  storage-event sync between tabs, event beacons for the analytics list
  above). New `lib/client-data.ts`: fetches `/static-data/*.json`, provides
  `resolveId`/`nameOf`/`byId`/relations over the bundle. Nothing imports the
  new modules yet; all existing tests stay green; new unit tests mirror the
  store.test.ts semantics against the extracted core.
- **Slice B:** convert the grid + PantryDrawer to client rendering over
  client-store + client-data; retire the optimistic override machinery;
  SW VERSION bump; dual-write to server actions during transition.
- **Slice C:** remaining readers (/list, /calendar, /recipe/[id],
  /my-recipes); demote `owners.json` to sync tier; the KV Worker.
