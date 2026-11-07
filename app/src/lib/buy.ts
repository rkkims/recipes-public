/**
 * Which node a recipe's buy link points at — RETAILER-SPEC §5.
 *
 * `detailRows` gives every missing requirement a `buyUrl` built from the
 * ingredient's display name. On a Korean recipe that wrote "rice", the honest
 * name is `rice` and the honest *shopping* answer is `short grain rice` —
 * RESOLUTION-SPEC §4's asymmetry, where matching stays loose and linking goes
 * strict. Linking off the generic node is the mismatch the identity layer
 * exists to refuse: "we don't pretend your ingredients are something else"
 * includes not pretending a generic mention is cuisine-less.
 *
 * ── Read, never compute ────────────────────────────────────────────────────
 *
 * The resolution table lives in `src/ontology/resolution.ts`, outside
 * `app/tsconfig.json`'s include, and it stays there. `npm run stamp-resolutions`
 * writes the answers to `data/ontology/resolutions.json` and this reads them.
 * That is §1's rule — stamped, not computed per query, because "a stored answer
 * is testable while an on-the-fly one is not" — and it is also the only version
 * that does not drag the pipeline across the module boundary.
 *
 * ── What it deliberately does not do ───────────────────────────────────────
 *
 * Flagged resolutions (the guk-ganjang doubt) change **no link**. A flag is
 * machine-derived doubt from a classifier-supplied dish type, and §3 is explicit
 * that it earns a review row and never a silent switch. They land in
 * `data/reports/resolution-flags.csv` instead.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DEFAULT_RETAILER } from "./retailers";

/** recipe id → written name → the leaf to shop for. */
type Moves = Record<string, Record<string, string>>;

let moves: Moves | null = null;

function load(): Moves {
  if (moves) return moves;
  moves = {};
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const f = resolve(dir, "data", "ontology", "resolutions.json");
    if (existsSync(f)) {
      try {
        moves = JSON.parse(readFileSync(f, "utf8")) as Moves;
      } catch {
        /* A malformed sidecar must never take a recipe page down. Linking from
           the written name is exactly the behaviour we had before it existed. */
      }
      break;
    }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return moves;
}

/**
 * A buy-url function bound to one recipe's context.
 *
 * Same shape `detailRows` already takes — `(name) => string | null` — so the
 * resolution rides in the closure and no signature changes. Callers that have
 * no recipe in hand (the pantry and the shopping list) keep using the retailer
 * directly: RESOLUTION-SPEC §6 settles that the pantry side stays generic and
 * is asked nothing.
 */
export function buyUrlForRecipe(recipeId: string): (name: string) => string | null {
  const forThis = load()[recipeId];
  const r = DEFAULT_RETAILER;
  return (name: string) => {
    const leaf = forThis?.[name];
    if (!leaf) return r.urlFor(name);

    const url = r.urlFor(leaf);
    /**
     * The shared-shelf case — settled 2026-08-17.
     *
     * `urlFor` prefers an aisle, which is right until the aisle is coarser than
     * what we know. Weee! files `rice` and `short grain rice` both under
     * `dried01/Rice`: 129 of the 174 stamped moves produced an identical URL, so
     * a correct resolution could not be expressed at all. When the leaf's link
     * is the generic's link, we ask for a search on the leaf instead — the one
     * surface that can say "short grain".
     *
     * Deliberately narrow. It fires only when the aisle demonstrably cannot
     * carry the distinction, so the 45 moves that DO reach a different shelf
     * keep the curated aisle, and an unresolved ingredient never sees this path.
     */
    if (url && url === r.urlFor(name)) return r.searchUrlFor(leaf) ?? url;
    return url;
  };
}

/** How many recipes carry at least one leaf move — the step 3 measurement. */
export const resolvedRecipeCount = () => Object.keys(load()).length;
