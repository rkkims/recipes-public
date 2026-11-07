/**
 * Ingredient identity — opaque ids, assigned once, never derived.
 *
 * INGREDIENT-SPEC §1. Ids used to be slugs of the display name, which is fine
 * for a file regenerated from scratch and unsafe the moment a pantry row points
 * at one. The ontology changes by design: reviews rename `jalopeno`, merge
 * `light soy sauce` into `soy sauce`, and the slug rule itself changed twice
 * during this build. Each of those silently empties somebody's pantry — no
 * error, no log line, just a fridge that forgot what was in it.
 *
 * So identity is now a FILE, not a function:
 *
 *   data/ontology/identity.csv    id, name, assigned_at, retired_to
 *
 * The file is append-mostly. A name that has ever had an id keeps it forever. A
 * node that merges into another is RETIRED behind a redirect rather than
 * removed, so a reference written today still resolves in five years.
 *
 * Ids are `ing_` plus 12 lowercase base32 characters, derived from a counter and
 * a hash of the name at first assignment. They are opaque on purpose: anything
 * readable invites code to parse them, and then the id is a name again.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const IDENTITY_FILE = resolve(ROOT, "data/ontology/identity.csv");

export type Identity = {
  id: string;
  /** The display name at the time the id was assigned. Informational only. */
  name: string;
  assigned_at: string;
  /** Set when this node was merged away. Points at the surviving id. */
  retired_to: string;
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ""));
}
const q = (c: string) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);

/**
 * Deterministic id from the name it was FIRST assigned to.
 *
 * Deterministic so that a lost identity file can be rebuilt for names that never
 * changed — but the file remains the authority, because a renamed node must keep
 * the id it was born with and no function of the current name can know that.
 */
const mint = (name: string) =>
  "ing_" + createHash("sha256").update(name).digest("hex")
    .slice(0, 24).replace(/[0-9a-f]{2}/g, (h) =>
      "0123456789abcdefghijklmnopqrstuv"[parseInt(h, 16) % 32]!);

export class Registry {
  /** name → identity, including retired names. */
  private byName = new Map<string, Identity>();
  private byId = new Map<string, Identity>();
  private dirty = false;

  constructor(rows: Identity[] = []) {
    for (const r of rows) { this.byName.set(r.name, r); this.byId.set(r.id, r); }
  }

  static load(): Registry {
    if (!existsSync(IDENTITY_FILE)) return new Registry();
    const rows = parseCsv(readFileSync(IDENTITY_FILE, "utf8"));
    const h = rows[0]!;
    return new Registry(rows.slice(1).map((r) => {
      const o = Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""]));
      return {
        id: o["id"] ?? "", name: o["name"] ?? "",
        assigned_at: o["assigned_at"] ?? "", retired_to: o["retired_to"] ?? "",
      };
    }).filter((r) => r.id && r.name));
  }

  /** The id for a name, minting one the first time and never again. */
  idFor(name: string, today: string): string {
    const seen = this.byName.get(name);
    if (seen) return seen.id;
    let id = mint(name);
    // Collisions are vanishingly unlikely and silently catastrophic, so they are
    // checked rather than assumed away.
    while (this.byId.has(id)) id = mint(id + name);
    const row: Identity = { id, name, assigned_at: today, retired_to: "" };
    this.byName.set(name, row);
    this.byId.set(id, row);
    this.dirty = true;
    return id;
  }

  /** Follow redirects to the surviving id. Cycles resolve to the last hop. */
  resolve(id: string): string {
    const seen = new Set<string>();
    let cur = id;
    while (!seen.has(cur)) {
      seen.add(cur);
      const row = this.byId.get(cur);
      if (!row?.retired_to) return cur;
      cur = row.retired_to;
    }
    return cur;
  }

  /** Retire `fromName` into `toName`, both of which must already have ids. */
  retire(fromName: string, toName: string, today: string): boolean {
    const from = this.byName.get(fromName);
    const to = this.byName.get(toName) ?? { id: this.idFor(toName, today) } as Identity;
    if (!from || from.id === to.id || from.retired_to) return false;
    from.retired_to = to.id;
    this.dirty = true;
    return true;
  }

  /**
   * The comeback — §1's own "it may come back": the name is a node again, so
   * its id must stop redirecting. Without this a resurrected name holds a
   * LIVE id that is also a tombstone, and every reference to it silently
   * resolves to whatever it was once merged into. Danmuji found it: retired
   * into pickled radish in July, re-minted by the curator in August, and 28
   * recipes' yellow pickled radish quietly became the generic.
   */
  revive(name: string): boolean {
    const row = this.byName.get(name);
    if (!row?.retired_to) return false;
    row.retired_to = "";
    this.dirty = true;
    return true;
  }

  /** Names that currently hold a live (non-retired) id. */
  live(): Identity[] { return [...this.byId.values()].filter((r) => !r.retired_to); }
  all(): Identity[] { return [...this.byId.values()]; }
  get changed(): boolean { return this.dirty; }

  save(): void {
    const rows = [...this.byId.values()]
      .sort((a, b) => a.assigned_at.localeCompare(b.assigned_at) || a.name.localeCompare(b.name));
    writeFileSync(IDENTITY_FILE,
      [["id", "name", "assigned_at", "retired_to"],
       ...rows.map((r) => [r.id, r.name, r.assigned_at, r.retired_to])]
        .map((r) => r.map(q).join(",")).join("\n") + "\n");
    this.dirty = false;
  }
}
