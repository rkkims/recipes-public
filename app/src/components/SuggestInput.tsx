"use client";

/**
 * A free-text field that suggests the vocabulary we already have.
 *
 * Curation's two open text fields — *"should be…"* and the substitutes line —
 * are where the ontology fragments. A curator who types "spring onions" when the
 * node is `scallion` has not made a mistake; they have written a synonym the
 * pipeline will meet later as a stranger. Do that across a few thousand recipes
 * and the vocabulary diverges faster than promotion can converge it.
 *
 * So the field offers what exists, and taking a suggestion writes the CANONICAL
 * name. `UX-SPEC` §7 states the rule for contributors and it applies at least as
 * strongly to the person defining the vocabulary:
 *
 *   *"The suggestion list is a prompt, never a constraint. A field that refused
 *   unknown words would discard the more valuable of the two signals."*
 *
 * A curator typing something we do not have is the promotion queue's best input
 * (`INGREDIENT-SPEC` §5) — it is a real name for a real ingredient, from someone
 * who has just read the recipe. So nothing is rejected and nothing is
 * auto-corrected; the suggestions sit underneath and cost one tap to take.
 *
 * ── Token-aware, because these fields hold more than one thing ────────────
 *
 * The substitutes field uses `a + b` to mean both, so suggesting against the
 * whole string would offer nothing once a curator started a second term. It
 * suggests for the token being typed and replaces only that token, leaving the
 * rest of the line alone.
 */
import { useEffect, useRef, useState } from "react";
import { useSearch } from "@/lib/debounce";

export type Suggestion = { id: string; name: string; recipes: number; via?: string };

/** Where the token under the cursor starts and ends. `+` and `,` separate. */
function tokenAt(value: string): { start: number; end: number; text: string } {
  const at = Math.max(value.lastIndexOf("+"), value.lastIndexOf(","));
  const start = at === -1 ? 0 : at + 1;
  return { start, end: value.length, text: value.slice(start).trim() };
}

export function SuggestInput({ value, onChange, search, placeholder, className, ariaLabel, onEdit }: {
  value: string;
  onChange: (next: string) => void;
  search: (q: string) => Promise<Suggestion[]>;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  /**
   * Curation only: open the ingredient editor for a suggested node — the
   * curator's "I don't like that alias" door (QC-SPEC §4). Absent everywhere
   * else, so the pantry's suggestions stay a prompt and nothing more.
   */
  onEdit?: (h: Suggestion) => void;
}) {
  const { q, setQ, hits, clear } = useSearch(search);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);

  /* Suggest for the token being typed, not the whole field. */
  useEffect(() => {
    const t = tokenAt(value).text;
    if (t.length < 2) { clear(); setQ(""); return; }
    setQ(t);
  }, [value, setQ, clear]);

  /* Clicking away closes it; the field keeps whatever was typed, because a
     suggestion list is a prompt and dismissing it is not a rejection. */
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);

  const take = (name: string) => {
    const { start } = tokenAt(value);
    const head = value.slice(0, start);
    /* One space after a separator, none at the start of the field. */
    onChange((head ? head.replace(/\s*$/, " ") : "") + name);
    setOpen(false);
    clear();
  };

  const shown = open ? hits.slice(0, 6) : [];

  return (
    <span className="suggestwrap" ref={box}>
      <input className={className} value={value} placeholder={placeholder}
             aria-label={ariaLabel}
             autoComplete="off"
             onFocus={() => setOpen(true)}
             onChange={(e) => { onChange(e.target.value); setOpen(true); }}
             onKeyDown={(e) => {
               if (e.key === "Escape") { setOpen(false); return; }
               /* Enter takes the top suggestion, which is the whole point of a
                  keyboard-driven queue — but only while the list is showing, so
                  it never hijacks a deliberate free-text entry. */
               if (e.key === "Enter" && shown[0]) { e.preventDefault(); take(shown[0].name); }
             }} />
      {shown.length > 0 && (
        <ul className="suggestlist" role="listbox">
          {shown.map((h) => (
            <li key={h.id} className={onEdit ? "suggest-row" : undefined}>
              <button type="button" role="option" aria-selected={false}
                      onClick={() => take(h.name)}>
                <span className="hit-name">{h.name}</span>
                {/* The alias is what the curator typed and recognises; without
                    it the row looks like we ignored them. */}
                {h.via && <span className="hit-via">«<b>{h.via}</b>»</span>}
                <span className="hit-count">
                  {h.recipes > 0 ? `${h.recipes.toLocaleString()}` : "new"}
                </span>
              </button>
              {/* Drawn, not typed — the shell's rule for marks. */}
              {onEdit && (
                <button type="button" className="hit-edit"
                        aria-label={`edit ${h.name}`} title={`edit ${h.name}`}
                        onClick={() => { setOpen(false); onEdit(h); }}>
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeWidth={2} strokeLinecap="round"
                       strokeLinejoin="round" aria-hidden="true">
                    <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
