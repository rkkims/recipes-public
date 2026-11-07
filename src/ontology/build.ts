/**
 * Build the ontology YAML from the reviewed data.
 *
 *   npm run build-ontology
 *
 * Inputs, all of them reviewable files rather than code:
 *
 *   data/ontology/nodes.csv     what exists          (npm run promote)
 *   data/ontology/aliases.csv   what things are called (npm run learn)
 *   src/ontology/exceptions.ts  slots — a choice, not an ingredient
 *   src/ontology/edges.ts       is_a / derives_from / substitutes_for
 *
 * Output is data/ontology/ontology.yaml, which DECISIONS §3 names as the source
 * of truth for the app. It is GENERATED, so it must never be hand-edited — every
 * fact in it traces back to one of the files above, and an edit here would be
 * silently overwritten on the next build. The header says so.
 *
 * Schema follows DECISIONS §3, with one amendment: the ingredient now carries NO
 * attributes at all. `ubiquity` and `shelf_life_days` were cut for want of a data
 * source; `sourcing` is cut because finding an ingredient is the user's job and
 * the affiliate does not read it (INGREDIENT-SPEC §4). What remains is identity,
 * names and relations — and hierarchy lives in relations rather than nesting,
 * because a node can be narrower than one thing and derived from another, and a
 * tree cannot say that.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { allergensOf, animalSourceOf } from "./allergens.js";
import { displayNameFor } from "./naming.js";
import { fileURLToPath } from "node:url";
import { loadNodes } from "./promote.js";
import { loadAliases } from "./aliases.js";
import { SLOTS } from "./exceptions.js";
import { IS_A as IS_A_RULES, DERIVES_FROM, SUBSTITUTES_FOR } from "./edges.js";
import { buildIds } from "./ids.js";
import { guessKind } from "./kinds.js";
import { Registry } from "./identity.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Keys the catalogue only ever writes in the plural — NORMALIZATION, "Number".
 *
 * The catalogue was the Weee! vocabulary, removed with that integration, so the
 * set is empty and the rule degrades to plain "singular" — the safe direction:
 * it never keeps a plural that the data cannot justify. `aggregateKeys` still
 * takes a vocabulary CSV if a retailer catalogue comes back.
 */
const AGGREGATES = new Set<string>();
const QC = resolve(ROOT, "data/qc");
const OUT = resolve(ROOT, "data/ontology/ontology.yaml");
/**
 * The same content as JSON.
 *
 * The YAML is for a person to read and diff; the app reads this. Emitting both
 * from one build is what keeps them honest — a YAML parser in the app would be a
 * dependency and a second interpretation of the same file.
 */
const OUT_JSON = resolve(ROOT, "data/ontology/ontology.json");

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

// Ids come from ids.ts, shared with the recipe index. Two implementations would
// drift the first time the slug rule changed, and silently: every recipe would
// still list plausible ids that match nothing.

/** YAML scalar. Quote anything that could be read as another type. */
const y = (v: string) =>
  v === "" ? '""'
  : /^[A-Za-z][A-Za-z0-9 _.\-()/]*$/.test(v) && !/^(?:yes|no|true|false|null|on|off)$/i.test(v)
    ? v
    : `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

// ── inputs ─────────────────────────────────────────────────────────────────


/**
 * Reviewed is_a edges — `data/ontology/is_a.csv`, written by `qc-import`.
 *
 * `edges.ts` holds a handful of edges that are RULES, argued in prose beside
 * the code. Reviewed edges are data, and there will be thousands of them, so
 * they live next to the alias table for the same reason it does. Both feed the
 * build; the file wins on a conflict, because it is the more recent judgement.
 */
const IS_A: Array<[string, string]> = (() => {
  const f = resolve(ROOT, "data/ontology/is_a.csv");
  const fromFile: Array<[string, string]> = existsSync(f)
    ? parseCsv(readFileSync(f, "utf8")).slice(1)
        .filter((r) => r[0] && r[1]).map((r) => [r[0]!, r[1]!] as [string, string])
    : [];
  /**
   * MANY parents per child, deduplicated.
   *
   * This was `Map<string, string>` keyed on the child, so a second edge for the
   * same node silently replaced the first — and it did so HERE, before anything
   * reached the app, which meant fixing the matcher's identical bug was not
   * enough on its own. Both had to go.
   *
   * Ingredients are not a tree: `beef flank steak` is a kind of steak and a kind
   * of beef, and the two derivation rules (`hierarchy.ts` off the suffix,
   * `hierarchy-prefix.ts` off the prefix) each find one. Collapsing to one
   * parent would throw away whichever was read second, with no warning.
   */
  const seen = new Set<string>();
  const out: Array<[string, string]> = [];
  for (const [c, p] of [...IS_A_RULES, ...fromFile]) {
    const key = `${c}\u0000${p}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([c, p]);
  }
  return out;
})();

/**
 * Reviewed `derives_from` edges — `data/ontology/derives_from.csv`.
 *
 * The same arrangement as `is_a.csv` and for the same reason: `edges.ts` holds
 * a handful argued in prose, and reviewed edges are data. Writing the file
 * without teaching the build to read it is exactly the gap this closes — 20
 * accepted rows sat on disk and changed nothing, and the only symptom was a
 * match quietly not happening.
 */
/*
  `note` is part of the shape, and leaving it off the annotation broke two
  things at once. `DERIVES_FROM` in `edges.ts` declares `note?` and carries
  reasons like "one lemon ≈ 3 tbsp"; the annotation here narrowed them away, so
  the emitter below — which appends `# ${d.note}` to the YAML line — failed to
  compile, and `npm run typecheck` had been red on it. The CSV half was the
  quieter half: `derives_from.csv` has a `note` column that was parsed past
  entirely, so a reviewer's reason for an edge never reached the file the app
  reads. Both halves carry it now.
*/
type Derive = { part: string; whole: string; note?: string };

const DERIVES: Derive[] = (() => {
  const f = resolve(ROOT, "data/ontology/derives_from.csv");
  const fromFile: Derive[] = existsSync(f)
    ? parseCsv(readFileSync(f, "utf8")).slice(1)
        .filter((r) => r[0] && r[1])
        .map((r) => ({ part: r[0]!, whole: r[1]!, ...(r[3] ? { note: r[3] } : {}) }))
    : [];
  const seen = new Set<string>();
  const out: Derive[] = [];
  for (const d of [...DERIVES_FROM, ...fromFile]) {
    const k = `${d.part}\u0000${d.whole}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(d);
  }
  return out;
})();

const nodes = loadNodes().filter((n) => n.status !== "candidate");
const aliases = loadAliases();

/**
 * English glosses for native-named nodes — the curator's ask (2026-08-20):
 * "korean red pepper paste - gochujang", the seaweed-slot pattern
 * generalized. DISPLAY AND SEARCH ONLY: the canonical name stays the native
 * term (the node-name rule and the identity registry both key on it); the
 * gloss rides beside it so English searches find the node and every surface
 * can explain what the word means. data/ontology/glosses.csv: node,gloss.
 */
const GLOSSES = new Map<string, string>();
{
  const f = resolve(ROOT, "data/ontology/glosses.csv");
  if (existsSync(f)) for (const r of parseCsv(readFileSync(f, "utf8")).slice(1)) {
    const node = (r[0] ?? "").trim().toLowerCase(), gloss = (r[1] ?? "").trim().toLowerCase();
    if (node && gloss && gloss !== node) GLOSSES.set(node, gloss);
  }
}


/** Aliases grouped under the node they resolve to. */
const aliasesOf = new Map<string, string[]>();
for (const a of aliases) {
  if (!aliasesOf.has(a.node)) aliasesOf.set(a.node, []);
  aliasesOf.get(a.node)!.push(a.surface);
}

// ── ids ────────────────────────────────────────────────────────────────────

// The ontology build is the ONLY caller allowed to mint ids — it is the step
// that decides what exists. Everything else reads.
const TODAY = new Date().toISOString().slice(0, 10);
const { idOf, slugOf } = buildIds(undefined, TODAY);

/**
 * Retire nodes that no longer exist but whose name an alias now resolves.
 *
 * This is the step that makes the identity file worth having. The registry keeps
 * a name's id forever, but a RENAME is a new name — when review decides
 * `jalopeno` is `jalapeno`, the old name simply stops being a node and a fresh
 * id gets minted for the new one. Nothing connects them.
 *
 * The alias table is what connects them: `jalopeno → jalapeno` is exactly the
 * record of that decision. So any registry name that has (a) fallen out of the
 * node list and (b) an alias pointing at a live node is retired behind a
 * redirect, and every reference ever written to the old id keeps resolving.
 *
 * A name that vanishes with NO alias is left alone rather than guessed at. It
 * may come back — a candidate demoted this run and promoted the next — and
 * inventing a redirect to a node nobody chose would be worse than an id that
 * currently resolves to nothing.
 */
{
  const registry = Registry.load();
  const live = new Set(nodes.map((n) => n.node));
  const aliasTo = new Map(aliases.map((a) => [a.surface, a.node]));
  let revived = 0;
  for (const row of registry.all())
    if (row.retired_to && live.has(row.name) && registry.revive(row.name)) revived++;
  if (revived) console.log(`  revived ${revived} returning name(s) — tombstone cleared`);
  let retired = 0;
  for (const row of registry.all()) {
    if (row.retired_to || live.has(row.name)) continue;
    const target = aliasTo.get(row.name);
    if (!target || !live.has(target)) continue;
    if (registry.retire(row.name, target, TODAY)) retired++;
  }
  if (registry.changed) registry.save();
  if (retired) console.log(`  retired ${retired} node(s) behind a redirect`);
}
/**
 * Reference a node by id. Returns null when the name is not a node — callers
 * drop the edge rather than emitting an id nothing can resolve. Falling back to
 * a slug here is what let dangling relations look valid for three commits.
 */
const ref = (name: string) => idOf.get(name) ?? null;

/** Things that could not be emitted because one end is not a node. */
const dropped: string[] = [];

/**
 * A surface claimed by a slot CHILD must not also sit on the slot PARENT.
 *
 * `laver` was listed under both `seaweed` and `seaweed.nori-gim`, which makes it
 * ambiguous exactly where the slot exists to remove ambiguity: a user typing
 * `laver` would match the parent and be asked "which seaweed?" about a word that
 * already answers the question.
 */
const claimedByChild = new Set<string>();
for (const def of Object.values(SLOTS))
  for (const c of def.children)
    for (const n of [...c.names, ...(c.aliases ?? [])]) claimedByChild.add(n.toLowerCase());
/**
 * …and must not sit on any OTHER node either.
 *
 * The original guard only stripped the slot PARENT, which was the only way the
 * collision had been seen. It missed the way it actually happened again:
 * `seasoned seaweed` and `crumbled seaweed` are claimed by the nori/gim child
 * in `exceptions.ts`, and an automatic retarget in the alias table — chasing a
 * merge chain — moved both onto `dried seaweed`, a node that is not the slot
 * parent. Two owners, and the matcher's answer becomes a coin flip between
 * pressed gim sheets and broth kelp.
 *
 * A slot child's claim is a reviewed decision written in code, with the
 * reasoning beside it. It outranks a row an automatic retarget produced, so
 * the row is dropped — loudly, because a silently discarded alias is how the
 * next one of these hides.
 */
{
  // The child's own display string, built the way the slot builds it.
  const childDisplays = new Set<string>();
  for (const [slot, def] of Object.entries(SLOTS))
    for (const c of def.children) childDisplays.add(`${slot} - ${c.names.join("/")}`);

  let stolen = 0;
  for (const [node, list] of aliasesOf) {
    if (Object.hasOwn(SLOTS, node)) continue;   // the parent — stripped below
    if (childDisplays.has(node)) continue;      // the rightful owner
    const kept = list.filter((a) => !claimedByChild.has(a.toLowerCase()));
    if (kept.length === list.length) continue;
    for (const a of list)
      if (claimedByChild.has(a.toLowerCase())) {
        console.log(`  dropped alias "${a}" from ${node} — a slot child already claims it`);
        stolen++;
      }
    aliasesOf.set(node, kept);
  }
  if (stolen) console.log(`  ${stolen} alias(es) returned to their slot child`);
}
for (const slot of Object.keys(SLOTS)) {
  const own = aliasesOf.get(slot);
  if (own) aliasesOf.set(slot, own.filter((a) => !claimedByChild.has(a.toLowerCase())));
}

// ── emit ───────────────────────────────────────────────────────────────────

const slotParents = new Set(Object.keys(SLOTS));
const slotChildren = new Map<string, string[]>();
for (const [slot, def] of Object.entries(SLOTS))
  slotChildren.set(slot, def.children.map((c) => `${slot} - ${c.names.join("/")}`));

const L: string[] = [];
const nodeCount = nodes.length;
const aliasCount = aliases.length;
const candidateCount = loadNodes().length - nodeCount;

L.push(`# Ingredient ontology — GENERATED, do not edit by hand.`);
L.push(`#`);
L.push(`# Every fact here traces to a reviewable file; edits made here are lost on`);
L.push(`# the next \`npm run build-ontology\`. To change something, change its source:`);
L.push(`#`);
L.push(`#   an ingredient exists     data/ontology/nodes.csv      (npm run promote)`);
L.push(`#   a name for it            data/ontology/aliases.csv    (npm run learn)`);
L.push(`#   a choice, not a thing    SLOTS in src/ontology/exceptions.ts`);
L.push(`#   a relation between two   src/ontology/edges.ts`);
L.push(``);
L.push(``);
L.push(`schema: 1`);
L.push(`counts:`);
L.push(`  ingredients: ${nodeCount}`);
L.push(`  aliases: ${aliasCount}`);
L.push(`  slots: ${slotParents.size}`);
L.push(`  unreviewed_candidates: ${candidateCount}   # excluded; see nodes.csv`);
L.push(``);
L.push(`# An ingredient carries NO attributes. \`ubiquity\` and \`shelf_life_days\``);
L.push(`# were cut for want of a data source; \`sourcing\` because finding an`);
L.push(`# ingredient is the user's job and nothing read it. Identity, names and`);
L.push(`# relations are the whole model.`);
L.push(`ingredients:`);

for (const n of nodes.sort((a, b) => b.mentions - a.mentions || a.node.localeCompare(b.node))) {
  const id = idOf.get(n.node)!;
  L.push(`  - id: ${y(id)}`);
  // Slug is for URLs and logs. INGREDIENT-SPEC §1: nothing may key off it,
  // because it changes whenever the display name does.
  L.push(`    slug: ${y(slugOf.get(n.node) ?? "")}`);
  // Display name in sentence case. The id and the aliases keep the corpus
  // spelling, which is what everything else matches on — this field is only
  // ever shown to a person.
  const display = displayNameFor(n.node, AGGREGATES);
  L.push(`    name: ${y(display.charAt(0).toUpperCase() + display.slice(1))}`);
  const kind = guessKind(n.node);
  if (kind) {
    L.push(`    kind: ${y(kind)}`);
    // Lexicon-derived, never reviewed. 27% of nodes match nothing and carry no
    // kind at all rather than a default — `other` would look like a decision.
    L.push(`    kind_reviewed: false`);
  }
  if (n.mentions) L.push(`    mentions: ${n.mentions}`);
  /**
   * The only two attributes an Ingredient carries (INGREDIENT-SPEC §4).
   *
   * Lexicon-derived like `kind`, but unlike `kind` the failure is not cosmetic,
   * so the rules are reviewed as code in `allergens.ts` and asserted by
   * `npm run test-allergens`. Absent means "we found nothing in the name",
   * never "free of" — USER-SPEC §6 is what turns that distinction into
   * behaviour.
   */
  const allergens = allergensOf(n.node);
  if (allergens.length) L.push(`    allergens: [${allergens.join(", ")}]`);
  const animal = animalSourceOf(n.node);
  if (animal) L.push(`    animal_source: ${y(animal)}`);
  if (slotParents.has(n.node)) {
    L.push(`    slot: true   # a choice — a pantry entry must resolve to one child`);
    L.push(`    choices:`);
    for (const c of slotChildren.get(n.node) ?? []) {
      const cid = ref(c);
      // A slot child that is not a node would emit a choice the app cannot
      // resolve — a dead end in the one place the user is being asked to choose.
      if (!cid) { dropped.push(`slot choice ${n.node} -> ${c}`); continue; }
      L.push(`      - ${y(cid)}`);
    }
  }
  // A slot child's own names live in SLOTS, not in the alias table, so they
  // were being emitted with no aliases at all — `nori`, `gim` and `laver`
  // unsearchable, which defeats the point of naming the node after them.
  for (const [slot, def] of Object.entries(SLOTS))
    for (const c of def.children)
      if (`${slot} - ${c.names.join("/")}` === n.node) {
        if (!aliasesOf.has(n.node)) aliasesOf.set(n.node, []);
        aliasesOf.get(n.node)!.push(...c.names, ...(c.aliases ?? []));
        if (c.note) L.push(`    note: ${y(c.note)}`);
      }

  /**
   * The node's own spelling survives as an alias when the display name moved.
   *
   * NORMALIZATION, "Number": the corpus wrote `onions` 1,022 times, and the
   * rule renames the DISPLAY to `onion`. Without this line that surface stops
   * resolving — the one thing a naming change must never cost.
   */
  const al = [...(aliasesOf.get(n.node) ?? [])];
  if (display !== n.node) al.push(n.node);
  if (al.length) {
    L.push(`    aliases:`);
    for (const a of [...new Set(al)].sort()) L.push(`      - ${y(a)}`);
  }
}

/** Only relations whose BOTH ends are real nodes; a dangling edge is a bug. */
const known = (name: string) => idOf.has(name);
/** Both ends resolved, or the caller has already skipped the row. */
const pair = (a: string, b: string) => `[${y(ref(a)!)}, ${y(ref(b)!)}]`;

L.push(``);
L.push(`# Relations, not nesting. A node can be narrower than one thing and derived`);
L.push(`# from another, and a tree cannot say that. Every edge is DIRECTIONAL —`);
L.push(`# see src/ontology/edges.ts for what each direction means at match time.`);
L.push(`relations:`);

L.push(`  # narrow -> broad. A recipe wanting the broad node is satisfied by the`);
L.push(`  # narrow one; never the reverse. Kimchi made with table salt fails.`);
L.push(`  is_a:`);
for (const [narrow, broad] of IS_A) {
  if (!known(narrow) || !known(broad)) { dropped.push(`is_a ${narrow} -> ${broad}`); continue; }
  L.push(`    - ${pair(narrow, broad)}`);
}

L.push(`  # part -> whole. Owning the whole satisfies a recipe wanting the part.`);
L.push(`  derives_from:`);
for (const d of DERIVES) {
  if (!known(d.part) || !known(d.whole)) { dropped.push(`derives_from ${d.part} -> ${d.whole}`); continue; }
  L.push(`    - ${pair(d.part, d.whole)}${d.note ? `   # ${d.note}` : ""}`);
}

L.push(`  # Acceptable stand-in, NOT identity — kept separate so a recipe can keep`);
L.push(`  # its own word. Weighted below an exact hit at match time.`);
L.push(`  substitutes_for:`);
for (const s of SUBSTITUTES_FOR) {
  if (!known(s.a) || !known(s.b)) { dropped.push(`substitutes_for ${s.a} <-> ${s.b}`); continue; }
  L.push(`    - ${pair(s.a, s.b)}   # ${s.why}`);
}

/** One surface, one node. Two owners means the matcher's answer is a coin flip. */
const owner = new Map<string, string>();
const ambiguous: string[] = [];
for (const [node, list] of aliasesOf)
  for (const a of list) {
    const key = a.toLowerCase();
    if (owner.has(key) && owner.get(key) !== node)
      ambiguous.push(`"${a}" is claimed by both ${owner.get(key)} and ${node}`);
    else owner.set(key, node);
  }

writeFileSync(OUT, L.join("\n") + "\n");

writeFileSync(OUT_JSON, JSON.stringify({
  schema: 1,
  ingredients: nodes.map((n) => {
    const id = idOf.get(n.node)!;
    const slot = slotParents.has(n.node);
    return {
      id, slug: slugOf.get(n.node) ?? "", name: displayNameFor(n.node, AGGREGATES),
      ...(GLOSSES.has(n.node) ? { gloss: GLOSSES.get(n.node) } : {}),
      mentions: n.mentions,
      ...(guessKind(n.node) ? { kind: guessKind(n.node), kind_reviewed: false } : {}),
      ...(allergensOf(n.node).length ? { allergens: allergensOf(n.node) } : {}),
      ...(animalSourceOf(n.node) ? { animal_source: animalSourceOf(n.node) } : {}),
      ...(slot ? { slot: true, choices: (slotChildren.get(n.node) ?? []).map(ref).filter(Boolean) } : {}),
      aliases: [...new Set([
        ...(aliasesOf.get(n.node) ?? []),
        // Same rule as the YAML: the corpus spelling must keep resolving.
        ...(displayNameFor(n.node, AGGREGATES) !== n.node ? [n.node] : []),
      ])].sort(),
    };
  }),
  /**
   * Retired id → the id that replaced it — INGREDIENT-SPEC §1.
   *
   * "Resolution follows redirects transitively, forever. A pantry row written
   * in 2026 still resolves in 2030." That promise needs the map to reach the
   * app, and it did not: the ontology shipped only live ids, so a pantry row
   * holding a retired one silently stopped matching. Emitted flattened, so a
   * reader needs one lookup and cannot get the transitive walk wrong.
   */
  redirects: (() => {
    const reg = Registry.load();
    const liveIds = new Set(nodes.map((n) => idOf.get(n.node)).filter(Boolean) as string[]);
    return Object.fromEntries(
      reg.all()
        .filter((r) => r.retired_to)
        .map((r) => [r.id, reg.resolve(r.id)] as const)
        .filter(([, to]) => liveIds.has(to)),
    );
  })(),
  relations: {
    is_a: IS_A.filter(([a, b]) => known(a) && known(b)).map(([a, b]) => [ref(a), ref(b)]),
    derives_from: DERIVES.filter((d) => known(d.part) && known(d.whole))
      .map((d) => [ref(d.part), ref(d.whole)]),
    substitutes_for: SUBSTITUTES_FOR.filter((s2) => known(s2.a) && known(s2.b))
      .map((s2) => [ref(s2.a), ref(s2.b)]),
  },
}) + "\n");

console.log(`
wrote data/ontology/ontology.yaml

  ingredients   ${String(nodeCount).padStart(5)}
  aliases       ${String(aliasCount).padStart(5)}
  slots         ${String(slotParents.size).padStart(5)}
  excluded      ${String(candidateCount).padStart(5)}  unreviewed candidates`);
/**
 * Nodes that now share a display name — NORMALIZATION, "Number".
 *
 * The number rule did not create these. `eggs` (650 mentions) and `egg` (431)
 * were already two ids for one ingredient, and the matcher cannot cross that
 * gap: a recipe wanting one is not satisfied by a pantry holding the other.
 * Collapsing the display is only what made it visible.
 *
 * NOT auto-merged. INGREDIENT-SPEC §1 makes a merge a review decision — the
 * loser is retired behind a redirect so a pantry row written years ago still
 * resolves — and inventing that silently is exactly what §1 forbids.
 */
{
  const byDisplay = new Map<string, Array<{ node: string; mentions: number }>>();
  for (const n of nodes) {
    const d = displayNameFor(n.node, AGGREGATES).toLowerCase();
    const list = byDisplay.get(d) ?? [];
    list.push({ node: n.node, mentions: n.mentions });
    byDisplay.set(d, list);
  }
  const total = (v: Array<{ mentions: number }>) => v.reduce((a, x) => a + x.mentions, 0);
  const clashes = [...byDisplay].filter(([, v]) => v.length > 1)
    .sort((a, b) => total(b[1]) - total(a[1]));
  {
    const qc = resolve(ROOT, "data/qc");
    mkdirSync(qc, { recursive: true });
    const q = (x: string) => `"${x.replace(/"/g, '""')}"`;
    const rows = ["display_name,nodes,mentions_total"];
    for (const [d, v] of clashes) {
      rows.push([q(d), q(v.map((x) => `${x.node} (${x.mentions})`).join(" | ")), total(v)].join(","));
    }
    // Always written, even when empty. Writing only on failure leaves a stale
    // file insisting on a problem that has since been fixed — which is how a
    // report stops being read.
    writeFileSync(resolve(qc, "name-collisions.csv"), rows.join("\n") + "\n");
    if (clashes.length) {
      const n = clashes.reduce((a, c) => a + c[1].length, 0);
      console.log(`\n  ${clashes.length} display-name collisions across ${n} nodes —`);
      console.log(`  two ids for one ingredient, split only by number. The matcher cannot cross it.`);
      console.log(`  data/qc/name-collisions.csv. Merging is a review decision (INGREDIENT-SPEC §1).`);
    }
  }
}

if (ambiguous.length) {
  console.log(`\n  ${ambiguous.length} ambiguous alias(es) — one surface, two nodes:`);
  for (const a of ambiguous) console.log(`    ${a}`);
}
if (dropped.length) {
  console.log(`\n  ${dropped.length} relation(s) dropped — one end is not a node:`);
  for (const d of dropped) console.log(`    ${d}`);
  console.log(`  Either promote the missing node or remove the edge; a dangling edge`);
  console.log(`  is an edge that silently never fires.`);
}
