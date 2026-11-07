/**
 * The owner's state and every rule for changing it — the pure core.
 *
 * Extracted from `store.ts` (STATIC-SPEC §2, stage 1) so one set of reducers
 * can serve two shells: the server store keeps `owners.json` behind fs and
 * atomic writes, and the client store keeps the same shape in localStorage.
 * The rules must not fork between them — a pantry that behaves differently
 * depending on where it is held is two products wearing one UI.
 *
 * ZERO import statements, by constraint rather than accident: this module has
 * to run in a browser unchanged, the same property that made `match.ts`
 * portable. Reducers take the owner as their first argument and mutate it in
 * place — the shells own reading, persisting, and the behavioural record.
 * Nothing here touches a filesystem, emits an event, or knows what a
 * `PantrySource` is; `pantryEvents` derives the descriptors and the shell
 * decides where they go.
 *
 * Shapes follow INGREDIENT-SPEC §2 and RECIPE-SPEC §4 exactly, including the
 * fields Phase A does not read yet — `portion`, `brand`, `buy_instead`,
 * `storage`. They cost nothing empty and they are the difference between adding
 * a feature and migrating a file.
 *
 * Keyed on `owner_id`, never `user_id` (USER-SPEC §3). Accounts (`User`,
 * `Session`) are deliberately NOT here — a user is a way back into a kitchen,
 * a server-side concern that never runs on a device.
 */

export type UserIngredient = {
  ingredient_id: string;
  in_pantry: boolean;
  on_list: boolean;
  use_first: boolean;
  /**
   * Bought, not yet put away — CART-SPEC.
   *
   * The third state, and the one the product was missing: between grabbing a
   * thing off a shelf and shelving it at home there are twenty minutes, a
   * queue and a drive, and a tick used to jump all of it by writing
   * `in_pantry`. That was a guess, and §4g existed to apologise for it.
   *
   * PERSISTED, deliberately. The client already had a visit-scoped set of what
   * was ticked (`Pantry.offList`) and it is exactly the mechanism that fails
   * here: the phone sleeps in a pocket between the till and the car, and a cart
   * that empties itself on reload is worse than no cart at all.
   *
   * Optional because every row written before this existed has no opinion, and
   * absent reads as false. No migration: INGREDIENT-SPEC §1's rule is that we
   * do not rewrite user data to suit a new field.
   */
  in_cart?: boolean;
  /**
   * When "Use today" was last set — see `pinLive`.
   *
   * Absent on rows written before this existed, and on rows that were never
   * pinned. An absent value on a pinned row is read as live rather than as
   * expired: silently un-pinning something a user genuinely set would be the
   * same class of error this field exists to prevent.
   */
  pinned_at?: string;
  /**
   * A row the user typed that our vocabulary does not have — bin bags, milk for
   * the kids, "whatever bread looks good".
   *
   * The list could only hold ingredients the recipe ontology knew, which meant
   * a real shopping trip needed our list AND a notes app. The moment there are
   * two lists, ours is the one that gets abandoned: theirs is the complete one.
   *
   * These rows carry a `txt_` id, never resolve, never match a recipe, and are
   * never offered as pantry suggestions. They exist so the list can be the
   * whole list. `label` is what to call it, because `nameOf` has nothing to say
   * about an id the ontology has never seen.
   */
  label?: string;
  /**
   * When THIS instance entered — reset every time the ingredient comes back.
   *
   * Read as "how old is the jar in the cupboard": `ageOf` turns it into "added
   * 3 weeks ago" and the return-from-away panel sorts the staleness list by it.
   * Rebuying something has to reset it, or the panel tells a user their fresh
   * scallions are a month old.
   */
  added_at: string;
  /**
   * When the ingredient FIRST entered, ever. Never overwritten.
   *
   * `added_at` used to carry both meanings and got both wrong: the row was
   * deleted when the last flag went off, so re-adding minted a fresh
   * `added_at` and the history was gone — after the single most ordinary thing
   * that happens to a pantry item, running out and rebuying it.
   *
   * Optional because rows written before this existed have no answer, and
   * inventing one from `added_at` would claim a first purchase we did not see.
   */
  first_added_at?: string;
  /**
   * When the row last went empty — both flags off. Absent while it is held or
   * listed, so its presence IS the tombstone (see `setState`).
   */
  removed_at?: string;
  /**
   * When it last moved from the list into the pantry — the shopping trip.
   *
   * Stamped on the TRANSITION only, the same rule `pinned_at` follows: ticking
   * something already in the pantry is not a second trip.
   */
  checked_out_at?: string;
  note?: string;
  portion?: string;
  storage?: "frozen" | "chilled" | "ambient" | null;
  brand?: string;
  buy_instead?: string;
};

export type CookEvent = {
  id: string;
  recipe_id: string;
  cooked_at: string;
  /**
   * Which meal it was — the same vocabulary as `PlanEntry.meal`.
   *
   * Optional because it is asked AFTER the cook is recorded, never before: the
   * tap that means "I made this" is not taxed with a question (UX-SPEC §5), so
   * an unanswered slot is a normal state and not a defect. It is what lets two
   * cooks of one dish on one day be told apart — lunch and dinner are different
   * meals, and without this they are one ambiguous row.
   */
  meal?: string;
  rating?: number;
  note?: string;
  /** SNAPSHOT of recipe.requires at the time (RECIPE-SPEC §3). */
  required: string[];
  substituted: Array<{ wanted: string; used: string }>;
  skipped: string[];
};

/**
 * The user's relationship to one recipe — RECIPE-SPEC §4's `user_recipe`.
 *
 * The spec has always defined this row; the store carried a bare `saved:
 * string[]` instead, which held the flag and had nowhere to put the standing
 * note. Rather than adding notes beside it and keeping one entity in two
 * places, `saved` migrates into this row (see `upgrade`).
 *
 * "A row exists as soon as the user saves OR cooks" (§4) — saving without
 * cooking is a plan, cooking without saving is a whim, and neither implies the
 * other. So `saved` is a flag on the row, not the row's existence condition.
 *
 * `first_cooked` / `last_cooked` / `cook_count` are deliberately NOT here. §6
 * calls them denormalised, and `historyFor` computes them from the log — one
 * source of truth, and no cache to go stale.
 */
export type UserRecipe = {
  recipe_id: string;
  saved: boolean;
  /**
   * Their standing note on the dish — "always double the garlic".
   *
   * Distinct from `CookEvent.note`, which is about ONE cooking ("too salty
   * tonight"). A user has both kinds of thing to say and they do not survive
   * being merged: the standing note is advice to their future self, the event
   * note is a record of what happened.
   */
  note?: string;
  /**
   * "Don't recommend this recipe" — the product's only NEGATIVE signal, and it
   * stands until the user takes it back.
   *
   * Everything else a user can say here is positive: save, plan, cook, pin. So
   * a dish they simply do not fancy ranked identically tomorrow, and next week,
   * and forever — and the way that fails is quiet. You learn to skip the same
   * four cards, and a ranked list you have learned to skip is wallpaper.
   *
   * It used to lapse after a fortnight, on the theory that "no" here means "not
   * tonight". The theory was wrong in the direction that costs the most: a
   * standing instruction that quietly expires teaches people the control does
   * not work, and the recipe you rejected coming back is indistinguishable from
   * never having been heard. If it returns at all, it should be because the
   * user pressed the same button again — which is the only undo it needs.
   *
   * A timestamp rather than a flag because WHEN they said it is worth keeping
   * (ordering an eventual "hidden by you" list, telling an old decision from a
   * fresh one); nothing reads it as an expiry. Presence is the whole meaning.
   *
   * It filters DISCOVERY only — "Cook tonight" and "Nearly there". Search,
   * saves, the calendar and your cook history all ignore it: asking not to be
   * *recommended* something is not asking for it to become unfindable.
   */
  dismissed_at?: string;
  /**
   * @deprecated The fortnight-long version of `dismissed_at`. Read by `upgrade`
   * and then removed; never written. Kept on the type so the migration can see
   * it without a cast.
   */
  dismissed_until?: string;
  /**
   * When this recipe was last OPENED — the signal Explore is built on.
   *
   * Opening is the cheapest thing a person does that means anything: it is not
   * a save, not a plan and not a promise, but it is proof they have seen the
   * card and made a decision about it. Explore treats that as "shown" and stops
   * offering it, which is what turns a leaderboard into something that changes.
   *
   * A timestamp rather than a flag, because it decays — see `SEEN_DAYS` in
   * `lib/explore`. A permanent record of every glance would shrink the pool
   * monotonically until the tab is empty for the product's best user.
   */
  opened_at?: string;
  added_at: string;
};

/**
 * The meal slots offered. Free text is still accepted — see `PlanEntry.meal`.
 */
export const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;

/**
 * A recipe bound to a date and a meal — the calendar's row.
 *
 * **A plan and a cook are two rows, not one row with a status.** A plan is an
 * intention; a CookEvent is a record of something that happened. Collapsing them
 * breaks in both directions: cooking something never planned would write a plan
 * retroactively for a thing nobody planned, and a plan that was never cooked —
 * real, useful data about what you meant to do — would be indistinguishable from
 * one that was. So the plan points AT the cook once there is one.
 */
export type PlanEntry = {
  id: string;
  /**
   * The dish — absent on a NOTE.
   *
   * "Eat out". "Uber". "At mum's". These are among the most useful entries on a
   * meal plan and the schema had nowhere to put them, because every entry was
   * assumed to be something you cook.
   *
   * The precedent is one level down: a grocery row the user typed carries a
   * `txt_` id and a `label`, resolves to nothing, and matches no recipe. This is
   * the same shape for a day.
   */
  recipe_id?: string;
  /** What to call it when there is no recipe. Present exactly when `recipe_id` is not. */
  label?: string;
  /** Local calendar date, `YYYY-MM-DD`. Not a timestamp: a plan is for a DAY. */
  date: string;
  /**
   * Which meal. The four known slots plus anything the user types — reviewer:
   * "breakfast, lunch, dinner, snack, or custom time". Free text rather than an
   * enum with an escape hatch, because the escape hatch is the same field.
   */
  meal: string;
  created_at: string;
  /**
   * The cook this plan turned into, once it did.
   *
   * Absent means planned-not-yet-cooked, which includes every future date. The
   * link is what stops "Made it" on a planned meal from creating a second,
   * unrelated record of the same dinner.
   */
  cook_id?: string;
};

/**
 * A recipe the user added themselves — SOCIAL-INGEST §2's submission channel,
 * scaled down to one person.
 *
 * **It lives in the owner's file, never in `recipe-index.json`.** That index is
 * generated, and `npm run recipe-index` overwrites it — a user's own recipe
 * written there would survive exactly until the next pipeline run. The corpus
 * and the user's additions are merged per REQUEST, not into the module-level
 * cache, which is shared across owners.
 *
 * `requires` holds ingredient IDS, resolved by the same autosuggest the pantry
 * uses (UX-SPEC §7). That is the whole point: a recipe typed in by hand enters
 * the vocabulary already resolved, skipping every uncertainty a crawled line
 * has to survive — and it matches, plans and ranks like any other recipe from
 * the moment it is saved.
 *
 * There is no `unresolved`: nothing was parsed, so there is nothing we failed
 * to account for. What the user did not enter, they chose not to enter.
 */
export type OwnRecipe = {
  id: string;
  title: string;
  /** Where it came from — the video, the post, the blog. Always link out. */
  url: string;
  /** Host, or whatever oEmbed reported as the author. */
  source: string;
  /** Thumbnail from oEmbed. Absent is normal and fine. */
  image?: string;
  requires: string[];
  note?: string;
  /**
   * The method, for recipes the user owns — and ONLY those.
   *
   * *"We don't host the method — that's the source's"* is right, and it is a
   * statement about other people's recipes: their content, their traffic, their
   * page. Applying it to the user's own entry was a category error. Refusing to
   * hold Jae's steps protects nobody; it just means the one recipe in the
   * product that could work in a kitchen without a signal does not.
   *
   * Free text. No parsing, no numbered-step model — it is a note to themselves
   * about their own cooking, and structure here would be ceremony.
   */
  steps?: string;
  created_at: string;
};

/** One device's push endpoint, exactly as the browser hands it over. */
export type PushSub = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** When it was granted, so a stale endpoint can be aged out rather than kept forever. */
  added_at: string;
  /** Set when the push service says this endpoint is gone (404/410). */
  dead_at?: string;
};

/**
 * One answer to one permission question — PRIVACY-SPEC §5.
 *
 * Append-only, never edited in place. Withdrawing consent writes a NEW row with
 * `granted: false` rather than flipping the old one, and deletion strips the
 * owner link rather than removing the rows (`legal/privacy-policy.md` §13).
 *
 * The reason is that the question in a dispute is never *did they consent* — a
 * boolean answers that — it is **what were they told, and when**. A single
 * mutable flag cannot answer it, and by the time anyone asks, the wording it was
 * set under has been redesigned twice.
 *
 * `copy_hash` is the field that gets omitted and then wanted. `policy_version`
 * pins the published text; `copy_hash` pins the words on the toggle itself, and
 * they are not the same document. A toggle reworded without a policy change
 * would otherwise be unprovable.
 */
export type Consent = {
  /** Only one purpose exists. A union rather than a string, so a typo is a build error. */
  purpose: "commercial_aggregate";
  granted: boolean;
  /** Which published policy text was in force — PRIVACY-SPEC §5. */
  policy_version: string;
  /** Hash of the exact words shown beside the control. */
  copy_hash: string;
  granted_at: string;
  /** Set on the superseded row when a later row revokes it. */
  withdrawn_at?: string;
};

/**
 * Dietary restrictions — USER-SPEC §6.
 *
 * All three axes are live. This comment used to say only `excludes` was
 * implemented, because the ontology carried no `animal_source` and no
 * allergen tags; it now carries 676 and 701 of 2,806 respectively, covering
 * every one of the four provenance values and all nine allergens the UI
 * offers. `applyDiet` had been reading them correctly the whole time.
 *
 * What was actually broken was the WRITE: `setExcluded` assigned
 * `o.diet = { excludes }` and wiped the other two, so excluding one
 * ingredient silently cleared a user's vegetarian and shellfish settings.
 *
 * §6 still draws the line this shape depends on — "a filter that is 95%
 * right is a useful feature; an allergy filter that is 95% right is a
 * hazard" — and `dietVerdict` keeps it: allergens hide on any unresolved
 * line, classes do not. Partial coverage is therefore safe for allergens in
 * the only direction that matters: an untagged ingredient hides the recipe
 * rather than passing it.
 */
export type Diet = {
  excludes: string[];
  /** USER-SPEC §6 — provenance choices, read off `animal_source`. */
  classes?: string[];
  /** USER-SPEC §6 — major allergens. Always strict: see `applyDiet`. */
  allergens?: string[];
};

export type Owner = {
  id: string;
  created_at: string;
  /**
   * USER-SPEC §1: *"email text? — null until they sign up."*
   *
   * Nothing writes this yet, and that is the point of having it: "does this
   * owner have an account" is a question about stored data, and it is NOT the
   * question `lib/account.ts` answers. `signedIn()` asks whether the current
   * REQUEST carries a session, which is what gates a button. Whether an owner
   * ever signed up is what decides — months later, in a batch job with no
   * request anywhere near it — that their pantry may be counted for a partner
   * (`lib/pool.ts`). Conflating the two would make an offline job depend on a
   * cookie.
   */
  email?: string;
  /**
   * When an account was attached to this kitchen — the marker `signedIn` and
   * `hasAccount` read now that `email` is optional (CREATORS-TAB-SPEC §6). The
   * old rule stamped `email` here and the batch jobs read it; accounts created
   * since ids landed may have no address at all, so the fact "has an account"
   * gets its own field instead of borrowing one that means something else.
   */
  account_at?: string;
  ingredients: Record<string, UserIngredient>;
  /** Recipes this user added by hand. */
  own: OwnRecipe[];
  /** RECIPE-SPEC §4, keyed by recipe id. */
  recipes: Record<string, UserRecipe>;
  /** The calendar. */
  plans: PlanEntry[];
  /**
   * Creators this user follows — CREATORS-TAB-SPEC §4.
   *
   * On the owner, not the creator: a follow is the follower's fact (it shapes
   * THEIR tab), and the creator-side count is derivable the day anything is
   * allowed to want it — nothing is, at v1. Ordered by `followed_at` so the
   * tab can show "most recently followed first" without a sort key invented
   * later. Written only for signed-in owners; the actions enforce it.
   */
  follows?: Array<{ creator_id: string; followed_at: string }>;
  /**
   * @deprecated Pre-`recipes` shape. Read by `upgrade` and then removed; never
   * written. Kept on the type so the migration can see it without a cast.
   */
  saved?: string[];
  cooks: CookEvent[];
  /**
   * Web-push subscriptions for this owner — UX-SPEC §12.
   *
   * A list, not one: the same pantry can be open on a phone and a laptop, and a
   * reminder that only reached whichever device subscribed last would be a
   * reminder you cannot rely on.
   *
   * §12 spends this permission on exactly one thing: *"'Use first' is the entire
   * urgency mechanism, and a pin is the user telling us something is dying.
   * Without a way to reach them later, that signal expires unused in a tab
   * nobody reopened."* Never re-engagement, never "new recipes this week".
   */
  push?: PushSub[];
  /**
   * Current answers to clarifications (INGREDIENT-SPEC §6), by id.
   *
   * A CURRENT STATE, not a settled preference. Reviewer: *"it depends on the
   * situation. It should ask every time."* Which is right — this month your
   * kimchi is swimming in brine and next month it is not, so an answer stored
   * once and never revisited is a wrong answer waiting to happen.
   *
   * So the question is not suppressed once answered. It sits in the item's
   * widget permanently, showing the current answer, and flipping it is one tap.
   * That satisfies "ask every time" without nagging: the widget only opens when
   * the user taps the ingredient, so the question appears exactly when they are
   * already looking at the thing it is about.
   */
  answers?: Record<string, boolean>;
  /**
   * The standing answer to "did that go in the kitchen?" — DEAD, and kept.
   *
   * §4g's question is gone (CART-SPEC §4): a tick fills the cart and the
   * kitchen question is asked once, at the door. Nothing reads this field and
   * nothing writes it; `setTickPreference` went with the dialog.
   *
   * It stays in the type because it is in people's files, and INGREDIENT-SPEC
   * §1's rule is that we do not rewrite a user's data to suit a new shape.
   * Deleting the field from the type would make the next writer of this file
   * silently drop it, which is a rewrite by another name.
   */
  tick_to_pantry?: boolean;
  /** See the `Diet` type above for why the axes never share a write. */
  diet?: Diet;
  /**
   * Permission history — PRIVACY-SPEC §5. Absent means never asked.
   *
   * Absent is NOT "no", and nothing should ever read it as a tri-state: the gate
   * in `lib/pool.ts` treats absent and refused identically, because the only
   * question it asks is whether a live grant exists. Keeping them distinct here
   * is for the audit trail, not for the gate.
   */
  consent?: Consent[];
  /**
   * When first run was answered — or dismissed. DECISIONS §3.
   *
   * A flag rather than "does this owner have any rows", because skipping has to
   * stick. Someone who declines the starter list and adds nothing would
   * otherwise be asked again on every visit, which turns a one-time courtesy
   * into a nag and teaches them to dismiss panels without reading them.
   *
   * Absent means never asked. It is not a claim that anything was ACCEPTED —
   * "answered" includes "no thanks".
   */
  onboarded_at?: string;
  /**
   * The last WRITE, stamped by the shell's write path — see `lastActive`.
   *
   * Deliberately not "last seen": page renders do not write, so a returning
   * user's first load still reports the old value and the welcome-back review
   * can fire on it. A read-stamped field would refresh itself just before the
   * check that needed it.
   */
  last_active_at?: string;
};

const now = () => new Date().toISOString();

export const blank = (id: string): Owner =>
  ({ id, created_at: now(), ingredients: {}, recipes: {}, own: [], plans: [], cooks: [], answers: {} });

/**
 * Bring an owner read off disk up to the current shape.
 *
 * In-place and idempotent, run on every read. It does NOT write — a migration
 * that rewrites the file on a page load would touch the pantry during a plain
 * GET, and the one thing this store guarantees is that reads cannot damage it.
 * The upgraded shape persists on the next real write, and until then it is
 * simply what the code sees.
 *
 * `saved: string[]` → a `user_recipe` row each. A saved recipe has no note and
 * no cook history attached at migration time, so `added_at` is the only field
 * we cannot recover; the owner's own creation date is the honest floor.
 */
export function upgrade(o: Owner): Owner {
  o.recipes ??= {};
  o.ingredients ??= {};
  o.plans ??= [];
  o.own ??= [];
  o.cooks ??= [];
  if (o.saved) {
    for (const recipeId of o.saved) {
      const row = o.recipes[recipeId];
      if (row) row.saved = true;
      else o.recipes[recipeId] = { recipe_id: recipeId, saved: true, added_at: o.created_at };
    }
    delete o.saved;
  }
  /**
   * `dismissed_until` → `dismissed_at`. A dismissal that had not yet lapsed is
   * carried over and becomes permanent — the user's instruction is honoured in
   * the shape it now has. One that had already lapsed is dropped rather than
   * resurrected: it stopped applying under the old rule, and making a fortnight
   * of old "not tonight"s permanent on the next page load would hide recipes
   * nobody has rejected recently.
   */
  for (const row of Object.values(o.recipes)) {
    if (!row.dismissed_until) continue;
    if (!row.dismissed_at && Date.parse(row.dismissed_until) > Date.now()) {
      row.dismissed_at = now();
    }
    delete row.dismissed_until;
  }
  return o;
}

/**
 * The two ingredient clocks, maintained for EVERY write rather than per caller.
 *
 * Ten functions can put something in the pantry or take it out — `setState`,
 * the list, the shopping trip, onboarding, a clarification answer, settling up
 * after a cook. Asking each one to remember the history rules is asking for the
 * one that forgets, and the symptom would be a single ingredient with a wrong
 * age that nobody could reproduce.
 *
 * So it is derived from the transition instead, here, where every write passes:
 *
 *   held → empty   the row survives as a tombstone, stamped `removed_at`
 *   empty → held   a new instance: `added_at` restarts, `first_added_at` does
 *                  not, and the tombstone mark goes
 *
 * "Held" means either flag. A thing on the list you do not have yet is still
 * something you are keeping track of, and its history starts when you first
 * wanted it, not when you finally bought it.
 */
/* A cart row is held: it is a thing you are keeping track of, and its history
   must not record a removal because you picked it up in a shop. */
export const isHeld = (r: UserIngredient) => r.in_pantry || r.on_list || !!r.in_cart;

export type Snap = { held: boolean; on_list: boolean; in_pantry: boolean; in_cart: boolean };
export const snap = (r: UserIngredient): Snap =>
  ({ held: isHeld(r), on_list: r.on_list, in_pantry: r.in_pantry,
     in_cart: !!r.in_cart });

/** The before-map the shells hand to `stampHistory` and `pantryEvents`. */
export const snapshot = (o: Owner): Map<string, Snap> =>
  new Map(Object.entries(o.ingredients ?? {}).map(([id, r]) => [id, snap(r)]));

export function stampHistory(before: Map<string, Snap>, o: Owner) {
  for (const [id, row] of Object.entries(o.ingredients)) {
    const was = before.get(id);
    /*
      The shopping trip: it was on the list, it was not in the pantry, and now
      it is. Both `tickOff` (one item as the trolley fills) and `moveToPantry`
      (the whole basket) land here, which is the argument for deriving it rather
      than stamping it in each — they are the same event and were written months
      apart.
    */
    if (was?.on_list && !was.in_cart && row.in_cart) row.checked_out_at = now();
    else if (was?.on_list && !was.in_pantry && row.in_pantry) row.checked_out_at = now();

    if ((was?.held ?? false) === isHeld(row)) continue;
    if (isHeld(row)) {
      row.added_at = now();
      row.first_added_at ??= row.added_at;
      delete row.removed_at;
    } else {
      row.removed_at = now();
    }
  }
}

/**
 * The trajectory — BEHAVIOR-SPEC §§3–4, derived where every write passes.
 *
 * The owner blob is current state and it is MUTABLE: rebuying overwrites,
 * settling up overwrites, and that is right for rendering a pantry. The
 * behavioural record needs the opposite — the sequence, kept — so every
 * `in_pantry` transition becomes a descriptor here, derived from the same
 * before/after diff `stampHistory` uses and for the same reason it gives:
 * ten functions can put something in the pantry or take it out, and asking
 * each one to remember to log is asking for the one that forgets.
 *
 * DESCRIPTORS, not appends: which log they land in — `events.jsonl` on the
 * server, a beacon to `/api/events` from a device — is the shell's business,
 * as is `source` (BEHAVIOR-SPEC §4's highest-value field: the caller knows
 * whether this was setup, a shop, or a cook; a diff cannot guess).
 * `from_list` is the checkout fact — it was on the list and now it is
 * held — recorded as a fact rather than inferred as a claim.
 *
 * Free-text rows never enter the record (BEHAVIOR-SPEC §6): a `txt_` id is a
 * label, a label is free text, and free text stays out structurally.
 */
export type PantryEvent = { node_id: string; op: "add" | "remove"; from_list?: true };

export function pantryEvents(before: Map<string, Snap>, o: Owner): PantryEvent[] {
  const out: PantryEvent[] = [];
  for (const [id, row] of Object.entries(o.ingredients)) {
    if (isFreeText(id)) continue;
    const was = before.get(id);
    if ((was?.in_pantry ?? false) === row.in_pantry) continue;
    out.push({
      node_id: id,
      op: row.in_pantry ? "add" : "remove",
      /* `was.in_cart` as well as `was.on_list`: the checkout fact used to be
         readable at the moment the pantry gained the row, because the tick did
         both at once. It is two moments now, and the list flag is already off
         by the time the thing is put away. */
      ...(row.in_pantry && (was?.on_list || was?.in_cart) ? { from_list: true as const } : {}),
    });
  }
  // A row deleted outright while held is a removal too. No current writer
  // deletes a canonical row — tombstones survive — but the record must not
  // depend on that staying true in a file this long.
  for (const [id, was] of before) {
    if (was.in_pantry && !(id in o.ingredients) && !isFreeText(id)) {
      out.push({ node_id: id, op: "remove" });
    }
  }
  return out;
}

export type StateFlags =
  Partial<Pick<UserIngredient, "in_pantry" | "on_list" | "use_first" | "in_cart">>;

/** A row that has never existed before — both clocks start together. */
const freshRow = (id: string, flags: StateFlags): UserIngredient => ({
  ingredient_id: id, in_pantry: false, on_list: false, use_first: false,
  added_at: now(), first_added_at: now(), ...flags,
});

/**
 * Set the three flags. This is what the state widget calls.
 *
 * `in_pantry` and `on_list` are independent (INGREDIENT-SPEC §2) — an item can
 * be both, because "I have soy sauce and I'm nearly out" is ordinary.
 * `use_first` is a qualifier on having it, so clearing `in_pantry` clears the
 * pin rather than leaving a pin on something the user no longer has.
 */
export function setState(o: Owner, ingredientId: string, flags: StateFlags): void {
  const row = o.ingredients[ingredientId] ?? {
    ingredient_id: ingredientId, in_pantry: false, on_list: false,
    use_first: false, added_at: now(), first_added_at: now(),
  };
  const wasPinned = row.use_first;
  Object.assign(row, flags);
  if (!row.in_pantry) row.use_first = false;
  /* Saying you have it means it is home, so it is out of the cart — the same
     shape as the pin rule above: a flag that qualifies another one cannot
     outlive it. CART-SPEC §2. */
  if (row.in_pantry) row.in_cart = false;
  // Stamp on the TRANSITION, not on every write, so re-saving an unrelated
  // flag does not quietly renew a pin the user set a week ago.
  if (row.use_first && !wasPinned) row.pinned_at = now();
  if (!row.use_first) delete row.pinned_at;

  /*
    The row survives going empty. It used to be deleted — "a row with every
    flag off is not a record of anything" — and that was true right up until
    it had a history to lose. Deleting it meant re-adding minted a fresh
    `added_at`, so the age the away-panel shows was wrong after every rebuy,
    which is the most ordinary thing that happens to a pantry item.

    A tombstone is inert here rather than something downstream must learn
    about: every reader of this map already filters on `in_pantry`,
    `on_list` or `pinLive` — `heldCount`, `pantryOf`, the staleness panel,
    the grocery list, the reminder script — so a row with both flags off is
    already invisible to all of them.

    The stamping itself is not here. `stampHistory` derives it from the
    transition for every write, because ten functions can empty a row and
    only one of them is this one.
  */
  o.ingredients[ingredientId] = row;
}

/**
 * Add a recipe of the user's own.
 *
 * The id is prefixed `rec_own_` so it can never collide with a generated one
 * and so anything downstream can tell at a glance where a recipe came from.
 */
export function addOwnRecipe(
  o: Owner,
  r: { title: string; url: string; source: string; image?: string; requires: string[];
       note?: string; steps?: string },
): OwnRecipe {
  const title = r.title.trim();
  if (!title) throw new Error("A recipe needs a title.");
  if (!/^https?:\/\//i.test(r.url)) throw new Error("A recipe needs a link to where it came from.");
  const made: OwnRecipe = {
    id: `rec_own_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    title, url: r.url, source: r.source || new URL(r.url).hostname.replace(/^www\./, ""),
    ...(r.image ? { image: r.image } : {}),
    // Deduplicated: the same ingredient twice in one recipe is one requirement.
    requires: [...new Set(r.requires)],
    ...(r.note ? { note: r.note } : {}),
    ...(r.steps ? { steps: r.steps } : {}),
    created_at: now(),
  };
  o.own.push(made);
  return made;
}

/**
 * Import many recipes at once — a saved collection arriving in one go.
 *
 * One write, so 200 rows are one persist rather than 200. And deduped by
 * URL against what is already there, because the realistic second use of an
 * import button is running it again after saving a few more videos: the user
 * expects the new ones, not a second copy of everything.
 *
 * Everything lands with NO ingredients, which is honest — nothing has been
 * parsed. `AddRecipe` already allows that and the modal already says what it
 * costs (it will not match your pantry). At import scale that caveat stops
 * being incidental: this is how "Added by me" fills with rows that cannot rank,
 * which is why the count of ingredient-less recipes is worth surfacing after.
 */
export function addOwnRecipes(
  o: Owner,
  rows: Array<{ title: string; url: string; source: string; image?: string; note?: string }>,
): { added: number; skipped: number } {
  let added = 0, skipped = 0;
  const have = new Set(o.own.map((r) => canonicalUrl(r.url)));
  for (const r of rows) {
    const title = r.title.trim();
    // A row with no title or no link is not importable, and refusing the
    // whole batch for one bad row would be worse than dropping it.
    if (!title || !/^https?:\/\//i.test(r.url)) { skipped++; continue; }
    const key = canonicalUrl(r.url);
    if (have.has(key)) { skipped++; continue; }
    have.add(key);
    o.own.push({
      id: `rec_own_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
      title, url: r.url,
      source: r.source || new URL(r.url).hostname.replace(/^www\./, ""),
      ...(r.image ? { image: r.image } : {}),
      requires: [],
      ...(r.note ? { note: r.note } : {}),
      created_at: now(),
    });
    added++;
  }
  return { added, skipped };
}

/**
 * Two links to the same video are one recipe.
 *
 * Host and path only. TikTok share links carry tracking parameters that differ
 * every time the same video is shared, so comparing whole URLs would import the
 * same dinner as many times as it was copied.
 */
function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.hostname.replace(/^www\./i, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

/** Edit one of the user's own recipes. Absent fields are left alone. */
export function updateOwnRecipe(
  o: Owner, recipeId: string,
  patch: { title?: string; url?: string; requires?: string[]; note?: string; image?: string;
           steps?: string },
): void {
  const r = o.own.find((x) => x.id === recipeId);
  if (!r) throw new Error("That recipe is not one of yours.");
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) throw new Error("A recipe needs a title.");
    r.title = t;
  }
  if (patch.url !== undefined) {
    if (!/^https?:\/\//i.test(patch.url)) throw new Error("That is not a link.");
    r.url = patch.url;
  }
  if (patch.requires) r.requires = [...new Set(patch.requires)];
  if (patch.note !== undefined) {
    const n = patch.note.trim();
    if (n) r.note = n; else delete r.note;
  }
  if (patch.steps !== undefined) {
    const st = patch.steps.trim();
    if (st) r.steps = st; else delete r.steps;
  }
  if (patch.image !== undefined) {
    if (patch.image) r.image = patch.image; else delete r.image;
  }
}

/**
 * Delete one of the user's own recipes.
 *
 * Plans and cooks that point at it are LEFT ALONE, deliberately. A cook is a
 * record of an evening that happened; deleting the recipe does not un-happen
 * it, and the calendar already handles a row whose recipe it cannot resolve.
 */
export function deleteOwnRecipe(o: Owner, recipeId: string): void {
  const at = o.own.findIndex((x) => x.id === recipeId);
  if (at < 0) throw new Error("That recipe is not one of yours.");
  o.own.splice(at, 1);
}

/**
 * Put several things on the grocery list in one write.
 *
 * A loop of `setState` would be N persists and N revalidations for what the
 * user experienced as one decision — and a failure halfway would leave the list
 * holding an arbitrary prefix of what they confirmed. One mutation, or none.
 *
 * Only ever turns `on_list` ON. It cannot touch `in_pantry`, so confirming a
 * shopping basket can never quietly claim you already have something.
 */
export function addToList(o: Owner, ingredientIds: string[]): void {
  for (const id of ingredientIds) {
    const row = o.ingredients[id];
    if (row) { row.on_list = true; continue; }
    o.ingredients[id] = freshRow(id, { on_list: true });
  }
}

/**
 * Move things from the grocery list into the pantry — you went shopping.
 *
 * One write, for the same reason `addToList` is: this is one decision the user
 * made about a basket, and a failure halfway through a loop would leave the
 * list holding an arbitrary remainder of what they said they had bought.
 *
 * `on_list` goes OFF and `in_pantry` goes ON. It is not a copy: a thing you
 * have bought is no longer a thing to buy, and leaving it on the list is how a
 * grocery list silently becomes a list of everything you own.
 */
export function moveToPantry(o: Owner, ingredientIds: string[]): void {
  for (const id of ingredientIds) {
    const row = o.ingredients[id];
    // `checked_out_at` is stamped by `stampHistory` from the transition, not
    // here — `tickOff` is the same event one item at a time.
    if (row) { row.in_pantry = true; row.on_list = false; continue; }
    // Not on the list at all is still a coherent request — put it in the
    // pantry. Refusing would be pedantry about a row we can simply create.
    o.ingredients[id] = freshRow(id, { in_pantry: true });
  }
  // The checkout is the closest thing the record has to an acquisition —
  // BEHAVIOR-SPEC §1's "pantry ADD" step, and the list is where gaps land.
}

/**
 * A whole session of ticking, written once — the browse grid's Save.
 *
 * `moveToPantry` above is the one-directional version of this and stays as it
 * is: it answers "these came off the list". This answers "here is what my
 * kitchen looks like now", which includes the boxes that were UNticked.
 *
 * One write for the lot, and that is the point: twenty ticks as twenty
 * actions is twenty persists racing each other over the same state. The grid
 * stages them and sends one call.
 *
 * Unticking clears the pin for the same reason `setState` does: a pin is a
 * property of something you have, and keeping one on an empty cupboard would
 * hard-filter the grid on an ingredient the user just said they were out of.
 */
export function setManyInPantry(o: Owner, add: string[], remove: string[]): void {
  for (const id of add) {
    const row = o.ingredients[id];
    if (row) { row.in_pantry = true; row.on_list = false; }
    else o.ingredients[id] = freshRow(id, { in_pantry: true });
  }
  for (const id of remove) {
    const row = o.ingredients[id];
    if (!row) continue;
    row.in_pantry = false;
    row.use_first = false;
  }
}

/**
 * Note that a recipe was opened. The lightest write in the product.
 *
 * Creates the row if there is none: opening a recipe you have never touched is
 * exactly the case Explore needs to remember, so refusing to record it would
 * miss every first look.
 *
 * Deliberately does NOT touch `added_at` semantics or any other field — an
 * open is not an interaction with the recipe's content, and a glance must not
 * look like a save to anything reading this row later.
 */
export function markOpened(o: Owner, recipeId: string): void {
  const row = o.recipes[recipeId];
  if (row) { row.opened_at = now(); return; }
  o.recipes[recipeId] = {
    recipe_id: recipeId, saved: false, opened_at: now(), added_at: now(),
  };
}

export function setDetail(
  o: Owner, ingredientId: string,
  detail: Partial<Pick<UserIngredient, "note" | "portion" | "storage" | "brand" | "buy_instead">>,
): void {
  const row = o.ingredients[ingredientId];
  if (row) Object.assign(row, detail);
}

/**
 * Answer a clarification. `yes` grants the ingredient; `no` is remembered so the
 * question is not asked again.
 */
export function answerClarification(
  o: Owner, askId: string, yes: boolean, grants: string,
): void {
  o.answers = { ...(o.answers ?? {}), [askId]: yes };
  if (!yes) {
    // Changing the answer to no takes the ingredient back out, otherwise a
    // correction leaves the pantry claiming something the user just denied.
    const row = o.ingredients[grants];
    if (row) {
      row.in_pantry = false;
      row.use_first = false;
      // Left standing rather than deleted, for the reason `setState` gives:
      // the row is now a tombstone and carries the history.
    }
    return;
  }
  const row = o.ingredients[grants];
  if (row) { row.in_pantry = true; return; }
  o.ingredients[grants] = {
    ingredient_id: grants, in_pantry: true, on_list: false,
    use_first: false, added_at: now(),
  };
}

/**
 * Never show me recipes with this in them.
 *
 * §6's "assert contains, never free-of" applies unchanged: we hide what we can
 * SEE. A recipe is hidden because we found the ingredient in it, never because
 * we believe it absent from the others.
 */
/**
 * One axis, and only that axis.
 *
 * This used to assign `o.diet = { excludes }`, which silently wiped `classes`
 * and `allergens` — so excluding a single ingredient cleared a user's
 * vegetarian and shellfish settings, and the restrictions summary then read
 * them back as unset. The filter was working the whole time; the write was
 * deleting what it filtered on.
 *
 * `setDiet` below has the mirror of this rule, and the two are the reason the
 * axes are separate fields rather than one blob: a write to one must never be
 * able to express an opinion about the others.
 */
export function setExcluded(o: Owner, ingredientId: string, excluded: boolean): void {
  const cur = new Set(o.diet?.excludes ?? []);
  if (excluded) cur.add(ingredientId); else cur.delete(ingredientId);
  o.diet = {
    ...(o.diet ?? {}),
    excludes: [...cur].sort(),
  };
}

/**
 * Set a whole dietary axis at once.
 *
 * `classes` and `allergens` are lists rather than toggles because the UI shows
 * them as a set and a partial write would silently drop the rest.
 */
export function setDiet(
  o: Owner,
  patch: { classes?: string[]; allergens?: string[] },
): void {
  o.diet = {
    excludes: o.diet?.excludes ?? [],
    classes: patch.classes ?? o.diet?.classes ?? [],
    allergens: patch.allergens ?? o.diet?.allergens ?? [],
  };
}

/**
 * Record an answer to a permission question — PRIVACY-SPEC §5.
 *
 * Appends. The previous live grant, if any, is stamped `withdrawn_at` so the
 * history reads as a sequence of periods rather than a pile of rows whose order
 * has to be trusted.
 *
 * Note what this does NOT do: it does not touch, copy, move or delete a single
 * ingredient. Consent is read at computation time (`lib/pool.ts`), so granting
 * and withdrawing are both pure record-keeping and neither can lose data. That
 * is the same shape as USER-SPEC §4's "aggregates are recomputed, not
 * decremented", and it is why withdrawal needs no undo path.
 */
export function setConsent(
  o: Owner,
  answer: {
    purpose: Consent["purpose"];
    granted: boolean;
    policy_version: string;
    copy_hash: string;
  },
): void {
  o.consent ??= [];
  const stamp = now();
  for (const row of o.consent) {
    if (row.purpose === answer.purpose && row.granted && !row.withdrawn_at) {
      row.withdrawn_at = stamp;
    }
  }
  o.consent.push({ ...answer, granted_at: stamp });
}

/**
 * First run, answered — DECISIONS §3, ONTOLOGY-SEED Tier 1.
 *
 * One write, so a half-finished onboarding cannot leave a diet with no pantry or
 * a pantry with no diet. The same reasoning `setDiet` gives for writing both of
 * its axes together.
 *
 * `have` is what the user LEFT TICKED. The starter list arrives pre-checked and
 * is unticked to correct it — §3's "never show a blank field; always show a
 * guess to correct" — but nothing here is assumed: what lands in the pantry is
 * exactly what came back, and an empty array is a legitimate answer meaning "I
 * have none of these".
 *
 * Marking it answered is unconditional, including when the user skipped. Being
 * asked once is a courtesy; being asked every visit is a nag.
 */
export function completeOnboarding(
  o: Owner,
  answer: { have?: string[]; classes?: string[]; allergens?: string[] },
): void {
  for (const id of answer.have ?? []) {
    const row = o.ingredients[id];
    if (row) row.in_pantry = true;
    else o.ingredients[id] = {
      ingredient_id: id, in_pantry: true, on_list: false,
      use_first: false, added_at: now(),
    };
  }
  if (answer.classes || answer.allergens) {
    o.diet = {
      excludes: o.diet?.excludes ?? [],
      classes: answer.classes ?? o.diet?.classes ?? [],
      allergens: answer.allergens ?? o.diet?.allergens ?? [],
    };
  }
  o.onboarded_at = now();
}

/** The `user_recipe` row, created on demand — §4's "exists as soon as they save OR cook". */
export function rowFor(o: Owner, recipeId: string): UserRecipe {
  return (o.recipes[recipeId] ??= { recipe_id: recipeId, saved: false, added_at: now() });
}

/**
 * "Don't recommend this." Sets it, or clears it if it is already set.
 *
 * One control both ways: the button that hides a recipe is the button that
 * brings it back, so the undo needs no second affordance and no separate
 * concept — and since the instruction no longer expires, that button is the
 * ONLY thing that can undo it. See `UserRecipe.dismissed_at`.
 */
export function toggleDismissed(o: Owner, recipeId: string): void {
  const row = rowFor(o, recipeId);
  if (row.dismissed_at) { delete row.dismissed_at; return; }
  row.dismissed_at = now();
}

/**
 * Record a device's push subscription — UX-SPEC §12.
 *
 * Keyed on the endpoint, which is the browser's own unique handle for the
 * device: re-subscribing on the same phone updates the keys rather than growing
 * a second row, and a phone that has been re-registered after a browser reset
 * simply arrives as a new endpoint.
 */
export function addPushSub(
  o: Owner, sub: { endpoint: string; keys: { p256dh: string; auth: string } },
): void {
  const list = (o.push ??= []);
  const at = list.findIndex((p) => p.endpoint === sub.endpoint);
  const row: PushSub = {
    endpoint: sub.endpoint, keys: sub.keys, added_at: new Date().toISOString(),
  };
  if (at === -1) list.push(row); else list[at] = row;
}

/**
 * Drop a subscription the push service has told us is gone.
 *
 * 404 and 410 are the two answers that mean "this endpoint will never work
 * again" — anything else (a timeout, a 500) is the service having a bad day and
 * must NOT delete a working subscription.
 */
export function dropPushSub(o: Owner, endpoint: string): void {
  o.push = (o.push ?? []).filter((p) => p.endpoint !== endpoint);
}

/**
 * Follow / unfollow a creator — CREATORS-TAB-SPEC §4.
 *
 * A set, not a toggle: the button is optimistic, so the client already knows
 * which state it means, and an explicit `on` cannot double-flip when a retry
 * lands twice. Unfollow deletes the entry outright — there is nothing else on
 * it worth keeping, unlike a recipe row.
 */
export function setFollowing(o: Owner, creatorId: string, on: boolean): void {
  const follows = (o.follows ??= []);
  const at = follows.findIndex((f) => f.creator_id === creatorId);
  if (on && at === -1) follows.push({ creator_id: creatorId, followed_at: new Date().toISOString() });
  if (!on && at !== -1) follows.splice(at, 1);
  if (follows.length === 0) delete o.follows;
}

export function toggleSaved(o: Owner, recipeId: string): void {
  const row = rowFor(o, recipeId);
  row.saved = !row.saved;
  // Unsaving must not discard a note or the fact they once cooked it. The row
  // is only pointless when the flag is off AND it holds nothing else.
  if (!row.saved && !row.note) delete o.recipes[recipeId];
}

/** Their standing note on the dish (RECIPE-SPEC §4). Empty clears it. */
export function setRecipeNote(o: Owner, recipeId: string, note: string): void {
  const row = rowFor(o, recipeId);
  const text = note.trim();
  if (text) row.note = text; else delete row.note;
  if (!row.saved && !row.note) delete o.recipes[recipeId];
}

/**
 * `YYYY-MM-DD` for a date, in LOCAL time.
 *
 * `toISOString().slice(0,10)` is the tempting one-liner and it is wrong: it
 * converts to UTC first, so anyone west of Greenwich gets yesterday's date for
 * most of their evening — which is exactly when someone records dinner.
 */
export function dayKey(d: Date = new Date(), tz?: string): string {
  /**
   * The USER's zone when we know it, not the server's.
   *
   * This matters more than it looks. The server runs in UTC, so without a zone
   * a cook recorded at 6pm in California lands on TOMORROW's square, and the
   * calendar starts highlighting the wrong day every evening. `en-CA` is used
   * only because its short date format is already `YYYY-MM-DD`.
   */
  if (tz) {
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
      }).format(d);
    } catch {
      // An unknown zone is a cookie someone edited, not a reason to fail a page
      // load. Fall through to the process zone.
    }
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ── who mints an id, and why it is now a question ──────────────────────────
 *
 * A cook and a plan are addressed BY ID: `settleCook`, `amendCook`, `undoCook`
 * and `unplanRecipe` all take one. While both shells minted their own, the id
 * a modal was holding did not exist in the other store, and that single fact
 * is what kept the cook log off the device for a slice — a cook the device
 * could record but nobody could correct is worse than one it never heard of.
 *
 * So the minting is named and exported, and the reducers ACCEPT an id rather
 * than always making one. The DEVICE mints (it is the writer now — STATIC-SPEC
 * §2) and the server takes what it is given; absent an id, the server mints as
 * it always did, so a caller that has not been converted is unaffected.
 *
 * Timestamp alone collides: two cooks recorded in the same millisecond took the
 * same id, and a log with duplicate ids cannot be pointed at. The suffix is for
 * uniqueness only — nothing orders by it.
 */
export const mintCookId = (): string =>
  `ck_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const mintPlanId = (): string =>
  `pl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * A day entry that is not a dish — RECIPE-SPEC §4d.
 *
 * **A note is not an undecided meal; it is a decided one.** That is what earns
 * it a row rather than leaving the square blank, and it is why it changes the
 * shopping question: `planStatuses` needs a recipe to compute what a meal takes,
 * so a note contributes nothing to `planNeeds` — which is correct, because a day
 * you are eating out is a day that needs nothing bought. A blank square would
 * have said the same thing about a day you simply had not filled in yet.
 *
 * It is never `done`, never links to a cook, and never offers "Made it". There
 * is nothing to record: the note IS the record.
 */
export function planNote(
  o: Owner, label: string, date: string, meal: string, id?: string,
): PlanEntry {
  const text = label.trim();
  if (!text) throw new Error("Give it a name.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Not a calendar date: ${date}`);
  const entry: PlanEntry = {
    id: id ?? mintPlanId(),
    label: text.slice(0, 60), date, meal: meal.trim() || "dinner", created_at: now(),
  };
  o.plans.push(entry);
  return entry;
}

/** Plan a recipe onto a date and meal. Returns the entry. */
export function planRecipe(
  o: Owner, recipeId: string, date: string, meal: string, id?: string,
): PlanEntry {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Not a calendar date: ${date}`);
  const entry: PlanEntry = {
    id: id ?? mintPlanId(),
    recipe_id: recipeId, date, meal: meal.trim() || "dinner", created_at: now(),
  };
  o.plans.push(entry);
  return entry;
}

/**
 * Remove a plan.
 *
 * The cook it points at, if any, STAYS. Two rows means exactly this: unplanning
 * Monday's dinner after you ate it should not delete the record that you ate it.
 * Undoing the cook is `undoCook`, and it is a different decision.
 */
export function unplanRecipe(o: Owner, planId: string): void {
  const at = o.plans.findIndex((p) => p.id === planId);
  if (at < 0) throw new Error("That plan is no longer on your calendar. Reload the page.");
  o.plans.splice(at, 1);
}

/** Point a plan at the cook it became. */
export function linkPlanToCook(o: Owner, planId: string, cookId: string): void {
  const plan = o.plans.find((p) => p.id === planId);
  if (!plan) throw new Error("That plan is no longer on your calendar. Reload the page.");
  plan.cook_id = cookId;
}

/**
 * Which cook a write is aimed at.
 *
 * By EVENT ID, not "the most recent". The calendar binds a recipe to a date, and
 * rating "that specific date's cooking" means Monday's dinner can be rated on
 * Friday — so latest-wins was never going to hold. Pointing at the event says
 * exactly which meal is meant, whichever page the user came from.
 */
export function eventAt(o: Owner, cookId: string): { at: number; cook: CookEvent } {
  const at = o.cooks.findIndex((c) => c.id === cookId);
  if (at < 0) throw new Error("That cook is no longer in your history. Reload the page.");
  return { at, cook: o.cooks[at]! };
}

/**
 * Undo a cook, and everything recorded about it.
 *
 * The one real exception to §4's append-only rule, and it is deliberate: an
 * accidental tap should not leave a permanent event, and a rating attached to a
 * meal that never happened is worse data than no rating.
 *
 * It does NOT reverse the pantry. `recordCook` sets `in_pantry` on everything
 * the dish used, and nothing records which rows it created versus which were
 * already there — so undoing could delete ingredients the user added by hand.
 * DECISIONS §5 makes cooking additive; this stays additive too, and the UI says
 * so rather than guessing.
 */
export function undoCook(o: Owner, cookId: string): void {
  const { at } = eventAt(o, cookId);
  o.cooks.splice(at, 1);
}

/**
 * Fill in how a cook went, after the fact.
 *
 * §4 calls CookEvent append-only, and that rule is about not rewriting history.
 * This is the other thing: completing a record that was deliberately left blank,
 * because UX-SPEC §5 says the tap meaning "I'm cooking this" must not be taxed
 * with a form. So "Made it" logs immediately and the rating, note and swaps
 * arrive whenever the user gets to them.
 *
 * What keeps that from becoming an edit is WHICH FIELDS, not which event. The
 * facts of the cooking — when it happened, what the recipe required, which
 * recipe it was — are never writable here. Only the reflective fields are, and
 * they were always the user's to change their mind about.
 */
export function amendCook(
  o: Owner, cookId: string,
  patch: { rating?: number; note?: string; meal?: string;
           substituted?: CookEvent["substituted"]; skipped?: string[] },
): void {
  const { cook } = eventAt(o, cookId);
  if (patch.meal !== undefined) {
    const meal = patch.meal.trim();
    // Which meal it was is a fact the user is reporting late, not one we
    // recorded and are now rewriting — so unlike `cooked_at` it is writable.
    if (meal) cook.meal = meal; else delete cook.meal;
  }
  if (patch.rating !== undefined) {
    // 1..5 (§4). A rating outside it would silently distort every average
    // computed over the log later.
    if (!Number.isInteger(patch.rating) || patch.rating < 1 || patch.rating > 5)
      throw new Error(`Rating must be a whole number from 1 to 5 (got ${patch.rating}).`);
    cook.rating = patch.rating;
  }
  if (patch.note !== undefined) {
    const text = patch.note.trim();
    if (text) cook.note = text; else delete cook.note;
  }
  if (patch.substituted) cook.substituted = patch.substituted;
  if (patch.skipped) cook.skipped = patch.skipped;
}

/** What a cook arrives as, before the store mints its identity. */
export type CookDraft = {
  required: string[]; substituted?: CookEvent["substituted"]; skipped?: string[];
  rating?: number; note?: string; cookedAt?: string; meal?: string;
  /**
   * The identity, when the CALLER already decided it — see `mintCookId`.
   *
   * The device mints before it writes, so the same id reaches this reducer on
   * the device and the server action mirroring it, and every amendment
   * afterwards points at one cook in both copies. Absent, one is minted here
   * exactly as it always was.
   */
  id?: string;
  /** For the behavioural record only — BEHAVIOR-SPEC §4. The action
   *  knows whether a plan was ticked off; this reducer cannot. */
  source?: "planned" | "spontaneous";
};

/**
 * Record a cook. Additive to the pantry, never subtractive (DECISIONS §5).
 *
 * The event is the moment we learn the user actually had these things, so
 * anything they used that was not in the pantry gets added. Nothing is
 * decremented — there are no quantities to decrement (DECISIONS §3).
 *
 * `cookedAt` is how the calendar records a meal on the day it was planned for
 * rather than the day the user got round to ticking it off. It cannot be in the
 * future: a cook is a thing that happened, and the calendar hides "Made it" on
 * future dates for the same reason. Hiding a button is a UI courtesy — this is
 * the rule.
 *
 * `ev.source` is deliberately not read here — it describes the cook to the
 * behavioural record, which is the shell's to emit.
 */
export function recordCook(o: Owner, recipeId: string, ev: CookDraft): CookEvent {
  const at = ev.cookedAt ?? now();
  if (Number.isNaN(Date.parse(at))) throw new Error(`Not a date: ${at}`);
  // A day of slack, so a planned dinner can be ticked off in a timezone ahead of
  // the server without being called impossible.
  if (Date.parse(at) - Date.now() > 24 * 60 * 60 * 1000)
    throw new Error("That date is in the future. You can record a cook once it has happened.");
  /**
   * A given id that is already on the books is a REPLAY, not a second dinner.
   *
   * Nothing in the product replays a cook today, and this is here so that
   * nothing can: the device mints the id and the server takes it, so a mirror
   * retried by a queue, a drain, or a double-tapped Save arrives carrying the
   * identity of the cook it already recorded. Pushing a second row would give
   * the log two events for one meal — the exact error the beacon suppression
   * exists to prevent, arriving by the other door. Returning the row that is
   * there makes the write idempotent in the only direction it can repeat.
   */
  if (ev.id) {
    const had = o.cooks.find((c) => c.id === ev.id);
    if (had) return had;
  }
  const cook: CookEvent = {
    id: ev.id ?? mintCookId(),
    recipe_id: recipeId, cooked_at: at,
    ...(ev.meal ? { meal: ev.meal } : {}),
    required: ev.required,
    substituted: ev.substituted ?? [],
    skipped: ev.skipped ?? [],
    ...(ev.rating !== undefined ? { rating: ev.rating } : {}),
    ...(ev.note ? { note: ev.note } : {}),
  };
  o.cooks.push(cook);

  const used = new Set(ev.required);
  for (const s of cook.skipped ?? []) used.delete(s);
  for (const s of cook.substituted ?? []) { used.delete(s.wanted); used.add(s.used); }
  for (const id of used) {
    const row = o.ingredients[id];
    if (row) { row.in_pantry = true; continue; }
    o.ingredients[id] = {
      ingredient_id: id, in_pantry: true, on_list: false,
      use_first: false, added_at: now(),
    };
  }
  return cook;
}

/**
 * Settle up after a cook — the pantry's only SUBTRACTIVE signal.
 *
 * `recordCook` is additive and nothing reverses it: every cook marks its whole
 * ingredient list present, and with the staleness nudge deferred to v2 the only
 * way anything ever leaves the pantry is a user opening a drawer and hunting
 * for a chip. So the pantry ratchets. After ten cooks it claims seventy things
 * are present, a good share of which have been eaten, and "Cook tonight" starts
 * badging recipes "have everything" that cannot be cooked. A false claim there
 * costs more than an empty tab, because it spends the one promise the product
 * makes.
 *
 * This is asked immediately after the cook is recorded, where the user has just
 * put the packets away and actually knows the answer. It writes only what they
 * said:
 *
 *   - `ranOut` — used up. `in_pantry` goes false. The grocery list flag is left
 *     alone; deciding to shop is a separate act, and UX-SPEC §4b says nothing
 *     reaches the list without review.
 *   - `alsoUsed` — used but not on the recipe's list, either because our parse
 *     missed a line or because they improvised. Marked present, and if it stood
 *     in for something the recipe wanted, recorded as a substitution on the
 *     event.
 *
 * The substitution half matters beyond this block: `CookEvent.substituted` has
 * existed, been rendered by `Summary` in two places, and had NO writer anywhere
 * in the app. Every history line linked to "all cooks & substitutions" and the
 * substitutions could never be anything but empty.
 */
export function settleCook(
  o: Owner, cookId: string,
  patch: { ranOut?: string[]; alsoUsed?: Array<{ id: string; insteadOf?: string }> },
): void {
  const cook = o.cooks.find((c) => c.id === cookId);
  if (!cook) throw new Error("That cook is no longer in your history. Reload the page.");

  for (const id of patch.ranOut ?? []) {
    const row = o.ingredients[id];
    // Nothing to do if we never held it. Creating a row that says "absent" is
    // noise — an absent ingredient is one with no row.
    if (!row) continue;
    row.in_pantry = false;
    /*
      And the pin goes with it — the rule `setState` has always enforced.
      A pin is a property of something you HAVE: "use first" on an empty
      cupboard is not a state anyone means, and it is a HARD FILTER in
      `rank`, so a stale one silently steers the whole grid toward a dish
      that cannot be cooked.
      This path bypassed `setState` and so bypassed the rule with it. It is
      also the likeliest path to hit it, because using something up is the
      commonest way an ingredient stops being held.
    */
    row.use_first = false;
    delete row.pinned_at;
  }

  for (const { id, insteadOf } of patch.alsoUsed ?? []) {
    const row = o.ingredients[id];
    if (row) row.in_pantry = true;
    else o.ingredients[id] = {
      ingredient_id: id, in_pantry: true, on_list: false,
      use_first: false, added_at: now(),
    };
    // One substitution per wanted ingredient — answering twice corrects the
    // first answer rather than recording a dish that used both.
    if (insteadOf) {
      cook.substituted = [
        ...cook.substituted.filter((s) => s.wanted !== insteadOf),
        { wanted: insteadOf, used: id },
      ];
    }
  }
}

/**
 * Tick one item off in the aisle.
 *
 * `moveToPantry` exists and moves the WHOLE list at the till, which is a
 * reconciliation rather than a shopping tool — you cannot watch the list shrink
 * as the trolley fills. This is the per-item version.
 *
 * `enough: false` is the answer to "three dinners want this — did you buy
 * enough?": the item is in the pantry AND still on the list, which is exactly
 * the state INGREDIENT-SPEC §2 made the flags independent to express
 * ("you can have soy sauce and still need more"). Nothing in the product had
 * ever produced it.
 *
 * A free-text row leaves the list and does not enter the pantry — a shopping
 * note is finished when it is bought, and it has nothing to match against.
 */
export function tickOff(o: Owner, ingredientId: string, enough = true): void {
  const row = o.ingredients[ingredientId];
  if (!row) throw new Error("That is not on your list. Reload the page.");
  if (isFreeText(ingredientId)) { delete o.ingredients[ingredientId]; return; }
  /*
    Into the CART, never the pantry — CART-SPEC §2.

    The old signature took `toPantry`, the answer to §4g's "did that go in
    the kitchen?", asked in an aisle about a thing that would not be in a
    kitchen for another half hour. The question was right and the moment was
    wrong: nothing enters the pantry here now, so the tick cannot put a thing
    you do not have into a pantry you have to trust (INGREDIENT-SPEC §2), and
    the question moves to `putAway`, where the answer is known.

    `enough: false` is the other half of "did you buy enough?" and still
    leaves the row on the list while the bought one goes in the cart.
  */
  row.in_cart = true;
  row.on_list = !enough;
}

/**
 * Home — the cart goes on the shelves, in one write.
 *
 * Takes what to MOVE. The dialog in front of it is a list you remove from
 * (§4b), so whatever survives that list is what came into the kitchen, and
 * everything else in the cart was bought and is not here — eaten on the way
 * home, bought for someone else, left in the car.
 *
 * `clearRest` says whether the rest of the cart empties with it; see below.
 */
export function putAway(o: Owner, moveIds: string[], clearRest = true): void {
  const move = new Set(moveIds);
  /* Named rows first, and they need not be in the cart: the page's Select
     mode can pick a row still on the list — something bought without ticking
     — and "into the pantry" means the same thing wherever it came from. A row
     that does not exist is not invented; there is nothing to put away. */
  for (const id of move) {
    const row = o.ingredients[id];
    if (!row) continue;
    row.in_pantry = true;
    row.in_cart = false;
    row.on_list = false;
  }
  for (const row of Object.values(o.ingredients)) {
    if (!row.in_cart) continue;
    /*
      `clearRest` is the difference between the two ways this is reached.

      Unpacking the whole cart at the door: the rows NOT kept were bought and
      are not in the kitchen — eaten on the way home, bought for someone else
      — so they leave the cart having entered nothing, and the cart empties.

      Putting a few things away by hand (the select path): the rest are still
      in the bags. Emptying the cart there would silently throw away the half
      of the shopping the user did not point at.
    */
    if (clearRest) row.in_cart = false;
  }
}

/**
 * The welcome-back review's answer — rows the user says are gone.
 *
 * Deliberately NOT `settleCook`: that one is tied to a cook event and also
 * records substitutions. This is a standing review of the pantry with no event
 * behind it, and conflating them would mean inventing a cook that never
 * happened just to have something to attach the answer to.
 *
 * An empty list is a real answer — "all still here" — and it still stamps the
 * owner as active, which is what stops the panel reappearing on the next load.
 */
export function reviewPantry(o: Owner, gone: string[]): void {
  for (const id of gone) {
    const row = o.ingredients[id];
    // Same posture as `settleCook`: an absent ingredient is one with no row,
    // so nothing is created to record an absence.
    if (row) row.in_pantry = false;
  }
}

/**
 * The id for a free-text list row.
 *
 * Prefixed so it can never collide with an ontology id, and slugged so adding
 * "Bin bags" twice is one row rather than two. Anything that resolves ids
 * leaves these alone — `resolveId` returns unknown ids unchanged, which is
 * exactly the behaviour needed here.
 */
export function freeTextId(text: string): string {
  return `txt_${text.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

export const isFreeText = (id: string) => id.startsWith("txt_");

/**
 * Put a typed item on the grocery list.
 *
 * Only ever the LIST. A free-text row is a shopping note; it has no place in a
 * pantry that exists to be matched against recipes, and pretending otherwise
 * would put un-matchable rows in the way of the thing the pantry is for.
 */
export function addFreeText(o: Owner, text: string): void {
  const label = text.trim();
  if (!label) throw new Error("Nothing to add.");
  if (label.length > 80) throw new Error("That is too long for a list item.");
  const id = freeTextId(label);
  if (id === "txt_") throw new Error("Give it a name with some letters or numbers in it.");
  const row = o.ingredients[id];
  if (row) { row.on_list = true; row.label = label; return; }
  o.ingredients[id] = {
    ingredient_id: id, in_pantry: false, on_list: true,
    use_first: false, label, added_at: now(),
  };
}

/** How long a "Use today" pin steers the ranking before it means nothing. */
export const PIN_DAYS = 7;

/**
 * Is this pin still meant?
 *
 * A single Use-today pin is a HARD FILTER in `rank` — the user is telling us
 * what tonight is about, and that is right for tonight. Pins never expired, so
 * one set before a fortnight away silently reduced the entire gallery to
 * recipes containing a scallion that had long since been thrown out. The user
 * sees a thin, strange-looking page; the cause is a chip in a drawer.
 *
 * "Use today" is a claim with a shelf life, and this is the shelf life. The row
 * keeps its flag — nothing rewrites user data on a read — so the pantry can
 * still show the pin and offer to renew it. It simply stops steering.
 *
 * Rows pinned before this field existed have no `pinned_at`; they are treated
 * as live, because the alternative is silently un-pinning something the user
 * genuinely set and never told them.
 */
export function pinLive(r: UserIngredient): boolean {
  if (!r.use_first) return false;
  if (!r.pinned_at) return true;
  return Date.now() - Date.parse(r.pinned_at) < PIN_DAYS * 86_400_000;
}

/** A pin that is set but no longer steering — shown in the pantry, offering renewal. */
export const pinLapsed = (r: UserIngredient) => r.use_first && !pinLive(r);

/* ── the read selectors ──────────────────────────────────────────────────
 *
 * Everything below turns an owner into what a surface renders. They came from
 * `store.ts` in slice B (STATIC-SPEC §2) and for the same reason the reducers
 * came before them: the grid runs on the device now, and a shelf computed one
 * way on a server and another way in a browser is two products again. None of
 * them writes, none of them reads a file, and `resolve` is injected exactly as
 * `match.ts` injects its relations — so the module keeps its no-import rule.
 * `store.ts` re-exports every one, so no server caller learns they moved. */

/**
 * The pantry as the matcher wants it.
 *
 * `resolve` is injected rather than imported so this stays free of the
 * ontology. INGREDIENT-SPEC §1: a row written before a merge holds a retired
 * id and must still resolve, or the merge silently empties part of someone's
 * pantry.
 */
export const pantryOf = (o: Owner | null, resolve: (id: string) => string = (i) => i) => ({
  have: new Set(Object.values(o?.ingredients ?? {}).filter((r) => r.in_pantry)
    .map((r) => resolve(r.ingredient_id))),
  // Lapsed pins are not pins — see `pinLive`.
  useFirst: new Set(Object.values(o?.ingredients ?? {}).filter(pinLive)
    .map((r) => resolve(r.ingredient_id))),
});

/**
 * How many things are IN the pantry — §9's sign-up trigger.
 *
 * Not `pantryOf().have.size`, which is widened by relations: owning `spring
 * onion` makes `scallion` true for matching, and counting both would claim the
 * user has done twice the work they have. §9's threshold is about effort spent,
 * so it counts the rows the user actually created.
 */
export function heldCount(owner: Owner | null): number {
  return Object.values(owner?.ingredients ?? {}).filter((r) => r.in_pantry).length;
}

export const excludesOf = (o: Owner | null): Set<string> =>
  new Set(o?.diet?.excludes ?? []);

export const dietOf = (o: Owner | null, resolve: (id: string) => string = (i) => i) => ({
  excludes: new Set((o?.diet?.excludes ?? []).map(resolve)),
  classes: new Set(o?.diet?.classes ?? []),
  allergens: new Set(o?.diet?.allergens ?? []),
});

/** Recipe ids the user has asked not to be recommended. Presence is the meaning. */
export function dismissedNow(owner: Owner | null): Set<string> {
  const out = new Set<string>();
  for (const r of Object.values(owner?.recipes ?? {})) {
    if (r.dismissed_at) out.add(r.recipe_id);
  }
  return out;
}

/** What is bought and not yet put away. */
export function cartOf(owner: Owner | null): string[] {
  return Object.values(owner?.ingredients ?? {})
    .filter((r) => r.in_cart).map((r) => r.ingredient_id);
}

/**
 * The user's own recipes in the shape the matcher expects.
 *
 * Merged into the corpus per request by each page — never into the shared
 * corpus cache, which one process holds for every owner.
 *
 * The return type is written out rather than imported from `match`: it is
 * structurally a `Recipe`, and saying so in a type import would cost this
 * module the property that lets it run anywhere.
 */
export function ownAsRecipes(owner: Owner | null): Array<{
  id: string; title: string; url: string; source: string; cuisine: string;
  image?: string; requires: string[]; unresolved: string[];
}> {
  return (owner?.own ?? []).map((r) => ({
    id: r.id, title: r.title, url: r.url, source: r.source,
    cuisine: "", ...(r.image ? { image: r.image } : {}),
    requires: r.requires,
    // Nothing was parsed, so nothing failed to parse.
    unresolved: [] as string[],
  }));
}

/**
 * Everything the user knows about one recipe, computed.
 *
 * RECIPE-SPEC §6: *"Compute it. Do not model it."* — `cook_count`, `first` and
 * `last` are a count and two extremes over a handful of rows, and a stored
 * summary would only introduce the bug this class of table always has, drifting
 * out of sync with the log beneath it. Denormalising is reserved for a query
 * that needs to SORT by one of these, which nothing does yet.
 *
 * `community` is deliberately part of the SHAPE while being absent from the
 * data. RECIPE-SPEC §9 specifies `recipe_substitution`, `recipe_skip` and
 * `recipe_comment` — other people's ratings, swaps and comments — none of which
 * exist. Declaring the slot now means adding them is filling a hole rather than
 * reshaping every caller, and it keeps the panel honest in the meantime: "yours"
 * is labelled as yours, so it can never be mistaken for everyone's.
 */
export type RecipeSummary = {
  mine: {
    cooks: number;
    first: string | null;
    last: string | null;
    /** Mean of the events that carry a rating, or null if none do. */
    rating: number | null;
    rated: number;
    /** Newest first. */
    events: CookEvent[];
    substitutions: Array<{ wanted: string; used: string; times: number }>;
    skips: Array<{ ingredient: string; times: number }>;
  };
  /**
   * RECIPE-SPEC §9 — not implemented, and not faked. `null` means "we have
   * nothing", never "nobody did anything". The floor (`n_users >= k`) is a
   * property of the data and belongs wherever the aggregate is computed, not in
   * a template.
   */
  community: null;
};

export function summaryFor(owner: Owner | null, recipeId: string): RecipeSummary {
  const events = (owner?.cooks ?? [])
    .filter((c) => c.recipe_id === recipeId)
    .sort((a, b) => b.cooked_at.localeCompare(a.cooked_at));

  const rated = events.filter((e) => typeof e.rating === "number");
  const subs = new Map<string, { wanted: string; used: string; times: number }>();
  const skips = new Map<string, number>();
  for (const e of events) {
    /* `?? []` because this is USER DATA and the shape can predate the field.
       A cook written before `substituted` existed, or by a hand-edit, made
       this throw — and it throws during the server render of the whole page,
       so one malformed row in owners.json took out the entire app rather than
       one recipe. The store's own doc says that file is the one thing here
       that cannot be regenerated; reading it defensively is the least it is
       owed. */
    for (const s of e.substituted ?? []) {
      const key = `${s.wanted}\u0000${s.used}`;
      const row = subs.get(key);
      if (row) row.times++; else subs.set(key, { ...s, times: 1 });
    }
    for (const id of e.skipped ?? []) skips.set(id, (skips.get(id) ?? 0) + 1);
  }

  return {
    mine: {
      cooks: events.length,
      first: events.length ? events[events.length - 1]!.cooked_at : null,
      last: events.length ? events[0]!.cooked_at : null,
      rating: rated.length
        ? rated.reduce((n, e) => n + e.rating!, 0) / rated.length
        : null,
      rated: rated.length,
      events,
      substitutions: [...subs.values()].sort((a, b) => b.times - a.times),
      skips: [...skips].map(([ingredient, times]) => ({ ingredient, times }))
        .sort((a, b) => b.times - a.times),
    },
    community: null,
  };
}

/**
 * The cooks recorded on a given day — what a date-bound modal acts on.
 *
 * Compares by local day, not by timestamp: "did I cook this on the 6th" is a
 * question about a calendar square.
 *
 * A LIST, not one event. The same dish can be lunch and dinner on one day, and
 * returning the first would silently pick one — so the modal renders whatever it
 * finds, each with its own slot and rating, and "Made it" adds another.
 */
export function cooksOnDate(
  owner: Owner | null, recipeId: string, date: string, tz?: string,
): CookEvent[] {
  return (owner?.cooks ?? [])
    .filter((c) => c.recipe_id === recipeId && dayKey(new Date(c.cooked_at), tz) === date)
    .sort((a, b) => a.cooked_at.localeCompare(b.cooked_at));
}

/** Plans on a date, for the calendar and for linking a cook to what was planned. */
export function plansOnDate(owner: Owner | null, date: string): PlanEntry[] {
  return (owner?.plans ?? []).filter((p) => p.date === date);
}

/**
 * The most recent cook of a recipe, or null.
 *
 * What the modal amends when it was opened from the grid rather than from a
 * date. Ties go to the event appended LATER: two cooks can share a millisecond,
 * so `cooked_at` alone does not order them.
 */
export function latestCook(owner: Owner, recipeId: string): CookEvent | null {
  let latest: CookEvent | null = null;
  for (const c of owner.cooks)
    if (c.recipe_id === recipeId && (!latest || c.cooked_at >= latest.cooked_at)) latest = c;
  return latest;
}

/** Cook history for one recipe. Computed, never stored (RECIPE-SPEC §6). */
export function historyFor(owner: Owner, recipeId: string) {
  const events = owner.cooks.filter((c) => c.recipe_id === recipeId)
    .sort((a, b) => b.cooked_at.localeCompare(a.cooked_at));
  return {
    count: events.length,
    first: events.length ? events[events.length - 1]!.cooked_at : null,
    last: events.length ? events[0]!.cooked_at : null,
    events,
  };
}

/**
 * When this owner last WROTE anything — not when they last looked.
 *
 * Reading a page must not count, or the welcome-back review could never fire:
 * the visit that should trigger it would refresh the timestamp before the check
 * ran. So it is stamped by the shell's write path and by nothing else.
 */
export function lastActive(o: Owner | null): number | null {
  if (!o) return null;
  const t = o.last_active_at ?? o.created_at;
  const at = Date.parse(t);
  return Number.isNaN(at) ? null : at;
}

/** Days since the last write, or `null` for an owner who has never written. */
export function daysAway(o: Owner | null): number | null {
  const at = lastActive(o);
  return at === null ? null : Math.floor((Date.now() - at) / 86_400_000);
}

/**
 * The current answer for one purpose, or null if never asked.
 *
 * Last row wins. Reading the array backwards rather than sorting on
 * `granted_at`: two writes inside the same millisecond would tie on the
 * timestamp, and append order is the thing we actually know.
 */
export function consentState(
  owner: Owner | null,
  purpose: Consent["purpose"],
): Consent | null {
  const rows = owner?.consent;
  if (!rows) return null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row?.purpose === purpose) return row;
  }
  return null;
}

/** Own recipes with nothing to match on — the backlog an import creates. */
export function ownNeedingIngredients(owner: Owner | null): OwnRecipe[] {
  return (owner?.own ?? []).filter((r) => r.requires.length === 0);
}

/**
 * Every pantry flag the owner holds, keyed by RESOLVED ingredient id — what a
 * grid of sixty cards reads its chips from, as one object rather than a slice
 * per card.
 *
 * Resolved on read for the reason INGREDIENT-SPEC §1 gives: a row written
 * before a merge holds a retired id, and the pantry has to keep working
 * without anyone rewriting user data.
 *
 * It lived in `lib/detail` and was always pure; it moved because that module
 * also builds the modal's rows, which needs `mainsOf`, which reads the corpus
 * off disk — so a client component importing one selector pulled a filesystem
 * into the browser bundle. `detail.ts` re-exports both.
 */
export function statesOf(owner: Owner | null, resolve: (id: string) => string):
    Record<string, { in_pantry: boolean; on_list: boolean; use_first: boolean }> {
  const out: Record<string, { in_pantry: boolean; on_list: boolean; use_first: boolean }> = {};
  for (const r of Object.values(owner?.ingredients ?? {})) {
    out[resolve(r.ingredient_id)] =
      { in_pantry: r.in_pantry, on_list: r.on_list, use_first: r.use_first };
  }
  return out;
}

/**
 * Everything the ingredient sheet shows beyond the three flags — assembled
 * here so recipe surfaces can hand chips the same depth the pantry drawer
 * has. The "…" sheet on a recipe chip showed "not in your pantry" and nothing
 * else; the data was always on the owner row, just never carried.
 */
export function extrasOf(owner: Owner | null, resolve: (id: string) => string):
    Record<string, { addedAt?: string; sinceAt?: string; note?: string }> {
  const out: Record<string, { addedAt?: string; sinceAt?: string; note?: string }> = {};
  for (const r of Object.values(owner?.ingredients ?? {})) {
    out[resolve(r.ingredient_id)] = {
      addedAt: r.added_at,
      ...(r.first_added_at ? { sinceAt: r.first_added_at } : {}),
      ...(r.note ? { note: r.note } : {}),
    };
  }
  return out;
}
