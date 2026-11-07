/**
 * Removal for cause — CREATOR-SPEC §6a, the mirror §6 lacked.
 *
 * Mechanical and narrow: two grounds only, dead source URLs and affiliate
 * tag abuse. Never quality — nothing in the spec judges a recipe, and a
 * quality ground here would smuggle in the moderation cost §4 refused.
 *
 * `removed` behaves exactly like `withdrawn` in the pipeline (§6's three
 * rules unchanged) and differs only in what the copy is allowed to say:
 * "unavailable at the creator's request" is a lie about someone we ejected,
 * so the status is separate to keep the sentence honest.
 *
 * Written by the operator's script (`npm run creator-removal`), never by the
 * app — there is no admin surface, deliberately: a removal is a decision a
 * person makes at a terminal with the evidence in front of them, not a
 * button next to a queue. Read fresh per request like every claims file,
 * because it changes under a running server.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILE = resolve(process.cwd(), "..", "data", "creators", "removals.json");

export type Removal = {
  removed_at: string;
  /** §6a's two grounds. There is no third. */
  reason: "dead-source" | "tag-abuse";
  note?: string;
};

function read(): Record<string, Removal> {
  if (!existsSync(FILE)) return {};
  try { return JSON.parse(readFileSync(FILE, "utf8")) as Record<string, Removal>; }
  catch { return {}; }        // a corrupt file must not take the pages down
}

export function removalOf(creatorId: string): Removal | null {
  return read()[creatorId] ?? null;
}
