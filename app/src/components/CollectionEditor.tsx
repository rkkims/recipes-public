"use client";

/**
 * One collection, being written — the claimant's editor.
 *
 * A title, a line of description, and a picker over the creator's OWN shelf:
 * the same scoped suggest the search bar uses, because a collection of
 * someone else's recipes is not a collection, it is a playlist of other
 * people's work on your page. Picked recipes stack as removable rows; saving
 * navigates back to the page where the new card now stands.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Note, Panel } from "@/components/primitives";

type Hit = { id: string; title: string };

export function CollectionEditor({ handle, initial, onSuggest, onSave, onRemove }: {
  handle: string;
  initial: { id?: string; title: string; description: string;
             picked: Array<{ id: string; title: string }> } | null;
  onSuggest: (handle: string, q: string) => Promise<Hit[]>;
  onSave: (handle: string, col: { id?: string; title: string; description: string; recipe_ids: string[] })
    => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
  onRemove?: (handle: string, id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [picked, setPicked] = useState<Hit[]>(initial?.picked ?? []);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function search(v: string) {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(() => {
      void onSuggest(handle, v).then(setHits);
    }, 200);
  }

  const add = (h: Hit) => {
    if (!picked.some((p) => p.id === h.id)) setPicked([...picked, h]);
    setQ(""); setHits([]);
  };

  return (
    <Panel>
      <label className="field">
        <span className="field-label">Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
               placeholder="Weeknight staples" />
      </label>
      <label className="field">
        <span className="field-label">Description: one line, optional</span>
        <input value={description} onChange={(e) => setDescription(e.target.value)}
               placeholder="what this set is for" />
      </label>

      <label className="field">
        <span className="field-label">Recipes: {picked.length} in this collection</span>
        <input value={q} onChange={(e) => search(e.target.value)}
               placeholder="search your recipes to add…" />
      </label>
      {hits.length > 0 && (
        <ul className="hits">
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => add(h)}>{h.title}</button>
            </li>
          ))}
        </ul>
      )}
      {picked.length > 0 && (
        <ul className="col-picked">
          {picked.map((p) => (
            <li key={p.id}>
              <span>{p.title}</span>
              <Button kind="quiet" onClick={() => setPicked(picked.filter((x) => x.id !== p.id))}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}

      <p className="cook-line">
        <Button kind="primary" disabled={pending || !title.trim() || picked.length === 0}
                onClick={() => start(async () => {
                  const r = await onSave(handle, {
                    ...(initial?.id ? { id: initial.id } : {}),
                    title, description, recipe_ids: picked.map((p) => p.id),
                  });
                  if (r.ok) router.push(`/creators/${handle}`);
                  else setNote(r.error);
                })}>
          Save collection
        </Button>
        {initial?.id && onRemove && (
          <Button kind="quiet" disabled={pending}
                  onClick={() => start(async () => {
                    const r = await onRemove(handle, initial.id!);
                    if (r.ok) router.push(`/creators/${handle}`);
                    else setNote(r.error);
                  })}>
            Delete
          </Button>
        )}
        {note && <span className="note">{note}</span>}
      </p>
      <Note>A collection needs a title and at least one recipe.</Note>
    </Panel>
  );
}
