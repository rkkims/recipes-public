/**
 * Stamp variant resolutions onto the corpus — RESOLUTION-SPEC §6, RETAILER-SPEC §5.
 *
 *   npm run stamp-resolutions
 *
 * `resolution.ts` answers which sibling a generic mention means. This writes
 * that answer down, per recipe, so the app can **read** it rather than compute
 * it — §1's rule, and the reason is not performance: "a stored answer is
 * testable while an on-the-fly one is not."
 *
 * It is also what keeps the module boundary honest. `app/tsconfig.json` includes
 * `app/**` and nothing above it, so the app cannot import this table even if it
 * wanted to. The app reads data; the pipeline writes it. Emitting a sidecar is
 * the only version of this that does not either duplicate the table or drag the
 * resolver across the boundary.
 *
 * Two outputs, for two audiences:
 *
 *   data/ontology/resolutions.json     what the app links from — leaf moves only
 *   data/reports/resolution-flags.csv  the review queue §3 requires
 *
 * Additive, per §6: nothing existing is rewritten, and an app that never finds
 * the sidecar links exactly as it did before.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveVariant } from "./resolution.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ONT = resolve(ROOT, "data/ontology");

type Ingredient = { id: string; name: string };
type Recipe = { id: string; cuisine?: string; requires?: string[] };

const onto = JSON.parse(readFileSync(resolve(ONT, "ontology.json"), "utf8")) as {
  ingredients: Ingredient[]; redirects?: Record<string, string>;
};
const idx = JSON.parse(readFileSync(resolve(ONT, "recipe-index.json"), "utf8")) as {
  recipes: Recipe[];
};
const cls = existsSync(resolve(ONT, "classify.json"))
  ? JSON.parse(readFileSync(resolve(ONT, "classify.json"), "utf8")) as
      Record<string, { cuisine?: string; dish_type?: string }>
  : {};

const nameOf = new Map<string, string>();
for (const i of onto.ingredients) nameOf.set(i.id, i.name);
const redirects = onto.redirects ?? {};

/**
 * recipe id → generic name → leaf name.
 *
 * Keyed by NAME on the inner map because that is what the app has at the point
 * of decision: `detailRows` hands its buy function a display name, not an id.
 * Keying by id would be tidier and would force the signature change §5 was
 * trying to avoid.
 */
const out: Record<string, Record<string, string>> = {};
const flags: string[] = [];

let lines = 0, moved = 0, flagged = 0;

for (const r of idx.recipes) {
  const c = cls[r.id];
  const cuisine = c?.cuisine ?? r.cuisine;
  const dish = c?.dish_type;
  for (const raw of r.requires ?? []) {
    const name = nameOf.get(redirects[raw] ?? raw);
    if (!name) continue;
    lines++;
    const v = resolveVariant(name, cuisine, dish);
    if (!v) continue;

    /* A leaf move is the only thing the app consumes. Self-resolutions carry
       nothing to link differently and would only pad the file. */
    if (v.to !== name) {
      (out[r.id] ??= {})[name] = v.to;
      moved++;
    }
    /* A flag is machine doubt and NEVER a silent switch (§3): it changes no
       link, it earns a review row. */
    if (v.flag) {
      flagged++;
      const q = (s: string) => (s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s);
      flags.push([r.id, q(name), q(v.to), q(dish ?? ""), q(v.flag)].join(","));
    }
  }
}

writeFileSync(resolve(ONT, "resolutions.json"), JSON.stringify(out, null, 0) + "\n");

mkdirSync(resolve(ROOT, "data/reports"), { recursive: true });
writeFileSync(resolve(ROOT, "data/reports/resolution-flags.csv"),
  "recipe,written,resolved,dish_type,flag\n" + flags.sort().join("\n") + "\n");

console.log(`lines scanned:        ${lines}`);
console.log(`leaf moves stamped:   ${moved}  (${Object.keys(out).length} recipes)`);
console.log(`flagged for review:   ${flagged}  → data/reports/resolution-flags.csv`);
