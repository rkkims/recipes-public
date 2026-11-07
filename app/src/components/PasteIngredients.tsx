"use client";

/**
 * Paste the ingredient list instead of picking it apart by hand.
 *
 * The text is already in the clipboard — out of a video description, a comment,
 * a blog. Making someone re-enter it twelve times through an autosuggest is a
 * two-minute chore guarding a ten-second job, and it is the single biggest
 * reason a recipe gets saved with no ingredients at all.
 *
 * ── A guess to correct, never a silent import ──────────────────────────────
 *
 * Every line comes back with the ORIGINAL text beside our reading of it, and
 * nothing is added until the user says so. That is the same contract as the
 * starter list and the grocery basket: we show what we think, they fix it, and
 * a wrong guess costs one tap.
 *
 * Three states per row, and they are genuinely different:
 *
 *   - matched — checked, ready to add
 *   - unsure — matched on part of the phrase, so it leads with the doubt
 *   - no match — nothing added, and the line is shown anyway so it is obvious
 *     what was left out rather than silently dropped
 *
 * See `lib/paste.ts` for why this is a modest reader and not the pipeline's
 * parser.
 */
import { useState, useTransition } from "react";
import { Button, Note } from "./primitives";
import type { ParsedLine } from "@/lib/paste";

export function PasteIngredients({ onParse, onAdd }: {
  onParse: (block: string) => Promise<ParsedLine[]>;
  /** The rows the user kept, as ids. */
  onAdd: (rows: Array<{ id: string; name: string }>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [block, setBlock] = useState("");
  const [rows, setRows] = useState<ParsedLine[] | null>(null);
  const [dropped, setDropped] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();

  const reset = () => { setBlock(""); setRows(null); setDropped(new Set()); };

  const parse = () =>
    start(async () => {
      try { setRows(await onParse(block)); setDropped(new Set()); }
      catch { setRows([]); }
    });

  if (!open) {
    return (
      <p className="cook-line">
        <Button kind="quiet" onClick={() => setOpen(true)}>Paste a list instead</Button>
      </p>
    );
  }

  const keepable = (rows ?? []).map((r, n) => ({ r, n }))
    .filter(({ r, n }) => r.id && !dropped.has(n));

  return (
    <div className="paste">
      {!rows ? (
        <>
          <label className="field">
            <span className="field-label">Paste the ingredient list, one per line</span>
            <textarea rows={6} value={block} autoFocus
                      onChange={(e) => setBlock(e.target.value)} />
          </label>
          <p className="cook-line">
            <Button kind="primary" disabled={pending || !block.trim()} onClick={parse}>
              {pending ? "Reading…" : "Read it"}
            </Button>
            <Button kind="quiet" onClick={() => { reset(); setOpen(false); }}>Cancel</Button>
          </p>
        </>
      ) : (
        <>
          <p className="field-label">
            {keepable.length} of {rows.length} lines matched
          </p>
          <Note>
            Anything we couldn’t place is left out.
          </Note>

          <ul className="settle-list">
            {rows.map((r, n) => (
              <li key={`${n}-${r.text}`}>
                <span className="settle-name">
                  {r.id
                    ? <>
                        <b>{r.name}</b>
                        {r.unsure && <span className="note"> · unsure</span>}
                        <span className="note"> ← {r.text}</span>
                      </>
                    : <span className="note">no match: {r.text}</span>}
                </span>
                {r.id && (
                  <span className="settle-choice">
                    <button type="button"
                            className={dropped.has(n) ? "settle-btn" : "settle-btn on"}
                            aria-pressed={!dropped.has(n)}
                            onClick={() => setDropped((s) => {
                              const next = new Set(s);
                              if (next.has(n)) next.delete(n); else next.add(n);
                              return next;
                            })}>
                      {dropped.has(n) ? "Skipped" : "Add"}
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>

          <p className="cook-line">
            <Button kind="primary" disabled={keepable.length === 0}
                    onClick={() => {
                      onAdd(keepable.map(({ r }) => ({ id: r.id!, name: r.name! })));
                      reset();
                      setOpen(false);
                    }}>
              Add {keepable.length}
            </Button>
            <Button kind="quiet" onClick={() => setRows(null)}>Back</Button>
          </p>
        </>
      )}
    </div>
  );
}
