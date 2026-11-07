/**
 * Draft the SEMANTIC half of the is_a hierarchy — INGREDIENT-SPEC §3a (DRAFT).
 *
 *   npm run hierarchy-llm -- --emit       # write the questions, ask nobody
 *   npm run hierarchy-llm -- --answers    # ingest hand-written answers
 *   npm run hierarchy-llm -- --limit 80   # a cheap trial slice
 *   npm run hierarchy-llm                 # ask the API for the whole list
 *
 * ── Two transports, one set of checks ──────────────────────────────────────
 *
 * The model can be reached two ways and it does not matter which:
 *
 *   --emit / --answers   write the batches to `data/qc/llm-ask/`, answer them
 *                        in a Claude session, drop the JSON in
 *                        `data/qc/llm-answers/`. No API key, no metered call.
 *   (no flag)            the same batches over the Messages API.
 *
 * Everything after the answer arrives — the ontology re-check, the cycle
 * check, the trap flags, the two-file split — is shared. A proposal is not
 * more trustworthy for having been billed.
 *
 * Writes `data/qc/hierarchy-llm.csv` and `data/qc/hierarchy-llm-new-nodes.csv`.
 * **Proposals, not edges** — the same standing as `hierarchy.ts`, and for the
 * same reason: a wrong is_a edge is not a bad ranking, it makes one ingredient
 * satisfy a recipe that needs a different one.
 *
 * ── Why an LLM, when hierarchy.ts exists ───────────────────────────────────
 *
 * `hierarchy.ts` derives an edge when one node's name is a token-suffix of
 * another — `light soy sauce` is_a `soy sauce`. That covers 1,570 of 2,885
 * nodes and cannot, even in principle, reach the case that motivated §3a:
 *
 *     basa is_a white fish
 *
 * Nothing in either name says so. The relation lives in what the words MEAN,
 * so a lexical rule is the wrong instrument and no amount of tuning fixes it.
 *
 * ── Three relations, and only one of them is a hierarchy ───────────────────
 *
 * A first pass conflated three things under `is_a`, and the conflation is not
 * cosmetic — an is_a edge between two names for ONE ingredient is simply a
 * false statement, and it lands in the matcher as a disclosure the user does
 * not need ("recipe wants katsuobushi, you have bonito flakes") for what is
 * the same packet.
 *
 *   is_a       a KIND of. `salmon is_a fish`. Two ingredients; one is
 *              narrower. This is the only relation the hierarchy holds.
 *
 *   same_as    ONE ingredient wearing two names — `bonito flakes` and
 *              `katsuobushi`, `rice cake` and `tteok`, `maesilaek` and
 *              `maesil syrup`. That is the ALIAS TABLE's job, and the repo
 *              already has the machinery: an alias row, then `promote` drops
 *              the loser and `build-ontology` retires its id behind a
 *              redirect. Written here in `aliases.csv`'s own shape.
 *
 *   spelling   `guchugaru` for gochugaru, `jalape o` for a jalapeño that lost
 *              its accent, `soybean sprout` for `soybean sprouts`. Number,
 *              punctuation and typos are what `numberKey` and the typeahead
 *              are FOR. Not ontology, and not something a model should be
 *              asked to adjudicate one row at a time — so these are reported
 *              as a count and left to the tools that already handle them.
 *
 * ── The two jobs within the hierarchy proper ───────────────────────────────
 *
 * Sizing the gap turned up something that changes the shape of the answer:
 * `white fish` is not a node. Neither is `shellfish`. So the motivating example
 * cannot be expressed as a link between things the ontology already has, and
 * the work splits in two with very different risk:
 *
 *   hierarchy-llm.csv            child → an EXISTING confirmed node.
 *                                 `salmon is_a fish`. Cheap to review, and
 *                                 wrong-but-accepted only mis-ranks.
 *
 *   hierarchy-llm-new-nodes.csv  child → a category that DOES NOT EXIST yet.
 *                                 `basa is_a white fish`. Accepting one MINTS
 *                                 A NODE, which §1 reserves to review, so it
 *                                 is a separate file read on separate terms.
 *
 * Mixing them would hide the second kind inside the volume of the first.
 *
 * ── What is asked of the model, and what is checked afterwards ─────────────
 *
 * The prompt states the operational test rather than the taxonomy: an edge
 * means a pantry holding CHILD may be offered a recipe calling for PARENT,
 * with disclosure. That is what §3a's edges actually DO, and asking the
 * question in those terms is what keeps `coconut milk is_a milk` out — under
 * biology it is arguable, under "may a dairy-free pantry satisfy this" it is
 * not.
 *
 * Nothing is trusted on the model's word. Every returned row is re-checked
 * here against the ontology: the child must be a confirmed node, a non-new
 * parent must be a confirmed node, self-edges go, duplicates of the derived
 * pass go, and anything that would close a CYCLE goes — `fish is_a salmon`
 * alongside `salmon is_a fish` is a plausible pair of individually-reasonable
 * answers and a broken graph. The lexical traps `hierarchy.ts` already knows
 * about are re-applied as annotations on whatever survives.
 *
 * Roots are expected and normal. `salt`, `sugar` and `garlic` are the three
 * largest orphans in the corpus and correctly have no parent — the prompt says
 * so, because a model asked to fill in a column will fill in the column.
 *
 * ── Cost ───────────────────────────────────────────────────────────────────
 *
 * The node list is the whole system prompt and is identical across every
 * batch, so it is cached (DECISIONS.md §3: "Cache the ontology system
 * prompt"). Responses are also cached to disk by content hash, so a re-run
 * after a crash — or after editing only the tail of the worklist — pays for
 * nothing it has already bought. Delete `data/qc/llm-cache/` to force a redo.
 */
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { numberKey } from "./naming.js";
import { SYNONYM } from "./exceptions.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ONT = resolve(ROOT, "data/ontology");
const QC = resolve(ROOT, "data/qc");
const CACHE = resolve(QC, "llm-cache");
const ASK = resolve(QC, "llm-ask");
const ANSWERS = resolve(QC, "llm-answers");

/** DECISIONS.md §3 fixes the model for ontology work. */
const MODEL = "claude-opus-5";
/**
 * Closed-list classification with a stated test, under human review either
 * way. `medium` is the cost-sane setting; override when a run reads badly.
 */
const EFFORT = (process.env["HIERARCHY_EFFORT"] ?? "medium") as
  "low" | "medium" | "high" | "xhigh" | "max";
const BATCH = 40;
const CONCURRENCY = 4;

const argOf = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DRY = process.argv.includes("--dry");
const EMIT = process.argv.includes("--emit");
const USE_ANSWERS = process.argv.includes("--answers");
const LIMIT = Number(argOf("--limit") ?? 0) || 0;

// ── csv ──────────────────────────────────────────────────────────────────────

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

// ── the traps hierarchy.ts already knows ─────────────────────────────────────

const ANIMAL_HEAD = new Set(["milk", "butter", "cream", "cheese", "yogurt", "yoghurt"]);
const PLANT_SOURCE = new Set(["coconut", "almond", "soy", "soya", "oat", "rice",
                              "cashew", "peanut", "sesame", "hemp", "macadamia",
                              "hazelnut", "walnut", "pea", "flax", "cocoa", "shea",
                              "apple", "nut", "seed"]);
const ORIGIN_TRAP = /^(korean|japanese|chinese|thai|vietnamese|indian|mexican|italian|french)\b/;

// ── the schema the model must answer in ──────────────────────────────────────

/**
 * `additionalProperties: false` and a full `required` on every object — the
 * API rejects a schema without them. No numeric bounds: structured outputs
 * does not support them, and `confidence` is an enum here anyway, matching
 * what `weee/vocabulary.csv` already writes.
 */
const SCHEMA = {
  type: "object",
  properties: {
    proposals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          child: { type: "string", description: "Exactly as given in the list." },
          relation: {
            type: "string",
            enum: ["is_a", "same_as"],
            description: "is_a when the child is a KIND of the parent. same_as " +
              "when the two names denote ONE ingredient.",
          },
          parent: {
            type: "string",
            description: "The broader ingredient. Must be copied exactly from " +
              "the known-ingredients list unless parent_is_new is true.",
          },
          parent_is_new: {
            type: "boolean",
            description: "True only when the parent is NOT in the known list " +
              "and you are proposing it as a new category.",
          },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          reason: {
            type: "string",
            description: "One clause. Why a cook holding the child would accept " +
              "a recipe calling for the parent.",
          },
        },
        required: ["child", "relation", "parent", "parent_is_new", "confidence", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["proposals"],
  additionalProperties: false,
} as const;

const SYSTEM_INSTRUCTIONS = `You are drafting is_a edges for the ingredient ontology behind a pantry-to-recipe matcher. Your output is a review queue, not a database write.

WHAT AN EDGE MEANS — this is the test, not biological taxonomy.
"child is_a parent" means: a user whose pantry holds CHILD may be shown a recipe calling for PARENT, with a note telling them to check the recipe before cooking. Propose an edge only when a cook would accept that substitution.

The direction matters. The child is the SPECIFIC thing, the parent is the BROADER category. "salmon is_a fish", never "fish is_a salmon".

TWO NAMES FOR ONE INGREDIENT IS NOT A HIERARCHY — set relation to same_as.
This is the most common way to get this wrong. If the two names denote the SAME ingredient, there is no broader and narrower, and an is_a edge between them is a false statement. Set relation to "same_as" instead. Cases:
- a translation or romanisation: "bonito flakes" and "katsuobushi", "rice cake" and "tteok", "maesilaek" and "maesil syrup"
- a longhand or shorthand of one product: "miso paste" and "miso", "ginger root" and "ginger", "panko bread crumbs" and "panko"
- a regional or brand name for the same thing: "hot pepper flakes" and "chili flakes"

Do NOT report the ones below at all — neither relation. The pipeline already fixes them by rule, and a row here only adds noise:
- singular against plural: "soybean sprout" against "soybean sprouts"
- spacing or punctuation: "beansprouts" against "bean sprouts"
- a typo or an accent lost in scraping: "guchugaru" for gochugaru, "jalape o" for jalapeño, "cr me fra che" for crème fraîche

The test for same_as against is_a: could a shop sell you one packet that satisfies both names? Then same_as. Is one name a whole family of ingredients of which the other is one member? Then is_a.

A different FORM of an ingredient is a judgement call. Ground against whole ("cumin powder" against "cumin") is usually is_a — the recipe wanting cumin is served by the powder, but not every use is interchangeable. Dried against fresh is is_a at best and often neither.

WHEN TO PROPOSE NOTHING.
Most ingredients here are roots and should get no edge at all. salt, sugar, garlic, oil and onion have no broader ingredient a cook would substitute them for. Returning fewer proposals than there are ingredients is the expected outcome. Do not fill in a parent to have filled in a parent.

Also propose nothing when the two are SIBLINGS rather than parent and child. chicken thigh and chicken breast are both parts of chicken; neither is a kind of the other, and a recipe wanting one is not satisfied by the other.

TRAPS, each one a mistake already made against this ontology.
- A shared last word is not shared identity. coconut milk is not milk, peanut butter is not butter, oat cream is not cream. A dairy-free pantry must never satisfy a recipe that needs dairy.
- An origin word can mark a different vegetable, not a variety. korean radish is not a kind of radish.
- A preparation is not the ingredient. chicken stock is not a kind of chicken.

PARENTS.
Prefer a parent from the known-ingredients list, copied EXACTLY. Set parent_is_new to false.

Set parent_is_new to true only when the useful category genuinely does not exist in the list. This is the case that matters most: people put "basa" or "pollock" in a pantry, never "white fish", so a recipe calling for white fish reaches nobody. When you propose a new category, keep it to a term a cook and a shopper would both recognise, and use it consistently across every child that belongs to it.

CONFIDENCE.
high — a cook would accept the substitution without hesitation.
medium — generally right, with cases where it would not hold.
low — plausible, worth a human look, you would not defend it.
Prefer proposing at low confidence over staying silent, EXCEPT where a trap above applies. A reviewer reads every row; they cannot read a row you did not write.`;

// ── data ─────────────────────────────────────────────────────────────────────

type Node = { node: string; mentions: number };

type Proposal = {
  child: string;
  /** `is_a` | `same_as`. Absent on pre-split answer files; treated as is_a. */
  relation?: string;
  parent: string;
  parent_is_new: boolean;
  confidence: string;
  reason: string;
};

function loadNodes(): Node[] {
  return asObjects(readFileSync(resolve(ONT, "nodes.csv"), "utf8"))
    .filter((r) => r["status"] === "confirmed")
    .map((r) => ({ node: r["node"]!, mentions: Number(r["mentions"] || 0) }));
}

/** The derived pass, so we neither re-ask nor contradict it. */
function loadDerived(): Map<string, string> {
  const f = resolve(QC, "hierarchy.csv");
  if (!existsSync(f)) return new Map();
  return new Map(asObjects(readFileSync(f, "utf8"))
    .map((r) => [r["child"]!, r["parent"]!] as const));
}

// ── the call ─────────────────────────────────────────────────────────────────

const sha = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

async function askBatch(
  client: Anthropic,
  system: string,
  children: Node[],
): Promise<Proposal[]> {
  const user = "Propose is_a parents for these ingredients. The number after " +
    "each is how often it appears in the recipe corpus.\n\n" +
    children.map((c) => `${c.node} (${c.mentions})`).join("\n");

  const key = sha(`${MODEL}|${EFFORT}|${system}|${user}`);
  const cached = resolve(CACHE, `${key}.json`);
  if (existsSync(cached)) {
    try { return JSON.parse(readFileSync(cached, "utf8")) as Proposal[]; } catch { /* refetch */ }
  }

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    output_config: {
      effort: EFFORT,
      format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> },
    },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  });

  // A refusal is a 200 with empty content. Reading content[0] would throw a
  // TypeError three frames away from the cause.
  if (response.stop_reason === "refusal") {
    console.warn(`  ! declined (${response.stop_details?.category ?? "no category"}) ` +
      `— skipping ${children.length} ingredient(s)`);
    return [];
  }
  if (response.stop_reason === "max_tokens") {
    console.warn(`  ! hit max_tokens — batch truncated, skipping ${children.length}`);
    return [];
  }

  const text = response.content.find((b) => b.type === "text")?.text ?? "";
  let parsed: { proposals?: Proposal[] };
  try { parsed = JSON.parse(text); } catch {
    console.warn(`  ! unparseable response — skipping ${children.length}`);
    return [];
  }
  const out = Array.isArray(parsed.proposals) ? parsed.proposals : [];

  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
  writeFileSync(cached, JSON.stringify(out));
  return out;
}

/** Fixed-size worker pool — the SDK retries 429s, this stops us causing them. */
async function pool<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  }));
  return out;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const nodes = loadNodes();
  const derived = loadDerived();
  const byName = new Map(nodes.map((n) => [n.node, n]));
  const synonymKeys = new Set(Object.keys(SYNONYM).map(numberKey));

  /**
   * Only nodes the derived pass could not place. A node that already has a
   * suffix parent has a proposal waiting in hierarchy.csv; asking again would
   * buy a second opinion nobody asked for and a contradiction to adjudicate.
   */
  let orphans = nodes
    .filter((n) => !derived.has(n.node))
    .sort((a, b) => b.mentions - a.mentions || a.node.localeCompare(b.node));
  if (LIMIT) orphans = orphans.slice(0, LIMIT);

  const batches: Node[][] = [];
  for (let i = 0; i < orphans.length; i += BATCH) batches.push(orphans.slice(i, i + BATCH));

  const system = SYSTEM_INSTRUCTIONS +
    "\n\nKNOWN INGREDIENTS — copy a parent from this list exactly, unless you " +
    "are proposing a new category.\n\n" +
    nodes.map((n) => n.node).sort().join("\n");

  console.log(`${nodes.length} confirmed nodes, ${derived.size} with a derived parent`);
  console.log(`${orphans.length} without one → ${batches.length} batch(es) of ${BATCH}`);
  console.log(`model ${MODEL}, effort ${EFFORT}, node list ~${Math.round(system.length / 4000)}k tokens (cached)`);

  if (DRY) {
    console.log(`\n(dry run — nothing asked)`);
    console.log(`first batch would ask about: ${batches[0]?.slice(0, 8).map((n) => n.node).join(", ")}…`);
    return;
  }

  /**
   * Write the questions and stop. The answers can then come from a Claude
   * session instead of a metered call — same questions, same checks after.
   */
  if (EMIT) {
    if (!existsSync(ASK)) mkdirSync(ASK, { recursive: true });
    writeFileSync(resolve(ASK, "system.md"), system);
    batches.forEach((b, i) => {
      const n = String(i + 1).padStart(2, "0");
      writeFileSync(resolve(ASK, `${n}.txt`),
        b.map((c) => `${c.node} (${c.mentions})`).join("\n") + "\n");
    });
    console.log(`\nwrote system.md and ${batches.length} batch file(s) to ${ASK}`);
    console.log(`answer each into ${ANSWERS}/NN.json as an array of`);
    console.log(`  {child, parent, parent_is_new, confidence, reason}`);
    console.log(`then: npm run hierarchy-llm -- --answers`);
    return;
  }

  let results: Proposal[][];
  /**
   * Which ingredients actually got looked at. Answering 10 of 33 batches is a
   * normal way to work, and a report that counted the other 23 as "silent"
   * would read as 900 confident roots rather than 900 unasked questions.
   */
  let asked = orphans;

  if (USE_ANSWERS) {
    if (!existsSync(ANSWERS)) {
      console.error(`\nNo answers at ${ANSWERS}. Run --emit first.`);
      process.exit(1);
    }
    const files = readdirSync(ANSWERS).filter((f) => f.endsWith(".json")).sort();
    if (!files.length) { console.error(`\n${ANSWERS} holds no .json files.`); process.exit(1); }
    results = files.map((f) => {
      try {
        const j = JSON.parse(readFileSync(resolve(ANSWERS, f), "utf8"));
        return Array.isArray(j) ? j as Proposal[] : (j.proposals ?? []) as Proposal[];
      } catch (e) {
        // One malformed file must not discard the other thirty-two.
        console.warn(`  ! ${f} is not valid JSON — skipped (${(e as Error).message})`);
        return [];
      }
    });
    // Filename NN.json answers batch NN — that mapping is what makes partial
    // coverage countable.
    asked = files.flatMap((f) => batches[Number(f.replace(/\D+/g, "")) - 1] ?? []);
    console.log(`\nread ${files.length} answer file(s) covering ${asked.length} ingredient(s), ` +
      `${results.flat().length} raw proposal(s)`);
    if (asked.length < orphans.length) {
      console.log(`  ${orphans.length - asked.length} ingredient(s) not yet asked about`);
    }
  } else {
    if (!process.env["ANTHROPIC_API_KEY"] && !process.env["ANTHROPIC_AUTH_TOKEN"]) {
      console.error(`\nNo credentials. Either set ANTHROPIC_API_KEY / run \`ant auth login\`,`);
      console.error(`or use the unmetered path: --emit, answer in a Claude session, --answers.`);
      process.exit(1);
    }
    const client = new Anthropic({ maxRetries: 5 });
    let done = 0;
    results = await pool(batches, CONCURRENCY, async (b) => {
      const r = await askBatch(client, system, b);
      console.log(`  batch ${++done}/${batches.length} — ${r.length} proposal(s) from ${b.length} ingredient(s)`);
      return r;
    });
  }

  // ── re-check everything the model said ────────────────────────────────────

  /** Edges we already believe, for the cycle check. */
  const parentOf = new Map(derived);
  const seenChild = new Set<string>();
  const rejected = new Map<string, number>();
  const reject = (why: string) => rejected.set(why, (rejected.get(why) ?? 0) + 1);

  const wouldCycle = (child: string, parent: string) => {
    let cur: string | undefined = parent;
    const seen = new Set<string>([child]);
    while (cur) {
      if (seen.has(cur)) return true;
      seen.add(cur);
      cur = parentOf.get(cur);
    }
    return false;
  };

  const existing: Array<Proposal & { cm: number; pm: number; flag: string }> = [];
  const minted: Array<Proposal & { cm: number }> = [];
  type Alias = { loser: string; winner: string; lm: number; wm: number;
                 confidence: string; reason: string };
  const aliases: Alias[] = [];
  const seenPair = new Set<string>();

  /**
   * Categories review has already turned down.
   *
   * A rejected category is a DECISION, not a deletion — the proposals stay in
   * the answer files, so the record shows the category was considered and
   * declined rather than never thought of. Kept in `data/decisions/`, which is
   * tracked for exactly this reason, so a later re-draft cannot quietly
   * resurrect a category a human already said no to.
   */
  const decisionsFile = resolve(ROOT, "data/decisions/categories.csv");
  const rejectedCategories = new Set(
    (existsSync(decisionsFile) ? asObjects(readFileSync(decisionsFile, "utf8")) : [])
      .filter((r) => r["verdict"] === "reject")
      .map((r) => (r["value"] || "").trim())
      .filter(Boolean),
  );

  /** Surfaces the alias table already resolves — not ours to re-decide. */
  const aliasFile = resolve(ONT, "aliases.csv");
  const alreadyAliased = new Set(existsSync(aliasFile)
    ? asObjects(readFileSync(aliasFile, "utf8")).map((a) => a["surface"]!)
    : []);

  /**
   * A proposed category can itself be a child.
   *
   * `white fish` is not a confirmed node — that is the whole point of it — so
   * a strict "child must be confirmed" check silently threw away
   * `white fish is_a fish`, leaving every category a root. That in turn broke
   * the breadcrumb the QC screen is built on (`fish › white fish › basa`
   * collapsing to two segments) and the descendant direction of matching.
   *
   * Collected in a pre-scan, because a category is only known to exist by
   * something else having proposed it as a parent.
   */
  const flat = results.flat();
  const proposedCats = new Set<string>();
  for (const p of flat) {
    if (!p || typeof p.parent !== "string") continue;
    const parent = p.parent.trim();
    if (!parent || byName.has(parent) || rejectedCategories.has(parent)) continue;
    proposedCats.add(parent);
  }

  for (const p of flat) {
    if (!p || typeof p.child !== "string" || typeof p.parent !== "string") { reject("malformed row"); continue; }
    const name = p.child.trim();
    const child = byName.get(name)
      ?? (proposedCats.has(name) ? { node: name, mentions: 0 } : undefined);
    if (!child) { reject("child is not a confirmed node"); continue; }
    const parent = p.parent.trim();
    if (!parent) { reject("empty parent"); continue; }
    if (parent === child.node) { reject("parent is the child"); continue; }

    /**
     * Number, spacing, punctuation and the accents scraping loses all collapse
     * under `numberKey` — which is exactly what the typeahead and
     * `merge-numbers` already run on. Caught by rule rather than by trusting
     * the model to have obeyed, because this is the class it gets wrong most.
     */
    if (numberKey(child.node) === numberKey(parent)) {
      reject("same numberKey — spelling/number, which merge-numbers and the typeahead own");
      continue;
    }

    // Checked by NAME, so the rejection holds even if the category later
    // exists as a node by some other route.
    if (rejectedCategories.has(parent)) { reject(`category rejected in review: ${parent}`); continue; }

    // ── one ingredient, two names → the alias table, not the hierarchy ──────
    if (p.relation === "same_as") {
      const target = byName.get(parent);
      if (!target) { reject("same_as target is not a confirmed node"); continue; }
      const pair = [child.node, target.node].sort().join(" ");
      if (seenPair.has(pair)) { reject("same_as pair proposed twice"); continue; }
      seenPair.add(pair);
      /**
       * More mentions wins — merge-numbers.ts's rule, and for its reason: the
       * id with the most references behind it is the one to keep, so the
       * redirect carries the least traffic. The model's ordering is ignored.
       *
       * Ties break on the SHORTER name, where merge-numbers breaks
       * alphabetically. On a number split the two spellings are equally good
       * names, so alphabetical is harmless; here they are not — a tie between
       * `hondashi` and `hondashi powder` sent the plain name to the loser
       * column, and the canonical name is the one a person would type.
       */
      const better = (a: Node, b: Node) =>
        b.mentions - a.mentions ||
        a.node.split(" ").length - b.node.split(" ").length ||
        a.node.localeCompare(b.node);
      const [winner, loser] = better(child, target) <= 0
        ? [child, target] : [target, child];
      if (alreadyAliased.has(loser.node)) { reject("alias table already resolves it"); continue; }
      seenChild.add(child.node);
      aliases.push({ loser: loser.node, winner: winner.node, lm: loser.mentions,
                     wm: winner.mentions, confidence: p.confidence, reason: p.reason });
      continue;
    }

    if (derived.has(child.node)) { reject("derived pass already placed it"); continue; }
    // One parent per child, matching hierarchy.ts's nearest-ancestor rule.
    if (seenChild.has(child.node)) { reject("child proposed twice"); continue; }

    const known = byName.get(parent);

    /**
     * The model's own `parent_is_new` is a claim, not a fact — it has been
     * wrong in both directions. The node list decides which file a row lands
     * in; the flag only survives as a note when the two disagree.
     */
    if (known) {
      if (wouldCycle(child.node, parent)) { reject("would close a cycle"); continue; }

      const t = numberKey(child.node).split(" ");
      const head = numberKey(parent).split(" ").pop()!;
      const flags: string[] = [];
      if (ANIMAL_HEAD.has(head) && PLANT_SOURCE.has(t[0]!))
        flags.push("plant word + animal product — probably NOT a kind of it");
      if (ORIGIN_TRAP.test(numberKey(child.node)))
        flags.push("origin word — may be a different species");
      if (synonymKeys.has(numberKey(child.node)))
        flags.push("named in SYNONYM — check the table");
      if (known.mentions < 3) flags.push("parent is rare — may not be a real category");
      if (p.parent_is_new) flags.push("model called this parent new, but it exists");

      seenChild.add(child.node);
      parentOf.set(child.node, parent);
      existing.push({ ...p, parent, cm: child.mentions, pm: known.mentions,
                      flag: flags.join("; ") });
    } else {
      seenChild.add(child.node);
      minted.push({ ...p, parent, cm: child.mentions });
    }
  }

  // ── write ────────────────────────────────────────────────────────────────

  if (!existsSync(QC)) mkdirSync(QC, { recursive: true });

  // Corpus impact, not flag — same ordering argument as hierarchy.ts.
  existing.sort((a, b) => (b.cm + b.pm) - (a.cm + a.pm));
  writeFileSync(resolve(QC, "hierarchy-llm.csv"), csv([
    ["child", "parent", "child_mentions", "parent_mentions", "confidence", "reason", "flag"],
    ...existing.map((r) => [r.child, r.parent, r.cm, r.pm, r.confidence, r.reason, r.flag]),
  ]));

  /**
   * Grouped by the proposed category and ordered by the corpus each one would
   * unlock. A new node is only worth minting for the children it would reach,
   * so that number is the first thing on the row.
   */
  const groups = new Map<string, Array<Proposal & { cm: number }>>();
  for (const m of minted) (groups.get(m.parent) ?? groups.set(m.parent, []).get(m.parent)!).push(m);
  const ordered = [...groups].map(([parent, kids]) => ({
    parent, kids: kids.sort((a, b) => b.cm - a.cm),
    reach: kids.reduce((a, k) => a + k.cm, 0),
  })).sort((a, b) => b.reach - a.reach || b.kids.length - a.kids.length);

  writeFileSync(resolve(QC, "hierarchy-llm-new-nodes.csv"), csv([
    ["proposed_node", "children", "corpus_reach", "child", "child_mentions", "confidence", "reason"],
    ...ordered.flatMap((g) => g.kids.map((k, i) => [
      i === 0 ? g.parent : "", i === 0 ? g.kids.length : "", i === 0 ? g.reach : "",
      k.child, k.cm, k.confidence, k.reason,
    ])),
  ]));

  /**
   * `aliases.csv`'s own four columns, so a reviewed row is a copy-paste rather
   * than a transcription. Everything a reviewer needs to judge it rides in the
   * note, which is where the alias table already keeps its reasoning.
   */
  /**
   * Collapse chains to one hop, the repair merge-numbers.ts makes for the same
   * reason: with chains, resolution depends on iteration order and one surface
   * can resolve two ways on two runs. The pass produced a real one —
   * `chicken powder` → `chicken stock powder` → `chicken bouillon`.
   */
  const to = new Map(aliases.map((a) => [a.loser, a.winner]));
  const terminal = (from: string): string => {
    let cur = from;
    const seen = new Set<string>([from]);
    for (;;) {
      const next = to.get(cur);
      // Self-reference is not a chain; a cycle is a bad answer and must not hang.
      if (!next || next === cur || seen.has(next)) return cur;
      seen.add(next);
      cur = next;
    }
  };
  let collapsed = 0;
  for (const a of aliases) {
    const end = terminal(a.winner);
    if (end === a.winner) continue;
    a.winner = end;
    a.wm = byName.get(end)?.mentions ?? a.wm;
    a.reason += "; retargeted past a merged node";
    collapsed++;
  }
  const oneHop = aliases.filter((a) => a.loser !== a.winner);

  oneHop.sort((a, b) => (b.lm + b.wm) - (a.lm + a.wm));
  writeFileSync(resolve(QC, "hierarchy-llm-aliases.csv"), csv([
    ["surface", "node", "source", "note"],
    ...oneHop.map((a) => [a.loser, a.winner, "llm-draft",
      `${a.confidence} confidence: ${a.reason} (${a.lm} vs ${a.wm} mentions)`]),
  ]));

  // ── report ───────────────────────────────────────────────────────────────

  const byConf = (rows: { confidence: string }[], c: string) =>
    rows.filter((r) => r.confidence === c).length;

  console.log(`\nASKED ABOUT   ${asked.length} of ${orphans.length} ingredients with no derived parent`);
  console.log(`  silent        ${asked.length - seenChild.size} — no parent proposed, which for a root is the right answer`);
  console.log(`  placed        ${seenChild.size}`);

  console.log(`\nALIASES  ${oneHop.length} → data/qc/hierarchy-llm-aliases.csv`);
  console.log(`  one ingredient under two names — the alias table's job, not the hierarchy`);
  if (collapsed) console.log(`  ${collapsed} chain(s) collapsed to one hop`);
  console.log(`  reviewed rows paste straight into data/ontology/aliases.csv, then: promote && build-ontology`);
  for (const a of oneHop.slice(0, 6)) {
    console.log(`    ${a.loser.padEnd(26)} → ${a.winner} (${a.lm} vs ${a.wm})`);
  }
  if (oneHop.length > 6) console.log(`    … and ${oneHop.length - 6} more`);

  console.log(`\nEXISTING PARENTS  ${existing.length} → data/qc/hierarchy-llm.csv`);
  console.log(`  high ${byConf(existing, "high")}   medium ${byConf(existing, "medium")}   low ${byConf(existing, "low")}`);
  console.log(`  flagged       ${existing.filter((r) => r.flag).length}`);

  console.log(`\nNEW CATEGORIES    ${ordered.length} node(s) over ${minted.length} child(ren) → data/qc/hierarchy-llm-new-nodes.csv`);
  console.log(`  accepting one MINTS A NODE — §1 reserves that to review`);
  for (const g of ordered.slice(0, 8)) {
    console.log(`    ${g.parent.padEnd(24)} ${String(g.kids.length).padStart(3)} children, ${g.reach} mentions`);
  }
  if (ordered.length > 8) console.log(`    … and ${ordered.length - 8} more`);

  if (rejected.size) {
    console.log(`\nREJECTED HERE (the model said it, the ontology disagreed)`);
    for (const [why, n] of [...rejected].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(5)}  ${why}`);
    }
  }
  console.log(`\nPROPOSALS. Nothing reaches the matcher unreviewed.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
