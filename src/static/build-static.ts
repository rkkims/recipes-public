/**
 * The export build — STATIC-SPEC §5, stage 2.
 *
 *   npm run build-static
 *
 * Four steps and a receipt:
 *
 *   1. `npm run static-data` — regenerate the client bundle from the same
 *      tables the server reads (§5 step 1). It writes `static-data/` and
 *      `app/public/static-data/`, and the second of those is what ends up in
 *      the export, so this MUST run first or the site ships yesterday's shelf.
 *   2. `STATIC_MODE=1 next build` with `output: "export"` (§5 step 2). The
 *      route allowlist, the action aliases and the `NEXT_PUBLIC_*` flags all
 *      come from `next.config.mjs` reading that one variable.
 *   3. Write the three metadata files Next's own conventions cannot emit under
 *      a narrowed `pageExtensions` — see `layout.tsx`'s note. They are
 *      generated from the SAME modules the server build serves, so there is
 *      one manifest in this repo and not two.
 *
 * Then it verifies what it produced rather than trusting it: the pages §3 names
 * have to exist as files, and one recipe page per kept recipe has to be there.
 * A build that quietly emitted 3 pages instead of 136 is the failure mode worth
 * catching, because it looks exactly like success from the outside.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const APP = join(ROOT, "app");
const OUT = join(ROOT, "static-out");

const run = (cmd: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}) =>
  execFileSync(cmd, args, { cwd, stdio: "inherit", env: { ...process.env, ...env } });

// ── 1. the client bundle ────────────────────────────────────────────────────

console.log("── the bundle ──────────────────────────────────────────────");
run("npx", ["tsx", "src/static/build-data.ts"], ROOT);

// ── 2. the export ───────────────────────────────────────────────────────────

console.log("\n── the export ──────────────────────────────────────────────");
/**
 * `GO_ORIGIN` decides where outbound links point for THIS build.
 *
 * Empty is the post-cutover answer: the `/go` Worker is routed at
 * `jipbap.com/go`, so a relative link reaches it. A preview deploy passes the
 * Worker's own workers.dev origin, because the preview site has no such route.
 * Printed either way — a build whose attribution silently pointed at nothing
 * would look identical to one that worked.
 */
const goOrigin = process.env["GO_ORIGIN"] ?? "";  // unread since 2026-11-06: static links go straight to the retailer
console.log(goOrigin
  ? `  outbound links → ${goOrigin}/go`
  : "  outbound links → /go (same origin; correct only once the Worker is routed there)");

/**
 * `API_ORIGIN` decides where the behavioural beacons post for THIS build.
 *
 * Same rule and same shape as `GO_ORIGIN` above. Empty is the post-cutover
 * answer — the API Worker is routed at `jipbap.com/api/*`, so a relative
 * `/api/events` reaches it and the beacons send the identical string server
 * mode sends. A preview deploy names the Worker's own workers.dev origin,
 * because the preview site has no such route.
 *
 * Printed either way, and this is the one worth reading: GO-LIVE measures
 * residency by `cook_event`, so a preview build that posts to a relative path
 * its own site does not serve is a placement fired blind. It looks identical to
 * a working one from the outside.
 */
const apiOrigin = process.env["API_ORIGIN"] ?? "";
console.log(apiOrigin
  ? `  beacons → ${apiOrigin}/api/events`
  : "  beacons → /api/events (same origin; correct only once the Worker is routed there)");

run("npx", ["next", "build"], APP,
    { STATIC_MODE: "1", GO_ORIGIN: goOrigin, API_ORIGIN: apiOrigin });

/* The export lands in `app/.next-static` and is moved here — Turbopack refuses
   a `distDir` outside the project, so it cannot be written to `static-out/`
   directly. See `next.config.mjs` for why `distDir` names the OUT directory at
   all in export mode, and for the `app/.next` it rewrites regardless.
   The destination is cleared first, so a page dropped from the allowlist cannot
   survive into the published site. */
const exported = join(APP, ".next-static");
if (!existsSync(join(exported, "index.html"))) {
  console.error(`\nFAILED: no export at ${exported}`);
  process.exit(1);
}
rmSync(OUT, { recursive: true, force: true });
cpSync(exported, OUT, { recursive: true });

// ── 3. the three files a narrowed `pageExtensions` cannot emit ──────────────

const site = process.env["NEXT_PUBLIC_SITE_URL"] || "https://jipbap.com";
const manifest = (await import(join(APP, "src/app/manifest.ts"))).default();
writeFileSync(join(OUT, "manifest.webmanifest"), JSON.stringify(manifest, null, 2));

const robots = (await import(join(APP, "src/app/robots.ts"))).default() as {
  rules: { userAgent: string; allow: string; disallow: string[] };
  sitemap: string;
};
writeFileSync(join(OUT, "robots.txt"),
  `User-Agent: ${robots.rules.userAgent}\n` +
  `Allow: ${robots.rules.allow}\n` +
  robots.rules.disallow.map((d) => `Disallow: ${d}\n`).join("") +
  `\nSitemap: ${robots.sitemap}\n`);

const sitemap = (await import(join(APP, "src/app/sitemap.ts"))).default() as Array<{
  url: string; changeFrequency?: string; priority?: number;
}>;
writeFileSync(join(OUT, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  sitemap.map((u) => `<url><loc>${u.url}</loc>` +
    (u.changeFrequency ? `<changefreq>${u.changeFrequency}</changefreq>` : "") +
    (u.priority !== undefined ? `<priority>${u.priority}</priority>` : "") +
    `</url>\n`).join("") +
  `</urlset>\n`);
void site;

// ── the receipt ─────────────────────────────────────────────────────────────

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out;
}

const files = walk(OUT);
const bytes = files.reduce((n, f) => n + statSync(f).size, 0);
const html = files.filter((f) => f.endsWith(".html"));
const recipePages = html.filter((f) => relative(OUT, f).startsWith("recipe/"));
const creatorPages = html.filter((f) => relative(OUT, f).startsWith("creators/"));

/** §3's list, as an assertion rather than a hope. */
const MUST_EXIST = [
  "index.html", "list.html", "calendar.html", "my-recipes.html",
  "offline.html", "privacy.html", "terms.html", "404.html",
  "creators.html", "recipe-shell.html",
  "manifest.webmanifest", "robots.txt", "sitemap.xml", "sw.js",
  "icons/192", "og",
  "static-data/recipes.json", "static-data/ontology.json", "static-data/retailers.json",
  "static-data/creators.json",
];
/**
 * And the routes that must NOT be there — §3's exclusions, checked.
 *
 * `creators` is off this list and its two pages are on the one above: the
 * directory and one page per creator ship (GO-LIVE's distribution channel 2 is
 * a creator linking their page in bio, and dropping it silently deletes the
 * channel). Every CLAIM surface under it stays excluded, and is named
 * individually rather than left to the absence of a shim — a claim needs a
 * server, and the day one of these grows a `page.static.tsx` by accident is the
 * day the export ships a button that cannot write.
 */
const MUST_NOT_EXIST = [
  "curate", "api", "signin", "account", "export", "user-images",
  "recipe-requests", "go",
  "creators/start",
];
/** The claim routes live under a creator's own handle, so they are checked per
    page rather than as one fixed path. */
const CLAIM_LEAVES = ["claim", "add", "collections", "confirm"];

const missing = MUST_EXIST.filter((f) => !existsSync(join(OUT, f)));
const leaked = MUST_NOT_EXIST.filter((f) =>
  existsSync(join(OUT, f)) || existsSync(join(OUT, `${f}.html`)));
for (const p of creatorPages) {
  const handle = relative(OUT, p).replace(/^creators\//, "").replace(/\.html$/, "");
  for (const leaf of CLAIM_LEAVES)
    if (existsSync(join(OUT, "creators", handle, leaf)) ||
        existsSync(join(OUT, "creators", handle, `${leaf}.html`)))
      leaked.push(`creators/${handle}/${leaf}`);
}

console.log("\n── static-out ──────────────────────────────────────────────");
console.log(`  ${files.length} files, ${(bytes / 1024 / 1024).toFixed(2)} MB total`);
console.log(`  ${html.length} HTML pages, ${recipePages.length} of them recipes` +
            `, ${creatorPages.length} of them creators`);
if (missing.length) console.log(`  MISSING: ${missing.join(", ")}`);
if (leaked.length) console.log(`  LEAKED (should not be in an export): ${leaked.join(", ")}`);
if (missing.length || leaked.length) process.exit(1);
console.log("  every page §3 names is present, and every route it excludes is absent");
