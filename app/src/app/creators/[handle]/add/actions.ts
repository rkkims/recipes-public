"use server";

import { revalidatePath } from "next/cache";
import { creatorByHandle, recipesOf } from "@/lib/creators";
import { claimOf } from "@/lib/claims";
import { addCreatorRecipe, removeCreatorRecipe } from "@/lib/creator-recipes";
import { selfById } from "@/lib/self-creators";
import { currentUser } from "@/lib/owner";
import { fetchMeta } from "@/lib/oembed";
import { search as searchIngredients } from "@/lib/data";

/** The claimant, or nothing — every write here runs through this gate. */
async function claimant(handle: string) {
  const user = await currentUser();
  if (!user) return null;
  const creator = creatorByHandle(handle);
  if (!creator) return null;
  const claim = claimOf(creator.id);
  if (!claim || claim.user_id !== user.id) return null;
  return { user, creator };
}

/** oEmbed lookup — the same confirmation-not-extraction the paste flow uses. */
export async function lookupCreatorLink(handle: string, url: string):
  Promise<{ ok: true; meta: { url: string; source: string; title?: string; image?: string } }
    | { ok: false; error: string }> {
  if (!(await claimant(handle))) return { ok: false, error: "not your page" };
  try {
    const m = await fetchMeta(url);
    return { ok: true, meta: {
      url: m.url, source: m.source,
      ...(m.title ? { title: m.title } : {}),
      ...(m.image ? { image: m.image } : {}),
    } };
  } catch {
    return { ok: false, error: "could not read that link, but the recipe can still be added" };
  }
}

/** The vocabulary, same as everywhere an ingredient is named. */
export async function suggestIngredients(q: string): Promise<Array<{ id: string; name: string }>> {
  return searchIngredients(q, 8).map((h) => ({ id: h.id, name: h.name }));
}

/**
 * Their own shelf, for the component picker — the "my anchovy stock (recipe
 * here)" line as data. Claimant-gated like every write-adjacent read on this
 * page, and scoped to their recipes because a component is a claim about a
 * recipe, and only theirs are theirs to claim.
 */
export async function suggestOwnRecipes(handle: string, q: string):
  Promise<Array<{ id: string; title: string }>> {
  const gate = await claimant(handle);
  const term = q.trim().toLowerCase();
  if (!gate || term.length < 2) return [];
  const all = recipesOf(gate.creator.id);
  const starts = all.filter((r) => r.title.toLowerCase().startsWith(term));
  const contains = all.filter((r) =>
    !r.title.toLowerCase().startsWith(term) && r.title.toLowerCase().includes(term));
  return [...starts, ...contains].slice(0, 6).map((r) => ({ id: r.id, title: r.title }));
}

/**
 * SS5a's one entry criterion, enforced where it bites: no recipe without a
 * live source_url on the channel the creator proved. A HEAD request, not a
 * parse (SS5b). Applied to self-registered creators only - the open door is
 * what this gate guards; a crawled creator's catalogue is already the
 * evidence their row rests on.
 */
async function offChannel(
  url: string, ch: { kind: string; handle: string },
): Promise<string | null> {
  let host: string;
  try { host = new URL(url).hostname.toLowerCase(); }
  catch { return "that is not a link"; }
  const home = ch.handle.toLowerCase().replace(/^www\./, "").replace(/^@/, "");
  const onIt = ch.kind === "domain"
    ? host.replace(/^www\./, "") === home || host.endsWith("." + home)
    : ["youtube.com", "www.youtube.com", "youtu.be", "m.youtube.com"].includes(host);
  if (!onIt)
    return `the link has to live on ${ch.kind === "domain" ? ch.handle : "your YouTube channel"}, the channel you proved`;
  try {
    let resp = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (resp.status === 405 || resp.status === 501)
      resp = await fetch(url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return `that link answered ${resp.status} - the recipe needs a live page`;
  } catch {
    return "could not reach that link - the recipe needs a live page";
  }
  return null;
}

export async function saveCreatorRecipe(
  handle: string,
  r: { title: string; url: string; image?: string; requires: string[]; optional: string[];
       unresolved?: string[]; components?: string[] },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const gate = await claimant(handle);
  if (!gate) return { ok: false, error: "not your page" };
  if (selfById(gate.creator.id)) {
    const claim = claimOf(gate.creator.id);
    const bad = claim && await offChannel(r.url, claim.verified_channel);
    if (bad) return { ok: false, error: bad };
  }
  /* Components: same-creator only, re-checked here because the picker is a
     client courtesy, not an authority. The same-URL row is excluded so an
     edit cannot link a recipe to itself, and the cap matches the picker's. */
  const shelf = new Map(recipesOf(gate.creator.id).map((x) => [x.id, x.url]));
  const components = (r.components ?? [])
    .filter((id, i, a) => a.indexOf(id) === i)
    .filter((id) => shelf.has(id) && shelf.get(id) !== r.url)
    .slice(0, 5);
  // SS5b: misses ride along as free text, capped and trimmed - captured, never
  // minted. Their presence holds the recipe out of matching by construction.
  const unresolved = (r.unresolved ?? [])
    .map((x) => x.replace(/\s+/g, " ").trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 20);
  const res = addCreatorRecipe({
    creator_id: gate.creator.id,
    title: r.title, url: r.url,
    ...(r.image ? { image: r.image } : {}),
    requires: r.requires, optional: r.optional,
    ...(unresolved.length ? { unresolved } : {}),
    ...(components.length ? { components } : {}),
    source: gate.creator.handle,
  });
  if (res.ok) revalidatePath(`/creators/${handle}`, "layout");
  return res;
}

export async function deleteCreatorRecipe(handle: string, id: string):
  Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await claimant(handle);
  if (!gate) return { ok: false, error: "not your page" };
  if (!removeCreatorRecipe(gate.creator.id, id)) return { ok: false, error: "not found" };
  revalidatePath(`/creators/${handle}`, "layout");
  return { ok: true };
}
