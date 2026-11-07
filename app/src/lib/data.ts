/**
 * Load the generated artifacts, once, into memory.
 *
 * Both files are produced by the pipeline in `../src/ontology` and are read-only
 * here. The app never writes them and never parses HTML — everything upstream of
 * this line already happened, offline, and is committed.
 *
 * 3,147 ingredients and 4,874 recipes is a few megabytes. Holding them in a
 * module-level cache is the simplest thing that works and removes the database
 * from the read path entirely; if the corpus grows past what a process should
 * hold, this is the one file that changes.
 */
import { existsSync, readFileSync } from "node:fs";
import { allCurations } from "./curation";
import { dirname, resolve } from "node:path";
import type { Recipe, Relations } from "./match";
import { buildRelations } from "./relations";
import { pendingEdits, type Edit } from "./ontology-edits";

/**
 * Find the artifacts by walking up, rather than assuming the working directory.
 *
 * `resolve(process.cwd(), "..", "data")` worked when Next started in `app/` and
 * broke the moment anything else imported this module — a script, a test, a
 * different launcher. Walking up finds them from anywhere inside the repo, and
 * RECIPES_DATA overrides for a deployment where the pipeline output is mounted
 * somewhere else entirely.
 */
function findData(): string {
  if (process.env["RECIPES_DATA"]) return process.env["RECIPES_DATA"];
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, "data", "ontology");
    if (existsSync(resolve(candidate, "ontology.json"))) return candidate;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(
    "cannot find data/ontology/ontology.json. Run `npm run build-ontology` at the repo root, " +
    "or set RECIPES_DATA to the directory holding it",
  );
}

const DATA = findData();

export type Ingredient = {
  id: string;
  slug: string;
  name: string;
  /** English explanation of a native-named node — display and search only;
      the canonical name stays the native term (2026-08-20). */
  gloss?: string;
  mentions: number;
  aliases: string[];
  slot?: boolean;
  choices?: string[];
  /** INGREDIENT-SPEC §4 — "contains", never "free of". Absent means unknown. */
  allergens?: string[];
  animal_source?: "meat" | "fish" | "dairy" | "egg";
  /**
   * What sort of thing this is — `produce`, `meat`, `condiment`, `grain`…
   *
   * Written by the ontology build and read here for the first time, to group the
   * grocery list by aisle (`lib/aisle`). Optional because 427 of 2,869 nodes
   * have none, and an ungrouped row is a normal state rather than a defect.
   */
  kind?: string;
};

/**
 * Machine proposals for §4c's main ingredients, from `npm run main-ingredients`.
 *
 * A PRE-FILL, never a lock — the same posture as SOURCE_QUALITY in curation.ts.
 * The curator's saved answer always wins, and one click removes a wrong guess.
 * Absent file is fine: the form simply starts blank, which is where it started
 * before the proposer existed.
 */
export function mainProposals(): Record<string, { ids: string[]; why: string }> {
  const f = resolve(DATA, "main-proposals.json");
  if (!existsSync(f)) return {};
  try {
    return JSON.parse(readFileSync(f, "utf8")) as Record<string, { ids: string[]; why: string }>;
  } catch {
    return {};   // a malformed proposal file must never take the curate form down
  }
}

/**
 * Drafted classification fields, from `npm run classify`.
 *
 * The same standing as `mainProposals` above and `SOURCE_QUALITY` in
 * curation.ts: a PRE-FILL the curator overrules with one key. It exists because
 * 4,874 recipes is more than a person can type four fields into, and the
 * verdict — the part only a human can give — was waiting behind the typing.
 *
 * `dish_type: ""` and `cuisine: "unresolved"` are ANSWERS, not gaps: §4a says
 * abstain rather than default, so a drafted abstention is carried through to the
 * form as one and the curator sees the same blank they would have seen.
 */
export function classProposals(): Record<string, {
  cuisine: string; dish_type: string; make_ahead: boolean;
  main_ingredients: string[]; confidence: string;
}> {
  const f = resolve(DATA, "classify.json");
  if (!existsSync(f)) return {};
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return {};   // as above: a malformed proposal file never takes the form down
  }
}

/**
 * The matcher's Recipe, not a second copy of it.
 *
 * This file declared its own — a strict subset, missing `alternates` and
 * `image` — and the two were kept in step by nobody. The gallery is what
 * surfaced it: `image` had been in `recipe-index.json` all along, and adding it
 * to one type left the other still refusing to compile. Re-exported so callers
 * that import `Recipe` from here keep working.
 */
export type { Recipe } from "./match";


type Ontology = {
  ingredients: Ingredient[];
  /** Retired id → the id that replaced it (INGREDIENT-SPEC §1). */
  redirects?: Record<string, string>;
  relations: { is_a: string[][]; derives_from: string[][]; substitutes_for: string[][] };
};

let cache: {
  ingredients: Ingredient[];
  byId: Map<string, Ingredient>;
  redirects: Map<string, string>;
  /** The gated list — every recipe not dropped (gate lifted 2026-11-06). What public surfaces read. */
  recipes: Recipe[];
  /** The whole corpus, gate ignored — curation, claim flow, request dedupe. */
  allRecipes: Recipe[];
  relations: Relations;
  /** ingredient id → how many recipes use it. */
  recipeCount: Map<string, number>;
  /** broad id → the narrower nodes beneath it, one hop (INGREDIENT-SPEC §3). */
  children: Map<string, string[]>;
  /**
   * The raw edges, kept for the curation editor — `buildRelations` compiles
   * them into closures the matcher wants, which cannot be walked backwards to
   * answer "what are this node's parents". One hop, same as `children`.
   */
  edges: { is_a: string[][]; derives_from: string[][] };
} | null = null;

/**
 * How many RECIPES use each ingredient.
 *
 * Not `mentions`, which counts ingredient LINES and is an artefact of parsing:
 * it double-counts a recipe naming something twice, and misses the recipes
 * that reached the ingredient through an alias. "used by 412 recipes" is a
 * fact the person adding to their pantry can judge; a mention count is not.
 */
function countRecipes(recipes: Array<{ requires: string[]; optional?: string[] }>) {
  const n = new Map<string, number>();
  for (const r of recipes) {
    const seen = new Set<string>();
    for (const id of [...r.requires, ...(r.optional ?? [])]) {
      if (seen.has(id)) continue;
      seen.add(id);
      n.set(id, (n.get(id) ?? 0) + 1);
    }
  }
  return n;
}

/**
 * The inverse of `is_a`: broad → the narrower nodes beneath it.
 *
 * One hop only. The suggester offers "did you mean something more specific",
 * and a transitive walk would offer `coarse salt` under `seasoning`, which is
 * true and useless — the question is what sits DIRECTLY beneath the thing you
 * typed.
 */
function childrenOf(is_a: string[][]): Map<string, string[]> {
  const kids = new Map<string, string[]>();
  for (const edge of is_a) {
    const [narrow, broad] = edge;
    // A malformed row in the generated file is not worth crashing a page load
    // over; it is worth not silently indexing `undefined`.
    if (!narrow || !broad) continue;
    const row = kids.get(broad);
    if (row) row.push(narrow); else kids.set(broad, [narrow]);
  }
  return kids;
}

/**
 * Recorded-but-unapplied ontology edits, overlaid on what the build produced.
 *
 * The record-not-apply contract stands: the TABLES only change in
 * `npm run apply-edits`, offline. But the curator asked for the other half of
 * QC-SPEC §4 — fix an alias from the recipe page and see the change
 * immediately — and "immediately" cannot wait for a rebuild. So the app reads
 * the same decisions file the apply step consumes and applies it IN MEMORY,
 * on load: the running app shows the curator's own decisions the moment they
 * are recorded, the tables stay untouched, and when apply-edits + a rebuild
 * land, the overlay naturally shrinks to nothing (applied rows leave the
 * file — that is apply-edits' contract).
 *
 * Mirrors apply-edits' semantics: append order, later row wins, renames LAST
 * so an edit recorded before a rename still names what it was made against.
 */
function overlayEdits(o: Ontology): void {
  let edits: Edit[];
  try { edits = pendingEdits(); } catch { return; }
  if (!edits.length) return;

  const byName = new Map<string, Ingredient>();
  const index = (i: Ingredient) => {
    byName.set(i.name.toLowerCase(), i);
    for (const a of i.aliases) byName.set(a.toLowerCase(), i);
  };
  for (const i of o.ingredients) index(i);
  const dropAlias = (surface: string) => {
    for (const i of o.ingredients)
      if (i.aliases.some((a) => a.toLowerCase() === surface))
        i.aliases = i.aliases.filter((a) => a.toLowerCase() !== surface);
  };
  const idOfName = (n: string) => byName.get(n.toLowerCase())?.id;

  for (const e of edits) {
    if (e.kind === "merge") {
      // The subject stops being a node NOW: its name becomes an alias of the
      // target, its aliases move over, and its edges vanish from the view.
      // The durable retirement (redirect, table rows) happens at apply-edits
      // + build; recipes referencing the old id keep working meanwhile
      // because the target also answers for the name via the alias.
      const from = byName.get(e.subject), to = byName.get(e.object);
      if (!from || !to || from.id === to.id) continue;
      for (const a of [from.name.toLowerCase(), ...from.aliases.map((x) => x.toLowerCase())]) {
        if (a !== to.name.toLowerCase() && !to.aliases.some((x) => x.toLowerCase() === a))
          to.aliases = [...to.aliases, a];
        byName.set(a, to);
      }
      /* The retired id must FORWARD, not vanish — recipes and curation rows
         hold ids, and an id with no redirect renders as itself ("godeungeo"
         showed as ing_… gibberish, curator report 2026-08-21). Entries
         already pointing at the retiree follow it to the survivor. */
      o.redirects ??= {};
      o.redirects[from.id] = to.id;
      for (const [k, v] of Object.entries(o.redirects))
        if (v === from.id) o.redirects[k] = to.id;
      o.ingredients = o.ingredients.filter((i) => i.id !== from.id);
      for (const rel of [o.relations.is_a, o.relations.derives_from])
        for (let i = rel.length - 1; i >= 0; i--)
          if (rel[i]![0] === from.id || rel[i]![1] === from.id) rel.splice(i, 1);
    } else if (e.kind === "promote") {
      // The surface stops being an alias and stands as a PROVISIONAL node —
      // id prefixed `pending:` because minting real ids is the build's
      // monopoly (INGREDIENT-SPEC §1). The editor and the tree can see and
      // link it; `search` excludes pending ids so no curation row can store
      // one before apply-edits + build mint the durable identity.
      const parent = byName.get(e.object);
      if (!parent || byName.get(e.subject)?.name.toLowerCase() === e.subject) continue;
      dropAlias(e.subject);
      const node: Ingredient = {
        id: `pending:${e.subject.replace(/[^a-z0-9]+/g, "-")}`,
        slug: e.subject.replace(/[^a-z0-9]+/g, "-"),
        name: e.subject, mentions: 0, aliases: [],
      };
      o.ingredients.push(node);
      index(node);
      o.relations.is_a.push([node.id, parent.id]);
    } else if (e.kind === "alias-set") {
      const target = byName.get(e.object);
      if (!target) continue;
      dropAlias(e.subject);
      if (target.name.toLowerCase() !== e.subject) {
        target.aliases = [...target.aliases, e.subject];
        byName.set(e.subject, target);
      }
    } else if (e.kind === "alias-drop") {
      dropAlias(e.subject);
      byName.delete(e.subject);
    } else if (e.kind === "remove") {
      // Merge minus the survivor: the node was never an ingredient at all
      // (equipment, a parse artifact), so nothing answers for its name and
      // its lines go back to unresolved at the next build. No redirect on
      // purpose — there is no right place to forward to.
      const from = byName.get(e.subject);
      if (!from) continue;
      for (const a of [from.name.toLowerCase(), ...from.aliases.map((x) => x.toLowerCase())])
        byName.delete(a);
      o.ingredients = o.ingredients.filter((i) => i.id !== from.id);
      for (const rel of [o.relations.is_a, o.relations.derives_from])
        for (let i = rel.length - 1; i >= 0; i--)
          if (rel[i]![0] === from.id || rel[i]![1] === from.id) rel.splice(i, 1);
    } else if (e.kind === "gloss") {
      // Display and search only, same as the table it lands in — an empty
      // object clears the gloss rather than being a refused edit.
      const i = byName.get(e.subject);
      if (i) i.gloss = e.object || undefined;
    } else if (e.kind.endsWith("-add") || e.kind.endsWith("-remove")) {
      const rel = e.kind.startsWith("is_a") ? o.relations.is_a : o.relations.derives_from;
      const child = idOfName(e.subject), parent = idOfName(e.object);
      if (!child || !parent) continue;
      const at = rel.findIndex((p) => p[0] === child && p[1] === parent);
      if (e.kind.endsWith("-remove")) { if (at >= 0) rel.splice(at, 1); }
      else if (at < 0) rel.push([child, parent]);
    }
  }
  for (const e of edits) {
    if (e.kind !== "rename") continue;
    const i = byName.get(e.subject);
    if (i && e.object) { i.name = e.object; index(i); }
  }
}

/**
 * Drop the memoised ontology so the next request re-reads and re-overlays.
 * Called by every editor action right after it records — this is the moment
 * "recorded" becomes "visible", and it is the whole difference between the
 * curator seeing their fix and seeing a stale suggestion.
 */
export function bustOntology(): void {
  cache = null;
}

export function load() {
  if (cache) return cache;
  const o = JSON.parse(readFileSync(resolve(DATA, "ontology.json"), "utf8")) as Ontology;
  overlayEdits(o);
  const idx = JSON.parse(readFileSync(resolve(DATA, "recipe-index.json"), "utf8")) as
    { recipes: Recipe[] };

  /**
   * Curated main ingredients, merged in here rather than written into the index.
   *
   * RECIPE-SPEC §3: a re-parse rewrites `requires` and must never touch a
   * human's judgement, so `npm run recipe-index` stays free to regenerate and
   * the judgement survives it. §4c also asks that a main ingredient which is no
   * longer in `requires` be a FLAG rather than a silent deletion — so it is kept
   * here, and the curate view is where the mismatch surfaces.
   */
  const curated = allCurations();

  /**
   * IDS FOLLOW THE MERGE — before anything reads them. The stored index
   * predates every ledger merge made since the last pipeline, so its ids can
   * name nodes the overlay just retired. Left alone they render as raw ids
   * and stop matching; walked through the redirect map here, every consumer
   * downstream sees only ids the ontology can answer for.
   */
  const redir = new Map(Object.entries(o.redirects ?? {}));
  const follow = (id: string) => {
    let x = id;
    for (let n = 0; redir.has(x) && n < 5; n++) x = redir.get(x)!;
    return x;
  };
  for (const r of idx.recipes) {
    r.requires = [...new Set(r.requires.map(follow))];
    r.optional = [...new Set((r.optional ?? []).map(follow))]
      .filter((id) => !r.requires.includes(id));
    if (r.alternates) r.alternates = Object.fromEntries(
      Object.entries(r.alternates).map(([k, gs]) => [follow(k), gs.map((g) => g.map(follow))]));
  }

  /**
   * LIVE RE-RESOLUTION — the curator's ask (2026-08-20): "the change should be
   * reflected to the ontology and recipe annotation real time."
   *
   * The index resolved every line offline, so a recipe's `unresolved` list is
   * frozen at the last pipeline run — an alias recorded in the editor fixed
   * the ONTOLOGY view immediately (the overlay above) but the recipe kept
   * claiming an unknown. Here every unresolved surface is retried against the
   * OVERLAID vocabulary: a hit moves into `requires` and out of `unresolved`,
   * so the queue's completeness, the matcher, and the zero-unknown counts all
   * see the curator's edit on the next request.
   *
   * Deliberately only a vocabulary lookup (names + aliases, number-folded) —
   * not the parse engine. Surfaces that need reparsing still wait for the
   * pipeline, which is honest: those are code fixes, not curation.
   */
  const vocab = new Map<string, string>();
  for (const i of o.ingredients) {
    if (i.id.startsWith("pending:")) continue;   // no durable id yet (§1)
    for (const form of [i.name, ...i.aliases]) {
      const f = form.toLowerCase();
      vocab.set(f, i.id);
      vocab.set(numberKey(f), i.id);
    }
  }
  for (const r of idx.recipes) {
    if (!r.unresolved?.length) continue;
    const still: string[] = [];
    for (const s of r.unresolved) {
      const hit = vocab.get(s.toLowerCase()) ?? vocab.get(numberKey(s));
      if (hit) { if (!r.requires.includes(hit)) r.requires.push(hit); }
      else still.push(s);
    }
    r.unresolved = still;
  }

  /* Ids the overlaid ontology actually holds — the additions gate below. */
  const held = new Set(o.ingredients.map((i) => i.id));
  for (const r of idx.recipes) {
    const m = curated[r.id]?.main_ingredients;
    if (m && m.length) r.mainIngredients = m.slice(0, 2).map(follow);

    /* Ingredients the SOURCE omitted — the curator's additions (2026-08-20:
       "there's no way to add ingredient when the original recipe omitted
       it"). Same §3 rail as mains: the judgement lives in the curation row
       and folds into `requires` here, so a re-parse cannot erase it. Through
       the redirect map so a later merge cannot strand it; an id we no longer
       hold is skipped, not emitted. */
    for (const aid of curated[r.id]?.added_ingredients ?? []) {
      const live = follow(aid);
      if (held.has(live) && !r.requires.includes(live)) r.requires.push(live);
    }

    /* Curated components ride the same rail as curated mains, for the same
       §3 reason: a re-parse rewrites `requires` and must never touch a
       human's judgement, so "this recipe uses that recipe" lives in the
       curation row and merges here. Expansion into `requires` happens at
       assembly (`expandComponents`), never in the stored index. */
    const comp = curated[r.id]?.components;
    if (comp && comp.length) r.components = comp;

    /* Multiple cuisines (settled 2026-08-16), same rail again: the curator's
       list wins, its first entry becomes the primary the single field keeps
       carrying, and single-cuisine rows never wrote the list at all. */
    const cs = curated[r.id]?.cuisines;
    if (cs && cs.length) { r.cuisines = cs; r.cuisine = cs[0]!; }

    /**
     * `null` is not `undefined`, and the difference bit.
     *
     * The index writes `"rating": null` on the 942 recipes whose source had
     * none — the key is present on all 4,874. Every consumer reasonably wrote
     * `rating !== undefined`, which is TRUE for null, so a "Popular" shelf
     * meant to hold 3,932 rated recipes held 4,872, and `rating.toFixed(1)`
     * was one tab away from throwing.
     *
     * Normalised HERE rather than guarded at each call site, so the optional
     * field on `Recipe` describes what callers actually receive. A type that
     * says `rating?: number` and delivers null is the lie that caused this.
     */
    if (typeof r.rating !== "number") delete r.rating;
    if (typeof r.yield !== "string" || !r.yield.trim()) delete r.yield;
  }
  /**
   * THE HARD GATE — the curator's decision, 2026-08-17.
   *
   * Pantry matching is the product's core value, so no corpus recipe reaches a
   * user until a person has read it and said keep. `recipes` — the list every
   * public surface reads — is only the recipes with a clear go; the full corpus
   * is `allRecipes`, for the surfaces whose JOB is the ungated set (the
   * curation queue, the creator claim flow, request dedupe).
   *
   * The default is flipped on purpose: a consumer nobody remembered to update
   * shows less, never more. User-added recipes are unaffected — they live in
   * the user's own store, not in this index, and were never gated.
   */
  /**
   * A recipe that USES another recipe waits for it — the curator's rule,
   * 2026-08-21: "it should not show up in recommendation until the origin
   * recipe's done with curation." The dependent's ingredient list is partly
   * the component's (`expandComponents` folds it in), so serving the
   * dependent before a person has read the component would rest a public
   * match on an unvetted parse. KEPT, not merely read (tightened the same
   * day, with the recursive fold): the fold resolves components from the
   * public pool, so a dropped component would leave a visible dependent
   * silently understating its ingredients — the exact lie this gate
   * exists to prevent. A component id the corpus no longer holds keeps the
   * dependent hidden too, which is the safe side of a stale reference.
   */
  /**
   * LIFTED 2026-11-06 — jipbap is now a personal meal-planning sandbox, and
   * reading 17k recipes one by one is not a job anyone will finish. The gate
   * flips to "everything not dropped": a drop verdict still hides a recipe
   * (and anything that uses it), an uncurated recipe shows. Accepted cost:
   * a recipe with an unresolved line can look cookable when it isn't.
   */
  /* The static export prerenders KEPT recipes only (2026-11-06): all 17k
     pages took 60 GB and ~50k files, past Cloudflare's file limit. The
     bundle still ships everything not dropped, and the browser draws the
     rest (`RecipeShell`). `src/static/build-data.ts` uses the same two sets. */
  const keptOnly = process.env.STATIC_MODE === "1";
  const corpusIds = new Set(idx.recipes.map((r) => r.id));
  const shown = (id: string) => corpusIds.has(id) &&
    (keptOnly ? curated[id]?.verdict === "keep" : curated[id]?.verdict !== "drop");
  const visible = idx.recipes.filter((r) =>
    shown(r.id) && (r.components ?? []).every(shown));
  cache = {
    ingredients: o.ingredients,
    byId: new Map(o.ingredients.map((i) => [i.id, i])),
    redirects: new Map(Object.entries(o.redirects ?? {})),
    recipes: visible,
    allRecipes: idx.recipes,
    relations: buildRelations(o.relations),
    // Counts are what search suggestions SAY next to a name ("2,413 recipes"),
    // and what they say must be what a user can reach.
    recipeCount: countRecipes(visible),
    children: childrenOf(o.relations.is_a),
    edges: { is_a: o.relations.is_a, derives_from: o.relations.derives_from },
  };
  return cache;
}

export const nameOf = (id: string) => {
  const c = load();
  return c.byId.get(resolveId(id))?.name ?? id;
};

/**
 * The node a written name refers to, by name or alias — the inverse of `nameOf`.
 *
 * Exact only, and deliberately so. It exists to resolve what a CURATOR typed
 * beside a line they were fixing (see `submitCuration`), and that text either
 * names a node we hold or it does not. A fuzzy match here would silently file a
 * main-ingredient judgement against the wrong ingredient, which is worse than
 * not filing it — the curator can see an unresolved line and try again, but
 * cannot see a quietly wrong one.
 */
export function idForName(name: string): string | undefined {
  const key = (name ?? "").trim().toLowerCase();
  if (!key) return undefined;
  const { ingredients } = load();
  const exact = ingredients.find((i) => i.name.toLowerCase() === key);
  if (exact) return exact.id;
  const viaAlias = ingredients.find((i) =>
    (i.aliases ?? []).some((a) => a.toLowerCase() === key));
  return viaAlias?.id;
}
/**
 * What sort of thing an ingredient is — the aisle grouping's input (`lib/aisle`).
 *
 * Undefined for an id we do not hold, which includes every free-text row the
 * user typed. That is the honest answer and the grouping handles it.
 */
export const kindOf = (id: string) => load().byId.get(id)?.kind;

/**
 * Ingredient search for the add-box.
 *
 * Prefix hits first, then substring, then aliases — because someone typing
 * "gar" means garlic, not "asian garlic chives". Ranked by corpus frequency
 * within each tier, which is the only popularity signal available before there
 * are users.
 */
/**
 * Singularise the last word — enough to make search number-insensitive.
 *
 * A copy of the ontology's rule rather than an import, for the same reason
 * `allergen-vocab.ts` is a copy: the app cannot reach across its package
 * boundary. Kept deliberately small — this decides what a search box matches,
 * not what an ingredient IS.
 */
const IRREG: Record<string, string> = {
  leaves: "leaf", knives: "knife", loaves: "loaf",
  cookies: "cookie", brownies: "brownie", anchovies: "anchovy",
};
const sing = (w: string) => {
  if (IRREG[w]) return IRREG[w]!;
  if (w.length < 4 || /(?:us|ss)$/.test(w)) return w;
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (/(?:oes|ses|xes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s")) return w.slice(0, -1);
  return w;
};
const numberKey = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    .split(" ").filter(Boolean).map(sing).join(" ");

/**
 * Find an ingredient by name or alias, ignoring number.
 *
 * NORMALIZATION, "Number": display names are singular, so a substring match on
 * the raw text meant a user typing "onions" found NOTHING — `"onion".includes
 * ("onions")` is false. That was already true for the 83% of nodes that were
 * singular before the rule existed.
 */
/**
 * Follow a retired id to the one that replaced it — INGREDIENT-SPEC §1.
 *
 * "A pantry row written in 2026 still resolves in 2030." Without this, a merge
 * silently empties part of somebody's pantry: the id is simply absent from the
 * ontology, so it stops matching and stops rendering, with no error anywhere.
 *
 * The emitted map is already flattened, so one hop is the whole walk. Unknown
 * ids come back unchanged — an id we have never seen is not the same problem as
 * a retired one, and pretending to resolve it would hide the difference.
 */
export function resolveId(id: string): string {
  // Was one hop, and the emitted map keeps that true — but overlay merges
  // append live and can chain onto emitted entries. Bounded walk instead.
  const { redirects } = load();
  let x = id;
  for (let n = 0; redirects.has(x) && n < 5; n++) x = redirects.get(x)!;
  return x;
}

export type Hit = Ingredient & {
  /** How many recipes use it — the number shown on the row. */
  recipes: number;
  /** The alias that matched, when the name itself did not. */
  via?: string;
  /**
   * More specific nodes beneath this one, best first.
   *
   * Offered because a SPECIFIC pantry entry strictly dominates a broad one in
   * matching: holding `coarse salt` covers a recipe asking for `salt` silently
   * (`belongsTo(have, want)`), while holding `salt` covers a recipe asking for
   * `coarse salt` only with a "check the source" disclosure and a ranking
   * penalty. Typing the broad word is the moment to say so.
   *
   * It is an OFFER, never a correction. Someone whose pack says "beef" should
   * add beef; a wrong cut is worse data than an honest broad one.
   */
  children?: Array<{ id: string; name: string; recipes: number }>;
};

/**
 * The seaweed-slot pattern, generalized (curator's ask 2026-08-20): a
 * native-named node renders as "korean red pepper paste - gochujang" wherever
 * a DISPLAY string is wanted. Never fed back into saves or lookups — those
 * stay on the canonical name.
 */
export function displayOf(id: string): string {
  const i = load().byId.get(resolveId(id));
  if (!i) return id;
  return i.gloss ? `${i.gloss} - ${i.name}` : i.name;
}

export function search(q: string, limit = 12): Hit[] {
  const term = q.toLowerCase().trim();
  if (!term) return [];
  const key = numberKey(term);
  const loaded = load();
  const { recipeCount, children, byId } = loaded;
  // Pending promotions are visible in the editor and the tree but never
  // offered here: a curation row that stored a `pending:` id would dangle
  // when the build mints the real one (INGREDIENT-SPEC §1).
  const ingredients = loaded.ingredients.filter((i) => !i.id.startsWith("pending:"));

  /** The alias that matched, so the row can say why it is being offered. */
  const aliasHit = (i: Ingredient) =>
    i.aliases.find((a) => {
      const al = a.toLowerCase();
      return al.includes(term) || numberKey(a).includes(key);
    // The gloss is searchable like an alias: "red pepper paste" finds
    // gochujang, and the hit says why it was offered.
    }) ?? (i.gloss?.includes(term) ? i.gloss : undefined);

  /**
   * An EXACT alias is identity, and identity outranks resemblance.
   *
   * Aliases used to sit below every name match, which inverted the answer on the
   * commonest synonyms in the corpus. Typing `spring onion` offered
   * *"forearm-length pieces of spring onion"* (2 recipes) and *"forearm-sized
   * piece of spring onion"* (2) above `scallion` (1,997) — because those two
   * contain the words in their NAME and scallion only carries them as an alias.
   * `green onion` did not surface scallion in the top five at all.
   *
   * That is not a near-miss; it is the wrong answer, offered first, on the two
   * fields where a curator defines the vocabulary. A tier gap of one should
   * never outweigh a factor of a thousand in usage, and an alias that EQUALS
   * what was typed is the strongest evidence there is: someone has already
   * recorded that these are the same thing.
   *
   * So exact matches — by name or by alias — share the top tier, and everything
   * else ranks by how much of the term it contains, with usage breaking ties.
   */
  const exactAlias = (i: Ingredient) =>
    i.aliases.some((a) => a.toLowerCase() === term || numberKey(a) === key);

  const tier = (i: Ingredient) => {
    const name = i.name.toLowerCase();
    const nk = numberKey(i.name);
    if (name === term || nk === key || exactAlias(i)) return 0;
    if (name.startsWith(term) || nk.startsWith(key)) return 1;
    if (name.includes(term) || nk.includes(key)) return 2;
    if (aliasHit(i)) return 3;
    return 4;
  };

  /**
   * Tier first, then RECIPES — not mentions. Someone typing `onion` means the
   * one 1,055 recipes call for, not a near-namesake used twice, and a ranking
   * that sorts on ingredient-line counts does not reliably know the difference.
   */
  return ingredients
    .map((i) => ({ i, t: tier(i), n: recipeCount.get(i.id) ?? 0 }))
    .filter((x) => x.t < 4)
    .sort((a, b) => a.t - b.t || b.n - a.n || a.i.name.localeCompare(b.i.name))
    .slice(0, limit)
    .map((x) => {
      const kids = (children.get(x.i.id) ?? [])
        .map((id) => ({ id, name: byId.get(id)?.name ?? id, recipes: recipeCount.get(id) ?? 0 }))
        // Best first, and capped: this is a hint under a row, not a second list.
        .sort((a, b) => b.recipes - a.recipes || a.name.localeCompare(b.name))
        .slice(0, 6);
      return {
        ...x.i, recipes: x.n,
        /* Say WHICH alias matched whenever the name itself does not contain
           the term — that is the row the user needs explaining. */
        ...(!x.i.name.toLowerCase().includes(term) && aliasHit(x.i)
            ? { via: aliasHit(x.i) } : {}),
        ...(kids.length ? { children: kids } : {}),
      };
    });
}

/**
 * Recipes whose TITLE matches — what planning a meal starts from.
 *
 * The ingredient search above answers "what can I make with this"; this answers
 * "I want bibimbap on Thursday", which is the question a calendar asks. Nothing
 * clever: a substring match, tiered so a title that STARTS with what you typed
 * beats one that merely contains it, and shorter titles first because "Bibimbap"
 * is a better answer to `bibimbap` than "Bibimbap Bowl with Leftover Turkey".
 *
 * Deliberately not fuzzy. The corpus has 4,874 titles and a typo-tolerant match
 * over them offers plausible wrong dishes, which is worse here than offering
 * nothing — you would plan the wrong dinner and not notice until Thursday.
 */
export function searchRecipes(q: string, limit = 12): Recipe[] {
  const term = q.toLowerCase().trim();
  if (term.length < 2) return [];
  const { recipes } = load();

  const tier = (r: Recipe) => {
    const t = r.title.toLowerCase();
    if (t.startsWith(term)) return 0;
    // Word-start beats mid-word: `pork` should find "Spicy Pork Bulgogi" before
    // anything that merely contains the letters.
    if (t.includes(` ${term}`)) return 1;
    if (t.includes(term)) return 2;
    return 3;
  };

  return recipes
    .map((r) => ({ r, t: tier(r) }))
    .filter((x) => x.t < 4)
    .sort((a, b) => a.t - b.t || a.r.title.length - b.r.title.length ||
                    a.r.title.localeCompare(b.r.title))
    .slice(0, limit)
    .map((x) => x.r);
}
