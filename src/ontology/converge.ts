/**
 * Pull the long tail of the ingredient vocabulary onto the terms the corpus
 * actually uses — INGREDIENT-SPEC §1, and the reviewer's standing ask that
 * curation CONVERGE the vocabulary rather than record its divergence.
 *
 *   npm run converge -- --emit --limit 200   # a trial slice
 *   npm run converge -- --emit               # the whole tail
 *   npm run converge -- --answers            # ingest, check, write proposals
 *
 * ── The shape of the problem ───────────────────────────────────────────────
 *
 *   2,872 nodes · 277 of them carry 21+ recipes · 2,081 carry five or fewer
 *
 * That tail is three different things wearing one shape, and the whole point of
 * this pass is that they get three different answers:
 *
 *   debris     `skin on`, `oil spray`, `juice`, `sweetener`. A parse that ended
 *              mid-phrase, or a word so generic it names nothing. An ALIAS onto
 *              the node the line was really about, or nothing at all.
 *   narrower   `perilla seed oil`, `caster sugar`, `beef stew meat`. Real
 *              ingredients, correctly distinct, that a cook holding the broad
 *              node would accept. An IS_A edge — merging them would lose a
 *              distinction the cook can see.
 *   distinct   `misugaru`, `pollock`. Its own thing, low-use because the corpus
 *              is small, not because the node is wrong. Nothing to do.
 *
 * Most of the mechanical half is already done and is not redone here: number and
 * punctuation variants collapse in `numberKey`, and `merge-numbers` has taken
 * the node table to zero collisions under that key.
 *
 * One mechanical case survives that and IS handled here, because nothing else
 * can: `normalize.ts` deliberately keeps a short list of words plural, so
 * `soybean sprout` and `soybean sprouts` are two nodes with two different keys.
 * `keepPluralTwins` folds those without asking anyone — see its own note for why
 * the asked pass is structurally unable to.
 *
 * Everything else is the half a rule cannot reach, which is why it is asked.
 *
 * ── Why the answer is never a merge ────────────────────────────────────────
 *
 * Nothing here writes to `nodes.csv`, `aliases.csv` or `is_a.csv`. §1 reserves
 * minting and retiring identity to review, and the reason is not ceremony: an
 * alias is a claim that two names are ONE pantry item, and a wrong one makes a
 * user's pantry satisfy a recipe it cannot cook. The output is two proposal
 * files in the shapes `promote` and `hierarchy-apply` already read.
 *
 * ── Transport ──────────────────────────────────────────────────────────────
 *
 * Files, as in `classify.ts` and `hierarchy-llm.ts`'s `--emit`/`--answers`: the
 * batches are written to disk, answered in a Claude session, and read back. A
 * batch on disk is a reviewable artefact — you can read what was asked, which
 * matters more here than anywhere else, because a bad question about identity
 * produces a confident wrong answer.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { KEEP_PLURAL } from "./normalize.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ONT = resolve(ROOT, "data/ontology");
const QC = resolve(ROOT, "data/qc");
const ASK = resolve(QC, "converge-ask");
const ANSWERS = resolve(QC, "converge-answers");

/** Five or fewer recipes: the tail this pass is about. */
const TAIL = 5;
/** Twenty-one or more: the terms a fold is allowed to land on. */
const HOST = 21;
/**
 * Nodes per batch. Larger than `classify`'s 25 because a row here is one name
 * and one example line, not a recipe — but not so large that the shared host
 * list stops being re-read for every row.
 */
const BATCH = 60;

const argOf = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const EMIT = process.argv.includes("--emit");
const USE_ANSWERS = process.argv.includes("--answers");
const LIMIT = Number(argOf("--limit") ?? 0) || 0;

/**
 * `--band 6-20` — run the same pass over a different slice of the vocabulary.
 *
 * The default 1-5 tail is a QUEUE: 2,081 rows, mostly debris, skimmed. The
 * 6-20 band is not the same problem wearing a different number. Those 368 nodes
 * average ten recipes each, and that inverts the risk — a bad merge at one use
 * misfiles one recipe, the same merge at twenty quietly changes what twenty
 * recipes claim a pantry can cook. The band where a fold is most worth making
 * is the band where getting it wrong costs most.
 *
 * So it is a separate run writing separate files, read on separate terms:
 * 368 rows is one sitting at a desk, not a queue to get through.
 */
const [BAND_LO, BAND_HI] = (() => {
  const b = argOf("--band");
  if (!b) return [1, TAIL];
  const m = /^(\d+)-(\d+)$/.exec(b);
  if (!m) { console.error(`--band wants lo-hi, e.g. --band 6-20`); process.exit(1); }
  return [Number(m![1]), Number(m![2])];
})();
/** File prefix, so a band run never overwrites the tail run's batches. */
const TAG = BAND_HI === TAIL && BAND_LO === 1 ? "" : `b${BAND_LO}-${BAND_HI}-`;

// ── the vocabulary, with its weights ─────────────────────────────────────────

type Node = { id: string; name: string; kind?: string };

function vocabulary() {
  const ont = JSON.parse(readFileSync(resolve(ONT, "ontology.json"), "utf8")) as
    { ingredients: Node[] };
  const idx = JSON.parse(readFileSync(resolve(ONT, "recipe-index.json"), "utf8")) as
    { recipes: Array<{ requires: string[]; optional?: string[] }> };

  /*
    Counted per RECIPE, not per line: a recipe naming scallion twice wants
    scallion once. `data.ts` makes the same point about why the raw line count
    is the wrong number to show a human.
  */
  const uses = new Map<string, number>();
  for (const r of idx.recipes)
    for (const id of new Set([...r.requires, ...(r.optional ?? [])]))
      uses.set(id, (uses.get(id) ?? 0) + 1);

  const n = (i: Node) => uses.get(i.id) ?? 0;
  return {
    all: ont.ingredients,
    uses,
    /** Ordered by weight — the shared list every batch reasons against. */
    hosts: ont.ingredients.filter((i) => n(i) >= HOST).sort((a, b) => n(b) - n(a)),
    /* `used 0` is excluded deliberately. A node no recipe reaches is not a
       convergence problem, it is a dead row, and folding it changes nothing a
       user can see. */
    tail: ont.ingredients.filter((i) => n(i) >= BAND_LO && n(i) <= BAND_HI)
      .sort((a, b) => n(b) - n(a) || a.name.localeCompare(b.name)),
  };
}

/**
 * One raw line per tail node, as it actually appeared in a recipe.
 *
 * This is the single most useful thing in the batch. `skin on` reads as an
 * ingredient until you see the line it came from, and no amount of prompt
 * wording substitutes for the evidence.
 */
function exampleLines(): Map<string, string> {
  const f = resolve(ONT, "recipe-lines.json");
  const out = new Map<string, string>();
  if (!existsSync(f)) return out;
  const lines = JSON.parse(readFileSync(f, "utf8")) as
    Record<string, Array<{ raw: string; node: string | null }>>;
  for (const rows of Object.values(lines))
    for (const l of rows)
      if (l.node && !out.has(l.node)) out.set(l.node, l.raw);
  return out;
}

/**
 * Node pairs that are one ingredient split by `KEEP_PLURAL` — derived, not asked.
 *
 * `numberKey` collapses `eggs` onto `egg`, but `normalize.ts` deliberately keeps
 * a short list of words plural — `sprouts`, `noodles`, `greens`, `chives` — so
 * `soybean sprout` and `soybean sprouts` are two nodes on purpose. That is right
 * for the canonical NAME and wrong for identity: they are the same packet, and
 * the singular is the surface a recipe line happened to use.
 *
 * The model cannot fix these. A fold target has to be a common term, and both
 * halves of `instant noodle(2)` ↔ `instant noodles(2)` are rare — so the pass
 * that asks would leave the pair standing however well it answered. This is
 * arithmetic, so it is computed: the heavier side wins, and the lighter becomes
 * an alias onto it.
 *
 * Emitted as proposals like everything else here. Deterministic is not the same
 * as authorised — §1 still reserves the merge to review.
 */
function keepPluralTwins(all: Node[], uses: Map<string, number>) {
  const byName = new Map(all.map((i) => [i.name.toLowerCase(), i]));
  const out: Array<{ from: Node; to: Node }> = [];
  for (const i of all) {
    const t = i.name.toLowerCase().split(" ");
    const last = t[t.length - 1]!;
    // Only the singular side is examined, so each pair is seen exactly once.
    if (!KEEP_PLURAL.has(`${last}s`)) continue;
    const twin = byName.get([...t.slice(0, -1), `${last}s`].join(" "));
    if (!twin) continue;
    const [from, to] = (uses.get(i.id) ?? 0) <= (uses.get(twin.id) ?? 0)
      ? [i, twin] : [twin, i];
    out.push({ from, to });
  }
  return out;
}

/**
 * Common terms that must never be a fold target, however plausible the row.
 *
 * Each is a name that means one thing in the corpus and something broader in
 * English, so an edge onto it is a false statement dressed as a hierarchy:
 *
 *   pepper   is the black seasoning here. `green pepper is_a pepper` — proposed
 *            in the first trial batch — would let a pantry holding peppercorns
 *            satisfy a recipe wanting a green chilli. `vocab-triage` already
 *            refuses this parent for the same reason.
 *   oil      is neutral cooking oil. Sesame oil is a flavouring, not a fat you
 *            fry in, and the substitution runs one way at best.
 *   milk     is dairy. `coconut milk is_a milk` is the case INGREDIENT-SPEC
 *            §3a names as the test an is_a edge has to pass and fail.
 *   sugar / salt / vinegar / flour  are the same shape of trap one step down:
 *            a real distinction the matcher would erase.
 *
 * The model is told about several of these in the prompt. This is the check
 * that does not depend on it having listened.
 */
const NEVER_A_TARGET = new Set(["pepper", "oil", "milk", "salt", "sugar",
                                "vinegar", "flour", "sauce", "stock", "broth",
                                "wine", "paste", "powder", "juice"]);

const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((c) => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n") + "\n";

// ── the prompt ───────────────────────────────────────────────────────────────

function prompt(hosts: string, rows: string[], out: string): string {
  return `You are converging the ingredient vocabulary of a Korean-first pantry-to-recipe matcher. Your answers become a REVIEW QUEUE — a human reads every one before anything is merged. Propose honestly; a wrong merge makes someone's pantry claim it can cook a dish it cannot.

Below is a list of rarely-used ingredient names, each with an example of the recipe line it was parsed from. For each one, decide what it should become.

## The three answers

- \`same\` — the SAME pantry item as a common term, said differently. A shopper buying one buys the other. Parse debris that ended mid-phrase (\`skin on\`, \`to taste\`), a qualifier that names no separate product (\`fresh garlic\` → garlic), a regional or romanised name for the same packet (\`daepa\` → asian leek). Give the common term as \`target\`.

- \`narrower\` — a REAL, narrower ingredient that a cook holding the common term would usually accept, with a glance at the recipe. \`caster sugar\` is sugar; \`beef stew meat\` is beef. Distinct enough that merging would lose something a cook can see, close enough that the pantry should still match. Give the broader common term as \`target\`.

- \`distinct\` — its own ingredient, rare only because the corpus is small. \`misugaru\`, \`perilla seed oil\`, \`doenjang\`. Also use this when the nearest common term would be WRONG: coconut milk is not milk, garlic salt is not garlic, sesame oil is not oil in the sense the oil node means. Leave \`target\` empty.

## The test that decides between \`same\` and \`narrower\`

Ask: **would a shopper buy the same product?** Same product → \`same\`. Different product on the shelf, but one substitutes for the other → \`narrower\`. Different product and no substitution → \`distinct\`.

\`same\` is the strong claim. When you are unsure between \`same\` and \`narrower\`, answer \`narrower\` — an is_a edge that should have been an alias costs a redundant node; an alias that should have been an edge destroys a distinction and cannot be seen once merged.

## Rules on \`target\`

- It must be copied EXACTLY from the common-terms list below. Anything else is dropped.
- A head noun that merely appears in the name is not a target. \`garlic salt\` ends in salt and is a salt; \`garlic chives\` ends in chives and is not garlic. Read the name, not its substrings.
- Nationality prefixes are usually not narrowing: \`korean pear\` is a real distinct fruit, \`korean garlic\` is garlic.
- If nothing in the list fits, answer \`distinct\` rather than reaching for the closest word.
- These words are never valid targets, because each means ONE specific thing in this corpus and something broader in English: **pepper** (the black seasoning — a green chilli is not a kind of it), **oil** (neutral frying oil — sesame oil is a flavouring), **milk** (dairy), **salt**, **sugar**, **flour**, **vinegar**, **sauce**, **stock**, **broth**, **wine**, **paste**, **powder**, **juice**. Answer \`distinct\`, or name a more specific common term.

# Common terms — the only permitted targets
(name, followed by how many recipes use it)

${hosts}

# Rare names to place

${rows.join("\n")}

# Answer with exactly this, and nothing else

Write the JSON to \`${out}\`, one object per rare name above, in the same order:

\`\`\`json
{"placements": [
  {"name": "caster sugar", "verdict": "narrower", "target": "granulated sugar", "confidence": "high", "why": "finer grind of the same sweetener; a cook would use either"},
  {"name": "misugaru", "verdict": "distinct", "target": "", "confidence": "high", "why": "roasted multigrain powder, not a form of any common term"}
]}
\`\`\`

\`confidence\` is high, medium or low. \`why\` is one clause. Include every name, including the ones you left \`distinct\`.
`;
}

// ── emit ─────────────────────────────────────────────────────────────────────

function emit() {
  const { hosts, tail, uses } = vocabulary();
  const example = exampleLines();
  const slice = LIMIT ? tail.slice(0, LIMIT) : tail;

  mkdirSync(ASK, { recursive: true });
  mkdirSync(ANSWERS, { recursive: true });

  const hostList = hosts.map((h) => `${h.name} (${uses.get(h.id)})`).join("\n");

  let n = 0;
  for (let i = 0; i < slice.length; i += BATCH) {
    const rows = slice.slice(i, i + BATCH).map((t) => {
      const line = example.get(t.id);
      return `- ${t.name}  ·  ${uses.get(t.id)} recipe(s)` +
        (line ? `\n    seen as: ${line.replace(/\s+/g, " ").trim().slice(0, 120)}` : "");
    });
    n++;
    const tag = `${TAG}${String(n).padStart(3, "0")}`;
    writeFileSync(resolve(ASK, `${tag}.md`),
      prompt(hostList, rows, `data/qc/converge-answers/${tag}.json`));
  }

  console.log(`${hosts.length} common terms (${HOST}+ recipes) · ${tail.length} names used ${BAND_LO}-${BAND_HI}`);
  console.log(`wrote ${n} batch(es) of ${BATCH} to data/qc/converge-ask/`);
  console.log(`\nThen: npm run converge -- --answers`);
}

// ── answers ──────────────────────────────────────────────────────────────────

type Placement = {
  name?: string; verdict?: string; target?: string;
  confidence?: string; why?: string;
};

function ingest() {
  if (!existsSync(ANSWERS)) { console.log("no answers yet"); return; }
  /* Only this run's band. A tail answer read into a band report — or the
     reverse — would mix two passes the whole point of `--band` is to keep
     apart. */
  const files = readdirSync(ANSWERS)
    .filter((f) => f.endsWith(".json") && (TAG ? f.startsWith(TAG) : /^\d/.test(f)))
    .sort();
  if (!files.length) { console.log("no answer files yet"); return; }

  const { all, hosts, tail, uses } = vocabulary();
  const byName = new Map(all.map((i) => [i.name.toLowerCase(), i]));
  const isTail = new Set(tail.map((t) => t.name.toLowerCase()));
  const isHost = new Set(hosts.map((h) => h.name.toLowerCase()));

  const aliases: (string | number)[][] = [["surface", "node", "source", "note"]];
  /* Derived first, so a reviewer meets the certain rows before the argued ones.
     `source` says `twin` rather than `review` because these were not asked — the
     column has to say where a row came from or the file stops being evidence. */
  /* Twins are global, not band-scoped — computed from the whole node table, so
     a `--band` run would repeat rows the default run already proposed. They
     belong to the default run only, or a reviewer meets the same eight twice. */
  const twins = TAG ? [] : keepPluralTwins(all, uses);
  for (const t of twins)
    aliases.push([t.from.name, t.to.name, "twin",
                  `converge: KEEP_PLURAL split one ingredient in two (${uses.get(t.from.id) ?? 0} vs ${uses.get(t.to.id) ?? 0} recipes)`]);
  const twinNames = new Set(twins.map((t) => t.from.name.toLowerCase()));
  const edges: (string | number)[][] = [["child", "parent", "relation", "verdict", "why"]];
  const rejected: (string | number)[][] = [["file", "name", "verdict", "target", "why"]];
  let read = 0, distinct = 0;

  for (const f of files) {
    let parsed: { placements?: Placement[] };
    try {
      parsed = JSON.parse(readFileSync(resolve(ANSWERS, f), "utf8"));
    } catch (e) {
      rejected.push([f, "", "", "", `unparseable JSON: ${(e as Error).message}`]);
      continue;
    }
    for (const p of parsed.placements ?? []) {
      read++;
      const name = (p.name ?? "").toLowerCase();
      const target = (p.target ?? "").toLowerCase();

      // The name must be one we asked about — a model that invents a row is
      // proposing an identity claim about a node that may not exist.
      if (!isTail.has(name)) { rejected.push([f, p.name ?? "", p.verdict ?? "", p.target ?? "", "not a name we asked about"]); continue; }
      if (twinNames.has(name)) continue;   // already folded, deterministically
      if (p.verdict === "distinct") { distinct++; continue; }

      if (!isHost.has(target)) {
        rejected.push([f, p.name ?? "", p.verdict ?? "", p.target ?? "", "target is not a common term"]);
        continue;
      }
      // A node cannot be its own parent, and the check is cheap next to the
      // cost of a self-edge reaching `is_a.csv`.
      if (target === name) { rejected.push([f, p.name ?? "", p.verdict ?? "", p.target ?? "", "self"]); continue; }
      if (NEVER_A_TARGET.has(target)) {
        rejected.push([f, p.name ?? "", p.verdict ?? "", p.target ?? "", "ambiguous target — see NEVER_A_TARGET"]);
        continue;
      }

      const canonical = byName.get(target)!.name;
      const why = (p.why ?? "").replace(/\s+/g, " ").trim();
      if (p.verdict === "same")
        aliases.push([byName.get(name)!.name, canonical, "review", `converge: ${why}`]);
      else if (p.verdict === "narrower")
        edges.push([byName.get(name)!.name, canonical, "is_a", "review", `converge: ${why}`]);
      else
        rejected.push([f, p.name ?? "", p.verdict ?? "", p.target ?? "", "verdict outside same/narrower/distinct"]);
    }
  }

  mkdirSync(QC, { recursive: true });
  writeFileSync(resolve(QC, `converge-${TAG}aliases.csv`), csv(aliases));
  writeFileSync(resolve(QC, `converge-${TAG}hierarchy.csv`), csv(edges));

  const folded = aliases.length - 1, narrowed = edges.length - 1;
  const usesOf = (rows: (string | number)[][]) => rows.slice(1)
    .reduce((s, r) => s + (uses.get(byName.get(String(r[0]).toLowerCase())?.id ?? "") ?? 0), 0);

  console.log(`${files.length} answer file(s) · ${read} rows read of ${tail.length} rare names\n`);
  console.log(`  twin       ${String(twins.length).padStart(4)}  derived, not asked — a KEEP_PLURAL split`);
  console.log(`  same       ${String(folded).padStart(4)}  → converge-${TAG}aliases.csv    (${usesOf(aliases)} recipe uses)`);
  console.log(`  narrower   ${String(narrowed).padStart(4)}  → converge-${TAG}hierarchy.csv  (${usesOf(edges)} recipe uses)`);
  console.log(`  distinct   ${String(distinct).padStart(4)}  left alone`);
  if (rejected.length > 1) {
    writeFileSync(resolve(QC, `converge-${TAG}rejected.csv`), csv(rejected));
    console.log(`  rejected   ${String(rejected.length - 1).padStart(4)}  → converge-${TAG}rejected.csv`);
  }
  console.log(`\nBoth files carry verdict=review and are PROPOSALS. Nothing is merged until
a human moves rows into data/ontology/aliases.csv or applies the edges — §1
keeps identity out of a script's hands, and this script is not an exception.`);
}

if (EMIT) emit();
else if (USE_ANSWERS) ingest();
else console.log(`npm run converge -- --emit [--limit N]   ask where the rare names belong
npm run converge -- --answers             ingest → two review files
npm run converge -- --emit --band 6-20    the established-terms band, read separately`);
