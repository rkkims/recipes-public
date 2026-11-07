/**
 * The best icon each creator's own site publishes — one probe, stored.
 *
 *   npm run creator-icons
 *
 * The creator page was scaling /favicon.ico up to avatar size, and a 16px
 * favicon at 1.6em is mush. Almost every source is WordPress and publishes a
 * 180×180 apple-touch-icon plus sized `<link rel="icon">` tags on the
 * homepage — the high-resolution icon exists; we were just asking for the
 * wrong file.
 *
 * One homepage fetch per domain, the `<link>` tags parsed, the largest icon
 * wins, `/apple-touch-icon.png` tried as a fallback, `/favicon.ico` recorded
 * only when nothing better exists. Written to `data/creators/icons.csv` and
 * read by the app like every other creator table — the probe runs offline
 * because a page render is the wrong place to discover a third-party host is
 * down (`check-images.ts` makes the same argument).
 *
 * Sources that block this box fail politely and keep the favicon fallback;
 * the home-machine re-run fills them in (RUNBOOK §1).
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { politeFetch } from "./http.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = resolve(ROOT, "data/creators");
const OUT = resolve(DIR, "icons.csv");

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ""));
}
const q = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);

const channels = parseCsv(readFileSync(resolve(DIR, "creator_channel.csv"), "utf8"))
  .slice(1).filter((r) => r[1] === "domain" && r[0] && r[2]);

/** Every icon the homepage declares, as (size, absolute url). */
function iconsIn(html: string, base: string): Array<{ size: number; url: string }> {
  const out: Array<{ size: number; url: string }> = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = /rel=["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    if (!/(?:^|\s)(apple-touch-icon|icon|shortcut icon)(?:\s|$)/.test(rel)) continue;
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    const sizes = /sizes=["'](\d+)x\d+["']/i.exec(tag)?.[1];
    // apple-touch-icon with no declared size is 180 by convention; a bare
    // rel=icon with none is usually the 32px favicon — rank it as such.
    const size = sizes ? Number(sizes) : rel.includes("apple") ? 180 : 32;
    try { out.push({ size, url: new URL(href, base).href }); } catch { /* bad href */ }
  }
  return out;
}

/**
 * A candidate only counts if it is actually an image with actual bytes.
 * Maangchi taught this the hard way: 200 responses with content-length 0 at
 * every conventional path, which passed an ok-and-not-HTML check and shipped
 * an avatar made of nothing. An empty 200 is a lie with good manners.
 */
async function verified(url: string): Promise<boolean> {
  const r = await politeFetch(url);
  return r.ok && r.body.length > 100 && !/<html/i.test(r.body.slice(0, 300));
}

const rows: string[][] = [["creator_id", "url", "found_by"]];
for (const [creatorId, , host] of channels) {
  const base = `https://${host}/`;
  let url: string | null = null;
  let by = "none";

  const res = await politeFetch(base);
  if (res.ok) {
    const icons = iconsIn(res.body, base).sort((a, b) => b.size - a.size);
    const top = icons.find((i) => i.size >= 48);
    if (top && await verified(top.url)) { url = top.url; by = `link-tag ${top.size}px`; }
  }
  if (!url) {
    // Conventional paths, best first; each must prove it holds bytes.
    for (const [path, name] of [
      ["/apple-touch-icon.png", "convention"],
      ["/favicon.png", "favicon-fallback"],
      ["/favicon.ico", "favicon-fallback"],
    ] as const) {
      const cand = new URL(path, base).href;
      if (await verified(cand)) { url = cand; by = name; break; }
    }
  }
  // No verified icon at all → no row: the page renders no avatar, which is
  // honest, and better than a broken image or an invisible one.
  if (url) rows.push([creatorId!, url, by]);
  console.log(`  ${host}: ${by}${url ? ` → ${url.slice(0, 66)}` : " (no icon renders — none verified)"}`);
}

const tmp = OUT + ".tmp";
writeFileSync(tmp, rows.map((r) => r.map(q).join(",")).join("\n") + "\n", "utf8");
renameSync(tmp, OUT);
console.log(`wrote ${OUT} — ${rows.length - 1} rows`);
if (existsSync(OUT) && rows.some((r) => r[2] === "favicon-fallback"))
  console.log("favicon fallbacks remain — re-run from the home machine for the blocked hosts");
