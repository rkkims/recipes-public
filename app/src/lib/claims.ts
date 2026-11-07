/**
 * Claims — the runtime half of the creator tables.
 *
 * The CSVs under data/creators/ are CRAWL FACTS, owned by the offline
 * pipeline; a claim happens at runtime, initiated by a web user, and must not
 * write pipeline-owned files. So claims live in claims.json — the same
 * split as owners.json against the corpus — and `creators.ts` merges them at
 * read time: status, display-name override, affiliate tag, per-channel
 * verified_at.
 *
 * ── The proof, and why there are two of them ──────────────────────────────
 *
 * CREATOR-SPEC §5 wants identity per channel: "do you control this domain".
 * The web-native proofs are a meta tag or a well-known file — but several of
 * our sources challenge-wall every datacentre IP, and a verification our own
 * server cannot fetch would tell those exact creators the button is broken.
 * DNS is the answer the wall cannot block: a TXT record at
 * `_jipbap-claim.<domain>` resolves from anywhere. So both are offered,
 * either passes:
 *
 *   1. `<meta name="jipbap-claim" content="TOKEN">` on the homepage,
 *      or the file `/jipbap-claim.txt` containing TOKEN
 *   2. TXT record `_jipbap-claim.<domain>` = `jipbap-claim=TOKEN`
 *
 * Platform channels (YouTube, Instagram, TikTok) are NOT claimable here —
 * their proof is OAuth against apps that do not exist yet, and a domain claim
 * deliberately verifies only the domain channel. §1: proving control of the
 * site says nothing about who runs the TikTok.
 *
 * ── Tokens ────────────────────────────────────────────────────────────────
 *
 * Minted per (creator, user), stored pending, never expiring — a DNS record
 * takes however long it takes, and a token that dies overnight punishes the
 * people doing it properly. A token is proof-of-nothing until the check
 * passes, so a long life costs nothing (CREATOR-SPEC §8's expiry question,
 * answered by making expiry unnecessary).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { resolveTxt } from "node:dns/promises";

const FILE = resolve(process.cwd(), "..", "data", "creators", "claims.json");

export type Collection = {
  id: string;
  title: string;
  description: string;
  recipe_ids: string[];
};

export type Claim = {
  user_id: string;
  claimed_at: string;
  /** The channel the proof ran against — always the domain, today. */
  verified_channel: { kind: string; handle: string };
  display_name?: string;
  affiliate_tag?: string;
  /**
   * The creator's own grouping of their own work — INGREDIENT-HOME-SPEC §1's
   * collections, arriving the way that spec wanted: authored by the claimant,
   * never derived by us. The shelf's cuisine grouping was removed for exactly
   * this; the sort order was ours to guess, the collections never were.
   */
  collections?: Collection[];
  /**
   * CREATOR-SPEC §6, self-serve: "honour it immediately, without a review
   * process and without an argument." A status, never a deletion — set it
   * back and everything returns, because most withdrawals are a reaction to
   * a surprise and the honest first response is to stop, not to destroy.
   */
  withdrawn_at?: string;
  /**
   * CREATOR-SPEC §4's one ask, answered: the creator's own reading of a
   * crawled recipe's ingredient list. Keyed by recipe id; replaces the
   * parser's requires/optional wholesale and clears unresolved — a creator
   * saying "this is the list" outranks every guess we made, which is also how
   * a recipe the parser could not fully read becomes servable. §5's badge
   * attaches to exactly these rows and nothing else.
   */
  confirmed?: Record<string, {
    requires: string[]; optional: string[]; confirmed_at: string;
  }>;
  /**
   * Crawled recipes the claimant took off their own page. Withdrawal's small
   * sibling: same honour-it-immediately posture, one recipe instead of all of
   * them, and a toggle rather than a deletion — the crawl row stays, the
   * direct link keeps working, it just stops being SHOWN anywhere we choose
   * what to show. Survives withdrawal and restore on purpose: coming back
   * should not silently republish the dishes they had singled out.
   */
  hidden?: string[];
  /** One line about themselves, theirs verbatim. Capped, single line. */
  bio?: string;
  /**
   * Their chosen face for the page, replacing the probed favicon. Https only,
   * hotlinked from wherever they host it — the same posture as every recipe
   * photo, and nothing uploaded means nothing to moderate at rest.
   */
  avatar_url?: string;
  /**
   * Channel links the claimant added or corrected. Merged over the crawl's
   * channels at read time, theirs winning per kind — the crawl found where
   * they were, the claimant says where they are. The URL must live on the
   * platform the kind names, or the icon would dress up an arbitrary link.
   */
  channels?: Array<{ kind: string; url: string }>;
};

type Store = {
  claims: Record<string, Claim>;
  pending: Record<string, { token: string; user_id: string; created_at: string }>;
};

function read(): Store {
  if (!existsSync(FILE)) return { claims: {}, pending: {} };
  try {
    const s = JSON.parse(readFileSync(FILE, "utf8")) as Partial<Store>;
    return { claims: s.claims ?? {}, pending: s.pending ?? {} };
  } catch {
    // A corrupt claims file must not take the creator pages down with it.
    return { claims: {}, pending: {} };
  }
}

function write(s: Store): void {
  mkdirSync(dirname(FILE), { recursive: true });
  const tmp = FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(s, null, 1) + "\n", "utf8");
  renameSync(tmp, FILE);
}

export function claimOf(creatorId: string): Claim | null {
  return read().claims[creatorId] ?? null;
}

/** The user's token for this creator, minting one if none is pending. */
export function tokenFor(creatorId: string, userId: string): string {
  const s = read();
  const key = `${creatorId} ${userId}`;
  const existing = s.pending[key];
  if (existing) return existing.token;
  const token = "jb-" + randomBytes(9).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  s.pending[key] = { token, user_id: userId, created_at: new Date().toISOString() };
  write(s);
  return token;
}

/** Where the token was found, for the page to say — or null for not found. */
export type Proof = "meta-tag" | "claim-file" | "dns-txt" | "channel-description";

/**
 * Look for the token everywhere we accept it. Returns the first proof found.
 * Fetch failures are indistinguishable from absence ON PURPOSE: the caller
 * shows "not found yet, here is what we checked", and a challenge-walled
 * homepage plus a found DNS record still verifies.
 */
export async function findProof(host: string, token: string): Promise<Proof | null> {
  const ua = { "user-agent": "jipbap-claim-verifier/1 (+https://jipbap.com)" };

  try {
    const res = await fetch(`https://${host}/`, { headers: ua, signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const html = await res.text();
      const meta = new RegExp(
        `<meta[^>]+name=["']jipbap-claim["'][^>]+content=["']${token}["']|` +
        `<meta[^>]+content=["']${token}["'][^>]+name=["']jipbap-claim["']`, "i");
      if (meta.test(html)) return "meta-tag";
    }
  } catch { /* absence */ }

  try {
    const res = await fetch(`https://${host}/jipbap-claim.txt`, { headers: ua, signal: AbortSignal.timeout(15000) });
    if (res.ok && (await res.text()).includes(token)) return "claim-file";
  } catch { /* absence */ }

  try {
    const bare = host.replace(/^www\./, "");
    for (const name of [`_jipbap-claim.${bare}`, `_jipbap-claim.${host}`]) {
      const records = await resolveTxt(name).catch(() => [] as string[][]);
      if (records.some((chunks) => chunks.join("").includes(`jipbap-claim=${token}`))) return "dns-txt";
    }
  } catch { /* absence */ }

  return null;
}

/**
 * The per-channel prover — CREATOR-SPEC §1's "verification is per channel",
 * as a switch. A domain proves by tag, file or DNS; a YouTube channel proves
 * by the token appearing in its description (fetch the channel page and its
 * /about — the description rides both). Instagram and TikTok have no entry
 * here on purpose: their profile pages answer this box with 429s and
 * challenge shells, and a verify button that always fails is worse than an
 * honest "coming with their sign-in".
 */
export async function findChannelProof(
  channel: { kind: string; handle: string }, token: string,
): Promise<Proof | null> {
  if (channel.kind === "domain") return findProof(channel.handle, token);
  if (channel.kind === "youtube") {
    const ua = { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36" };
    for (const path of [`${channel.handle}/about`, channel.handle]) {
      try {
        const res = await fetch(`https://www.youtube.com/${path}`, {
          headers: ua, signal: AbortSignal.timeout(15000),
        });
        if (res.ok && (await res.text()).includes(token)) return "channel-description";
      } catch { /* absence */ }
    }
    return null;
  }
  return null;
}

/** The proof passed — record everything a claim changes. */
export function recordClaim(
  creatorId: string, userId: string, channel: { kind: string; handle: string },
): void {
  const s = read();
  s.claims[creatorId] = {
    user_id: userId,
    claimed_at: new Date().toISOString(),
    verified_channel: channel,
  };
  delete s.pending[`${creatorId} ${userId}`];
  write(s);
}

/** The creator's reading of one crawled recipe — claimant only. */
export function setConfirmed(
  creatorId: string, userId: string, recipeId: string,
  list: { requires: string[]; optional: string[] },
): { ok: true } | { ok: false; error: string } {
  const s = read();
  const c = s.claims[creatorId];
  if (!c || c.user_id !== userId) return { ok: false, error: "only the claimant confirms" };
  if (list.requires.length === 0) return { ok: false, error: "mark at least one required ingredient" };
  (c.confirmed ??= {})[recipeId] = {
    requires: [...new Set(list.requires)],
    optional: [...new Set(list.optional)],
    confirmed_at: new Date().toISOString(),
  };
  write(s);
  return { ok: true };
}

/** Every confirmation across every live claim — the read layer's overlay. */
export function allConfirmations():
  Map<string, { creator_id: string; requires: string[]; optional: string[] }> {
  const out = new Map<string, { creator_id: string; requires: string[]; optional: string[] }>();
  for (const [creatorId, c] of Object.entries(read().claims)) {
    if (c.withdrawn_at || !c.confirmed) continue;
    for (const [rec, v] of Object.entries(c.confirmed))
      out.set(rec, { creator_id: creatorId, requires: v.requires, optional: v.optional });
  }
  return out;
}

/**
 * The creator-confirmed overlay — CREATOR-SPEC §4/§5 at the read layer.
 *
 * A confirmation replaces the parser's reading wholesale and clears
 * `unresolved`: the creator saying "this is the list" outranks every guess,
 * which is also how a recipe the parser could not fully read becomes
 * servable the moment its creator fixes it. Lives HERE, beside the store it
 * reads, so recipes.ts and creators.ts can both use it without importing
 * each other — the cycle was real and this is the break.
 */
export function applyConfirmations<T extends {
  id: string; requires: string[]; optional?: string[];
  unresolved: string[]; confirmed?: boolean;
}>(recipes: T[]): T[] {
  const conf = allConfirmations();
  if (conf.size === 0) return recipes;
  return recipes.map((r) => {
    const c = conf.get(r.id);
    return c
      ? { ...r, requires: c.requires, optional: c.optional, unresolved: [], confirmed: true }
      : r;
  });
}

/** Hide or show one crawled recipe — claimant only, same gate as every write. */
export function setHidden(
  creatorId: string, userId: string, recipeId: string, on: boolean,
): boolean {
  const s = read();
  const c = s.claims[creatorId];
  if (!c || c.user_id !== userId) return false;
  const cur = new Set(c.hidden ?? []);
  if (on) cur.add(recipeId);
  else cur.delete(recipeId);
  if (cur.size) c.hidden = [...cur];
  else delete c.hidden;
  write(s);
  return true;
}

/**
 * Every recipe id any claimant has hidden. ALL claims count, withdrawn ones
 * included — a creator who withdraws and later restores gets their page back
 * minus exactly the dishes they had already singled out, not a silent
 * republish of them.
 */
export function hiddenRecipeIds(): Set<string> {
  const out = new Set<string>();
  for (const c of Object.values(read().claims))
    for (const id of c.hidden ?? []) out.add(id);
  return out;
}

/** Withdraw or restore — claimant only, effective on the next request. */
export function setWithdrawn(creatorId: string, userId: string, on: boolean): boolean {
  const s = read();
  const c = s.claims[creatorId];
  if (!c || c.user_id !== userId) return false;
  if (on) c.withdrawn_at = new Date().toISOString();
  else delete c.withdrawn_at;
  write(s);
  return true;
}

/** Create or update one collection — claimant only, like every claim write. */
export function saveCollection(
  creatorId: string, userId: string,
  col: { id?: string; title: string; description: string; recipe_ids: string[] },
): { ok: true; id: string } | { ok: false; error: string } {
  const s = read();
  const c = s.claims[creatorId];
  if (!c || c.user_id !== userId) return { ok: false, error: "only the claimant edits collections" };
  const title = col.title.trim();
  if (!title) return { ok: false, error: "a collection needs a title" };
  const list = c.collections ?? (c.collections = []);
  const id = col.id ?? "col-" + randomBytes(5).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8);
  const next: Collection = {
    id, title,
    description: col.description.trim(),
    recipe_ids: [...new Set(col.recipe_ids)],
  };
  const i = list.findIndex((x) => x.id === id);
  if (i >= 0) list[i] = next; else list.push(next);
  write(s);
  return { ok: true, id };
}

export function removeCollection(creatorId: string, userId: string, id: string): boolean {
  const s = read();
  const c = s.claims[creatorId];
  if (!c || c.user_id !== userId || !c.collections) return false;
  c.collections = c.collections.filter((x) => x.id !== id);
  write(s);
  return true;
}

/** Post-claim settings — CREATOR-SPEC §5's "display_name becomes theirs to edit". */
export function updateClaim(
  creatorId: string, userId: string,
  patch: {
    display_name?: string; affiliate_tag?: string;
    bio?: string; avatar_url?: string;
    channels?: Array<{ kind: string; url: string }>;
  },
): boolean {
  const s = read();
  const c = s.claims[creatorId];
  if (!c || c.user_id !== userId) return false;   // only the claimant edits
  if (patch.display_name !== undefined) {
    const name = patch.display_name.trim();
    if (name) c.display_name = name; else delete c.display_name;
  }
  if (patch.affiliate_tag !== undefined) {
    const tag = patch.affiliate_tag.trim();
    if (tag) c.affiliate_tag = tag; else delete c.affiliate_tag;
  }
  if (patch.bio !== undefined) {
    // One line, capped — a bio is a caption under the name, not a page.
    const bio = patch.bio.replace(/\s+/g, " ").trim().slice(0, 200);
    if (bio) c.bio = bio; else delete c.bio;
  }
  if (patch.avatar_url !== undefined) {
    const url = patch.avatar_url.trim();
    if (url) c.avatar_url = url; else delete c.avatar_url;
  }
  if (patch.channels !== undefined) {
    if (patch.channels.length) c.channels = patch.channels;
    else delete c.channels;
  }
  write(s);
  return true;
}
