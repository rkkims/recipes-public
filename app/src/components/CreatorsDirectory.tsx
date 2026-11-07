"use client";

/**
 * The Creators place, computed on the device — the static half of `/creators`.
 *
 * Three things, in the order a visitor wants them, exactly as the server page
 * has them (CREATORS-TAB-SPEC §2): find someone, who you already follow, and
 * the way in for the few it addresses. What moves is only WHERE each answer
 * comes from — the search ranks the bundle's own creator rows instead of
 * asking `searchCreators`, and Following reads `owner.follows` off the device
 * instead of `owners.json`.
 *
 * ── The one addition, and why a static site earns it ──────────────────────
 *
 * The server page lists nobody until you type: the corpus is 35 creators and
 * growing, so a directory would be a wall. The static site ships the curated
 * shelf only (§3), which is eleven people — few enough that the whole list IS
 * the answer, and a search box over a page you can already read costs nothing.
 * So the list is rendered under the search rather than instead of it.
 *
 * ── The number beside each name ───────────────────────────────────────────
 *
 * "N recipes" is a fact about the shelf and comes from the bundle. "M you can
 * cook now" is a fact about THIS kitchen and is computed here from the device's
 * pantry — the same `scoreRecipe` the grid runs, over the same rows. It is
 * absent until there is a pantry to compute it from, because "0 you can cook
 * now" on an empty kitchen reads as a verdict on the creator.
 *
 * Nothing here counts anything a person did (CREATOR-SPEC §7): there are no
 * followers, no views and no saves on this page, and the one number that moves
 * is about the reader's own fridge.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Note } from "./primitives";
import { expandComponents, scoreRecipe, type Recipe } from "@/lib/match";
import { pantryOf } from "@/lib/owner-core";
import { resolveId } from "@/lib/client-data";
import { rankCreators, useCreators, type ClientCreator } from "@/lib/client-creators";
import { useBundle, useOwner } from "@/lib/use-owner";

/** What each row says: the shelf's number, and this kitchen's. */
type Counts = { total: number; cookable: number };

export function CreatorsDirectory() {
  const { owner, ready } = useOwner();
  const bundle = useBundle();
  const creators = useCreators();
  const [q, setQ] = useState("");

  /* Scored once for every creator rather than once per keystroke: the pantry
     is the only input that moves, and it moves on a tick rather than on a
     letter. */
  const counts = useMemo(() => {
    const out = new Map<string, Counts>();
    if (!bundle || !creators || !ready) return out;
    const pantry = pantryOf(owner, resolveId);
    /* Folded against the whole shelf before slicing per creator — see
       `CreatorShelfLive` for why the filter comes after the fold. */
    const byId = new Map(
      expandComponents(bundle.recipes as Recipe[]).map((r) => [r.id, r]));
    for (const c of creators) {
      let cookable = 0;
      for (const id of c.recipe_ids) {
        const r = byId.get(id);
        if (r && scoreRecipe(r, pantry, bundle.relations).missing.length === 0) cookable++;
      }
      out.set(c.id, { total: c.recipe_ids.length, cookable });
    }
    return out;
  }, [bundle, creators, ready, owner]);

  /** Whether there is a kitchen to measure against at all — see the header. */
  const hasPantry = Object.values(owner?.ingredients ?? {}).some((r) => r.in_pantry);

  const followed = useMemo(() => {
    if (!creators) return [];
    const byId = new Map(creators.map((c) => [c.id, c]));
    return [...(owner?.follows ?? [])]
      // Newest follow first, the order the server list uses.
      .sort((a, b) => b.followed_at.localeCompare(a.followed_at))
      /* Resolved through the bundle, so a creator who withdrew between builds
         drops off this list the same day they drop off every other surface —
         `build-data.ts` never shipped them. */
      .map((f) => byId.get(f.creator_id))
      .filter((c): c is ClientCreator => !!c);
  }, [creators, owner]);

  if (!creators) return <p className="note">Reading the shelf…</p>;

  const hits = rankCreators(creators, q);

  const Row = ({ c }: { c: ClientCreator }) => {
    const n = counts.get(c.id);
    return (
      <li>
        <Link className="creator-hit" href={`/creators/${c.handle}`}>
          {c.icon && (
            <img className={c.icon.low_res ? "creator-hit-face avatar-lowres" : "creator-hit-face"}
                 src={c.icon.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
          )}
          <span className="creator-hit-name">{c.name}</span>
          <span className="creator-hit-count">
            {(n?.total ?? c.recipe_ids.length).toLocaleString()}{" "}
            {(n?.total ?? c.recipe_ids.length) === 1 ? "recipe" : "recipes"}
            {hasPantry && n && n.cookable > 0 &&
              ` · ${n.cookable.toLocaleString()} you can cook now`}
          </span>
        </Link>
      </li>
    );
  };

  return (
    <div className="creators-home" id="main">
      <div className="creator-search" role="search">
        <input type="search" value={q} placeholder="Search creators by name…"
               aria-label="Search creators"
               onChange={(e) => setQ(e.target.value)}
               onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }} />
        {q.trim() !== "" && (
          hits.length > 0
            ? <div className="creator-hits"><ul>{hits.map((c) => <Row key={c.handle} c={c} />)}</ul></div>
            : <p className="creator-hits-none">No creator by that name here yet.</p>
        )}
      </div>

      {followed.length > 0 && (
        <section className="followed" aria-label="Creators you follow">
          <h3 className="creators-subhead">Following</h3>
          <ul className="followed-list">
            {followed.map((c) => <Row key={c.handle} c={c} />)}
          </ul>
        </section>
      )}

      <section aria-label="All creators">
        <h3 className="creators-subhead">All creators</h3>
        <ul className="followed-list">
          {creators.map((c) => <Row key={c.handle} c={c} />)}
        </ul>
      </section>

      {/* The door the server page opens, held shut and said plainly — a claim
          is a write, and STATIC-SPEC §7b names this channel going read-only as
          the one real loss of the cutover. A link to `/creators/start` would go
          to a page the export does not contain. */}
      <Note>
        Claiming a page needs a server, so it is not part of this copy of
        JipBap. It returns with the API Worker.
      </Note>
    </div>
  );
}
