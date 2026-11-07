/**
 * Variant resolution — RESOLUTION-SPEC.md, the code half.
 *
 * Normalisation answers "what node does this string name" and is forbidden to
 * ask the next question: which SIBLING a correctly-normalised generic mention
 * means, given whose recipe it is. A Korean recipe writing "chili flakes"
 * means gochugaru; annotating the text differently would be dishonest, and
 * linking a Weee! product off the generic node is the mismatch the spec was
 * written against. So the surface form stays verbatim, and THIS table answers
 * the sibling question, per recipe line, with provenance.
 *
 * ── A table, not an inference engine ───────────────────────────────────────
 *
 * The criterion for a row (spec §2): is there a cuisine default that is right
 * nearly all of the time? Families that fail it stay slots — `seaweed` must
 * be picked by a person, because guessing destroys the one distinction the
 * slot exists to hold. Families that pass it get a row here, stamped
 * `cuisine-default` so the guess is never mistaken for knowledge.
 *
 * Rows deliberately ABSENT, so they are not re-proposed:
 *
 *   sesame oil   review already settled `toasted sesame oil → sesame oil`:
 *                in this corpus the generic node IS the toasted product, so
 *                there is no sibling to resolve to.
 *   vinegar      fails the nearly-always test. A Korean recipe's bare
 *                "vinegar" is white, rice or apple by dish and author, and a
 *                default that is wrong a third of the time is not a default.
 *
 * ── Where the rows came from ───────────────────────────────────────────────
 *
 * `corn syrup` is the model case, found by the 2026-08-17 westernisation
 * audit: the SYNONYM table said bare corn syrup IS oligodang, while the
 * reviewer's own node note says it is not ("corn syrup is glucose syrup from
 * corn, not oligodang", 2026-08-09). Both were right about different things —
 * identity vs what a Korean blogger means by the word — and the contradiction
 * only dissolves when the cuisine reading lives here instead of in an alias.
 * `red pepper flakes → gochugaru` was the same shape and got the same fix.
 */

/**
 * `curated` — a person read the recipe and named the variant, in the curation
 * page. Outranks the table's guess; recorded per line, never propagated
 * (spec §5: confirmation is a per-recipe fact).
 */
export type ResolutionTier = "curated" | "explicit" | "cuisine-default";

export type VariantResolution = {
  /** The node this mention means here. May equal the input node. */
  to: string;
  tier: ResolutionTier;
  /**
   * A machine-derived doubt, for the QC list — never a silent switch. The
   * guk-ganjang trigger reads dish type, and dish type comes from the
   * classifier (curation stopped collecting it 2026-08-17), so a triggered
   * row is ALWAYS a review row (spec §3).
   */
  flag?: string;
};

type Row = {
  term: string;
  cuisine: string;
  to: string;
  /** Dish types that put the default in doubt, and what the doubt is. */
  unless?: { dishTypes: string[]; suspect: string; why: string };
};

/**
 * The Korean table. Growth discipline mirrors rules.ts vs exceptions.ts: the
 * RESOLVER must not grow with cuisines, only rows — and past ~ten rows per
 * cuisine, suspicion is warranted (spec §3).
 */
export const RESOLUTION_TABLE: Row[] = [
  {
    term: "soy sauce", cuisine: "korean", to: "soy sauce",
    /**
     * Korean regular soy sauce IS this corpus's generic node — there is no
     * jin-ganjang sibling to point at, so the row resolves to itself. The row
     * exists for its doubt: guk-ganjang recipes also just write "soy sauce",
     * and that is the one substitution a Korean cook actually notices.
     */
    unless: {
      dishTypes: ["soup-stew", "side"],
      suspect: "soup soy sauce",
      why: "soups and namul are where bare “soy sauce” means guk-ganjang",
    },
  },
  { term: "chili flakes", cuisine: "korean", to: "gochugaru" },
  /**
   * A Korean recipe writing "chives" means buchu, not the thin western herb —
   * the corpus proves it on its own titles: "Korean Chives Pancake (Buchu
   * Jeon)" and "Chive Kimchi (Buchu Kimchi)" both write "Chives" in the
   * line. 37 Korean recipes ride this row; the 37 western ones (lobster
   * rolls, ranch, mashed potatoes) keep the herb, because the row never
   * fires outside its cuisine (curator ruling 2026-08-21).
   */
  { term: "chives", cuisine: "korean", to: "buchu" },
  { term: "rice", cuisine: "korean", to: "short grain rice" },
  { term: "corn syrup", cuisine: "korean", to: "oligodang" },

  /*
    The Chinese and Korean rows below were drafted against the Weee shelf on
    2026-08-19 and kept only where the target node was already carrying the
    weight — the test being "is this default right nearly always", answered
    from how the corpus already writes the variant by name:

      soy sauce   298 bare Chinese mentions; `light soy sauce` has 409. The
                  Woks of Life house style names dark soy sauce explicitly and
                  leaves the everyday one unqualified
      pepper      `white pepper` has 540 uses. Chinese cooking's default pepper
                  is white, and the 27 bare mentions are not an exception to it
      rice wine   `shaoxing wine` has 550. Nothing else is meant
      curry       Korean recipes' curry powder is the Ottogi-style blend, a
                  different product from Japanese roux; the node has 10 uses

    Nine further rows were drafted and rejected in the same pass — they are in
    `data/curation/granularity-drafts-review.md` with the reasons, so they are
    not re-proposed. Two of them ("anchovy broth → anchovy stock",
    "dashi → dashi stock") were duplicate nodes wearing a resolution row's
    clothes and became merges instead (aliases.csv, same day).
  */
  { term: "soy sauce", cuisine: "chinese", to: "light soy sauce" },
  { term: "pepper", cuisine: "chinese", to: "white pepper" },
  { term: "rice wine", cuisine: "chinese", to: "shaoxing wine" },
  { term: "curry powder", cuisine: "korean", to: "korean curry powder" },
  /*
    The fish sauce pass (2026-08-20), same shape as soy sauce: bare "fish
    sauce" is a real all-purpose category and KEEPS its 373 uses — Korean
    recipes' bare mentions are seasoning contexts where any bottle works, so
    korean gets NO row (the kimchi contexts name aekjeot explicitly). Thai is
    the one cuisine with a nearly-always answer: nam pla IS the Thai bottle.
  */
  { term: "fish sauce", cuisine: "thai", to: "nam pla" },
];

/** Leaf → the family term it answers for, per cuisine. Derived, not written. */
const LEAVES = new Map<string, Row>();
for (const r of RESOLUTION_TABLE) {
  if (r.to !== r.term) LEAVES.set(`${r.cuisine}:${r.to}`, r);
  if (r.unless) LEAVES.set(`${r.cuisine}:${r.unless.suspect}`, r);
}

/**
 * Resolve one mention. Returns undefined for the overwhelmingly common case —
 * a node no table row covers — so callers stamp nothing and the fields stay
 * meaningful where they appear.
 *
 * `explicit` is stamped only for leaves the table knows (a Korean recipe that
 * wrote gochugaru or soup soy sauce by name): it is the tier the QC ratio
 * needs as a denominator, and stamping every node in the ontology "explicit"
 * would drown it.
 */
export function resolveVariant(
  node: string, cuisine: string | undefined, dishType: string | undefined,
): VariantResolution | undefined {
  const c = (cuisine ?? "").toLowerCase();
  if (!c) return undefined;

  if (LEAVES.has(`${c}:${node}`)) return { to: node, tier: "explicit" };

  const row = RESOLUTION_TABLE.find((r) => r.cuisine === c && r.term === node);
  if (!row) return undefined;

  const doubted = row.unless && dishType && row.unless.dishTypes.includes(dishType);
  if (row.to === node && !doubted) return undefined;   // self-resolution with nothing to say
  return {
    to: row.to,
    tier: "cuisine-default",
    ...(doubted ? { flag: `may be ${row.unless!.suspect} — ${row.unless!.why}` } : {}),
  };
}
