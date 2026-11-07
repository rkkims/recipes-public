/**
 * The Creators place, entered without context — CREATORS-TAB-SPEC §2.
 *
 * Three things, in the order a visitor wants them: find someone (the search),
 * who you already follow (the list), and — for the few it addresses — the way
 * in ("Are you a creator?"). No `Shell`: the pantry drawer has no business
 * beside a directory of people, the same framing the standalone recipe page
 * chose.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Page } from "@/components/primitives";
import { Nav } from "@/components/Nav";
import { CreatorSearch } from "@/components/CreatorSearch";
import { currentUser } from "@/lib/owner";
import { followedCreators } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Creators · JipBap",
  description: "The people whose recipes fill JipBap: find them, follow them.",
};

export default async function Creators() {
  const user = await currentUser();
  const followed = await followedCreators();

  return (
    <Page>
      <Nav user={!!user} />
      {/* No visible title (the user's call, 2026-08-16): the tab is lit, the
          search box says what it searches, and the Nav's sr-only h1 already
          names the page for screen readers. */}
      <div className="creators-home" id="main">
        <CreatorSearch />

        {followed.length > 0 && (
          <section className="followed" aria-label="Creators you follow">
            <h3 className="creators-subhead">Following</h3>
            <ul className="followed-list">
              {followed.map((c) => (
                <li key={c.handle}>
                  <Link className="creator-hit" href={`/creators/${c.handle}`}>
                    {c.avatar && (
                      <img className={c.lowRes ? "creator-hit-face avatar-lowres" : "creator-hit-face"}
                           src={c.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    )}
                    <span className="creator-hit-name">{c.name}</span>
                    <span className="creator-hit-count">
                      {c.recipes.toLocaleString()} {c.recipes === 1 ? "recipe" : "recipes"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {/* An aside to most visitors and the door for a few — a text link at
            the bottom, never a button competing with the search (§2). */}
        <p className="creator-door">
          <Link href="/creators/start">Are you a creator?</Link>
        </p>
      </div>
    </Page>
  );
}
