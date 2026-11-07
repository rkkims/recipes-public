"use client";

/**
 * Edit a recipe you added — title, link, ingredients, note.
 *
 * It lives in the modal, on whichever page you opened the recipe from, because
 * that is where you find out something is wrong: you open your own recipe to
 * cook it and see the ingredient list is short one thing.
 *
 * The ingredient editor is the same autosuggest as everywhere else, for the
 * reason UX-SPEC §7 gives — what you type resolves to the vocabulary, so an
 * edited recipe stays matchable rather than drifting into free text.
 *
 * Ingredients may be emptied entirely. A recipe with none is a bookmark, which
 * is a legitimate thing to have; what it costs (no pantry matching) is said on
 * the recipe rather than prevented.
 */
import { useState, useTransition } from "react";
import { Button, Chip, ChipRow } from "./primitives";
import { PasteIngredients } from "./PasteIngredients";
import { useConfirm } from "./Dialog";
import type { ParsedLine } from "@/lib/paste";
import type { ActionResult } from "@/lib/result";

type Hit = { id: string; name: string; recipes: number; via?: string;
             children?: Array<{ id: string; name: string; recipes: number }> };

export function EditRecipe({ recipeId, title, url, note, steps, ingredients,
                             search, onParse, onSave, onDelete }: {
  recipeId: string;
  title: string;
  url: string;
  note: string;
  /** The method, for a recipe the user owns — see `OwnRecipe.steps`. */
  steps: string;
  /** Current ingredients, as id + name so the chips can render without a lookup. */
  ingredients: Array<{ id: string; name: string }>;
  search: (q: string) => Promise<Hit[]>;
  onParse: (block: string) => Promise<ParsedLine[]>;
  onSave: (id: string, patch: { title?: string; url?: string; requires?: string[];
                                note?: string; steps?: string })
    => Promise<ActionResult>;
  onDelete: (id: string) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [t, setT] = useState(title);
  const [u, setU] = useState(url);
  const [n, setN] = useState(note);
  const [st, setSt] = useState(steps);
  const [picked, setPicked] = useState(ingredients);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  const add = (id: string, name: string) => {
    if (!picked.some((p) => p.id === id)) setPicked([...picked, { id, name }]);
    setQ(""); setHits([]);
  };

  /** Merge a pasted batch, skipping anything already on the recipe. */
  const addMany = (rows: Array<{ id: string; name: string }>) =>
    setPicked([...picked, ...rows.filter((r) => !picked.some((p) => p.id === r.id))]);

  const save = () =>
    start(async () => {
      try {
        const r = await onSave(recipeId, {
          title: t, url: u, note: n, steps: st, requires: picked.map((p) => p.id),
        });
        if (!r.ok) { setFailed(r.error); return; }
        setFailed(null);
        setOpen(false);
      } catch {
        setFailed("Could not reach the server.");
      }
    });

  const remove = () => {
    confirm({
      question: `Delete “${title}”?`,
      detail: "Its ingredients go with it. Your cooks and plans stay.",
      confirmLabel: "Delete it",
    }, () => start(async () => {
      try {
        const r = await onDelete(recipeId);
        if (!r.ok) setFailed(r.error);
      } catch { setFailed("Could not reach the server."); }
    }));
  };

  // Discard: reset to what the server last gave us, so cancelling
  // really cancels rather than leaving a half-edited form behind.
  const cancel = () => {
    setT(title); setU(url); setN(note); setSt(steps); setPicked(ingredients);
    setQ(""); setHits([]); setFailed(null); setOpen(false);
  };

  if (!open) {
    return (
      <Button kind="plain" className="btn-editfull" onClick={() => setOpen(true)}>Edit</Button>
    );
  }

  return (
    <div className="addrecipe">
      <p className="cook-line">
        <b>Edit</b>
        {/* Drawn, not typed — the same bin the add form's discard uses. Red
            because it destroys the recipe; the confirm dialog still stands
            between the tap and the loss. */}
        <button type="button" className="addrecipe-discard" title="delete recipe"
                aria-label="Delete this recipe" disabled={pending} onClick={remove}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 7h16" />
            <path d="M9.5 7V4.5h5V7" />
            <path d="M6.5 7l1 13.5h9l1-13.5" />
            <path d="M10 11v6M14 11v6" />
          </svg>
        </button>
      </p>

      <label className="field">
        <span className="field-label">Title</span>
        <input value={t} onChange={(e) => setT(e.target.value)} />
      </label>

      <label className="field">
        <span className="field-label">Link</span>
        <input value={u} onChange={(e) => setU(e.target.value)} />
      </label>

      <label className="field">
        <span className="field-label">Ingredients: {picked.length}</span>
        <div className="search">
          <input value={q} placeholder="add another…"
                 onChange={(e) => {
                   const v = e.target.value;
                   setQ(v);
                   start(async () => {
                     try { setHits(await search(v)); } catch { /* typing is not the moment */ }
                   });
                 }} />
        </div>
      </label>

      {hits.length > 0 && (
        <ul className="hits">
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" className="hit" onClick={() => add(h.id, h.name)}>
                <span className="hit-name">{h.name}</span>
                {h.via && <span className="hit-via">«<b>{h.via}</b>»</span>}
                <span className="hit-count">{h.recipes.toLocaleString()} recipes</span>
              </button>
              {h.children?.length ? (
                <ul className="kids">
                  {h.children.map((c) => (
                    <li key={c.id}>
                      <button type="button" className="hit" onClick={() => add(c.id, c.name)}>
                        <span className="kid-mark" aria-hidden="true">↳</span>
                        <span className="hit-name">{c.name}</span>
                        <span className="hit-count">{c.recipes.toLocaleString()} recipes</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <PasteIngredients onParse={onParse} onAdd={addMany} />

      {picked.length > 0 && (
        <ChipRow>
          {picked.map((p) => (
            <Chip key={p.id} label={`${p.name} ✕`} tone="have" title="remove"
                  onClick={() => setPicked(picked.filter((x) => x.id !== p.id))} />
          ))}
        </ChipRow>
      )}

      <label className="field">
        <span className="field-label">Note: what to watch out for</span>
        <textarea rows={2} value={n} onChange={(e) => setN(e.target.value)} />
      </label>

      {/* Your recipe, so we hold your method — see `OwnRecipe.steps`. */}
      <label className="field">
        <span className="field-label">How you make it</span>
        <textarea rows={5} value={st} onChange={(e) => setSt(e.target.value)}
                  placeholder="the steps, in your own words…" />
      </label>

      <p className="cook-line">
        <Button kind="primary" disabled={pending || !t.trim()} onClick={save}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button kind="plain" disabled={pending} onClick={cancel}>Cancel</Button>
      </p>

      {failed && <p className="fail">{failed}</p>}
      {dialog}
    </div>
  );
}
