/**
 * The relations the matcher asks for, built from the ontology — INGREDIENT-SPEC §3a.
 *
 * `match.ts` declares a `Relations` seam and defaults to exact-only, with a
 * comment explaining why it does not import `src/ontology/edges.ts` directly:
 * that module keys by NAME and everything here keys by opaque id, so calling it
 * would have compiled, passed its own tests, and silently matched nothing.
 *
 * This fills the seam from `ontology.json`, which is already id-keyed.
 *
 * ── Direction is the whole thing ───────────────────────────────────────────
 *
 * An `is_a` edge is `[narrow, broad]` — `[basa, white fish]`. Both directions
 * match, and they are NOT the same answer:
 *
 *   pantry basa,       recipe white fish  →  match, silent
 *   pantry white fish, recipe basa        →  match, DISCLOSED
 *
 * Reviewer: *"basa belongs to white fish, but white fish does not belong to
 * basa."* The specific in the pantry answers the general in the recipe
 * outright — asking the user to confirm that basa is a white fish is asking
 * them to check the ontology. The uncertainty is entirely on the other side: a
 * pantry that says `white fish` has not said WHICH fish, and the recipe named
 * one. That is the only case where the user knows something the system does
 * not, so it is the only case that earns a question.
 *
 * ── Siblings never match ───────────────────────────────────────────────────
 *
 * `chicken thigh` and `chicken breast` share a parent and neither contains the
 * other. Walking is strictly up or strictly down from one end; there is no step
 * that crosses. A sibling match is the failure this whole section exists to
 * prevent — it tells someone a dish is cookable when it is not.
 *
 * ── derives_from is one-way by construction ────────────────────────────────
 *
 * `[part, whole]` — `[lemon juice, lemon]`. Holding the whole answers a recipe
 * wanting the part, because the cook can produce it. The reverse is false and
 * is not offered: a bottle of juice is not a lemon.
 */
import type { Relations } from "./match";

/**
 * Pairs as the ontology file actually types them — `string[][]`, not tuples.
 * Narrowing here rather than at the call site keeps the JSON's shape the
 * source of truth, and every read below already guards on both ends.
 */
export type OntologyRelations = {
  is_a?: string[][];
  derives_from?: string[][];
  substitutes_for?: string[][];
};

/** How far up or down a chain to look before giving up. */
const MAX_DEPTH = 12;

export function buildRelations(rel: OntologyRelations | undefined): Relations {
  /**
   * MANY parents per node, not one.
   *
   * This was `Map<string, string>`, so a second edge for the same child
   * silently overwrote the first — and the overwrite was invisible: no error,
   * no log, just an ingredient that quietly stopped satisfying a recipe it used
   * to. The bug had no symptom while the ontology held seven edges and every
   * child had one parent.
   *
   * Ingredients are not a tree. `beef flank steak` is a kind of STEAK and a kind
   * of BEEF, and both edges earn their place: recipes ask for both words. The
   * two derivation rules find the two directions — `hierarchy.ts` reads the head
   * noun off the suffix, `hierarchy-prefix.ts` the base ingredient off the
   * prefix — so importing both into a single-parent map would have thrown half
   * of each away.
   */
  const broader = new Map<string, string[]>();        // narrow → broad[]
  const narrower = new Map<string, string[]>();       // broad → narrow[]
  for (const [narrow, broad] of rel?.is_a ?? []) {
    if (!narrow || !broad || narrow === broad) continue;
    if (!broader.has(narrow)) broader.set(narrow, []);
    // Duplicated edges are a data question, not a matching one; keeping the
    // list unique means the walk below cannot revisit for free.
    if (!broader.get(narrow)!.includes(broad)) broader.get(narrow)!.push(broad);
    if (!narrower.has(broad)) narrower.set(broad, []);
    narrower.get(broad)!.push(narrow);
  }

  /** whole → parts the cook can produce from it. */
  const partsOf = new Map<string, string[]>();
  for (const [part, whole] of rel?.derives_from ?? []) {
    if (!part || !whole || part === whole) continue;
    if (!partsOf.has(whole)) partsOf.set(whole, []);
    partsOf.get(whole)!.push(part);
  }

  const swaps = new Map<string, Set<string>>();
  for (const [a, b] of rel?.substitutes_for ?? []) {
    if (!a || !b || a === b) continue;
    if (!swaps.has(a)) swaps.set(a, new Set());
    if (!swaps.has(b)) swaps.set(b, new Set());
    swaps.get(a)!.add(b);
    swaps.get(b)!.add(a);
  }

  /**
   * Is `broad` anywhere above `narrow`?
   *
   * A breadth-first walk rather than a single chain, because a node can have
   * several parents. `seen` does double duty: it stops a cycle — which is bad
   * data, not a match — and stops the exponential blow-up a diamond would
   * otherwise cause when two parents share an ancestor.
   *
   * MAX_DEPTH bounds the LEVELS, not the nodes visited: a wide ancestry is
   * fine, a deep one is a sign the hierarchy has gone wrong.
   */
  const belongsTo = (narrow: string, broad: string): boolean => {
    const seen = new Set<string>([narrow]);
    let frontier = broader.get(narrow) ?? [];
    for (let depth = 0; frontier.length && depth < MAX_DEPTH; depth++) {
      const next: string[] = [];
      for (const cur of frontier) {
        if (cur === broad) return true;
        if (seen.has(cur)) continue;
        seen.add(cur);
        for (const up of broader.get(cur) ?? []) if (!seen.has(up)) next.push(up);
      }
      frontier = next;
    }
    return false;
  };

  /** Can the cook produce `want` from `have`, directly or via one step up? */
  const canProduce = (want: string, have: string): boolean => {
    if ((partsOf.get(have) ?? []).includes(want)) return true;
    // Holding a narrower thing than the whole still works: `meyer lemon`
    // produces `lemon juice` if meyer lemon belongs to lemon.
    for (const [whole, parts] of partsOf)
      if (parts.includes(want) && belongsTo(have, whole)) return true;
    return false;
  };

  return {
    satisfies(want: string, have: string) {
      if (want === have) return { ok: true, via: "exact" };

      // The pantry item is the specific one. It belongs to what the recipe
      // asked for, so there is nothing for the user to check.
      if (belongsTo(have, want)) return { ok: true, via: "is_a" };

      // The pantry item is the general one. It has not said which, and the
      // recipe named one — the only case that earns a question.
      if (belongsTo(want, have)) return { ok: true, via: "is_a", disclose: true };

      if (canProduce(want, have)) return { ok: true, via: "derives_from", disclose: true };

      if (swaps.get(want)?.has(have)) return { ok: true, via: "substitutes_for", disclose: true };

      return { ok: false };
    },
  };
}
