/*
 * ── the static route allowlist — STATIC-SPEC §3 ──────────────────────────────
 *
 * `/creators` is on the static site. In static mode `next.config.mjs` sets
 * `pageExtensions: ["static.tsx", "static.ts"]`, so Next recognises a route
 * only where one of these shims sits beside the real file; every other route in
 * `src/app` — `/curate`, `/api`, `/signin`, `/account`, `/export`,
 * `/user-images`, `/recipe-requests`, `/go`, and every claim surface under
 * `/creators/*` — is not skipped, it is never compiled.
 *
 * ── Why this one has a body where the others have two lines ────────────────
 *
 * `/list` and `/recipe/[id]` re-export their server page, which branches on
 * `STATIC` where it must. This page cannot: `page.tsx` reads the session and
 * calls `followedCreators()`, and its search box passes a SERVER ACTION to the
 * client (`searchCreators`), which Next refuses to compile into an export at
 * all. Branching all of that would leave a page whose every line is a
 * conditional, so the static answer is written out instead — and the swap is
 * still mechanical, because Next only ever compiles one of the two files.
 *
 * The two shells stay honest about the same thing: this page is a directory of
 * people, and everything on it that is about the READER (who they follow, what
 * their kitchen can cook) comes from the device — `CreatorsDirectory`.
 *
 * Inert in server mode: Next matches `page.<ext>` exactly, and this file's
 * basename is `page.static`.
 */
import type { Metadata } from "next";
import { Page } from "@/components/primitives";
import { Nav } from "@/components/Nav";
import { CreatorsDirectory } from "@/components/CreatorsDirectory";

export const metadata: Metadata = {
  title: "Creators · JipBap",
  description: "The people whose recipes fill JipBap: find them, follow them.",
};

export default function Creators() {
  return (
    <Page>
      {/* No session to report — a prerendered file has no request, and `Nav`
          says "On this device" in the corner rather than offering a sign-in
          link the export does not contain. */}
      <Nav user={false} />
      {/* No visible title (the user's call, 2026-08-16): the tab is lit, the
          search box says what it searches, and the Nav's sr-only h1 already
          names the page for screen readers. */}
      <CreatorsDirectory />
    </Page>
  );
}
