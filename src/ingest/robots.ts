/**
 * robots.txt, parsed by user-agent group.
 *
 * This module exists because getting it wrong is easy and consequential.
 * During evaluation, grepping `Disallow` lines without their `User-agent:`
 * context showed `Disallow: /` for maangchi.com and justonecookbook.com — which
 * reads as "site forbids all crawling". Those rules belong to AI-crawler groups
 * (GPTBot and friends). The `*` group on maangchi.com disallows only
 * /post-comments. Two sources were nearly written off over a parsing bug.
 *
 * So: always resolve the group that applies to us, never the union of all lines.
 */
import { politeFetch } from "./http.js";

export type Robots = {
  /** Disallow paths applying to `User-agent: *`. */
  disallow: string[];
  allow: string[];
  fetched: boolean;
};

export function parseRobots(txt: string, agent = "*"): Robots {
  const groups = new Map<string, { allow: string[]; disallow: string[] }>();
  let current: string[] = [];
  let inGroup = false;

  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim() ?? "";
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === "user-agent") {
      // Consecutive user-agent lines share one rule block.
      if (inGroup) current = [];
      current.push(value.toLowerCase());
      inGroup = false;
      for (const a of current) if (!groups.has(a)) groups.set(a, { allow: [], disallow: [] });
      continue;
    }
    if (key !== "allow" && key !== "disallow") continue;
    inGroup = true;
    for (const a of current) {
      const g = groups.get(a);
      if (!g) continue;
      // An empty Disallow means "allow everything" — not a path.
      if (key === "disallow" && value === "") continue;
      g[key].push(value);
    }
  }

  const g = groups.get(agent.toLowerCase()) ?? groups.get("*");
  return { disallow: g?.disallow ?? [], allow: g?.allow ?? [], fetched: true };
}

/** Longest-match wins, Allow beats Disallow at equal length. */
export function isAllowed(path: string, robots: Robots): boolean {
  const match = (pattern: string): number => {
    // Support the `*` wildcard and `$` anchor that real robots files use.
    const rx = new RegExp(
      "^" +
        pattern
          .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
          .replace(/\*/g, ".*")
          .replace(/\\\$$/, "$"),
    );
    return rx.test(path) ? pattern.length : -1;
  };
  const d = Math.max(-1, ...robots.disallow.map(match));
  const a = Math.max(-1, ...robots.allow.map(match));
  return a >= d;
}

export async function loadRobots(origin: string, residential = false): Promise<Robots> {
  const res = await politeFetch(`${origin}/robots.txt`, { delayMs: 500, retries: 1, residential });
  if (!res.ok) return { disallow: [], allow: [], fetched: false };
  return parseRobots(res.body);
}
