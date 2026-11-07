/**
 * Resolve a recipe's ingredient list against what the ontology already knows.
 *
 *   npm run resolve-corpus        # coverage over data/raw + the review queue
 *
 * This is what the whole pipeline is for. A new recipe arrives, its ingredient
 * lines are parsed, and every line either lands on a node we know or does not.
 * What does not is the ONLY thing a human should ever see:
 *
 *     known    → resolved silently, no review, no queue
 *     unknown  → a new surface form, written to data/qc/unknown.csv
 *
 * The number that matters is how few unknowns a fresh corpus produces. It should
 * fall as the alias table grows, and a jump means either a new cuisine arrived
 * or a rule regressed. Both are worth knowing about immediately rather than
 * after a review session.
 *
 * Three stages, from NORMALIZATION.md:
 *   1. measurement out          headName()
 *   2. adjectives separated     normalize()
 *   3. separate purchase?       rules + exceptions
 * then a lookup in the alias table, which is stage 4 and pure semantics.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve as res } from "node:path";
import { fileURLToPath } from "node:url";
import { headName } from "./frequency.js";
import { normalize, type Vocabulary } from "../ontology/normalize.js";
import { loadAliases } from "../ontology/aliases.js";
import { loadNodes } from "../ontology/promote.js";
import { singular } from "../ontology/normalize.js";
import { SLOTS } from "../ontology/classes.js";

const ROOT = res(dirname(fileURLToPath(import.meta.url)), "../..");
const RAW = res(ROOT, "data/raw");
const QC = res(ROOT, "data/qc");

export type Resolution =
  | { known: true; node: string; via: "alias" | "rule" }
  | { known: false; surface: string };

/**
 * The nodes the ontology actually knows.
 *
 * Alias TARGETS are known by construction — something was mapped onto them on
 * purpose. Alias SURFACES are known too, since they resolve. Reviewed
 * expectations contribute whatever the reviewer settled on.
 *
 * Deliberately NOT the proposal list: proposals are candidates, and treating
 * them as known would report 100% coverage on day one while meaning nothing.
 */
/** Number-insensitive: `scallions` and `scallion` are one node. */
/**
 * Both directions. `singular()` deliberately keeps `seeds` plural, because that
 * is the right display name — but for a lookup KEY `sesame seed` and `sesame
 * seeds` must collide, and they did not, leaving 36 mentions unresolved.
 */
const nkey = (s: string) =>
  s.toLowerCase().trim().split(" ")
   .map((w) => singular(w).replace(/s$/, ""))
   .join(" ");

/**
 * The nodes the ontology actually knows.
 *
 * ONLY confirmed registry rows and slot children. Both are things the ontology
 * emits an id for, and that is the whole test: if the app cannot look a name up,
 * the resolver has no business calling it resolved.
 *
 * Alias SURFACES and reviewed expectations used to be counted here too, and it
 * inflated coverage by 22 points. An alias surface resolves THROUGH the engine
 * to its target, so by the time this is consulted the canonical is already the
 * target — listing the surface as well only masked cases where the target was
 * never promoted to a node. The recipe index found it: 2,077 ingredients
 * "resolved" to names carrying no ontology id.
 *
 * `candidate` rows stay excluded. They are surfaces seen once or twice, which is
 * exactly where parser leftovers hide.
 */
export function knownNodes(): Set<string> {
  const known = new Set<string>();
  for (const n of loadNodes()) if (n.status !== "candidate") known.add(nkey(n.node));
  // Slot children are known BY CONSTRUCTION — the engine only ever emits
  // `seaweed - nori/gim` because someone wrote that child down. Omitting them
  // reported the ontology's most deliberate entries as unreviewed surfaces.
  for (const [slot, def] of Object.entries(SLOTS)) {
    known.add(nkey(slot));
    for (const c of def.children) known.add(nkey(`${slot} - ${c.names.join("/")}`));
  }
  return known;
}

export function resolveIngredient(
  raw: string, known: Set<string>, vocab: Vocabulary, heads?: ReadonlySet<string>,
): Resolution | null {
  // The vocabulary matters here too. "thick slices of Korean or daikon radish"
  // needs it to know `korean radish` is a real head, and without it the line
  // settled on the bare word `korean`.
  const head = headName(raw, heads);
  if (!head) return null;                       // measurement only, or a servings line
  const r = normalize(head, vocab);
  if (r.drop) return null;
  // A split line names two ingredients. It resolves only if BOTH halves do —
  // `salt and pepper` is not one node and must not be reported as one unknown.
  if (r.split?.length) {
    const parts = r.split.map((p) => known.has(nkey(p)));
    return parts.every(Boolean)
      ? { known: true, node: r.split.join(" + "), via: "rule" }
      : { known: false, surface: r.split.filter((_, i) => !parts[i]).join(" + ") };
  }
  const node = r.canonical || head;
  if (known.has(nkey(node))) {
    // `trace` non-empty with an alias step means the table did the work.
    const viaAlias = r.trace.some((t) => t.rule === "synonym" || t.rule === "slot");
    return { known: true, node, via: viaAlias ? "alias" : "rule" };
  }
  return { known: false, surface: node };
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].endsWith("resolve.ts")) {
  if (!existsSync(RAW)) { console.error("no data/raw — run: npm run crawl"); process.exit(1); }

  type Rec = { rawIngredients?: string[]; title?: string; url?: string; cuisine?: string };
  const recipes: Rec[] = [];
  for (const f of readdirSync(RAW).filter((f) => f.endsWith(".jsonl")))
    for (const l of readFileSync(res(RAW, f), "utf8").split("\n"))
      if (l.trim()) { try { recipes.push(JSON.parse(l)); } catch { /* skip */ } }

  // Vocabulary for the engine's safety conditions: every head the corpus uses.
  const heads = new Set<string>();
  for (const r of recipes) for (const raw of r.rawIngredients ?? []) {
    const h = headName(raw); if (h) heads.add(h);
  }
  const vocab: Vocabulary = { has: (h) => heads.has(h) };
  const known = knownNodes();

  let total = 0, viaRule = 0, viaAlias = 0, skipped = 0;
  /**
   * `inTitle` and `headline` are why frequency alone must not decide.
   *
   * A surface used once can be the MAIN ingredient of its recipe — bracken in a
   * bracken dish, yondu in a yondu soup — and deferring it as rare makes exactly
   * that recipe unmatchable, which is the worst possible trade. Two cheap
   * signals correct for it:
   *
   *   inTitle   the recipe is named after it. Decisive.
   *   headline  it appears in the first three lines AND is measured by weight
   *             or whole count, the way a main ingredient is written.
   */
  const unknown = new Map<string, {
    n: number; example: string; inTitle: boolean; headline: boolean;
    /**
     * Which cuisines use this surface.
     *
     * Carried because SOURCING needs it and frequency must not supply it —
     * DECISIONS §3 is explicit that corpus frequency measures recipe demand and
     * never kitchen presence. Cuisine CONCENTRATION is a different quantity: an
     * ingredient that appears only in Korean recipes is one an American
     * supermarket is unlikely to stock, and that is a claim about distribution
     * rather than about volume.
     */
    cuisines: Set<string>;
  }>();
  const MAIN_QTY = /\b\d+\s*(?:lbs?|pounds?|kgs?|kilograms?|g|grams?|oz|ounces?)\b|^\s*\d+\s+(?:whole\s+)?[a-z]/i;
  /** A recipe is only cookable-by-matching if EVERY line resolved. */
  let fullyResolved = 0;
  /**
   * Cuisines per RESOLVED node, not only per unknown.
   *
   * The unknown map only ever sees surfaces the ontology cannot place, so a node
   * promoted in an earlier run never appears there again — 2,100 of them ended
   * up with no cuisine data at all, which is exactly the set the sourcing review
   * needs it for.
   */
  const nodeCuisines = new Map<string, Set<string>>();
  /**
   * Mentions per RESOLVED node — the count that is actually true.
   *
   * The registry had been carrying pre-resolution counts, so alias targets sat
   * at zero: `sesame oil` and `gochugaru` are what hundreds of lines resolve TO,
   * but nothing had ever resolved to the string `sesame oil` before aliasing.
   * They sorted to the bottom of a queue ordered by importance.
   */
  const nodeMentions = new Map<string, number>();

  for (const r of recipes) {
    let clean = true;
    const title = (r.title ?? "").toLowerCase();
    const lines = r.rawIngredients ?? [];
    lines.forEach((raw, i) => {
      const out = resolveIngredient(raw, known, vocab, heads);
      if (!out) { skipped++; return; }
      total++;
      if (out.known) {
        out.via === "alias" ? viaAlias++ : viaRule++;
        nodeMentions.set(out.node, (nodeMentions.get(out.node) ?? 0) + 1);
        if (r.cuisine) {
          if (!nodeCuisines.has(out.node)) nodeCuisines.set(out.node, new Set());
          nodeCuisines.get(out.node)!.add(r.cuisine);
        }
        return;
      }
      clean = false;
      const e = unknown.get(out.surface) ??
        { n: 0, example: raw, inTitle: false, headline: false, cuisines: new Set<string>() };
      e.n++;
      if (r.cuisine) e.cuisines.add(r.cuisine);
      // Match on the head word too: a recipe called "Gosari Namul" names its
      // ingredient `gosari` without the whole surface appearing verbatim.
      const words = out.surface.split(" ").filter((w) => w.length > 3);
      if (words.some((w) => title.includes(w))) e.inTitle = true;
      if (i < 3 && MAIN_QTY.test(raw)) e.headline = true;
      unknown.set(out.surface, e);
    });
    if (clean) fullyResolved++;
  }

  const resolved = viaRule + viaAlias;
  const rows = [...unknown.entries()].sort((a, b) => b[1].n - a[1].n);
  const q = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  writeFileSync(res(QC, "unknown.csv"),
    [["surface", "mentions", "in_title", "headline", "cuisines", "example"],
     ...rows.map(([s, e]) => [s, String(e.n), e.inTitle ? "yes" : "", e.headline ? "yes" : "",
                              [...e.cuisines].sort().join("|"), e.example])]
      .map((r2) => r2.map(q).join(",")).join("\n") + "\n");

  const usage = [...new Set([...nodeMentions.keys(), ...nodeCuisines.keys()])].sort();
  writeFileSync(res(QC, "node-usage.csv"),
    [["node", "mentions", "cuisines"],
     ...usage.map((n) => [n, String(nodeMentions.get(n) ?? 0),
                          [...(nodeCuisines.get(n) ?? [])].sort().join("|")])]
      .map((r2) => r2.map(q).join(",")).join("\n") + "\n");

  const pct = (n: number) => ((n / total) * 100).toFixed(1) + "%";
  console.log(`
${recipes.length} recipes, ${total} ingredient mentions

  resolved        ${String(resolved).padStart(6)}  ${pct(resolved)}
    by rule       ${String(viaRule).padStart(6)}  general normalisation alone
    by alias      ${String(viaAlias).padStart(6)}  needed the alias table
  UNKNOWN         ${String(total - resolved).padStart(6)}  ${pct(total - resolved)}  ← the review queue
    distinct      ${String(rows.length).padStart(6)}  surfaces

  recipes fully resolved  ${fullyResolved} / ${recipes.length}  (${((fullyResolved / recipes.length) * 100).toFixed(1)}%)

wrote data/qc/unknown.csv — most frequent first

Everything above the UNKNOWN line needs no human. The queue is only what the
ontology has never seen, and it should shrink as data/ontology/aliases.csv grows.
`);
  const starred = rows.filter(([, e]) => e.inTitle || e.headline).length;
  console.log(`  ${starred} of ${rows.length} unknown surfaces look like MAIN ingredients`);
  console.log(`  (named in a recipe title, or measured by weight in the first three lines)\n`);
  console.log("top unknowns:");
  for (const [s, e] of rows.slice(0, 15)) console.log(`  ${String(e.n).padStart(5)}  ${s}`);
}
