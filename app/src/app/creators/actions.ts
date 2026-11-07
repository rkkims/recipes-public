"use server";

/**
 * The Creators tab's two verbs: find someone, and follow them —
 * CREATORS-TAB-SPEC §2, §4.
 */
import { revalidatePath } from "next/cache";
import { aliasesOf, allCreators, avatarOf, creatorByHandle, creatorById, recipesOf } from "@/lib/creators";
import { servable } from "@/lib/recipes";
import { currentUser } from "@/lib/owner";
import { getOwner, setFollowing } from "@/lib/store";
import type { ActionResult } from "@/lib/result";
import { OK } from "@/lib/result";

export type CreatorHit = {
  handle: string;
  name: string;
  avatar: string | null;
  /** The favicon fallback — drawn small, never stretched (see `iconOf`). */
  lowRes: boolean;
  /** Servable recipes only, the same honesty every shelf applies. */
  recipes: number;
  following: boolean;
};

function hitFor(handle: string, name: string, creatorId: string,
                followed: Set<string>): CreatorHit {
  const a = avatarOf(creatorId);
  return {
    handle, name,
    avatar: a?.url ?? null, lowRes: a?.lowRes ?? false,
    recipes: servable(recipesOf(creatorId)).length,
    following: followed.has(creatorId),
  };
}

async function followedIds(): Promise<Set<string>> {
  const user = await currentUser();
  const owner = user ? getOwner(user.owner_id) : null;
  return new Set((owner?.follows ?? []).map((f) => f.creator_id));
}

/**
 * Autosuggest — display name, handle, and human aliases, prefix hits first.
 * Two groups, never a duplicate: who you follow, then everyone else
 * (CREATORS-TAB-SPEC §2). The corpus is a dozen rows, so this is a scan; the
 * day it is thousands, an index goes behind this signature and no caller
 * moves.
 */
export async function searchCreators(q: string):
  Promise<{ following: CreatorHit[]; others: CreatorHit[] }> {
  const term = q.trim().toLowerCase();
  if (!term) return { following: [], others: [] };
  const followed = await followedIds();

  const names = (c: { id: string; handle: string; displayName: string }) =>
    [c.displayName, c.handle, ...aliasesOf(c.id)].map((n) => n.toLowerCase());
  const ranked = allCreators()
    .map((c) => {
      const ns = names(c);
      const rank = ns.some((n) => n.startsWith(term)) ? 0
        : ns.some((n) => n.includes(term)) ? 1 : -1;
      return { c, rank };
    })
    .filter((r) => r.rank >= 0)
    .sort((a, b) => a.rank - b.rank ||
                    a.c.displayName.localeCompare(b.c.displayName))
    .map(({ c }) => hitFor(c.handle, c.displayName, c.id, followed))
    /* No empty shop windows: a page with nothing servable is a public 404
       (a fresh §5a registration, an all-unreadable shelf), and a suggestion
       that opens onto a 404 teaches people the search lies. */
    .filter((h) => h.recipes > 0)
    .slice(0, 8);

  return {
    following: ranked.filter((h) => h.following),
    others: ranked.filter((h) => !h.following),
  };
}

/** The tab's no-context list: who you follow, newest follow first (§2). */
export async function followedCreators(): Promise<CreatorHit[]> {
  const user = await currentUser();
  const owner = user ? getOwner(user.owner_id) : null;
  const follows = [...(owner?.follows ?? [])]
    .sort((a, b) => b.followed_at.localeCompare(a.followed_at));
  const followed = new Set(follows.map((f) => f.creator_id));
  return follows
    .map((f) => {
      // Resolved fresh so a creator who withdrew disappears from the list the
      // same day they disappear from everywhere else.
      const c = creatorById(f.creator_id);
      return c ? hitFor(c.handle, c.displayName, c.id, followed) : null;
    })
    .filter((h): h is CreatorHit => h !== null);
}

/**
 * Follow / unfollow — account-only (CREATORS-TAB-SPEC §4). The button is
 * optimistic, so the intent arrives explicit rather than as a toggle that a
 * retried request could double-flip.
 */
export async function setFollow(handle: string, on: boolean): Promise<ActionResult> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "Sign in to follow creators." };
  const creator = creatorByHandle(handle);
  if (!creator || creator.status === "withdrawn" || creator.status === "removed")
    return { ok: false, error: "This creator is not listed." };
  try {
    setFollowing(user.owner_id, creator.id, on);
  } catch {
    return { ok: false, error: "Could not save. Try again." };
  }
  revalidatePath("/creators");
  revalidatePath(`/creators/${handle}`);
  return OK;
}
