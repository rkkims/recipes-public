/**
 * Curation decisions — the reviewer's daily work, stored so it is never redone.
 *
 * Same discipline as the alias review that preceded it: decisions live in their
 * own file, keyed by a stable recipe id, and are never written by a generator.
 * `npm run recipe-index` can be re-run after any pipeline change without losing
 * a single judgement.
 *
 * One file, one row per curated recipe, appended as a JSON map. At the scale of
 * one person curating by hand this will not outgrow a file for a long time, and
 * the shape is a table when it needs to be one.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const FILE = resolve(process.cwd(), "..", "data", "curation", "recipes.json");

export type Verdict = "keep" | "drop" | "skip";

/**
 * Three buckets, not a five-point scale. Reviewer's call, and it is the right
 * shape: the decision this field drives is binary — bad recipes get dropped —
 * and `medium` exists only to separate "keep" from "keep and promote". A 1-5
 * scale would invite distinctions that nothing downstream can act on.
 */
export type Quality = "bad" | "medium" | "good";

/** Why a recipe was dropped — CURATION-RULES §2: an enum, so the pipeline can
    learn from it; free text may accompany, never replace. */
export const DROP_REASONS =
  ["duplicate", "not-a-recipe", "incomplete", "unparseable", "out-of-scope"] as const;
export type DropReason = (typeof DROP_REASONS)[number];

/** Equipment a recipe cannot be made without — the curator's slow-cooker note
    (CURATION-RULES §5), given a field. Closed vocabulary; whether it gates
    matching or only labels the card stays open, but the fact is collected. */
export const EQUIPMENT = [
  "slow cooker", "air fryer", "oven", "grill", "blender", "stand mixer",
  "deep fryer", "rice cooker",
  // The curator's kkorijjim note (2026-08-20): "add the equipment: pressure
  // cooker" — the vocabulary lacked it and the judgment had to live in a note.
  "pressure cooker",
] as const;

export type Curation = {
  recipe_id: string;
  verdict: Verdict;
  /** Required by the form when verdict is `drop` (2026-08-17). */
  drop_reason?: DropReason;
  /** From the EQUIPMENT vocabulary. Absent means "a normal stove kitchen". */
  equipment?: string[];
  /** The curator's own judgement; nothing derives it. `bad` means drop. */
  quality?: Quality;
  cuisine?: string;
  dish_type?: string;
  /**
   * LEGACY. Prep and cook together, banded. No longer collected — 2026-08-09.
   *
   * One field rather than prep + cook, because the question a cook asks is "how
   * long from now until dinner", and splitting it makes them add two numbers to
   * answer it. Banded rather than exact, because the curator frequently has to
   * estimate it and a stated number would be false precision.
   */
  /**

   * @deprecated No longer collected — the curator's decision, 2026-08-09.

   *

   * A time band depends on who is cooking, and asking for one added a judgement

   * to every curation that the product never showed: it reached the form, the

   * store and nothing else. 33 of the first 35 curations carry one and they are

   * kept — deleting a human's answer to un-ask a question is worse than a dead

   * field — but nothing writes it and nothing reads it.

   */

  cook_band?: string;
  /**
   * LEGACY. Written by the pass that predated `cook_band`; never written again.
   *
   * Retained where it exists because it was a human judgement and this file's
   * whole discipline is that judgements are never redone or discarded. Those rows
   * also carry `cook_band`, migrated by bucketing this value. Read `cook_band`.
   */
  cook_minutes?: number;
  /**
   * Must this be started well in advance? A BOOLEAN, not minutes.
   *
   * The enrichment pass derives a duration, but the decision it feeds is binary
   * — can I start this now for tonight, yes or no. Storing 4,320 minutes invites
   * arithmetic nobody will do, and the exact figure is in the recipe anyway.
   */
  make_ahead?: boolean;
  /**
   * Substitutions the RECIPE offers, confirmed by the curator.
   *
   * `wanted` is the ingredient node; `alt` is the author's own alternative as
   * written. Kept as text because the alternative is often not a node yet, and
   * inventing one silently is how a vocabulary fills with junk.
   *
   * **A combination is written with `+`** — `"egg + ice + flour"` — matching the
   * convention the resolver already uses for compound lines. One alternative that
   * needs three things is one row, never three: three rows would say each works
   * alone (RECIPE-SPEC §3a). The promotion step splits on `+`; nothing else reads
   * this field yet.
   */
  substitutes?: Array<{ wanted: string; alt: string }>;
  /**
   * What the dish is OF — RECIPE-SPEC §4c. At most two, ordered.
   *
   * Ingredient IDS, not names, so a rename or merge follows the redirect and a
   * judgement made today still resolves years from now (INGREDIENT-SPEC §1).
   *
   * The cap is the design. Three is not a compromise, it is `requires` again
   * with extra steps — a field naming half the ingredient list has stopped
   * distinguishing anything. Ordered because the first is the one the dish is
   * named for and the one a substitution prompt should lead with.
   *
   * Lives here rather than on the parsed recipe because a re-parse rewrites
   * `requires` and must never touch a human's judgement (RECIPE-SPEC §3).
   */
  main_ingredients?: string[];
  /**
   * Every cuisine the dish sits under, ordered, first = primary — present
   * only when the curator named MORE than one (a single answer keeps riding
   * the legacy `cuisine` field, so nothing re-reads old rows differently).
   */
  cuisines?: string[];
  /**
   * Recipes this recipe uses as an ingredient — "1 recipe of my chicken
   * stock", the blog convention of linking a previous post. Recipe ids,
   * picked by the curator from the corpus (same source first, since that is
   * what the convention means). Merged onto the index at `load()` and folded
   * into `requires` by `expandComponents` at assembly; stored here so a
   * re-parse cannot erase the human's call (RECIPE-SPEC §3).
   */
  components?: string[];
  /**
   * Lines that ARE another recipe — "4 Tonkatsu (Pork Cutlets)" names the
   * tonkatsu recipe, not an ingredient. Keyed by raw text like every per-line
   * judgment; the id rides `components` too, so `expandComponents` folds the
   * component's own requires in at assembly, and the index stops counting the
   * line as an unresolved hole (curator's ask, 2026-08-20).
   */
  line_components?: Array<{ raw: string; recipe_id: string }>;
  /**
   * Ingredients the SOURCE omitted — the method uses it, the list never states
   * it (the curator's ask, 2026-08-20). Node IDS, like `main_ingredients` and
   * for the same reason: an id survives a rename or merge. Folded into
   * `requires` at app `load()` and at `recipe-index`, never written into the
   * stored index — a re-parse must not be able to erase the addition, and the
   * addition must not be able to hide a re-parse.
   */
  added_ingredients?: string[];
  /** Lines the curator marked as parsed wrongly. Feeds the parser backlog. */
  bad_lines?: string[];
  /**
   * Per-line notes, keyed by raw text — in practice, what the line SHOULD have
   * parsed to.
   *
   * `bad_lines` says "this is wrong"; this says "this is right". A backlog of
   * wrong lines needs re-derivation before it can be used, and the curator
   * already knew the answer at the moment they flagged it — so capture it then
   * rather than making the next pass guess. Stored as free text for the same
   * reason `substitutes.alt` is: the right answer is often not a node yet, and
   * inventing one silently is how a vocabulary fills with junk.
   */
  line_notes?: Array<{ raw: string; note: string }>;
  /**
   * Lines whose required/optional tier the curator corrected, by raw text.
   *
   * Stored as an override rather than a full list because the index already
   * detects most of them from the wording; recording only the corrections keeps
   * this file a record of human judgement rather than a copy of the parse.
   */
  tier_overrides?: Array<{ raw: string; optional: boolean }>;
  /**
   * Per-line variant resolutions, by raw text — RESOLUTION-SPEC §1's
   * `curated` tier. The line's surface stays what the recipe wrote; `to` is
   * the node id the curator says it MEANS here ("soy sauce" written, soup soy
   * sauce meant). Outranks the cuisine table's guess in `recipe-index`;
   * recorded per recipe, never propagated (spec §5).
   */
  resolutions?: Array<{ raw: string; to: string }>;
  note?: string;
  curated_at: string;
};

/**
 * Curated main ingredients that the recipe no longer requires — RECIPE-SPEC §4c.
 *
 * `requires` is our current parse of someone's HTML and it moves underneath us
 * (§3): the engine improves, or the blogger edits the post. When it moves, a
 * main ingredient recorded months ago can stop being in the list.
 *
 * §4c is explicit that this is **a flag, not a deletion**. Either the parse
 * regressed or the recipe genuinely changed, and both are worth a human look.
 * Dropping the id silently would erase a human judgement and leave the field
 * quietly wrong — the one outcome the curation file exists to prevent.
 *
 * Nothing here changes the score. `missing` is a subset of `requires`, so a
 * stale id is never charged by the matcher; it is a review problem, not a
 * ranking one.
 */
export function staleMains(c: Curation | null | undefined, requires: string[]): string[] {
  const main = c?.main_ingredients;
  if (!main || !main.length) return [];
  const has = new Set(requires);
  return main.filter((id) => !has.has(id));
}

/**
 * A machine-drafted judgment — the whole queue carries one (2026-08-18).
 *
 * Same shape as a curation because it exists to become one, plus the fields
 * only a reviewer reads: `draft_why`, always present, is the one-line reason;
 * `cuisine_dispute` is set when the drafting model claimed a cuisine outside
 * the queue's set (a possible out-of-scope flag, not a value).
 *
 * The tool READS this file and never writes it; the drafts were generated and
 * programmatically verified offline (ids checked against requires, flagged
 * raws against real lines). A draft is a pre-fill, never a judgment: nothing
 * from here reaches `recipes.json` except through the curator's save.
 */
export type AgentDraft = Omit<Curation, "curated_at"> & {
  draft_why?: string;
  cuisine_dispute?: string;
};

const DRAFTS = resolve(process.cwd(), "..", "data", "curation", "drafts.json");

export function allAgentDrafts(): Record<string, AgentDraft> {
  if (!existsSync(DRAFTS)) return {};
  try { return JSON.parse(readFileSync(DRAFTS, "utf8")); } catch { return {}; }
}

type Db = Record<string, Curation>;

function read(): Db {
  if (!existsSync(FILE)) return {};
  try { return JSON.parse(readFileSync(FILE, "utf8")) as Db; } catch { return {}; }
}

function write(db: Db): void {
  mkdirSync(dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(db, null, 1));
  renameSync(tmp, FILE);
}

/**
 * Parsed once and reused until the file changes. Callers ask per recipe —
 * the home page's badge loop asks once for every recipe on the shelf — and a
 * fresh read each time was 17,655 parses of this file per page load once the
 * curation gate was lifted (2026-11-06): ~11 s of a 16 s home page. Keyed on
 * mtime, so a save from the curate view shows up on the next request.
 * Read-only: `saveCuration` still reads fresh before it writes.
 */
let cached: { mtimeMs: number; db: Db } | null = null;

export const allCurations = (): Db => {
  if (!existsSync(FILE)) return {};
  const { mtimeMs } = statSync(FILE);
  if (cached?.mtimeMs !== mtimeMs) cached = { mtimeMs, db: read() };
  return cached.db;
};

export function saveCuration(c: Omit<Curation, "curated_at">): Curation {
  const db = read();
  const row: Curation = { ...c, curated_at: new Date().toISOString() };
  db[c.recipe_id] = row;
  write(db);
  return row;
}

export function curationFor(recipeId: string): Curation | null {
  return read()[recipeId] ?? null;
}

/**
 * The validated sources — the queue's membership list.
 *
 * "Already validated" is a judgement the reviewer made by looking at each site,
 * not a property of the data, so it is an explicit list rather than a frequency
 * sort. Until 2026-08-18 it was also the queue's ORDER — validated sites first,
 * straight through — and that is gone: creators rotate now (`queueMix`), and
 * what remains of this list is the roster `QUEUE_SOURCES` gates on.
 */
export const VALIDATED_SOURCES = [
  "koreanbapsang", "maangchi", "mykoreankitchen", "kimchimari",
  "beyondkimchee", "thewoksoflife", "justonecookbook",
  // Added 2026-08-17 on the curator's ask ("there's no chris cho's blog") —
  // crawled the same day, ~184 recipes with JSON-LD.
  "chefchrischo",
  // Added 2026-08-20 on the curator's word: Japanese home cook, ~3,055 posts,
  // her own cuisine — the authorship rule satisfied by the curator's look.
  "hirokoliston",
  // Added 2026-08-21, the subscription-deadline sweep: eighteen blogs across
  // all six in-scope cuisines, each by an author cooking their own cuisine
  // (notes in src/ingest/sources.ts). Listed so the curator can strike any
  // they would not have validated — a strike here is one line.
  "chopstickchronicles", "recipetinjapan", "sudachirecipes", "okonomikitchen",
  "norecipes",
  "redhousespice", "omnivorescookbook", "madewithlau", "rasamalaysia",
  "hotthaikitchen",
  "vickypham", "hungryhuy", "wokandkin", "delightfulplate", "cookingtherapy",
  "panlasangpinoy", "kawalingpinoy", "foxyfolksy",
];

/**
 * Sources the reviewer has judged uniformly, so the form can pre-fill quality.
 *
 * Earned, not assumed: after 22 koreanbapsang recipes the reviewer marked **every
 * one** `good` and asked for the rest of the site to be treated the same way.
 * That is a judgement about the source, and it is cheaper to state it once here
 * than to re-enter it 249 times.
 *
 * It is a PRE-FILL, never a lock — the select still opens, and one keystroke
 * overrules it. The moment a koreanbapsang recipe is judged `bad`, that is a fact
 * about this list and it should be revisited.
 *
 * Deliberately not a verdict or a dish type. Uniform quality is a claim the data
 * supports; "every recipe on this site is a keep, and here is its dish type" is
 * not, and pre-filling those would be inventing judgements rather than recording
 * one.
 */
export const SOURCE_QUALITY: Record<string, Quality> = {
  koreanbapsang: "good",
};

/**
 * The cost of a recipe is its UNKNOWNS — every unresolved line is an alias or
 * a mint the curator must supply before the keep is honest. Absolute count,
 * not a fraction: outflow speed is work remaining, and one unknown is one unit
 * of work whether the recipe has three lines or twenty. Recipes that parse to
 * nothing at all sink to the bottom — there is nothing to keep yet.
 */
export const queueCost = (r: { requires: string[]; unresolved: string[] }): number =>
  r.requires.length === 0 ? Number.MAX_SAFE_INTEGER : r.unresolved.length;

/** FNV-1a, the queue's shuffle key. Not `Math.random`: the queue is rebuilt on
    every save-and-redirect, and an order that moved between requests would show
    the reviewer a different "next" than the one the save promised. */
function shuffleKey(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Queue order — completeness first, then creators take turns.
 *
 * Within a completeness band, one recipe per source per round, the turn order
 * itself reshuffled every round. Round-robin rather than a plain shuffle
 * because the bands are lopsided: koreanbapsang outnumbers everyone in the
 * zero-unknown band, and a fair coin would still deal it most of the hands.
 * The tiebreak this replaces — the validated-sites order, straight through the
 * band — put fifty recipes from one blog at the head of the queue (2026-08-18),
 * and a corpus judged site-by-site soaks up one creator's habits before it
 * ever sees a second opinion.
 *
 * `inner` is the INNERMOST criterion (the curator's ask, 2026-08-20: "sort by
 * fewer ingredients so I can finish as many recipes as possible"): within one
 * creator's stack, cheaper-to-judge recipes deal first, so every round serves
 * each creator's quickest work. The shuffle survives as the tiebreak — order
 * must still be deterministic across reloads (see `shuffleKey`).
 */
export function queueMix<T extends { id: string; source: string }>(
  items: T[], cost: (r: T) => number, inner?: (r: T) => number,
): T[] {
  const bands = new Map<number, Map<string, T[]>>();
  for (const r of items) {
    const band = bands.get(cost(r)) ?? bands.set(cost(r), new Map()).get(cost(r))!;
    const group = band.get(r.source) ?? band.set(r.source, []).get(r.source)!;
    group.push(r);
  }
  const out: T[] = [];
  for (const c of [...bands.keys()].sort((a, b) => a - b)) {
    const groups = [...bands.get(c)!.values()];
    for (const g of groups) g.sort((a, b) =>
      (inner ? inner(a) - inner(b) : 0) || shuffleKey(a.id) - shuffleKey(b.id));
    for (let round = 0; groups.some((g) => round < g.length); round++) {
      const turn = groups
        .map((g) => g[round])
        .filter((r): r is T => r !== undefined)
        .sort((a, b) =>
          shuffleKey(`${a.source}:${round}`) - shuffleKey(`${b.source}:${round}`));
      out.push(...turn);
    }
  }
  return out;
}

/**
 * What the queue offers — the curator's sourcing rule, 2026-08-17.
 *
 * Asian cuisines only, from sources the curator has validated: well-known
 * sites whose authors cook their own cuisine ("not asian recipes made by
 * non-asians"). Authorship is a judgement about real people, so it is this
 * explicit curator-owned list and never an inference — extend
 * `QUEUE_SOURCES` after looking at a site, the same way `VALIDATED_SOURCES`
 * was earned. The other eight sources in the corpus are not deleted or
 * gated out of revisit; they simply do not enter the queue.
 */
export const ASIAN_CUISINES = new Set([
  "korean", "japanese", "chinese", "thai", "vietnamese", "filipino",
]);
export const QUEUE_SOURCES = new Set(VALIDATED_SOURCES);

/**
 * `proposed` is the classifier's cuisine, used only when the site tag is
 * unresolved — Woks of Life's untagged rows include American baking, and the
 * site tag alone would either queue those or drop hundreds of real Asian
 * dishes with them.
 */
export function queueable(r: { source: string; cuisine: string }, proposed?: string): boolean {
  if (!QUEUE_SOURCES.has(r.source)) return false;
  const cuisine = r.cuisine && r.cuisine !== "unresolved" ? r.cuisine : proposed ?? "";
  return ASIAN_CUISINES.has(cuisine);
}
