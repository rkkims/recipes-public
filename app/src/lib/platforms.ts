/**
 * One pasted profile link → which platform, and who on it —
 * CREATORS-TAB-SPEC §5.
 *
 * A pure function in its own module because BOTH ends need the same reading:
 * the onboarding form parses as the creator pastes (so the row they see is
 * the row that will be stored), and the register action parses again on the
 * server (because the client's parse is a courtesy, not an authority). Two
 * implementations would drift; this one cannot.
 *
 * Post/video URLs are refused on purpose — a profile is a standing address,
 * a post is one day's content — and the Instagram path segments that mean
 * "post" are the ones excluded.
 */
export type PlatformLink = { kind: "youtube" | "instagram" | "tiktok"; handle: string };

const NOT_PROFILES = new Set(["p", "reel", "reels", "stories", "explore", "tv"]);

export function parsePlatformLink(raw: string): PlatformLink | null {
  const t = raw.trim();
  if (!t) return null;
  const host = t.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "")
    .split("/")[0] ?? "";

  if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") {
    const m = t.match(/@([A-Za-z0-9._-]{2,60})/);
    return m ? { kind: "youtube", handle: "@" + m[1] } : null;
  }
  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    const m = t.match(/instagram\.com\/([A-Za-z0-9._]{2,40})/i);
    return m && !NOT_PROFILES.has(m[1]!.toLowerCase())
      ? { kind: "instagram", handle: m[1]! } : null;
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    const m = t.match(/@([A-Za-z0-9._]{2,40})/);
    return m ? { kind: "tiktok", handle: "@" + m[1] } : null;
  }
  return null;
}

/** For the row the form shows — "YouTube · @auntmi", never a raw URL back. */
export function platformLabel(kind: PlatformLink["kind"]): string {
  return kind === "youtube" ? "YouTube"
    : kind === "instagram" ? "Instagram" : "TikTok";
}
