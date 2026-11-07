"use server";

import { creatorByDomain, creatorByHandle } from "@/lib/creators";
import { addSelfCreator, type SelfCreator } from "@/lib/self-creators";
import { currentUser } from "@/lib/owner";
import { parsePlatformLink } from "@/lib/platforms";

/**
 * Mint a §5a row. Nothing here grants visibility — the page a registration
 * creates is exactly as invisible as an unclaimed crawled page, and goes
 * live the same way: by proving the channel. Which is why this action can
 * afford to be this permissive.
 */
export async function registerCreator(input: {
  display_name: string;
  kind: "domain" | "youtube";
  where: string;
  /**
   * Their other platforms, as the RAW pasted links — CREATORS-TAB-SPEC §5.
   * Re-parsed here even though the form already parsed them, because the
   * client's parse is a preview and this one is the record.
   */
  platforms?: string[];
}): Promise<{ ok: true; handle: string } | { ok: false; error: string; claimHandle?: string }> {
  const user = await currentUser();
  if (!user) return { ok: false, error: "signed out; sign in and retry" };

  const name = input.display_name.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!name) return { ok: false, error: "a page needs a name" };

  let channel: { kind: "domain" | "youtube"; handle: string };
  if (input.kind === "domain") {
    // Accept a pasted URL or a bare domain; keep only the host.
    const host = input.where.trim().toLowerCase()
      .replace(/^https?:\/\//, "").split("/")[0] ?? "";
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(host))
      return { ok: false, error: "that does not look like a domain" };
    const existing = creatorByDomain(host);
    if (existing)
      return {
        ok: false,
        error: "that site is already here; claim its page instead",
        claimHandle: existing.handle,
      };
    channel = { kind: "domain", handle: host.replace(/^www\./, "") };
  } else {
    // @handle, or a channel URL with the @handle in it.
    const m = input.where.trim().match(/@([A-Za-z0-9._-]{3,60})/);
    if (!m) return { ok: false, error: "paste your channel's @handle or its URL" };
    channel = { kind: "youtube", handle: "@" + m[1] };
  }

  // The handle: their name as a slug, the domain's first label as fallback,
  // suffixed only on a real collision with any creator, crawled or not.
  const base = (name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
    || channel.handle.replace(/^@/, "").split(".")[0]
    || "creator").slice(0, 40);
  let handle = base;
  for (let n = 2; creatorByHandle(handle); n++) handle = `${base}-${n}`;

  /* One per platform, primary kind excluded — `linksOf` keeps one href per
     kind, so a second row of the same kind would be stored and never shown,
     which is the worst combination. */
  const extras: NonNullable<SelfCreator["extras"]> = [];
  for (const raw of input.platforms ?? []) {
    const p = parsePlatformLink(raw);
    if (!p) return { ok: false, error: `not a profile link we recognise: ${raw.slice(0, 60)}` };
    if (p.kind === input.kind) continue;
    if (!extras.some((e) => e.kind === p.kind)) extras.push(p);
  }

  const res = addSelfCreator({ handle, display_name: name, channel,
    ...(extras.length ? { extras } : {}) });
  if (!res.ok) return res;
  return { ok: true, handle };
}
