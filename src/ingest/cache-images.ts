/**
 * Mirror recipe photographs whose hosts block us — served from our own disk.
 *
 *   npm run cache-images                       # the known-blocked hosts
 *   npm run cache-images -- --host example.com # a specific host
 *
 * futuredish serves its images from behind a SiteGround challenge that screens
 * every datacentre IP (check-images.ts documents it; a full Chromium from this
 * box gets "Robot Challenge Screen"). Real visitors' browsers usually pass —
 *
 * — and that last clause is now doubtful. Re-measured 2026-08-20 (RECIPE-SPEC
 * §1a): a hard 403 keyed on the USER-AGENT, refusing Chrome and permitting
 * Safari and curl from the very same IP. If it is the agent rather than the
 * address then "real visitors' browsers usually pass" is false for most of the
 * web, and this mirror stops being a nicety. It does not change what this
 * script does; it raises how much it matters.
 * but hotlinked images ride OUR page with THEIR host, and any visitor the
 * challenge does not like sees a creator's shelf full of grey boxes. Caching
 * makes the page's photographs load from the page's own origin.
 *
 * Posture: DECISIONS §6 allows thumbnail use with attribution; a cached copy
 * is the same thumbnail with a different address, still attributed, still
 * linking out. It is still one step further than hotlinking — which is why
 * this mirrors only named hosts, not the corpus.
 *
 * Mechanics that matter:
 *   - RAW BYTES via undici's arrayBuffer — politeFetch returns a string body,
 *     and an image decoded through utf8 is corruption with extra steps.
 *   - Magic numbers verified (JPEG/PNG/WebP/GIF); an HTML challenge page can
 *     never become a "photograph".
 *   - Files land in app/public/cached-images/ (GITIGNORED — hundreds of
 *     images do not belong in history); the manifest
 *     data/images/cached.json IS tracked, and recipe-index reads it to
 *     rewrite image URLs to local paths.
 *
 * From this VM the blocked hosts will verify zero images — that is the
 * verification working. Run it from the home machine (RUNBOOK §1's pattern),
 * copy the folder and the manifest back, then npm run recipe-index and
 * rebuild.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetch } from "undici";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const IMG_DIR = resolve(ROOT, "app/public/cached-images");
const MANIFEST = resolve(ROOT, "data/images/cached.json");

/** Hosts whose images are known to be challenge-walled or flaky for some
    visitors. Maangchi joined futuredish on the reviewer's report of photos
    that "are not always fetched" — the same host that serves empty 200s for
    its icons. */
const DEFAULT_HOSTS = ["futuredish.com", "maangchi.com"];

const hostArgs = process.argv
  .flatMap((a, i, all) => (a === "--host" && all[i + 1] ? [all[i + 1]!] : []));
const HOSTS = hostArgs.length ? hostArgs : DEFAULT_HOSTS;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const TYPES: Array<[RegExp, string]> = [
  [/^\xFF\xD8\xFF/, "jpg"],
  [/^\x89PNG/, "png"],
  [/^GIF8/, "gif"],
  [/^RIFF....WEBP/s, "webp"],
];

function kindOf(buf: Buffer): string | null {
  const head = buf.subarray(0, 16).toString("latin1");
  for (const [re, ext] of TYPES) if (re.test(head)) return ext;
  return null;
}

const idx = JSON.parse(
  readFileSync(resolve(ROOT, "data/ontology/recipe-index.json"), "utf8"),
) as { recipes: Array<{ image?: string }> };

const manifest: Record<string, string> = existsSync(MANIFEST)
  ? JSON.parse(readFileSync(MANIFEST, "utf8"))
  : {};

const wanted = [...new Set(
  idx.recipes
    .map((r) => r.image)
    .filter((u): u is string => !!u && !u.startsWith("/"))
    .filter((u) => { try { return HOSTS.some((h) => new URL(u).host.endsWith(h)); } catch { return false; } })
    .filter((u) => !manifest[u]),
)];

console.log(`${wanted.length} image(s) to fetch across ${HOSTS.join(", ")}`);
mkdirSync(IMG_DIR, { recursive: true });

let ok = 0, challenged = 0, failed = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
for (const url of wanted) {
  await sleep(400); // polite: one host, sequential, sub-3rps
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "image/*,*/*" } });
    const buf = Buffer.from(await res.arrayBuffer());
    const ext = res.ok ? kindOf(buf) : null;
    if (!ext) { challenged++; continue; }   // HTML challenge, empty 200, junk
    const name = createHash("sha256").update(url).digest("hex").slice(0, 16) + "." + ext;
    writeFileSync(resolve(IMG_DIR, name), buf);
    manifest[url] = `/cached-images/${name}`;
    ok++;
    if (ok % 25 === 0) console.log(`  … ${ok} cached`);
  } catch { failed++; }
}

mkdirSync(dirname(MANIFEST), { recursive: true });
const tmp = MANIFEST + ".tmp";
writeFileSync(tmp, JSON.stringify(manifest, null, 0) + "\n", "utf8");
renameSync(tmp, MANIFEST);

console.log(`cached ${ok}, challenged/junk ${challenged}, network-failed ${failed}`);
console.log(`manifest: ${Object.keys(manifest).length} total → ${MANIFEST}`);
if (challenged > 0 && ok === 0)
  console.log("everything challenged — run this from the home machine and copy app/public/cached-images/ and the manifest back");
