/**
 * Product thumbnails for the affiliate surfaces — CREATORS-TAB-SPEC §7.
 *
 *   npm run weee-product-images
 *
 * The catalogue CSV is `product_id, title` and nothing else, so the affiliate
 * card and modal had no picture to show. This probe fills
 * `app/public/cached-images/weee-<product_id>.jpg` from each product page's
 * `og:image`, and the app discovers what exists by listing that directory
 * (`weeeProductImage`) — no manifest to drift, and a surface renders
 * title-only for anything not fetched yet.
 *
 * Scope is the products the app can actually SHOW: the shelves hand-marked
 * hard-to-find (`data/decisions/weee-hard-to-find.csv`), which is the §4h
 * findability rule that gates every placement. Fetching all 2,700 rows would
 * be crawling for crawling's sake.
 *
 * robots.txt is checked for the product path before anything runs — the spec's
 * own line: we may send a person to a page; whether we may FETCH one is the
 * robots file's call. Refusals and failures skip politely; a re-run fills in.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetch } from "undici";
import { politeFetch } from "./http.js";

/* Raw bytes via undici, magic numbers verified — `cache-images.ts`'s two
   rules: an image decoded through utf8 is corruption with extra steps, and an
   HTML challenge page must never become a "photograph". */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const IMAGE_MAGIC = [/^\xFF\xD8\xFF/, /^\x89PNG/, /^RIFF/, /^GIF8/];

async function fetchImage(src: string): Promise<Buffer | null> {
  try {
    const res = await fetch(src, { headers: { "user-agent": UA } });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const head = buf.subarray(0, 8).toString("latin1");
    return IMAGE_MAGIC.some((m) => m.test(head)) ? buf : null;
  } catch { return null; }
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PRODUCTS = resolve(ROOT, "data/weee/products.csv");
const HARD = resolve(ROOT, "data/decisions/weee-hard-to-find.csv");
const OUT_DIR = resolve(ROOT, "app/public/cached-images");

function rows(path: string): string[][] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split(/\r?\n/).filter(Boolean)
    .map((l) => l.split(","));
}

async function allowed(): Promise<boolean> {
  const r = await politeFetch("https://www.weee.com/robots.txt", {});
  if (!r.ok || !r.body) return false;
  /* A blanket or product-path disallow means no fetching, full stop. */
  const lines = r.body.split(/\r?\n/).map((l) => l.trim().toLowerCase());
  let ours = false;
  for (const l of lines) {
    if (l.startsWith("user-agent:")) ours = l.includes("*");
    if (ours && l.startsWith("disallow:")) {
      const path = l.slice("disallow:".length).trim();
      if (path === "/" || "/en/product/x/".startsWith(path) && path.length > 1)
        return false;
    }
  }
  return true;
}

async function main() {
  if (!(await allowed())) {
    console.log("robots.txt disallows product pages — nothing fetched.");
    return;
  }

  const hardShelves = new Set(rows(HARD).slice(1).map((r) => (r[0] ?? "").trim())
    .filter(Boolean));
  const wanted = rows(PRODUCTS).slice(1)
    .filter((r) => hardShelves.has((r[0] ?? "").trim()))
    .map((r) => (r[2] ?? "").trim())
    .filter(Boolean);

  mkdirSync(OUT_DIR, { recursive: true });
  let fetched = 0, skipped = 0, failed = 0;
  for (const id of wanted) {
    const out = resolve(OUT_DIR, `weee-${id}.jpg`);
    if (existsSync(out)) { skipped++; continue; }
    try {
      const page = await politeFetch(`https://www.weee.com/en/product/x/${id}`, {});
      const og = page.body?.match(
        /property=["']og:image["'][^>]*content=["']([^"']+)["']|content=["']([^"']+)["'][^>]*property=["']og:image["']/);
      const src = og?.[1] ?? og?.[2];
      if (!page.ok || !src) { failed++; continue; }
      const buf = await fetchImage(src);
      if (!buf) { failed++; continue; }
      writeFileSync(out, buf);
      fetched++;
    } catch { failed++; }
  }
  console.log(`weee product images: ${fetched} fetched, ${skipped} already held, ${failed} failed of ${wanted.length}`);
}

void main();
