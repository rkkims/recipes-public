/**
 * Draft the three classification fields for every recipe — RECIPE-SPEC §4a.
 *
 *   npm run classify -- --emit --limit 80   # a trial slice, two batches
 *   npm run classify -- --emit              # the whole uncurated corpus
 *   npm run classify -- --answers           # ingest answers, write proposals
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 *
 * 4,874 recipes and 22 curated. At the observed pace the corpus outlives the
 * reviewer. The bottleneck is not the verdict — Keep or Drop is instant once
 * you have read the page — it is that four fields arrive EMPTY and each one is
 * a small act of typing before the verdict can be filed.
 *
 * So this fills them in first. It changes nothing about who decides: every row
 * it writes is a PRE-FILL on the curate form, exactly the standing
 * `SOURCE_QUALITY` and `mainProposals` already have. The curator still opens
 * the recipe, still presses Keep, and now mostly presses it without typing.
 *
 * ── The transport is files, not the API ────────────────────────────────────
 *
 * `hierarchy-llm.ts` established two ways to reach the model and made the point
 * that only one of them costs money: write the batches to disk, answer them in
 * a Claude session, drop the JSON back. That is the only transport here. The
 * reviewer has a subscription and no reason to be billed twice for the same
 * sentence, and — the part that matters beyond cost — a batch on disk is a
 * reviewable artefact. You can read what was asked.
 *
 * ── What is asked, and what is checked afterwards ──────────────────────────
 *
 * Three closed vocabularies (§4a) plus one binary, and a fourth field that is
 * closed PER RECIPE: `main_ingredients` may only name ingredients this recipe
 * actually requires. That constraint is what makes validation exact rather than
 * fuzzy — a name either appears in the recipe's own list or it does not, and
 * §4c wants ids, which the closed list can give without a lookup that guesses.
 *
 * Nothing is trusted on the model's word:
 *
 *   - an unknown `recipe_id` is dropped, not created
 *   - a `cuisine` or `dish_type` outside the vocabulary is dropped, not coerced
 *     — "appetizer" becoming `side` is exactly the mapping §4a says a human owns
 *   - a `main_ingredient` the recipe does not require is dropped
 *   - `unresolved` and an absent `dish_type` are KEPT as answers. §4a: *"Abstain
 *     rather than default."* A model asked to fill in a column will fill in the
 *     column, so the prompt says abstaining is a correct answer and this file
 *     records it as one rather than reading it as a failure to reply.
 *
 * Writes `data/ontology/classify.json` (read by the curate form) and
 * `data/qc/classify.csv` (for reading before you trust it).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ONT = resolve(ROOT, "data/ontology");
const QC = resolve(ROOT, "data/qc");
const ASK = resolve(QC, "classify-ask");
const ANSWERS = resolve(QC, "classify-answers");

/**
 * Recipes per batch.
 *
 * Small enough that one agent reads all of it carefully, large enough that
 * 4,874 recipes is ~120 files rather than a thousand. `hierarchy-llm` settled
 * on 40 for a much shorter row; a recipe is a title plus a dozen ingredients,
 * so 25 keeps a batch to roughly the same amount of reading.
 */
const BATCH = 25;

const argOf = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const EMIT = process.argv.includes("--emit");
const USE_ANSWERS = process.argv.includes("--answers");
const LIMIT = Number(argOf("--limit") ?? 0) || 0;
/**
 * `--audit` inverts the filter: ask about the recipes a human has ALREADY
 * judged, so the answers can be scored against theirs.
 *
 * This is the only honest way to decide whether a pre-fill is a help or a trap.
 * A pre-fill that is right 90% of the time saves four fields of typing; one that
 * is right 60% of the time costs more attention than a blank form, because the
 * curator now has to check rather than answer. The curated rows are the only
 * ground truth in the repo, and they are small enough to spend.
 */
const AUDIT = process.argv.includes("--audit");

/** §4a, verbatim. Duplicated from `Curate.tsx` and checked against it below. */
const DISH_TYPES = ["main", "side", "soup-stew", "rice-noodle", "pickle-preserve",
                    "sauce-condiment", "snack-street", "dessert", "drink"];
const CUISINES = ["korean", "japanese", "chinese", "thai", "vietnamese",
                  "filipino", "unresolved"];

// ── the corpus ───────────────────────────────────────────────────────────────

type Recipe = {
  id: string; title: string; url: string; source: string;
  cuisine?: string; yield?: string;
  requires: string[]; optional?: string[]; unresolved?: string[];
};

function corpus() {
  const idx = JSON.parse(readFileSync(resolve(ONT, "recipe-index.json"), "utf8")) as
    { recipes: Recipe[] };
  const ont = JSON.parse(readFileSync(resolve(ONT, "ontology.json"), "utf8")) as
    { ingredients: Array<{ id: string; name: string }> };
  const nameOf = new Map(ont.ingredients.map((i) => [i.id, i.name]));
  return { recipes: idx.recipes, nameOf };
}

type Curation = {
  recipe_id: string; verdict: string; cuisine?: string; dish_type?: string;
  make_ahead?: boolean; main_ingredients?: string[];
};

/** Already judged by a human — never re-ask, and never overwrite. */
function curations(): Record<string, Curation> {
  const f = resolve(ROOT, "data/curation/recipes.json");
  if (!existsSync(f)) return {};
  return JSON.parse(readFileSync(f, "utf8")) as Record<string, Curation>;
}

const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((c) => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n") + "\n";

// ── the prompt ───────────────────────────────────────────────────────────────

/**
 * Written for an agent that has been handed one file path and nothing else, so
 * it repeats the vocabulary in full rather than referring to a spec it cannot
 * read. The three notes that are not obvious from the value names are the ones
 * §4a spends most of its words on, and they are the ones that go wrong:
 * `side` is not a lesser dish, `soup-stew` is not a kind of side, and abstaining
 * is a correct answer.
 */
function prompt(rows: string[], out: string): string {
  return `You are drafting classification fields for a Korean-first recipe app. Your answers become PRE-FILLS on a human review form — a curator sees each one and corrects it. Draft honestly; do not guess to fill a column.

Classify each recipe below. Answer with JSON only.

## cuisine — one of
${CUISINES.filter((c) => c !== "unresolved").join(", ")}
Use \`unresolved\` when the dish belongs to none of these or you cannot tell. A recipe from a Korean blog is not automatically Korean — a Korean blogger's tiramisu is \`unresolved\`, not \`korean\`. The site-declared cuisine is given below as evidence, not as the answer.

## dish_type — role at the table, one of
- \`main\` — the centrepiece
- \`side\` — banchan. NOT a lesser dish; a Korean meal is several of these
- \`soup-stew\` — guk, jjigae, tang. Its own role, not a kind of side; a jjigae is often the centrepiece
- \`rice-noodle\` — bap, myeon. The staple base: fried rice, bibimbap, noodle bowls
- \`pickle-preserve\` — kimchi, jangajji. Made ahead and kept for weeks
- \`sauce-condiment\` — jang, dressings, dipping sauces, seasoned oils
- \`snack-street\` — bunsik, fried snacks, tteokbokki-style street food
- \`dessert\`
- \`drink\`

This is ONE axis: role at the table. Not meal time, not main ingredient, not difficulty. Korean dish names often carry the type as a suffix: -jjigae/-guk/-tang → soup-stew, -muchim/-namul/-jeon → side, -bokkeum → main, -bap → rice-noodle, -kimchi/-jangajji → pickle-preserve.

**A vegetable dish is \`side\`, whatever the suffix says.** The -bokkeum hint above holds for meat and seafood — a stir-fry of a vegetable (garlic scapes, mushrooms, zucchini, potato) is banchan and files as \`side\`. So does anything -jeon, -muchim or -namul, however substantial it looks.

**The structural value wins over being the centrepiece.** A jjigae is often the centrepiece of the meal and is still \`soup-stew\`; jajangmyeon and kimbap are the whole meal and are still \`rice-noodle\`. \`main\` is for a centrepiece that is NOT a soup, a staple base, a pickle, a sauce, a snack, a dessert or a drink — a grilled meat, a braise, a stir-fry. Reaching for \`main\` because a dish is important is the error this rule exists to stop.

Use \`""\` (empty string) when you genuinely cannot place it. An empty field is a gap; a wrong one is a wrong answer, and \`main\` is the tempting default that would swallow every unplaced side dish.

## make_ahead — true or false
True only when the recipe has to be STARTED ON AN EARLIER DAY: something must sit, ferment, marinate, cure or soak overnight or longer before the cooking can continue. Kimchi and other ferments, overnight marinades, long brines, a dough left to rise overnight, dried beans soaked the night before.

False for everything else, including waits of an hour or two. A 30-minute marinade, an hour in the fridge to firm up, a dough resting while you prep, a three-hour braise — all false. The cook can start those and finish them the same evening.

The bar is deliberately high. This field exists for one thing: stopping someone from starting a recipe at 7pm that needed to begin yesterday. A short wait is an inconvenience; a wrong \`true\` makes a perfectly cookable dinner look impossible.

## main_ingredients — 0, 1 or 2 names
What the dish is OF — what a person would say it is made of if asked. Ordered: the first is the one the dish is named for.

Copy names EXACTLY from that recipe's own \`ingredients:\` line. A name not on that line is dropped. Never include seasonings, aromatics or staples that merely appear (salt, sugar, oil, soy sauce, garlic, ginger, scallion, water, cornstarch) unless the dish is genuinely about them — a soy sauce braise may be about soy sauce, a stir-fry is not about its garlic.

Answer \`[]\` when nothing stands out. **Prefer one name to two.** Give a second only when the dish is genuinely of both — kimchi jjigae is of kimchi AND pork belly; a cucumber salad is of cucumber, and its dressing is not a second main. A speculative second is worse than none.

# Recipes

${rows.join("\n\n")}

# Answer with exactly this, and nothing else

Write the JSON to \`${out}\`, one object per recipe above, in the same order:

\`\`\`json
{"classifications": [
  {"recipe_id": "rec_...", "cuisine": "korean", "dish_type": "soup-stew", "make_ahead": false, "main_ingredients": ["kimchi", "pork belly"], "confidence": "high"}
]}
\`\`\`

\`confidence\` is one of high, medium, low and describes the whole row — use \`low\` when you are reading a title you do not recognise and inferring from the ingredients alone. Include every recipe, including ones you abstained on.
`;
}

// ── emit ─────────────────────────────────────────────────────────────────────

function emit() {
  const { recipes, nameOf } = corpus();
  const done = new Set(Object.keys(curations()));
  const todo = recipes.filter((r) => AUDIT ? done.has(r.id) : !done.has(r.id));
  const slice = LIMIT ? todo.slice(0, LIMIT) : todo;
  const tag = AUDIT ? "audit-" : "";

  mkdirSync(ASK, { recursive: true });
  mkdirSync(ANSWERS, { recursive: true });

  const batches: string[] = [];
  for (let i = 0; i < slice.length; i += BATCH) {
    const rows = slice.slice(i, i + BATCH).map((r) => {
      /*
        Required ingredients only, and by name. The optional ones are garnish —
        including them would put "sesame seeds" in front of a model being asked
        what the dish is OF. Unresolved surfaces are included as raw text
        because a recipe whose one unparsed line is "pork belly" is still
        obviously about pork belly, and the classification does not depend on
        the ontology having caught up.
      */
      const named = r.requires.map((id) => nameOf.get(id) ?? id);
      const raw = (r.unresolved ?? []).map((u) => `${u} (unparsed)`);
      return [
        `## ${r.id}`,
        `title: ${r.title}`,
        `site: ${r.source}${r.cuisine ? ` · site-declared cuisine: ${r.cuisine}` : ""}`,
        `ingredients: ${[...named, ...raw].join(", ")}`,
      ].join("\n");
    });

    const n = `${tag}${String(batches.length + 1).padStart(3, "0")}`;
    const out = `data/qc/classify-answers/${n}.json`;
    writeFileSync(resolve(ASK, `${n}.md`), prompt(rows, out));
    batches.push(`${n}.md`);
  }

  console.log(`${recipes.length} recipes · ${done.size} already curated · ${slice.length} to ask about`);
  console.log(`wrote ${batches.length} batch(es) of ${BATCH} to data/qc/classify-ask/`);
  console.log(`\nAnswer each one, writing JSON to the path named at the bottom of the file.`);
  console.log(`Then: npm run classify -- ${AUDIT ? "--score" : "--answers"}`);
}

// ── answers ──────────────────────────────────────────────────────────────────

type Answer = {
  recipe_id?: string; cuisine?: string; dish_type?: string;
  make_ahead?: boolean; main_ingredients?: string[]; confidence?: string;
};

type Proposal = {
  cuisine: string; dish_type: string; make_ahead: boolean;
  main_ingredients: string[]; confidence: string;
};

/**
 * Read and check every answer file, returning only what survived.
 *
 * Shared by the real pass and the audit, which is the point: an audit that
 * scored answers the real pass would have rejected would be measuring a
 * different pipeline from the one that runs.
 */
function accept(files: string[]) {
  const { recipes, nameOf } = corpus();
  const byId = new Map(recipes.map((r) => [r.id, r]));
  /** Per recipe: the ingredient names it is allowed to be about → their ids. */
  const allowed = new Map(recipes.map((r) =>
    [r.id, new Map(r.requires.map((id) => [(nameOf.get(id) ?? id).toLowerCase(), id]))]));

  const out: Record<string, Proposal> = {};
  const rejected: (string | number)[][] = [["file", "recipe_id", "field", "value", "why"]];
  let read = 0;

  for (const f of files) {
    let parsed: { classifications?: Answer[] };
    try {
      parsed = JSON.parse(readFileSync(resolve(ANSWERS, f), "utf8"));
    } catch (e) {
      rejected.push([f, "", "file", "", `unparseable JSON: ${(e as Error).message}`]);
      continue;
    }
    for (const a of parsed.classifications ?? []) {
      read++;
      const id = a.recipe_id ?? "";
      if (!byId.has(id)) { rejected.push([f, id, "recipe_id", id, "not a recipe in the index"]); continue; }

      const cuisine = CUISINES.includes(a.cuisine ?? "") ? a.cuisine! : "";
      if (!cuisine) rejected.push([f, id, "cuisine", a.cuisine ?? "", "outside the §4a vocabulary"]);

      // An absent dish_type is an ABSTENTION and correct; a non-empty value
      // outside the list is a mapping only a human may make.
      const dish = a.dish_type ?? "";
      const dish_type = dish === "" || DISH_TYPES.includes(dish) ? dish : "";
      if (dish && !dish_type) rejected.push([f, id, "dish_type", dish, "outside the §4a vocabulary"]);

      const mains: string[] = [];
      for (const name of a.main_ingredients ?? []) {
        const hit = allowed.get(id)!.get(String(name).toLowerCase());
        if (hit) { if (!mains.includes(hit)) mains.push(hit); }
        else rejected.push([f, id, "main_ingredient", String(name), "not required by this recipe"]);
      }

      out[id] = {
        // A rejected cuisine falls back to abstention, not to the site's claim:
        // the site's claim is already the form's own default, so writing it here
        // would dress a failed answer up as a second opinion.
        cuisine: cuisine || "unresolved",
        dish_type,
        make_ahead: a.make_ahead === true,
        main_ingredients: mains.slice(0, 2),   // §4c: at most two
        confidence: ["high", "medium", "low"].includes(a.confidence ?? "")
          ? a.confidence! : "low",
      };
    }
  }

  return { out, rejected, read, byId, nameOf };
}

/** Answer files present, minus the audit ones (or only them). */
function answerFiles(audit: boolean): string[] {
  if (!existsSync(ANSWERS)) return [];
  return readdirSync(ANSWERS)
    .filter((f) => f.endsWith(".json") && f.startsWith("audit-") === audit)
    .sort();
}

function ingest() {
  const files = answerFiles(false);
  if (!files.length) { console.log("no answer files yet"); return; }
  const { out, rejected, read, byId, nameOf } = accept(files);

  writeFileSync(resolve(ONT, "classify.json"), JSON.stringify(out, null, 1) + "\n");

  const rows: (string | number)[][] =
    [["recipe_id", "title", "cuisine", "dish_type", "make_ahead", "main_ingredients", "confidence"]];
  for (const [id, p] of Object.entries(out))
    rows.push([id, byId.get(id)?.title ?? "", p.cuisine, p.dish_type, String(p.make_ahead),
               p.main_ingredients.map((i) => nameOf.get(i) ?? i).join(" · "), p.confidence]);
  mkdirSync(QC, { recursive: true });
  writeFileSync(resolve(QC, "classify.csv"), csv(rows));

  const tally = (get: (p: Proposal) => string) => {
    const m = new Map<string, number>();
    for (const p of Object.values(out)) m.set(get(p), (m.get(get(p)) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k || "(abstained)"} ${n}`).join(" · ");
  };

  console.log(`${files.length} answer file(s) · ${read} rows read · ${Object.keys(out).length} accepted`);
  console.log(`  cuisine     ${tally((p) => p.cuisine)}`);
  console.log(`  dish_type   ${tally((p) => p.dish_type)}`);
  console.log(`  make_ahead  ${tally((p) => String(p.make_ahead))}`);
  console.log(`  confidence  ${tally((p) => p.confidence)}`);
  const mained = Object.values(out).filter((p) => p.main_ingredients.length).length;
  console.log(`  ${mained} with at least one main ingredient`);
  if (rejected.length > 1) {
    writeFileSync(resolve(QC, "classify-rejected.csv"), csv(rejected));
    console.log(`\n${rejected.length - 1} field(s) rejected — data/qc/classify-rejected.csv`);
  }
  console.log(`\nwrote data/ontology/classify.json — read by the curate form as a PRE-FILL`);
  console.log(`     data/qc/classify.csv        — for reading before you trust it`);
}

// ── score ────────────────────────────────────────────────────────────────────

/**
 * Agreement with the human, field by field, on the rows the human has done.
 *
 * Reported as three separate numbers rather than one, because they are three
 * different decisions and they are allowed to be trustworthy at different
 * rates. `cuisine` is nearly free; `dish_type` is the judgement call; and
 * `make_ahead` is the one that can waste an evening, so it is scored with its
 * disagreements named rather than counted.
 *
 * Rows where the human left a field blank are NOT counted as disagreement —
 * a blank is "not answered", and scoring against it would punish the draft for
 * filling a gap the human never filled. Those are reported separately as
 * `filled a blank`, which is the pre-fill doing exactly its job.
 */
function score() {
  const files = answerFiles(true);
  if (!files.length) { console.log("no audit answers yet — npm run classify -- --emit --audit"); return; }
  const { out, byId, nameOf } = accept(files);
  const human = curations();

  const fields = ["cuisine", "dish_type", "make_ahead", "main_ingredients"] as const;
  const stat = Object.fromEntries(fields.map((f) => [f, { agree: 0, differ: 0, blank: 0 }])) as
    Record<typeof fields[number], { agree: number; differ: number; blank: number }>;
  const diffs: (string | number)[][] = [["recipe_id", "title", "field", "human", "drafted"]];

  for (const [id, p] of Object.entries(out)) {
    const h = human[id];
    if (!h) continue;
    const title = byId.get(id)?.title ?? "";
    const check = (f: typeof fields[number], hv: string | undefined, dv: string) => {
      if (hv === undefined || hv === "") { stat[f].blank++; return; }
      if (hv === dv) stat[f].agree++;
      else { stat[f].differ++; diffs.push([id, title, f, hv, dv]); }
    };
    check("cuisine", h.cuisine, p.cuisine);
    check("dish_type", h.dish_type, p.dish_type);
    // `make_ahead` is stored as a real boolean on every curated row, so unlike
    // the others there is no blank state to exclude.
    check("make_ahead", h.make_ahead === undefined ? undefined : String(h.make_ahead),
          String(p.make_ahead));
    const name = (ids: string[]) => ids.map((i) => nameOf.get(i) ?? i).join(" · ");
    check("main_ingredients",
          h.main_ingredients?.length ? name(h.main_ingredients) : undefined,
          name(p.main_ingredients));
  }

  console.log(`scored ${Object.keys(out).length} drafted row(s) against the curated file\n`);
  for (const f of fields) {
    const s = stat[f], judged = s.agree + s.differ;
    const pct = judged ? Math.round((s.agree / judged) * 100) : 0;
    console.log(`  ${f.padEnd(17)} ${String(s.agree).padStart(3)}/${String(judged).padEnd(3)} agree  ${String(pct).padStart(3)}%   ${s.blank} filled a blank`);
  }
  if (diffs.length > 1) {
    writeFileSync(resolve(QC, "classify-audit.csv"), csv(diffs));
    console.log(`\n${diffs.length - 1} disagreement(s) — data/qc/classify-audit.csv`);
    console.log(`Read them. A pre-fill you have to check is worse than a blank field.`);
  }
}

if (EMIT) emit();
else if (USE_ANSWERS) ingest();
else if (process.argv.includes("--score")) score();
else console.log(`npm run classify -- --emit [--limit N]   draft the uncurated corpus
npm run classify -- --answers             ingest answers → curate form pre-fills
npm run classify -- --emit --audit        re-ask about recipes a human has judged
npm run classify -- --score               agreement with the human, field by field`);
