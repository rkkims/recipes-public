"use server";

import { revalidatePath } from "next/cache";
import { channelsOf, creatorByHandle } from "@/lib/creators";
import { claimOf, findChannelProof, recordClaim, setWithdrawn, tokenFor, updateClaim, type Proof } from "@/lib/claims";
import { currentUser } from "@/lib/owner";

/**
 * Run the proof. The server does the fetching and the DNS lookup — the
 * browser could not check DNS if it wanted to — and the token is re-derived
 * server-side rather than trusted from the client: the client names the
 * creator, and everything else is ours.
 */
export async function verifyClaim(handle: string, kind: string):
  Promise<{ ok: true; proof: Proof } | { ok: false; error: string }> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "signed out; sign in and retry" };
  const creator = creatorByHandle(handle);
  if (!creator) return { ok: false, error: "unknown creator" };
  /* SS6a: the proved channel wins, and proof can be re-run. A claim by
     someone else does not block the check - passing it TAKES the page,
     because whoever controls the channel today is who it belongs to, and
     seniority would mean preferring our record over the evidence. Only a
     re-run by the standing claimant is a no-op, so a nervous re-check can
     never wipe their own settings. */
  const standing = claimOf(creator.id);
  if (standing?.user_id === user.id)
    return { ok: false, error: "already yours - nothing to prove again" };
  const channel = channelsOf(creator.id).find((c) => c.kind === kind);
  if (!channel) return { ok: false, error: `no ${kind} channel on this page` };

  const token = tokenFor(creator.id, user.id);
  const proof = await findChannelProof(channel, token);
  if (!proof) {
    return {
      ok: false,
      error: kind === "domain"
        ? "not found yet. Checked the homepage meta tag, /jipbap-claim.txt, " +
          "and the _jipbap-claim DNS record. DNS can take a while to propagate."
        : "not found yet. The token has to appear in your channel's description. " +
          "Edits can take a few minutes to show.",
    };
  }
  recordClaim(creator.id, user.id, channel);
  revalidatePath(`/creators/${handle}`, "layout");
  return { ok: true, proof };
}

/** The platform each icon promises — a link behind the YouTube mark must be
    a YouTube link, or the icon is dressing up an arbitrary URL. */
const LINK_HOSTS: Record<string, string[]> = {
  youtube: ["youtube.com", "youtu.be"],
  instagram: ["instagram.com"],
  tiktok: ["tiktok.com"],
};

function badLink(kind: string, url: string): string | null {
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return `the ${kind} link must start with https://`;
    host = u.hostname.toLowerCase();
  } catch {
    return `the ${kind} link is not a URL`;
  }
  const ok = (LINK_HOSTS[kind] ?? []).some((h) => host === h || host.endsWith("." + h));
  return ok ? null : `the ${kind} link has to live on ${LINK_HOSTS[kind]?.[0]}`;
}

export async function saveSettings(
  handle: string, patch: {
    display_name?: string; affiliate_tag?: string;
    bio?: string; avatar_url?: string;
    channels?: Array<{ kind: string; url: string }>;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "signed out" };
  const creator = creatorByHandle(handle);
  if (!creator) return { ok: false, error: "unknown creator" };
  if (patch.avatar_url?.trim() && !/^https:\/\/\S+\.\S/.test(patch.avatar_url.trim()))
    return { ok: false, error: "the avatar link must start with https://" };
  const channels = (patch.channels ?? [])
    .map((c) => ({ kind: c.kind, url: c.url.trim() }))
    .filter((c) => c.url);
  for (const c of channels) {
    const bad = badLink(c.kind, c.url);
    if (bad) return { ok: false, error: bad };
  }
  if (!updateClaim(creator.id, user.id,
                   { ...patch, ...(patch.channels !== undefined ? { channels } : {}) }))
    return { ok: false, error: "only the claimant can edit this page" };
  revalidatePath(`/creators/${handle}`, "layout");
  return { ok: true };
}

/**
 * CREATOR-SPEC §6, both directions. No review, no argument, no retention
 * flow — the cost of honouring a withdrawal is a handful of recipes out of
 * thousands, and the cost of contesting one is the entire partner posture.
 */
export async function withdrawPage(handle: string, on: boolean):
  Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "signed out" };
  const creator = creatorByHandle(handle);
  if (!creator) return { ok: false, error: "unknown creator" };
  if (!setWithdrawn(creator.id, user.id, on))
    return { ok: false, error: "only the claimant can do this" };
  revalidatePath(`/creators/${handle}`, "layout");
  revalidatePath("/");
  return { ok: true };
}
