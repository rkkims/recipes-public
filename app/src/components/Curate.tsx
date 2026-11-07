"use client";

/**
 * The curation screen — one recipe, every judgement, then next.
 *
 * The reviewer's daily loop, so the design goal is that a recipe takes seconds
 * and is never seen twice. Three things follow from that and are not negotiable:
 *
 *   - every field arrives PRE-FILLED with the best guess available (DECISIONS
 *     §5: never show a blank field, always show a guess to correct). Blank
 *     fields are what make review feel like data entry
 *   - the source opens in a tab, because judging quality and lead time means
 *     reading the method, and nothing here reproduces it
 *   - keys do everything. K keeps, D drops, S skips; the hands stay still
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Chip, ChipRow, Note, Panel, Section } from "./primitives";

import { SuggestInput, type Suggestion } from "./SuggestInput";
import { IngredientSheet, type SheetActions } from "./IngredientSheet";

export type LineView = {
  raw: string; head: string; node: string | null; nodeName: string;
  /** All nodes this line resolves to — "salt and pepper" is two. */
  nodeNames: string[];
  /** Display twins of nodeNames: "korean red pepper paste - gochujang".
      Rendering only — every save and sheet-open uses the canonical names. */
  nodeLabels?: string[];
  alts: string[]; optional: boolean;
  /** A site rule classified this as not an ingredient at all. */
  dropped?: "equipment" | "sub-recipe" | "instruction" | "yield" | "header";
  /** The line was read by the extraction overlay, not the rule parser. */
  llm?: boolean;
  /** The variant this mention MEANS here, when the resolution table knows —
      shown as the pre-fill the curator confirms or overrides. */
  resolvedName?: string;
  resolutionTier?: "curated" | "explicit" | "cuisine-default";
};

export type Draft = {
  recipe_id: string;
  /** Required when the verdict is drop — CURATION-RULES §2: an enum the
      pipeline can learn from, never free text alone. */
  drop_reason: string;
  /** From the closed EQUIPMENT vocabulary (lib/curation). */
  equipment: string[];
  quality: "" | "bad" | "medium" | "good";
  /** Ordered, first = primary — a dish can sit under several cuisines
      (settled 2026-08-16). Never empty in a save; empty falls back to
      unresolved at the action. */
  cuisines: string[];
  dish_type: string;
  make_ahead: boolean;
  note: string;
  substitutes: Array<{ wanted: string; alt: string }>;
  /**
   * Ingredients the SOURCE omitted — the method salts the soup, the list never
   * mentions salt. Node NAMES, comma-separated in one field like substitutes;
   * the save resolves them to ids and drops what will not resolve, the same
   * contract as `resolutions`.
   */
  added: string[];
  bad_lines: string[];
  /** raw line → what it should have been. Only lines the curator wrote on. */
  line_notes: Record<string, string>;
  /** raw line → the RECIPE it names ("4 Tonkatsu (Pork Cutlets)"). The id also
      rides `components` at save, so assembly folds the component's requires. */
  line_components: Record<string, { id: string; title: string }>;
  /** raw line → optional?, only where the curator disagreed with the parse. */
  tiers: Record<string, boolean>;
  /**
   * raw line → the variant node NAME this mention means here (RESOLUTION-SPEC
   * §1, the `curated` tier). Written as text through the same autosuggest as
   * everything else; the save resolves names to ids. Only lines the curator
   * answered — the table's own pre-fill is not copied in.
   */
  resolutions: Record<string, string>;
  /**
   * What the dish is OF — RECIPE-SPEC §4c. Node IDS, ordered, at most two.
   *
   * Ordered because the first is the one the dish is named for; the cap is
   * enforced here rather than trusted to the curator, because three is the
   * point at which the field stops distinguishing anything.
   */
  main_ingredients: string[];
  /**
   * Recipes this recipe uses as an ingredient — "1 recipe of my chicken
   * stock", the blog convention of linking a previous post. Held as id+title
   * so the chips render without a lookup; saved as ids (see the action).
   */
  components: Array<{ id: string; title: string }>;
};

/** §4c: at most two. Toggling a third replaces the OLDEST, so the last two
 *  clicks always win and the control never silently does nothing. */
export const MAX_MAIN = 2;

export type Subject = {
  id: string; title: string; url: string; source: string; image: string;
  lines: LineView[];
  draft: Draft;
  leadReason?: string;
  /** What the source stated, if anything — shown so an estimate is visibly an estimate. */
  sourceMinutes?: number;
  /** The recipe's own method, fetched live and never stored. */
  method: string[];
  notes: string;
  sourceError?: string;
  position: { done: number; total: number };
  /** `revisit` means a saved judgement is loaded and will be overwritten.
      `batch` means the form is one unfolded row of CurateBatch: saving must
      not navigate — the batch collapses the row and unfolds the next. */
  mode: "queue" | "revisit" | "batch";
  savedAt?: string;
  savedVerdict?: "keep" | "drop" | "skip";
  /**
   * The machine draft's suggestion — shown beside the title, never a pressed
   * button (CURATION-RULES §1). `why` is the draft's one-line reason; `dispute`
   * is set when the draft thought the dish sits outside the queue's cuisines.
   */
  suggested?: { verdict: "keep" | "drop" | "skip"; why?: string; dispute?: string };
  /** Queue mode: the most recently touched row, for "I misjudged that one". */
  backHref?: string;
  /** Revisit mode: back to the queue. */
  resumeHref?: string;
  /**
   * Curated main ingredients the recipe no longer requires — RECIPE-SPEC §4c.
   *
   * Surfaced, never auto-removed. The saved ids stay in the draft, so saving
   * without touching this preserves the judgement; the curator decides whether
   * the parse regressed or the recipe changed.
   */
  staleMains: Array<{ id: string; name: string }>;
};

/** Saved substitutes → one editable line per ingredient, so a revisit round-trips. */
function groupSubs(subs: Array<{ wanted: string; alt: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of subs) out[s.wanted] = out[s.wanted] ? `${out[s.wanted]}, ${s.alt}` : s.alt;
  return out;
}

/* "others" is a real answer — a cuisine we do not model yet — where
   "unresolved" is the absence of one. Keeping them distinct keeps "no answer"
   queryable. */
const CUISINES = ["korean", "japanese", "chinese", "thai", "vietnamese", "filipino",
                  "others", "unresolved"];
const DROP_REASONS = ["duplicate", "not-a-recipe", "incomplete", "unparseable", "out-of-scope"];
const EQUIPMENT = ["slow cooker", "air fryer", "oven", "grill", "blender", "stand mixer",
                   "deep fryer", "rice cooker", "pressure cooker"];

export function Curate({ subject, onSave, onAdvance, ingredient, search, searchRecipes }: {
  subject: Subject;
  onSave: (verdict: "keep" | "drop" | "skip", draft: Draft) => Promise<void>;
  /** Batch mode only: unfold the next recipe WITHOUT recording anything —
      the batch page's equivalent of the queue's `?after=` link. */
  onAdvance?: () => void;
  /** QC-SPEC §4's sideways door: the ingredient editor as a sheet over this
      recipe. Node tags and suggestion rows open it when present. */
  ingredient?: SheetActions;
  /** Recipe titles, same source first — the component picker's autosuggest
      ("1 recipe of my chicken stock" names a sibling post, almost always). */
  searchRecipes: (q: string) => Promise<Array<{ id: string; title: string; source: string }>>;
  /**
   * The ontology autosuggest — so curation CONVERGES the vocabulary.
   *
   * The two free-text fields on this form are where it diverges: a curator who
   * types "spring onions" for `scallion` has written a synonym the pipeline
   * meets later as a stranger. Offering what exists, and writing the canonical
   * name when a suggestion is taken, is how a few thousand judgements end up
   * speaking one language.
   */
  search: (q: string) => Promise<Suggestion[]>;
}) {
  const [d, setD] = useState<Draft>(subject.draft);
  const [pending, start] = useTransition();
  /**
   * Substitute text per ingredient, held locally rather than derived from the
   * draft on every keystroke.
   *
   * Deriving it would re-split and re-join mid-word: typing "egg + " round-trips
   * through `trim()` and the trailing space vanishes under the cursor.
   */
  const [subText, setSubText] = useState<Record<string, string>>(
    () => groupSubs(subject.draft.substitutes));
  /* Same held-text rule for the omitted-ingredients field: deriving it from
     the draft would eat the comma-space under the cursor. */
  const [addText, setAddText] = useState(() => subject.draft.added.join(", "));
  /* The component picker's own scratch state — the chips live in the draft. */
  const [compQ, setCompQ] = useState("");
  const [compHits, setCompHits] = useState<Array<{ id: string; title: string; source: string }>>([]);
  const compTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    /* A draft stashed by a FAILED save (see `commit`) outranks the server's
       pre-fill: the reload that fixes a stale-deployment tab must not cost
       the curator what they had already decided. One use, then gone. */
    let restored: Draft | null = null;
    try {
      const raw = sessionStorage.getItem(`curate-stash:${subject.id}`);
      if (raw) {
        restored = JSON.parse(raw) as Draft;
        sessionStorage.removeItem(`curate-stash:${subject.id}`);
      }
    } catch { /* storage unavailable — the pre-fill stands */ }
    const draft = restored ?? subject.draft;
    setD(draft);
    setSubText(groupSubs(draft.substitutes));
    setAddText(draft.added.join(", "));
    setCompQ(""); setCompHits([]);
  }, [subject.id, subject.draft]);

  /**
   * Save, then MOVE ON — the whole loop of this screen.
   *
   * `revalidatePath` in the action was not enough and neither was redirecting to
   * `/curate`: the queue is defined as "the next uncurated recipe", so the URL
   * never changes, and the client Router Cache answered the navigation from the
   * copy it already held. The write landed, the server was right — a fresh
   * request showed the next recipe and an advanced count — and the reviewer sat
   * looking at the one they had just judged with no way forward.
   *
   * `router.refresh()` is the one thing that discards that cached segment and
   * re-fetches. Awaited first, so the refresh cannot race the write.
   */
  const [needReason, setNeedReason] = useState(false);
  /* A save that failed must SAY so — a drop pressed against a restarting
     server was vanishing silently (curator report, 2026-08-20). */
  const [saveError, setSaveError] = useState(false);
  /* The ingredient open in the sheet, by name or id — null when closed. */
  const [sheet, setSheet] = useState<string | null>(null);
  const editHit = ingredient ? (h: Suggestion) => setSheet(h.id) : undefined;
  /* `override` lets the reason chip commit in the same tap — React state is
     asynchronous, so the chip's fresh reason rides the call, not the state. */
  const commit = (verdict: "keep" | "drop" | "skip", override?: Partial<Draft>) =>
    start(async () => {
      const draft = override ? { ...d, ...override } : d;
      // A drop without a reason cannot be learned from, audited, or explained
      // to the next annotator (CURATION-RULES §2) — so it cannot be filed.
      // One extra tap, only on the rare verdict.
      if (verdict === "drop" && !draft.drop_reason) { setNeedReason(true); return; }
      setNeedReason(false);
      try {
        await onSave(verdict, draft);
        setSaveError(false);
      } catch {
        /* Most failures here are a stale tab after a deploy — retrying the
           same action id cannot succeed. Stash the work so the reload that
           fixes the tab also restores every judgment already made. */
        try { sessionStorage.setItem(`curate-stash:${subject.id}`, JSON.stringify(draft)); }
        catch { /* storage full or blocked — the message still shows */ }
        setSaveError(true);
        return;
      }
      /*
        A HARD navigation, deliberately. See `submitCuration` for the four
        softer attempts that did not move the queue on. `?after=` names the
        recipe just judged, so the next one is the next one whether or not
        anything is cached.

        Batch mode navigates nowhere: the wrapper passed as onSave records the
        verdict and unfolds the next folded recipe itself — state, not URLs.
      */
      if (subject.mode === "queue") window.location.assign(`/curate?after=${subject.id}`);
    });

  // Keys, but never while typing — a "d" in a note must not drop the recipe.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      if (e.key === "k") commit("keep");
      else if (e.key === "d") commit("drop");
      else if (e.key === "s") commit("skip");
      else if (e.key === "a") setD((x) => ({ ...x, make_ahead: !x.make_ahead }));
      /* 1–3 set quality until 2026-08-17; the field left the form (see the
         grid below) and the keys went with it, unbound like 4–8 before them. */
      /* 4–8 used to walk the time bands. Time is no longer collected, so the
         keys are free — deliberately left unbound rather than reassigned, since
         a curator's fingers have learned them. */
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  /* The per-line recipe picker — one line's picker open at a time. */
  const [lineCompOpen, setLineCompOpen] = useState<string | null>(null);
  const [lcQ, setLcQ] = useState("");
  const [lcHits, setLcHits] = useState<Array<{ id: string; title: string; source: string }>>([]);
  const lcTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setLineComponent = (raw: string, r: { id: string; title: string } | null) =>
    setD((x) => {
      const next = { ...x.line_components };
      if (r) next[raw] = r; else delete next[raw];
      // The id rides the components list too — that is what assembly folds.
      const components = r && !x.components.some((c) => c.id === r.id)
        ? [...x.components, r] : x.components;
      return { ...x, line_components: next, components };
    });

  const isOptional = (l: LineView) => d.tiers[l.raw] ?? l.optional;
  const toggleTier = (l: LineView) =>
    set("tiers", { ...d.tiers, [l.raw]: !isOptional(l) });

  /**
   * Mark a line's ingredient as one of the dish's main ingredients.
   *
   * Keyed by NODE ID, never the raw line: a re-parse rewrites lines, and
   * INGREDIENT-SPEC §1 makes the id the only thing that survives a rename or a
   * merge. A line that resolved to nothing cannot be a main ingredient — there
   * is no id to record.
   */
  /**
   * The key a main-ingredient judgement is stored under.
   *
   * A resolved line stores its NODE ID, which is the only thing that survives a
   * rename or a merge (INGREDIENT-SPEC §1). An UNRESOLVED line has no id yet, so
   * it stores `raw:<the line>` and the save resolves it through the correction
   * the curator typed in the same pass — see `submitCuration`.
   *
   * That is the whole point: the commonest reason a line is unresolved is that
   * it is about to be fixed, right here, by the person also deciding whether the
   * dish is OF it. Refusing the judgement until the next run through the queue
   * loses it, because nobody comes back.
   */
  const mainKey = (l: LineView) => l.node ?? `raw:${l.raw}`;

  const toggleMain = (l: LineView) => {
    const key = mainKey(l);
    const cur = d.main_ingredients;
    if (cur.includes(key)) set("main_ingredients", cur.filter((x) => x !== key));
    else set("main_ingredients", [...cur, key].slice(-MAX_MAIN));
  };

  const toggleBad = (raw: string) =>
    set("bad_lines", d.bad_lines.includes(raw)
      ? d.bad_lines.filter((x) => x !== raw)
      : [...d.bad_lines, raw]);

  // Writing the fix IS the flag — a line the curator corrects is a line that
  // parsed wrongly, so don't make them click it as well. Clearing the text
  // un-flags it, unless they had flagged it by hand for some other reason.
  const setLineNote = (raw: string, text: string) => {
    setD((x) => ({
      ...x,
      line_notes: { ...x.line_notes, [raw]: text },
      bad_lines: text.trim()
        ? (x.bad_lines.includes(raw) ? x.bad_lines : [...x.bad_lines, raw])
        : x.bad_lines,
    }));
  };

  /**
   * The ingredient a substitution is recorded against. The node name when we
   * resolved one, else whatever we read, else the line itself — an unresolved
   * line must still be able to carry the curator's substitution.
   */
  const wantedOf = (l: LineView) => l.nodeName || l.head || l.raw;

  /**
   * Substitutes for one line, as ONE text field.
   *
   * Comma separates alternatives; `+` joins a combination. So
   * `"sriracha, egg + ice + flour"` is two ways to replace tempura mix, the
   * second needing all three — which is exactly the OR-of-ANDs the matcher wants
   * (RECIPE-SPEC §3a). Three separate rows would instead claim each works alone,
   * and the recipe would be reported as cookable on the strength of the flour.
   *
   * The text is the single source of truth for the line. Chips write into it
   * rather than into a parallel list, so there is one place a substitution can
   * live and no way for the two to disagree.
   */
  const setSubs = (wanted: string, text: string) => {
    setSubText((t) => ({ ...t, [wanted]: text }));
    setD((x) => ({
      ...x,
      substitutes: [
        ...x.substitutes.filter((s) => s.wanted !== wanted),
        ...text.split(",").map((a) => a.trim()).filter(Boolean)
          // Normalise the combination separator so the promotion step has one
          // shape to split on, whichever way it was typed.
          .map((alt) => ({ wanted, alt: alt.replace(/\s*\+\s*/g, " + ") })),
      ],
    }));
  };

  /** The omitted-ingredients field: one text, comma-separated names. */
  const setAdded = (text: string) => {
    setAddText(text);
    set("added", text.split(",").map((s) => s.trim()).filter(Boolean));
  };

  /** A parser-suggested alternative, toggled into or out of the text field. */
  const toggleSub = (wanted: string, alt: string) => {
    const parts = (subText[wanted] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const at = parts.findIndex((p) => p.toLowerCase() === alt.toLowerCase());
    if (at >= 0) parts.splice(at, 1); else parts.push(alt);
    setSubs(wanted, parts.join(", "));
  };

  return (
    <>
      <Section title={subject.mode === "revisit" ? "Revisit" : "Curate"}
               count={subject.position.done}
               action={
                 <span className="note">
                   {subject.position.done} of {subject.position.total} ·{" "}
                   <a href="/curate/list">all recipes</a>
                   {subject.backHref && <> · <a href={subject.backHref}>← last curated</a></>}
                   {subject.resumeHref && <> · <a href={subject.resumeHref}>resume queue →</a></>}
                 </span>
               }>
        <Panel>
          <p style={{ margin: "0 0 6px", fontWeight: 600 }}>{subject.title}</p>
          <Note>
            {subject.source} ·{" "}
            <a href={subject.url} target="_blank" rel="noreferrer">open the recipe ↗</a>
          </Note>
          {/* Say plainly that a saved call is being overwritten. The keys are the
              same ones the queue uses, so without this the reviewer can bury a
              considered judgement with a reflex keystroke. */}
          {subject.savedAt && (
            <Note>
              already curated <strong>{subject.savedVerdict}</strong> on{" "}
              {subject.savedAt.slice(0, 10)}. Saving replaces that
            </Note>
          )}
          {/* The machine draft's call, plainly labeled as a draft. The fields
              below are already pre-filled from it; this line says what verdict
              it reached and why, so agreeing is one keystroke and disagreeing
              starts from a stated reason instead of a blank. */}
          {subject.suggested && (
            <Note>
              draft: <strong>{subject.suggested.verdict}</strong>
              {subject.suggested.why ? <> — {subject.suggested.why}</> : null}
              {subject.suggested.dispute
                ? <> · cuisine? draft says <strong>{subject.suggested.dispute}</strong></>
                : null}
            </Note>
          )}

          <div className="grid">
            {/*
              No Quality control — the curator's decision, 2026-08-17.

              The verdict already records keep/drop, and 39 of the first 40 rows
              said "good": a field with one answer is a keystroke, not a
              judgement. The Draft still carries the field so a saved row
              round-trips untouched on revisit; fresh drafts leave it empty and
              the save omits it.
            */}
            {/* Chips, not a select: a dish can sit under several cuisines,
                and the click order is the answer's order — the first pick is
                the primary the single-cuisine consumers keep reading. Picking
                any real cuisine clears "unresolved"; "unresolved" clears the
                rest, because it means "no answer", not "also this". */}
            <div className="cur-cuisines" role="group" aria-label="Cuisine">
              <span className="cur-cuisines-label">Cuisine</span>
              {CUISINES.map((c) => {
                const at = d.cuisines.indexOf(c);
                return (
                  <button key={c} type="button"
                          className={at >= 0 ? "flag on" : "flag"}
                          aria-pressed={at >= 0}
                          onClick={() => {
                            if (c === "unresolved") { set("cuisines", ["unresolved"]); return; }
                            const rest = d.cuisines.filter((x) => x !== "unresolved" && x !== c);
                            set("cuisines", at >= 0 ? rest : [...rest, c]);
                          }}>
                    {c}
                    {at === 0 && d.cuisines.length > 1 && <em className="cur-main"> main</em>}
                  </button>
                );
              })}
            </div>
            {/*
              No Dish type control either — same decision, same date.

              Its one consumer, the resolution table's dish-type trigger
              (RESOLUTION-SPEC §3), reads the classifier's proposal, which reads
              the title. Hand-confirming a derivable field on every recipe was
              curation work with no product behaviour behind it.
            */}
            {/*
              No Time control — the curator's decision, 2026-08-09.

              A band depends on who is cooking, so the answer was never a
              property of the recipe. It also cost a judgement on every single
              curation and the product never showed it: `cook_band` reached the
              form, reached the store, and was read by nothing. Make-ahead stays,
              because "needs a head start" is a fact about the dish rather than
              about the cook.
            */}
            <label>Make ahead (A)
              <select value={d.make_ahead ? "yes" : "no"}
                      onChange={(e) => set("make_ahead", e.target.value === "yes")}>
                <option value="no">no: can start now</option>
                <option value="yes">yes: needs a head start</option>
              </select>
            </label>
          </div>
          {/* Equipment the dish cannot be made without — the slow-cooker note
              (CURATION-RULES §5), as chips instead of prose. Untouched means
              "a normal stove kitchen"; that is the common case and costs no
              click. */}
          <div className="cur-cuisines" role="group" aria-label="Equipment">
            <span className="cur-cuisines-label">Needs</span>
            {EQUIPMENT.map((eq) => {
              const on = d.equipment.includes(eq);
              return (
                <button key={eq} type="button" className={on ? "flag on" : "flag"}
                        aria-pressed={on}
                        onClick={() => set("equipment", on
                          ? d.equipment.filter((x) => x !== eq)
                          : [...d.equipment, eq])}>
                  {eq}
                </button>
              );
            })}
          </div>
          {/* Say where the time came from, because the two cases need different
              care from the reviewer: a sourced figure needs a sanity check, an
              absent one needs a judgement from the method below. */}
          <Note>
            {subject.sourceMinutes
              ? `source states ${subject.sourceMinutes} min, banded above; override if it reads low`
              : "no time in the source; estimate it from the method (4 to 8)"}
          </Note>
          {subject.leadReason && (
            <Note>lead time detected from: “{subject.leadReason}”</Note>
          )}

          <label className="wide">Note
            <input value={d.note} placeholder="anything worth remembering"
                   onChange={(e) => set("note", e.target.value)} />
          </label>

          {/* "1 recipe of my chicken stock" — the line names another post,
              and this field records WHICH. The picked recipe's ingredients
              join this one's pantry math (`expandComponents`), and the modal
              links it. Same source first in the suggestions, because that is
              what the convention nearly always means. */}
          <label className="wide">Uses another recipe
            <input value={compQ} placeholder="search recipe titles…"
                   onChange={(e) => {
                     const v = e.target.value;
                     setCompQ(v);
                     if (compTimer.current) clearTimeout(compTimer.current);
                     if (v.trim().length < 2) { setCompHits([]); return; }
                     compTimer.current = setTimeout(() => {
                       void searchRecipes(v).then((rows) =>
                         setCompHits(rows.filter((r) => r.id !== subject.id &&
                           !d.components.some((c) => c.id === r.id))));
                     }, 200);
                   }} />
          </label>
          {compHits.length > 0 && (
            <ul className="hits">
              {compHits.map((r) => (
                <li key={r.id}>
                  <button type="button" className="hit" onClick={() => {
                    set("components", [...d.components, { id: r.id, title: r.title }].slice(0, 5));
                    setCompQ(""); setCompHits([]);
                  }}>
                    <span className="hit-name">{r.title}</span>
                    <span className="hit-count">{r.source}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {d.components.length > 0 && (
            <ChipRow>
              {d.components.map((c) => (
                <Chip key={c.id} label={`${c.title} ✕`} tone="have"
                      title="uses this recipe as an ingredient; tap to remove"
                      onClick={() => set("components",
                        d.components.filter((x) => x.id !== c.id))} />
              ))}
            </ChipRow>
          )}
        </Panel>
      </Section>

      {subject.staleMains.length > 0 && (
        <Note>
          <b>Main ingredient no longer in this recipe:</b>{" "}
          {subject.staleMains.map((m) => m.name || m.id).join(", ")}. The parse
          changed underneath a saved judgement (RECIPE-SPEC §4c). Either it
          regressed, or the source edited the post. It is kept, not dropped:
          re-pick below if the dish still means it, or click the chip to clear it.
        </Note>
      )}
      <Section title="Ingredients" count={subject.lines.length}>
        <Note>
          Click a line that parsed wrongly and type the right answer.
          Click required/optional to correct the tier.
          <br />
          <strong>“or…”</strong> records substitutions the recipe itself offers.
          Comma separates alternatives; <strong>+</strong> joins ones that are
          needed together: <em>sriracha, egg + ice + flour</em> means either
          sriracha, or all three. Clicking a suggested chip types it in for you.
        </Note>
        {subject.lines.map((l) => (
          <div key={l.raw} className="line">
            <button type="button"
                    className={`line-raw ${d.bad_lines.includes(l.raw) ? "line-bad" : ""}`}
                    onClick={() => toggleBad(l.raw)}>
              {l.raw}
            </button>
            {/* Three states, not two. A line we deliberately discarded is settled
                and must not read as a question — see lib/lines.ts. */}
            {/* A node tag opens the ingredient's own editor when the sheet is
                wired — same truth, without leaving the recipe (QC-SPEC §4). */}
            {l.dropped
              ? <span className="tag">not an ingredient · {l.dropped}</span>
              : l.nodeNames.length
                ? l.nodeNames.map((n, ni) => ingredient
                    ? <button key={n} type="button" className="tag tag-have"
                              title={`edit ${n}`} onClick={() => setSheet(n)}>{l.nodeLabels?.[ni] ?? n}</button>
                    : <span key={n} className="tag tag-have">{l.nodeLabels?.[ni] ?? n}</span>)
                : <span className="tag tag-warn">unresolved: {l.head || "none"}</span>}
            {/* Which reader answered. The curator's corrections on these lines
                grade the MODEL, not the rule parser — worth knowing while judging. */}
            {l.llm && <span className="tag" title="read by the extraction overlay, not the rule parser">model read</span>}
            {/* RESOLUTION-SPEC §1: written vs meant, both shown. The tag is
                the current answer with its provenance; the "means…" box below
                is where the curator confirms or overrides it. */}
            {l.resolvedName && l.resolvedName !== l.nodeName && !d.resolutions[l.raw] && (
              <span className="tag" title={`this ${l.nodeName} means ${l.resolvedName} here (${l.resolutionTier})`}>
                → {l.resolvedName} · {l.resolutionTier}
              </span>
            )}
            {/* Required vs optional is a property of the LINE in this recipe,
                not of the ingredient — sesame seeds are essential in one dish
                and a garnish in the next. */}
            <button type="button" className="tier"
                    onClick={() => toggleTier(l)}
                    title="required or optional in this recipe">
              {isOptional(l) ? "optional" : "required"}
            </button>
            {/*
              RECIPE-SPEC §4c, and now offered on UNRESOLVED lines too.

              It used to require `l.node`, on the reasoning that a main
              ingredient is stored as an id and an unresolved line has none. True
              of the storage, wrong about the moment: the commonest reason a line
              has not resolved is that it is about to be fixed, in this pass, by
              the same person deciding whether the dish is OF it. Refusing the
              judgement until the line resolves loses it, because nobody comes
              back to a recipe they have already curated.

              The save resolves `raw:` keys through the correction typed beside
              them, so marking it and fixing it in one pass is one action.
            */}
            <button type="button"
                    className={`tier ${d.main_ingredients.includes(mainKey(l)) ? "tier-main" : ""}`}
                    onClick={() => toggleMain(l)}
                    title={l.node
                      ? "is the dish OF this ingredient? at most two"
                      : "is the dish OF this ingredient? write the correction and it will resolve on save"}>
              {d.main_ingredients.includes(mainKey(l))
                ? `main${d.main_ingredients.length > 1
                    ? ` ${d.main_ingredients.indexOf(mainKey(l)) + 1}` : ""}`
                : "· main?"}
            </button>
            {l.alts.length > 1 && (
              <ChipRow>
                {l.alts.slice(1).map((a) => (
                  <Chip key={a} label={`or ${a}`}
                        tone={d.substitutes.some((s) => s.wanted === wantedOf(l) && s.alt === a)
                              ? "want" : "plain"}
                        onClick={() => toggleSub(wantedOf(l), a)} />
                ))}
              </ChipRow>
            )}
            {/* Substitutes, typed. Chips cover only what the parser found, and it
                cannot find a combination at all — so this is the only way to
                record "egg + ice + flour". */}
            {!l.dropped && (
              <SuggestInput className="line-note line-sub" search={search}
                     value={subText[wantedOf(l)] ?? ""}
                     placeholder="or… (a + b = both)"
                     ariaLabel={`substitutes for ${wantedOf(l)}`}
                     onEdit={editHit}
                     onChange={(v) => setSubs(wantedOf(l), v)} />
            )}
            {/* The fix, written where the mistake is visible. */}
            <SuggestInput className="line-note" search={search} value={d.line_notes[l.raw] ?? ""}
                   placeholder="should be…" ariaLabel={`correction for ${l.raw}`}
                   onEdit={editHit}
                   onChange={(v) => setLineNote(l.raw, v)} />
            {/* "This line IS another recipe" — 4 Tonkatsu (Pork Cutlets) names
                the tonkatsu recipe, not an ingredient. Picking one links the
                component and stops the line counting as an ingredient hole. */}
            {!l.dropped && (d.line_components[l.raw]
              ? <span className="tag">
                  ↷ {d.line_components[l.raw]!.title}
                  <button type="button" aria-label="unlink recipe" className="chip-x"
                          onClick={() => setLineComponent(l.raw, null)}> ×</button>
                </span>
              : lineCompOpen === l.raw
                ? <span className="line-note">
                    <input autoFocus value={lcQ} placeholder="which recipe is this line?"
                           aria-label={`recipe for ${l.raw}`}
                           onChange={(e) => {
                             const v = e.target.value;
                             setLcQ(v);
                             if (lcTimer.current) clearTimeout(lcTimer.current);
                             if (v.trim().length < 2) { setLcHits([]); return; }
                             lcTimer.current = setTimeout(() => {
                               void searchRecipes(v).then((rows) =>
                                 setLcHits(rows.filter((r) => r.id !== subject.id)));
                             }, 200);
                           }} />
                    {lcHits.length > 0 && (
                      <ul className="hits">
                        {lcHits.map((r) => (
                          <li key={r.id}>
                            <button type="button" className="hit" onClick={() => {
                              setLineComponent(l.raw, { id: r.id, title: r.title });
                              setLineCompOpen(null); setLcQ(""); setLcHits([]);
                            }}>
                              <span className="hit-name">{r.title}</span>
                              <span className="hit-count">{r.source}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </span>
                : <button type="button" className="tier"
                          title="this line is another recipe, not an ingredient"
                          onClick={() => { setLineCompOpen(l.raw); setLcQ(""); setLcHits([]); }}>
                    ↷ recipe…</button>)}
            {/*
              The variant this mention MEANS here — RESOLUTION-SPEC §1.

              Distinct from "should be…", which corrects a PARSE: the parse is
              right ("soy sauce" is soy sauce), and this answers the next
              question — which sibling the cuisine means (soup soy sauce, in a
              guk). Only on single-node lines, because every table term is one
              mention; a curated answer outranks the table's default and is
              stored per recipe, never propagated.
            */}
            {!l.dropped && l.nodeNames.length === 1 && (
              <SuggestInput className="line-note line-res" search={search}
                     value={d.resolutions[l.raw] ?? ""}
                     placeholder={l.resolvedName && l.resolvedName !== l.nodeName
                       ? `means… (default: ${l.resolvedName})` : "means… (this cuisine's variant)"}
                     ariaLabel={`resolved variant for ${l.raw}`}
                     onEdit={editHit}
                     onChange={(v) => set("resolutions", { ...d.resolutions, [l.raw]: v })} />
            )}
          </div>
        ))}
        {/*
          What the source FORGOT to list — the method salts the soup, the
          ingredient list never mentions salt (the curator's ask, 2026-08-20).
          Every control above hangs off a raw line, so a recipe with a hole in
          its list had no place to say so. Names, comma-separated like the
          substitutes field; the save resolves them to ids and the recipe's
          `requires` picks them up at both the app and the pipeline.
        */}
        <div className="line">
          <SuggestInput className="line-note" search={search}
                 value={addText}
                 placeholder="add ingredient the recipe omitted… (a, b)"
                 ariaLabel="ingredients the recipe omitted"
                 onEdit={editHit}
                 onChange={setAdded} />
        </div>
      </Section>

      {/* The method, so quality and lead time can be judged without leaving the
          page. Fetched on demand and never stored — see lib/source.ts. */}
      <Section title="Method" count={subject.method.length}>
        {subject.sourceError
          ? <Note>could not load the source ({subject.sourceError}). Use the link above</Note>
          : <>
              {subject.notes && <Note>{subject.notes}</Note>}
              <ol className="method">
                {subject.method.map((step, i) => <li key={i}>{step}</li>)}
              </ol>
            </>}
      </Section>

      <div className="widget">
        <div className="widget-inner">
          {/* Reason chips surface on demand: pressing Drop with none picked
              asks once, inline, and the chip press is the answer. */}
          {(needReason || d.drop_reason) && (
            <ChipRow>
              {DROP_REASONS.map((reason) => (
                <Chip key={reason} label={reason}
                      tone={d.drop_reason === reason ? "want" : "plain"}
                      title="why this recipe is dropped"
                      onClick={() => {
                        const next = d.drop_reason === reason ? "" : reason;
                        set("drop_reason", next);
                        /* Drop was already pressed — the chip IS the second
                           press (curator's ask, 2026-08-20). Un-picking never
                           commits. */
                        if (needReason && next) commit("drop", { drop_reason: next });
                      }} />
              ))}
              {needReason && !d.drop_reason &&
                <span className="note">a drop needs a reason: pick one</span>}
            </ChipRow>
          )}
          {saveError && <Note>Not saved. Reload the page. Your work is kept.</Note>}
          <Button kind="primary" disabled={pending} onClick={() => commit("keep")}>Keep (K)</Button>{" "}
          <Button disabled={pending} onClick={() => commit("drop")}>Drop (D)</Button>{" "}
          <Button kind="quiet" disabled={pending} onClick={() => commit("skip")}>Skip (S)</Button>
          {/*
            Move on WITHOUT judging — the thing that was missing.

            Keep, Drop and Skip all record a verdict, so a curator who wanted to
            see the next recipe had to file something about this one. Skip is a
            judgement ("I looked and I am not deciding"); this is not one, and
            the recipe stays at the head of the queue for whoever comes next.
          */}
          {subject.mode === "queue" && (
            <>
              {" "}
              <a className="btn btn-quiet" href={`/curate?after=${subject.id}`}>Next →</a>
            </>
          )}
          {subject.mode === "batch" && onAdvance && (
            <>
              {" "}
              <Button kind="quiet" onClick={onAdvance}>Next →</Button>
            </>
          )}
          <span className="note"> · A make-ahead</span>
        </div>
      </div>

      {/* The sideways door, open. Edits recorded inside bust the server's
          ontology cache, so this recipe's next autosuggest keystroke already
          sees them — QC-SPEC §3's "reflected right away". */}
      {sheet && ingredient && (
        <IngredientSheet idOrName={sheet} actions={ingredient}
                         onClose={() => setSheet(null)} />
      )}
    </>
  );
}
