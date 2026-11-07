/**
 * Recipe → ontology index. The artifact the app matches against.
 *
 *   npm run recipe-index
 *
 * The resolver already computes this on every run and throws it away. Writing it
 * down is the last data step before Phase A: a matcher needs "which nodes does
 * this recipe require", and nothing has ever persisted that.
 *
 * Output is data/ontology/recipe-index.json:
 *
 *   { generated, counts, recipes: [ { id, title, url, source, cuisine,
 *                                     requires: [nodeId], unresolved: [surface] } ] }
 *
 * `unresolved` is kept per recipe rather than dropped, because the matcher has to
 * treat "I know every ingredient and you have them all" differently from "I know
 * most of them". A recipe with one unknown garnish is still cookable; one with
 * four unknowns is a recipe we cannot honestly score. DECISIONS §3 — "in v1
 * there should be no unmapped ingredients" — is about what the USER sees, and
 * this field is how the app keeps that promise: it can hide what it cannot
 * fully account for rather than quietly understating requirements.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { headName } from "../ingest/frequency.js";
import { narrowByGloss } from "../ingest/gloss.js";
import { applySiteRules, NAME_PROPOSALS, type DropReason } from "../ingest/site-rules.js";
import { knownNodes, resolveIngredient } from "../ingest/resolve.js";
import { lineKey, loadLlmLines } from "../ingest/llm-lines.js";
import { buildIds } from "./ids.js";
import { singular } from "./normalize.js";
import type { Vocabulary } from "./normalize.js";
import { resolveVariant, type ResolutionTier } from "./resolution.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RAW = resolve(ROOT, "data/raw");
const OUT = resolve(ROOT, "data/ontology/recipe-index.json");
/**
 * Per-LINE detail, for curation only.
 *
 * A separate file because it is several times larger than the index and the app
 * only needs it on one screen. It also keeps the parser in one place: the
 * curation UI cannot import `headName` across the package boundary, so the
 * analysis is precomputed here rather than mirrored there.
 */
const OUT_LINES = resolve(ROOT, "data/ontology/recipe-lines.json");

/**
 * Image URLs the source has taken down, blanked on the way out.
 *
 * A recipe whose photograph 404s is a recipe with no photograph, and the app
 * has exactly one rule about those: `picturedFirst` ranks them last, because a
 * blank tile at the head of a grid of photographs reads as broken rather than
 * as "this one has no photo". That rule was being defeated by the DATA — the
 * crawl recorded an `imageUrl`, the URL had since died, and the index called it
 * pictured. "Easy Egg Fried Rice" led the shelf with an empty box.
 *
 * Blanked here rather than checked in the app, because it is a fact about the
 * corpus and the app must not make 4,874 network requests to lay out a grid.
 * See the note inside the file for what does and does not qualify — a crawler
 * being served a bot challenge is not a dead image.
 */
const DEAD_IMAGES: Set<string> = new Set(Object.keys(
  (JSON.parse(readFileSync(resolve(ROOT, "data/ontology/dead-images.json"), "utf8")) as
    { dead: Record<string, string> }).dead));

/**
 * Locally mirrored photographs — hosts that challenge-wall their images for
 * some visitors (cache-images.ts has the argument and the mechanics). A
 * cached image wins over the original URL, and a cached image is by
 * definition not dead: the bytes are on our disk.
 */
const CACHED_IMAGES: Record<string, string> = existsSync(resolve(ROOT, "data/images/cached.json"))
  ? JSON.parse(readFileSync(resolve(ROOT, "data/images/cached.json"), "utf8"))
  : {};

/** Field names as the crawler writes them — see src/ingest/normalize.ts. */
type Raw = {
  sourceUrl?: string; title?: string; sourceId?: string; cuisine?: string;
  rawIngredients?: string[]; imageUrl?: string; recipeYield?: string;
  ratingValue?: number; ratingCount?: number; datePublished?: string;
};

if (!existsSync(RAW)) { console.error("no data/raw — run: npm run crawl"); process.exit(1); }

const recipes: Raw[] = [];
for (const f of readdirSync(RAW).filter((f) => f.endsWith(".jsonl")))
  for (const l of readFileSync(resolve(RAW, f), "utf8").split("\n"))
    if (l.trim()) { try { recipes.push(JSON.parse(l)); } catch { /* skip */ } }

/**
 * One row per URL.
 *
 * The corpus has genuine duplicates — the same recipe recrawled, and one source
 * that served a ten-recipe carousel on every page (DECISIONS §6). A duplicate
 * would double that recipe's weight in every list the app renders.
 */
const byUrl = new Map<string, Raw>();
for (const r of recipes) if (r.sourceUrl && !byUrl.has(r.sourceUrl)) byUrl.set(r.sourceUrl, r);
const unique = [...byUrl.values()];

// Vocabulary for the engine's safety conditions, and for the parser's second
// pass — both need every head the corpus uses.
//
// Site rules run FIRST, so the vocabulary is built from the lines the parser will
// actually see. Skipping that would put site-specific artefacts ("plump garlic",
// "boiling hot water") into the vocabulary that the second pass then uses as
// evidence for other lines.
const heads = new Set<string>();
for (const r of unique) for (const raw of r.rawIngredients ?? []) {
  const v = applySiteRules(r.sourceId, raw);
  if (v.kind !== "keep") continue;
  const h = headName(v.raw); if (h) heads.add(h);
}
const vocab: Vocabulary = { has: (h) => heads.has(h) };
const known = knownNodes();
const { idOf, nameOf: idName, lookup: idFor } = buildIds();
/** A gloss token through the SAME engine as every line — identity stays the
    ontology's. Compound resolutions are refused; a gloss names one thing. */
const resolveTok = (t: string): string | null => {
  const r = resolveIngredient(t, known, vocab, heads);
  if (!r?.known || r.node.includes(" + ")) return null;
  return idFor(r.node) ?? null;
};
/**
 * For the curator's ADDED ingredients (curation rows store node ids): the set
 * of ids the ontology holds, and the emitted redirect map so an id retired by
 * a merge since the save still lands on its survivor. An id neither held nor
 * redirected is skipped and counted, never emitted — the index must not
 * reference what the app cannot look up.
 */
const NODE_IDS = new Set(idOf.values());
const ONTOLOGY = JSON.parse(readFileSync(resolve(ROOT, "data/ontology/ontology.json"), "utf8")) as
  { redirects?: Record<string, string>; relations?: { is_a?: Array<[string, string]> } };
const ID_REDIRECTS: Record<string, string> = ONTOLOGY.redirects ?? {};
let addedIn = 0, addedStale = 0;

/**
 * Gloss narrowing (gloss.ts): the author's parenthetical picks the species
 * where the head picked the family. Wired here because the decision needs the
 * hierarchy — a gloss only counts when it names an is_a DESCENDANT of what the
 * head resolved to, and the is_a forest lives in the built ontology.
 */
const IS_A_PARENTS = new Map<string, string[]>();
for (const [child, parent] of ONTOLOGY.relations?.is_a ?? []) {
  IS_A_PARENTS.set(child, [...(IS_A_PARENTS.get(child) ?? []), parent]);
}
const parentsOf = (id: string) => IS_A_PARENTS.get(id) ?? [];
let glossed = 0;

/**
 * Context the variant resolver reads — RESOLUTION-SPEC §3.
 *
 * Cuisine: the curator's answer when there is one, the crawl's site tag
 * otherwise. Dish type: the curator's LEGACY answer when one was saved, else
 * the classifier's proposal — curation stopped collecting it 2026-08-17, so
 * for nearly every recipe this input is machine-derived, which is why a
 * dish-type-triggered resolution is always flagged and never silent.
 */
const CURATIONS: Record<string, { cuisine?: string; dish_type?: string;
                                  resolutions?: Array<{ raw: string; to: string }>;
                                  line_components?: Array<{ raw: string; recipe_id: string }>;
                                  added_ingredients?: string[];
                                  tier_overrides?: Array<{ raw: string; optional: boolean }> }> =
  existsSync(resolve(ROOT, "data/curation/recipes.json"))
    ? JSON.parse(readFileSync(resolve(ROOT, "data/curation/recipes.json"), "utf8")) : {};
/**
 * Per-line parse corrections from the ingredient modal (2026-08-20) —
 * data/decisions/line-fixes.csv, "(recipe, verbatim line) MEANS node".
 * Curated-tier resolutions recordable before any curation row exists.
 * Append-only, last row wins; empty node retracts.
 */
const LINE_FIXES = new Map<string, string>();
{
  const f = resolve(ROOT, "data/decisions/line-fixes.csv");
  if (existsSync(f)) {
    const txt = readFileSync(f, "utf8");
    for (const line of txt.split("\n").slice(1)) {
      // Minimal CSV: the raw may be quoted with embedded commas.
      const m = line.match(/^([^,]+),(?:"((?:[^"]|"")*)"|([^,]*)),(?:"((?:[^"]|"")*)"|([^,]*)),/);
      if (!m) continue;
      const rid = m[1]!, raw = (m[2]?.replace(/""/g, '"') ?? m[3] ?? ""), node = (m[4]?.replace(/""/g, '"') ?? m[5] ?? "").trim();
      if (!rid || !raw) continue;
      if (node) LINE_FIXES.set(`${rid} ${raw}`, node); else LINE_FIXES.delete(`${rid} ${raw}`);
    }
  }
}

const CLASSIFY: Record<string, { dish_type?: string }> =
  existsSync(resolve(ROOT, "data/ontology/classify.json"))
    ? JSON.parse(readFileSync(resolve(ROOT, "data/ontology/classify.json"), "utf8")) : {};

type Row = {
  id: string; title: string; url: string; source: string; cuisine: string;
  image: string; yield: string; rating: number | null; datePublished?: string;
  /** Ingredients the dish needs. Missing one means you cannot make it. */
  requires: string[];
  /**
   * Ingredients the recipe itself marks as optional — a garnish, a "if you have
   * it". Missing one costs nothing, so the matcher must not count it.
   *
   * The signal is in the raw line and we were destroying it: `optional` is in
   * the parser's NOISE list, so "2 tsp soup soy sauce (optional)" and "2 tsp
   * soup soy sauce" produced the same head and the same requirement.
   */
  optional: string[];
  /** Requirement id → stand-ins THIS RECIPE offers. */
  alternates: Record<string, string[][]>;
  unresolved: string[];
  /**
   * Requirement id → the LEAF this recipe's cuisine means by it, where a
   * RESOLUTION-SPEC §3 row applies (`chili flakes` in a Korean recipe →
   * gochugaru). Matching stays family-level and must not read this; commerce
   * links from the leaf, or not at all — loose matching, strict linking.
   */
  resolved?: Record<string, string>;
};

/** One ingredient line, as the curator needs to see it. */
type Line = {
  raw: string;
  head: string;
  /** Resolved node id, or null when we could not place it. */
  node: string | null;
  /**
   * EVERY node this line resolves to. "salt and pepper to taste" is two, and
   * showing only the first told the curator pepper had been dropped when it
   * was in `requires` all along.
   */
  nodes: string[];
  /**
   * Alternatives the recipe itself offers — "gochujang OR sriracha". The parser
   * keeps one side and discards the other, so this is the only place the
   * author's own substitution survives. It is the raw text, not a node: turning
   * it into one is a curation decision.
   */
  alts: string[];
  /** The recipe marks this line optional. */
  optional: boolean;
  /**
   * Why a site rule discarded this line, when one did.
   *
   * A line we know is a colander and a line we failed to read are the same thing
   * in the data today, so both render as "unresolved" and the curator is asked
   * about equipment on every kimchi recipe forever. This field is the difference
   * (RECIPE-SPEC §4b) — present means "deliberately not an ingredient".
   */
  dropped?: DropReason;
  /**
   * RESOLUTION-SPEC §1: what this mention MEANS here, when a table row knows.
   * `written` is the raw line, untouched above; this is the sibling the
   * cuisine picks, with provenance. Absent for the overwhelmingly common line
   * no row covers.
   */
  resolved?: string;
  resolution?: ResolutionTier;
};

const rows: Row[] = [];
const lines: Record<string, Line[]> = {};
/**
 * Every resolution stamped, for the QC ledger — flags first when written.
 * "What fraction of soy-sauce lines still run on the default" is the honest
 * measure of how much of the corpus is guessed versus known (spec §5), and
 * this file is where that number lives.
 */
const resolutionQc: Array<{ recipe: string; title: string; cuisine: string; dish: string;
                            raw: string; node: string; to: string; tier: string; flag: string }> = [];
/** What site rules discarded, by reason — printed, so a rule going wild is visible. */
const siteDrops: Partial<Record<DropReason, number>> = {};
/**
 * Alias candidates harvested from the pages themselves — this author glosses
 * Korean terms as `English (romanization, 한글)`, which is a hand-authored alias
 * table published across 249 recipes.
 *
 * Written to a report, never into the ontology: an alias is a claim about
 * identity and goes through review (§7).
 */
const aliasProposals: Array<{ source: string; surface: string; alias: string }> = [];
let noId = 0;
/** The extraction overlay (NORMALIZATION, "The LLM extraction overlay") —
    consulted ONLY where the deterministic parse fails. */
const llmLines = loadLlmLines();
let llmResolved = 0, llmNamed = 0;

/**
 * Alternatives offered by the recipe text.
 *
 * Deliberately crude: split on `or` / `/` and hand both sides to a person. A
 * cleverer version would guess which side is canonical, and guessing is exactly
 * what the curation screen exists to replace.
 */
/**
 * Content-derived recipe id: a HASH of the URL, not a prefix of it.
 *
 * The first version took `base64url(url).slice(0, 22)`, which encodes only the
 * first ~16 bytes of the string — the scheme and the domain. Every recipe from
 * one blog got the same id, so 4,874 recipes had 15 distinct ids between them,
 * and nothing complained: the index still had 4,874 rows.
 *
 * It would have surfaced as a user's cook history attaching to every recipe on a
 * site at once. Hashing puts the whole URL in play, which is what "content-
 * derived" was supposed to mean.
 */
const recipeId = (url: string) =>
  "rec_" + createHash("sha256").update(url).digest("hex")
    .slice(0, 24).replace(/[0-9a-f]{2}/g, (h) =>
      "0123456789abcdefghijklmnopqrstuv"[parseInt(h, 16) % 32]!);

/**
 * A line the recipe marks as optional.
 *
 * GARNISH in any form counts — reviewer's call. "for garnish", "garnishes",
 * "garnish: sesame seeds" and "(garnish)" are all the author saying the dish
 * works without it. That is exactly the tier distinction, and the wording varies
 * far more than the meaning.
 *
 * "to taste" mid-line is deliberately NOT here: it means adjust the amount, not
 * omit the ingredient — salt to taste still needs salt. Trailing "to taste" on
 * its own is different and does count, because that phrasing appears on the
 * pinch-of-something lines nobody would shop for.
 */
const OPTIONAL_LINE =
  /\boptional\b|\bif desired\b|\bif you (?:have|like|prefer)\b|\bto taste,? *$|\bgarnish\w*\b|\btopping\w*\b|\bfor serving\b|\bto serve\b|\bon the side\b|\bas needed\b/i;

const ALT_SPLIT = /\s+or\s+|\s*\/\s*/i;
function alternatives(raw: string, vocab: Vocabulary, heads: Set<string>): string[] {
  const body = raw.replace(/\([^)]*\)/g, " ").replace(/[)\]]/g, " ").trim();
  if (!ALT_SPLIT.test(body)) return [];
  return body.split(ALT_SPLIT)
    .map((p) => p.trim())
    .filter((p) => p.length > 2)
    // An alternative has to BE an ingredient. "1 tbsp gochugaru or more to
    // taste" offered `more to taste` as a substitute, which is not a thing you
    // can buy. Running each side through the parser filters the quantity
    // phrases out and leaves the author's real alternatives.
    .map((p) => headName(p, heads))
    // An alternative must resolve to something the ontology knows. "more" and
    // "less" survive a length test and are not ingredients; requiring a node
    // means the curator is only ever offered real choices.
    // `known` is keyed number-insensitively, so the alternative has to be too —
    // "red chili peppers" is the node "red chili pepper" and an exact lookup
    // silently discarded every plural alternative.
    .filter((h) => h.length > 2 && known.has(
      h.toLowerCase().split(" ").map((w) => singular(w).replace(/s$/, "")).join(" ")))
    .filter((h, i, a) => a.indexOf(h) === i)
    .slice(0, 4);
}
for (const r of unique) {
  /* Lines the curator ruled ARE another recipe — "4 Tonkatsu (Pork Cutlets)".
     They are not ingredient holes: the component's own requires fold in at
     app assembly (`expandComponents`), so the line is simply discharged here. */
  const componentRaws = new Set(
    (CURATIONS[recipeId(r.sourceUrl ?? "")]?.line_components ?? []).map((x) => x.raw));
  const requires = new Set<string>();
  const optional = new Set<string>();
  const alternates: Record<string, string[][]> = {};
  const unresolved: string[] = [];
  const ridForFix = recipeId(r.sourceUrl ?? "");
  /* The curator's required/optional corrections, by raw line. Stored since
     the form existed, consumed by NOTHING until 2026-08-21 — the kimchi in
     "add more if you like" sat optional however often a human said
     otherwise. The override outranks the wording. */
  const tierOf = new Map(
    (CURATIONS[ridForFix]?.tier_overrides ?? []).map((t) => [t.raw, t.optional]));
  for (const original of r.rawIngredients ?? []) {
    if (componentRaws.has(original)) continue;
    // A recorded line fix outranks every parser opinion about this line.
    const fix = LINE_FIXES.get(`${ridForFix} ${original}`);
    if (fix) {
      const fid = idFor(fix);
      if (fid) {
        ((tierOf.get(original) ?? OPTIONAL_LINE.test(original)) ? optional : requires).add(fid);
        continue;
      }
    }
    // Site rules first: they drop what this source is known to list that is not
    // an ingredient, and rewrite its house style into something the general
    // parser can read. A source with no rules passes through untouched.
    const site = applySiteRules(r.sourceId, original);
    if (site.kind === "drop") { siteDrops[site.reason] = (siteDrops[site.reason] ?? 0) + 1; continue; }
    const line = site.raw;
    for (const a of site.aliases) aliasProposals.push({ source: r.sourceId ?? "", ...a });
    const out = resolveIngredient(line, known, vocab, heads);
    // Optionality is a property of what the AUTHOR wrote, so it is read from the
    // original line — the rewrite strips purpose clauses, and "- optional" is one.
    const isOptional = tierOf.get(original) ?? OPTIONAL_LINE.test(original);
    if (!out || !out.known) {
      // The deterministic parse failed — the overlay's turn, keyed on the
      // ORIGINAL line. Its names go through the SAME resolution engine; the
      // model proposed a surface, identity stays the ontology's.
      const fb = llmLines.get(lineKey(original));
      if (fb) {
        const opt = isOptional || fb.optional;
        let hit = false;
        for (const nm of fb.names) {
          const r2 = resolveIngredient(nm, known, vocab, heads);
          if (r2?.known) {
            for (const part of r2.node.split(" + ")) {
              const id = idFor(part.trim());
              if (id) { (opt ? optional : requires).add(id); hit = true; }
            }
          } else if (r2 && !r2.known && !opt) {
            // A NAMED unresolved surface — visible alias work, not silence.
            // `r2 === null` is different: the engine DROPS that name by
            // design (water, measurements), and the overlay must not turn a
            // deliberate silence into a hole — 2,371 of the pilot's lines
            // are just water.
            unresolved.push(r2.surface);
            llmNamed++;
          }
        }
        if (hit) llmResolved++;
        continue;
      }
      if (!out) continue;                     // measurement only, water, equipment
      // An unresolved OPTIONAL line is not a hole in our knowledge of the dish:
      // the recipe says you can leave it out, so it must not disqualify the
      // recipe from being fully accounted for.
      if (!isOptional) unresolved.push(out.surface);
      continue;
    }
    // The author's parenthetical narrows the family word to the species
    // (gloss.ts) — read from the ORIGINAL line, because site rules may
    // rewrite the parens away before the resolver sees them.
    let nodeOut = out.node;
    if (!nodeOut.includes(" + ")) {
      const id0 = idFor(nodeOut);
      const nid = id0 ? narrowByGloss(original, id0, resolveTok, parentsOf) : null;
      const nname = nid ? idName.get(nid) : undefined;
      if (nname) { nodeOut = nname; glossed++; }
    }
    // A split line resolved to BOTH its halves, and the resolver reports them
    // joined ("salt + black pepper") because it answers a yes/no question. The
    // index needs ids, and the joined string is not a node — every one of these
    // was being counted as unresolved.
    for (const part of nodeOut.split(" + ")) {
      const id = idFor(part.trim());
      // No id means the name is a candidate, excluded from the ontology.
      // Emitting it would reference something the app cannot look up.
      if (!id) { if (!isOptional) { unresolved.push(part.trim()); noId++; } continue; }
      (isOptional ? optional : requires).add(id);

      // The alternatives on this line stand in for THIS requirement. Site rules
      // contribute the ones the general pass cannot see — this author's
      // substitutions are nearly all inside brackets, which `alternatives()`
      // strips before it looks for "or".
      const alts = [...alternatives(line, vocab, heads),
                    ...site.alternates.map((a) => headName(a, heads))]
        .filter((h) => h.length > 2)
        .map((h) => idFor(h))
        .filter((x): x is string => !!x && x !== id);
      // Each alternative is a GROUP of ids that stand in together (§3a). Every
      // group the parser produces today has exactly one member, because nothing
      // yet reads "or A and B" — so they are wrapped rather than flattened, and
      // the 125 combination lines we know about can be added without a second
      // migration of this artifact.
      if (alts.length) {
        const groups = [...new Set(alts)].map((a) => [a]);
        const seen = new Set((alternates[id] ?? []).map((g) => g.join("+")));
        alternates[id] = [...(alternates[id] ?? []),
                          ...groups.filter((g) => !seen.has(g.join("+")))];
      }
    }
  }
  /* Ingredients the SOURCE omitted — the curator's additions (2026-08-20).
     Required by definition: nobody hand-adds a garnish the recipe forgot. */
  for (const aid of CURATIONS[ridForFix]?.added_ingredients ?? []) {
    const live = ID_REDIRECTS[aid] ?? aid;
    if (NODE_IDS.has(live)) { requires.add(live); addedIn++; }
    else addedStale++;
  }
  // A thing cannot be both. If any line requires it, it is required.
  for (const id of requires) optional.delete(id);
  const rid = recipeId(r.sourceUrl!);
  // The resolver's context (RESOLUTION-SPEC §3): curated answers outrank
  // machine ones, and the site tag is the cuisine of last resort.
  const cuisineOf = (CURATIONS[rid]?.cuisine ?? r.cuisine ?? "").toLowerCase();
  const dishOf = CURATIONS[rid]?.dish_type ?? CLASSIFY[rid]?.dish_type;
  const rowResolved: Record<string, string> = {};
  // The curator's per-line answers, which outrank the table (spec §5).
  const curatedRes = new Map((CURATIONS[rid]?.resolutions ?? []).map((x) => [x.raw, x.to]));
  // Deduplicated: recipes with sections repeat lines, and a curator should not
  // be shown the same ingredient five times (five duplicates in one of the
  // first four recipes curated).
  const seenRaw = new Set<string>();
  lines[rid] = (r.rawIngredients ?? []).filter((raw) => {
    const k = raw.trim().toLowerCase();
    if (seenRaw.has(k)) return false;
    seenRaw.add(k);
    return true;
  }).map((raw) => {
    const site = applySiteRules(r.sourceId, raw);
    // The curator still sees the ORIGINAL text — they are judging the recipe as
    // published, and showing them our rewrite would hide the thing they need to
    // check. Only the resolution runs on the rewrite.
    if (site.kind === "drop")
      return { raw, head: "", node: null, nodes: [], alts: [], optional: false,
               dropped: site.reason };
    const head = headName(site.raw, heads);
    const lineFix = LINE_FIXES.get(`${rid} ${raw}`);
    const out = resolveIngredient(site.raw, known, vocab, heads);
    let names = lineFix && idFor(lineFix) ? [lineFix]
      : out?.known ? out.node.split(" + ").map((p) => p.trim()) : [];
    let ids = names.map((p) => idFor(p)).filter((x): x is string => !!x);
    // Gloss narrowing, same rule as the requires loop — the curator sees the
    // species the shopper will be sent to buy. A line fix outranks it.
    if (!lineFix && ids.length === 1) {
      const nid = narrowByGloss(raw, ids[0]!, resolveTok, parentsOf);
      const nname = nid ? idName.get(nid) : undefined;
      if (nname) { names = [nname]; ids = [nid!]; }
    }
    // Overlay fallback, same condition as the requires loop above. Filling
    // `names` here (not just ids) lets the variant stamp below work unchanged.
    let viaLlm = false;
    if (ids.length === 0) {
      const fb = llmLines.get(lineKey(raw));
      if (fb?.names.length) {
        const got: string[] = [];
        for (const nm of fb.names) {
          const r2 = resolveIngredient(nm, known, vocab, heads);
          if (r2?.known) got.push(...r2.node.split(" + ").map((p) => p.trim()));
        }
        const gotIds = got.map((p) => idFor(p)).filter((x): x is string => !!x);
        if (gotIds.length) { names = got; ids = gotIds; viaLlm = true; }
      }
    }

    /**
     * RESOLUTION-SPEC §1 — stamp what the mention MEANS, where a table row
     * knows. Split lines are skipped: every table term is a single-node
     * mention, and stamping half of "salt + pepper" would be a lie about the
     * other half.
     */
    let resolvedId: string | undefined;
    let tier: ResolutionTier | undefined;
    const curated = curatedRes.get(raw);
    if (curated && ids.length === 1) {
      // A person named the variant on this exact line. The table is not
      // consulted; the answer is per-recipe by construction.
      resolvedId = curated;
      tier = "curated";
      if (curated !== ids[0]) rowResolved[ids[0]!] = curated;
      resolutionQc.push({ recipe: rid, title: r.title ?? "", cuisine: cuisineOf,
                          dish: dishOf ?? "", raw, node: names[0] ?? "", to: curated,
                          tier: "curated", flag: "" });
    } else if (names.length === 1) {
      const vr = resolveVariant(names[0]!, cuisineOf, dishOf);
      const leafId = vr ? idFor(vr.to) : undefined;
      if (vr && leafId) {
        resolvedId = leafId;
        tier = vr.tier;
        if (vr.tier === "cuisine-default" && leafId !== ids[0]) rowResolved[ids[0]!] = leafId;
        resolutionQc.push({ recipe: rid, title: r.title ?? "", cuisine: cuisineOf,
                            dish: dishOf ?? "", raw, node: names[0]!, to: vr.to,
                            tier: vr.tier, flag: vr.flag ?? "" });
      }
    }

    return {
      raw, head, node: ids[0] ?? null, nodes: ids,
      alts: [...new Set([...alternatives(site.raw, vocab, heads),
                         ...site.alternates.map((a) => headName(a, heads)).filter((h) => h.length > 2)])],
      optional: (new Map((CURATIONS[rid]?.tier_overrides ?? []).map((t) => [t.raw, t.optional]))).get(raw) ?? OPTIONAL_LINE.test(raw),
      ...(viaLlm ? { llm: true } : {}),
      ...(resolvedId && tier ? { resolved: resolvedId, resolution: tier } : {}),
    };
  });

  rows.push({
    id: rid,
    title: r.title ?? "", url: r.sourceUrl ?? "", source: r.sourceId ?? "",
    cuisine: r.cuisine ?? "unresolved",
    image: r.imageUrl
      ? CACHED_IMAGES[r.imageUrl] ?? (!DEAD_IMAGES.has(r.imageUrl) ? r.imageUrl : "")
      : "",
    yield: r.recipeYield ?? "",
    rating: typeof r.ratingValue === "number" ? r.ratingValue : null,
    // The source's own publish date, carried for ordering a creator's shelf —
    // their newest work first is the one sort that is theirs, not ours.
    ...(r.datePublished ? { datePublished: r.datePublished } : {}),
    requires: [...requires].sort(),
    optional: [...optional].sort(),
    alternates,
    unresolved: [...new Set(unresolved)].sort(),
    ...(Object.keys(rowResolved).length ? { resolved: rowResolved } : {}),
  });
}

const complete = rows.filter((r) => !r.unresolved.length && r.requires.length);
const nearly = rows.filter((r) => r.unresolved.length === 1);

writeFileSync(OUT, JSON.stringify({
  generated_from: "data/raw",
  counts: {
    recipes: rows.length,
    fully_resolved: complete.length,
    one_unknown: nearly.length,
    distinct_nodes_used: new Set(rows.flatMap((r) => r.requires)).size,
  },
  recipes: rows,
}, null, 1) + "\n");

writeFileSync(OUT_LINES, JSON.stringify(lines) + "\n");

// ── the resolution ledger ───────────────────────────────────────────────────
{
  const qcsv = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const sorted = [...resolutionQc].sort((a, b) =>
    (b.flag ? 1 : 0) - (a.flag ? 1 : 0) || a.node.localeCompare(b.node));
  writeFileSync(resolve(ROOT, "data/qc/resolution.csv"),
    ["recipe,title,cuisine,dish,node,to,tier,flag,raw",
     ...sorted.map((x) => [x.recipe, x.title, x.cuisine, x.dish, x.node, x.to,
                           x.tier, x.flag, x.raw].map(qcsv).join(",")),
    ].join("\n") + "\n");
  const explicit = resolutionQc.filter((x) => x.tier === "explicit").length;
  const defaulted = resolutionQc.filter((x) => x.tier === "cuisine-default").length;
  const flagged = resolutionQc.filter((x) => x.flag).length;
  console.log(`  resolution: ${defaulted} cuisine-default, ${explicit} explicit, ` +
              `${flagged} flagged → data/qc/resolution.csv`);
}

const pct = (n: number) => ((n / rows.length) * 100).toFixed(1) + "%";
console.log(`
wrote data/ontology/recipe-index.json

  recipes            ${String(rows.length).padStart(6)}   (${recipes.length - rows.length} duplicate URLs collapsed)
  fully resolved     ${String(complete.length).padStart(6)}   ${pct(complete.length)}  ← matchable with confidence
  exactly 1 unknown  ${String(nearly.length).padStart(6)}   ${pct(nearly.length)}  ← one alias each from being matchable
  distinct nodes     ${String(new Set(rows.flatMap((r) => r.requires)).size).padStart(6)}   of ${idOf.size} in the ontology
`);
if (noId)
  console.log(`  ${noId} ingredient(s) resolved to a node with no ontology id — candidates,
  counted as unresolved rather than emitted as ids nothing can look up.\n`);

// Site rules: what they removed and what they found. Printed every run, because a
// site rule is a liability that has to stay visible — a pattern that starts
// swallowing real ingredients shows up here as a number that jumped.
const dropTotal = Object.values(siteDrops).reduce((a, b) => a + b, 0);
if (dropTotal) {
  console.log(`  site rules dropped ${dropTotal} line(s): ` +
    Object.entries(siteDrops).map(([k, v]) => `${v} ${k}`).join(", "));
}
if (glossed) {
  console.log(`  gloss narrowing: ${glossed} line(s) resolved to the species the author named in parentheses`);
}
if (addedIn || addedStale) {
  console.log(`  curator additions: ${addedIn} omitted ingredient(s) folded into requires` +
    (addedStale ? `, ${addedStale} stale id(s) SKIPPED — worth a look` : ""));
}
if (llmLines.size) {
  console.log(`  llm overlay: ${llmLines.size} line(s) on file — resolved ${llmResolved}, ` +
    `named-but-unresolved ${llmNamed} (visible alias work, previously silence)`);
}
if (aliasProposals.length) {
  const byAlias = new Map<string, { alias: string; source: string; n: number; example: string }>();
  for (const p of aliasProposals) {
    const k = `${p.source}|${p.alias.toLowerCase()}`;
    const hit = byAlias.get(k);
    if (hit) hit.n++;
    else byAlias.set(k, { alias: p.alias, source: p.source, n: 1, example: p.surface });
  }
  const proposals = [...byAlias.values()].sort((a, b) => b.n - a.n);
  mkdirSync(resolve(ROOT, "data/reports"), { recursive: true });
  writeFileSync(
    resolve(ROOT, "data/reports", "site-aliases.json"),
    JSON.stringify({
      generated_from: "site rules over data/raw",
      note: "Alias CANDIDATES harvested from page glosses. Review before promoting (§7).",
      name_proposals: NAME_PROPOSALS,
      harvested: proposals,
    }, null, 1) + "\n",
  );
  console.log(`  harvested ${proposals.length} alias candidate(s) from page glosses` +
    ` → data/reports/site-aliases.json (review before promoting)`);
}
