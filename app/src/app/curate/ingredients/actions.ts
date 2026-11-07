"use server";

import { revalidatePath } from "next/cache";
import { decide, logParseError, type Verdict } from "@/lib/unknowns";
import { idForName, nameOf, search as searchIngredients } from "@/lib/data";

/**
 * Record one call on an unknown surface.
 *
 * `value` is a node NAME rather than an id, deliberately. The consumer is
 * `npm run learn`, which writes `data/ontology/aliases.csv` where the target
 * column holds a node name — and `src/qc/learn.ts` already resolves names, not
 * ids. Storing an id here would mean the decision file spoke a different
 * language from every other decision file beside it.
 *
 * A name that happens to resolve is normalised to the canonical spelling so the
 * file does not accumulate three ways of writing the same target.
 */
export async function recordUnknown(
  surface: string,
  verdict: Verdict,
  value: string,
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = surface.trim();
  if (!s) return { ok: false, error: "no surface" };

  let v = value.trim();
  if (verdict === "alias") {
    if (!v) return { ok: false, error: "an alias needs a target" };
    const id = idForName(v);
    if (id) v = nameOf(id);          // canonical spelling, not the typed one
  }
  if (verdict === "new" && !v) v = s; // "this is real and unnamed" — the surface is the proposal

  try {
    decide({ id: s, verdict, value: verdict === "reject" || verdict === "skip" ? "" : v, note: note.trim() });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "write failed" };
  }
  revalidatePath("/curate/ingredients");
  return { ok: true };
}

/** "The parser mangled this line" — logged, not decided. See `logParseError`. */
export async function flagParse(surface: string, example: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try { logParseError(surface.trim(), example.trim()); } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "write failed" };
  }
  return { ok: true };
}

/** Autosuggest over the ontology, same source the pantry and curation use. */
export async function suggestNodes(q: string): Promise<{ id: string; name: string }[]> {
  return searchIngredients(q, 8).map((h) => ({ id: h.id, name: h.name }));
}
