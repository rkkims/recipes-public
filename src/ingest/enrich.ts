/**
 * Enrichment pass — capture what the first crawl did not.
 *
 *   npm run enrich            # all sources, resumable
 *   npm run enrich -- --source koreanbapsang --limit 50
 *
 * The corpus has no time fields at all, and curation needs them (RECIPE-SPEC
 * §4a). The sources publish them — `prepTime`, `cookTime`, `totalTime` are in
 * the JSON-LD on every blog checked — so this re-fetches known URLs and extracts
 * only the missing fields. It does not re-discover anything: the URL list is
 * already in data/raw.
 *
 * Output goes to data/enriched/<source>.jsonl, keyed by sourceUrl, leaving the
 * original crawl untouched. That makes the pass restartable and reversible, and
 * means a WAF-blocked source degrades to "no extra fields" rather than to a
 * corrupted row.
 *
 * ── On instructions ────────────────────────────────────────────────────────
 *
 * RECIPE-SPEC §1 forbids storing a recipe's method: an ingredient list is facts,
 * a method is authored expression, and storing it would make us a host. This
 * pass reads the instructions and stores **only a derived number** — how long the
 * dish must sit before it can be finished. A duration is a fact. The prose is
 * never written to disk.
 */
import { existsSync, mkdirSync, readFileSync, appendFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RAW = resolve(ROOT, "data/raw");
const OUT = resolve(ROOT, "data/enriched");

const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const ONLY = arg("--source");
const LIMIT = Number(arg("--limit") ?? Infinity);
const DELAY = Number(arg("--delay") ?? 1200);

export type Enriched = {
  sourceUrl: string;
  prepMinutes?: number;
  cookMinutes?: number;
  totalMinutes?: number;
  /**
   * Minutes the dish must WAIT before it can be finished — marinating,
   * fermenting, chilling, proving. Distinct from cook time: a stew that
   * simmers two hours can still be dinner tonight; kimchi that ferments three
   * days cannot.
   */
  leadMinutes?: number;
  leadReason?: string;
  fetchedAt: string;
  error?: string;
};

/** ISO-8601 duration → minutes. `PT1H30M` → 90. */
export function isoMinutes(v: unknown): number | undefined {
  if (typeof v !== "string") return undefined;
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(v.trim());
  if (!m) return undefined;
  const mins = (Number(m[1] ?? 0) * 1440) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
  return mins > 0 ? mins : undefined;
}

/**
 * Waiting verbs. The scope matters: "simmer for 2 hours" is cook time and the
 * cook is present for it; "marinate for 2 hours" is lead time and they are not.
 * Matching a duration anywhere in the instructions would call every slow braise
 * a make-ahead dish.
 */
const WAIT = "marinat|ferment|chill|refrigerat|rest|soak|rehydrat|prove|proof|rise|freeze|cure|brine|set aside|pickle|age";
const DURATION =
  String.raw`(\d+)\s*(?:-|–|to)?\s*(\d+)?\s*(minute|min|hour|hr|day|week|night)s?`;

export function leadTime(text: string): { minutes: number; reason: string } | undefined {
  const t = text.toLowerCase();
  let best = 0, reason = "";

  /*
    "overnight" carries no number and is the commonest form of all — 343 of the
    795 leads in the corpus.

    The REASON keeps the matched clause, not the bare word. This branch has
    always required a waiting verb within a clause of "overnight", so it knew
    whether the dish was being marinated or merely chilled — and then threw that
    away and stored the string "overnight", which made the two
    indistinguishable downstream. The product could not tell a bulgogi marinade
    from a custard setting, so it had to drop both.

    The verb was never missing. It was discarded one line after being matched.
  */
  const nightly = new RegExp(
    String.raw`(?:${WAIT})[^.]{0,60}\bovernight\b|\bovernight\b[^.]{0,40}(?:${WAIT})`,
  ).exec(t);
  if (nightly) {
    best = 8 * 60;
    reason = nightly[0].trim().replace(/\s+/g, " ").slice(0, 70);
  }
  const re = new RegExp(String.raw`(?:${WAIT})[^.]{0,80}?${DURATION}`, "g");
  for (const m of t.matchAll(re)) {
    // Take the UPPER bound of a range: "1 to 2 days" means you need two.
    const n = Number(m[2] ?? m[1]);
    const unit = m[3]!;
    const mins = unit.startsWith("min") ? n
      : unit.startsWith("h") ? n * 60
      : unit.startsWith("d") ? n * 1440
      : unit.startsWith("w") ? n * 10080
      : n * 60;
    if (mins > best) { best = mins; reason = m[0]!.trim().slice(0, 60); }
  }
  // Under an hour of waiting is not a planning constraint.
  return best >= 60 ? { minutes: best, reason } : undefined;
}

/** Pull the Recipe node out of whatever shape the page uses. */
export function recipeNode(html: string): Record<string, unknown> | null {
  const blocks = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    let parsed: unknown;
    try { parsed = JSON.parse(b[1]!.trim()); } catch { continue; }
    const stack: unknown[] = [parsed];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) { stack.push(...node); continue; }
      if (!node || typeof node !== "object") continue;
      const o = node as Record<string, unknown>;
      const type = o["@type"];
      const isRecipe = type === "Recipe" ||
        (Array.isArray(type) && type.includes("Recipe"));
      if (isRecipe) return o;
      if (o["@graph"]) stack.push(o["@graph"]);
    }
  }
  return null;
}

export const instructionText = (node: Record<string, unknown>): string => {
  const v = node["recipeInstructions"];
  const walk = (x: unknown): string =>
    typeof x === "string" ? x
    : Array.isArray(x) ? x.map(walk).join(" ")
    : x && typeof x === "object"
      ? walk((x as Record<string, unknown>)["text"] ?? (x as Record<string, unknown>)["itemListElement"] ?? "")
      : "";
  return walk(v);
};

async function main() {
  if (!existsSync(RAW)) { console.error("no data/raw"); process.exit(1); }
  mkdirSync(OUT, { recursive: true });

  for (const file of readdirSync(RAW).filter((f) => f.endsWith(".jsonl"))) {
    const source = file.replace(/\.jsonl$/, "");
    if (ONLY && source !== ONLY) continue;

    const outFile = resolve(OUT, file);
    const done = new Set<string>();
    if (existsSync(outFile))
      for (const l of readFileSync(outFile, "utf8").split("\n"))
        if (l.trim()) { try { done.add((JSON.parse(l) as Enriched).sourceUrl); } catch { /* skip */ } }

    const rows = readFileSync(resolve(RAW, file), "utf8").split("\n")
      .filter(Boolean).map((l) => JSON.parse(l) as { sourceUrl: string });
    const todo = rows.filter((r) => !done.has(r.sourceUrl)).slice(0, LIMIT);
    if (!todo.length) { console.log(`${source}: nothing to do (${done.size} done)`); continue; }

    console.log(`${source}: ${todo.length} to fetch (${done.size} already done)`);
    let ok = 0, failed = 0, withTime = 0, withLead = 0;

    for (const r of todo) {
      let out: Enriched = { sourceUrl: r.sourceUrl, fetchedAt: new Date().toISOString() };
      try {
        const res = await fetch(r.sourceUrl, {
          headers: { "user-agent": "Mozilla/5.0 (compatible; recipe-curation/1.0)" },
          signal: AbortSignal.timeout(25_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const node = recipeNode(await res.text());
        if (!node) throw new Error("no Recipe node");
        out.prepMinutes = isoMinutes(node["prepTime"]);
        out.cookMinutes = isoMinutes(node["cookTime"]);
        out.totalMinutes = isoMinutes(node["totalTime"]);
        const lead = leadTime(instructionText(node));
        if (lead) { out.leadMinutes = lead.minutes; out.leadReason = lead.reason; withLead++; }
        if (out.prepMinutes || out.cookMinutes || out.totalMinutes) withTime++;
        ok++;
      } catch (e) {
        out = { ...out, error: e instanceof Error ? e.message : String(e) };
        failed++;
      }
      appendFileSync(outFile, JSON.stringify(out) + "\n");
      await new Promise((r2) => setTimeout(r2, DELAY));
    }
    console.log(`  ${ok} ok, ${failed} failed; ${withTime} with time, ${withLead} with lead time`);
  }
}

if (process.argv[1]?.endsWith("enrich.ts")) void main();
