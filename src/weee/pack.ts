/**
 * Step 5 — pack the review into something that runs on a laptop with no Node,
 * no server and no network.
 *
 *   npm run weee-pack
 *
 * Writes data/weee/offline/ — copy the whole folder across and open
 * index.html. Two jobs, two tabs:
 *
 *   vocabulary   QC the 2,167 Weee-derived names (WEEE-SPEC §4a)
 *   recipes      map each recipe's ingredient lines onto that vocabulary
 *
 * Why a folder of plain files rather than the existing QC server: `file://`
 * blocks `fetch()` of a sibling JSON in every browser, so a page that loads its
 * own data over XHR works when served and silently shows nothing when
 * double-clicked. A `<script>` tag assigning a global has no such restriction.
 * That is the entire reason the data ships as .js and not .json.
 *
 * Decisions live in localStorage and are exported as CSV. Nothing is written
 * back into the ontology by this tool — it produces reviewed files, and the
 * normal `learn`/`promote` path still decides (WEEE-SPEC §7).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { aggregateKeys, displayNameFor } from "../ontology/naming.js";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const WEEE = resolve(ROOT, "data/weee");
const ONT = resolve(ROOT, "data/ontology");
const OUT = resolve(WEEE, "offline");
const AGGREGATES = aggregateKeys(resolve(WEEE, "vocabulary.csv"));

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

/**
 * Field names are one and two characters on purpose.
 *
 * The recipe payload is 4,874 recipes and ~60,000 ingredient lines. Spelled-out
 * keys repeat once per line and cost several megabytes of pure punctuation,
 * which is the difference between a folder that copies onto a USB stick without
 * comment and one that does not.
 */
type PackedLine = { r: string; h: string; n: string };
type PackedRecipe = { i: string; t: string; s: string; c: string; u: string; l: PackedLine[] };

function main() {
  for (const f of ["vocabulary.csv", "naming.csv"]) {
    if (!existsSync(resolve(WEEE, f))) throw new Error(`run 'npm run weee-name' first — no ${f}`);
  }
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

  // ── vocabulary ───────────────────────────────────────────────────────────
  const vocab = asObjects(readFileSync(resolve(WEEE, "vocabulary.csv"), "utf8")).map((v) => ({
    id: v["id"], n: v["name"], s: Number(v["sku_support"] || 0),
    // Sitemap-sourced names have no shelf. Showing an empty cell for 4,241 of
    // them reads as missing data; "catalogue" says where the name came from,
    // which is the thing a reviewer actually wants to know.
    sh: v["shelf_names"] || (v["source"] === "catalogue" ? "catalogue" : ""),
    nd: v["node"], m: v["match"], c: v["confidence"],
    eg: v["examples"],
  }));

  // ── recipes ──────────────────────────────────────────────────────────────
  const idName = new Map<string, string>();
  for (const r of asObjects(readFileSync(resolve(ONT, "identity.csv"), "utf8"))) {
    if (r["id"]) idName.set(r["id"]!, r["name"] ?? "");
  }
  const index = JSON.parse(readFileSync(resolve(ONT, "recipe-index.json"), "utf8"));
  const lines = JSON.parse(readFileSync(resolve(ONT, "recipe-lines.json"), "utf8")) as Record<
    string,
    { raw: string; head: string; node?: string }[]
  >;

  const recipes: PackedRecipe[] = [];
  for (const r of index.recipes as { id: string; title: string; source: string; cuisine: string; url: string }[]) {
    const ls = (lines[r.id] ?? []).map((l) => ({
      r: l.raw ?? "",
      h: l.head ?? "",
      // The DISPLAY name, not the node string and not the id. An id means
      // nothing to a reviewer, and the node string means something slightly
      // different from what the product shows — `eggs` where the app says
      // `egg` (NORMALIZATION, "Number"). QC should see what users see.
      n: l.node ? displayNameFor(idName.get(l.node) ?? "", AGGREGATES) : "",
    }));
    recipes.push({ i: r.id, t: r.title ?? "", s: r.source ?? "", c: r.cuisine ?? "", u: r.url ?? "", l: ls });
  }

  writeFileSync(resolve(OUT, "vocabulary.js"), "window.VOCAB=" + JSON.stringify(vocab) + ";\n");
  writeFileSync(resolve(OUT, "recipes.js"), "window.RECIPES=" + JSON.stringify(recipes) + ";\n");
  writeFileSync(resolve(OUT, "index.html"), PAGE);
  writeFileSync(resolve(OUT, "README.txt"), README);

  const nLines = recipes.reduce((a, r) => a + r.l.length, 0);
  const kb = (f: string) => Math.round(readFileSync(resolve(OUT, f)).length / 1024);
  console.log(`offline bundle → ${OUT}`);
  console.log(`  vocabulary.js  ${vocab.length} names        ${kb("vocabulary.js")} KB`);
  console.log(`  recipes.js     ${recipes.length} recipes, ${nLines} lines   ${kb("recipes.js")} KB`);
  console.log(`  index.html                       ${kb("index.html")} KB`);
  console.log(`\nCopy the folder to the laptop and open index.html.`);
}

const README = `Weee vocabulary review — offline
================================

Copy this whole folder anywhere (USB stick, Desktop, OneDrive) and open
index.html by double-clicking it. No install, no network, nothing to run.
Chrome, Edge and Firefox all work.

Two tabs:

  Vocabulary   Review the names derived from the Weee! catalogue.
               A accept   X reject   E edit the name   N note
               J / K or arrows move.  Sort by confidence to read the
               doubtful matches first — "low" means the match was made on a
               shared last word only, and that is the class that goes wrong.

  Recipes      Map each recipe's ingredient lines onto the vocabulary.
               Click a line's box and type. Suggestions appear as you type;
               arrows choose, Enter accepts, Tab moves to the next line.
               A greyed suggestion is our guess — Enter takes it, typing
               replaces it. Nothing is decided until you press Enter.

START HERE — import the pre-pass

  Two files in this folder were decided for you already:

      prepass-vocabulary.csv    710 names identical to a node we already have
      prepass-recipe-map.csv    33,347 ingredient lines with one obvious answer

  Press "Import" and pick both. Nothing in them is final — they are marked
  "auto:" in the note and one key overturns any of them.

  Then open prepass-worklist.csv. It is every name still undecided, ordered by
  how many recipe lines it would actually resolve. The top 23 rows cover 80%
  of that, the top 113 cover 95%, and 5,377 of the 5,698 resolve nothing in
  the corpus at all. Read from the top and stop whenever you like.

AUTOSAVE — do this once, first

  Click "Autosave to file...", pick a location, and name it anything.
  From then on every decision is written to that file as you work. The
  button reads "Autosaving" when it is on.

  After reloading the page the browser needs one click to re-grant access;
  the button will say "Resume autosave". Until you click it, work is held
  only in the browser.

  Firefox cannot autosave to a file. There the button reads "Save a copy
  now", a copy lands in Downloads every 20 decisions, and closing the tab
  with unsaved work warns you first.

  Take the autosave .json home and run, at the repo root:

      npm run weee-import -- path/to/weee-qc-autosave.json

WHEN YOU WANT READABLE FILES

  Press "Export" for the two CSVs — the same work, in a form you can open
  in a spreadsheet. "Import" reads either of them back in, so you can move
  between machines. Both are optional once autosave is on.

Work is also kept in this browser's local storage as you go, but that is per
browser profile and one cleared cache from gone. The autosave file is the real
copy.
`;

/**
 * The page.
 *
 * Plain ES5-flavoured JS with string concatenation rather than template
 * literals — this whole thing is itself inside a template literal, and nesting
 * them turns every backtick into an escaping bug waiting to happen.
 *
 * Key bindings match src/qc/server.ts exactly (A / X / E / N / J / K / /).
 * Muscle memory from the existing review should carry over unchanged; a second
 * review tool with a second set of keys is how good decisions get typed into
 * the wrong field.
 */
const PAGE = `<!doctype html>
<meta charset="utf-8">
<title>Weee vocabulary review</title>
<style>
  :root { --bg:#fff; --fg:#111; --dim:#666; --line:#e3e3e3; --sel:#eef4ff; --ok:#0a7d28; --no:#b3261e; --warn:#a15c00; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#16181c; --fg:#e8e8e8; --dim:#9aa0a6; --line:#2c2f34; --sel:#1e2a3d; --ok:#5dd47f; --no:#ff8a80; --warn:#e0a341; }
  }
  * { box-sizing:border-box }
  body { margin:0; font:14px/1.45 -apple-system,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--fg) }
  header { display:flex; gap:16px; align-items:center; padding:10px 16px; border-bottom:1px solid var(--line); position:sticky; top:0; background:var(--bg); z-index:5; flex-wrap:wrap }
  .tab { padding:5px 12px; border:1px solid var(--line); border-radius:6px; cursor:pointer; user-select:none }
  .tab.on { background:var(--sel); border-color:#6a9ae0 }
  .grow { flex:1 }
  .muted { color:var(--dim) }
  button { font:inherit; padding:4px 10px; border:1px solid var(--line); background:transparent; color:var(--fg); border-radius:6px; cursor:pointer }
  button:hover { background:var(--sel) }
  input,select { font:inherit; padding:4px 8px; border:1px solid var(--line); border-radius:6px; background:var(--bg); color:var(--fg) }
  main { padding:0 16px 120px }
  table { border-collapse:collapse; width:100% }
  th,td { text-align:left; padding:6px 8px; border-bottom:1px solid var(--line); vertical-align:top }
  th { position:sticky; top:47px; background:var(--bg); font-weight:600; font-size:12px; color:var(--dim); cursor:pointer }
  tr.sel td { background:var(--sel) }
  .pill { font-size:11px; padding:1px 6px; border-radius:10px; border:1px solid var(--line) }
  .v-accept { color:var(--ok); font-weight:600 }
  .v-reject { color:var(--no); font-weight:600 }
  .low { color:var(--warn) }
  .rec { border-bottom:1px solid var(--line); padding:10px 0 }
  .line { display:grid; grid-template-columns:1fr 300px; gap:10px; align-items:start; padding:4px 0 }
  .raw { color:var(--fg) }
  .head { color:var(--dim); font-size:12px }
  .box { position:relative }
  .box input { width:100% }
  .sug { position:absolute; left:0; right:0; top:100%; background:var(--bg); border:1px solid var(--line); border-radius:6px; z-index:20; max-height:260px; overflow:auto; box-shadow:0 6px 20px rgba(0,0,0,.18) }
  .sug div { padding:4px 8px; cursor:pointer; display:flex; gap:8px; align-items:baseline }
  .sug div.on { background:var(--sel) }
  .sug small { color:var(--dim); margin-left:auto; white-space:nowrap }
  .ghost { color:var(--dim); font-style:italic }
  .done { color:var(--ok) }
  footer { position:fixed; bottom:0; left:0; right:0; padding:6px 16px; border-top:1px solid var(--line); background:var(--bg); font-size:12px; color:var(--dim) }
</style>

<header>
  <div class="tab on" id="tab-v">Vocabulary</div>
  <div class="tab" id="tab-r">Recipes</div>
  <input id="q" placeholder="/ search" size="26">
  <select id="filter"></select>
  <span class="grow"></span>
  <span id="count" class="muted"></span>
  <button id="autosave">Autosave to file…</button>
  <span id="autostat" class="muted"></span>
  <button id="export">Export</button>
  <button id="import">Import</button>
  <input type="file" id="file" accept=".csv" style="display:none" multiple>
</header>
<main id="main"></main>
<footer id="help"></footer>

<script src="vocabulary.js"></script>
<script src="recipes.js"></script>
<script>
"use strict";
var VOCAB = window.VOCAB || [], RECIPES = window.RECIPES || [];
var LS = "weee-review-v1";
var store = { vocab:{}, map:{} };
try { store = JSON.parse(localStorage.getItem(LS)) || store; } catch (e) {}
if (!store.vocab) store.vocab = {};
if (!store.map) store.map = {};
var saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    try { localStorage.setItem(LS, JSON.stringify(store)); }
    catch (e) { alert("Could not save — browser storage is full. Export now."); }
    autosaveTouched();
  }, 150);
}

var el = function (id) { return document.getElementById(id); };
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c];
  });
}

/* ── autosuggest ─────────────────────────────────────────────────────────
   Ranked, not merely filtered. A raw substring match puts "beef bone broth"
   above "beef" when you have typed "beef", which is the wrong answer every
   time. So: whole-string prefix beats word-start beats substring, and SKU
   support breaks ties — the name carried by more products is the shelf's
   answer and the one more likely to be meant.                              */
/* Number- and spacing-insensitive key, the same normalisation the ontology
   uses to look up synonyms. Without it the corpus's own words miss the shelf's
   by a letter: 'dried shiitake mushrooms' found nothing while 'dried shiitake
   mushroom' sat in the vocabulary, and 'cornstarch' missed 'corn starch'.
   Those two shapes alone account for a large share of the misses. */
var IRREG = { leaves:"leaf", knives:"knife", loaves:"loaf", tomatoes:"tomato",
              potatoes:"potato", chilies:"chili", chillies:"chili" };
function sing(w) {
  if (IRREG[w]) return IRREG[w];
  if (w.length < 4) return w;
  if (/ies$/.test(w)) return w.slice(0, -3) + "y";
  if (/(oes|ses|xes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
  return w;
}
function keyOf(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
    .split(" ").filter(Boolean).map(sing).join(" ");
}
/* Spaces removed as well, so 'cornstarch' and 'corn starch' collide. Kept as a
   separate, weaker rung than the token key — dropping spaces can merge genuinely
   different names, so it ranks below every match that respects word boundaries. */
var squash = function (s) { return keyOf(s).replace(/ /g, ""); };

var INDEX = VOCAB.map(function (v, i) {
  return { i:i, n:v.n, s:v.s, sh:v.sh, nd:v.nd, k:keyOf(v.n), q:squash(v.n) };
});
function suggest(q, limit) {
  q = (q || "").toLowerCase().trim();
  if (!q) return [];
  /* Every derived string is built ONCE, before the loop. Building " " + q
     inside it allocated one throwaway string per vocabulary entry per
     character typed — 6,000 allocations a keystroke, and the difference
     between a typeahead and a stutter. */
  var qk = keyOf(q), qs = squash(q);
  var qSp = " " + q, qkSp = " " + qk, qkSpSp = " " + qk + " ", qkPre = qk + " ";
  var out = [];
  for (var i = 0; i < INDEX.length; i++) {
    var v = INDEX[i], n = v.n, k = v.k, rank = -1;
    if (n === q || k === qk) rank = 0;                          // same name
    else if (n.lastIndexOf(q, 0) === 0 || k.lastIndexOf(qkPre, 0) === 0) rank = 1;
    else if (n.indexOf(qSp) >= 0 || k.indexOf(qkSpSp) >= 0 ||
             (k.length > qkSp.length && k.indexOf(qkSp, k.length - qkSp.length) >= 0)) rank = 2;
    else if (n.indexOf(q) >= 0) rank = 3;
    else if (qs && v.q === qs) rank = 4;                        // cornstarch ≡ corn starch
    if (rank >= 0) out.push({ v:v, rank:rank });
  }
  out.sort(function (a, b) { return a.rank - b.rank || b.v.s - a.v.s || a.v.n.length - b.v.n.length; });
  return out.slice(0, limit || 8).map(function (o) { return o.v; });
}

/* ── tab 1: vocabulary QC ────────────────────────────────────────────── */
var vSort = "confidence", vSel = 0, vRows = [];
function vFiltered() {
  var q = el("q").value.toLowerCase().trim(), f = el("filter").value;
  var rows = VOCAB.filter(function (v) {
    if (q && v.n.indexOf(q) < 0 && (v.nd || "").indexOf(q) < 0) return false;
    if (f === "undecided" && store.vocab[v.id]) return false;
    if (f === "decided" && !store.vocab[v.id]) return false;
    if (f === "low" && v.c !== "low") return false;
    if (f === "unmatched" && v.nd) return false;
    return true;
  });
  var order = { low:0, medium:1, high:2, "":3 };
  rows.sort(function (a, b) {
    if (vSort === "confidence") return (order[a.c] - order[b.c]) || b.s - a.s;
    if (vSort === "support") return b.s - a.s;
    return a.n < b.n ? -1 : 1;
  });
  return rows;
}
function renderVocab() {
  vRows = vFiltered();
  if (vSel >= vRows.length) vSel = Math.max(0, vRows.length - 1);
  var h = ['<table><thead><tr>',
    '<th data-s="name">name</th><th data-s="support">SKUs</th><th>shelf</th>',
    '<th>our node</th><th data-s="confidence">match</th><th>verdict</th></tr></thead><tbody>'];
  for (var i = 0; i < vRows.length; i++) {
    var v = vRows[i], d = store.vocab[v.id];
    var verdict = !d ? '<span class="muted">—</span>'
      : d.verdict === "accept" ? '<span class="v-accept">accept' + (d.value && d.value !== v.n ? " → " + esc(d.value) : "") + '</span>'
      : '<span class="v-reject">reject</span>';
    h.push('<tr class="' + (i === vSel ? "sel" : "") + '" data-i="' + i + '">',
      '<td>' + esc(v.n) + (d && d.note ? '<div class="head">' + esc(d.note) + '</div>' : '') + '</td>',
      '<td>' + v.s + '</td>',
      '<td class="head">' + esc((v.sh || "").split(" | ")[0]) + '</td>',
      '<td>' + esc(v.nd || '<span class="muted">new</span>') + '</td>',
      '<td class="' + (v.c === "low" ? "low" : "") + '">' + esc(v.m || "—") + " " + esc(v.c || "") + '</td>',
      '<td>' + verdict + '</td></tr>');
  }
  h.push('</tbody></table>');
  el("main").innerHTML = h.join("");
  var ths = el("main").querySelectorAll("th[data-s]");
  for (var k = 0; k < ths.length; k++) ths[k].onclick = function () { vSort = this.getAttribute("data-s"); renderVocab(); };
  var trs = el("main").querySelectorAll("tr[data-i]");
  for (var j = 0; j < trs.length; j++) trs[j].onclick = function () { vSel = +this.getAttribute("data-i"); renderVocab(); };
  var sel = el("main").querySelector("tr.sel");
  if (sel) sel.scrollIntoView({ block:"nearest" });
  el("count").textContent = Object.keys(store.vocab).length + " / " + VOCAB.length + " reviewed";
  el("help").textContent = "A accept   X reject   E edit the name   N note   J/K move   / search";
}
function vDecide(verdict, value, note) {
  var v = vRows[vSel]; if (!v) return;
  var prev = store.vocab[v.id] || {};
  if (verdict === "clear") delete store.vocab[v.id];
  else store.vocab[v.id] = {
    name: v.n, verdict: verdict,
    value: value != null ? value : (prev.value || v.n),
    note: note != null ? note : (prev.note || ""),
    at: new Date().toISOString()
  };
  save();
  if (verdict !== "clear" && vSel < vRows.length - 1) vSel++;
  renderVocab();
}

/* ── tab 2: recipe → vocabulary mapping ──────────────────────────────── */
var rSel = 0, rRows = [];
function rFiltered() {
  var q = el("q").value.toLowerCase().trim(), f = el("filter").value;
  return RECIPES.filter(function (r) {
    if (q && r.t.toLowerCase().indexOf(q) < 0 && r.s.indexOf(q) < 0) return false;
    var m = store.map[r.i] || {};
    var done = Object.keys(m).length >= r.l.length && r.l.length > 0;
    if (f === "undecided" && done) return false;
    if (f === "decided" && !done) return false;
    return true;
  });
}
function renderRecipes() {
  rRows = rFiltered();
  if (rSel >= rRows.length) rSel = Math.max(0, rRows.length - 1);
  var r = rRows[rSel];
  if (!r) { el("main").innerHTML = '<p class="muted">No recipes match.</p>'; return; }
  var m = store.map[r.i] || {};
  var h = ['<div class="rec"><h3 style="margin:12px 0 2px">' + esc(r.t) + '</h3>',
    '<div class="head">' + esc(r.s) + " · " + esc(r.c) + " · recipe " + (rSel + 1) + " of " + rRows.length +
    ' · <a href="' + esc(r.u) + '" target="_blank">source</a></div></div>'];
  for (var i = 0; i < r.l.length; i++) {
    var l = r.l[i], cur = m[i];
    var guess = l.n || (suggest(l.h, 1)[0] || {}).n || "";
    h.push('<div class="line"><div>',
      '<div class="raw">' + esc(l.r) + '</div>',
      '<div class="head">parsed: ' + esc(l.h || "—") + '</div>',
      '</div><div class="box">',
      '<input data-line="' + i + '" value="' + esc(cur || "") + '" placeholder="' + esc(guess || "type an ingredient") + '">',
      cur ? '<div class="head done">mapped</div>' : (guess ? '<div class="head ghost">Enter accepts: ' + esc(guess) + '</div>' : ''),
      '</div></div>');
  }
  el("main").innerHTML = h.join("");
  wireInputs(r);
  var mapped = Object.keys(store.map).reduce(function (a, k) { return a + Object.keys(store.map[k]).length; }, 0);
  el("count").textContent = mapped + " lines mapped";
  el("help").textContent = "type to search   ↑/↓ choose   Enter accept   Tab next line   PgUp/PgDn recipe   / find a recipe";
}
function wireInputs(r) {
  var inputs = el("main").querySelectorAll("input[data-line]");
  for (var i = 0; i < inputs.length; i++) (function (inp) {
    var idx = +inp.getAttribute("data-line");
    var box = inp.parentNode, list = null, items = [], cur = -1;
    function close() { if (list) { list.remove(); list = null; items = []; cur = -1; } }
    function open(q) {
      close();
      items = suggest(q, 8);
      if (!items.length) return;
      list = document.createElement("div");
      list.className = "sug";
      for (var k = 0; k < items.length; k++) {
        var d = document.createElement("div");
        d.innerHTML = esc(items[k].n) + '<small>' + items[k].s + " SKU" +
          (items[k].nd ? " · " + esc(items[k].nd) : " · new") + '</small>';
        d.setAttribute("data-k", k);
        d.onmousedown = function (e) { e.preventDefault(); commit(items[+this.getAttribute("data-k")].n); };
        list.appendChild(d);
      }
      box.appendChild(list);
      cur = 0; mark();
    }
    function mark() {
      if (!list) return;
      var ds = list.children;
      for (var k = 0; k < ds.length; k++) ds[k].className = k === cur ? "on" : "";
    }
    function commit(name) {
      if (!store.map[r.i]) store.map[r.i] = {};
      if (!name) delete store.map[r.i][idx]; else store.map[r.i][idx] = name;
      save(); close();
      var next = el("main").querySelector('input[data-line="' + (idx + 1) + '"]');
      renderRecipes();
      var again = el("main").querySelector('input[data-line="' + (next ? idx + 1 : idx) + '"]');
      if (again) again.focus();
    }
    inp.oninput = function () { open(inp.value); };
    inp.onfocus = function () { if (inp.value) open(inp.value); };
    inp.onblur = function () { setTimeout(close, 120); };
    inp.onkeydown = function (e) {
      if (e.key === "ArrowDown" && list) { cur = Math.min(cur + 1, items.length - 1); mark(); e.preventDefault(); }
      else if (e.key === "ArrowUp" && list) { cur = Math.max(cur - 1, 0); mark(); e.preventDefault(); }
      else if (e.key === "Enter") {
        e.preventDefault();
        if (list && items[cur]) commit(items[cur].n);
        else if (inp.value.trim()) commit(inp.value.trim());
        else commit(inp.placeholder && inp.placeholder !== "type an ingredient" ? inp.placeholder : "");
      } else if (e.key === "Escape") { close(); inp.blur(); }
    };
  })(inputs[i]);
}

/* ── autosave ─────────────────────────────────────────────────────────
   Exporting is something you have to remember, and forgetting it loses the
   session. localStorage is not a substitute: it is per browser profile and one
   cleared cache from gone. So the tool writes to a real file as you work.

   Chrome and Edge expose the File System Access API on file:// pages, and that
   is what makes SILENT repeat writes possible — you pick the file once, the
   handle is kept in IndexedDB, and every later write needs no dialog. After a
   reload the browser requires one gesture to re-grant, which is what the button
   does when it says "Resume".

   Firefox has no such API. There the fallback drops a dated file into Downloads
   every 20 decisions and warns on close if anything is unsaved. Worse, and
   never silent — which is the property that matters.                        */
var HANDLE_DB = "weee-qc-autosave";
var fileHandle = null;
var autosave = "none";          /* none | file | downloads */
var unsaved = 0;

function idbHandle(mode, value) {
  return new Promise(function (resolve) {
    var open;
    try { open = indexedDB.open(HANDLE_DB, 1); } catch (e) { resolve(null); return; }
    open.onupgradeneeded = function () { open.result.createObjectStore("h"); };
    open.onerror = function () { resolve(null); };
    open.onsuccess = function () {
      try {
        var tx = open.result.transaction("h", mode === "put" ? "readwrite" : "readonly");
        var st = tx.objectStore("h");
        var rq = mode === "put" ? st.put(value, "file") : st.get("file");
        rq.onsuccess = function () { resolve(rq.result); };
        rq.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    };
  });
}

/* One JSON rather than the two CSVs: a handle is one file, and the two exports
   have different schemas. 'npm run weee-import' at the repo root reads this
   back, and the CSV export button is unchanged for when a readable artifact is
   what you want. */
function snapshot() {
  return JSON.stringify({
    format: "weee-qc-autosave/1",
    saved_at: new Date().toISOString(),
    vocab: store.vocab,
    map: store.map
  }, null, 1);
}

function setAutoStatus(text) { var e = el("autostat"); if (e) e.textContent = text; }

function autoButton(label) { var b = el("autosave"); if (b) b.textContent = label; }

function writeFileNow() {
  if (!fileHandle) return Promise.resolve(false);
  return fileHandle.queryPermission({ mode:"readwrite" }).then(function (p) {
    if (p !== "granted") { autosave = "none"; setAutoStatus("autosave paused"); autoButton("Resume autosave"); return false; }
    return fileHandle.createWritable().then(function (w) {
      return w.write(snapshot()).then(function () { return w.close(); });
    }).then(function () {
      unsaved = 0;
      setAutoStatus("saved " + new Date().toLocaleTimeString());
      return true;
    });
  }).catch(function () {
    setAutoStatus("autosave FAILED — export manually");
    return false;
  });
}

function downloadSnapshot() {
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([snapshot()], { type:"application/json" }));
  a.download = "weee-qc-autosave-" + new Date().toISOString().slice(0,19).replace(/[:T]/g,"-") + ".json";
  a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  unsaved = 0;
  setAutoStatus("dropped a copy in Downloads");
}

var autoTimer = null;
function autosaveTouched() {
  unsaved++;
  if (autosave === "file") {
    clearTimeout(autoTimer);
    autoTimer = setTimeout(writeFileNow, 1200);
  } else if (autosave === "downloads") {
    setAutoStatus(unsaved + " unsaved");
    if (unsaved >= 20) downloadSnapshot();
  } else {
    setAutoStatus(unsaved + " unsaved — not autosaving");
  }
}

function pickFile() {
  if (!window.showSaveFilePicker) {
    autosave = "downloads";
    autoButton("Save a copy now");
    downloadSnapshot();
    return;
  }
  window.showSaveFilePicker({
    suggestedName: "weee-qc-autosave.json",
    types: [{ description:"Weee QC autosave", accept:{ "application/json":[".json"] } }]
  }).then(function (h) {
    fileHandle = h;
    return idbHandle("put", h).then(function () {
      autosave = "file";
      autoButton("Autosaving ✓");
      return writeFileNow();
    });
  }).catch(function () { /* cancelled — leave the state alone */ });
}

function restoreAutosave() {
  if (!window.showSaveFilePicker) {
    autosave = "downloads";
    autoButton("Save a copy now");
    setAutoStatus("no file autosave in this browser — copies go to Downloads");
    return;
  }
  idbHandle("get").then(function (h) {
    if (!h) { setAutoStatus("not autosaving yet"); return; }
    fileHandle = h;
    return h.queryPermission({ mode:"readwrite" }).then(function (p) {
      if (p === "granted") { autosave = "file"; autoButton("Autosaving ✓"); setAutoStatus("autosaving to " + (h.name || "your file")); }
      else { autoButton("Resume autosave"); setAutoStatus("autosave paused — one click to resume"); }
    });
  }).catch(function () { setAutoStatus("not autosaving yet"); });
}

/* The last line of defence. Only fires when something is genuinely unwritten,
   so it does not cry wolf on every close. */
window.addEventListener("beforeunload", function (e) {
  if (unsaved > 0 && autosave !== "file") { e.preventDefault(); e.returnValue = ""; }
});

/* ── export / import ─────────────────────────────────────────────────── */
function toCsv(rows) {
  return rows.map(function (r) {
    return r.map(function (c) {
      var s = String(c == null ? "" : c);
      return /[",\\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(",");
  }).join("\\n") + "\\n";
}
function download(name, text) {
  var a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type:"text/csv" }));
  a.download = name; a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
}
function exportAll() {
  var v = [["id","name","verdict","value","note","decided_at"]];
  for (var id in store.vocab) {
    var d = store.vocab[id];
    v.push([id, d.name, d.verdict, d.value, d.note, d.at]);
  }
  download("weee-vocabulary-decisions.csv", toCsv(v));

  var m = [["recipe_id","line","raw","parsed_head","weee_name"]];
  var byId = {};
  for (var i = 0; i < RECIPES.length; i++) byId[RECIPES[i].i] = RECIPES[i];
  for (var rid in store.map) {
    var rec = byId[rid]; if (!rec) continue;
    for (var k in store.map[rid]) {
      var line = rec.l[+k] || { r:"", h:"" };
      m.push([rid, k, line.r, line.h, store.map[rid][k]]);
    }
  }
  setTimeout(function () { download("recipe-weee-map.csv", toCsv(m)); }, 400);
}
function parseCsvText(t) {
  var rows = [], row = [], cell = "", q = false;
  for (var i = 0; i < t.length; i++) {
    var c = t[i];
    if (q) { if (c === '"' && t[i+1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(function (r) { return r.some(function (c) { return c !== ""; }); });
}
function importFiles(files) {
  var pending = files.length;
  for (var i = 0; i < files.length; i++) (function (f) {
    var rd = new FileReader();
    rd.onload = function () {
      var rows = parseCsvText(String(rd.result)), head = rows[0] || [];
      var col = {}; for (var k = 0; k < head.length; k++) col[head[k]] = k;
      for (var j = 1; j < rows.length; j++) {
        var r = rows[j];
        if (col.verdict != null) {
          store.vocab[r[col.id]] = {
            name: r[col.name], verdict: r[col.verdict], value: r[col.value],
            note: r[col.note], at: r[col.decided_at]
          };
        } else if (col.weee_name != null) {
          var rid = r[col.recipe_id];
          if (!store.map[rid]) store.map[rid] = {};
          store.map[rid][r[col.line]] = r[col.weee_name];
        }
      }
      if (--pending === 0) { save(); render(); alert("Imported."); }
    };
    rd.readAsText(f);
  })(files[i]);
}

/* ── shell ───────────────────────────────────────────────────────────── */
var tab = "v";
var FILTERS = {
  v: [["all","all"],["undecided","undecided"],["decided","decided"],["low","low confidence"],["unmatched","new to us"]],
  r: [["all","all"],["undecided","unfinished"],["decided","finished"]]
};
function setFilters() {
  var f = FILTERS[tab], h = "";
  for (var i = 0; i < f.length; i++) h += '<option value="' + f[i][0] + '">' + f[i][1] + '</option>';
  el("filter").innerHTML = h;
}
function render() { tab === "v" ? renderVocab() : renderRecipes(); }
function setTab(t) {
  tab = t;
  el("tab-v").className = "tab" + (t === "v" ? " on" : "");
  el("tab-r").className = "tab" + (t === "r" ? " on" : "");
  setFilters(); render();
}
el("tab-v").onclick = function () { setTab("v"); };
el("tab-r").onclick = function () { setTab("r"); };
el("q").oninput = function () { vSel = 0; rSel = 0; render(); };
el("filter").onchange = function () { vSel = 0; rSel = 0; render(); };
el("export").onclick = exportAll;
el("autosave").onclick = pickFile;
restoreAutosave();
el("import").onclick = function () { el("file").click(); };
el("file").onchange = function () { if (this.files.length) importFiles(this.files); this.value = ""; };

document.addEventListener("keydown", function (e) {
  var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  if (e.key === "/" && !typing) { e.preventDefault(); el("q").focus(); el("q").select(); return; }
  if (typing) {
    if (e.key === "Escape") document.activeElement.blur();
    return;
  }
  if (tab === "v") {
    if (e.key === "j" || e.key === "ArrowDown") { vSel = Math.min(vSel + 1, vRows.length - 1); renderVocab(); e.preventDefault(); }
    else if (e.key === "k" || e.key === "ArrowUp") { vSel = Math.max(vSel - 1, 0); renderVocab(); e.preventDefault(); }
    else if (e.key === "a") vDecide("accept");
    else if (e.key === "x") vDecide("reject");
    else if (e.key === "e") {
      var v = vRows[vSel]; if (!v) return;
      var next = prompt("Name for this ingredient:", (store.vocab[v.id] || {}).value || v.n);
      if (next != null) vDecide("accept", next.trim());
    } else if (e.key === "n") {
      var v2 = vRows[vSel]; if (!v2) return;
      var note = prompt("Note:", (store.vocab[v2.id] || {}).note || "");
      if (note != null) vDecide((store.vocab[v2.id] || {}).verdict || "accept", null, note);
    } else if (e.key === "u") vDecide("clear");
  } else {
    if (e.key === "PageDown" || e.key === "j") { rSel = Math.min(rSel + 1, rRows.length - 1); renderRecipes(); e.preventDefault(); }
    else if (e.key === "PageUp" || e.key === "k") { rSel = Math.max(rSel - 1, 0); renderRecipes(); e.preventDefault(); }
    else if (e.key === "Enter") { var f = el("main").querySelector("input[data-line]"); if (f) f.focus(); e.preventDefault(); }
  }
});

setTab("v");
</script>
`;

main();
