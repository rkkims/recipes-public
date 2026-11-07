/*
 * ── the static route allowlist — STATIC-SPEC §3 ──────────────────────────────
 *
 * `/list` is on the static site, and this two-line file is the whole of
 * saying so. In static mode `next.config.mjs` sets
 * `pageExtensions: ["static.tsx", "static.ts"]`, so Next recognises a route
 * only where one of these shims sits beside the real file; every other route
 * in `src/app` — `/curate`, `/api`, `/signin`, `/account`, `/export`,
 * `/user-images`, `/recipe-requests`, `/go`, the creator pages — is not
 * skipped, it is never compiled.
 *
 * §3 asks for exactly this: *"Exclusion is mechanical: export mode builds from
 * a route allowlist, not by hoping nothing dynamic slipped in."* Forgetting to
 * exclude something is not a mistake this arrangement can make; the only
 * mistake available is forgetting to INCLUDE something, which shows up as a
 * 404 on the first click.
 *
 * Inert in server mode: Next matches `page.<ext>` exactly, and this file's
 * basename is `page.static`.
 */
export * from "./page";
export { default } from "./page";
