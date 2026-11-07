/**
 * Every creator's YouTube avatar, found through their own site — one sweep.
 *
 *   npm run creator-avatars
 *
 * Maangchi settled the pattern: a food blog's site icon is a 16-192px favicon
 * at best, but nearly every one of these creators runs a YouTube channel, and
 * a channel publishes a 900×900 avatar. The reviewer's call: use it for all
 * of them.
 *
 * The route is theirs the whole way: their homepage links their channel (a
 * crawl fact), the channel page carries the avatar URL, and the bytes land in
 * our cache dir so Google is never hotlinked. Two side effects worth more
 * than the avatars:
 *
 *   - each found channel is appended to creator_channel.csv (kind=youtube,
 *     unverified) — CREATOR-SPEC §1's table growing from crawl facts, which
 *     is exactly the data the claim flow will verify against later
 *   - icons.csv rows upgrade to found_by=youtube-avatar; the site-icon rows
 *     stay for anyone the sweep cannot reach
 *
 * Hosts that block this box are skipped and keep their site icon; the
 * home-machine re-run fills them in (RUNBOOK §1's pattern, same as
 * cache-images and authors).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetch } from "undici";
import { politeFetch } from "./http.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = resolve(ROOT, "data/creators");
const IMG_DIR = resolve(ROOT, "app/public/cached-images");

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
const save = (file: string, rows: string[][]) => {
  const tmp = file + ".tmp";
  writeFileSync(tmp, rows.map((r) => r.map(q).join(",")).join("\n") + "\n", "utf8");
  renameSync(tmp, file);
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const creators = parseCsv(readFileSync(resolve(DIR, "creators.csv"), "utf8"));
const channels = parseCsv(readFileSync(resolve(DIR, "creator_channel.csv"), "utf8"));
const iconsFile = resolve(DIR, "icons.csv");
const icons = parseCsv(readFileSync(iconsFile, "utf8"));

const handleOf = new Map(creators.slice(1).map((r) => [r[0]!, r[1]!]));
const domains = channels.slice(1).filter((r) => r[1] === "domain" && r[0] && r[2]);
const ytKnown = new Set(channels.slice(1).filter((r) => r[1] === "youtube").map((r) => r[0]));

/** The channel their own page names — @handle, /channel/UC…, or /user/…. */
const YT_LINK =
  /youtube\.com\/(@[\w.-]+|channel\/UC[\w-]{10,}|user\/[\w.-]+|c\/[\w.-]+)/i;

/** The channel page's own avatar declaration, upgraded to 900px. */
function avatarIn(html: string): string | null {
  const m = /"avatar":\{"thumbnails":\[\{"url":"([^"]+)"/.exec(html)
    ?? /<meta property="og:image" content="(https:\/\/yt3\.[^"]+)"/.exec(html);
  if (!m) return null;
  return m[1]!.replace(/=s\d+[^"]*/, "=s900-c-k-c0x00ffffff-no-rj");
}

mkdirSync(IMG_DIR, { recursive: true });
let found = 0, skippedBlocked = 0, noLink = 0;
const homepages = new Map<string, string>();

for (const [creatorId, , host] of domains) {
  const handle = handleOf.get(creatorId!) ?? creatorId!;

  const home = await politeFetch(`https://${host}/`);
  if (!home.ok) { skippedBlocked++; console.log(`  ${host}: blocked — site icon stays`); continue; }
  homepages.set(creatorId!, home.body);
  const link = YT_LINK.exec(home.body)?.[1];
  if (!link) { noLink++; console.log(`  ${host}: no YouTube link on the homepage`); continue; }

  const chUrl = `https://www.youtube.com/${link}`;
  const ch = await politeFetch(chUrl);
  const avatar = ch.ok ? avatarIn(ch.body) : null;
  if (!avatar) { console.log(`  ${host}: channel found (${link}) but no avatar parsed`); continue; }

  const res = await fetch(avatar, { headers: { "user-agent": UA } });
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok || buf.length < 1000) { console.log(`  ${host}: avatar fetch failed`); continue; }

  const file = `avatar-${handle}.jpg`;
  writeFileSync(resolve(IMG_DIR, file), buf);

  // icons.csv: this creator's row becomes the youtube avatar.
  const kept = icons.filter((r, i) => i === 0 || r[0] !== creatorId);
  kept.push([creatorId!, `/cached-images/${file}`, "youtube-avatar 900px"]);
  icons.length = 0; icons.push(...kept);

  // creator_channel.csv: the channel itself, an unverified crawl fact.
  if (!ytKnown.has(creatorId)) {
    channels.push([creatorId!, "youtube", link, ""]);
    ytKnown.add(creatorId);
  }
  found++;
  homepages.set(creatorId!, home.body);
  console.log(`  ${host}: ${link} → ${file} (${Math.round(buf.length / 1024)}KB)`);
}

/**
 * The same homepages name their Instagram and TikTok — harvested as channel
 * rows while we hold the HTML, because the header's icon row renders whatever
 * kinds the table knows and the table should know what the creator publishes.
 */
const SOCIALS: Array<[string, RegExp]> = [
  ["instagram", /instagram\.com\/([A-Za-z0-9_.]{2,30})\/?["'\/?#]/],
  ["tiktok", /tiktok\.com\/(@[A-Za-z0-9_.]{2,30})/],
];
const kindsKnown = new Set(channels.slice(1).map((r) => `${r[0]} ${r[1]}`));
let socials = 0;
for (const [creatorId, html] of homepages) {
  for (const [kind, re] of SOCIALS) {
    if (kindsKnown.has(`${creatorId} ${kind}`)) continue;
    const m = re.exec(html)?.[1];
    if (!m || /^(p|reel|explore|share|accounts|stories)$/i.test(m)) continue;
    channels.push([creatorId, kind, m, ""]);
    kindsKnown.add(`${creatorId} ${kind}`);
    socials++;
    console.log(`  + ${kind}: ${m}`);
  }
}
console.log(`${socials} social channel(s) harvested`);

save(iconsFile, icons);
save(resolve(DIR, "creator_channel.csv"), channels);
console.log(`\n${found} avatar(s) cached, ${noLink} homepages without a YouTube link, ${skippedBlocked} blocked`);
console.log("run npm run creator-icons afterwards only if you want site icons refreshed too — this sweep's rows win as written");
