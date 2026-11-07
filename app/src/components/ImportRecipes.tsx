"use client";

/**
 * Bring a saved TikTok collection into "My recipes".
 *
 * Two ways in, because they suit very different sizes of problem:
 *
 *   - **Paste links.** Immediate. Enough for the thirty-odd saves most people
 *     have, and it works with anything — TikTok, YouTube, a blog.
 *   - **The data export.** TikTok's own archive, the only complete route. It
 *     takes hours to days to be prepared, so the instructions have to say that
 *     up front rather than leaving someone waiting on a button.
 *
 * ── Review is not optional ─────────────────────────────────────────────────
 *
 * A saved collection is not a recipe box. It has dance videos in it, and clips
 * saved to send to someone, and the same dinner three times. So nothing lands
 * without being looked at, exactly like the grocery basket and the paste-a-list
 * reader: we show what we found, the user unticks what they do not want, and
 * the count on the button is what will actually happen.
 *
 * ── What arrives is bookmarks ──────────────────────────────────────────────
 *
 * Nothing is parsed, so nothing has ingredients. That is honest but it is not
 * free: recipes with no ingredients cannot rank, cannot be matched against the
 * pantry, and cannot be checked against dietary settings. At the scale of one
 * recipe that is a footnote; at the scale of a hundred it is the difference
 * between a full library and a useful one. So the screen says so afterwards,
 * with the number, rather than reporting a clean success.
 */
import { useState, useTransition } from "react";
import { Button, Note } from "./primitives";
import type { ActionResult } from "@/lib/result";
import type { ImportFound } from "@/lib/import";

type Looked = { url: string; source: string; title?: string; image?: string; failed?: boolean };

/** The most links we will resolve in one pass — see `lookupBatch`. */
const BATCH = 60;

export function ImportRecipes({ onReadPaste, onReadExport, onLookup, onImport }: {
  onReadPaste: (text: string) => Promise<ImportFound>;
  onReadExport: (text: string) => Promise<ImportFound>;
  onLookup: (urls: string[]) => Promise<Looked[]>;
  onImport: (rows: Array<{ title: string; url: string; source: string; image?: string }>)
    => Promise<ActionResult<{ added: number; skipped: number }>>;
}) {
  const [open, setOpen] = useState(false);
  const [how, setHow] = useState<"paste" | "export">("paste");
  const [text, setText] = useState("");
  const [found, setFound] = useState<ImportFound | null>(null);
  const [rows, setRows] = useState<Looked[] | null>(null);
  const [dropped, setDropped] = useState<Set<number>>(new Set());
  const [titles, setTitles] = useState<Record<number, string>>({});
  const [done, setDone] = useState<{ added: number; skipped: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reset = () => {
    setText(""); setFound(null); setRows(null);
    setDropped(new Set()); setTitles({}); setFailed(null);
  };

  const read = (raw: string) =>
    start(async () => {
      setFailed(null);
      try {
        const f = how === "export" ? await onReadExport(raw) : await onReadPaste(raw);
        setFound(f);
        if (f.candidates.length) {
          setRows(await onLookup(f.candidates.map((c) => c.url)));
        }
      } catch {
        setFailed("Could not read that. Check the file and try again.");
      }
    });

  /** Read a chosen file in the browser — the server never sees the whole archive. */
  const takeFile = (file: File) => {
    // A TikTok archive is a few MB; anything far past that is not one, and
    // reading it into memory to find out would be the wrong kind of generous.
    if (file.size > 40 * 1024 * 1024) {
      setFailed("That file is larger than 40MB. Are you sure it is the data export?");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setFailed("Could not read that file.");
    reader.onload = () => read(String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const keep = (rows ?? []).map((r, n) => ({ r, n })).filter(({ n }) => !dropped.has(n));
  const titleFor = (r: Looked, n: number) => (titles[n] ?? r.title ?? "").trim();
  const importable = keep.filter(({ r, n }) => titleFor(r, n).length > 0);

  if (!open) {
    return (
      <p className="cook-line">
        <Button kind="plain" onClick={() => { setOpen(true); setDone(null); }}>
          Import from TikTok
        </Button>
        <span className="note">links, or your data export</span>
        {done && (
          <span className="note">
            {" "}· added {done.added}{done.skipped ? `, skipped ${done.skipped} already saved` : ""}
          </span>
        )}
      </p>
    );
  }

  return (
    <div className="addrecipe">
      <p className="cook-line">
        <b>Import from TikTok</b>
        <Button kind="quiet" onClick={() => { reset(); setOpen(false); }}>Cancel</Button>
      </p>

      {failed && <div className="failbar" role="alert"><b>{failed}</b></div>}

      {!rows && (
        <>
          <div className="filters" role="tablist" aria-label="How to import">
            {(["paste", "export"] as const).map((k) => (
              <button key={k} type="button" role="tab" className="filter"
                      aria-selected={how === k}
                      onClick={() => { setHow(k); reset(); }}>
                {k === "paste" ? "Paste links" : "Data export"}
              </button>
            ))}
          </div>

          {how === "paste" ? (
            <>
              <Note>
                Share → Copy link, one per line. Any site.
              </Note>
              <label className="field">
                <span className="field-label">Links, one per line</span>
                <textarea rows={7} value={text} onChange={(e) => setText(e.target.value)}
                          placeholder={"https://www.tiktok.com/@chef/video/…\nhttps://www.tiktok.com/@other/video/…"} />
              </label>
              <p className="cook-line">
                <Button kind="primary" disabled={pending || !text.trim()}
                        onClick={() => read(text)}>
                  {pending ? "Reading…" : "Read the links"}
                </Button>
              </p>
            </>
          ) : (
            <>
              {/* Five facts a user cannot guess: where it lives, which format,
                   that it is not instant, that the zip must be opened, and that
                   the archive stays on their machine. Everything else was
                   narration. */}
              <Note>
                TikTok → <b>Settings → Account → Download your data</b>, as{" "}
                <b>JSON</b>. Takes hours to days. Unzip it, then pick the file.
              </Note>
              {/* The claim, not the mechanism. "Read in your browser" describes
                  how we keep the promise; what a person wants to know is which
                  of their things we get to see. */}
              <Note>We only take the video links, nothing else in the file.</Note>
              <label className="field">
                <span className="field-label">Your export file (.json or .txt)</span>
                <input type="file" accept=".json,.txt,application/json,text/plain"
                       onChange={(e) => {
                         const f = e.target.files?.[0];
                         if (f) takeFile(f);
                       }} />
              </label>
              {pending && <p className="note">Reading…</p>}
            </>
          )}

          {found && found.candidates.length === 0 && (
            <p className="card-warn">
              {found.emptyButValid
                ? "Read fine, but no video links in it. Request the data again with Favourites included."
                : "No links found. Use the unzipped .json or .txt, not the zip."}
            </p>
          )}
        </>
      )}

      {rows && (
        <>
          <p className="field-label">
            {importable.length} of {rows.length} ready to import
          </p>
          {found?.where.length ? <Note>Found: {found.where.join(" · ")}</Note> : null}
          {found && found.candidates.length > BATCH && (
            <Note>
              First {BATCH}. Import these, then run it again for the rest.
            </Note>
          )}

          <ul className="settle-list">
            {rows.map((r, n) => {
              const out = dropped.has(n);
              const title = titleFor(r, n);
              return (
                <li key={r.url}>
                  <span className="settle-name">
                    {r.failed || !r.title ? (
                      // §2a: a caption must never silently become a title, and
                      // neither may a URL. Needs a name, so it asks for one.
                      <input className="import-title" value={titles[n] ?? ""}
                             placeholder="name this one…"
                             onChange={(e) => setTitles({ ...titles, [n]: e.target.value })} />
                    ) : <b>{title}</b>}
                    <span className="note"> · {r.source}</span>
                  </span>
                  <span className="settle-choice">
                    <button type="button" className={out ? "settle-btn" : "settle-btn on"}
                            aria-pressed={!out}
                            onClick={() => setDropped((s) => {
                              const next = new Set(s);
                              if (next.has(n)) next.delete(n); else next.add(n);
                              return next;
                            })}>
                      {out ? "Skipped" : "Import"}
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>

          <p className="cook-line">
            <Button kind="primary" disabled={pending || importable.length === 0}
                    onClick={() => start(async () => {
                      try {
                        const r = await onImport(importable.map(({ r, n }) => ({
                          title: titleFor(r, n), url: r.url, source: r.source,
                          ...(r.image ? { image: r.image } : {}),
                        })));
                        if (!r.ok) { setFailed(r.error); return; }
                        setDone(r.value);
                        reset();
                        setOpen(false);
                      } catch {
                        setFailed("Could not reach the server.");
                      }
                    })}>
              {pending ? "Importing…" : `Import ${importable.length}`}
            </Button>
            <Button kind="quiet" onClick={() => { setRows(null); setFound(null); }}>Back</Button>
          </p>

          {/* Said before they commit, not after. A hundred rows that cannot
              rank is a worse library than ten that can. */}
          <Note>
            No ingredients yet, so they won’t match your pantry.
          </Note>
        </>
      )}
    </div>
  );
}
