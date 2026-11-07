/**
 * Merge nodes that are one ingredient split by number.
 *
 *   npm run merge-numbers -- --dry     # show what would change
 *   npm run merge-numbers              # write the alias rows
 *
 * `eggs` (650 mentions) and `egg` (431) are two ids for one ingredient. The
 * matcher cannot cross that gap — a recipe wanting one is not satisfied by a
 * pantry holding the other — and it is invisible until the number rule
 * (NORMALIZATION, "Number") collapses their display names and they appear
 * twice in the same list.
 *
 * ── What this writes, and what it deliberately does not ────────────────────
 *
 * It writes ALIAS ROWS, and nothing else. `loser → winner` in
 * `data/ontology/aliases.csv`, which is the repo's existing record of "these
 * two names are one thing".
 *
 * Everything after that is the machinery that already exists:
 *
 *   npm run promote          drops the loser from nodes.csv, because a surface
 *                            that aliases elsewhere is not a node
 *   npm run build-ontology   retires the loser's id behind a redirect to the
 *                            winner's, so every reference ever written keeps
 *                            resolving (INGREDIENT-SPEC §1, §7)
 *
 * No id is deleted and no pantry row is rewritten. That is the whole point of
 * §1's redirect rule, and a merge tool that bypassed it would be the exact
 * mistake the rule was written against.
 *
 * ── Choosing the winner ────────────────────────────────────────────────────
 *
 * More mentions wins. Not because the spelling is better — the display name is
 * decided by the number rule regardless — but because it minimises redirect
 * traffic: the id with the most references behind it is the one to keep.
 *
 * The check is narrow on purpose: two node strings merge only when they are
 * identical once NUMBER and PUNCTUATION are removed — the same key the alias
 * table and the typeahead already use. That catches two classes, and both are
 * genuine:
 *
 *   number        `chicken thigh` / `chicken thighs`
 *   hyphenation   `all purpose flour` / `all-purpose flour`
 *
 * Nothing else about the ontology is touched. Two names that differ by a real
 * word are never candidates, however similar they look.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { numberKey } from "./naming.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ONT = resolve(ROOT, "data/ontology");
const NODES = resolve(ONT, "nodes.csv");
const ALIASES = resolve(ONT, "aliases.csv");
const DRY = process.argv.includes("--dry");

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
const asObjects = (text: string) => {
  const rows = parseCsv(text);
  const h = rows[0]!;
  return rows.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ""])));
};
const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

function main() {
  const nodes = asObjects(readFileSync(NODES, "utf8"))
    .filter((r) => r["status"] === "confirmed")
    .map((r) => ({ node: r["node"]!, mentions: Number(r["mentions"] || 0) }));

  const byKey = new Map<string, typeof nodes>();
  for (const n of nodes) {
    const k = numberKey(n.node);
    const list = byKey.get(k) ?? [];
    list.push(n);
    byKey.set(k, list);
  }

  const existing = existsSync(ALIASES) ? asObjects(readFileSync(ALIASES, "utf8")) : [];
  const aliasOf = new Map(existing.map((a) => [a["surface"]!, a["node"]!]));

  const merges: Array<{ loser: string; winner: string; lm: number; wm: number }> = [];
  for (const [, group] of byKey) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => b.mentions - a.mentions || a.node.localeCompare(b.node));
    const winner = sorted[0]!;
    for (const loser of sorted.slice(1)) {
      // Already recorded, or pointing somewhere else a human chose.
      if (aliasOf.has(loser.node)) continue;
      merges.push({ loser: loser.node, winner: winner.node, lm: loser.mentions, wm: winner.mentions });
    }
  }
  merges.sort((a, b) => (b.lm + b.wm) - (a.lm + a.wm));

  console.log(`${merges.length} number-split pair(s) to merge`);
  for (const m of merges.slice(0, 60)) {
    console.log(`  ${m.loser} (${m.lm})`.padEnd(46) + `→ ${m.winner} (${m.wm})`);
  }
  if (merges.length > 60) console.log(`  … and ${merges.length - 60} more`);

  /**
   * Collapse every chain in the alias table, not just the ones just added.
   *
   * A loser is usually itself an ALIAS TARGET — other surfaces already point at
   * `egg`. Adding `egg → eggs` on top makes a chain, and promote keeps every
   * alias target alive as a node, so `egg` came straight back and the merge
   * silently did nothing.
   *
   * Written over the whole table rather than over this run's merges, so it is
   * idempotent and also repairs chains that predate it. One hop, always, which
   * is what an alias table has to be: with chains, resolution depends on
   * iteration order and the same surface can resolve two ways on two runs.
   */
  const pending = new Map(existing.map((a) => [a["surface"]!, a["node"]!]));
  for (const m of merges) pending.set(m.loser, m.winner);

  const terminal = (from: string): string => {
    let cur = from;
    const seen = new Set<string>([from]);
    for (;;) {
      const next = pending.get(cur);
      // A row pointing at itself is not a chain. A cycle is a review error and
      // must not hang the tool — stop and leave it where it is.
      if (!next || next === cur || seen.has(next)) return cur;
      seen.add(next);
      cur = next;
    }
  };

  let retargeted = 0;
  for (const a of existing) {
    const end = terminal(a["node"] ?? "");
    if (!end || end === a["node"]) continue;
    a["node"] = end;
    a["note"] = (a["note"] ? a["note"] + "; " : "") + "retargeted past a merged node";
    retargeted++;
  }
  if (retargeted) console.log(`${retargeted} alias(es) retargeted past a merged node`);

  if (DRY) { console.log("\n(dry run — nothing written)"); return; }
  if (!merges.length && !retargeted) return;

  const head = "surface,node,source,note";
  const body = existing.map((a) =>
    [q(a["surface"] ?? ""), q(a["node"] ?? ""), q(a["source"] ?? ""), q(a["note"] ?? "")].join(","));
  for (const m of merges) {
    body.push([q(m.loser), q(m.winner), "review",
               q("number split: one ingredient, two nodes")].join(","));
  }
  writeFileSync(ALIASES, [head, ...body].join("\n") + "\n");
  console.log(`\nwrote ${merges.length} alias row(s) to data/ontology/aliases.csv`);
  console.log(`next: npm run promote && npm run build-ontology`);
}

main();
