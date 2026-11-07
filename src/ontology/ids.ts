/**
 * Node ids — one implementation, shared by everything that emits them.
 *
 * The ontology YAML and the recipe index both reference nodes by id. If they
 * computed those ids separately the two files would drift the first time the
 * slug rule changed, and the failure would be silent: every recipe would still
 * list plausible-looking ids that match nothing.
 *
 * Ids are assigned from the node list ONCE and collision-checked, rather than
 * being a live function of the display name. Two names that slug to one id would
 * otherwise merge two ingredients without saying so.
 */
import { loadNodes } from "./promote.js";
import { singular } from "./normalize.js";
import { Registry } from "./identity.js";

/**
 * Slot children keep the dotted form DECISIONS §3 uses (`seaweed.nori-gim`), so
 * the parent is readable from the id without a lookup.
 */
export const slug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
   // SPACED hyphen only — that is the slot separator ("seaweed - nori/gim").
   // Matching any hyphen turned `all-purpose flour` into `all.purpose-flour`,
   // which reads as a child of a slot called `all`.
   .replace(/\s+-\s+/g, ".").replace(/\//g, "-")
   .replace(/[^a-z0-9.\- ]/g, "").trim().replace(/\s+/g, "-");

export type IdMap = {
  /** display name → OPAQUE id (INGREDIENT-SPEC §1) */
  idOf: Map<string, string>;
  /** display name → slug, for URLs and debugging. May change; never a key. */
  slugOf: Map<string, string>;
  /** id → display name */
  nameOf: Map<string, string>;
  /**
   * Number-insensitive lookup.
   *
   * The resolver decides a name is KNOWN using a plural-insensitive key, so it
   * will happily resolve `chicken thigh` against the node `chicken thighs`. An
   * exact-match id lookup then returned nothing, and 2,077 ingredients were
   * counted as unresolved in the recipe index while the resolver called them
   * resolved. Two components comparing names two ways is the same bug that made
   * ids shared in the first place.
   */
  lookup: (name: string) => string | null;
};

/**
 * Build the id map from the confirmed nodes.
 *
 * Ids come from the identity registry, which assigns one per name ONCE and keeps
 * it through every later rename. `slug` is still computed, but it is a
 * convenience for URLs and logs — nothing may key off it.
 *
 * Pass `today` to allow new assignments. Omitting it makes the call read-only,
 * which is what every consumer other than the ontology build wants: a reporting
 * script should never mint an id as a side effect of looking one up.
 */
export function buildIds(names?: string[], today?: string): IdMap {
  const list = names ??
    loadNodes().filter((n) => n.status !== "candidate")
      .sort((a, b) => b.mentions - a.mentions || a.node.localeCompare(b.node))
      .map((n) => n.node);

  const registry = Registry.load();
  const idOf = new Map<string, string>();
  const slugOf = new Map<string, string>();
  const nameOf = new Map<string, string>();
  const takenSlug = new Map<string, string>();

  for (const name of list) {
    const id = today ? registry.idFor(name, today) : registry.idFor(name, "");
    idOf.set(name, id);
    nameOf.set(id, name);

    let sl = slug(name);
    if (takenSlug.has(sl) && takenSlug.get(sl) !== name) {
      let i = 2;
      while (takenSlug.has(`${sl}-${i}`)) i++;
      sl = `${sl}-${i}`;
    }
    takenSlug.set(sl, name);
    slugOf.set(name, sl);
  }
  if (today && registry.changed) registry.save();
  const byKey = new Map<string, string>();
  const key = (s: string) =>
    s.toLowerCase().trim().split(" ").map((w) => singular(w).replace(/s$/, "")).join(" ");
  for (const [name, id] of idOf) if (!byKey.has(key(name))) byKey.set(key(name), id);

  return {
    idOf, slugOf, nameOf,
    lookup: (name: string) => idOf.get(name) ?? byKey.get(key(name)) ?? null,
  };
}
