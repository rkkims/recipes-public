/**
 * The demand board's ledger — UX-SPEC §11, DECISIONS §8.
 *
 * A request is a COUNT, not a thread: one row per URL, distinct owners
 * tallied, no comments anywhere. The signal is "I want to cook this" — it
 * arrives from the board's own submit and from the paste flow, because a
 * person who just saved their own copy of an off-corpus recipe has said
 * exactly that, in the strongest form the product has.
 *
 * ── The public/private split (spam, not modesty) ──────────────────────────
 *
 * A row is PUBLIC when at least two distinct people asked and the URL lives
 * on a host we recognise — a crawled source's domain or a creator's proved
 * one. Single-user requests and unknown domains stay in the private tally,
 * or the board becomes a spam surface pointed at our own SEO. Both numbers
 * are provisional (DECISIONS §11 keeps the threshold open) and live here as
 * two named constants rather than scattered magic.
 *
 * ── §6 rule 3 and §6a, the copy switch this file exists to serve ──────────
 *
 * A withdrawn creator's outstanding demand is real user intent we can no
 * longer satisfy. The board says "unavailable at the creator's request" and
 * STOPS COLLECTING — silently dropping the rows would make the page read as
 * a list of things we failed to do. A removed creator's rows say "no longer
 * listed here" instead, because the withdrawn sentence would be a lie about
 * someone we ejected. Same behaviour, different sentence, which is the whole
 * reason `removed` is a separate status.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const FILE = resolve(process.cwd(), "..", "data", "app", "requests.json");

/** Distinct askers before a row shows publicly. Provisional — DECISIONS §11. */
export const PUBLIC_MIN = 2;
/** Below this, the count itself stays hidden: "saved by 1" is worse than no
    number (UX-SPEC §11). */
export const COUNT_MIN = 2;

export type RecipeRequest = {
  url: string;                 // normalized; the row's identity
  host: string;
  title?: string;              // whatever the lookup could read; never required
  image?: string;
  first_at: string;
  last_at: string;
  /** Distinct owner ids. Private, forever — the count is the public part. */
  owners: string[];
};

function read(): Record<string, RecipeRequest> {
  if (!existsSync(FILE)) return {};
  try { return JSON.parse(readFileSync(FILE, "utf8")) as Record<string, RecipeRequest>; }
  catch { return {}; }
}

function write(rows: Record<string, RecipeRequest>): void {
  mkdirSync(dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(rows, null, 1) + "\n", "utf8");
  renameSync(tmp, FILE);
}

/** One address per page: lowercase host, no hash, no tracking params. */
export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.hash = "";
    for (const k of [...u.searchParams.keys()])
      if (/^(utm_|fbclid|gclid|igsh|si$)/.test(k)) u.searchParams.delete(k);
    u.hostname = u.hostname.toLowerCase();
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function recordRequest(
  rawUrl: string, ownerId: string,
  meta?: { title?: string; image?: string },
): { ok: true; count: number } | { ok: false; error: string } {
  const url = normalizeUrl(rawUrl);
  if (!url) return { ok: false, error: "that is not a link" };
  const rows = read();
  const now = new Date().toISOString();
  const row = rows[url] ?? {
    url, host: new URL(url).hostname.replace(/^www\./, ""),
    first_at: now, last_at: now, owners: [],
  };
  if (!row.owners.includes(ownerId)) row.owners.push(ownerId);
  row.last_at = now;
  if (meta?.title && !row.title) row.title = meta.title;
  if (meta?.image && !row.image) row.image = meta.image;
  rows[url] = row;
  write(rows);
  return { ok: true, count: row.owners.length };
}

export function allRequests(): RecipeRequest[] {
  return Object.values(read());
}
