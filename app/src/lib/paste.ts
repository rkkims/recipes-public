/**
 * Turn a pasted block of ingredient lines into resolved ids to review.
 *
 * Entering a recipe of your own meant picking twelve ingredients one at a time
 * through an autosuggest, while the text was already sitting in the clipboard —
 * straight out of a video description. That is a two-minute chore guarding a
 * ten-second job.
 *
 * ── What this is NOT ───────────────────────────────────────────────────────
 *
 * It is **not** the pipeline's parser. `src/ingest/` holds the real one, with
 * 58 test cases, and it built the entire corpus — but the app cannot import
 * across its own package boundary (see the note in `match.ts`), and duplicating
 * it here would create exactly the second copy that `match.ts` warns about.
 *
 * So this is a deliberately modest reader: strip the quantity, look the rest up
 * in the vocabulary the pantry already searches, and show its guesses. It will
 * miss things the real parser catches. That is acceptable because **nothing it
 * produces is saved without being looked at** — every line comes back as a
 * proposal with its original text attached, exactly like the starter list and
 * the grocery basket. A wrong guess costs one tap.
 *
 * If this proves worth more than it costs, the honest next step is a shared
 * build step for the real parser, not a bigger version of this.
 */
import { search } from "./data";

export type ParsedLine = {
  /** What the user pasted, kept verbatim so a wrong guess can be judged. */
  text: string;
  /** Our best guess, if we had one. */
  id?: string;
  name?: string;
  /** The guess is from a broad match rather than a confident one. */
  unsure?: boolean;
};

/**
 * Leading amounts, units and the usual noise.
 *
 * Kept small on purpose — this decides what we look UP, not what an ingredient
 * IS, and every stripped word is one we might have needed.
 */
const UNITS = String.raw`tsp|teaspoons?|tbsp|tablespoons?|cups?|oz|ounces?|lb|lbs|pounds?|` +
              String.raw`g|grams?|kg|ml|l|litres?|liters?|cloves?|pieces?|slices?|cans?|` +
              String.raw`packs?|packets?|bunch(?:es)?|handfuls?|pinch(?:es)?|dash(?:es)?|sprigs?`;

const PREP = /\b(?:finely|roughly|thinly|freshly|lightly|well)?\s*(?:chopped|minced|diced|sliced|grated|crushed|beaten|melted|softened|drained|rinsed|peeled|trimmed|cubed|shredded|toasted|ground|optional|to taste|for (?:garnish|serving|frying))\b/gi;

/** One line, reduced to the words worth searching for. */
export function ingredientText(line: string): string {
  return line
    // A parenthetical is almost always a note: "(about 2 cups)", "(optional)".
    .replace(/\([^)]*\)/g, " ")
    // Anything after a comma is usually preparation: "onion, finely chopped".
    .replace(/,.*$/, " ")
    .replace(PREP, " ")
    // Leading list marks and quantities, including ranges and fractions.
    .replace(/^[\s\-–—*•·\d]+/, " ")
    .replace(/^\s*\d*[\d/¼½¾⅓⅔⅛\s.-]*\s*/, " ")
    .replace(new RegExp(String.raw`^\s*(?:${UNITS})\b`, "i"), " ")
    .replace(/^\s*(?:of)\b/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse a pasted block. One entry per non-empty line, in the order given.
 *
 * Order is preserved because the user is going to read this list against the
 * one they pasted, and reordering it would make every row need finding.
 */
export function parseLines(block: string, limit = 40): ParsedLine[] {
  return block
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, limit)
    .map((text) => {
      const term = ingredientText(text);
      if (term.length < 2) return { text };
      const hits = search(term, 3);
      const best = hits[0];
      if (!best) return { text };
      /**
       * "Unsure" when the match was not the whole phrase.
       *
       * A line reading "gochujang" matching `gochujang` is a different kind of
       * event from "sweet potato starch noodles" matching `noodle`, and the
       * review list should not present them identically — the second is exactly
       * the case a human needs to look at.
       */
      const exact = best.name.toLowerCase() === term.toLowerCase();
      return {
        text, id: best.id, name: best.name,
        ...(exact ? {} : { unsure: true }),
      };
    });
}
