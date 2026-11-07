"use client";

/**
 * A creator corrects the parser — CREATOR-SPEC §4, the confirm half.
 *
 * The crawled recipe arrives with OUR reading of THEIR ingredient list:
 * whatever the parser resolved, preloaded as chips, and whatever it could
 * not read shown as the raw lines it choked on. The creator deletes what is
 * wrong, adds what is missing through the same vocabulary the pantry uses,
 * taps chips between required and optional, and saves. From that moment the
 * list is theirs — the parser's guess is never consulted again for this
 * recipe, and the page wears the badge that says so.
 *
 * Same chips, same flip, same search as the add form, because a creator who
 * has done one has done the other.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Note, Panel } from "@/components/primitives";

type Hit = { id: string; name: string };
type Picked = { id: string; name: string; optional: boolean };

export function CreatorConfirm({ handle, recipeId, initial, unreadable, onSuggest, onConfirm }: {
  handle: string;
  recipeId: string;
  /** Our current reading, as chips — what saving without touching keeps. */
  initial: Picked[];
  /** The raw lines the parser could not resolve, shown so nothing is silently lost. */
  unreadable: string[];
  onSuggest: (q: string) => Promise<Hit[]>;
  onConfirm: (handle: string, recipeId: string, list: { requires: string[]; optional: string[] })
    => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Picked[]>(initial);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function search(v: string) {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(() => { void onSuggest(v).then(setHits); }, 200);
  }

  const add = (h: Hit) => {
    if (!picked.some((p) => p.id === h.id))
      setPicked([...picked, { ...h, optional: false }]);
    setQ(""); setHits([]);
  };

  return (
    <Panel>
      {unreadable.length > 0 && (
        <div className="note confirm-unreadable">
          <p>Lines from your page we could not read. Add them below if they matter:</p>
          <ul>
            {unreadable.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>
      )}

      <label className="field">
        <span className="field-label">
          Ingredients: {picked.length} listed. Tap a chip to flip required ↔ optional
        </span>
        <input value={q} onChange={(e) => search(e.target.value)}
               placeholder="add one we missed…" />
      </label>
      {hits.length > 0 && (
        <ul className="hits">
          {hits.map((h) => (
            <li key={h.id}><button type="button" onClick={() => add(h)}>{h.name}</button></li>
          ))}
        </ul>
      )}
      {picked.length > 0 && (
        <div className="creator-add-chips">
          {picked.map((p) => (
            <span key={p.id} className={`chip ${p.optional ? "chip-optional" : "chip-required"}`}>
              <button type="button"
                      title={p.optional ? "optional: tap for required" : "required: tap for optional"}
                      onClick={() => setPicked(picked.map((x) =>
                        x.id === p.id ? { ...x, optional: !x.optional } : x))}>
                {p.name}{p.optional && <em> · optional</em>}
              </button>
              <button type="button" aria-label={`remove ${p.name}`}
                      onClick={() => setPicked(picked.filter((x) => x.id !== p.id))}>×</button>
            </span>
          ))}
        </div>
      )}

      <p className="cook-line">
        <Button kind="primary"
                disabled={pending || picked.filter((p) => !p.optional).length === 0}
                onClick={() => start(async () => {
                  const r = await onConfirm(handle, recipeId, {
                    requires: picked.filter((p) => !p.optional).map((p) => p.id),
                    optional: picked.filter((p) => p.optional).map((p) => p.id),
                  });
                  if (r.ok) router.push(`/recipe/${recipeId}`);
                  else setNote(r.error);
                })}>
          Confirm this list
        </Button>
        {note && <span className="note">{note}</span>}
      </p>
      <Note>
        Saving replaces our reading with yours and marks the recipe
        Creator-confirmed. The method stays on your page, as always.
      </Note>
    </Panel>
  );
}
