/**
 * Two artifacts, one tree — STATIC-SPEC §1.
 *
 * Absent `STATIC_MODE`, everything below the flag is inert and the server build
 * is byte-for-byte the build it has always been. With it, three things change
 * and nothing else does:
 *
 *   1. `output: "export"` — a self-contained site, no Node process behind it.
 *   2. `pageExtensions` — **the route allowlist**, mechanically. §3 asks for
 *      exclusion by allowlist rather than "by hoping nothing dynamic slipped
 *      in", and this is that: in static mode Next only recognises a route
 *      whose file is `page.static.tsx` / `route.static.ts`, so `/curate`,
 *      `/api`, `/signin`, `/account`, `/export`, `/user-images`,
 *      `/recipe-requests`, `/go` and every claim surface under
 *      `/creators/*` are not merely skipped, they are never compiled.
 *      The two creator pages that DO ship carry their own shims and their own
 *      bodies — see `creators/page.static.tsx`. Adding a route to the static site is one
 *      two-line shim; forgetting to exclude one is not possible.
 *      In server mode the shims are inert: Next matches `page.<ext>` exactly,
 *      and `page.static.tsx`'s basename is `page.static`, which is not `page`.
 *   3. `resolveAlias` — `@/app/actions` and `@/app/shelf-actions` become their
 *      client-side stand-ins. An exported site cannot POST to a server action
 *      (Next refuses the export outright if one is compiled at all), so the
 *      modules that carry `"use server"` are swapped for `"use client"` modules
 *      of the same shape. See `lib/actions-static.ts` for what each one answers.
 */
const STATIC = process.env.STATIC_MODE === "1";

/** @type {import('next').NextConfig} */
export default {
  // This repo's root holds the offline pipeline; the app is a nested package.
  turbopack: {
    root: import.meta.dirname,
    ...(STATIC ? {
      resolveAlias: {
        "@/app/actions": "./src/lib/actions-static.ts",
        "@/app/shelf-actions": "./src/lib/shelf-actions-static.ts",
        "@/app/creators/actions": "./src/lib/creators-actions-static.ts",
        "@/components/CreatorUpLink": "./src/lib/CreatorUpLink-static.tsx",
      },
    } : {}),
  },
  /**
   * Where the build output goes, overridable per process.
   *
   * The reviewer's browser sits on `:5173` reading `.next` for hours at a time,
   * and every `next build` rewrites that directory in place — minting a new
   * BUILD_ID, 404ing the chunks their open tab already has, and killing the page
   * mid-session. It has happened repeatedly.
   *
   * With this, development builds go somewhere else entirely
   * (`NEXT_DIST_DIR=.next-dev`) and the served build is only replaced when
   * someone deliberately builds into it. Same code, two outputs, no collision.
   */
  /**
   * In static mode this names the EXPORT's destination, not the build's.
   *
   * Next reads it that way on purpose: with `output: "export"` and a custom
   * `distDir`, it takes `distDir` as the out directory and forces the
   * intermediate artifacts back to `.next` (`build/index.js`'s
   * `hasCustomExportOutput`). Turbopack then refuses anything outside the
   * project, so the finished site lands here and `build-static` moves it to
   * `static-out/`, which is where `deploy/cloudflare/wrangler-site.toml` looks.
   *
   * The consequence is worth knowing: a static build DOES rewrite `app/.next`,
   * whatever this says, and there is no configuration that stops it. The served
   * build is `.next-prod` (`deploy/deploy.sh`) so a deploy is safe, but a
   * reviewer sitting on `:5173` against `.next` will have their session pulled
   * out from under them — the very thing the override below exists to prevent,
   * in the one mode that cannot honour it.
   */
  distDir: process.env.NEXT_DIST_DIR || (STATIC ? ".next-static" : ".next"),
  // TypeScript 7 ships a native compiler without the API Next expects. The CLI
  // path is equivalent for our purposes and `npx tsc --noEmit` runs in CI anyway.
  experimental: { useTypeScriptCli: true },
  ...(STATIC ? {
    output: "export",
    /* The allowlist. Both extensions are needed: pages and layouts are `.tsx`,
       the metadata routes (`manifest`, `robots`, `sitemap`) are `.ts`. */
    pageExtensions: ["static.tsx", "static.ts"],
    /* An exported site has no request to redirect, so a bare `/list` must be a
       FILE. Directory-with-index is what Workers Assets serves cleanly for
       both `/list` and `/list/`. */
    trailingSlash: false,
    /* The flag, carried across the RSC boundary — see `lib/static-mode.ts`.
       Declared here rather than left to the shell so that one variable
       (`STATIC_MODE`) decides the whole build. */
    env: {
      NEXT_PUBLIC_STATIC_MODE: "1",
      /* Which origin the outbound links point at for this build. Empty is the
         post-cutover answer (`jipbap.com/go` is the Worker's own route); a
         preview deploy passes the Worker's workers.dev origin. */
      NEXT_PUBLIC_GO_ORIGIN: process.env.GO_ORIGIN || "",
      /* And where the behavioural beacons post. Same rule, same shape: empty
         means the API Worker is routed at `jipbap.com/api/*` and a relative
         `/api/events` reaches it; a preview deploy names the Worker's own
         workers.dev origin. See `lib/beacon.ts`. */
      NEXT_PUBLIC_API_ORIGIN: process.env.API_ORIGIN || "",
    },
  } : {}),
};
