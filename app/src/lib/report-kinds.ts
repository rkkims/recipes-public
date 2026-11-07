/**
 * The report categories, in a file with no imports.
 *
 * Separate from `lib/reports.ts` for one hard reason: that file reads and
 * appends to disk, so it imports `node:fs`, and the dialog that offers these
 * options is a client component. Importing the vocabulary from there dragged
 * `node:fs` into the browser bundle and the production build refused to
 * generate the chunk — correctly, and with an error message pointing at the
 * component rather than at the import that caused it.
 *
 * A list of strings has no business being on either side of that boundary, so
 * it lives here and both sides read it.
 *
 * ── Why these seven ──────────────────────────────────────────────────────
 *
 * They are the SUBSYSTEMS this product has, not severity levels. Severity is a
 * judgement made later by whoever triages; the layer a bug lives in is a fact
 * the reporter already knows at the moment they hit it, and it is what decides
 * who looks at it and which file it lands in.
 *
 * "ingredient" and "ontology" are separate on purpose and it is the most useful
 * split of the seven: a recipe listing something it does not use is one
 * recipe's data, while "scallion and green onion are two different things" is
 * the vocabulary every recipe shares. The first is a row, the second is a rule,
 * and they are fixed in different files by different kinds of work.
 */
export const REPORT_KINDS = [
  "app function",
  "ingredient",
  "ontology",
  "recipe data",
  "recommendation",
  "visual",
  "other",
] as const;

export type ReportKind = (typeof REPORT_KINDS)[number];
