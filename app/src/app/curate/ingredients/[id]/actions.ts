"use server";

import { revalidatePath } from "next/cache";
import { bustOntology, displayOf, nameOf, resolveId, search as searchIngredients } from "@/lib/data";
import { record, type Relation } from "@/lib/ontology-edits";
import { recordLineFix } from "@/lib/line-fixes";
import { editorDataFor, type EditorData } from "@/lib/editor-data";

/**
 * Every action RECORDS a decision; nothing is applied here. The tables change
 * in `npm run apply-edits`, offline, between builds — `ontology-edits.ts` has
 * the argument. Names go on the wire where the offline tables are the
 * destination, because those tables key on names; translating at this boundary
 * keeps the lib ignorant of app ids entirely.
 */

type Result = { ok: true } | { ok: false; error: string };

const attempt = (fn: () => void): Result => {
  try { fn(); } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "write failed" };
  }
  // The moment "recorded" becomes "visible": the memoised ontology is dropped,
  // so the next read — the editor refetching itself, the recipe page's next
  // autosuggest keystroke — sees the decision that was just made (QC-SPEC §3,
  // "an edit is a mutation the next render already sees").
  bustOntology();
  revalidatePath("/curate/ingredients", "layout");
  revalidatePath("/curate");
  return { ok: true };
};

/**
 * The editor's data, fetched on demand — how the RECIPE page opens an
 * ingredient in a sheet without navigating away from the batch (QC-SPEC §4:
 * "modal over the recipe, not separate pages").
 */
export async function openIngredient(idOrName: string): Promise<EditorData | null> {
  return editorDataFor(idOrName);
}

export async function renameNode(id: string, next: string, note: string): Promise<Result> {
  return attempt(() =>
    record({ kind: "rename", subject: nameOf(resolveId(id)), object: next, note }));
}

export async function removeNode(id: string, note: string): Promise<Result> {
  return attempt(() =>
    record({ kind: "remove", subject: nameOf(resolveId(id)), object: "", note }));
}

export async function glossSet(id: string, gloss: string, note: string): Promise<Result> {
  return attempt(() =>
    record({ kind: "gloss", subject: nameOf(resolveId(id)), object: gloss, note }));
}

export async function aliasSet(surface: string, targetId: string, note: string): Promise<Result> {
  return attempt(() =>
    record({ kind: "alias-set", subject: surface, object: nameOf(resolveId(targetId)), note }));
}

export async function aliasDrop(surface: string): Promise<Result> {
  return attempt(() =>
    record({ kind: "alias-drop", subject: surface, object: "", note: "" }));
}

export async function edgeAdd(
  childId: string, parentId: string, relation: Relation, note: string,
): Promise<Result> {
  return attempt(() => record({
    kind: `${relation}-add`,
    subject: nameOf(resolveId(childId)), object: nameOf(resolveId(parentId)), note,
  }));
}

export async function edgeRemove(
  childId: string, parentId: string, relation: Relation, note: string,
): Promise<Result> {
  return attempt(() => record({
    kind: `${relation}-remove`,
    subject: nameOf(resolveId(childId)), object: nameOf(resolveId(parentId)), note,
  }));
}

/**
 * Promote an alias to a node of its own — the danmuji case (2026-08-20): the
 * curator ruled "all danmuji is pickled radish, not all pickled radish is
 * danmuji", and the only way to say that was by hand. One action now: the
 * surface stops being an alias, becomes a node, and stands is_a under the
 * node it was an alias of. Recorded like everything else; minted for real by
 * apply-edits + build, visible immediately through the overlay.
 */
export async function promoteAlias(
  surface: string, fromNodeId: string, note: string,
): Promise<Result> {
  return attempt(() =>
    record({ kind: "promote", subject: surface, object: nameOf(resolveId(fromNodeId)), note }));
}

/** The inverse of promote: this node is a parse artifact or a second name —
    fold every reference into the real one. */
export async function mergeNode(id: string, targetId: string, note: string): Promise<Result> {
  return attempt(() =>
    record({ kind: "merge", subject: nameOf(resolveId(id)), object: nameOf(resolveId(targetId)), note }));
}

/**
 * A per-line parse correction, from the modal's provenance rows: in THAT
 * recipe, THIS verbatim line means the picked node (curated-tier resolution,
 * recordable before any curation row exists). Empty targetId retracts.
 */
export async function fixLine(recipeId: string, raw: string, targetId: string, note: string): Promise<Result> {
  return attempt(() =>
    recordLineFix(recipeId, raw, targetId ? nameOf(resolveId(targetId)) : "", note));
}

/** Same suggester the queue uses — one vocabulary, however you arrive at it. */
export async function suggest(q: string): Promise<{ id: string; name: string }[]> {
  // Picker rows are display-only (picking passes the id), so the glossed form
  // is safe here and tells the curator what a native name means.
  return searchIngredients(q, 8).map((h) => ({ id: h.id, name: displayOf(h.id) }));
}
