/**
 * The starter list — DECISIONS §3, ONTOLOGY-SEED "Tier 1".
 *
 * *"First-run pre-check is a hand-picked starter list, not a `ubiquity`
 * threshold. ~12 items, literally enumerated in ONTOLOGY-SEED.md."*
 *
 * It was specified, argued for, and never built — and its absence is what makes
 * the first session a wall of nothing. "Cook tonight" requires EVERY ingredient
 * of a recipe, so nothing appears until fifteen-odd things are in the pantry. A
 * user who adds five and sees three empty tabs concludes the product is broken,
 * and they are not being unreasonable.
 *
 * Two rules from the spec that the implementation has to keep:
 *
 *   - **Pre-checked, never assumed.** These arrive ticked at first run and can
 *     be unticked. After that a pantry row means presence, exactly like any
 *     other — there is no "implicitly present" state anywhere in the model.
 *   - **Hand-picked, not frequency-derived.** DECISIONS §3 is explicit that
 *     corpus frequency measures recipe demand and never kitchen presence, so
 *     this list must not be computed from the corpus. It is a judgement.
 *
 * The seed file names them in its own vocabulary (`soy_sauce.generic`), which
 * predates opaque ids. So they are resolved by NAME against the live ontology
 * here, and anything that fails to resolve is dropped rather than guessed at.
 */
import { load } from "./data";

/**
 * ONTOLOGY-SEED Tier 1, in its own words.
 *
 * Each entry lists the names worth trying, best first — the ontology's display
 * name is not always the seed's phrasing, and a near-miss on `oil.neutral` is
 * better resolved by trying "vegetable oil" than by leaving the commonest
 * cooking fat out of every new pantry.
 */
const SEED: Array<{ label: string; names: string[] }> = [
  { label: "Salt", names: ["salt"] },
  { label: "Black pepper", names: ["black pepper", "pepper"] },
  { label: "Cooking oil", names: ["vegetable oil", "neutral oil", "canola oil", "cooking oil"] },
  { label: "Sugar", names: ["sugar", "white sugar", "granulated sugar"] },
  { label: "Garlic", names: ["garlic"] },
  { label: "Onion", names: ["onion", "yellow onion"] },
  { label: "Eggs", names: ["egg"] },
  { label: "Flour", names: ["all-purpose flour", "flour"] },
  { label: "Butter", names: ["butter", "unsalted butter"] },
  { label: "Rice", names: ["rice", "short grain rice", "white rice"] },
  { label: "Soy sauce", names: ["soy sauce"] },
  { label: "Vinegar", names: ["vinegar", "white vinegar", "rice vinegar"] },
];

export type StarterItem = { id: string; label: string; name: string; recipes: number };

let cached: StarterItem[] | null = null;

/**
 * The starter list against the live vocabulary.
 *
 * Exact display-name match first, then alias, and among alias hits the one used
 * by the most recipes — `pepper` matches several nodes and the one that matters
 * is the one recipes actually call for.
 */
export function starterList(): StarterItem[] {
  if (cached) return cached;
  const { ingredients, recipeCount } = load();

  const byName = new Map<string, typeof ingredients[number]>();
  for (const i of ingredients) {
    const k = i.name.toLowerCase();
    // First writer wins on a tie, and ingredients arrive frequency-ordered
    // enough that this is stable; the alias pass below is where ranking matters.
    if (!byName.has(k)) byName.set(k, i);
  }

  const out: StarterItem[] = [];
  const taken = new Set<string>();
  for (const seed of SEED) {
    let hit: typeof ingredients[number] | undefined;
    for (const n of seed.names) {
      hit = byName.get(n.toLowerCase());
      if (hit) break;
      const viaAlias = ingredients
        .filter((i) => i.aliases.some((a) => a.toLowerCase() === n.toLowerCase()))
        .sort((a, b) => (recipeCount.get(b.id) ?? 0) - (recipeCount.get(a.id) ?? 0));
      if (viaAlias[0]) { hit = viaAlias[0]; break; }
    }
    // Unresolved is a real state and it is silent on purpose: a starter list
    // that crashes the first page load because the vocabulary was rebuilt is
    // worse than one that is eleven items long.
    if (!hit || taken.has(hit.id)) continue;
    taken.add(hit.id);
    out.push({ id: hit.id, label: seed.label, name: hit.name,
               recipes: recipeCount.get(hit.id) ?? 0 });
  }
  cached = out;
  return out;
}

const staples = () => new Set(starterList().map((s) => s.id));

/**
 * Is this one of the twelve?
 *
 * Used to keep the post-cook "run out of anything?" list short. Asking about
 * salt after every dinner is how you teach someone to dismiss the panel without
 * reading it, and then the one time they did run out of gochujang they dismiss
 * that too.
 */
export function isStaple(id: string): boolean {
  return staples().has(id);
}

/* The foundation jars and their rank moved to `lib/order` — a rule about
   the order of a shelf that is drawn on a device now, and a constant that
   needs no ontology to state. Re-exported so every caller keeps its one
   address, and so the argument for the pinning stays beside the ids. */
export { FOUNDATION, foundationRank } from "./order";
