/**
 * Propose each recipe's main ingredient — RECIPE-SPEC §4c.
 *
 *   npm run main-ingredients
 *
 * Writes:
 *   data/qc/main-ingredients.csv        the review artifact, evidence attached
 *   data/ontology/main-proposals.json   what the curate form pre-fills from
 *
 * Never a decision. §4c says the field is curated; this exists so the curator
 * corrects a guess instead of facing a blank field, which is the same shape as
 * every other queue here.
 *
 * §4c names three signals. Two are implemented:
 *
 *   category  the source's own recipeCategory names an ingredient. STRONG —
 *             the publisher said so. §4a counted `pork 92, beef 78, chicken 59`
 *             and discarded them as axis noise; this is that discard, recovered.
 *   title     the ingredient is named in the recipe title. STRONG.
 *
 * The third — largest measured quantity — is NOT implemented, because nothing
 * stores quantities: `recipe-lines.json` keeps `raw`, `head` and the node, and
 * the amount is consumed inside the parser and thrown away. Reconstructing it
 * would mean re-parsing every line here, and §4c calls the signal weak anyway
 * ("stock and water are the largest quantity in every soup"). Left undone
 * deliberately rather than approximated with something that looks like it.
 *
 * A proposal may only name an ingredient the recipe actually REQUIRES. A main
 * ingredient that is not in the dish is not a weak guess, it is a wrong one.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { singular } from "../ontology/normalize.js";
import { UNIVERSAL } from "../ontology/classes.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ONT = resolve(ROOT, "data/ontology");
const RAW = resolve(ROOT, "data/raw");
const QC = resolve(ROOT, "data/qc");

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ""));
}
const asObjects = (text: string) => {
  const rows = parseCsv(text);
  const h = rows[0]!;
  return rows.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""])));
};
const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((c) => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n") + "\n";

/** Number-insensitive token list — the same key the ontology uses for synonyms. */
const toks = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).map(singular);

/**
 * Does `name` appear in `text` as whole words, in order?
 *
 * Token containment rather than substring, so `oil` cannot match `broil` and
 * `rice` cannot match `price`. Either direction counts: a category of `pork`
 * names the requirement `pork belly`, and a category of `chicken and poultry`
 * is named by the requirement `chicken`.
 */
function namesEachOther(nameToks: string[], textToks: string[]): boolean {
  if (!nameToks.length || !textToks.length) return false;
  const contains = (hay: string[], needle: string[]) => {
    for (let i = 0; i + needle.length <= hay.length; i++) {
      if (needle.every((t, j) => hay[i + j] === t)) return true;
    }
    return false;
  };
  return contains(textToks, nameToks) || contains(nameToks, textToks);
}

type Line = { raw: string; head: string; node?: string };

function main() {
  const idx = JSON.parse(readFileSync(resolve(ONT, "recipe-index.json"), "utf8")) as {
    recipes: Array<{ id: string; title: string; source: string; requires: string[] }>;
  };
  const lines = JSON.parse(readFileSync(resolve(ONT, "recipe-lines.json"), "utf8")) as
    Record<string, Line[]>;

  /** id → display name, plus every alias, so a category can match any surface. */
  const nameOf = new Map<string, string>();
  for (const r of asObjects(readFileSync(resolve(ONT, "identity.csv"), "utf8"))) {
    if (r["id"] && !r["retired_to"]) nameOf.set(r["id"]!, r["name"] ?? "");
  }
  const aliasesOf = new Map<string, string[]>();
  const aliasFile = resolve(ONT, "aliases.csv");
  if (existsSync(aliasFile)) {
    const byName = new Map([...nameOf].map(([id, n]) => [n, id]));
    for (const a of asObjects(readFileSync(aliasFile, "utf8"))) {
      const id = byName.get(a["node"] ?? "");
      if (!id || !a["surface"]) continue;
      (aliasesOf.get(id) ?? aliasesOf.set(id, []).get(id)!).push(a["surface"]!);
    }
  }

  /** The source's own recipeCategory, by source url — §4a's discarded axis. */
  const categoryOf = new Map<string, string>();
  for (const f of readdirSync(RAW).filter((f) => f.endsWith(".jsonl"))) {
    for (const line of readFileSync(resolve(RAW, f), "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const d = JSON.parse(line) as { sourceUrl?: string; category?: string };
        if (d.sourceUrl && d.category) categoryOf.set(d.sourceUrl, d.category);
      } catch { /* a malformed raw line must not stop the pass */ }
    }
  }

  /** Universal ingredients are never what a dish is OF. */
  const universal = new Set([...UNIVERSAL].map((u) => toks(u).join(" ")));

  /**
   * A main ingredient is DISTINCTIVE to the dish, and that is measurable.
   *
   * The first pass proposed `garlic`, `ginger`, `scallion` and `ketchup` as main
   * ingredients whenever they appeared in a title. They are background: garlic
   * is in 54% of the corpus, sesame oil 39%, scallion 34%, ginger 22%. What a
   * dish is actually OF is rare — beef 3.1%, kimchi 3.3%, tofu 2.1%, chicken
   * 1.8% — because it is the thing that makes this dish and not the next one.
   *
   * `kind` was the obvious alternative and does not work: `kimchi` is filed as
   * `condiment`, and §4c uses kimchi jjigae as its own example of a dish with
   * two mains. Every kind is also `kind_reviewed: false`, and `red bell pepper`
   * is filed as `spice`. Ubiquity is measured; kind is an unreviewed guess.
   *
   * The threshold is configuration, not a law — the same rule §4c applies to
   * w_main. 20% sits in the empty gap between ginger at 22% and egg at 8.8%.
   */
  const MAX_UBIQUITY = 0.20;
  const mentionsOf = new Map<string, number>();
  {
    const byName = new Map([...nameOf].map(([id, n]) => [n, id]));
    for (const r of asObjects(readFileSync(resolve(ONT, "nodes.csv"), "utf8"))) {
      const id = byName.get(r["node"] ?? "");
      if (id) mentionsOf.set(id, Number(r["mentions"] || 0));
    }
  }
  const total = idx.recipes.length;
  const tooCommon = (id: string) => (mentionsOf.get(id) ?? 0) / total > MAX_UBIQUITY;

  const rows: (string | number)[][] = [[
    "recipe_id", "title", "source", "proposed", "ids", "signals", "confidence",
  ]];
  const proposals: Record<string, { ids: string[]; why: string }> = {};
  let both = 0, one = 0, none = 0;

  for (const r of idx.recipes) {
    const ls = lines[r.id] ?? [];
    const url = (r as unknown as { url?: string }).url ?? "";
    const category = categoryOf.get(url) ?? "";
    const catToks = toks(category);
    const titleToks = toks(r.title);

    // Candidates are the recipe's OWN requirements, in the order the author
    // wrote them — first-listed breaks ties, because ingredient lists lead with
    // what the dish is made of.
    const seen = new Set<string>();
    const candidates: string[] = [];
    for (const l of ls) if (l.node && r.requires.includes(l.node) && !seen.has(l.node)) {
      seen.add(l.node); candidates.push(l.node);
    }
    for (const id of r.requires) if (!seen.has(id)) { seen.add(id); candidates.push(id); }

    const scored: Array<{ id: string; score: number; why: string[] }> = [];
    for (const [pos, id] of candidates.entries()) {
      const name = nameOf.get(id) ?? "";
      if (!name) continue;
      const nt = toks(name);
      if (universal.has(nt.join(" "))) continue;

      const surfaces = [name, ...(aliasesOf.get(id) ?? [])].map(toks);
      const why: string[] = [];
      let score = 0;
      const byCategory = catToks.length && surfaces.some((s) => namesEachOther(s, catToks));
      if (byCategory) { score += 2; why.push("category"); }
      if (surfaces.some((s) => namesEachOther(s, titleToks))) { score += 2; why.push("title"); }

      // Ubiquity vetoes the title signal but NOT the category signal: a title
      // mentions garlic because garlic is in everything, whereas a publisher
      // filing the recipe under an ingredient has made a deliberate claim.
      if (score > 0 && tooCommon(id) && !byCategory) continue;
      if (score > 0) scored.push({ id, score: score - pos * 0.001, why });
    }

    scored.sort((a, b) => b.score - a.score);
    const picked = scored.slice(0, 2);
    if (picked.length === 2) both++; else if (picked.length === 1) one++; else none++;
    if (!picked.length) continue;

    const why = picked.map((p) => `${nameOf.get(p.id)}: ${p.why.join("+")}`).join(" | ");
    proposals[r.id] = { ids: picked.map((p) => p.id), why };
    rows.push([
      r.id, r.title, r.source,
      picked.map((p) => nameOf.get(p.id)).join(" | "),
      picked.map((p) => p.id).join(" "),
      why,
      picked.every((p) => p.why.length > 1) ? "high" : "medium",
    ]);
  }

  if (!existsSync(QC)) mkdirSync(QC, { recursive: true });
  writeFileSync(resolve(QC, "main-ingredients.csv"), csv(rows));
  writeFileSync(resolve(ONT, "main-proposals.json"), JSON.stringify(proposals, null, 1));

  console.log(`${total} recipes`);
  console.log(`  two proposed   ${both}`);
  console.log(`  one proposed   ${one}`);
  console.log(`  none           ${none} (${Math.round((none / total) * 100)}%) — the curator starts blank`);
  console.log(`\nwrote data/qc/main-ingredients.csv and data/ontology/main-proposals.json`);
}

main();
