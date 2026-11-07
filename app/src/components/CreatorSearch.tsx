"use client";

/**
 * The Creators tab's search — CREATORS-TAB-SPEC §2.
 *
 * One input, centered, and suggestions under it as you type: avatar, name,
 * and how many recipes we hold of theirs — the number that says whether the
 * page is worth opening before it is opened. No avatar means just the name;
 * an empty disc would be a placeholder pretending to be a face.
 *
 * Two groups when both exist: who you follow first, then everyone else. Same
 * query, no duplicates — the split is the server's (`searchCreators`).
 *
 * Choosing navigates — the suggestion IS the creator's page, so the whole row
 * is one link, keyboard-reachable like any other. Nothing here is a modal and
 * nothing traps focus: Escape only empties the box.
 */
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { searchCreators, type CreatorHit } from "@/app/creators/actions";

export function CreatorSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ following: CreatorHit[]; others: CreatorHit[] }>(
    { following: [], others: [] });
  const [, start] = useTransition();
  /* Only the newest request may speak — a slow reply for "ma" must not land
     over the results for "maangchi". */
  const stamp = useRef(0);

  const ask = (value: string) => {
    setQ(value);
    const mine = ++stamp.current;
    if (!value.trim()) { setHits({ following: [], others: [] }); return; }
    start(async () => {
      try {
        const r = await searchCreators(value);
        if (stamp.current === mine) setHits(r);
      } catch { /* typing is not the moment */ }
    });
  };

  const open = (handle: string) => router.push(`/creators/${handle}`);

  const Row = ({ h }: { h: CreatorHit }) => (
    <li>
      <button type="button" className="creator-hit" onClick={() => open(h.handle)}>
        {h.avatar && (
          <img className={h.lowRes ? "creator-hit-face avatar-lowres" : "creator-hit-face"}
               src={h.avatar} alt="" loading="lazy" referrerPolicy="no-referrer" />
        )}
        <span className="creator-hit-name">{h.name}</span>
        <span className="creator-hit-count">
          {h.recipes.toLocaleString()} {h.recipes === 1 ? "recipe" : "recipes"}
        </span>
      </button>
    </li>
  );

  const any = hits.following.length > 0 || hits.others.length > 0;

  return (
    <div className="creator-search" role="search">
      <input type="search" value={q} placeholder="Search creators by name…"
             aria-label="Search creators"
             onChange={(e) => ask(e.target.value)}
             onKeyDown={(e) => { if (e.key === "Escape") ask(""); }} />
      {any && (
        <div className="creator-hits">
          {hits.following.length > 0 && (
            <>
              <p className="creator-hits-head">Following</p>
              <ul>{hits.following.map((h) => <Row key={h.handle} h={h} />)}</ul>
            </>
          )}
          {hits.others.length > 0 && (
            <>
              {hits.following.length > 0 &&
                <p className="creator-hits-head">All creators</p>}
              <ul>{hits.others.map((h) => <Row key={h.handle} h={h} />)}</ul>
            </>
          )}
        </div>
      )}
      {!any && q.trim().length > 1 && (
        <p className="creator-hits-none">No creator by that name here yet.</p>
      )}
    </div>
  );
}
