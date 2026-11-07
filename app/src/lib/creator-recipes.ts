/**
 * Recipes a claimed creator added themselves — the runtime half of the corpus.
 *
 * The claim pitch's promise, made true before it was made: a creator pastes a
 * link, annotates the ingredients (required or optional) through the same
 * vocabulary the pantry uses, and the recipe is live on their page and in
 * search on save. No queue, no parser, no unresolved lines — the annotation
 * is resolved ids by construction, which is exactly why a creator-added
 * recipe is servable the moment it exists while 1,439 crawled ones still
 * wait.
 *
 * Storage follows the claims/collections split: crawl facts live in CSVs the
 * pipeline owns, runtime state lives in JSON the app owns. Read fresh on
 * every call — the corpus cache lives for the process, but this file changes
 * under a running server whenever a creator saves.
 *
 * What is NEVER here, one more time: the method. CONTRIBUTION-SPEC §3's rule
 * holds for creators exactly as it holds for users — we store a reading of
 * the ingredient list, and the cook goes to the creator's own page to cook.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import type { Recipe } from "./match";

const FILE = resolve(process.cwd(), "..", "data", "creators", "recipes.json");

export type CreatorRecipe = {
  id: string;                 // rec_c… — distinct namespace from the corpus
  creator_id: string;
  title: string;
  url: string;
  source: string;             // the creator's handle; renders under the card
  image?: string;
  requires: string[];         // resolved ingredient ids, annotated by them
  optional: string[];
  /**
   * CREATOR-SPEC SS5b's quarantined misses: lines the vocabulary did not
   * have, kept as the creator typed them. Never minted into the ontology -
   * captured, published on their page, and holding the recipe out of
   * matching until curation adds the entry. The misses are the prize: each
   * one is a real creator naming what the vocabulary lacks.
   */
  unresolved?: string[];
  /**
   * Their OWN recipes this one uses as an ingredient — the "my anchovy
   * stock (recipe here)" convention, as data. Same-creator only, enforced at
   * the action: linking someone else's recipe as your component is a claim
   * about their work nobody asked them about. See `Recipe.components`.
   */
  components?: string[];
  added_at: string;
};

function read(): CreatorRecipe[] {
  if (!existsSync(FILE)) return [];
  try { return JSON.parse(readFileSync(FILE, "utf8")) as CreatorRecipe[]; }
  catch { return []; }        // a corrupt file must not take the pages down
}

function write(rows: CreatorRecipe[]): void {
  mkdirSync(dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(rows, null, 1) + "\n", "utf8");
  renameSync(tmp, FILE);
}

/** As the app's Recipe shape — unresolved empty by construction, the added
    date standing in for datePublished so the shelf's newest-first just works. */
export function asRecipe(r: CreatorRecipe): Recipe {
  return {
    id: r.id, title: r.title, url: r.url, source: r.source,
    cuisine: "unresolved",            // no guess; the tag hides itself
    ...(r.image ? { image: r.image } : {}),
    requires: r.requires,
    ...(r.optional.length ? { optional: r.optional } : {}),
    datePublished: r.added_at,
    ...(r.components?.length ? { components: r.components } : {}),
    // SS5b: a quarantined miss reads exactly like a crawled unread line, so
    // servable() holds the recipe out of matching with zero new machinery.
    unresolved: r.unresolved ?? [],
  };
}

export function creatorRecipesOf(creatorId: string): CreatorRecipe[] {
  return read().filter((r) => r.creator_id === creatorId);
}

export function creatorRecipeById(id: string): CreatorRecipe | undefined {
  return read().find((r) => r.id === id);
}

export function allCreatorRecipes(): CreatorRecipe[] {
  return read();
}

export function addCreatorRecipe(
  r: Omit<CreatorRecipe, "id" | "added_at">,
): { ok: true; id: string } | { ok: false; error: string } {
  if (!r.title.trim()) return { ok: false, error: "a recipe needs a title" };
  if (!/^https?:\/\/\S+\.\S/.test(r.url)) return { ok: false, error: "a recipe needs its link" };
  if (r.requires.length === 0) return { ok: false, error: "mark at least one required ingredient" };
  const rows = read();
  // One row per URL per creator — pasting twice edits, it does not duplicate.
  const id = rows.find((x) => x.creator_id === r.creator_id && x.url === r.url)?.id
    ?? "rec_c" + randomBytes(6).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
  const next: CreatorRecipe = { ...r, id, added_at: new Date().toISOString() };
  const i = rows.findIndex((x) => x.id === id);
  if (i >= 0) rows[i] = { ...next, added_at: rows[i]!.added_at };
  else rows.push(next);
  write(rows);
  return { ok: true, id };
}

export function removeCreatorRecipe(creatorId: string, id: string): boolean {
  const rows = read();
  const kept = rows.filter((r) => !(r.id === id && r.creator_id === creatorId));
  if (kept.length === rows.length) return false;
  write(kept);
  return true;
}
