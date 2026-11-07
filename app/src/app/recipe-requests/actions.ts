"use server";

import { revalidatePath } from "next/cache";
import { fetchMeta } from "@/lib/oembed";
import { load } from "@/lib/data";
import { servable } from "@/lib/recipes";
import { creatorByDomain } from "@/lib/creators";
import { normalizeUrl, recordRequest, COUNT_MIN } from "@/lib/requests";
import { ownerId, setOwnerCookie } from "@/lib/owner";

/**
 * "I want to cook this" — the board's submit, UX-SPEC §11.
 *
 * The answer depends on what we already know about the URL, and each branch
 * says exactly what is true: we have it (open it), we hold it but the
 * vocabulary is not there yet (honest queue), its creator has withdrawn
 * (§6 rule 3: say so and stop collecting), its creator was removed (§6a's
 * different sentence), or it is new demand (recorded, never promised a
 * parser).
 */
export async function requestRecipe(rawUrl: string): Promise<
  | { ok: true; kind: "have"; recipeId: string }
  | { ok: true; kind: "held" }
  | { ok: true; kind: "saved"; count: number | null }
  | { ok: false; error: string }
> {
  const url = normalizeUrl(rawUrl);
  if (!url) return { ok: false, error: "that is not a link we can read" };

  const id = await ownerId();
  await setOwnerCookie(id);

  // Already in the corpus? Then the honest answer is the recipe, not a queue.
  // Dedupe against the WHOLE corpus: a request for an ungated recipe is
  // still already-present, just not released yet.
  const hit = load().allRecipes.find((r) => normalizeUrl(r.url) === url);
  if (hit) {
    if (servable([hit]).length) return { ok: true, kind: "have", recipeId: hit.id };
    // Held for an unread ingredient line — the request still counts, because
    // demand is exactly what ranks the curation backlog.
    recordRequest(url, id);
    return { ok: true, kind: "held" };
  }

  // §6 rule 3 / §6a: a withdrawn or removed creator's queue stops collecting,
  // and the two sentences are different on purpose.
  const creator = creatorByDomain(new URL(url).hostname.replace(/^www\./, ""));
  if (creator?.status === "withdrawn")
    return { ok: false, error: "unavailable at the creator's request" };
  if (creator?.status === "removed")
    return { ok: false, error: "no longer listed here" };

  let meta: { title?: string; image?: string } = {};
  try {
    const m = await fetchMeta(url);
    meta = { ...(m.title ? { title: m.title } : {}), ...(m.image ? { image: m.image } : {}) };
  } catch { /* a title is nice, not required */ }

  const res = recordRequest(url, id, meta);
  if (!res.ok) return res;
  revalidatePath("/recipe-requests", "page");
  return { ok: true, kind: "saved", count: res.count >= COUNT_MIN ? res.count : null };
}
