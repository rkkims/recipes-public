/**
 * The LLM extraction overlay — NORMALIZATION.md, "The LLM extraction overlay".
 *
 * The deterministic parser is the fast path; this file answers only for lines
 * it failed. Entries are keyed by a hash of the ORIGINAL crawled line, which
 * is what makes an LLM step reproducible: the same line always answers the
 * same way, a re-crawl re-extracts only lines the file has never seen, and
 * the model never runs during a build — extraction happens offline, its
 * output is verified (every name must anchor in its raw line), and only then
 * does it land here.
 *
 * The overlay proposes SURFACES, never identity. Its names are resolved
 * through the same engine as every parser head — normalize, aliases, number
 * fold — so a name the ontology does not know becomes a named unresolved
 * surface, not a silent success (DECISIONS §3).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const LLM_LINES_FILE = resolve(ROOT, "data/ontology/llm-lines.json");

export type LlmLine = {
  /** The original crawled line, byte for byte — kept for audit; the key is derived from it. */
  raw: string;
  /** Ingredient name(s) the line requires. Empty means "not an ingredient line". */
  names: string[];
  /** The model read the line as optional/garnish/to-taste. OR-ed with the regex. */
  optional: boolean;
  /** Author-offered substitutes. Stored, not yet consumed. */
  alternates: string[];
};

/**
 * FNV-1a, 64-bit, over UTF-8 bytes. Any stable hash would do; this one is
 * dependency-free and matches the seed script byte for byte — the only
 * property that matters, since the hash is a join key, not security.
 */
export function lineKey(raw: string): string {
  let h = 0xcbf29ce484222325n;
  const bytes = Buffer.from(raw, "utf8");
  for (const b of bytes) {
    h ^= BigInt(b);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

export function loadLlmLines(): Map<string, LlmLine> {
  if (!existsSync(LLM_LINES_FILE)) return new Map();
  try {
    const data = JSON.parse(readFileSync(LLM_LINES_FILE, "utf8")) as
      { entries: Record<string, LlmLine> };
    return new Map(Object.entries(data.entries));
  } catch {
    return new Map();
  }
}
