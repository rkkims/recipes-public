/*
 * ── the static route allowlist — STATIC-SPEC §3 ──────────────────────────────
 *
 * `/creators/[handle]` is on the static site, one prerendered file per creator
 * with a recipe on the shelf. In static mode `next.config.mjs` sets
 * `pageExtensions: ["static.tsx", "static.ts"]`, so Next recognises a route
 * only where one of these shims sits beside the real file; the claim surfaces
 * under this directory — `claim`, `add`, `collections`, `confirm/[id]` — have
 * no shim and are therefore never compiled.
 *
 * ── Why this one has a body ────────────────────────────────────────────────
 *
 * The server page is a claim console as much as a shelf: it reads the session,
 * layers the claimant's collections and hidden rows over the corpus, hands a
 * SERVER ACTION to its search box (`suggestTitles`) and sorts one of its four
 * orders by a cross-owner save aggregate. Next refuses to export a build that
 * contains a server action at all, and the rest of that list needs a request or
 * a filesystem. Re-exporting it and branching every line on `STATIC` would
 * leave neither page readable, so the static answer is written out — and the
 * swap is still mechanical, because Next only ever compiles one of the two.
 *
 * ── What is real HTML here, and what waits for the device ─────────────────
 *
 * The SHELL is prerendered: who this creator is, their face, the row of links
 * to where they actually live. That is what a link in a bio needs to land on,
 * and it is a fact about the corpus rather than about the reader.
 *
 * The SHELF is the device's (`CreatorShelfLive`), and so is the follow pill:
 * how far this kitchen is from each dish, what is saved, and whether you
 * follow them are all owner state, which lives in `localStorage` now
 * (STATIC-SPEC §2). The page renders once for everyone and means something
 * different in every browser, which is the whole shape of the inversion.
 *
 * `robots: noindex` for the same reason the server page sets it — CREATOR-SPEC
 * §8 leaves pre-claim indexing open, and flipping it should be deliberate.
 *
 * Inert in server mode: Next matches `page.<ext>` exactly, and this file's
 * basename is `page.static`.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Page, Note } from "@/components/primitives";
import { Nav } from "@/components/Nav";
import { BackLink } from "@/components/BackLink";
import { CreatorLinks } from "@/components/CreatorLinks";
import { CreatorFollow, CreatorShelfLive } from "@/components/CreatorShelfLive";
import { avatarOf, creatorByHandle, creatorOfRecipe, linksOf } from "@/lib/creators";
import { load } from "@/lib/data";

/**
 * One page per creator with at least one KEPT recipe — the bundle's shelf.
 *
 * `load().recipes` IS that shelf: `lib/data`'s gate drops anything without a
 * keep verdict and anything whose component was not kept, which is the same
 * rule and the same two lines `src/static/build-data.ts` applies when it writes
 * `static-data/creators.json`. So the pages this emits and the rows the device
 * holds are the same set by construction, and a byline can never point at a
 * creator with no page.
 *
 * A creator with nothing on the shelf gets nothing: `creatorOfRecipe` already
 * returns null for the withdrawn and the removed (CREATOR-SPEC §6/§6a), so
 * they are absent here for the same reason they are absent everywhere else.
 */
export function generateStaticParams() {
  const handles = new Set<string>();
  for (const r of load().recipes) {
    const c = creatorOfRecipe(r.id);
    if (c) handles.add(c.handle);
  }
  return [...handles].map((handle) => ({ handle }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ handle: string }> },
): Promise<Metadata> {
  const { handle } = await params;
  const creator = creatorByHandle(handle);
  if (!creator) return { title: "Creator not found" };
  return {
    title: `${creator.displayName} · JipBap`,
    description:
      `${creator.displayName}'s recipes on JipBap: see which ones you can ` +
      `cook from what's already in your kitchen.`,
    robots: { index: false },
  };
}

export default async function CreatorPage(
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const creator = creatorByHandle(handle);
  if (!creator) notFound();
  const icon = avatarOf(creator.id);

  return (
    <Page>
      <Nav user={false} />
      {/* Reached from the creators tab, and also from the way-back-up link on a
          recipe — that second path had no way back to the recipe it came from.
          `/creators` is the fallback, which is where the tab would land you. */}
      <p className="page-backline">
        <BackLink href="/creators" />
      </p>

      <h1 className="page-title creator-title" id="main">
        {icon && (
          /* The probed icon, not /favicon.ico — the one favicon fallback draws
             SMALL (the reviewer's rule: no high resolution, no big circle),
             because a stretched 16px icon reads as a broken image with
             ambitions. */
          <img className={icon.lowRes ? "avatar-lowres" : undefined}
               src={icon.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
        )}
        {creator.displayName}
        <CreatorLinks name={creator.displayName} links={linksOf(creator.id)} />
        {/* Beside the platform icons, the same slot the server page gives it.
            Device state, so it draws nothing until the store has answered. */}
        <CreatorFollow handle={creator.handle} creatorId={creator.id}
                       name={creator.displayName} />
      </h1>

      <CreatorShelfLive handle={creator.handle} />

      {/* The claim invite, held shut and said plainly rather than pointed at a
          page the export does not contain — STATIC-SPEC §7b names this channel
          going read-only as the one real loss of the cutover, so it is said
          here where the person it is about would look for it. */}
      <Note>
        Claiming this page needs a server, so it is not part of this copy of
        JipBap. It returns with the API Worker.
      </Note>
    </Page>
  );
}
