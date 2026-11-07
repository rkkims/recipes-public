"use client";

/**
 * One ingredient, everything the ontology says about it, each claim editable
 * where a consumer for the edit exists.
 *
 * Four sections, in the order a reviewer actually checks them:
 *
 *   name       what the user will read — rename is RECORDED, not applied (§below)
 *   aliases    the surfaces that resolve here — add, retarget, drop
 *   hierarchy  parents and children, is_a and derives_from — add, remove
 *   recipes    read-only. What this node is load-bearing FOR — the blast radius
 *              a wrong call here has, which is why it is on the page at all.
 *
 * Every edit is RECORDED to `data/decisions/ontology-edits.csv` and applied by
 * `npm run apply-edits`, offline, between builds — the app process never
 * mutates the ontology under itself. The page banner says so once, and lists
 * what is recorded-but-unapplied for this node, instead of letting the
 * reviewer conclude their edit was swallowed.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import { Button, Note, Panel, Section } from "@/components/primitives";

type Result = { ok: true } | { ok: false; error: string };
type Suggestion = { id: string; name: string };

export type EditorData = {
  id: string;
  name: string;
  /** English explanation of a native name — shown, never saved. */
  gloss?: string;
  mentions: number;
  kind?: string;
  aliases: string[];
  parents: Array<{ id: string; name: string; relation: "is_a" | "derives_from" }>;
  children: Array<{ id: string; name: string; relation: "is_a" | "derives_from" }>;
  recipes: Array<{ id: string; title: string; source: string }>;
  recipeCount: number;
  /** The verbatim recipe lines this node came from, busiest first. */
  surfaces: Array<{ raw: string; n: number; recipeId: string; fixedTo?: string }>;
  /** Recorded edits `apply-edits` has not consumed yet, phrased by the page. */
  pending: string[];
};

/** A text box that suggests ontology nodes and reports the picked one. */
function NodePicker({ placeholder, onPick, onSuggest }: {
  placeholder: string;
  onPick: (s: Suggestion) => void;
  onSuggest: (q: string) => Promise<Suggestion[]>;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Suggestion[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onChange(v: string) {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(() => { void onSuggest(v.trim()).then(setHits); }, 120);
  }

  return (
    <span style={{ position: "relative", display: "inline-block", minWidth: "16rem" }}>
      <input
        value={q}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        style={{ width: "100%", padding: "0.4rem" }}
      />
      {hits.length > 0 && (
        <ul style={{
          position: "absolute", zIndex: 2, listStyle: "none", margin: 0, padding: 0,
          width: "100%", background: "var(--panel, #fff)", border: "1px solid rgba(0,0,0,0.2)",
        }}>
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button"
                onClick={() => { setQ(""); setHits([]); onPick(h); }}
                style={{ display: "block", width: "100%", textAlign: "left",
                  padding: "0.35rem 0.5rem", border: 0, background: "transparent",
                  cursor: "pointer", font: "inherit" }}>
                {h.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}

export function IngredientEditor({ data, actions, onChanged }: {
  data: EditorData;
  /** Sheet mode: called after every successful edit, so the host can refetch
      `data` — the standalone page gets the same effect from revalidation. */
  onChanged?: () => void;
  actions: {
    rename: (id: string, next: string, note: string) => Promise<Result>;
    gloss: (id: string, gloss: string, note: string) => Promise<Result>;
    remove: (id: string, note: string) => Promise<Result>;
    aliasSet: (surface: string, targetId: string, note: string) => Promise<Result>;
    aliasDrop: (surface: string) => Promise<Result>;
    promoteAlias: (surface: string, fromNodeId: string, note: string) => Promise<Result>;
    mergeNode: (id: string, targetId: string, note: string) => Promise<Result>;
    fixLine: (recipeId: string, raw: string, targetId: string, note: string) => Promise<Result>;
    edgeAdd: (childId: string, parentId: string, relation: "is_a" | "derives_from", note: string) => Promise<Result>;
    edgeRemove: (childId: string, parentId: string, relation: "is_a" | "derives_from", note: string) => Promise<Result>;
    suggest: (q: string) => Promise<Suggestion[]>;
  };
}) {
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  const [glossing, setGlossing] = useState(false);
  const [newGloss, setNewGloss] = useState("");
  const [removing, setRemoving] = useState(false);
  const [newAlias, setNewAlias] = useState("");

  /* A node cannot merge into itself, parent itself, or be its own child —
     offering it in those pickers is a click that can only be a mistake. The
     line-fix picker keeps the full list: a line CAN mean this very node. */
  const suggestOthers = (q: string) =>
    actions.suggest(q).then((hits) => hits.filter((h) => h.id !== data.id));

  async function run(p: Promise<Result>) {
    setError("");
    const r = await p;
    if (!r.ok) { setError(r.error); return; }
    onChanged?.();
  }

  return (
    <>
      {error && <Note>could not save: {error}</Note>}

      <Section title="Name">
        <Panel>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <strong style={{ fontSize: "1.4rem" }}>{data.name}</strong>
            {data.gloss && <span style={{ opacity: 0.7 }}>— {data.gloss}</span>}
            <span style={{ opacity: 0.7 }}>{data.mentions} corpus mentions</span>
            {data.kind && <span style={{ opacity: 0.6 }}>· {data.kind}</span>}
            {!renaming && <Button onClick={() => setRenaming(true)}>Rename…</Button>}
            {!glossing && <Button onClick={() => { setNewGloss(data.gloss ?? ""); setGlossing(true); }}>Gloss…</Button>}
          </div>
          {data.pending.length > 0 && (
            <Note>
              recorded, awaiting <code>npm run apply-edits</code>:{" "}
              {data.pending.join(" · ")}
            </Note>
          )}
          {renaming && (
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <input value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="new representational name" aria-label="new name"
                style={{ padding: "0.4rem", minWidth: "16rem" }} />
              <Button kind="primary" onClick={() => {
                if (!newName.trim()) return;
                void run(actions.rename(data.id, newName, ""));
                setRenaming(false); setNewName("");
              }}>Record rename</Button>
              <Button onClick={() => { setRenaming(false); setNewName(""); }}>Cancel</Button>
            </div>
          )}
          {glossing && (
            /* Display and search only — the canonical name stays the native
               term; this is the english beside it. Emptying the box clears
               the gloss, which is why Record has no non-empty guard. */
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <input value={newGloss} onChange={(e) => setNewGloss(e.target.value)}
                placeholder="english gloss, e.g. korean red pepper paste" aria-label="gloss"
                style={{ padding: "0.4rem", minWidth: "16rem" }} />
              <Button kind="primary" onClick={() => {
                void run(actions.gloss(data.id, newGloss.trim(), ""));
                setGlossing(false); setNewGloss("");
              }}>Record gloss</Button>
              <Button onClick={() => { setGlossing(false); setNewGloss(""); }}>Cancel</Button>
            </div>
          )}
          {/* The other direction from promote: this node should not exist —
              it is a parse artifact or a second name — and every reference
              should fold into the real one. Retires behind a redirect at
              apply-edits + build; visible here immediately. */}
          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            <span style={{ opacity: 0.7 }}>merge into…</span>
            <NodePicker placeholder="the node this actually is"
              onSuggest={suggestOthers}
              onPick={(h) => { if (h.id !== data.id)
                void run(actions.mergeNode(data.id, h.id,
                  `merged from ${data.name} in curate UI`)); }} />
          </div>
          {/* Beyond merge: not an ingredient AT ALL — equipment, a parse
              artifact — so there is no node to fold into. Lines that
              resolved here go back to unresolved. Two clicks, because one
              click that deletes a node is one click too cheap. */}
          <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "baseline", flexWrap: "wrap" }}>
            {!removing && <Button onClick={() => setRemoving(true)}>Remove…</Button>}
            {removing && (
              <>
                <span style={{ opacity: 0.7 }}>
                  not an ingredient — its aliases and edges go with it
                </span>
                <Button kind="primary" onClick={() => {
                  void run(actions.remove(data.id, `removed ${data.name} in curate UI`));
                  setRemoving(false);
                }}>Remove node</Button>
                <Button onClick={() => setRemoving(false)}>Cancel</Button>
              </>
            )}
          </div>
        </Panel>
      </Section>

      <Section title="Aliases" count={data.aliases.length}>
        <Panel>
          {data.aliases.length === 0 && <Note>No aliases resolve here yet.</Note>}
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {data.aliases.map((a) => (
              <li key={a} style={{ display: "flex", gap: 8, alignItems: "baseline", padding: "0.15rem 0" }}>
                <span>{a}</span>
                <Button onClick={() => void run(actions.aliasDrop(a))}>Drop</Button>
                {/* The danmuji case: the surface names something MORE specific
                    than this node. One action — it becomes a node of its own,
                    standing is_a under this one, pending the next build. */}
                <span title={`make "${a}" its own ingredient, as a kind of ${data.name}`}>
                  <Button onClick={() => void run(actions.promoteAlias(a, data.id,
                      `promoted from alias of ${data.name} in curate UI`))}>
                    Promote to node</Button>
                </span>
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <input value={newAlias} onChange={(e) => setNewAlias(e.target.value)}
              placeholder="add a surface that means this" aria-label="new alias"
              style={{ padding: "0.4rem", minWidth: "16rem" }} />
            <Button kind="primary" onClick={() => {
              if (!newAlias.trim()) return;
              void run(actions.aliasSet(newAlias, data.id, "curate UI"));
              setNewAlias("");
            }}>Add alias</Button>
          </div>
        </Panel>
      </Section>

      <Section title="Hierarchy">
        <Panel>
          {/* Whole sentences, subject first — the curator's ask (2026-08-17).
              "white rice · is a" left the subject implied, and an implied
              subject in a DIRECTIONAL relation is exactly where a hierarchy
              gets read backwards. Every row now says who satisfies whom. */}
          <h4 style={{ margin: "0 0 4px" }}>Parents</h4>
          {data.parents.length === 0 && <Note>No parents: a root, or an orphan.</Note>}
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {data.parents.map((p) => (
              <li key={`${p.relation}:${p.id}`} style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "0.15rem 0", flexWrap: "wrap" }}>
                <span><strong>{data.name}</strong>{" "}
                  <span style={{ opacity: 0.6 }}>{p.relation === "is_a" ? "is a" : "derives from"}</span>{" "}
                  <Link href={`/curate/ingredients/${p.id}`}>{p.name}</Link></span>
                <Button onClick={() => void run(actions.edgeRemove(data.id, p.id, p.relation, ""))}>Remove</Button>
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            <NodePicker placeholder="add parent (is a)…" onSuggest={suggestOthers}
              onPick={(h) => void run(actions.edgeAdd(data.id, h.id, "is_a", ""))} />
            <NodePicker placeholder="add source (derives from)…" onSuggest={suggestOthers}
              onPick={(h) => void run(actions.edgeAdd(data.id, h.id, "derives_from", ""))} />
          </div>

          <h4 style={{ margin: "12px 0 4px" }}>Children</h4>
          {data.children.length === 0 && <Note>Nothing narrower sits beneath it.</Note>}
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {data.children.map((c) => (
              <li key={`${c.relation}:${c.id}`} style={{ display: "flex", gap: 6, alignItems: "baseline", padding: "0.15rem 0", flexWrap: "wrap" }}>
                <span><Link href={`/curate/ingredients/${c.id}`}>{c.name}</Link>{" "}
                  <span style={{ opacity: 0.6 }}>{c.relation === "is_a" ? "is a" : "derives from"}</span>{" "}
                  <strong>{data.name}</strong></span>
                <Button onClick={() => void run(actions.edgeRemove(c.id, data.id, c.relation, ""))}>Remove</Button>
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 8 }}>
            <NodePicker placeholder="add child…" onSuggest={suggestOthers}
              onPick={(h) => void run(actions.edgeAdd(h.id, data.id, "is_a", ""))} />
          </div>
        </Panel>
      </Section>

      <Section title="Comes from" count={data.surfaces.length}>
        <Panel>
          {/* The parse side of the link the curator walks: the VERBATIM lines
              this node came from. A node whose only surface reads like a
              sentence is a parse artifact — fix it from here: open the recipe
              to correct the line, or merge/alias this node into the real one. */}
          {data.surfaces.length === 0 &&
            <Note>No line in the corpus currently resolves here — either brand new, or reachable only through curation edits.</Note>}
          <ul style={{ listStyle: "none", padding: 0, margin: 0, fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.85rem" }}>
            {data.surfaces.map((sf) => (
              <li key={sf.raw} style={{ padding: "0.15rem 0", display: "flex", gap: 8,
                                        alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ opacity: 0.55 }}>×{sf.n}</span>
                <span>{sf.raw}</span>
                {sf.fixedTo
                  ? <span className="tag" title="a recorded line fix — the pipeline applies it durably">
                      → {sf.fixedTo}
                      <button type="button" aria-label="retract fix" className="chip-x"
                        onClick={() => void run(actions.fixLine(sf.recipeId, sf.raw, "", "retracted in curate UI"))}> ×</button>
                    </span>
                  : <NodePicker placeholder="this line means…" onSuggest={actions.suggest}
                      onPick={(h) => void run(actions.fixLine(sf.recipeId, sf.raw, h.id,
                        `line fix from ${data.name}'s provenance`))} />}
                <Link href={`/curate?id=${sf.recipeId}`} style={{ whiteSpace: "nowrap" }}>open recipe →</Link>
              </li>
            ))}
          </ul>
        </Panel>
      </Section>

      <Section title="Used by" count={data.recipeCount}>
        <Panel>
          {data.recipeCount === 0 && <Note>No recipe in the corpus calls for it, which is itself worth knowing before renaming anything.</Note>}
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {data.recipes.map((r) => (
              <li key={r.id} style={{ padding: "0.15rem 0" }}>
                {/* The CURATION view, not /recipe/ — the public page is behind
                    the keep gate, so for anything uncurated it opens on nothing.
                    This editor only exists inside curation, and the revisit
                    page works for every recipe, published or not. */}
                <Link href={`/curate?id=${r.id}`}>{r.title}</Link>
                <span style={{ opacity: 0.6 }}> · {r.source}</span>
              </li>
            ))}
          </ul>
          {data.recipeCount > data.recipes.length && (
            <Note>…and {data.recipeCount - data.recipes.length} more.</Note>
          )}
        </Panel>
      </Section>
    </>
  );
}
