"use client";

/**
 * A creator adds one of their own recipes — the five-minute promise, kept.
 *
 * Three steps and no fourth: the link (looked up as it is pasted, the same
 * confirmation-not-extraction the user paste flow runs), the title (theirs to
 * edit — a caption is not a title), and the ingredients, picked through the
 * vocabulary and TOGGLED between required and optional by tapping the chip.
 * One tap = flip: the annotation the whole pitch is about is a row of chips,
 * not a form.
 *
 * On save the recipe is live — their page, its own /recipe page, search
 * within their shelf — because creator-added rows are resolved by
 * construction and read fresh. Nothing here accepts a method, and the page
 * says so where the creator can see it.
 */
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Note, Panel } from "@/components/primitives";

type Meta = { url: string; source: string; title?: string; image?: string };
type Hit = { id: string; name: string };
type Picked = { id: string; name: string; optional: boolean };

export function CreatorAddRecipe({ handle, initial, onLookup, onSuggest, onSuggestRecipes, onSave }: {
  handle: string;
  /** An existing row of theirs, preloaded — editing is the same form arriving
      full, and the same-URL save upserts rather than duplicating. */
  initial?: { url: string; title: string; image?: string; picked: Picked[]; raw?: string[];
              components?: Array<{ id: string; title: string }> };
  onLookup: (handle: string, url: string) => Promise<{ ok: true; meta: Meta } | { ok: false; error: string }>;
  onSuggest: (q: string) => Promise<Hit[]>;
  /** Their own shelf, for the component picker — "1 cup of my anchovy stock
      (recipe here)". Same-creator only; the action enforces it again. */
  onSuggestRecipes: (handle: string, q: string) => Promise<Array<{ id: string; title: string }>>;
  onSave: (handle: string, r: { title: string; url: string; image?: string;
                                requires: string[]; optional: string[]; unresolved?: string[];
                                components?: string[] })
    => Promise<{ ok: true; id: string } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initial?.url ?? "");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [picked, setPicked] = useState<Picked[]>(initial?.picked ?? []);
  // SS5b's quarantine: lines the vocabulary does not have, kept as typed.
  // Captured rather than blocked (blocking kills the flow for exactly the
  // specialist creators we most want) and never minted into the ontology.
  const [raw, setRaw] = useState<string[]>(initial?.raw ?? []);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  /* Components — other recipes of THEIRS this one uses. Kept as id+title so
     the chips render without a lookup, saved as ids. */
  const [comps, setComps] = useState<Array<{ id: string; title: string }>>(
    initial?.components ?? []);
  const [compQ, setCompQ] = useState("");
  const [compHits, setCompHits] = useState<Array<{ id: string; title: string }>>([]);
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Seeded when editing so the preloaded URL does not re-trigger the lookup
  // and overwrite the title they already chose.
  const looked = useRef<string | null>(initial?.url ?? null);

  function onUrl(v: string) {
    setUrl(v);
    const u = v.trim();
    if (!/^https?:\/\/\S+\.\S/.test(u) || looked.current === u) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      looked.current = u;
      start(async () => {
        const r = await onLookup(handle, u);
        if (r.ok) { setMeta(r.meta); if (r.meta.title && !title) setTitle(r.meta.title); }
      });
    }, 600);
  }

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
      <label className="field">
        <span className="field-label">Link to your video or post</span>
        <input value={url} onChange={(e) => onUrl(e.target.value)}
               placeholder="https://www.youtube.com/… or your site" />
      </label>
      {meta?.image && (
        <img className="creator-add-shot" src={meta.image} alt=""
             referrerPolicy="no-referrer" />
      )}
      <label className="field">
        <span className="field-label">Title: yours to edit, a caption is not a title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
               placeholder="what you call this dish" />
      </label>

      <label className="field">
        <span className="field-label">
          Ingredients: {picked.length} added. Tap a chip to flip required ↔ optional
        </span>
        <input value={q} onChange={(e) => search(e.target.value)}
               placeholder="gochujang, pork belly, scallion…" />
      </label>
      {hits.length > 0 && (
        <ul className="hits">
          {hits.map((h) => (
            <li key={h.id}><button type="button" onClick={() => add(h)}>{h.name}</button></li>
          ))}
        </ul>
      )}
      {/* The miss path: we do not have the word, and the honest move is to
          say so and keep their spelling. The recipe publishes on their page
          and joins matching when our vocabulary catches up. */}
      {hits.length === 0 && q.trim().length >= 2 && (
        <p className="note">
          We do not know &quot;{q.trim()}&quot; yet.{" "}
          <button type="button" className="linklike"
                  onClick={() => {
                    const line = q.trim();
                    if (!raw.includes(line)) setRaw([...raw, line]);
                    setQ("");
                  }}>
            Keep it as written
          </button>
          {" "}and the recipe joins matching once we learn it.
        </p>
      )}
      {(picked.length > 0 || raw.length > 0) && (
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
          {raw.map((line) => (
            <span key={line} className="chip chip-raw"
                  title="kept as you wrote it, waiting on our vocabulary">
              <button type="button" disabled>{line}<em> · new to us</em></button>
              <button type="button" aria-label={`remove ${line}`}
                      onClick={() => setRaw(raw.filter((x) => x !== line))}>×</button>
            </span>
          ))}
        </div>
      )}

      {/* The blog convention, as a field: "1 cup of my anchovy stock (recipe
          here)". Their own shelf only — a component is a claim about a
          recipe, and the only recipes that are theirs to claim are theirs.
          The picked recipe's ingredients join this one's pantry math
          (`expandComponents`), and the modal links it. */}
      <label className="field">
        <span className="field-label">Uses another of your recipes (optional)</span>
        <input value={compQ}
               placeholder="the stock, the sauce, the kimchi it builds on…"
               onChange={(e) => {
                 const v = e.target.value;
                 setCompQ(v);
                 if (timer.current) clearTimeout(timer.current);
                 if (v.trim().length < 2) { setCompHits([]); return; }
                 timer.current = setTimeout(() => {
                   void onSuggestRecipes(handle, v).then((rows) =>
                     setCompHits(rows.filter((r) => !comps.some((c) => c.id === r.id))));
                 }, 200);
               }} />
      </label>
      {compHits.length > 0 && (
        <ul className="hits">
          {compHits.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => {
                if (!comps.some((c) => c.id === r.id)) setComps([...comps, r]);
                setCompQ(""); setCompHits([]);
              }}>{r.title}</button>
            </li>
          ))}
        </ul>
      )}
      {comps.length > 0 && (
        <div className="creator-add-chips">
          {comps.map((c) => (
            <span key={c.id} className="chip chip-component" title="a recipe of yours, used as an ingredient">
              <button type="button" disabled>{c.title}<em> · your recipe</em></button>
              <button type="button" aria-label={`remove ${c.title}`}
                      onClick={() => setComps(comps.filter((x) => x.id !== c.id))}>×</button>
            </span>
          ))}
        </div>
      )}

      <p className="cook-line">
        <Button kind="primary"
                disabled={pending || !title.trim() || !/^https?:\/\//.test(url) ||
                          picked.filter((p) => !p.optional).length === 0}
                onClick={() => start(async () => {
                  const r = await onSave(handle, {
                    title, url: meta?.url ?? url,
                    /* On an edit with an untouched link there is no fresh
                       lookup — the stored image must ride through, or saving
                       a title fix would silently drop the photo. */
                    ...((meta?.image ?? initial?.image)
                      ? { image: meta?.image ?? initial?.image } : {}),
                    requires: picked.filter((p) => !p.optional).map((p) => p.id),
                    optional: picked.filter((p) => p.optional).map((p) => p.id),
                    ...(raw.length ? { unresolved: raw } : {}),
                    ...(comps.length ? { components: comps.map((c) => c.id) } : {}),
                  });
                  if (r.ok) router.push(`/creators/${handle}`);
                  else setNote(r.error);
                })}>
          {initial ? "Save changes" : "Add to my page"}
        </Button>
        {note && <span className="note">{note}</span>}
      </p>
      <Note>
        We store the link, the title and this ingredient list. The method stays
        with your video. Pasting the same link again edits instead of
        duplicating.
      </Note>
    </Panel>
  );
}
