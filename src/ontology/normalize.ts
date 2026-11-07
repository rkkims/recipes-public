/**
 * The normalisation engine.
 *
 * One rule, applied through the class tables in classes.ts:
 *
 *     strip a modifier from the head, unless that modifier discriminates
 *
 * Everything the reviewer did across 593 decisions is an instance of it. The
 * engine is deliberately small and the tables are deliberately large, because
 * the tables are what a new cuisine changes.
 *
 * Every result carries a TRACE: which rule fired, on what, producing what. A
 * canonical name nobody can explain is a canonical name nobody can correct, and
 * the reviewer's own decisions are not assumed correct either — agreement.ts
 * scores engine against reviewer and reports the disagreements, which are the
 * only rows worth a human's attention.
 */
import {
  CATEGORY, CLASSES, COMMODITY, CONTESTED, IMPLIES, ORIGIN_PRODUCT,
  ALWAYS_PRESERVED, APPOSITIVE, CUISINE_WORDS, NOT_INGREDIENT, PARTS,
  PURCHASED_FORM, SLOTS, SPLIT, UNIVERSAL, YIELD_LIMITED,
} from "./classes.js";
import { loadAliases } from "./aliases.js";
import { guessKind } from "./kinds.js";

/**
 * Crude singulariser, shared with the proposal grouper.
 *
 * Needed before any table lookup: `chilies` must reach the CATEGORY entry filed
 * under `chili`, and `shrimps` must reach `shrimp`. Skipping this produced
 * `chilies pepper` and `dried red chilies pepper`.
 */
export const KEEP_PLURAL = new Set([
  "molasses", "hummus", "couscous", "asparagus", "greens", "sprouts", "oats",
  "grits", "glass", "swiss", "chives", "leaves", "beans", "noodles", "flakes",
  "breadcrumbs", "grounds", "seeds",
]);
/**
 * `chilies` is the plural of `chili`, not of `chily`. The -ies→-y rule produced
 * `chily`, which missed the CATEGORY entry and emitted `chilies pepper` on six
 * separate rows. Irregulars go here rather than into the rule.
 */
export const IRREGULAR: Record<string, string> = {
  chilies: "chili", chillies: "chilli", chiles: "chile",
  leaves: "leaf", knives: "knife", loaves: "loaf",
  // `-ies` normally comes from `-y` (anchovies → anchovy), but a word whose
  // singular already ends in `-ie` does not. Nothing in the spelling tells them
  // apart, so the short list of food words that behave this way is named.
  cookies: "cookie", brownies: "brownie", smoothies: "smoothie",
  bowties: "bowtie", hoagies: "hoagie",
};

/**
 * Endings that are not plurals at all.
 *
 * `fungus`, `asparagus` and `hummus` are singular Latin forms, and the bare
 * "strip a trailing s" rule turned them into `fungu`, `asparagu` and `hummu`.
 * That was invisible while this only built lookup KEYS — both sides of a
 * comparison were mangled identically — and became visible the moment the
 * result was shown to a person as a display name (NORMALIZATION, "Number").
 *
 * `-is` is deliberately NOT here. It would have caught `kimchis`, `zucchinis`
 * and `paninis` — the plural of every food word ending in `-i`, which is a far
 * larger class in this corpus than the `-is` singulars it would protect.
 */
const NOT_A_PLURAL = /(?:us|ss)$/;
export const singular = (w: string) => {
  if (IRREGULAR[w]) return IRREGULAR[w]!;
  if (KEEP_PLURAL.has(w) || w.length < 4) return w;
  if (NOT_A_PLURAL.test(w)) return w;
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (/(?:oes|ses|xes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
};

/**
 * Synonym lookup that ignores number. `thai bird chili` is in the table and
 * `thai bird chilies` is what the corpus wrote, and an exact-match lookup left
 * the plural to be rebuilt into `thai bird chili pepper` by the category rule.
 */
const SYNONYM: Record<string, string> = {};
const SYNONYM_KEY = new Map<string, string>();
for (const a of loadAliases()) {
  SYNONYM[a.surface] = a.node;
  SYNONYM_KEY.set(a.surface.split(" ").map(singular).join(" "), a.node);
}
const synonymOf = (s: string) =>
  SYNONYM[s] ?? SYNONYM_KEY.get(s.split(" ").map(singular).join(" "));

/** How many aliases the table holds — reported by the resolver. */
export const aliasCount = () => Object.keys(SYNONYM).length;

/**
 * Add synonyms discovered in review, before they are promoted into
 * exceptions.ts.
 *
 * A bridge, deliberately narrow. `npm run learn` turns review notes into merge
 * rules, and those are real exceptions that nobody has hand-written yet. They
 * must reach the ENGINE rather than being applied afterwards by a caller —
 * a second naming path is exactly what wiring the engine into propose.ts was
 * meant to remove.
 *
 * This set should shrink over time as entries move into exceptions.ts, where
 * they can carry the reasoning that produced them. A count that only grows means
 * review notes are accumulating faster than anyone is reading them.
 */
export function registerSynonyms(extra: Record<string, string>): number {
  let n = 0;
  for (const [k, v] of Object.entries(extra)) {
    const key = k.toLowerCase().trim();
    if (SYNONYM[key] === v) continue;
    SYNONYM[key] = v;
    SYNONYM_KEY.set(key.split(" ").map(singular).join(" "), v);
    n++;
  }
  return n;
}

/**
 * `kind` records which side of the rules/exceptions split settled this step.
 *
 * General rules are the asset that carries to the next cuisine; exceptions are
 * the per-cuisine rent. Tagging each application is what lets the agreement
 * report show the ratio, so the engine degrading into a lookup table with extra
 * steps shows up as a falling number instead of as a slow feeling.
 */
export type RuleKind = "general" | "exception";

/** Which table each rule reads from. */
export const RULE_KIND: Record<string, RuleKind> = {
  strip: "general", "strip-blocked": "general", split: "general",
  part: "general", "part-of": "general",
  "category-doubled": "general", "category-missing": "general",
  // These consult a hand-written list of semantic facts.
  synonym: "exception", native: "exception", slot: "exception",
  "preservation-canon": "exception", "part-standalone": "exception",
  "origin-kept": "exception", "state-kept": "exception",
};

export type Trace = { rule: string; from: string; to: string; why?: string; kind?: RuleKind };

export type Result = {
  /** The settled name. Empty when `drop` is set. */
  canonical: string;
  /** Parent slot, when this resolved to a slot child. */
  slot?: string;
  /** Set when the head names more than one ingredient. */
  split?: string[];
  /** Set when this is not an ingredient at all; the value is the reason. */
  drop?: string;
  /** Needs a human: the engine has a defensible answer but low confidence. */
  review?: string;
  trace: Trace[];
};

// ── lookup tables built once ───────────────────────────────────────────────

/** word → class, for single-token modifiers. */
const WORD_CLASS = new Map<string, (typeof CLASSES)[number]>();
/** multi-word modifiers, longest first so `medium sized` beats `medium`. */
const PHRASE_CLASS: Array<[string, (typeof CLASSES)[number]]> = [];
for (const c of CLASSES) {
  for (const w of c.words) {
    if (w.includes(" ")) PHRASE_CLASS.push([w, c]);
    else WORD_CLASS.set(w, c);
    // Hyphenated forms are written both ways in the wild ("hard-boiled" /
    // "hard boiled"); index the hyphen-stripped variant so one entry covers both.
    if (w.includes("-")) WORD_CLASS.set(w.replace(/-/g, " "), c);
  }
}
// Cuisine vocabulary joins its class here, so the engine sees one table and
// rules.ts stays free of any particular kitchen's cultivar names.
for (const v of CUISINE_WORDS) {
  const cls = CLASSES.find((c) => c.name === v.class);
  if (!cls) throw new Error(`CUISINE_WORDS names unknown class "${v.class}"`);
  for (const w of v.words) {
    if (w.includes(" ")) PHRASE_CLASS.push([w, cls]);
    else WORD_CLASS.set(w, cls);
  }
}
PHRASE_CLASS.sort((a, b) => b[0].length - a[0].length);

/** Every alias of every slot child → its resolved identity. */
type Resolved = { slot: string; display: string; child: number };
const SLOT_INDEX = new Map<string, Resolved>();
export const slotDisplay = (c: { names: string[] }) => c.names.join("/");
for (const [slot, def] of Object.entries(SLOTS)) {
  def.children.forEach((child, i) => {
    const display = `${slot} - ${slotDisplay(child)}`;
    for (const n of [...child.names, ...(child.aliases ?? [])]) {
      SLOT_INDEX.set(n, { slot, display, child: i });
    }
  });
}

const CONTESTED_WORDS = new Map(CONTESTED.map((c) => [c.word, c]));

// ── the engine ─────────────────────────────────────────────────────────────

/**
 * Conjunctions that join two ingredients rather than naming one.
 *
 * `white and black sesame seeds` is two nodes, and the trailing head noun has to
 * be distributed across both halves — `garlic and onion powder` is `garlic
 * powder` plus `onion powder`, not `garlic` plus `onion powder`.
 */
const CONJUNCTION = /\s+(?:and|&|\+|with)\s+/;

/**
 * Names that contain a conjunction. `half and half` is one carton of cream, not
 * two halves of something, and splitting it produced the node `half + half` on
 * 15 mentions. Checked before the split, never after.
 */
const NOT_A_CONJUNCTION = /^(?:half(?: and | ?& ?)half|salt(?: and | ?& ?)pepper cure|surf(?: and | ?& ?)turf|sweet(?: and | ?& ?)sour(?: sauce)?|mac(?: and | ?& ?)cheese|black(?: and | ?& ?)white sesame seeds?)$/i;

/**
 * Phrases naming a preparation the recipe defines elsewhere.
 *
 * Reviewer: "no such thing. seasoning mix must be from their own separate
 * recipe. this kind of case should be handled carefully by telling a user that
 * it might have more required ingredients."
 *
 * This is the only class of decision that is a PRODUCT requirement rather than
 * an ontology edit: pantry matching will overstate readiness for these recipes,
 * so the recipe must be marked and the user warned. Dropping the node silently
 * would lose that signal.
 */
const SUBRECIPE =
  /\b(?:seasoning|spice|sauce|marinade|dressing|batter|slurry|paste)\s+(?:mix|mixture|blend|base)\b/i;

/**
 * Named preparations that are the OUTCOME of another recipe.
 *
 * Reviewer, on four separate rows: "it's not actual ingredient, it's a outcome
 * of a separate recipe" (korean ultimate stock), "it's the outcome of
 * subrecipe" (seasoning sauce), "it's not raw ingredient" (lemon pepper
 * seasoning), "there's no simple syrup, it needs manual curation".
 *
 * Same consequence as a seasoning mix: the recipe has hidden requirements, so
 * pantry matching will OVERSTATE readiness. The recipe must be marked and the
 * user warned, which is why these drop with a reason rather than silently.
 */
const SUBRECIPE_OUTCOME =
  /^(?:.*\b(?:ultimate|homemade|house)\s+stock|seasoning sauce|simple syrup|lemon pepper seasoning|.*\bseasoning mix\b|.*\bsauce mixture\b)$/i;

/**
 * Preservation words that name the same state by different surface words.
 *
 * The preservation class KEEPS its word, which is right — but it kept four
 * spellings of the same thing, so `sour kimchi`, `aged kimchi` and `ripe kimchi`
 * stayed apart when the reviewer sent all three to `fermented kimchi`. Keeping a
 * modifier and normalising its spelling are separate jobs.
 */
/**
 * SCOPED, because these words only mean "fermented" next to a fermented thing.
 * Unscoped, `ripe → fermented` turned `ripe avocado` into `fermented avocado`
 * and `ripe tomatoes` into `fermented tomatoes`. A synonym that is true of one
 * ingredient is not a synonym of the language.
 */
const PRESERVATION_CANON: Record<string, { to: string; onlyOn?: RegExp }> = {
  sour: { to: "fermented", onlyOn: /kimchi/ },   // NOT cream: `sour cream` is its own product
  aged: { to: "fermented", onlyOn: /kimchi|doenjang|gochujang/ },
  ripe: { to: "fermented", onlyOn: /kimchi/ },
  ripened: { to: "fermented", onlyOn: /kimchi/ },
  "well-fermented": { to: "fermented" },
  "well fermented": { to: "fermented" },
  // `sun-dried tomatoes` is a distinct product from dried tomatoes, and the
  // reviewer kept it; only the redundant spellings collapse.
  dehydrated: { to: "dried" },
  // NOT `dry: "dried"`. In `dry white wine` and `dry yeast`, "dry" is not a
  // preservation state at all — it means unsweetened, and rewriting it produced
  // `dried white wine`.
};

/**
 * Head nouns that distribute across a conjunction. `garlic and onion powder` is
 * garlic powder plus onion powder; `kimchi and kimchi juice` is not two juices.
 * Only product-forming nouns distribute — everything else leaves the halves alone.
 */
const DISTRIBUTES = new Set([
  "powder", "sauce", "oil", "paste", "flakes", "seeds", "vinegar", "extract",
  "leaves", "juice", "stock", "broth", "wine", "sugar", "salt", "peppers", "pepper",
]);

/**
 * Single words that are never an ingredient on their own.
 *
 * A head that is one bare modifier is a PARSE FAILURE, not a discovery. The
 * reviewer flagged 22 of these — `white`, `korean`, `whole`, `firm`, `boneless`,
 * `of`, `spray`, `button` — each the residue of a line the parser gave up on.
 * Emitting them as nodes is worse than emitting nothing: they look like
 * ingredients, they sort near the top by frequency, and every one costs a review
 * decision to reject.
 *
 * Most are caught by asking whether the word belongs to a modifier class, which
 * generalises to cuisines nobody has crawled. This list is only the remainder
 * that no class covers.
 */
const FRAGMENT = new Set([
  "of", "for", "and", "or", "with", "to", "the", "a", "an", "plus", "each",
  "spray", "short", "seasoning", "topping", "mix", "blend", "misc",
  "other", "extra", "more", "some", "any", "choice", "optional", "needed",
]);

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Split a head into leading modifiers and the remaining noun phrase.
 * Returns the longest modifier run that still leaves at least one word behind —
 * a head that is nothing but modifiers is a parse failure, not an ingredient.
 */
function peel(tokens: string[]): { mods: Array<[string, string]>; rest: string[] } {
  const mods: Array<[string, string]> = [];
  let i = 0;
  outer: while (i < tokens.length - 1) {
    for (const [phrase, cls] of PHRASE_CLASS) {
      const words = phrase.split(" ");
      if (i + words.length < tokens.length &&
          tokens.slice(i, i + words.length).join(" ") === phrase) {
        mods.push([phrase, cls.name]);
        i += words.length;
        continue outer;
      }
    }
    const cls = WORD_CLASS.get(tokens[i]!);
    if (!cls) break;
    mods.push([tokens[i]!, cls.name]);
    i++;
  }
  return { mods, rest: tokens.slice(i) };
}

export type Vocabulary = {
  /** Does this exact head exist elsewhere in the corpus? Guards stripping. */
  has: (head: string) => boolean;
};

export function normalize(raw: string, vocab: Vocabulary): Result {
  const trace: Trace[] = [];
  let s = norm(raw);
  const step = (rule: string, to: string, why?: string) => {
    if (to !== s) { trace.push({ rule, from: s, to, why, kind: RULE_KIND[rule] ?? "general" }); s = to; }
  };
  /** A rule that fired by NOT changing the string still has to be recorded. */
  const held = (rule: string, why: string) =>
    trace.push({ rule, from: s, to: s, why, kind: RULE_KIND[rule] ?? "exception" });

  if (!s) return { canonical: "", drop: "empty", trace };

  // Synonyms run FIRST, not only at the end. `whipping cream` is a known alias
  // of `heavy cream`, but the state rule stripped `whipping` before the alias
  // was ever consulted and the row settled on plain `cream`.
  const early = synonymOf(s);
  if (early) step("synonym", early, "known alias");

  // Universal ingredients are not ontology nodes at all.
  if (UNIVERSAL.has(s)) return { canonical: "", drop: "universal", trace };
  // Neither is equipment, packaging, or a serving role.
  if (NOT_INGREDIENT.has(s)) return { canonical: "", drop: "not-an-ingredient", trace };

  // 1. Sub-recipe references. Checked first: they look like ordinary noun
  //    phrases and would otherwise be normalised into a plausible-looking node.
  if (SUBRECIPE.test(s) || SUBRECIPE_OUTCOME.test(s)) {
    return {
      canonical: "", drop: "subrecipe", trace,
      review: "recipe defines this elsewhere — its ingredients are hidden from the matcher",
    };
  }

  if (SPLIT[s]) {
    return { canonical: "", split: SPLIT[s]!, trace: [
      { rule: "split", from: s, to: SPLIT[s]!.join(" + "), kind: "exception",
        why: "names two ingredients; both halves given by review" }] };
  }

  // 2. Conjunctions. Before anything else, because each half then goes through
  //    the full pipeline independently.
  if (CONJUNCTION.test(s) && !NOT_A_CONJUNCTION.test(s)) {
    const halves = s.split(CONJUNCTION).map(norm).filter(Boolean);
    // A half made only of modifiers is not an ingredient, so this `and` joins
    // two adjectives rather than two things: "boneless and skinless chicken
    // breast" is one cut. Splitting it produced the node
    // `boneless + skinless chicken breast`, and the same shape gave
    // `dried + split mung beans`.
    const isBareModifier = (h: string) =>
      h.split(" ").every((w) => WORD_CLASS.has(w));
    if (halves.length > 1 && halves.some(isBareModifier)) {
      // Adjectives joined by `and` are one modifier run: the reviewer's accepted
      // form is `boneless skinless chicken thighs`, without the conjunction.
      const joined = halves.join(" ");
      if (joined !== s) step("adjective-run", joined, "`and` joins two adjectives, not two ingredients");
    } else if (halves.length > 1) {
      // Distribute a trailing head noun that only the last half carries:
      // "garlic and onion powder" → ["garlic powder", "onion powder"].
      //
      // Guarded by the vocabulary, because distribution is wrong as often as it
      // is right: "kimchi and kimchi juice" is kimchi plus kimchi juice, and
      // distributing turned it into "kimchi juice + kimchi juice". If the left
      // half already names something the corpus uses, it is complete as it stands.
      const last = halves[halves.length - 1]!.split(" ");
      const tail = last.slice(1).join(" ");
      // `white and black sesame seeds` has the two-word tail `sesame seeds`, and
      // testing the whole tail against DISTRIBUTES failed — only its head noun
      // (`seeds`) is in the list. The head noun is what decides.
      const tailHead = singular(last[last.length - 1] ?? "");
      const distributed = halves.map((h, i) =>
        i === halves.length - 1 || !tail || h.includes(" ") ||
        // Distribute only when the distributed form is itself a real node.
        // `garlic powder` is; `kimchi juice` from `kimchi and kimchi juice` is
        // not what was meant, because `kimchi` alone already names the left half.
        !DISTRIBUTES.has(tailHead) ||
        // ...and only when the distributed form is a real head. Dropping this
        // guard while switching to tailHead turned "salt and black pepper" into
        // "salt pepper + black pepper" on 31 mentions.
        !vocab.has(`${h} ${tail}`) ||
        // `kimchi and kimchi juice`: the last half already begins with the
        // first, so the conjunction is listing a thing and its derivative,
        // not distributing one head noun over two.
        halves[halves.length - 1]!.startsWith(`${h} `)
          ? h : `${h} ${tail}`,
      );
      const parts = distributed.map((h) => normalize(h, vocab));
      return {
        canonical: "", split: parts.map((p) => p.canonical).filter(Boolean),
        trace: [{ rule: "split", from: s, to: distributed.join(" + "),
                  why: "names more than one ingredient" }],
      };
    }
  }

  // Native-product renames are ordinary alias rows now (source=native), handled
  // by the synonym step above. They were never a different KIND of fact — just
  // ones that happened to be written in a different literal.

  // The `<part> of <whole>` shape is gone by the time we get here: it is
  // measurement syntax, and stage 1 rewrites it to canonical word order
  // ("zest of 1 lemon" → "lemon zest"). Handling it here as well would mean two
  // places deciding one thing, and the parser's copy is the one that sees the
  // quantity it has to strip.

  // 4. `<whole> <part>` — folds only when the whole is itself a node.
  //     The guard is what separates `scallion greens` (scallion exists → fold)
  //     from `collard greens`, `mustard greens` and `chrysanthemum greens`,
  //     where the "whole" is not an ingredient anyone stocks. Without it the
  //     engine produced `collard`, `chrysanthemum` and, worst, `baby`.
  const suffixRe = new RegExp(String.raw`^(.+?)\s+(${PARTS.join("|")})$`);
  const sm = suffixRe.exec(s);
  if (sm) {
    const whole = norm(sm[1]!);
    const part = sm[2]!;
    if (whole && vocab.has(whole) && !YIELD_LIMITED.has(s)) {
      step("part", whole, `owning ${whole} gives you its ${part}`);
    }
  }

  // 5. The main rule: peel leading modifiers, keeping only what discriminates.
  //    Loops because stripping can expose another modifier.
  for (let pass = 0; pass < 4; pass++) {
    const tokens = s.split(" ");
    const { mods, rest } = peel(tokens);
    if (!mods.length) break;

    const kept: string[] = [];
    let changed = false;
    for (const [word, cls] of mods) {
      if (cls === "preservation" && ALWAYS_PRESERVED.has(norm(rest.join(" ")))) {
        changed = true; continue;   // "there's no wet pasta"
      }
      if (cls === "keep" || cls === "variety" || cls === "preservation") { kept.push(word); continue; }
      // The base cannot be transformed at home, so the state is a purchase.
      if (PURCHASED_FORM.has(s)) {
        held("state-kept", `"${s}" cannot be made from the raw form at home`);
        kept.push(word); continue;
      }
      const behaviour = CLASSES.find((c) => c.name === cls)!.behaviour;
      if (behaviour === "keep") { kept.push(word); continue; }
      if (behaviour === "native") {
        // Not in NATIVE (checked in step 3). An origin word is identity by
        // default — gai lan is not broccoli, mu is not a radish — so it only
        // comes off when what remains is a global commodity, where the origin
        // really is just a supplier.
        if (ORIGIN_PRODUCT.has(s)) {
          held("origin-kept", `"${s}" names a distinct product, not a supplier`);
          kept.push(word); continue;
        }
        const remainder = norm([...kept, ...rest].filter((t) => t !== word).join(" "));
        if (COMMODITY.has(remainder)) { changed = true; continue; }
        kept.push(word);
        continue;
      }
      changed = true; // strip | part
    }
    if (!changed) break;

    const candidate = [...kept, ...rest].join(" ");
    if (candidate === s) break;

    // Safety condition: only strip down to a form the corpus actually uses, or
    // to a slot child. Otherwise `sesame oil` would happily become `oil`.
    // Reviewer DID send `vegetable oil` to `oil`, but that is a slot decision
    // (any neutral oil qualifies), not a stripping decision.
    if (!vocab.has(candidate) && !SLOT_INDEX.has(candidate) && rest.length > 1) {
      trace.push({ rule: "strip-blocked", from: s, to: candidate,
                   why: `"${candidate}" is not used anywhere in the corpus` });
      break;
    }
    const dropped = mods.filter(([w]) => !kept.includes(w));
    step("strip", candidate,
      dropped.map(([w, c]) => `${w} (${c})`).join(", ") + " does not change identity");
  }

  return finish(s, trace, vocab);
}

/** Category-noun repair and slot resolution — the tail every path runs through. */
function finish(s: string, trace: Trace[], vocab: Vocabulary): Result {
  const step = (rule: string, to: string, why?: string) => {
    if (to !== s) { trace.push({ rule, from: s, to, why, kind: RULE_KIND[rule] ?? "general" }); s = to; }
  };

  // World knowledge the class tables cannot derive, applied before the
  // structural repairs so its targets get repaired too.
  const syn = synonymOf(s);
  if (syn) step("synonym", syn, "known alias");

  const canon = s.split(" ").map((w) => {
    const r = PRESERVATION_CANON[w];
    return r && (!r.onlyOn || r.onlyOn.test(s)) ? r.to : w;
  }).join(" ");
  // Collapse repeats the mapping creates: "fermented sour kimchi" has two words
  // that both mean fermented, and canonicalising each produced
  // `fermented fermented kimchi`.
  const deduped = canon.replace(/\b(\w+)(\s+\1\b)+/g, "$1");
  if (deduped !== s) step("preservation-canon", deduped, "one spelling per preserved state");

  // NO singularisation here, deliberately. An earlier version rewrote `chicken
  // thighs` to `chicken thigh` and `eggs` to `egg`, and lost 24 rows of
  // agreement doing it. Number is a display choice, not identity: the corpus's
  // most frequent surface form is the right name, and the comparison in
  // agreement.ts is plural-insensitive so the two never need to be reconciled.
  // Singularisation still happens for TABLE LOOKUPS above, where it belongs.

  const tokens = s.split(" ");
  const head = singular(tokens[tokens.length - 1]!);

  // Doubled category: `mirin wine` → `mirin`, `serrano chili` → `serrano pepper`
  if (tokens.length > 1) {
    const base = singular(tokens[tokens.length - 2]!);
    if (IMPLIES[base]?.includes(head)) {
      step("category-doubled", [...tokens.slice(0, -2), base].join(" "),
        `"${base}" already means a ${head}`);
    }
  }

  /**
   * Redundant species appositive: `mackerel fish` → `mackerel`.
   *
   * Only when what remains NAMES A SPECIES. A modifier does not: `white fish`
   * is a category of fish, not a fish called "white", and stripping it left the
   * bare word `white`, which then failed to parse at all — so `white fish` and
   * `red fish` were dropped from the ontology entirely, silently, as
   * unparseable.
   *
   * The `vocab.has` guard was meant to prevent exactly this, and cannot: every
   * caller that rebuilds the vocabulary passes a permissive `has` because the
   * vocabulary is what it is in the middle of computing. So the test has to be
   * about the WORD, and the modifier lexicon already knows.
   */
  if (APPOSITIVE.test(s)) {
    const base = s.replace(APPOSITIVE, "").trim();
    if (base && !base.includes(" ") && !WORD_CLASS.has(base) && vocab.has(base))
      step("category-doubled", base, `"${base}" already names the fish`);
  }

  // Missing category: `chili` → `chili pepper`, `bay` → `bay leaf`.
  // Singularised first — `chilies pepper` was the alternative.
  const last = s.split(" ");
  const want = CATEGORY[singular(last[last.length - 1]!)];
  if (want && !s.endsWith(` ${want}`)) {
    step("category-missing",
      [...last.slice(0, -1), singular(last[last.length - 1]!), want].join(" "),
      `"${want}" is the category noun`);
  }
  if (SYNONYM[s]) step("synonym", SYNONYM[s]!, "known alias");

  // Slot resolution, last: it operates on the settled name.
  const direct = SLOT_INDEX.get(s);
  if (direct) {
    step("slot", direct.display, `resolves to a specific ${direct.slot}`);
    return { canonical: s, slot: direct.slot, trace };
  }
  if (SLOTS[s]) {
    return {
      canonical: s, slot: s, trace,
      review: `"${s}" is a choice, not an ingredient — a pantry entry must be resolved to one of: ` +
        SLOTS[s]!.children.map((c) => slotDisplay(c)).join(", "),
    };
  }
  // A slot name with a leftover specifier the index doesn't know: worth a look,
  // because it is probably a fourth child nobody has named yet.
  for (const slot of Object.keys(SLOTS)) {
    if (s.endsWith(` ${slot}`) || s.startsWith(`${slot} `)) {
      return {
        canonical: s, slot, trace,
        review: `mentions the slot "${slot}" but matches none of its children — new variety?`,
      };
    }
  }

  // A one-word head that is a modifier or a fragment means the parse failed.
  // Checked LAST, so a legitimate single-word ingredient that happens to share
  // a spelling has had every chance to become something else first.
  //
  // `variety` is excluded, and that exclusion is the whole difficulty. Cultivar
  // words are frequently the ingredient itself — `jalapeno`, `buttermilk`,
  // `oyster`, `shiitake` are all in that class and all things you buy. An
  // earlier version dropped them, which is a far worse error than keeping a
  // fragment: a junk node costs one rejection, a dropped ingredient silently
  // removes every recipe that needs it.
  const cls = WORD_CLASS.get(s)?.name;
  const neverAnIngredient =
    cls === "state" || cls === "grade" || cls === "size" || cls === "origin" || cls === "cut";
  //
  // `variety`, `preservation` and `cut` words were spared entirely, because
  // `jalapeno`, `buttermilk` and `oyster` live in those classes and dropping
  // them is far worse than keeping a fragment. That left `white`, `dry`, `firm`
  // and `split` as nodes.
  //
  // The ingredient KIND lexicon separates them: a word that names a food gets a
  // kind, and a word that only ever modifies one does not. This is the first
  // use of an attribute to answer a parsing question, and it only works because
  // the lexicon was built independently of this rule.
  const bareModifierWithNoKind =
    !!cls && !neverAnIngredient && !guessKind(s);
  if (!s.includes(" ") && (neverAnIngredient || bareModifierWithNoKind || FRAGMENT.has(s)))
    return { canonical: "", drop: "parse-failure", trace,
             review: `"${s}" is a bare modifier — the line it came from did not parse` };

  const contested = s.split(" ").map((w) => CONTESTED_WORDS.get(w)).find(Boolean);
  return { canonical: s, trace, ...(contested ? { review: contested.question } : {}) };
}
