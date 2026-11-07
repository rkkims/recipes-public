/**
 * Wayback Machine as a fetch route for WAF-blocked sources.
 *
 * Why: justonecookbook.com returns 403 to every non-browser client regardless of
 * IP — datacenter *and* residential, with or without browser-like headers. It is
 * TLS-fingerprint / challenge-level blocking, so no proxy fixes it. But
 * archive.org holds snapshots of the same pages with their JSON-LD intact, and
 * archive.org does not block us.
 *
 * IMPORTANT — `sourceUrl` stays the ORIGINAL url, never the archive url. We link
 * out to the live page (DECISIONS §6); the archive is how we read the ingredient
 * facts, not what we point users at. Storing the snapshot URL would send users to
 * a stale copy and break the entire link-out posture.
 *
 * The `id_` modifier returns the original response bytes with no Wayback banner
 * or link rewriting injected, so the JSON-LD parses exactly as it would live.
 */
import { politeFetch } from "./http.js";

const CDX = "http://web.archive.org/cdx/search/cdx";

export type WaybackPage = { original: string; timestamp: string };

/**
 * Discover archived pages for a URL pattern, keeping the NEWEST snapshot per URL.
 *
 * Keeping the oldest is a trap worth documenting: a first attempt did that and
 * got 2010-era captures on port :80, which predate recipe-card markup entirely —
 * producing a confident "this site has no JSON-LD" that was simply wrong.
 */
export async function discoverWayback(opts: {
  pattern: string;
  /** Only snapshots from this year onward. Older captures predate JSON-LD. */
  from?: number;
  /** Keep only URLs matching this — CDX patterns are coarse. */
  urlFilter?: RegExp;
  limit?: number;
}): Promise<WaybackPage[]> {
  const { pattern, from = 2023, urlFilter, limit = 30000 } = opts;
  const url =
    `${CDX}?url=${encodeURIComponent(pattern)}&output=json` +
    `&filter=statuscode:200&filter=mimetype:text/html` +
    `&fl=original,timestamp&from=${from}&limit=${limit}`;

  const res = await politeFetch(url, { delayMs: 1000, timeoutMs: 90_000 });
  if (!res.ok) throw new Error(`CDX ${res.status} for ${pattern}`);

  let rows: string[][];
  try {
    rows = (JSON.parse(res.body) as string[][]).slice(1);
  } catch {
    throw new Error(`CDX returned non-JSON for ${pattern}`);
  }

  const newest = new Map<string, string>();
  for (const row of rows) {
    const raw = row[0];
    const ts = row[1];
    if (!raw || !ts) continue;
    // Strip query strings and trailing slashes: the same recipe is archived many
    // times with utm_* and ?adt_ei= variants, all of which are the same page.
    const clean = raw.split("?")[0]!.replace(/\/+$/, "");
    if (urlFilter && !urlFilter.test(clean)) continue;
    if (/\/comment-page-\d+$/.test(clean)) continue;
    const prev = newest.get(clean);
    if (!prev || ts > prev) newest.set(clean, ts);
  }
  return [...newest].map(([original, timestamp]) => ({ original, timestamp }));
}

/** Snapshot URL for the original bytes. `id_` suppresses Wayback's rewriting. */
export const snapshotUrl = (p: WaybackPage) =>
  `https://web.archive.org/web/${p.timestamp}id_/${p.original}/`;
