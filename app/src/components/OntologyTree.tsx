"use client";

/**
 * The ontology as a process tree — the curator's ask (2026-08-20): "something
 * like htop". Every node that participates in an `is_a` edge, drawn with
 * guide rails, collapsible per branch, filterable, and EDITABLE: clicking a
 * name opens the same ingredient sheet the recipe page uses, so rename,
 * aliases, edges and promote all work from here without a second mechanism.
 *
 * A DAG drawn as a tree: a node with two parents appears under both, marked
 * ⧉ — collapsing one occurrence never hides the other. Cycles cannot exist
 * (lint blocks them) but the walk guards anyway; a bug upstream must render
 * as a truncated branch, not a hung page.
 */
import { useMemo, useState } from "react";
import { Note } from "./primitives";
import { IngredientSheet, type SheetActions } from "./IngredientSheet";

export type TreeNode = {
  id: string;
  name: string;
  /** How many recipes use it — the number worth showing, not mentions. */
  uses: number;
  aliases: string[];
  parents: number;
  children: TreeNode[];
  pending?: boolean;
};

function matches(n: TreeNode, q: string): boolean {
  return n.name.includes(q) || n.aliases.some((a) => a.includes(q));
}
function branchMatches(n: TreeNode, q: string): boolean {
  return matches(n, q) || n.children.some((c) => branchMatches(c, q));
}

function Row({ n, depth, guides, isLast, q, open, setOpen, onOpen }: {
  n: TreeNode; depth: number; guides: boolean[]; isLast: boolean; q: string;
  open: Record<string, boolean>; setOpen: (k: string, v: boolean) => void;
  onOpen: (idOrName: string) => void;
}) {
  if (q && !branchMatches(n, q)) return null;
  const key = `${n.id}@${depth}:${guides.length}`;
  // A filtered view forces branches open — collapsing while searching hides
  // the very matches the search exists to find.
  const isOpen = q ? true : open[key] ?? true;
  const rail = guides.map((g) => (g ? "│ " : "  ")).join("");
  const elbow = depth === 0 ? "" : isLast ? "└─" : "├─";
  return (
    <>
      <div style={{ whiteSpace: "pre", lineHeight: 1.75 }}>
        <span style={{ opacity: 0.35 }}>{rail}{elbow}</span>
        {n.children.length > 0
          ? <button type="button" onClick={() => setOpen(key, !isOpen)}
                    aria-label={isOpen ? `collapse ${n.name}` : `expand ${n.name}`}
                    style={{ background: "none", border: "none", cursor: "pointer",
                             padding: 0, font: "inherit", opacity: 0.6 }}>
              {isOpen ? "▼ " : "▶ "}</button>
          : <span style={{ opacity: 0.35 }}>{"· "}</span>}
        <button type="button" onClick={() => onOpen(n.id)}
                style={{ background: "none", border: "none", cursor: "pointer",
                         padding: 0, font: "inherit",
                         fontWeight: n.children.length ? 600 : 400 }}>
          {q && matches(n, q) ? <mark>{n.name}</mark> : n.name}
        </button>
        <span style={{ opacity: 0.55 }}>
          {n.uses > 0 && `  ${n.uses}`}
          {n.aliases.length > 0 && `  ~${n.aliases.length}`}
          {n.parents > 1 && "  ⧉"}
          {n.pending && "  pending build"}
        </span>
      </div>
      {isOpen && n.children.map((c, i) => (
        <Row key={`${c.id}:${i}`} n={c} depth={depth + 1}
             guides={depth === 0 ? [] : [...guides, !isLast]}
             isLast={i === n.children.length - 1}
             q={q} open={open} setOpen={setOpen} onOpen={onOpen} />
      ))}
    </>
  );
}

export function OntologyTree({ roots, ingredient }: {
  roots: TreeNode[];
  ingredient: SheetActions;
}) {
  const [q, setQ] = useState("");
  const [open, setOpenMap] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState<string | null>(null);
  const setOpen = (k: string, v: boolean) => setOpenMap((m) => ({ ...m, [k]: v }));
  const term = q.trim().toLowerCase();
  const shown = useMemo(
    () => (term ? roots.filter((r) => branchMatches(r, term)) : roots),
    [roots, term]);

  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)}
             placeholder="filter by name or alias — branches with a match stay"
             aria-label="filter ontology tree"
             style={{ padding: "0.45rem", minWidth: "22rem", marginBottom: "0.75rem" }} />
      <Note>
        click a name to edit it — rename, aliases, parents, promote. ▼ folds a
        branch · <b>bold</b> has children · <code>N</code> recipes use it ·
        <code>~N</code> aliases · ⧉ also appears under another parent
      </Note>
      <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: "0.86rem", overflowX: "auto", paddingTop: "0.5rem" }}>
        {shown.map((r, i) => (
          <Row key={`${r.id}:${i}`} n={r} depth={0} guides={[]}
               isLast={i === shown.length - 1}
               q={term} open={open} setOpen={setOpen} onOpen={setSheet} />
        ))}
        {shown.length === 0 && <Note>nothing matches.</Note>}
      </div>
      {sheet && (
        <IngredientSheet idOrName={sheet} actions={ingredient}
                         onClose={() => setSheet(null)} />
      )}
    </div>
  );
}
