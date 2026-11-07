"use client";

/**
 * The creator tables on the DEVICE — the client's `lib/creators.ts`.
 *
 * `creators.ts` reads four CSVs and a JSON map off disk and cannot run in a
 * browser; this reads the section `src/static/build-data.ts` generates from
 * those same files (`/static-data/creators.json`), so the two views cannot
 * disagree about who exists — only about breadth: the bundle holds the
 * creators with at least one recipe on the curated shelf, which is exactly the
 * set that has a page (STATIC-SPEC §3).
 *
 * What is deliberately NOT in here, and never will be: counts of anything a
 * person did. CREATOR-SPEC §7 forbids a dashboard, and the numbers these
 * surfaces DO show — how many of a creator's dishes this kitchen can cook
 * tonight — are computed from the device's own pantry against the shipped
 * shelf, so they are facts about one kitchen rather than about an audience.
 */

import { useEffect, useState } from "react";

export type ClientCreator = {
  id: string;
  handle: string;
  name: string;
  /** Other names the corpus knows them by — the search box reads these. */
  aliases: string[];
  /** The probed site icon or the claimant's own face; `low_res` draws small. */
  icon?: { url: string; low_res?: boolean };
  /** Their recipes that are ON the shelf. Ids only: the rows are in the
      recipe bundle already, and shipping them twice is how two shelves start
      to disagree about one dish. */
  recipe_ids: string[];
};

type CreatorsFile = { schema: number; creators: ClientCreator[] };

/* Module-level, like `client-data`'s cache: one fetch per page lifetime, and
   the PROMISE is cached rather than the value so two surfaces mounting at once
   share one request instead of racing two. */
let cache: ClientCreator[] | null = null;
let inflight: Promise<ClientCreator[]> | null = null;

export async function loadCreators(): Promise<ClientCreator[]> {
  if (cache) return cache;
  inflight ??= (async () => {
    const res = await fetch("/static-data/creators.json");
    if (!res.ok) throw new Error(`/static-data/creators.json: ${res.status}`);
    const file = (await res.json()) as CreatorsFile;
    cache = file.creators;
    return cache;
  })();
  try {
    return await inflight;
  } catch (e) {
    // A failed fetch must not poison every later call with the same rejection.
    inflight = null;
    throw e;
  }
}

/**
 * The creators, read in a MOUNT EFFECT for `useBundle`'s reason: the server has
 * no `fetch` result to render from, and `layout.tsx` removed
 * `suppressHydrationWarning`, so a render that guessed would produce markup
 * hydration cannot match. Null until it lands; the surface draws a skeleton.
 */
export function useCreators(): ClientCreator[] | null {
  const [rows, setRows] = useState<ClientCreator[] | null>(null);
  useEffect(() => {
    let live = true;
    void loadCreators()
      .then((r) => { if (live) setRows(r); })
      .catch((e) => console.warn("[creators] could not load the directory:", e));
    return () => { live = false; };
  }, []);
  return rows;
}

/**
 * Name, handle, or any alias — prefix hits first, then contained ones.
 *
 * The same three tests and the same ranking `searchCreators` applies on the
 * server (`app/creators/actions.ts`), over the same names. The corpus is a
 * dozen rows, so this is a scan there and a scan here.
 */
export function rankCreators(rows: ClientCreator[], q: string): ClientCreator[] {
  const term = q.trim().toLowerCase();
  if (!term) return [];
  return rows
    .map((c) => {
      const names = [c.name, c.handle, ...c.aliases].map((n) => n.toLowerCase());
      const rank = names.some((n) => n.startsWith(term)) ? 0
        : names.some((n) => n.includes(term)) ? 1 : -1;
      return { c, rank };
    })
    .filter((r) => r.rank >= 0)
    .sort((a, b) => a.rank - b.rank || a.c.name.localeCompare(b.c.name))
    .map(({ c }) => c)
    .slice(0, 8);
}
