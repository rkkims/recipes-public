"use client";

/**
 * One unknown surface, one decision, no mouse.
 *
 * The queue is ~1,950 rows and the only thing that makes that tractable is the
 * cost per row. So the whole screen is four keys:
 *
 *   a  alias to an existing node      n  it is real, we lack a node
 *   x  not an ingredient              s  skip (comes back later)
 *
 * `a` is the common case and the only one that reaches the engine — `npm run
 * learn` turns it into a row in `data/ontology/aliases.csv`. Typing after `a`
 * searches the ontology; Enter takes the highlighted suggestion.
 *
 * ── Why the blast radius is the biggest thing on screen ───────────────────
 *
 * `mentions` is how many corpus lines this string appears on. It is the reason
 * to answer this row rather than the next one, and putting it in small print
 * would make the queue feel like 1,950 identical chores instead of a handful of
 * decisions that matter and a long tail that does not.
 */
import { useEffect, useRef, useState } from "react";
import { Button, Note, Panel } from "@/components/primitives";

export type Row = {
  surface: string;
  mentions: number;
  inTitle: boolean;
  headline: boolean;
  cuisines: string[];
  example: string;
};

type Suggestion = { id: string; name: string };

export function CurateIngredient({ row, remaining, linesLeft, onDecide, onSuggest, onFlagParse }: {
  row: Row | null;
  remaining: number;
  linesLeft: number;
  onDecide: (surface: string, verdict: "alias" | "new" | "reject" | "skip", value: string, note: string)
    => Promise<{ ok: true } | { ok: false; error: string }>;
  onSuggest: (q: string) => Promise<Suggestion[]>;
  /** Log "the parser mangled this line" without deciding the row. */
  onFlagParse: (surface: string, example: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [aliasing, setAliasing] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Suggestion[]>([]);
  const [cursor, setCursor] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [flagged, setFlagged] = useState(false);
  const box = useRef<HTMLInputElement>(null);

  /* A new row means a new decision: nothing from the last one should survive,
     or the reviewer types a target into a box still holding the previous hit. */
  useEffect(() => {
    setAliasing(false); setQ(""); setHits([]); setCursor(0); setError(""); setFlagged(false);
  }, [row?.surface]);

  useEffect(() => { if (aliasing) box.current?.focus(); }, [aliasing]);

  useEffect(() => {
    if (!aliasing) return;
    const term = q.trim();
    if (term.length < 2) { setHits([]); return; }
    let live = true;
    const t = setTimeout(() => {
      onSuggest(term).then((r) => { if (live) { setHits(r); setCursor(0); } });
    }, 120);
    return () => { live = false; clearTimeout(t); };
  }, [q, aliasing, onSuggest]);

  async function send(verdict: "alias" | "new" | "reject" | "skip", value = "") {
    if (!row || busy) return;
    setBusy(true); setError("");
    const r = await onDecide(row.surface, verdict, value, "");
    setBusy(false);
    if (!r.ok) setError(r.error);
  }

  /* Keys are handled on the window so the reviewer never has to click into the
     page first — a queue that needs a focus click before the first keystroke is
     a queue with a mouse in it after all. */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!row || busy) return;
      const typing = aliasing;
      if (typing) {
        if (e.key === "Escape") { setAliasing(false); setQ(""); }
        else if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, hits.length - 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
        else if (e.key === "Enter") {
          e.preventDefault();
          const pick = hits[cursor]?.name ?? q.trim();
          if (pick) void send("alias", pick);
        }
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "a") { e.preventDefault(); setAliasing(true); }
      else if (k === "n") { e.preventDefault(); void send("new"); }
      else if (k === "x") { e.preventDefault(); void send("reject"); }
      else if (k === "s") { e.preventDefault(); void send("skip"); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [row, busy, aliasing, hits, cursor, q]);

  if (!row) {
    return <Note>Nothing left in the queue. Run <code>npm run propose</code> after the next crawl, or <code>npm run learn</code> to write what is decided into the alias table.</Note>;
  }

  return (
    <Panel>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <strong style={{ fontSize: "1.5rem" }}>{row.surface}</strong>
        <span style={{ opacity: 0.7 }}>
          {row.mentions} line{row.mentions === 1 ? "" : "s"}
        </span>
        {row.inTitle && <span title="appears in a recipe title">· in a title</span>}
        {row.cuisines.length > 0 && <span style={{ opacity: 0.6 }}>· {row.cuisines.join(", ")}</span>}
      </div>

      {row.example && (
        <Note>
          as written: <em>{row.example}</em>{" "}
          {/* A log, not a verdict — the row still needs its answer. "for 2
              servings" gets (x), AND the parser gets the bug report. Once per
              surface; the writer dedupes. */}
          {flagged
            ? <span>· logged for the parser</span>
            : <button type="button" className="linklike"
                      onClick={() => {
                        setFlagged(true);
                        void onFlagParse(row.surface, row.example).then((r) => {
                          if (!r.ok) { setFlagged(false); setError(r.error); }
                        });
                      }}>
                wrongly parsed?
              </button>}
        </Note>
      )}

      {aliasing ? (
        <div>
          <input
            ref={box}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="alias to which ingredient?"
            aria-label="alias target"
            style={{ width: "100%", padding: "0.5rem", fontSize: "1rem" }}
          />
          <ul style={{ listStyle: "none", padding: 0, margin: "0.5rem 0" }}>
            {hits.map((h, i) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => void send("alias", h.name)}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "0.35rem 0.5rem", border: 0,
                    background: i === cursor ? "rgba(123,214,160,0.18)" : "transparent",
                    cursor: "pointer", font: "inherit",
                  }}
                >
                  {h.name}
                </button>
              </li>
            ))}
          </ul>
          <Note>Enter takes the highlighted one · Esc goes back</Note>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0.75rem 0" }}>
          <Button onClick={() => setAliasing(true)} kind="primary">(a) alias to…</Button>
          <Button onClick={() => void send("new")}>(n) real, no node yet</Button>
          <Button onClick={() => void send("reject")}>(x) not an ingredient</Button>
          <Button onClick={() => void send("skip")}>(s) skip</Button>
        </div>
      )}

      {error && <Note>could not save: {error}</Note>}

      <Note>
        {remaining.toLocaleString()} surfaces left · {linesLeft.toLocaleString()} corpus lines still unaccounted for
      </Note>
    </Panel>
  );
}
