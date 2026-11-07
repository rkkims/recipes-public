/**
 * The major-allergen list, for the app.
 *
 * Duplicated from `src/ontology/allergens.ts` rather than imported: the app
 * cannot reach across its package boundary, and this is a closed, externally
 * defined vocabulary that does not change — the one kind of constant where a
 * copy is safer than a build step.
 */
export const ALLERGENS = [
  "peanut", "treenut", "milk", "egg", "soy", "wheat", "fish", "shellfish", "sesame",
] as const;
