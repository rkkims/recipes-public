/**
 * Getting a saved collection out of TikTok and into "My recipes".
 *
 * There is no API for this. TikTok's Display API exposes a user's OWN videos
 * behind OAuth and says nothing about what they have favourited, so a saved
 * collection cannot be read by us on the user's behalf at all. Anything that
 * looked like it could would mean driving their logged-in session, which is
 * both against the terms and not a thing to build.
 *
 * So the data has to come FROM the user, and there are two shapes it arrives in:
 *
 *   - **Pasted links.** Copy-and-paste, one per line. Trivial, immediate, and
 *     enough for the thirty-odd saves most people have.
 *   - **The official data export.** Settings → Account → Download your data.
 *     The only complete route, at the cost of a request that takes hours to
 *     days to be prepared.
 *
 * ── Why the export parser is deliberately paranoid ─────────────────────────
 *
 * The archive's shape is not a contract. TikTok has changed it more than once,
 * it differs between the JSON and TXT downloads, and key names have varied
 * ("Favorite Videos", "Like List", "Video Browsing History"). A parser written
 * against one snapshot would silently return nothing the first time it changed
 * — and "we found 0 videos" reads to a user as "my export is broken" rather
 * than "their reader is stale".
 *
 * So it tries the known shapes first, for the good reason that they tell us
 * WHICH list something came from, and then falls back to walking the whole
 * structure for anything that looks like a TikTok video URL. The fallback is
 * what makes it survive a rename. What it must never do is claim a section it
 * did not actually find — see `ImportFound.where`.
 */

/** One candidate on its way in. */
export type Candidate = {
  url: string;
  /** Which part of the export it came from, or "pasted". Shown, never guessed. */
  from: string;
};

export type ImportFound = {
  candidates: Candidate[];
  /** Human-readable account of where these came from, for the review screen. */
  where: string[];
  /** Set when we understood the file but it held no links. */
  emptyButValid?: boolean;
};

/**
 * A TikTok video URL, in any of the forms an export or a share sheet produces.
 *
 * `/video/<id>` is the canonical one. `vm.` and `vt.` are the short share
 * domains, which we keep as-is: resolving them would mean a request per link
 * before the user has agreed to anything, and oEmbed follows them anyway.
 *
 * `tiktokv.com` is not a typo. The data export writes favourites as
 * `tiktokv.com/share/video/<id>/` rather than `tiktok.com`, so a reader that
 * only knows the public domain silently drops the very rows the user came for.
 */
const TIKTOK =
  /https?:\/\/(?:www\.|m\.|vm\.|vt\.)?(?:tiktok\.com|tiktokv\.com)\/[^\s"'<>)\]]+/gi;

/** Any http(s) URL — for the paste box, which is not TikTok-only. */
const ANY_URL = /https?:\/\/[^\s"'<>)\]]+/gi;

/** Trailing punctuation a URL picks up from prose or a JSON dump. */
const trim = (u: string) => u.replace(/[.,;:!?)\]}'"]+$/, "");

/**
 * Same video, one row.
 *
 * TikTok exports carry tracking parameters and the same clip can appear in both
 * Favourites and Likes. Compared on origin + path with the query dropped: the
 * query is never what identifies the video, and keeping it would import three
 * copies of one dinner.
 */
function keyOf(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.hostname.replace(/^www\./i, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

function dedupe(rows: Candidate[], cap: number): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const r of rows) {
    const k = keyOf(r.url);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
    if (out.length >= cap) break;
  }
  return out;
}

/**
 * Links out of a pasted block — one per line, or prose with links in it.
 *
 * Not TikTok-only: someone pasting a mix of TikTok, YouTube and a blog post is
 * doing exactly what "anywhere you cook from" invites, and rejecting the blog
 * would be us enforcing a distinction the product does not make.
 */
export function linksFromText(text: string, cap = 200): ImportFound {
  const hits = [...(text.match(ANY_URL) ?? [])].map(trim).filter(Boolean);
  const candidates = dedupe(hits.map((url) => ({ url, from: "pasted" })), cap);
  return {
    candidates,
    where: candidates.length ? [`${candidates.length} links pasted`] : [],
    ...(hits.length === 0 ? { emptyButValid: true } : {}),
  };
}

/**
 * The sections a TikTok export has been seen to use, best first.
 *
 * Order matters only for labelling — everything found is imported either way.
 * Favourites is what people mean by "my saved recipes"; Likes is a weaker
 * signal and browsing history weaker still, so each is labelled and the user
 * decides.
 */
const KNOWN: Array<{ label: string; path: RegExp }> = [
  { label: "Favourites", path: /favou?rite/i },
  { label: "Likes", path: /like/i },
  { label: "Browsing history", path: /(browsing|watch).*history|history/i },
  { label: "Shared", path: /share/i },
];

/**
 * Walk anything, collecting TikTok links and remembering the nearest labelled
 * ancestor.
 *
 * Depth-limited: an export is a few levels deep, and an unbounded walk over an
 * attacker-supplied JSON is a stack overflow with extra steps.
 */
function walk(
  node: unknown, label: string, out: Candidate[], depth = 0, seen = new Set<object>(),
): void {
  if (depth > 12 || out.length > 5000) return;

  if (typeof node === "string") {
    for (const m of node.match(TIKTOK) ?? []) out.push({ url: trim(m), from: label });
    return;
  }
  if (!node || typeof node !== "object") return;
  // Cycles are not expected in parsed JSON, but this also walks whatever a
  // future caller hands it.
  if (seen.has(node)) return;
  seen.add(node);

  if (Array.isArray(node)) {
    for (const v of node) walk(v, label, out, depth + 1, seen);
    return;
  }

  for (const [k, v] of Object.entries(node)) {
    /**
     * The OUTERMOST labelled ancestor wins.
     *
     * TikTok's Like List contains a key called `ItemFavoriteList`, so relabel-
     * as-you-descend marked every liked video as a favourite — a section label
     * that was not merely imprecise but wrong, on the one field whose whole job
     * is telling the user where a row came from. Once a section is known, going
     * deeper cannot rename it.
     */
    const named = label === "export" ? KNOWN.find((s) => s.path.test(k)) : undefined;
    walk(v, named ? named.label : label, out, depth + 1, seen);
  }
}

/**
 * Candidates out of a TikTok data export — JSON or the plain-text variant.
 *
 * Returns `emptyButValid` when the file parsed and simply held no TikTok links,
 * because that is a different message from "we could not read this": the first
 * means the export has nothing saved in it, the second means our reader is
 * wrong, and telling a user the wrong one sends them to fix the wrong thing.
 */
export function linksFromExport(text: string, cap = 500): ImportFound {
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { /* the TXT export, or a truncated file */ }

  const found: Candidate[] = [];
  if (parsed && typeof parsed === "object") {
    walk(parsed, "export", found);
  } else {
    // The TXT export is sectioned by headings; the nearest heading above a link
    // is the best label available, so it is tracked as we go.
    let label = "export";
    for (const line of text.split(/\r?\n/)) {
      const named = KNOWN.find((s) => s.path.test(line));
      // A heading is a short line naming a section, not a line that merely
      // mentions one — "Date: ... Link: ..." must not relabel everything after it.
      if (named && line.trim().length < 60 && !TIKTOK.test(line)) label = named.label;
      for (const m of line.match(TIKTOK) ?? []) found.push({ url: trim(m), from: label });
    }
  }

  const candidates = dedupe(found, cap);
  const where = [...new Set(candidates.map((c) => c.from))]
    .map((f) => `${candidates.filter((c) => c.from === f).length} from ${f}`);

  return {
    candidates,
    where,
    ...(candidates.length === 0 ? { emptyButValid: parsed !== null } : {}),
  };
}
