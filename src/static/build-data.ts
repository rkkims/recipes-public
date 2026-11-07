/**
 * The static client bundle — STATIC-SPEC §5 step 1.
 *
 *   npm run static-data        # writes static-data/*.json, prints the budget
 *
 * Emits the four files the static build ships to the browser, generated from
 * the SAME tables the server reads so the two modes cannot disagree:
 *
 *   static-data/recipes.json    every recipe not dropped (gate lifted 2026-11-06)
 *   static-data/ontology.json   nodes/aliases/redirects/relations, pruned to
 *                               the closure the shelf can reach
 *   static-data/retailers.json  brand rows + host allowlist, one source with
 *                               the /go Worker (§4) and the registry
 *   static-data/creators.json   who made what — the people behind the shelf,
 *                               and only those with a recipe on it
 *
 * Pruning is a fixpoint over relations, not one hop: a dish that uses a stock
 * that derives from anchovies must ship the anchovies, or client matching
 * diverges from the server's (the fold-all-the-way-down rule the grid
 * already learned). Redirects are kept when they land on a shipped node, so
 * old ids in a device's pantry keep resolving after merges.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, "static-data");
const read = (p: string) => JSON.parse(readFileSync(resolve(ROOT, p), "utf8"));

/** Warn (and fail CI-visibly) above this — STATIC-SPEC §5's bundle budget. */
const BUDGET_GZIP_BYTES = 5_000_000;

// ── the shelf ───────────────────────────────────────────────────────────────

const curations = read("data/curation/recipes.json") as Record<
  string,
  { verdict: string; cuisine?: string; cuisines?: string[]; make_ahead?: boolean;
    main_ingredients?: string[]; components?: string[] }
>;

const index = read("data/ontology/recipe-index.json") as {
  recipes: Array<{
    id: string; title: string; url: string; source: string; cuisine?: string;
    image?: string; yield?: string; rating?: number;
    requires: string[]; optional?: string[];
    alternates?: Record<string, string[][]>; unresolved?: string[];
  }>;
};

/**
 * Two sets since 2026-11-06.
 *
 * The bundle ships every recipe not dropped (the server gate was lifted), so
 * the grid matches the whole corpus on the device. But only KEPT recipes get
 * a prerendered page and a creator page: exporting all 17k pages took 60 GB
 * and ~50k files, past Cloudflare's 20,000-file limit. Every other recipe is
 * drawn by the browser from this bundle (`RecipeShell`, served for any
 * `/recipe/<id>` with no file by `deploy/cloudflare/site-worker.ts`).
 * `lib/data` applies the kept rule in STATIC_MODE, so the pages exported and
 * `creators.json` below are one set.
 *
 * A dish whose component is out stays out too, since the client folds
 * component ingredients in exactly as the server does.
 */
const verdictIs = (v: string) => new Set(
  Object.values(curations).filter((c) => c.verdict === v).map((c: any) => c.recipe_id),
);
const dropped = verdictIs("drop");
const kept = verdictIs("keep");
const corpusIds = new Set(index.recipes.map((r) => r.id));
const shown = (id: string) => corpusIds.has(id) && !dropped.has(id);
const onShelf = (id: string) => corpusIds.has(id) && kept.has(id);
const shipped = new Set(
  index.recipes
    .filter((r) => shown(r.id) &&
      (curations[r.id]?.components ?? []).every(shown))
    .map((r) => r.id),
);

const recipes = index.recipes
  .filter((r) => shipped.has(r.id))
  .map((r) => {
    const c: Partial<(typeof curations)[string]> = curations[r.id] ?? {};
    return {
      id: r.id, title: r.title, url: r.url, source: r.source,
      // The curator's cuisine outranks the site tag — same precedence as the
      // server's resolution table.
      cuisine: c.cuisines?.[0] ?? c.cuisine ?? r.cuisine ?? "unresolved",
      /* All of them, not just the primary: the cuisine chip tests membership
         (`cuisinesOf`), so a dish curated Korean AND Chinese has to reach both
         chips on a device as it does on the server. */
      ...(c.cuisines && c.cuisines.length > 1 ? { cuisines: c.cuisines } : {}),
      ...(r.image ? { image: r.image } : {}),
      ...(r.yield ? { yield: r.yield } : {}),
      /* A RANKING input, so it ships: Explore's quality term reads it through
         `sourceRating`, and the card draws it. Without it every recipe scores
         the unrated placeholder and the client shelf orders differently from
         the server's — the one divergence this bundle exists to prevent. */
      ...(typeof r.rating === "number" ? { rating: r.rating } : {}),
      requires: r.requires,
      ...(r.optional?.length ? { optional: r.optional } : {}),
      ...(r.alternates && Object.keys(r.alternates).length ? { alternates: r.alternates } : {}),
      ...(c.make_ahead ? { make_ahead: true } : {}),
      ...(c.main_ingredients?.length ? { main_ingredients: c.main_ingredients } : {}),
      ...(c.components?.length ? { components: c.components } : {}),
    };
  });

// ── the ontology closure ────────────────────────────────────────────────────

const ont = read("data/ontology/ontology.json") as {
  ingredients: Array<{ id: string; slug: string; name: string; gloss?: string;
    kind?: string; allergens?: string[];
    /* USER-SPEC §6's provenance axis. Dropped from this bundle once, on the
       reading that the client surfaces only display names — but `applyDiet`
       runs on the device now, and a vegetarian setting that stops filtering
       when the grid moves is the failure §6 calls a hazard. */
    animal_source?: "meat" | "fish" | "dairy" | "egg";
    aliases: string[] }>;
  redirects?: Record<string, string>;
  relations: { is_a: [string, string][]; derives_from: [string, string][] };
};

const used = new Set<string>();
for (const r of recipes) {
  for (const id of r.requires) used.add(id);
  for (const id of r.optional ?? []) used.add(id);
  /* `alternates` is an OR of ANDs — `Record<need, string[][]>` — so the ids
     are one level deeper than they look. Typed as `string[]` here until now,
     which typechecked and quietly added ARRAYS to a set of ids: every
     stand-in a recipe offers was missing from the shipped closure, so a
     device could hold a recipe whose alternative it has no name for. */
  for (const alts of Object.values(r.alternates ?? {}))
    for (const one of alts) for (const id of one) used.add(id);
}
// Fixpoint over both relations, both directions: matching walks these edges,
// so every node an edge can reach from the shelf ships with it.
const edges = [...ont.relations.is_a, ...ont.relations.derives_from];
let grew = true;
while (grew) {
  grew = false;
  for (const [a, b] of edges) {
    if (used.has(a) && !used.has(b)) { used.add(b); grew = true; }
    if (used.has(b) && !used.has(a)) { used.add(a); grew = true; }
  }
}

/**
 * The buy link, decided HERE and shipped — STATIC-SPEC §4's other half.
 *
 * On a server the grocery list asks a round trip which of its rows are worth a
 * link and where each one points (`offersForListRows`). Both halves read files:
 * `data/decisions/hard-to-find.csv` for the judgement, and the retailer's own
 * `urlFor` for the address. Neither exists in a browser, so a static build with
 * nothing baked would have no outbound link anywhere on it — and then the `/go`
 * Worker would be attribution for traffic that cannot happen.
 *
 * So the answer travels instead of the inputs. It is small (a marked minority
 * of the closure, one short URL each), it is the SAME answer the server gives
 * because it is the same two functions computing it, and it costs the client
 * nothing to use. The kind veto and the always-link list ride inside
 * `hardToFind`, so `garlic` still gets no link and `perilla leaf` still does.
 */
/* The registry, imported here because the closure below needs its default row.
   Relative imports only in that module tree, so tsx resolves it without the
   app's path alias — the same reason the retailer block downstream does it. */
const { RETAILERS, DEFAULT_RETAILER } = await import(
  resolve(ROOT, "app/src/lib/retailers.ts")
);
const { hardToFind } = await import(resolve(ROOT, "app/src/lib/findability.ts"));
const buyUrlFor = (i: { name: string; kind?: string }): string | null =>
  hardToFind(i.name, i.kind) ? DEFAULT_RETAILER.urlFor(i.name) : null;

const ingredients = ont.ingredients.filter((i) => used.has(i.id)).map((i) => {
  const url = buyUrlFor(i);
  return url ? { ...i, buy_url: url } : i;
});
const withBuy = ingredients.filter((i) => "buy_url" in i).length;
const redirects = Object.fromEntries(
  Object.entries(ont.redirects ?? {}).filter(([, to]) => used.has(to)),
);
const relations = {
  is_a: ont.relations.is_a.filter(([a, b]) => used.has(a) && used.has(b)),
  derives_from: ont.relations.derives_from.filter(([a, b]) => used.has(a) && used.has(b)),
};

// ── the creators, and whose recipes are on the shelf ────────────────────────

/**
 * The people behind the shelf — GO-LIVE's distribution channel 2, shipped.
 *
 * A creator's page is where their own audience lands from a link in a bio, so
 * it has to exist as a real file per creator. What that page and the Creators
 * directory need is small and fixed per deploy: who exists, what they are
 * called, the names the corpus knows them by, their face, and which of the
 * kept recipes are theirs. Everything ELSE on those pages — how many of their
 * dishes this kitchen can cook tonight, which are saved, whether you follow
 * them — is device state and is computed in the browser (`CreatorsDirectory`,
 * `CreatorShelfLive`), exactly as the grid and the list already are.
 *
 * A creator with no kept recipe is not here and gets no page: `allCreators`
 * already drops the withdrawn and the removed (CREATOR-SPEC §6/§6a), and an
 * empty shop window is the one thing `searchCreators` refuses to open too.
 *
 * The byline href is NOT a field. It is `/creators/<handle>`, and storing the
 * same string twice is how two answers to one question start to differ.
 */
/* `lib/creators` resolves its CSVs from `process.cwd()`, which this script
   does not sit in. So the cwd moves to `app/` for the import — where `next
   build` runs, and therefore the cwd those paths were written for — and stays
   there: every path this script reads or writes is already absolute. */
process.chdir(resolve(ROOT, "app"));
const { allCreators, aliasesOf, avatarOf, creatorOfRecipe } = await import(
  resolve(ROOT, "app/src/lib/creators.ts")
);

type BundleCreator = {
  id: string; handle: string; name: string; aliases: string[];
  icon?: { url: string; low_res?: true };
  recipe_ids: string[];
};

/* Recipe → creator resolved through the app's own reader, so a withdrawal, a
   removal or a claimed display name reaches the bundle the same way it reaches
   a server render: `creatorOfRecipe` returns null for a creator who left. */
const shelfOf = new Map<string, string[]>();
for (const r of recipes) {
  if (!onShelf(r.id) || !(r.components ?? []).every(onShelf)) continue;
  const c = creatorOfRecipe(r.id);
  if (!c) continue;
  const at = shelfOf.get(c.id);
  if (at) at.push(r.id); else shelfOf.set(c.id, [r.id]);
}

const creators: BundleCreator[] = (allCreators() as Array<{
  id: string; handle: string; displayName: string;
}>)
  .filter((c) => (shelfOf.get(c.id)?.length ?? 0) > 0)
  .sort((a, b) => a.displayName.localeCompare(b.displayName))
  .map((c) => {
    const a = avatarOf(c.id) as { url: string; lowRes: boolean } | null;
    return {
      id: c.id, handle: c.handle, name: c.displayName,
      aliases: aliasesOf(c.id) as string[],
      ...(a ? { icon: { url: a.url, ...(a.lowRes ? { low_res: true as const } : {}) } } : {}),
      recipe_ids: shelfOf.get(c.id)!,
    };
  });

// ── the retailer rows ───────────────────────────────────────────────────────
// From the live registry (imported above) so the Worker's allowlist and the
// app's can never disagree (RETAILER-SPEC §6).
const retailers = {
  default: DEFAULT_RETAILER.id,
  rows: RETAILERS.map((r: any) => ({
    id: r.id, label: r.label, blurb: r.blurb,
    hosts: r.hosts, regions: r.regions,
    /* The Worker's two facts, and the reason this file is the Worker's input
       as well as the app's (STATIC-SPEC §4): `hosts` IS the open-redirect
       allowlist, exact hosts and never a substring test, and `search_path`
       is what lets it record `resolved` — did we send them to a real shelf,
       or to a search — without re-learning the shape of anyone's URLs. */
    search_path: r.searchPathPrefix,
  })),
};

// ── write, and hold the budget ──────────────────────────────────────────────

/* Written twice on purpose: `static-data/` is the export pipeline's input
   (STATIC-SPEC §5), and `app/public/static-data/` is where the SERVER-mode
   client fetches the same bundle once matching moves client-side (§2) — one
   generator, two doors, no drift. Both are gitignored build artifacts. */
const APP_PUB = resolve(ROOT, "app/public/static-data");
mkdirSync(OUT, { recursive: true });
mkdirSync(APP_PUB, { recursive: true });
const files: Record<string, unknown> = {
  "recipes.json": { generated_at: new Date().toISOString(), count: recipes.length, recipes },
  "ontology.json": { schema: 1, ingredients, redirects, relations },
  "retailers.json": retailers,
  "creators.json": { schema: 1, creators },
};
let totalGzip = 0;
for (const [name, data] of Object.entries(files)) {
  const body = JSON.stringify(data);
  writeFileSync(resolve(OUT, name), body);
  writeFileSync(resolve(APP_PUB, name), body);
  const gz = gzipSync(body).length;
  totalGzip += gz;
  console.log(`  ${name}: ${(body.length / 1024).toFixed(0)} KB raw, ${(gz / 1024).toFixed(0)} KB gzip`);
}
console.log(`\n${recipes.length} shipped recipe(s), ${ingredients.length} node(s) in closure`);
console.log(`${withBuy} node(s) carry a buy link (hard-to-find, minus the kind veto)`);
console.log(`${creators.length} creator(s) with at least one shipped recipe — one page each`);
console.log(`bundle total: ${(totalGzip / 1024).toFixed(0)} KB gzip (budget ${(BUDGET_GZIP_BYTES / 1024).toFixed(0)} KB)`);
if (totalGzip > BUDGET_GZIP_BYTES) {
  console.error("OVER BUDGET — STATIC-SPEC §5: trim fields or rethink before shipping this");
  process.exit(1);
}
