/**
 * Paste-time metadata — SOCIAL-INGEST §2a.
 *
 * *"The confirmation, not the extraction."* This fetches a title and a
 * thumbnail so the user can see they pasted the right video. It does NOT try to
 * read a recipe out of the post: §0 measured TikTok caption yield at 2% across
 * 130 videos, and the user typing their own ingredient list through the
 * autosuggest is both more reliable and already built (UX-SPEC §7).
 *
 * **oEmbed for the platforms, `og:` tags for the open web.** The platforms
 * publish endpoints that exist to be called, and those are used. An ordinary
 * WEBSITE — a recipe blog — publishes its `og:` tags for exactly this purpose
 * (every link preview in every messenger reads them), §2a already plans the
 * same fallback for Instagram, and the corpus itself was crawled from these
 * blogs. What stays out of bounds is scraping a platform that gates its
 * metadata behind auth (the Meta check below).
 *
 * Everything about this is best-effort. A failure returns what we know from the
 * URL itself and the user types the rest — a missing thumbnail is a plain card,
 * not an error.
 *
 * ── On TikTok "titles" ─────────────────────────────────────────────────────
 *
 * A TikTok video has no title. It has a CAPTION, and that is what oEmbed
 * returns in its `title` field — which is exactly why §2a says a caption must
 * never silently become a title, and why what comes back is prefilled into an
 * editable box rather than saved. The endpoint needs no token; a 400 means the
 * video is not retrievable, not that the endpoint is closed.
 */

/** What a paste can tell us. `title` absent means the user must type one. */
export type PastedMeta = {
  url: string;
  source: string;
  title?: string;
  image?: string;
  /** Why there is no title, when there is none — shown to the user. */
  reason?: string;
};

type Provider = { match: RegExp; endpoint: (url: string) => string; name: string };

/**
 * Only providers with an OPEN endpoint.
 *
 * Instagram and Facebook are deliberately absent — answered before this list
 * is consulted; see the Meta check in `fetchMeta`.
 */
const PROVIDERS: Provider[] = [
  {
    name: "YouTube",
    match: /(^|\.)(youtube\.com|youtu\.be)$/i,
    endpoint: (u) => `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(u)}`,
  },
  {
    name: "TikTok",
    match: /(^|\.)tiktok\.com$/i,
    endpoint: (u) => `https://www.tiktok.com/oembed?url=${encodeURIComponent(u)}`,
  },
];

/**
 * A caption, made usable as a title suggestion.
 *
 * Real example, from `@chefchrischo`:
 *
 *   "Quick & Easy Korean Noodles!! Happy Chuseok aka Korean Thanksgiving
 *    🙇🏻‍♂️#Formats #TikTokPartner #japchae #japchaerecipe #chuseok #추천"
 *
 * §2a says a caption is not a title and must never silently become one. This
 * does not pretend otherwise — it trims the trailing hashtag run so the
 * editable box starts somewhere sane, and the user still sees and approves
 * whatever is saved.
 *
 * Only the TRAILING run, because a hashtag mid-sentence is often load-bearing
 * ("my #1 weeknight dinner"). And if trimming would empty the field, the raw
 * caption is better than nothing — a caption that is entirely hashtags still
 * tells the user which video they pasted.
 */
export function titleFromCaption(caption: string): string {
  const trimmed = caption
    .replace(/(\s*#[^\s#]+)+\s*$/u, "")
    .replace(/\s+/g, " ")
    .trim();
  return trimmed || caption.trim();
}

/** Host without `www.`, which is what we show when nothing better is known. */
function hostOf(url: URL): string {
  return url.hostname.replace(/^www\./i, "");
}

/**
 * ── The open-web fallback, and why it is guarded ───────────────────────────
 *
 * The oEmbed paths above put the pasted URL in a QUERY STRING to two fixed,
 * public hosts. This fallback fetches the pasted URL itself, server-side —
 * which on a cloud VM is a hole unless it refuses to be pointed inward: the
 * GCP metadata service (169.254.169.254) answers with credentials, and
 * localhost answers with this very app. So every hop resolves through DNS
 * first and must land on a public address, redirects are followed by hand so
 * each hop is re-checked, and the read is capped — `og:` tags live in <head>,
 * not at megabyte forty.
 *
 * (A resolve-then-fetch race — DNS rebinding — remains in principle: the fetch
 * re-resolves. Closing it needs a pinned-address connector, which is not worth
 * its weight for a preview; the ranges below close the door that matters.)
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPublicIp(addr: string, family: number): boolean {
  if (family === 4) {
    const p = addr.split(".").map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return false;
    const [a, b] = p as [number, number, number, number];
    if (a === 0 || a === 10 || a === 127) return false;             // this-net, private, loopback
    if (a === 100 && b! >= 64 && b! <= 127) return false;           // CGNAT
    if (a === 169 && b === 254) return false;                       // link-local + cloud metadata
    if (a === 172 && b! >= 16 && b! <= 31) return false;            // private
    if (a === 192 && (b === 168 || b === 0)) return false;          // private, special
    if (a === 198 && (b === 18 || b === 19)) return false;          // benchmarking
    if (a >= 224) return false;                                     // multicast, reserved
    return true;
  }
  const v6 = addr.toLowerCase();
  if (v6 === "::" || v6 === "::1") return false;                    // unspecified, loopback
  if (v6.startsWith("fe80") || v6.startsWith("fc") || v6.startsWith("fd")) return false; // link-local, ULA
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);         // v4-mapped
  if (mapped) return isPublicIp(mapped[1]!, 4);
  return true;
}

/** Reject a URL whose host resolves anywhere non-public. Throws to refuse.
    Exported for every other server-side fetch of a user-supplied URL —
    user-images.ts caches thumbnails through the same door. */
export async function assertPublicHost(url: URL): Promise<void> {
  const literal = isIP(url.hostname.replace(/^\[|\]$/g, ""));
  if (literal) {
    if (!isPublicIp(url.hostname.replace(/^\[|\]$/g, ""), literal)) {
      throw new Error("refusing a non-public address");
    }
    return;
  }
  const addrs = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addrs.length) throw new Error("host does not resolve");
  for (const { address, family } of addrs) {
    if (!isPublicIp(address, family)) throw new Error("refusing a non-public address");
  }
}

/** The first `<meta>` for any of `keys`, whichever attribute order it wrote. */
function metaTag(html: string, keys: string[]): string | undefined {
  for (const k of keys) {
    const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*>`, "i"))?.[0];
    const content = tag?.match(/content=["']([^"']*)["']/i)?.[1]?.trim();
    if (content) return decodeEntities(content);
  }
  return undefined;
}

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'");

/**
 * Fetch a page and read the preview its author published for exactly this
 * purpose. Best-effort throughout: any refusal or failure degrades to the
 * plain no-preview card, never to an error the user has to care about.
 */
async function websitePreview(url: URL, timeoutMs: number): Promise<PastedMeta> {
  const host = hostOf(url);
  const none = {
    url: url.toString(), source: host,
    reason: "No preview available for this site. Type the title yourself.",
  };
  try {
    let at = url;
    let res: Response | null = null;
    // Redirects by hand, so every hop faces the same public-address check.
    for (let hop = 0; hop < 4; hop++) {
      await assertPublicHost(at);
      res = await fetch(at.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: "text/html", "user-agent": "Mozilla/5.0 (compatible; jipbap-preview/1.0)" },
      });
      if (res.status < 300 || res.status >= 400) break;
      const to = res.headers.get("location");
      if (!to) break;
      const next = new URL(to, at);
      if (next.protocol !== "http:" && next.protocol !== "https:") return none;
      at = next;
      res = null;
    }
    if (!res || !res.ok) return none;

    // `og:` tags live in <head>; cap the read rather than trust the page size.
    const reader = res.body?.getReader();
    if (!reader) return none;
    let html = "", got = 0;
    const dec = new TextDecoder();
    while (got < 512 * 1024) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.byteLength;
      html += dec.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    void reader.cancel().catch(() => {});

    const rawTitle = metaTag(html, ["og:title", "twitter:title"])
      ?? decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "");
    const rawImage = metaTag(html, ["og:image:secure_url", "og:image", "twitter:image"]);

    // Relative image URLs are legal and real sites write them.
    let image: string | undefined;
    if (rawImage) {
      try {
        const abs = new URL(rawImage, at);
        if (abs.protocol === "http:" || abs.protocol === "https:") image = abs.toString();
      } catch { /* a broken tag is a missing thumbnail, not an error */ }
    }

    if (!rawTitle && !image) return none;
    return {
      url: url.toString(), source: host,
      ...(rawTitle ? { title: rawTitle } : {}),
      ...(image ? { image } : {}),
      // Prefilled, never forced — the same editable-box rule as the platforms.
      ...(rawTitle ? {} : { reason: "No title on the page. Type it yourself." }),
    };
  } catch {
    return none;
  }
}

export async function fetchMeta(raw: string, timeoutMs = 4000): Promise<PastedMeta> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("That does not look like a link.");
  }
  // http(s) only. A `file:` or `javascript:` URL reaching a server-side fetch
  // is the sort of thing that turns a convenience into a hole.
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http and https links are supported.");
  }


  const host = hostOf(url);

  /**
   * Meta's platforms are accepted but cannot be previewed: their oEmbed has
   * required a Facebook app token since 2020, and §2a rules out reading the
   * page instead. Saved on the user's word alone, with the platform named so
   * the empty thumbnail reads as its withholding, not our bug — one platform
   * per message, whichever one was pasted (reviewer, 2026-08-14). "Yet"
   * carries the we're-working-on-it promise without a second sentence.
   */
  const meta = /(^|\.)instagram\.com$/i.test(url.hostname) ? "Instagram"
    : /(^|\.)(facebook\.com|fb\.com|fb\.watch)$/i.test(url.hostname) ? "Facebook"
    : null;
  if (meta) {
    return {
      url: url.toString(), source: host,
      reason: `${meta} previews aren’t available yet. Type the title yourself.`,
    };
  }

  /**
   * Everything that is not a known platform is the open web, and the open
   * web's preview is its own `og:` tags. This is what makes a pasted BLOG
   * link show its photo — the report that built this was exactly "the
   * website url's image is not populating".
   */
  const provider = PROVIDERS.find((p) => p.match.test(url.hostname));
  if (!provider) return websitePreview(url, timeoutMs);

  /**
   * A timeout, because this sits between the user and a form they want to fill.
   * `AbortSignal.timeout` rather than a manual race: it actually cancels the
   * request rather than leaving it running and ignored.
   */
  try {
    const res = await fetch(provider.endpoint(url.toString()), {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      /**
       * 400 from TikTok means the video is not there to describe — deleted,
       * private, region-locked, or the id is wrong. Worth distinguishing from a
       * network failure, because the fix is different: one is "check the link",
       * the other is "try again".
       */
      return {
        url: url.toString(), source: host,
        reason: res.status === 400 || res.status === 404
          ? `${provider.name} has nothing at that link. It may be private, ` +
            `deleted, or region-locked. The link still works; type the title yourself.`
          : `${provider.name} answered ${res.status}. Type the title yourself.`,
      };
    }
    const j = (await res.json()) as {
      title?: unknown; author_name?: unknown; thumbnail_url?: unknown;
    };
    const raw = typeof j.title === "string" ? j.title.trim() : undefined;
    const title = raw ? titleFromCaption(raw) : undefined;
    const author = typeof j.author_name === "string" ? j.author_name.trim() : undefined;
    const image = typeof j.thumbnail_url === "string" ? j.thumbnail_url : undefined;

    return {
      url: url.toString(),
      /**
       * "TikTok · Chef Chris Cho" — the platform AND the creator.
       *
       * The creator's name alone is a better label than the host ("Chef Chris
       * Cho" tells you where a recipe came from; "tiktok.com" does not), but on
       * its own it loses where to go looking. The platform name in TEXT rather
       * than a logo: both platforms permit their marks for attribution under
       * brand guidelines, and text carries the same information with no
       * trademark surface and no asset to ship.
       */
      source: author ? `${provider.name} · ${author}` : host,
      ...(title ? { title } : {}),
      ...(image ? { image } : {}),
      /**
       * §2a: "The caption is not a title, and must never become one." oEmbed's
       * `title` for TikTok IS the caption, so it is offered as a starting point
       * in an editable field and never saved without the user seeing it.
       */
    };
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return {
      url: url.toString(), source: host,
      reason: timedOut
        ? `${provider.name} did not answer in time. Type the title yourself.`
        : `Could not reach ${provider.name}. Type the title yourself.`,
    };
  }
}
