/**
 * Mirror a user-added recipe's thumbnail onto our own disk.
 *
 * The thumbnail on a user's recipe is a URL into someone else's host — an og:
 * image, a YouTube thumbnail — and those die: posts get edited, CDNs rotate
 * paths, hotlink protection starts screening datacentre IPs (the exact failure
 * `cache-images.ts` documents for the corpus). A corpus image going grey is a
 * QC row; a user's own recipe going grey is their shelf breaking. So the copy
 * is taken ONCE, at save time, while the URL is known to work.
 *
 * Same posture as the corpus mirror: a thumbnail with a different address,
 * still attributed, still linking out — and for a user-added recipe the user
 * themselves chose to save it, which is the strongest attribution there is.
 *
 * Best-effort by contract: every failure returns undefined and the caller
 * keeps the remote URL. A save must never fail because a picture did.
 *
 * ── Guards, because the URL is user-supplied and the fetch is server-side ──
 *
 *   - `assertPublicHost` (oembed.ts) — the same refuse-to-point-inward check
 *     as the og: fetch; a GCP box must not GET what a pasted URL tells it to
 *   - magic numbers, not Content-Type — an HTML error page or a challenge
 *     screen can never become a "photograph" (cache-images.ts's rule)
 *   - a size cap — a thumbnail is not 40MB
 *
 * Files land in data/images/user/ (gitignored), named by URL hash — the same
 * image saved by two people is one file, which is also why nothing deletes on
 * recipe removal. NOT app/public/: `next start` bakes the public manifest at
 * build time, so a file cached mid-session would 404 until the next deploy —
 * measured, not assumed. The `/user-images/[file]` route serves this
 * directory from disk at request time instead.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertPublicHost } from "./oembed";

export const USER_IMAGE_DIR =
  resolve(dirname(fileURLToPath(import.meta.url)), "../../../data/images/user");
const DIR = USER_IMAGE_DIR;
const MAX_BYTES = 8 * 1024 * 1024;

/** JPEG / PNG / WebP / GIF by leading bytes. */
function imageExt(b: Uint8Array): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b.length > 7 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b.length > 11 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  if (b.length > 2 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "gif";
  return null;
}

/**
 * Cache one thumbnail. Returns the local, same-origin path to store on the
 * recipe (`/user-images/<hash>.<ext>`), or undefined to keep the remote URL.
 */
/** Attempts per image: the first, then two more with backoff. Bounded so a
    save or an import never waits on a dead CDN for long — the retries are
    for the hosts that fail the FIRST request and answer the second: a
    rate-limiter, a cold CDN edge, a flaky origin behind a challenge. */
const ATTEMPTS = 3;
const BACKOFF_MS = 400;

/** A browser's user-agent, because the bot-looking one got served a
    "placeholder" by hosts that screen crawlers — the same pattern
    cache-images.ts documents. Plus a Referer naming the page the image was
    found on: hotlink protection checks exactly that header. */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 429 and the 5xx family are "try again"; every other failure status is the
    host's final word and a retry only annoys it. */
const retryable = (status: number) => status === 429 || status === 408 || status >= 500;

/**
 * Fetch one image's bytes, verified by magic number, with bounded retries.
 * Returns the bytes and their extension, or undefined once every attempt has
 * failed or the host has said a definitive no.
 */
export async function fetchImageWithRetry(
  remote: string, timeoutMs: number, referer?: string,
): Promise<{ bytes: Uint8Array; ext: string } | undefined> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(BACKOFF_MS * 2 ** (attempt - 1));
    try {
      const res = await fetch(remote, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          "user-agent": UA,
          ...(referer ? { referer } : {}),
        },
      });
      if (!res.ok || !res.body) {
        if (retryable(res.status)) continue;
        return undefined;
      }
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let got = 0;
      while (got <= MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done) break;
        got += value.byteLength;
        chunks.push(value);
      }
      if (got > MAX_BYTES) { void reader.cancel().catch(() => {}); return undefined; }
      // An empty 200 is the flaky-host signature (maangchi's icons do it);
      // worth one more try.
      if (got === 0) continue;

      const bytes = new Uint8Array(got);
      let at = 0;
      for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }
      const ext = imageExt(bytes);
      // Not an image: a challenge page or an HTML error with a 200. A retry
      // sometimes passes the challenge; a third never seems to, but it is
      // cheap and bounded.
      if (!ext) continue;
      return { bytes, ext };
    } catch {
      // Network error or timeout — exactly what the retries are for.
      continue;
    }
  }
  return undefined;
}

/**
 * Cache one thumbnail. Returns the local, same-origin path to store on the
 * recipe (`/user-images/<hash>.<ext>`), or undefined to keep the remote URL.
 * `referer` is the page the image belongs to; pass it when known.
 */
export async function cacheUserImage(
  remote: string, timeoutMs = 6000, referer?: string,
): Promise<string | undefined> {
  try {
    const url = new URL(remote);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    // Already ours — an edit re-saving a cached path must not re-cache it.
    if (url.pathname.startsWith("/user-images/")) return undefined;

    const hash = createHash("sha256").update(remote).digest("hex").slice(0, 16);
    for (const ext of ["jpg", "png", "webp", "gif"]) {
      if (existsSync(resolve(DIR, `${hash}.${ext}`))) return `/user-images/${hash}.${ext}`;
    }

    await assertPublicHost(url);
    const got = await fetchImageWithRetry(remote, timeoutMs, referer);
    if (!got) return undefined;
    const { bytes, ext } = got;

    mkdirSync(DIR, { recursive: true });
    // Write-then-rename, so a crash mid-write cannot leave a truncated file
    // that the exists-check above would then trust forever.
    const tmp = resolve(DIR, `.${hash}.${ext}.tmp`);
    writeFileSync(tmp, bytes);
    renameSync(tmp, resolve(DIR, `${hash}.${ext}`));
    return `/user-images/${hash}.${ext}`;
  } catch {
    return undefined;
  }
}

/**
 * The second chance. A thumbnail whose mirror failed at save time keeps its
 * remote URL, and before this that was forever: the card showed whatever the
 * host felt like serving a hotlink that day. This walks the owner's recipes
 * that still point off-site and tries again — with a per-URL cooldown, so a
 * host that is truly gone is asked once an hour, not once a page view.
 *
 * Fire-and-forget from a render; it never throws and returns how many it
 * fixed. Successes are written through `updateOwnRecipe`, the same door an
 * edit uses.
 */
const COOLDOWN_MS = 60 * 60 * 1000;
const nextTry = new Map<string, number>();

export async function retryOwnImages(
  ownerId: string,
  recipes: Array<{ id: string; url: string; image?: string }>,
  update: (ownerId: string, recipeId: string, patch: { image: string }) => unknown,
  now = Date.now(),
): Promise<number> {
  let fixed = 0;
  for (const r of recipes) {
    if (!r.image || !/^https?:\/\//i.test(r.image)) continue;
    if ((nextTry.get(r.image) ?? 0) > now) continue;
    nextTry.set(r.image, now + COOLDOWN_MS);
    try {
      const local = await cacheUserImage(r.image, 4000, r.url);
      if (!local) continue;
      update(ownerId, r.id, { image: local });
      nextTry.delete(r.image);
      fixed++;
    } catch { /* best-effort by contract */ }
  }
  return fixed;
}
