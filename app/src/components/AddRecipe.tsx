"use client";

/**
 * Add a recipe of your own — a video, a post, anything you cooked from.
 *
 * SOCIAL-INGEST §0 ranks TikTok LAST as a crawl target: 2% caption yield across
 * 130 measured videos. That verdict is about crawling, and §2 already carves
 * out this case — *"measured yield still governs the crawl; it does not govern
 * the queue."* You are not crawling. You watched one video and want to cook it,
 * so the expensive, unreliable half — extraction — is skipped entirely.
 *
 * What is left is two steps:
 *
 *   1. **Paste the link.** oEmbed returns a title and a thumbnail so you can
 *      confirm you pasted the right thing (§2a: "the confirmation, not the
 *      extraction"). It is always editable, because for TikTok that "title" is
 *      the caption, and §2a is explicit that a caption must never silently
 *      become a title.
 *   2. **Type the ingredients**, through the same autosuggest the pantry uses.
 *      UX-SPEC §7: sloppy input is welcome, but it resolves to our vocabulary
 *      as you type — so a hand-entered recipe arrives already resolved and
 *      matches, plans and ranks like any other from the moment it is saved.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { useDraft } from "@/lib/draft";
import { useSearch } from "@/lib/debounce";
import { Button, Chip, ChipRow } from "./primitives";
import { PasteIngredients } from "./PasteIngredients";
import { Dialog } from "./Dialog";
import type { ParsedLine } from "@/lib/paste";
import type { ActionResult } from "@/lib/result";

type Hit = { id: string; name: string; recipes: number; via?: string;
             children?: Array<{ id: string; name: string; recipes: number }> };
type Meta = { url: string; source: string; title?: string; image?: string; reason?: string };

export function AddRecipe({ search, onParse, onLookup, onSave, shared, sharedTitle }: {
  /**
   * A link shared in from another app — see `share_target` in `app/manifest.ts`.
   *
   * Arriving with one means the form opens with the link already in it and the
   * lookup already run: the user chose "JipBap" from a share sheet, which is a
   * clearer statement of intent than pressing "Add a recipe" is, and making
   * them press it again would be asking twice.
   */
  shared?: string;
  /** The share sheet's own title, which is usually the post's caption. */
  sharedTitle?: string;
  search: (q: string) => Promise<Hit[]>;
  /** Read a pasted ingredient block into proposals — see `PasteIngredients`. */
  onParse: (block: string) => Promise<ParsedLine[]>;
  onLookup: (url: string) => Promise<{ ok: true; meta: Meta } | { ok: false; error: string }>;
  onSave: (r: { title: string; url: string; source: string; image?: string;
                requires: string[]; note?: string; steps?: string }) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  /**
   * Held for five minutes across an accidental close — see `useDraft`.
   *
   * This form is the most expensive thing in the product to lose: a link, a
   * title typed over a caption, a dozen ingredients picked one by one, and the
   * method. All of it lived in React state and died with the tab.
   */
  const [url, setUrl, clearUrl] = useDraft("add.url", "");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [title, setTitle, clearTitle] = useDraft("add.title", "");
  const [note, setNote, clearNote] = useDraft("add.note", "");
  const [picked, setPicked, clearPicked] =
    useDraft<Array<{ id: string; name: string }>>("add.picked", []);
  const { q, setQ, hits, clear: clearSearch } = useSearch<Hit>(search);
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const reset = () => {
    clearUrl(); setMeta(null); clearTitle(); clearNote();
    clearPicked(); clearSearch(); setFailed(null);
  };

  const lookup = () =>
    start(async () => {
      setFailed(null);
      try {
        const r = await onLookup(url);
        if (!r.ok) { setFailed(r.error); return; }
        setMeta(r.meta);
        // Prefilled, never forced — see the §2a note above.
        if (r.meta.title) setTitle(r.meta.title);
      } catch {
        setFailed("Could not reach the server.");
      }
    });

  const add = (id: string, name: string) => {
    if (!picked.some((p) => p.id === id)) setPicked([...picked, { id, name }]);
    clearSearch();
  };

  const save = () =>
    start(async () => {
      try {
        const r = await onSave({
          title, url: meta?.url ?? url, source: meta?.source ?? "",
          ...(meta?.image ? { image: meta.image } : {}),
          requires: picked.map((p) => p.id),
          ...(note ? { note } : {}),
        });
        if (!r.ok) { setFailed(r.error); return; }
        setDone(title);
        reset();
        setOpen(false);
      } catch {
        setFailed("Could not reach the server.");
      }
    });

  /**
   * Look it up as soon as there is something to look up.
   *
   * The preview has always existed; it was behind a "look up" button, which
   * made confirming the link a second decision after pasting it. Nobody pastes
   * a URL into a box labelled "link to the video" and then wants to be asked
   * whether they meant it — the paste IS the intent, and the preview is how
   * they check the paste landed on the right thing (SOCIAL-INGEST §2a calls
   * this the confirmation, not the extraction).
   *
   * Debounced, because this fires on every keystroke for anyone typing rather
   * than pasting, and each call is a network round trip to someone else's
   * oEmbed endpoint. Guarded on the URL actually having changed since the last
   * lookup, so re-renders and a returning draft do not re-fetch what is already
   * on screen. The button stays, as the way to retry a lookup that failed.
   */
  const lookedUp = useRef<string | null>(null);
  useEffect(() => {
    const u = url.trim();
    if (!u || !/^https?:\/\/\S+\.\S/.test(u)) return;
    if (lookedUp.current === u) return;
    const t = setTimeout(() => {
      lookedUp.current = u;
      start(async () => {
        try {
          const r = await onLookup(u);
          if (!r.ok) { setFailed(r.error); return; }
          setFailed(null);
          setMeta(r.meta);
          if (r.meta.title && !title) setTitle(r.meta.title);
        } catch {
          setFailed("Could not reach the server.");
        }
      });
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  /**
   * Take the shared link once, and only over an empty field.
   *
   * A draft is worth more than a share: someone half way through adding a
   * recipe who shares a second link should not have the first one silently
   * replaced. The share is still in the address bar if they want it.
   *
   * `taken` guards against re-running when the draft restore lands a beat
   * later and re-renders this with the same prop still set.
   */
  const taken = useRef(false);
  useEffect(() => {
    if (!shared || taken.current || url) return;
    taken.current = true;
    setUrl(shared);
    if (sharedTitle) setTitle(sharedTitle);
    setOpen(true);
    // The lookup the user would press next, pressed for them.
    start(async () => {
      try {
        const r = await onLookup(shared);
        if (!r.ok) { setFailed(r.error); return; }
        setMeta(r.meta);
        if (r.meta.title && !sharedTitle) setTitle(r.meta.title);
      } catch {
        setFailed("Could not reach the server.");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared, sharedTitle]);

  const hasDraft = !!(url || title || note || picked.length);

  /**
   * The trigger is ALWAYS rendered — the form itself is a dialog over it.
   *
   * It was an inline expand, which pushed the whole shelf down and put a form
   * in the middle of a page whose job is showing what you have cooked. A
   * dialog holds the page still, and it makes the two arrivals identical: the
   * share sheet and this button now land in the same place, which is the
   * point — one import surface, however you reached it.
   *
   * Rendering the trigger under the open dialog is deliberate (reviewer,
   * 2026-08-14): hiding it made the page reflow at the exact moment a modal
   * promised it would hold still, and the row the dialog visibly grew out of
   * vanishing behind the scrim reads as the page losing its place. The scrim
   * makes it inert; it does not need to disappear.
   *
   * A draft no longer forces the form open on every visit. It used to render
   * expanded whenever one existed, which was right for an inline form (the
   * draft would otherwise be invisible) and wrong for a dialog (a modal you
   * did not ask for). The trigger says a draft is waiting instead.
   */
  return (
    <>
      <p className="cook-line">
        {/* Outlined rather than filled — see `.btn-addrecipe`. */}
        <Button kind="primary" className="btn-addrecipe"
                onClick={() => { setOpen(true); setDone(null); }}>
          Add a recipe
        </Button>
        <span className="note">
          {hasDraft ? <>a draft is waiting</> : <>from a video, a post, anywhere</>}
        </span>
        {done && <span className="note"> · saved “{done}”</span>}
      </p>

      {/* Esc and a click outside keep the draft — `useDraft` holds it for five
          minutes, and an accidental dismissal must not be the thing that spends
          the most expensive form in the product. "discard" is the only reset. */}
      {open && (
    <Dialog label="Add a recipe" onClose={() => setOpen(false)}>
    <div className="addrecipe">
      <p className="cook-line">
        <b>Add a recipe</b>
        {/* Drawn, not typed — the same rule as the shell's controls. Danger
            red because this destroys the draft; Esc and outside-click keep it. */}
        <button type="button" className="addrecipe-discard" title="discard draft"
                aria-label="Discard draft"
                onClick={() => { reset(); setOpen(false); }}>
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 7h16" />
            <path d="M9.5 7V4.5h5V7" />
            <path d="M6.5 7l1 13.5h9l1-13.5" />
            <path d="M10 11v6M14 11v6" />
          </svg>
        </button>
      </p>

      {/* 1 — the link */}
      <label className="field">
        <span className="field-label">Link to the video or post</span>
        <div className="search">
          <input value={url}
                 onChange={(e) => setUrl(e.target.value)}
                 onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookup(); } }} />
          <Button kind="plain" disabled={pending || !url.trim()} onClick={lookup}>
            {pending ? "…" : "look up"}
          </Button>
        </div>
      </label>

      {meta && (
        <div className="addrecipe-meta">
          {meta.image
            ? <img src={meta.image} alt="" referrerPolicy="no-referrer" />
            : <span className="note">no thumbnail</span>}
          <div>
            <p className="note">{meta.source}</p>
            {/* §2a: a caption is not a title. Editable, always. */}
            <label className="field">
              <span className="field-label">Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            {meta.reason && <p className="note">{meta.reason}</p>}
          </div>
        </div>
      )}

      {/* 2 — the ingredients, through the vocabulary (UX-SPEC §7) */}
      {meta && (
        <>
          <label className="field">
            <span className="field-label">
              Ingredients: {picked.length} added
            </span>
            {/* Debounced, stale responses dropped — see `useSearch`. */}
            <div className="search">
              <input value={q}
                     onChange={(e) => setQ(e.target.value)} />
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
                  {/* The same specificity nudge as the pantry — a recipe entered
                      with the precise cut matches better for everything later. */}
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

          {/* The clipboard route. Sits under the one-at-a-time box rather than
              replacing it — a single forgotten ingredient is still faster to
              add by typing. */}
          <PasteIngredients onParse={onParse}
                            onAdd={(rows) => setPicked([
                              ...picked,
                              ...rows.filter((r) => !picked.some((p) => p.id === r.id)),
                            ])} />

          {picked.length > 0 && (
            <ChipRow>
              {picked.map((p) => (
                <Chip key={p.id} label={`${p.name} ✕`} tone="have"
                      title="remove"
                      onClick={() => setPicked(picked.filter((x) => x.id !== p.id))} />
              ))}
            </ChipRow>
          )}

          <label className="field">
            <span className="field-label">Note (optional)</span>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>

          <p className="cook-line">
            <Button kind="primary" disabled={pending || !title.trim()} onClick={save}>
              {pending ? "Saving…" : "Save recipe"}
            </Button>
            {/*
              Ingredients are OPTIONAL — reviewer's call, and it is the right
              one. Saving a link you have not broken down yet is a real thing to
              want; refusing it turns a two-second bookmark into a chore and the
              link ends up somewhere else instead.

              What it costs is stated rather than hidden: with no ingredients
              there is nothing to match a pantry against, so `rank()` — which
              already skips recipes with no requirements — leaves it out of
              "cook tonight". It still saves, plans, and takes ratings.
            */}
            {picked.length === 0 && (
              <span className="note">
                No ingredients entered. It saves but won’t match your pantry.
              </span>
            )}
          </p>
        </>
      )}

      {failed && <p className="fail">{failed}</p>}
    </div>
    </Dialog>
      )}
    </>
  );
}
