/**
 * Fold an offline QC session back into the ontology — QC-SPEC §3, §8.2.
 *
 *   npm run qc-import -- <export.json> --dry     # what it would change
 *   npm run qc-import -- <export.json>           # change it
 *
 * The offline tool cannot write the ontology: `identity.csv` and the redirect
 * chain live here, and a page that minted its own ids would break the one
 * guarantee INGREDIENT-SPEC §1 makes. So a session exports names and verdicts,
 * and this is the only thing that turns them into ontology.
 *
 * ── The staleness gate ─────────────────────────────────────────────────────
 *
 * The bundle is a snapshot. It has already gone stale once inside a day, and
 * the failure is quiet: a reviewer accepts an edge onto a node that has since
 * been demoted, or retargets an alias that has since been retargeted here.
 *
 * So the generator stamps the build, this compares, and a mismatch STOPS the
 * import. `--force` exists because a stale import is sometimes still the right
 * call, but it should be a decision rather than a default.
 *
 * ── What it writes, and what it deliberately does not ──────────────────────
 *
 *   nodes.csv        minted ingredients, confirmed
 *   aliases.csv      new aliases, retargets, drops
 *   is_a.csv         accepted hierarchy edges — reviewed data, next to the
 *                    alias table, NOT into edges.ts, which is a hand-written
 *                    rule file and not somewhere 2,000 rows belong
 *   curation/lines.json  the line-by-line record
 *
 * It does not assign ids and it does not build. `npm run build-ontology` does
 * that afterwards, which is also what retires anything the import orphaned.
 *
 * ── Divergence ─────────────────────────────────────────────────────────────
 *
 * Every annotation carries BOTH the surface the reviewer typed and the node it
 * resolved to (§8.3b). If an alias changed mid-session — theirs or ours — the
 * two disagree, and the import reports it rather than silently preferring one.
 * That report is the whole reason both were stored.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { numberKey } from "../ontology/naming.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ONT = resolve(ROOT, "data/ontology");
const QC = resolve(ROOT, "data/qc");
const CURATION = resolve(ROOT, "data/curation");
const STAMP = resolve(QC, "offline-qc/.build");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const FORCE = args.includes("--force");
const FILE = args.find((a) => !a.startsWith("--"));

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
const csv = (head: string[], rows: string[][]) =>
  [head.join(","), ...rows.map((r) => r.map(q).join(","))].join("\n") + "\n";

type Ann = { v: string; node?: string; surface?: string; via?: string; minted?: boolean; at?: string };
type Export = {
  tool?: string; builtFrom?: string; exportedAt?: string;
  annotations?: Record<string, Record<string, Ann>>;
  aliases?: { surface: string; node: string; at?: string }[];
  nodes?: { name: string; at?: string }[];
  edges?: { node: string; parent: string | null; verdict: string; at?: string }[];
  aliasEdits?: { surface: string; node: string | null; verdict: string; at?: string }[];
  /** The hierarchy review pass, keyed `child\u0000parent`. */
  hier?: Record<string, {
    child: string; parent: string; relation: string; v: string; src?: string; at?: string;
  }>;
};

function die(msg: string): never { console.error(msg); process.exit(1); }

function main() {
  if (!FILE) die("usage: npm run qc-import -- <export.json> [--dry] [--force]");
  if (!existsSync(FILE)) die(`no such file: ${FILE}`);

  let ex: Export;
  try { ex = JSON.parse(readFileSync(FILE, "utf8")); }
  catch (e) { die(`${FILE} is not valid JSON — ${(e as Error).message}`); }

  if (ex.tool !== "recipe-qc")
    die(`${FILE} is not a recipe-qc export (tool = ${JSON.stringify(ex.tool)}).`);

  // ── the staleness gate ───────────────────────────────────────────────────
  const stamp = existsSync(STAMP) ? readFileSync(STAMP, "utf8").trim() : "";
  if (!stamp) {
    console.warn(`! no build stamp at ${STAMP} — cannot tell whether this export is current.`);
  } else if (ex.builtFrom !== stamp) {
    const msg = [
      `This export came from a bundle built ${ex.builtFrom || "(unstamped)"},`,
      `but the current bundle was built ${stamp}.`,
      ``,
      `The ontology moved after that bundle was made, so decisions in this file`,
      `were taken against a base that no longer exists — an edge may point at a`,
      `node since demoted, an alias at a target since retargeted.`,
      ``,
      `Re-export from a fresh bundle, or pass --force if you have read the`,
      `differences and want it anyway.`,
    ].join("\n");
    if (!FORCE) die(msg);
    console.warn("! " + msg.split("\n")[0] + " (forced)\n");
  }

  // ── current state ────────────────────────────────────────────────────────
  const nodeRows = parseCsv(readFileSync(resolve(ONT, "nodes.csv"), "utf8"));
  const nodeHead = nodeRows[0]!;
  const nodeBody = nodeRows.slice(1);
  const nodeAt = new Map(nodeBody.map((r, i) => [r[0]!, i]));
  const confirmed = new Set(nodeBody.filter((r) => r[2] === "confirmed").map((r) => r[0]!));

  const aliasRows = parseCsv(readFileSync(resolve(ONT, "aliases.csv"), "utf8"));
  const aliasBody = aliasRows.slice(1);
  const aliasAt = new Map(aliasBody.map((r, i) => [r[0]!, i]));

  const isaFile = resolve(ONT, "is_a.csv");
  const isaBody = existsSync(isaFile) ? parseCsv(readFileSync(isaFile, "utf8")).slice(1) : [];
  const isaAt = new Map(isaBody.map((r, i) => [r[0]!, i]));

  /**
   * `derives_from`, as reviewed data.
   *
   * `edges.ts` holds a hand-written list argued in prose; this is the file the
   * review pass writes to, for the same reason `is_a.csv` exists — a few
   * hundred rows do not belong in a rule module.
   */
  const dfFile = resolve(ONT, "derives_from.csv");
  const dfBody = existsSync(dfFile) ? parseCsv(readFileSync(dfFile, "utf8")).slice(1) : [];

  /**
   * Edges the reviewer REJECTED.
   *
   * Without this the queue regenerates from the derivation rules on every
   * build and offers the same rejected edge again — the reviewer's work would
   * evaporate, which is the fastest way to teach someone to stop reviewing.
   * Same shape and same place as the category rejections already recorded in
   * `data/decisions/`.
   */
  const decisionsDir = resolve(ROOT, "data/decisions");
  const rejFile = resolve(decisionsDir, "rejected-edges.csv");
  const rejBody = existsSync(rejFile) ? parseCsv(readFileSync(rejFile, "utf8")).slice(1) : [];

  const linesFile = resolve(CURATION, "lines.json");
  const curated: Record<string, Record<string, Ann>> =
    existsSync(linesFile) ? JSON.parse(readFileSync(linesFile, "utf8")) : {};

  const today = new Date().toISOString().slice(0, 10);
  const tally = { nodes: 0, aliases: 0, retargets: 0, drops: 0, edges: 0, roots: 0,
                  lines: 0, skipped: 0, hierOk: 0, hierNo: 0, derives: 0 };
  const rejected: string[] = [];

  // ── 1. minted nodes ──────────────────────────────────────────────────────
  for (const n of ex.nodes ?? []) {
    const name = (n.name || "").trim();
    if (!name) continue;
    if (nodeAt.has(name)) { tally.skipped++; continue; }        // idempotent
    nodeBody.push([name, "0", "confirmed", "", `minted in offline QC ${today}`]);
    nodeAt.set(name, nodeBody.length - 1);
    confirmed.add(name);
    tally.nodes++;
  }

  // ── 2. aliases ───────────────────────────────────────────────────────────
  const addAlias = (surface: string, node: string, note: string) => {
    if (!surface || !node) return;
    if (!confirmed.has(node)) { rejected.push(`alias "${surface}" → "${node}": target is not a confirmed node`); return; }
    if (numberKey(surface) === numberKey(node)) { tally.skipped++; return; }  // the number rule owns this
    const at = aliasAt.get(surface);
    if (at !== undefined) {
      if (aliasBody[at]![1] === node) { tally.skipped++; return; }
      aliasBody[at]![1] = node;
      aliasBody[at]![3] = note;
      tally.retargets++;
      return;
    }
    aliasBody.push([surface, node, "qc", note]);
    aliasAt.set(surface, aliasBody.length - 1);
    tally.aliases++;
  };

  for (const a of ex.aliases ?? []) addAlias(a.surface, a.node, `recorded in offline QC ${today}`);
  for (const e of ex.aliasEdits ?? []) {
    if (e.verdict === "drop") {
      const at = aliasAt.get(e.surface);
      if (at === undefined) { tally.skipped++; continue; }
      aliasBody.splice(at, 1);
      aliasAt.clear();
      aliasBody.forEach((r, i) => aliasAt.set(r[0]!, i));
      tally.drops++;
    } else if (e.node) {
      addAlias(e.surface, e.node, `${e.verdict} in offline QC ${today}`);
    }
  }

  // ── 3. hierarchy edges ───────────────────────────────────────────────────
  for (const e of ex.edges ?? []) {
    const child = (e.node || "").trim();
    if (!child) continue;
    if (!confirmed.has(child)) { rejected.push(`edge for "${child}": not a confirmed node`); continue; }
    if (e.parent === null || e.verdict === "made-root") {
      const at = isaAt.get(child);
      if (at === undefined) { tally.skipped++; continue; }
      isaBody.splice(at, 1);
      isaAt.clear();
      isaBody.forEach((r, i) => isaAt.set(r[0]!, i));
      tally.roots++;
      continue;
    }
    const parentName = e.parent.trim();
    if (!confirmed.has(parentName)) { rejected.push(`edge "${child}" → "${parentName}": parent is not a confirmed node`); continue; }
    if (parentName === child) { rejected.push(`edge "${child}" → itself`); continue; }
    // A cycle is two individually-reasonable answers and a broken graph.
    let cur: string | undefined = parentName, guard = 0;
    const seen = new Set<string>([child]);
    while (cur && guard++ < 40) {
      if (seen.has(cur)) break;
      seen.add(cur);
      const at: number | undefined = isaAt.get(cur);
      cur = at === undefined ? undefined : isaBody[at]![1];
    }
    if (cur && seen.has(cur)) { rejected.push(`edge "${child}" → "${parentName}" would close a cycle`); continue; }

    const at = isaAt.get(child);
    if (at !== undefined) {
      if (isaBody[at]![1] === parentName) { tally.skipped++; continue; }
      isaBody[at]![1] = parentName;
      isaBody[at]![3] = `${e.verdict} in offline QC ${today}`;
    } else {
      isaBody.push([child, parentName, "qc", `${e.verdict} in offline QC ${today}`]);
      isaAt.set(child, isaBody.length - 1);
    }
    tally.edges++;
  }

  // ── 3b. the hierarchy review pass ────────────────────────────────────────
  /**
   * Keyed on child AND parent, unlike §3 above.
   *
   * That section replaces a node's single parent, which is what the modal's
   * reparent action means. This one ADDS edges, because a node can belong to
   * more than one thing — `beef flank steak` is a kind of steak and a kind of
   * beef — and the matcher and the build were both taught to hold several.
   */
  const isaPairs = new Set(isaBody.map((r) => `${r[0]}\u0000${r[1]}`));
  const dfPairs = new Set(dfBody.map((r) => `${r[0]}\u0000${r[1]}`));
  const rejPairs = new Set(rejBody.map((r) => `${r[0]}\u0000${r[1]}`));

  for (const v of Object.values(ex.hier ?? {})) {
    const child = (v.child || "").trim(), parent = (v.parent || "").trim();
    if (!child || !parent || child === parent) continue;
    if (!confirmed.has(child)) { rejected.push(`edge "${child}": not a confirmed node`); continue; }
    if (!confirmed.has(parent)) { rejected.push(`edge "${child}" → "${parent}": parent not confirmed`); continue; }

    const key = `${child}\u0000${parent}`;

    if (v.v === "no") {
      // Recorded so the queue stops offering it, and only that: rejecting a
      // proposal removes nothing that was already accepted.
      if (!rejPairs.has(key)) {
        rejBody.push([child, parent, `rejected in offline QC ${today}`]);
        rejPairs.add(key);
        tally.hierNo++;
      } else tally.skipped++;
      continue;
    }
    if (v.v !== "ok") continue;

    if (v.relation === "derives_from") {
      if (dfPairs.has(key)) { tally.skipped++; continue; }
      // `is_a` and `derives_from` are different claims and must not both hold:
      // holding the whole would then silently satisfy a recipe wanting the part.
      const wasIsA = isaBody.findIndex((r) => r[0] === child && r[1] === parent);
      if (wasIsA >= 0) isaBody.splice(wasIsA, 1);
      dfBody.push([child, parent, "qc", `accepted in offline QC ${today}`]);
      dfPairs.add(key);
      tally.derives++;
      continue;
    }

    if (isaPairs.has(key)) { tally.skipped++; continue; }
    /**
     * A cycle is two individually-reasonable answers and a broken graph. The
     * walk follows EVERY parent now, not one chain, or a diamond would look
     * like a dead end.
     */
    const up = new Map<string, string[]>();
    for (const r of isaBody) {
      if (!up.has(r[0]!)) up.set(r[0]!, []);
      up.get(r[0]!)!.push(r[1]!);
    }
    const seen = new Set<string>([child]);
    let frontier = [parent], closes = false;
    for (let d = 0; frontier.length && d < 40 && !closes; d++) {
      const next: string[] = [];
      for (const cur of frontier) {
        if (cur === child) { closes = true; break; }
        if (seen.has(cur)) continue;
        seen.add(cur);
        for (const u of up.get(cur) ?? []) next.push(u);
      }
      frontier = next;
    }
    if (closes) { rejected.push(`edge "${child}" → "${parent}" would close a cycle`); continue; }

    isaBody.push([child, parent, "qc", `accepted in offline QC ${today}`]);
    isaPairs.add(key);
    tally.hierOk++;
  }

  // ── 4. line annotations, and the divergence report ───────────────────────
  /** surface → node, as the ontology reads it AFTER this import's alias work. */
  const resolves = new Map(aliasBody.map((r) => [numberKey(r[0]!), r[1]!]));
  const nodeKeys = new Map([...confirmed].map((n) => [numberKey(n), n]));
  const diverged: string[] = [];

  for (const [rid, lines] of Object.entries(ex.annotations ?? {})) {
    if (!curated[rid]) curated[rid] = {};
    for (const [idx, a] of Object.entries(lines)) {
      curated[rid][idx] = a;
      tally.lines++;
      if (a.v !== "ok" || !a.surface || !a.node) continue;
      const now = resolves.get(numberKey(a.surface)) ?? nodeKeys.get(numberKey(a.surface));
      if (now && now !== a.node) {
        diverged.push(`  ${rid} line ${idx}: recorded "${a.surface}" → ${a.node}, but it now resolves to ${now}`);
      }
    }
  }

  // ── report ───────────────────────────────────────────────────────────────
  console.log(`${FILE}`);
  console.log(`  exported ${ex.exportedAt ?? "(unstamped)"} from a bundle built ${ex.builtFrom ?? "(unstamped)"}`);
  console.log(`\nWOULD APPLY${DRY ? "" : " — applying"}`);
  console.log(`  nodes minted        ${tally.nodes}`);
  console.log(`  aliases added       ${tally.aliases}`);
  console.log(`  aliases retargeted  ${tally.retargets}`);
  console.log(`  aliases dropped     ${tally.drops}`);
  console.log(`  is_a edges          ${tally.edges}`);
  console.log(`  reviewed is_a       ${tally.hierOk}`);
  console.log(`  reviewed derives    ${tally.derives}`);
  console.log(`  edges rejected      ${tally.hierNo}`);
  console.log(`  edges made root     ${tally.roots}`);
  console.log(`  line decisions      ${tally.lines}`);
  console.log(`  already applied     ${tally.skipped}  (re-importing is safe)`);

  if (rejected.length) {
    console.log(`\nREFUSED ${rejected.length} — the ontology disagreed:`);
    for (const r of rejected.slice(0, 20)) console.log(`  ${r}`);
    if (rejected.length > 20) console.log(`  … and ${rejected.length - 20} more`);
  }
  if (diverged.length) {
    console.log(`\nDIVERGED ${diverged.length} — surface and node came apart (§8.3b):`);
    for (const d of diverged.slice(0, 20)) console.log(d);
    if (diverged.length > 20) console.log(`  … and ${diverged.length - 20} more`);
    console.log(`  These were decided before an alias changed. The recorded node is kept;`);
    console.log(`  re-open the recipe if the new resolution is the one you want.`);
  }

  if (DRY) { console.log(`\n(dry run — nothing written)`); return; }

  writeFileSync(resolve(ONT, "nodes.csv"), csv(nodeHead, nodeBody));
  writeFileSync(resolve(ONT, "aliases.csv"), csv(aliasRows[0]!, aliasBody));
  writeFileSync(isaFile, csv(["child", "parent", "source", "note"], isaBody));
  if (dfBody.length) writeFileSync(dfFile, csv(["part", "whole", "source", "note"], dfBody));
  if (rejBody.length) {
    if (!existsSync(decisionsDir)) mkdirSync(decisionsDir, { recursive: true });
    writeFileSync(rejFile, csv(["child", "parent", "note"], rejBody));
  }
  if (!existsSync(CURATION)) mkdirSync(CURATION, { recursive: true });
  writeFileSync(linesFile, JSON.stringify(curated, null, 1) + "\n");

  console.log(`\nwrote nodes.csv, aliases.csv, is_a.csv, derives_from.csv, decisions/rejected-edges.csv, curation/lines.json`);
  console.log(`next: npm run promote && npm run build-ontology && npm run recipe-index`);
  console.log(`      then npm run offline-qc to cut a fresh bundle`);
}

main();
