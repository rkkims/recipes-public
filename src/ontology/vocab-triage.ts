/**
 * Triage the vocabulary: which low-use nodes are parse debris, which are real
 * narrower ingredients, and which are different things entirely.
 *
 * The loose version of this proposed one action — merge — for every node whose
 * name contained a much-used node's name. About a third of those are real
 * ingredients (`garlic salt` is not garlic), and a worklist that is a third
 * wrong is a worklist you stop trusting by row twenty.
 *
 * So it classifies instead, and the classification is the reviewable claim:
 *
 *   alias  — the same thing, said badly. Parse debris, qualifiers, typos.
 *            Correcting it is a row in `data/ontology/aliases.csv`.
 *   child  — a real, narrower ingredient. `coarse korean salt` IS salt, but
 *            merging it loses a distinction a cook can see. This wants an
 *            `is_a` edge, NOT an alias.
 *   keep   — a different thing that merely contains the word. `garlic salt`,
 *            `ginger garlic paste`. Nothing to do.
 *
 *   npm run vocab-triage
 *
 * Read-only against the ontology: it writes three CSVs to
 * `data/reports/vocab-triage/` and changes no decision file. Every proposed row
 * carries `verdict=review`, because the two files it feeds — `aliases.csv` and
 * `hierarchy-claude.csv` — are human judgement and this is a heuristic.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { load } from "../../app/src/lib/data.js";

const { ingredients, recipeCount } = load();
const count = (i: { id: string }) => recipeCount.get(i.id) ?? 0;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Words that mean "a measurement", never a food.
 *
 * `stock` and `part` were in here and cost two real ingredients: "pork stock"
 * is a liquid and "chicken part" is a cut, and both were called debris because
 * a plural unit word matched. A unit word is only a unit when it is NOT the
 * thing being named — so the head noun is checked separately below.
 */
const UNITS = /\b(cloves?|coves|pounds?|lbs?|ounces?|oz|cups?|tbsps?|tsps?|tablespoons?|teaspoons?|grams?|kg|ml|liters?|litres?|inch|inches|pieces?|heads?|stalks?|bunch(es)?|slices?|cans?|packets?|packs?|sheets?|handful)\b/;
/**
 * Words that are a unit ONLY when they are not the thing being named.
 *
 * `pork stock` is a liquid and `chicken part` is a cut, so these cannot go in
 * UNITS. But `stocks of green onion` and `ears corn` are quantity phrases, and
 * the difference is purely position: a unit word in the HEAD is the food, and
 * anywhere else it is counting one.
 */
const UNIT_IF_NOT_HEAD = /^(stocks?|parts?|ears?|cubes?|drops?|sprigs?|dashes?|pinch(es)?|sticks?|strips?|knobs?|blocks?|sheets?|packages?|packetsp?|packets?|boxes|bags?|jars?|bottles?|tins?|ladles?|shots?|cuts?|slabs?|portions?|servings?|scoops?|wads?|ibs|lbs?|ozs?)$/;
const INSTRUCTION = /\b(for|to)\s+\w+ing\b|\bcut into\b|\bto taste\b|\bif (using|needed|desired)\b|\bas needed\b|\bplus\b|\bdivided\b/;
/**
 * Words that make the child NOT the parent, whatever else the shape suggests.
 *
 * `imitation crab` is surimi. A hierarchy edge is stronger than an alias — it
 * feeds MATCHING, so a wrong one silently tells someone they can cook a dish
 * they cannot. These are the words that reverse the relationship.
 */
const NOT_REALLY = /\b(imitation|artificial|mock|vegan|vegetarian|plant[- ]based|substitute|alternative|flavou?red|style)\b/;

/** Adjectives that narrow a food without changing what it is. */
const NARROWING = /^(coarse|fine|finely|non-iodized|iodized|sea|kosher|table|smoked|dried|fresh|frozen|ground|toasted|roasted|raw|whole|baby|young|large|small|thin|thick|light|dark|black|white|red|green|yellow|hot|mild|sweet|sour|low[- ]?fat|full[- ]?fat|skim|unsalted|salted|korean|japanese|chinese|thai|vietnamese|italian|spanish|french|mexican|asian)$/;

type Verdict = "alias" | "child" | "keep";
type Row = { junk: string; n: number; host: string; hn: number; verdict: Verdict; why: string };

/**
 * Surfaces the ALIAS TABLE already knows, resolved to their node.
 *
 * Without this the host picker reads node names only, and proposes the coarsest
 * name it happens to end with: "forearm-length pieces of spring onion" was filed
 * under `onion` even though `spring onion` is a recorded alias of `scallion`.
 * Merging it into onion is less wrong than leaving it and still wrong — and the
 * decision had already been made, in a file, years of review ago.
 */
const aliasTo = new Map<string, string>();
for (const line of readFileSync("data/ontology/aliases.csv", "utf8").split("\n").slice(1)) {
  const m = line.match(/^([^,]*),([^,]*)/);
  if (!m) continue;
  const surface = (m[1] ?? "").replace(/^"|"$/g, "").trim().toLowerCase();
  const node = (m[2] ?? "").replace(/^"|"$/g, "").trim().toLowerCase();
  if (surface && node && surface !== node) aliasTo.set(surface, node);
}

/*
  The threshold is 20, not 50: "coconut milk" and "chili pepper" sit below 50 and
  are exactly the hosts that stop "fluid ounces coconut milk" being filed under
  `milk`. A host too coarse is how a merge loses information.
*/
const big = ingredients.filter((i) => count(i) >= 20)
  .sort((a, b) => b.name.length - a.name.length);

/**
 * The best host for a name: the longest known node it ENDS with, else the
 * longest it merely contains.
 *
 * Ending matters because English puts the head noun last — a name ending in
 * `noodles` is a noodle whatever else it mentions. Taking the first
 * containment filed "hong kong style egg noodles" under `egg`.
 */
function hostFor(name: string) {
  const byName = new Map(ingredients.map((i) => [i.name.toLowerCase(), i]));

  /*
    Candidates are node names AND alias surfaces, longest first. An alias
    surface only counts if it resolves to a node that is itself well used —
    otherwise a merge just moves the problem to a second junk node.
  */
  type Cand = { surface: string; node: typeof ingredients[number] };
  const cands: Cand[] = [];
  for (const h of big) cands.push({ surface: h.name.toLowerCase(), node: h });
  for (const [surface, target] of aliasTo) {
    const node = byName.get(target);
    if (node && count(node) >= 20) cands.push({ surface, node });
  }
  cands.sort((a, b) => b.surface.length - a.surface.length);

  const ends = cands.find((c) =>
    c.surface !== name && new RegExp(`(^|\\W)${esc(c.surface)}$`).test(name));
  if (ends) return ends.node;
  const has = cands.find((c) =>
    c.surface !== name && new RegExp(`(^|\\W)${esc(c.surface)}(\\W|$)`).test(name));
  return has?.node;
}

function classify(name: string, host: string): { verdict: Verdict; why: string } {
  const tokens = name.split(/\s+/);
  const hostTokens = host.split(/\s+/);

  // ── debris, in descending order of how certain the tell is ──────────────
  if (/\d/.test(name)) return { verdict: "alias", why: "contains a number" };
  if (UNITS.test(name)) return { verdict: "alias", why: "contains a unit or measure" };
  if (INSTRUCTION.test(name)) return { verdict: "alias", why: "contains an instruction" };
  {
    const head = tokens[tokens.length - 1] ?? "";
    if (tokens.slice(0, -1).some((t) => UNIT_IF_NOT_HEAD.test(t)) && !UNIT_IF_NOT_HEAD.test(head))
      return { verdict: "alias", why: "counts the food rather than names it" };
  }
  if (/^(for|of|to|and|or|the|a|an)\b/.test(name)) return { verdict: "alias", why: "starts mid-sentence" };
  // "garlic cloves garlic" — the head noun said twice is always a parse artefact.
  {
    const head = hostTokens[hostTokens.length - 1]!;
    const times = tokens.filter((t) => t.replace(/s$/, "") === head.replace(/s$/, "")).length;
    if (times > 1) return { verdict: "alias", why: "repeats the head noun" };
  }

  /*
    Where the host sits decides the rest.

    A name ENDING in the host is that host, narrowed: `coarse korean salt` is
    salt. A name where the host sits earlier has a different head noun — `garlic
    salt` is salt, `garlic sauce` is a sauce — and is a different ingredient that
    merely mentions the word.
  */
  const endsWithHost = new RegExp(`(^|\\W)${esc(host)}$`).test(name);
  if (!endsWithHost) return { verdict: "keep", why: "different head noun" };

  if (NOT_REALLY.test(name)) return { verdict: "keep", why: "not actually the parent" };

  /*
    A PREPARATION is not a variety, for matching purposes.

    A century egg is genuinely an egg and a pickled cucumber is genuinely a
    cucumber — and neither answers a recipe asking for the plain thing. An `is_a`
    edge is a promise about substitution, so a form that has been transformed
    breaks it: nobody scrambles a thousand-year-old egg.
  */
  if (/\b(pickled|preserved|fermented|century|thousand year|salted|candied|over easy|hard[- ]boiled|soft[- ]boiled|scrambled|fried|roasted whole)\b/.test(name))
    return { verdict: "keep", why: "a preparation, not a variety" };

  /*
    Words that point AT an ingredient rather than name one.

    "remaining chicken breast", "made white fluffy rice", "reserved marinade" —
    the line is referring back to something the method already produced, so the
    phrase is a reference and not a variety.
  */
  if (/\b(remaining|leftover|reserved|extra|additional|made|prepared|above|rest)\b/.test(name))
    return { verdict: "alias", why: "refers back rather than naming" };

  /* "hot cooking water from the noodles" is water. `from` marks a thing DERIVED
     from the parent, which is the opposite of being one. */
  if (/\bfrom (the|a|an)?\s*\w/.test(name))
    return { verdict: "keep", why: "derived from the parent, not a kind of it" };

  /*
    A one- or two-letter modifier is OCR debris, not a word — `ib sharp cheddar
    cheese` is a mangled `lb`. Real modifiers are words.
  */
  if (tokens.slice(0, -1).some((t) => t.length <= 2 && !/^(of|in|on|no)$/.test(t)))
    return { verdict: "alias", why: "contains a fragment, not a word" };

  /* "palm-sized korean radish", "iphone-sized piece kelp" — a size comparison
     is a quantity, and the phrase is measuring the food rather than naming it. */
  if (/\b\w+-sized?\b|\bfist\b|\bthumb\b/.test(name))
    return { verdict: "alias", why: "measures the food by comparison" };

  /* "medium-firm to firm tofu" is two readings joined by a parser, not a name. */
  if (/\bto\b/.test(name)) return { verdict: "alias", why: "joins two readings" };

  /*
    Parents too ambiguous to inherit through.

    `pepper` is black pepper AND capsicum, so `long hot pepper is_a pepper` would
    let a chili satisfy a recipe asking for the spice. `oil` and `vinegar` are
    broad but not ambiguous — any oil really does answer "oil" — so they stay.
  */
  if (/^(pepper|peppers)$/.test(host)) return { verdict: "keep", why: "parent is ambiguous" };

  const modifiers = tokens.slice(0, tokens.length - hostTokens.length);
  if (modifiers.length === 0) return { verdict: "keep", why: "same name" };

  /*
    The modifier may belong to a COMPOUND rather than to the parent.

    `sweet potato starch` looked like `potato starch` narrowed by "sweet",
    because the host ends the name and the leftover word sits in front. But
    `sweet potato` is itself a node, so the phrase is (sweet potato)(starch) and
    the parent is wrong. Checked against the ontology rather than guessed.
  */
  {
    const names = new Set(ingredients.map((i) => i.name.toLowerCase()));
    const last = modifiers[modifiers.length - 1] ?? "";
    const first = hostTokens[0] ?? "";
    /* Spaced, joined, and pluralised: `chick pea` is `chickpea`, which is not a
       pea — a compound written loosely still names the compound. */
    for (const form of [`${last} ${first}`, `${last}${first}`, `${last}${first}s`, `${last} ${first}s`])
      if (names.has(form)) return { verdict: "keep", why: `"${form}" is its own node` };
  }
  if (modifiers.every((m) => NARROWING.test(m))) {
    return { verdict: "child", why: `narrowed by ${modifiers.join(" ")}` };
  }
  /* A modifier that is itself a known ingredient makes a compound, not a
     variety: `sesame salt` is not a kind of salt the way `sea salt` is. */
  const names = new Set(ingredients.map((i) => i.name.toLowerCase()));
  if (modifiers.some((m) => names.has(m))) {
    return { verdict: "keep", why: "modifier is itself an ingredient" };
  }
  return { verdict: "child", why: "narrower form" };
}

const rows: Row[] = [];
for (const i of ingredients) {
  const n = count(i);
  if (n > 5) continue;
  const name = i.name.toLowerCase();
  const host = hostFor(name);
  if (!host || host.name.toLowerCase() === name) continue;
  const { verdict, why } = classify(name, host.name.toLowerCase());
  rows.push({ junk: i.name, n, host: host.name, hn: count(host), verdict, why });
}

const by = (v: Verdict) => rows.filter((r) => r.verdict === v);
console.log(`${rows.length} nodes examined, of ${ingredients.length} in the ontology\n`);
for (const v of ["alias", "child", "keep"] as Verdict[]) {
  const g = by(v);
  console.log(`${v.padEnd(6)} ${String(g.length).padStart(4)}  (${g.reduce((s, r) => s + r.n, 0)} recipe uses)`);
}
console.log();
for (const v of ["alias", "child", "keep"] as Verdict[]) {
  console.log(`── ${v} ──`);
  for (const r of by(v).sort((a, b) => b.n - a.n || a.junk.localeCompare(b.junk)).slice(0, 8))
    console.log("  ", String(r.n).padStart(2), r.junk.padEnd(40).slice(0, 40), "->", r.host, `· ${r.why}`);
  console.log();
}

/*
  Written in the shapes the repo already applies, so nothing new is invented:
  aliases in `data/ontology/aliases.csv`'s columns, hierarchy in
  `data/decisions/hierarchy-claude.csv`'s.

  Every verdict is left as `review`. `hierarchy-apply` is explicit that only
  rows judged on general food knowledge belong in that file and that anything
  needing Korean specifics was deliberately left for a human — this script knows
  nothing about either, so it proposes and never decides.

  Sorted by what each row would FIX: a row resolving four recipe lines is worth
  reading before one resolving none.
*/
const DIR = "data/reports/vocab-triage";
mkdirSync(DIR, { recursive: true });
const byUse = (a: Row, b: Row) => b.n - a.n || a.junk.localeCompare(b.junk);

const triage = ["proposed,surface,node,uses,host_uses,why"];
for (const r of [...rows].sort((a, b) => b.n - a.n || a.verdict.localeCompare(b.verdict)))
  triage.push([r.verdict, `"${r.junk}"`, `"${r.host}"`, r.n, r.hn, `"${r.why}"`].join(","));
writeFileSync(`${DIR}/vocab-triage.csv`, triage.join("\n") + "\n");

const aliasRows = ["surface,node,source,note"];
for (const r of by("alias").sort(byUse))
  aliasRows.push([`"${r.junk}"`, `"${r.host}"`, "review", `"triage: ${r.why}"`].join(","));
writeFileSync(`${DIR}/alias-proposals.csv`, aliasRows.join("\n") + "\n");

const hier = ["child,parent,relation,verdict,why"];
for (const r of by("child").sort(byUse))
  hier.push([`"${r.junk}"`, `"${r.host}"`, "is_a", "review", `"triage: ${r.why}"`].join(","));
writeFileSync(`${DIR}/hierarchy-proposals.csv`, hier.join("\n") + "\n");

console.log(`wrote, all with verdict=review:
  vocab-triage.csv        ${rows.length} rows — everything, for reading
  alias-proposals.csv     ${by("alias").length} rows — data/ontology/aliases.csv shape
  hierarchy-proposals.csv ${by("child").length} rows — data/decisions/hierarchy-claude.csv shape`);
