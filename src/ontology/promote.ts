/**
 * Promote resolved-but-unknown surfaces into the node registry.
 *
 *   npm run promote -- --min 3     # confirm surfaces with >= 3 mentions
 *   npm run promote -- --dry
 *
 * The resolver's leftovers are not defects — once the parser and the rules are
 * doing their job, an unknown surface is simply an ingredient the ontology has
 * never been told about. `five spice powder`, `lemongrass`, `soju`, `furikake`
 * are all real, and the only thing standing between them and being nodes is
 * someone saying so.
 *
 * Frequency is ONE confidence signal and on its own it is the wrong one.
 *
 * Reviewer: "these low-count ingredients would also include main ingredient of
 * recipes." That is decisive. A surface used once can be the star of its dish —
 * parsnip, chayote, red snapper, gosari — and deferring it as rare makes exactly
 * that recipe unmatchable, which is the worst trade this system can make. A
 * common garnish being late costs nothing; a main ingredient being late costs a
 * whole recipe.
 *
 * So a surface is confirmed when ANY of these hold:
 *
 *   >= MIN mentions   many authors independently wrote it
 *   in_title          the recipe is NAMED after it
 *   headline          first three lines, measured by weight or whole count
 *
 * 1,905 of 4,006 unknown surfaces carry one of the last two. Frequency alone
 * would have deferred nearly half the main ingredients in the corpus.
 *
 * Nothing is destroyed: promotion only ever adds rows, and a `status` column
 * records how much anyone actually vouched for each.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAliases } from "./aliases.js";
import { headName } from "../ingest/frequency.js";
import { normalize } from "./normalize.js";
import { notStocked } from "./not-stocked.js";
import { SLOTS } from "./classes.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const QC = resolve(ROOT, "data/qc");
export const NODE_FILE = resolve(ROOT, "data/ontology/nodes.csv");

const argOf = (flag: string, dflt: number) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : dflt;
};
const MIN = argOf("--min", 3);
const DRY = process.argv.includes("--dry");

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
const q = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);

export type Node = {
  node: string; mentions: number; status: string; note: string;
  /** Cuisines the surface appears in — the sourcing signal reads this. */
  cuisines?: string;
};

export function loadNodes(): Node[] {
  if (!existsSync(NODE_FILE)) return [];
  return asObjects(readFileSync(NODE_FILE, "utf8")).map((o) => ({
    node: (o["node"] ?? "").trim(),
    mentions: Number(o["mentions"] ?? 0),
    status: o["status"] ?? "candidate",
    note: o["note"] ?? "",
    cuisines: o["cuisines"] ?? "",
  })).filter((n) => n.node);
}

// ── CLI ────────────────────────────────────────────────────────────────────

if (process.argv[1]?.endsWith("promote.ts")) {
  const existing = new Map(loadNodes().map((n) => [n.node, n]));

  /**
   * A surface that ALIASES to another node is not a node.
   *
   * The invariant this enforces was being violated silently: `egg` and `eggs`
   * were both promoted, from two proposal rows, and stayed two ids for one
   * ingredient — which the matcher cannot cross. Nothing detected it because
   * promotion only ever asked "is this name already a node?", never "does this
   * name already resolve to a different one?".
   *
   * So the alias table gets the last word, both ways: an aliased name is
   * dropped from the node list if it is there, and never re-added from a
   * proposal below. `npm run build-ontology` then retires its id behind a
   * redirect to the target, so every reference ever written keeps resolving
   * (INGREDIENT-SPEC §1).
   *
   * A row whose alias points at ITSELF is not a merge and is left alone.
   */
  const aliasTarget = new Map<string, string>();
  for (const a of loadAliases()) {
    if (a.surface !== a.node) aliasTarget.set(a.surface, a.node);
  }
  let demoted = 0;
  for (const name of [...existing.keys()]) {
    const to = aliasTarget.get(name);
    if (to && to !== name) { existing.delete(name); demoted++; }
  }
  if (demoted) console.log(`${demoted} node(s) dropped — an alias resolves them elsewhere`);

  // Alias targets and slot children are nodes by construction — something was
  // deliberately mapped onto them. Seed the registry with those first so the
  // file is the whole picture rather than only the newly promoted part.
  for (const a of loadAliases())
    if (!existing.has(a.node))
      existing.set(a.node, { node: a.node, mentions: 0, status: "confirmed", note: `alias target (${a.source})` });
  for (const [slot, def] of Object.entries(SLOTS)) {
    if (!existing.has(slot)) existing.set(slot, { node: slot, mentions: 0, status: "slot", note: "a choice, not an ingredient" });
    for (const c of def.children) {
      const display = `${slot} - ${c.names.join("/")}`;
      if (!existing.has(display))
        existing.set(display, { node: display, mentions: 0, status: "confirmed", note: c.note ?? "" });
    }
  }

  /**
   * Seed from the REVIEWED proposal list.
   *
   * These were missing entirely, and it did not show until the ontology build
   * dropped 17 of its 25 relations for naming nodes that "did not exist" —
   * `lemon juice`, `heavy cream`, `gochugaru`. They resolve fine, because
   * knownNodes() also reads expectations, but nothing had ever written them into
   * the registry. A node the reviewer confirmed is a node.
   */
  const proposalFile = resolve(QC, "aliases.csv");
  if (existsSync(proposalFile)) {
    const decided = new Set<string>();
    const decFile = resolve(ROOT, "data/decisions/aliases.csv");
    if (existsSync(decFile))
      for (const d of asObjects(readFileSync(decFile, "utf8"))) if (d["id"]) decided.add(d["id"]);
    for (const p of asObjects(readFileSync(proposalFile, "utf8"))) {
      const name = (p["proposed_canonical"] ?? "").trim();
      if (!name) continue;
      // Backfill cuisines onto rows that already exist. Skipping known names
      // outright meant the column stayed empty for every node the registry had
      // seen before, which is nearly all of them.
      // Same rule as above: a proposal for a name that aliases elsewhere is a
      // proposal to recreate a merge we already resolved.
      if (aliasTarget.has(name)) continue;
      const had = existing.get(name);
      if (had) { if (!had.cuisines && p["cuisines"]) had.cuisines = p["cuisines"]; continue; }
      const mentions = Number(p["mentions"] ?? 0);
      const reviewed = decided.has(p["id"] ?? "");
      existing.set(name, {
        node: name, mentions,
        status: reviewed || mentions >= MIN ? "confirmed" : "candidate",
        note: reviewed ? "confirmed in review" : `${mentions} mentions`,
        cuisines: p["cuisines"] ?? "",
      });
    }
  }

  // Cuisines for nodes the resolver PLACED — the only source for nodes promoted
  // in an earlier run, which never appear in unknown.csv again.
  const usageFile = resolve(QC, "node-usage.csv");
  if (existsSync(usageFile))
    for (const c of asObjects(readFileSync(usageFile, "utf8"))) {
      const n = existing.get((c["node"] ?? "").trim());
      if (!n) continue;
      if (c["cuisines"]) n.cuisines = c["cuisines"];
      // Post-resolution count wins. It is the only one that reflects aliasing,
      // and an alias target's pre-resolution count is always zero.
      const m = Number(c["mentions"] ?? 0);
      if (m > n.mentions) { n.mentions = m; if (n.status === "candidate" && m >= MIN) n.status = "confirmed"; }
    }

  const unknownFile = resolve(QC, "unknown.csv");
  if (!existsSync(unknownFile)) { console.error("run: npm run resolve-corpus"); process.exit(1); }

  let confirmed = 0, candidate = 0;
  for (const u of asObjects(readFileSync(unknownFile, "utf8"))) {
    const node = (u["surface"] ?? "").trim();
    const mentions = Number(u["mentions"] ?? 0);
    if (!node) continue;
    const prev = existing.get(node);
    // Never demote: a human confirming something outranks any threshold.
    if (prev && prev.status === "confirmed") {
      prev.mentions = Math.max(prev.mentions, mentions);
      if (!prev.cuisines && u["cuisines"]) prev.cuisines = u["cuisines"];
      continue;
    }
    const main = (u["in_title"] ?? "") === "yes" || (u["headline"] ?? "") === "yes";
    const status = mentions >= MIN || main ? "confirmed" : "candidate";
    if (status === "confirmed") confirmed++; else candidate++;
    existing.set(node, {
      node, mentions, status, cuisines: u["cuisines"] ?? prev?.cuisines ?? "",
      note: prev?.note || (status === "confirmed"
        ? (mentions >= MIN ? `${mentions} mentions`
          : (u["in_title"] === "yes" ? "rare, but a recipe is named after it"
            : "rare, but measured like a main ingredient"))
        : "needs review — rare, and not a main ingredient anywhere"),
    });
  }

  /**
   * Drop candidates the resolver no longer produces.
   *
   * Promotion only ever adds, which is right for confirmed nodes — but a
   * CANDIDATE is a record of something the parser could not place, and when a
   * parser fix places it the row becomes a lie. `215 10 dasima`,
   * `9 g sesame seeds` and `an english cucumber` all survived their own fixes
   * and would have sat in the review queue forever.
   *
   * Confirmed rows are never pruned: someone or something vouched for them, and
   * a surface vanishing from one corpus does not unmake the ingredient.
   */
  const stillUnknown = new Set(
    asObjects(readFileSync(unknownFile, "utf8")).map((u) => (u["surface"] ?? "").trim()));
  let pruned = 0;
  for (const [k, v] of existing)
    if (v.status === "candidate" && !stillUnknown.has(k)) { existing.delete(k); pruned++; }
  if (pruned) console.log(`\npruned ${pruned} stale candidate(s) — the parser now places them`);

  /**
   * Migrate nodes whose name the parser no longer produces.
   *
   * Confirmed rows are otherwise never pruned, and that is right — a surface
   * missing from one corpus does not unmake an ingredient. But a node must be
   * a FIXED POINT of the parser: if headName() of its own name comes back
   * different, no recipe line can ever resolve to that spelling again, and the
   * node is stranded under a name nothing will match.
   *
   * Merging rather than deleting, because the mentions are real. `carrot
   * matchsticks` was a node with its own count; it belongs to `carrot`.
   *
   * This is what removed the recipe prose that the main-ingredient signal had
   * confirmed — "bring 4 to 5 cups of water to a boil, add the taro" sat near
   * the top of a list and was measured by weight, so every heuristic vouched for
   * it. Only the parser knows it is a sentence.
   */
  /**
   * Nodes the ENGINE drops are not nodes.
   *
   * `water` and `korean` were both in the registry: water because it is
   * UNIVERSAL, `korean` because it is a bare origin word the parse-failure rule
   * rejects. Both are fixed points of headName, so the migration check above
   * never touched them — headName is stage 1 and neither of these is a parsing
   * question. Asking normalize() closes that gap.
   */
  const engineDrops = (name: string) => {
    try { return !!normalize(name, { has: () => true }).drop; } catch { return false; }
  };

  const NUMERIC_ONLY = /^[\d\s\/.\-]+$/;
  const JUNK_TOKEN = /^(?:for|of|and|or|the|a|an|to|per|with|serving|servings|portion|portions)$/i;
  let migrated = 0, dropped = 0, demotedUnparseable = 0, demotedNotStocked = 0;
  for (const [name, node] of [...existing]) {
    if (name.includes(" - ")) continue;            // slot displays are constructed
    /**
     * Recall over precision — reviewer's call.
     *
     * *"The parser should focus on increasing recall, not precision. I will do
     * manual QC anyway."*
     *
     * Deleting was the wrong default and `white fish` is the proof: the
     * appositive rule stripped it to a bare colour, the engine could not parse
     * that, and a real ingredient left the ontology silently — no queue row, no
     * report, nothing to review. A dropped node is unrecoverable without
     * re-running the whole proposal pass; a demoted one is sitting in the
     * candidate list where a human can see it.
     *
     * So only the genuinely contentless are still deleted: a name made
     * entirely of fillers and numbers is not a name. Everything the ENGINE
     * merely could not parse is demoted to `candidate` and kept, which keeps it
     * out of the confirmed ontology without throwing it away.
     */
    const tokens = name.split(/\s+/).filter(Boolean);
    if (tokens.every((t) => JUNK_TOKEN.test(t) || NUMERIC_ONLY.test(t))) {
      existing.delete(name); dropped++; continue;
    }
    /**
     * Water is not an ingredient, and seventeen spellings of it are nodes.
     *
     * `icy water`, `tepid water`, `qt water`, `litters water`, `regular sized
     * ice cubes` — all confirmed, none of them food. They were found by the
     * rule written to keep water out of the REVIEW QUEUE (`not-stocked.ts`),
     * which turned out to describe the same thing here: a name that no pantry
     * can hold is not an ingredient, wherever it is being asked about.
     *
     * Demoted rather than deleted, following the rule above it and for the
     * same reason `white fish` taught: a dropped node is unrecoverable, a
     * demoted one is in the candidate list where a human can see it. This also
     * takes them out of the suggestion pool, which reads confirmed nodes —
     * `icy water` was being offered as a match for `rice water`.
     */
    const water = notStocked(name);
    if (water) {
      node.status = "candidate";
      node.note = node.note.includes("not an ingredient")
        ? node.note
        : `${node.note ? node.note + "; " : ""}not an ingredient — ${water.why}`;
      demotedNotStocked++;
      continue;
    }
    if (engineDrops(name)) {
      node.status = "candidate";
      node.note = node.note.includes("engine cannot parse")
        ? node.note : `${node.note ? node.note + "; " : ""}engine cannot parse this — kept for review`;
      demotedUnparseable++;
      continue;
    }
    let fixed: string;
    try { fixed = headName(name); } catch { continue; }
    if (fixed === name) continue;
    existing.delete(name);
    if (!fixed) { dropped++; continue; }
    const target = existing.get(fixed);
    if (target) target.mentions += node.mentions;
    else existing.set(fixed, { ...node, node: fixed, note: `${node.note}; merged from "${name}"` });
    migrated++;
  }
  if (demotedNotStocked)
    console.log(`${demotedNotStocked} node(s) demoted — not an ingredient (water, ice, cooking liquid)`);
  if (migrated || dropped || demotedUnparseable) {
    console.log(`\n${migrated} node(s) migrated to the name the parser now produces, ${dropped} dropped as contentless`);
    if (demotedUnparseable)
      console.log(`${demotedUnparseable} demoted to candidate — the engine cannot parse them, kept for review`);
  }

  /**
   * The alias guard, applied LAST as well as first.
   *
   * Running it once at the top was not enough: the migration step above
   * re-creates names by rewriting a node to whatever `headName` now produces,
   * and it happily produced `korean radishes` again after the guard had dropped
   * it. A rule that only holds at the start of a function is not an invariant.
   */
  let lateDrops = 0;
  for (const name of [...existing.keys()]) {
    const to = aliasTarget.get(name);
    if (to && to !== name) { existing.delete(name); lateDrops++; }
  }
  if (lateDrops) console.log(`${lateDrops} node(s) dropped after migration — an alias resolves them elsewhere`);

  const all = [...existing.values()].sort((a, b) => b.mentions - a.mentions || a.node.localeCompare(b.node));
  console.log(`\n${all.length} nodes total`);
  console.log(`  ${all.filter((n) => n.status === "confirmed").length} confirmed  (>= ${MIN} mentions, named in a title, or measured like a main ingredient)`);
  console.log(`  ${candidate} candidate  (rare AND never a main ingredient — where parser leftovers hide)`);
  console.log(`\nnewly promoted this run: ${confirmed} confirmed, ${candidate} candidate`);

  if (DRY) { console.log("\n(dry run — nothing written)"); process.exit(0); }
  writeFileSync(NODE_FILE,
    [["node", "mentions", "status", "cuisines", "note"],
     ...all.map((n) => [n.node, String(n.mentions), n.status, n.cuisines ?? "", n.note])]
      .map((r) => r.map(q).join(",")).join("\n") + "\n");
  console.log(`\nwrote data/ontology/nodes.csv`);
}
