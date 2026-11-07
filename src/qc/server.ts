/**
 * Local QC review server.
 *
 *   npm run qc-ui        → http://localhost:5173
 *
 * Reads proposals from data/qc/*.csv and writes decisions to
 * data/decisions/*.csv. The two are kept separate on purpose: `npm run propose`
 * can be re-run at any time (after a bigger crawl, a better mapper) without
 * destroying reviewed work, and decisions stay small and diffable in git.
 *
 * A decision row is only written when the reviewer actually changes or confirms
 * something, so an untouched proposal costs no storage and no diff noise.
 *
 * No dependencies and no build step — one HTML file, one JSON API. This is a
 * tool for one person on one machine; it should not become a project.
 */
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { score } from "../ontology/score.js";
import type { Vocabulary } from "../ontology/normalize.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const QC = resolve(ROOT, "data/qc");
const DEC = resolve(ROOT, "data/decisions");
const PORT = Number(process.env.PORT ?? 5173);

/**
 * Bind address. Defaults to loopback.
 *
 * Set QC_HOST=0.0.0.0 to reach it from another machine when port forwarding
 * isn't available. That puts a read/write endpoint on whatever IP the box has,
 * so it is opt-in rather than the default.
 */
const HOST = process.env.QC_HOST ?? "127.0.0.1";

/**
 * Shared token, required on every request once bound off-loopback.
 *
 * The API writes files. Exposing it on a public IP without this would let
 * anyone on the internet overwrite the review decisions — the one artifact here
 * that costs human hours and cannot be regenerated. A token in the URL is weak
 * authentication, but the gap between "weak" and "none" is the whole risk.
 */
const TOKEN = process.env.QC_TOKEN ?? randomBytes(12).toString("base64url");
const PUBLIC = HOST !== "127.0.0.1" && HOST !== "localhost";

mkdirSync(DEC, { recursive: true });

/** Minimal RFC-4180-ish parser — the files are ours, but quotes are real. */
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

const toCsv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((c) => {
    const s = String(c ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n") + "\n";

/**
 * Generated reports, not review queues.
 *
 * They live in data/qc because that is where derived data goes, but there is
 * nothing to decide in them — `agreement` grades the engine, `unknown` and
 * `expectations` are inputs to other tools. Two of the three have no `id`
 * column at all, so offering them for review would produce decisions keyed to
 * undefined and quietly corrupt the decisions file.
 */
const REPORTS = new Set([
  "agreement", "unknown", "expectations", "learned-aliases", "node-usage",
]);

const artifacts = () =>
  existsSync(QC)
    ? readdirSync(QC).filter((f) => f.endsWith(".csv"))
        .map((f) => f.slice(0, -4)).filter((n) => !REPORTS.has(n))
    : [];

function load(name: string) {
  const rows = parseCsv(readFileSync(resolve(QC, `${name}.csv`), "utf8"));
  const header = rows[0]!;
  const items = rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));

  const decFile = resolve(DEC, `${name}.csv`);
  const decisions: Record<string, Record<string, string>> = {};
  if (existsSync(decFile)) {
    const d = parseCsv(readFileSync(decFile, "utf8"));
    const dh = d[0]!;
    for (const r of d.slice(1)) {
      const o = Object.fromEntries(dh.map((h, i) => [h, r[i] ?? ""]));
      if (o["id"]) decisions[o["id"]] = o;
    }
  }

  /**
   * Score every row against the engine, live.
   *
   * Computed here rather than read from data/qc/agreement.csv on purpose: that
   * file is only as fresh as the last `npm run agreement`, and a reviewer
   * looking at a stale "conflicts with the rule" badge would be arguing with a
   * rule that no longer exists. This costs one pass over ~1,300 short strings.
   */
  const proposalCol = header.find((h) => h.startsWith("proposed")) ?? header[1]!;
  const vocabSet = new Set<string>();
  for (const it of items) {
    if (it[proposalCol]) vocabSet.add(it[proposalCol]!);
    for (const m of (it["members"] ?? "").split(" | ")) if (m.trim()) vocabSet.add(m.trim());
  }
  const vocab: Vocabulary = { has: (h) => vocabSet.has(h) };
  const scores: Record<string, ReturnType<typeof score>> = {};
  for (const it of items) {
    try {
      scores[it["id"]!] = score(it[proposalCol] ?? "", decisions[it["id"]!], vocab);
    } catch { /* a scoring bug must never take the review UI down */ }
  }

  return { header, items, decisions, scores };
}

function saveDecision(name: string, id: string, verdict: string, value: string, note: string) {
  // Recreate on every write, not just at startup. The directory can be removed
  // between runs (resetting a review), and a missing directory otherwise turns
  // every save into a 500 that looks, from the UI, like nothing happened.
  mkdirSync(DEC, { recursive: true });
  const file = resolve(DEC, `${name}.csv`);
  const head = ["id", "verdict", "value", "note", "decided_at"];
  const existing: Record<string, string[]> = {};
  if (existsSync(file)) {
    const rows = parseCsv(readFileSync(file, "utf8"));
    for (const r of rows.slice(1)) if (r[0]) existing[r[0]] = r;
  }
  if (verdict === "clear") delete existing[id];
  else existing[id] = [id, verdict, value, note, new Date().toISOString()];
  writeFileSync(file, toCsv([head, ...Object.values(existing)]));
  return Object.keys(existing).length;
}

const APP_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "app.html");
/** Read per request so UI edits land on reload without restarting the server. */
const app = () => readFileSync(APP_PATH, "utf8");

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const send = (code: number, body: string, type = "application/json") => {
    res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
    res.end(body);
  };

  // Constant-ish check; the token is short-lived and single-user.
  if (PUBLIC && url.searchParams.get("k") !== TOKEN) {
    return send(401, `{"error":"missing or bad token — use the URL printed at startup"}`);
  }

  try {
    if (url.pathname === "/") return send(200, app(), "text/html; charset=utf-8");
    if (url.pathname === "/api/artifacts") return send(200, JSON.stringify(artifacts()));

    if (url.pathname === "/api/rows") {
      const name = url.searchParams.get("a") ?? "";
      if (!artifacts().includes(name)) return send(404, `{"error":"unknown artifact"}`);
      return send(200, JSON.stringify(load(name)));
    }

    if (url.pathname === "/api/decide" && req.method === "POST") {
      const body = await new Promise<string>((ok) => {
        let s = ""; req.on("data", (c) => (s += c)); req.on("end", () => ok(s));
      });
      const { artifact, id, verdict, value = "", note = "" } = JSON.parse(body);
      if (!artifacts().includes(artifact)) return send(404, `{"error":"unknown artifact"}`);
      const count = saveDecision(artifact, id, verdict, value, note);
      return send(200, JSON.stringify({ ok: true, decided: count }));
    }

    if (url.pathname === "/api/export") {
      // Join proposals with decisions so downstream reads one settled file.
      const name = url.searchParams.get("a") ?? "";
      const { header, items, decisions } = load(name);
      const rows: (string | number)[][] = [[...header, "final", "reviewed"]];
      const proposalCol = header.find((h) => h.startsWith("proposed")) ?? header[1]!;
      for (const it of items) {
        const d = decisions[it["id"]!];
        const final = d?.["verdict"] === "edit" ? d["value"]! : it[proposalCol]!;
        rows.push([...header.map((h) => it[h] ?? ""), final ?? "", d ? d["verdict"]! : ""]);
      }
      res.writeHead(200, {
        "content-type": "text/csv",
        "content-disposition": `attachment; filename="${name}-final.csv"`,
      });
      return res.end(toCsv(rows));
    }

    if (url.pathname === "/api/progress") {
      const out = artifacts().map((a) => {
        const { items, decisions } = load(a);
        return { artifact: a, total: items.length, decided: Object.keys(decisions).length };
      });
      return send(200, JSON.stringify(out));
    }

    send(404, `{"error":"not found"}`);
  } catch (err) {
    send(500, JSON.stringify({ error: String(err) }));
  }
}).listen(PORT, HOST, () => {
  const base = PUBLIC ? `http://<this-host>:${PORT}/?k=${TOKEN}` : `http://localhost:${PORT}`;
  console.log(`
QC review UI  →  ${base}${PUBLIC ? `\n\n  bound to ${HOST} — token required on every request` : ""}

  proposals   data/qc/*.csv         (regenerate any time: npm run propose)
  decisions   data/decisions/*.csv  (yours; never overwritten by propose)

  keys        J / K or ↓ / ↑ move    A accept    E edit    X reject
              N note                 / search    G jump to first undecided

Untouched rows stay untouched — only changes are written, so a half-finished
pass produces a small, readable diff rather than 1,379 rows of noise.
`);
});
