/**
 * The open door — CREATOR-SPEC §5a's `self_registered` rows.
 *
 * An `indexed` row is an observation: we crawled a source and they were on
 * it. A row here is an assertion: someone with no crawled presence walked in
 * and told us. Both are legitimate, both can be claimed, and §2's
 * defensibility posture requires telling them apart permanently — which is
 * why these live in their own file rather than being appended to the crawl's
 * CSV, and why the status derivation never collapses the two.
 *
 * No application, no review, no follower minimum. What keeps the door
 * defensible is the architecture, not a policy: we never host instructions,
 * so the one entry criterion is that every recipe they add has a live URL on
 * the channel they proved (enforced at the add action, §5a). A row here
 * grants nothing by itself — the page goes live the way every page does,
 * by proving the channel.
 *
 * Same storage posture as every runtime file: app-owned JSON beside
 * claims.json, read fresh per call because registrations happen under a
 * running server.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";

const FILE = resolve(process.cwd(), "..", "data", "creators", "self.json");

export type SelfCreator = {
  id: string;                    // crt_… — same namespace as the crawl's rows
  handle: string;
  display_name: string;
  /** The one channel they named at the door — the PROVABLE one. */
  channel: { kind: "domain" | "youtube"; handle: string };
  /**
   * Their other platforms, added one at a time at the door —
   * CREATORS-TAB-SPEC §5. An indexed creator arrives with channels the crawl
   * found; a self-registered one arrives with none, so the door takes them.
   * Unverified like every crawl channel, one per platform, never the primary
   * kind twice. A claimed page edits links via claim settings, which win per
   * kind at read time (`linksOf`) — same as for crawled rows.
   */
  extras?: Array<{ kind: "youtube" | "instagram" | "tiktok"; handle: string }>;
  created_at: string;
};

function read(): SelfCreator[] {
  if (!existsSync(FILE)) return [];
  try { return JSON.parse(readFileSync(FILE, "utf8")) as SelfCreator[]; }
  catch { return []; }          // a corrupt file must not take the pages down
}

function write(rows: SelfCreator[]): void {
  mkdirSync(dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(rows, null, 1) + "\n", "utf8");
  renameSync(tmp, FILE);
}

export function selfByHandle(handle: string): SelfCreator | null {
  return read().find((r) => r.handle === handle.toLowerCase()) ?? null;
}

export function selfById(id: string): SelfCreator | null {
  return read().find((r) => r.id === id) ?? null;
}

export function allSelfCreators(): SelfCreator[] {
  return read();
}

/**
 * Mint a row. The caller resolves the handle (it needs the crawl tables to
 * check collisions, and this store stays beneath them) and has already
 * validated the channel — this function only refuses duplicates of itself.
 */
export function addSelfCreator(
  r: { handle: string; display_name: string; channel: SelfCreator["channel"];
       extras?: SelfCreator["extras"] },
): { ok: true; id: string } | { ok: false; error: string } {
  const rows = read();
  if (rows.some((x) => x.handle === r.handle))
    return { ok: false, error: "that handle just got taken" };
  if (rows.some((x) => x.channel.kind === r.channel.kind && x.channel.handle === r.channel.handle))
    return { ok: false, error: "that channel already has a page here" };
  const id = "crt_" + randomBytes(6).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
  const row: SelfCreator = { handle: r.handle, display_name: r.display_name,
    channel: r.channel, id, created_at: new Date().toISOString() };
  if (r.extras?.length) row.extras = r.extras;
  rows.push(row);
  write(rows);
  return { ok: true, id };
}
