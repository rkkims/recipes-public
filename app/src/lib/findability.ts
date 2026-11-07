/**
 * Is this worth offering to have delivered? — UX-SPEC §4h, RETAILER-SPEC §4.
 *
 * The rule is **findability**, not "Asian items": `butter` and `chicken breast`
 * resolve as cleanly as `gochujang` does, so a rule keyed on having a shelf
 * offers to deliver butter, and "Asian" is a proxy for the predicate rather
 * than the predicate. Nobody needs help buying butter; doenjang is worth the
 * help whoever is shopping.
 *
 * ── Why this left `weee.ts` ────────────────────────────────────────────────
 *
 * It used to answer the question by pulling a shelf code out of a **Weee! URL**
 * and looking it up in `weee-hard-to-find.csv`. The judgment was right and the
 * plumbing was wrong: "a mainstream grocery near this shopper does not reliably
 * carry this" is a claim about a **market**, not about one retailer's taxonomy.
 * Keyed on Weee shelf codes it could not answer for a shopper in Vancouver, and
 * it returned `false` for every retailer that is not Weee! — silently, since
 * "no shelf means no claim" reads as a deliberate abstention.
 *
 * ── The marking is ours now ────────────────────────────────────────────────
 *
 * `data/decisions/hard-to-find.csv`, one row per node, migrated once from the
 * shelf-level answer (`source=weee-shelf-migration`) and hand-owned after. Its
 * coarseness is now visible per-node rather than hidden behind a shelf: rows
 * like `baking soda` carry an inherited `why` about glutinous rice flour, which
 * is a review item and not a bug in this file. Fix the row, not the mechanism.
 *
 * The layering below the marking is unchanged, and it stays layered on purpose:
 * a per-node file plus a kind veto means a node added to the ontology tomorrow
 * inherits the veto's protection without anyone remembering to mark it.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { asObjects } from "./csv";

/**
 * Ingredient KINDS that never carry a buy link, whatever the marking says.
 *
 * The marking is unreliable in one direction and it is the expensive one:
 * `garlic`, `onion`, `scallion` and `ginger` all inherited *Spices Herbs* —
 * the same defect `lib/aisle` measured and rejected the Weee taxonomy over
 * ("garlic and onion under Dried goods"). Left alone, the block offers to
 * deliver an onion.
 *
 * So our own `kind` vetoes the marking. It is the same argument `aisle.ts`
 * makes: it is OUR data, wrong in ways we can fix rather than ways we inherit.
 */
const NEVER_LINK_KIND = new Set(["produce", "meat", "seafood", "dairy", "fruit"]);

/**
 * The specialty items the veto catches wrongly.
 *
 * `perilla leaf` and `buchu` really are produce, and really are things a
 * mainstream store does not have. A blunt veto loses them, so they are named —
 * and named rather than reasoned about, because "which greens does a Western
 * supermarket stock" is a fact about a market and not something derivable from
 * the ontology.
 */
const ALWAYS_LINK = new Set([
  "perilla leaf", "myeolchi", "buchu", "garlic chives", "dried shiitake mushroom",
  "seaweed - nori/gim", "dried seaweed", "seaweed - kombu/dashima", "asian leek",
  "korean radish", "napa cabbage", "lotus root", "burdock", "chwinamul", "gosari",
  "doraji", "minari", "perilla seeds", "chrysanthemum greens",
]);

let marked: Set<string> | null = null;

function decisionsDir(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const c = resolve(dir, "data", "decisions");
    if (existsSync(resolve(c, "hard-to-find.csv"))) return c;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

/** Nodes a mainstream grocery does not reliably carry. Built once. */
function markings(): Set<string> {
  if (marked) return marked;
  const out = new Set<string>();
  const dir = decisionsDir();
  try {
    if (dir)
      for (const r of asObjects(readFileSync(resolve(dir, "hard-to-find.csv"), "utf8")))
        if ((r["hard_to_find"] ?? "").trim() === "yes" && r["node"])
          out.add(r["node"]!.trim().toLowerCase());
  } catch {
    /* A missing or malformed decision file must never take the pantry down. No
       links is a fine outcome; a 500 on the main page is not. */
  }
  marked = out;
  return out;
}

/**
 * Errs toward NO. An affiliate offered on something the shopper can buy in the
 * shop they are standing in is noise at best and a reason to distrust the whole
 * block at worst; one missed on a specialty item costs a click they were going
 * to make anyway.
 *
 * `kind` is not optional in spirit. Omitting it skips the veto, which is how
 * `list/page.tsx` came to offer onions — pass it wherever the id is in hand.
 */
export function hardToFind(name: string, kind?: string): boolean {
  const key = (name ?? "").trim().toLowerCase();
  if (!key) return false;
  if (!markings().has(key)) return false;
  if (kind && NEVER_LINK_KIND.has(kind) && !ALWAYS_LINK.has(key)) return false;
  return true;
}

/** How many nodes are marked — the number step 2 measured before and after. */
export const markedCount = () => markings().size;
