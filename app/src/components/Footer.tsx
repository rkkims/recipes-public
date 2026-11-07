/**
 * The site footer — the legal documents, and the standing affiliate disclosure.
 *
 * ── Why the disclosure is here as well as on the block ─────────────────────
 *
 * `BuyBlock` carries its own line, right against the links it is about, because
 * that is what "clear and conspicuous" means: a disclosure two screens away from
 * the link it describes is not one. This is the other half — the site-level
 * statement, on every page, for the reader who wants to know how jipbap is paid
 * before they have seen a single link.
 *
 * It is deliberately a fact rather than an apology. We take a commission on some
 * grocery links and nothing about the ranking is for sale (TERMS §6); both
 * halves of that are worth saying, and the second one is the one people actually
 * want to know.
 *
 * ── In the layout, so nothing has to remember it ───────────────────────────
 *
 * `Shell` is not on every page — `/recipe/[id]` has none, and it is exactly the
 * page a stranger arrives on from a search result or a shared link. Putting this
 * in the root layout means every route has it, including the legal documents
 * themselves and the offline page.
 */
import Link from "next/link";
import { listed } from "@/lib/surface";
import { STATIC } from "@/lib/static-mode";

export function Footer() {
  return (
    <footer className="sitefoot">
      {/*
        The disclosure, and nothing beyond it.

        This used to add "nothing you are shown is paid for; recipes are ranked
        by what is in your pantry and by nothing else". True today, and a
        PROMISE — one that a sponsored shelf or a paid placement would turn into
        a statement we had already made to everyone who read this page. That is
        an FTC deception problem rather than a copy change, so the commitment
        comes out while it is still cheap to remove.

        What stays is the fact, because the fact is required: a material
        connection between us and a link has to be disclosed, and the disclosure
        does not depend on how we rank anything.
      */}
      {/*
        The claim and the mechanism, in that order and in one breath.

        "Free" on its own is what every site says before it is not. What
        makes it believable is the second half: somebody else is paying, and
        here is who. That is also why this is a safer promise than the
        ranking one that used to sit here — a consumer subscription is not a
        path we are keeping open and quietly hoping to take, it is rejected
        in BUSINESS-REVIEW §10 on the merits, and every model still on the
        table charges a grocer or a platform rather than a cook.
      */}
      {/* The promise and the way it is paid for are two claims, not one
          sentence pair — so they get a line each, and the second is not read
          as a qualification tucked onto the end of the first. */}
      <p>
        <b>JipBap is free, permanently, for everyone.</b> There is no
        subscription and there never will be.
        <br />
        Some grocery links earn us a commission, and that is how it is paid for.
      </p>
      <p className="sitefoot-links">
        {listed("/recipe-requests") && (
          <>
            <Link href="/recipe-requests">Recipes people want</Link>
            {" · "}
          </>
        )}
        <Link href="/privacy">Privacy</Link>
        {" · "}
        <Link href="/terms">Terms</Link>
        {!STATIC && " · "}
        {/* The way out of the data, named where someone looking for it would
            look. It is a route rather than an action so the browser saves it as
            a file — see `app/export/route.ts`.

            Not in static mode: `/export` reads `owners.json` and there is no
            owners.json, so the link would be a 404 sitting under the words
            "Export your data" — the worst possible place for a dead link. The
            kitchen is in this browser's own storage on a static site, and the
            device-held export/import that replaces this is stage 1's, not
            wired to a control yet (STATIC-SPEC §2). Named here rather than
            silently dropped, so the gap is findable. */}
        {!STATIC && <a href="/export">Export your data</a>}
      </p>
    </footer>
  );
}
