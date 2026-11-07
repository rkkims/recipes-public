/**
 * Every visual atom in the product, in one file.
 *
 * This is deliberately the ugliest code in the repo and the easiest to delete.
 * The whole point is that when a designed system arrives, it replaces THIS FILE
 * and nothing else — no feature component styles itself, no page contains a
 * colour, and no logic lives behind a class name.
 *
 * Rules for anything added here:
 *   - it takes props and returns markup; it never fetches, computes or decides
 *   - it has a name from the product's vocabulary (`Chip`, `Shelf`), not the
 *     framework's (`Div`, `FlexRow`)
 *   - if a component needs a variant, it takes a prop — never a second component
 */
"use client";

import { useState, type ReactNode } from "react";

export function Page({ children }: { children: ReactNode }) {
  return <div className="page">{children}</div>;
}

/**
 * The fold mark on a section heading — drawn, not typed.
 *
 * It was `▾` and `▸`, which is a character: it inherits whatever font the
 * platform substitutes, occupies an unpredictable fraction of its em box, and
 * changes weight and optical size between iOS, Android and a desktop browser.
 * Beside the drawer's close control — a 20px SVG at stroke 2 — it read as a
 * different kind of object entirely, because it was one.
 *
 * Same geometry as that control now: same box, same stroke weight, same round
 * caps, `currentColor` so it follows the heading's hover and focus states
 * without a second rule. A chevron rather than a filled triangle, for the same
 * reason the rest of the shell's marks are strokes.
 */
function Caret({ open }: { open: boolean }) {
  return (
    <svg className="section-caret" width={20} height={20} viewBox="0 0 24 24"
         fill="none" stroke="currentColor" strokeWidth={2}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* Down when the body is showing, right when it is folded away — the mark
          points at where the content is, not at where the tap will take it. */}
      <path d={open ? "M6 9l6 6 6-6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}

export function Section({ title, count, children, action, foldable, defaultOpen = true }: {
  title: ReactNode; count?: number; children: ReactNode; action?: ReactNode;
  /**
   * Whether the heading collapses the body.
   *
   * The pantry and the grocery list are both long and only one is usually the
   * point — mid-shop it is the list, mid-cook it is the pantry. Folding is how
   * you get the other out of the way without hiding it, and the count stays on
   * the heading so a folded section still says how much is in it.
   */
  foldable?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const head = (
    <>
      {title}{count !== undefined && <span className="count">{count}</span>}
    </>
  );

  if (!foldable) {
    return (
      <section className="section">
        <h2 className="section-title">
          {head}
          {action && <span className="section-action">{action}</span>}
        </h2>
        {children}
      </section>
    );
  }

  return (
    <section className="section">
      <h2 className="section-title">
        {/*
          The caret sits at the FAR RIGHT of the heading, after the title and
          count, and it is drawn at a size a thumb can find.

          At 10px on the left it was the smallest thing on the panel, wedged
          between the panel edge and a word — so the affordance was invisible and
          the hit area was whatever the glyph happened to occupy. Right-aligned
          it lands where a hand already is, and it is the only thing in that
          corner, so nothing else is at risk from a miss.

          The whole heading stays the button, not just the mark: shrinking a
          target to the size of its icon is the one thing this move is trying to
          undo.
        */}
        <button type="button" className="section-fold" aria-expanded={open}
                onClick={() => setOpen((v) => !v)}>
          {head}
          <Caret open={open} />
        </button>
        {action && <span className="section-action">{action}</span>}
      </h2>
      {open && children}
    </section>
  );
}

/** An ingredient. The most-used object in the product, so it is one component. */
export function Chip({ label, tone = "plain", pinned, gone, onClick, title }: {
  label: string;
  /**
   * Which shelf this chip is drawn ON — `have` green, `want` blue.
   *
   * On the two inventory panels the tone belongs to the SECTION, not to the
   * item's state. It used to be read off the state, so a pantry item that was
   * also on the list came out blue inside the green shelf, and a list row you
   * happened to hold came out green inside the blue one — both panels speckled,
   * and the one thing colour was carrying stopped being legible. Where an item
   * stands is said by which shelf it is on; the tone is the shelf.
   *
   * `missing` is the recipe modal's, where there is no shelf and the state IS
   * the subject.
   */
  tone?: "plain" | "have" | "want" | "urgent" | "missing";
  /**
   * "Use first", marked structurally rather than by colour or by a character.
   *
   * A `•` in the label was the first attempt and it inherits the label's size
   * and colour, so it read as punctuation. This is a drawn pip and a heavier
   * border — weight and shape, which survive greyscale and do not spend
   * another hue on a palette already carrying three meanings.
   */
  pinned?: boolean;
  /**
   * No longer a member of the shelf it is drawn on, but still shown.
   *
   * The grocery list has always worked this way — a ticked row dims and stays,
   * because in a shop you look back down the list to check you picked something
   * up and a row that vanished gives you nothing to check against (§4e). The
   * pantry now does the same for the same reason: something removed by a mis-tap
   * that disappears cannot be un-mis-tapped.
   */
  gone?: boolean;
  /**
   * The event is forwarded so a caller can anchor a popover to this exact chip.
   * Handlers that ignore it stay valid — fewer parameters is always assignable.
   */
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  title?: string;
}) {
  /**
   * Interactive chips are buttons; the rest are not.
   *
   * A chip with no handler rendered as a `<button>` anyway — focusable, and
   * offering a press that did nothing. On a card, where the chips are labels
   * describing the match rather than controls, that is a promise the card
   * cannot keep.
   */
  const cls = `chip chip-${tone}${pinned ? " chip-pinned" : ""}${gone ? " chip-gone" : ""}`;
  if (!onClick) return <span className={cls} title={title}>{label}</span>;
  return (
    <button type="button" className={cls} onClick={onClick} title={title}>{label}</button>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <div className="chip-row">{children}</div>;
}

export function Button({ children, onClick, kind = "plain", type = "button", disabled,
                        className }: {
  children: ReactNode; onClick?: () => void;
  kind?: "plain" | "primary" | "quiet"; type?: "button" | "submit"; disabled?: boolean;
  /**
   * One more class, for the rare button that needs a treatment of its own.
   *
   * Not an escape hatch for arbitrary styling — `kind` still decides what the
   * button IS, and this only ever adds. It exists because a product eventually
   * has one or two buttons whose weight is a considered exception rather than a
   * new kind, and inventing a fourth `kind` for a single call site puts a
   * one-off in front of everyone reading the vocabulary.
   */
  className?: string;
}) {
  return (
    <button type={type} className={`btn btn-${kind}${className ? ` ${className}` : ""}`}
            onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Toggle({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Panel({ children }: { children: ReactNode }) {
  return <div className="panel">{children}</div>;
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="note">{children}</p>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

/** One recipe in a list. */
/**
 * A result row. Deliberately carries NO affiliate link.
 *
 * UX-SPEC §5: "affiliate placement: inside the modal only, never on the results
 * grid." An earlier version put buy links next to each gap, which reads as
 * helpful and is the thing the spec forbids — the grid is where trust in the
 * ranking is either kept or spent. §4 puts the link on the grocery list.
 */
export function RecipeRow({ title, source, missing, uses, incomplete, checks = [], away, href, children }: {
  title: string; source: string; missing: string[];
  /** How many ingredients short — the whole question the near-miss list asks. */
  away?: number;
  uses: string[];
  /**
   * Requirements covered by something BROADER than the recipe named — §3a.
   * Each is `{ wants, have }`, and each earns one line the user can act on.
   */
  checks?: Array<{ wants: string; have: string }>;
  incomplete: boolean; href: string; children?: ReactNode;
}) {
  return (
    <div className="recipe">
      <div className="recipe-head">
        <a className="recipe-title" href={href} target="_blank" rel="noreferrer">{title}</a>
        <span className="recipe-source">{source}</span>
      </div>
      <div className="recipe-meta">
        {uses.length > 0 && <span className="tag tag-urgent">uses {uses.join(", ")}</span>}
        {missing.length === 0
          ? <span className="tag tag-have">you have everything</span>
          : <>
              {/* Distance first and by itself: the list is ordered on it, so
                  the eye should be able to run down the column reading it. */}
              {away !== undefined && (
                <span className="tag tag-away">{away} {away === 1 ? "ingredient" : "ingredients"} away</span>
              )}
              <span className="tag tag-missing">{missing.join(", ")}</span>
            </>}
        {/* RECIPE-SPEC §1: never hide that we could not account for a line.
            Worded as a limit on OUR reading rather than a defect in the recipe
            — see the same note in `Gallery.tsx`. */}
        {incomplete && <span className="tag tag-warn">we couldn’t read every line</span>}
      </div>
      {/*
        INGREDIENT-SPEC §3a. Written out per ingredient rather than as one
        "some substitutions" tag, because the user can only act on it if they
        know WHICH line — and the wording puts the recipe's word first, since
        that is what they will be reading on the source page.
      */}
      {checks.length > 0 && (
        <ul className="recipe-checks">
          {checks.map((c) => (
            <li key={c.wants}>
              The recipe calls for <b>{c.wants}</b> and your pantry says <b>{c.have}</b>. Check the
              source that what you have works.
            </li>
          ))}
        </ul>
      )}
      {children}
    </div>
  );
}

/**
 * A recipe's source, with the platform drawn rather than spelled.
 *
 * `source` arrives as "TikTok · Chef Chris Cho", "YouTube · Rick Astley", or a
 * bare host ("youtube.com") when the lookup had no author to name. Spelled
 * out, `.card-source`'s uppercase turned the word into TIKTOK — a shout on a
 * line meant to whisper. The mark carries the same attribution in the
 * platform's own shape, drawn as SVG in `currentColor` (the line's muted ink,
 * not the brands' colours — the fourth-colour rule), with the platform name
 * kept for screen readers. Anything that is not one of the two platforms
 * renders as the text it always was.
 */
export function SourceLabel({ source }: { source: string }) {
  const m = source.match(/^\s*(tiktok|youtube|youtu\.be)(?:\.com)?\s*(?:·\s*)?(.*)$/i);
  if (!m) return <>{source}</>;
  const tiktok = m[1]!.toLowerCase() === "tiktok";
  const rest = m[2]!.trim();
  return (
    <>
      <span className="source-mark" role="img" aria-label={tiktok ? "TikTok" : "YouTube"}>
        {tiktok ? (
          <svg width={11} height={11} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
          </svg>
        ) : (
          <svg width={13} height={13} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
        )}
      </span>
      {rest && <> {rest}</>}
    </>
  );
}
