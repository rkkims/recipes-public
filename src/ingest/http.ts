/**
 * Polite fetcher: fixed delay per host, exponential backoff on throttling,
 * and OPT-IN residential routing.
 *
 * Two design rules, both learned the hard way:
 *
 * 1. The request delay is not politeness theatre. Measured during evaluation, a
 *    paginated listing silently truncated to 1 item without a delay and
 *    reported no error. Assume every host does something similar.
 *
 * 2. Routing is per-request, never global. An earlier version called
 *    `setGlobalDispatcher`, so a rejected proxy credential broke the two
 *    sources that need no proxy at all. Sources that work directly must be
 *    unaffected by proxy configuration — and proxy bandwidth costs money, so
 *    routing everything through it is wrong even when it works.
 */
import { readFileSync } from "node:fs";
import { fetch, ProxyAgent, type Dispatcher } from "undici";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Minimal .env.local reader — avoids a dependency for three variables. */
function loadEnvLocal() {
  try {
    const path = new URL("../../.env.local", import.meta.url);
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (v && !process.env[k]) process.env[k] = v;
    }
  } catch {
    /* absent is fine — the primary sources need no credentials */
  }
}
loadEnvLocal();

export type Routing = "direct" | "apify-proxy" | "scraperapi";

export const routing: Routing = process.env.APIFY_PROXY_PASSWORD
  ? "apify-proxy"
  : process.env.SCRAPERAPI_KEY
    ? "scraperapi"
    : "direct";

export const hasResidentialRouting = () => routing !== "direct";

/**
 * Agents keyed by proxy URI.
 *
 * The explicit-URI path exists for the Apify Actor: Apify Proxy refuses
 * external HTTP clients on this account ("Access from external HTTP clients
 * (outside of Actors) isn't enabled"), so the only way to use it is from inside
 * an Actor, which mints its own proxy URL at runtime. Same fetch and parse code
 * either way — the JSON-LD extractor must not fork.
 */
const agents = new Map<string, ProxyAgent>();
function agentFor(uri: string): ProxyAgent {
  let a = agents.get(uri);
  if (!a) {
    a = new ProxyAgent({ uri });
    agents.set(uri, a);
  }
  return a;
}

let agent: ProxyAgent | null = null;
function proxyAgent(): ProxyAgent {
  if (!agent) {
    const groups = process.env.APIFY_PROXY_GROUPS || "groups-RESIDENTIAL,country-US";
    agent = new ProxyAgent({
      uri: "http://proxy.apify.com:8000",
      token: `Basic ${Buffer.from(
        `${groups}:${process.env.APIFY_PROXY_PASSWORD}`,
      ).toString("base64")}`,
    });
  }
  return agent;
}

/** ScraperAPI rewrites the URL; Apify is a real tunnel. Different mechanisms. */
function scraperApiUrl(url: string): string {
  const p = new URLSearchParams({
    api_key: process.env.SCRAPERAPI_KEY!,
    url,
    premium: "true",
  });
  return `https://api.scraperapi.com/?${p}`;
}

export type FetchOpts = {
  delayMs?: number;
  retries?: number;
  timeoutMs?: number;
  /** Route via the configured residential provider. Opt-in, per source. */
  residential?: boolean;
  /**
   * Explicit proxy URI, overriding env-based routing. Used by the Apify Actor,
   * which receives a proxy URL from the platform at runtime.
   */
  proxyUrl?: string;
};

export type FetchResult = {
  ok: boolean;
  status: number;
  body: string;
  url: string;
  /** Set when residential routing was requested but the provider refused us. */
  proxyRejected?: boolean;
};

const lastHit = new Map<string, number>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function politeFetch(
  url: string,
  opts: FetchOpts = {},
): Promise<FetchResult> {
  const {
    delayMs = 1500, retries = 3, timeoutMs = 45_000,
    residential = false, proxyUrl,
  } = opts;

  const useProxy = residential && routing !== "direct";
  const target = !proxyUrl && useProxy && routing === "scraperapi" ? scraperApiUrl(url) : url;
  const dispatcher: Dispatcher | undefined = proxyUrl
    ? agentFor(proxyUrl)
    : useProxy && routing === "apify-proxy"
      ? proxyAgent()
      : undefined;

  const host = new URL(url).host;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const since = Date.now() - (lastHit.get(host) ?? 0);
    if (since < delayMs) await sleep(delayMs - since);
    lastHit.set(host, Date.now());

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(target, {
        headers: { "user-agent": UA, accept: "text/html,application/xml,*/*" },
        signal: ctrl.signal,
        redirect: "follow",
        ...(dispatcher ? { dispatcher } : {}),
      });
      const body = await res.text();

      // 429/5xx are transient. 403/404 are a decision — don't hammer them.
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await sleep(delayMs * 2 ** (attempt + 1));
        continue;
      }
      return { ok: res.ok, status: res.status, body, url };
    } catch (err) {
      const msg = String(err);
      // Proxy auth failure: retrying cannot help, and it must not be reported
      // as "the site blocked us" — that sends debugging in the wrong direction.
      if (/Proxy response \((?:403|407)\)/.test(msg)) {
        return { ok: false, status: 0, body: msg, url, proxyRejected: true };
      }
      if (attempt >= retries) return { ok: false, status: 0, body: msg, url };
      await sleep(delayMs * 2 ** (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, status: 0, body: "unreachable", url };
}
