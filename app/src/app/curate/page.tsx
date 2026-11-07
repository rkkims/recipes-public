/**
 * The curation queue.
 *
 * Server component: picks recipes, assembles every guess the pipeline can offer,
 * and hands them to the client. Ordering is completeness first, creators
 * rotating within a band (`queueMix`) — the reviewer's stated working order,
 * not a property of the data.
 *
 * Two modes, one screen:
 *
 *   - **queue** (no `?id`) — a BATCH of the next uncurated recipes on one page,
 *     one unfolded at a time (`CurateBatch`, the curator's ask of 2026-08-17:
 *     no more one page per recipe). The daily loop
 *   - **revisit** (`?id=rec_…`) — a named recipe, curated or not, with the saved
 *     judgement pre-filled instead of the pipeline's guesses
 *
 * Revisiting is not a nicety. A reviewer who cannot correct yesterday's call has
 * to be right first time, and the whole design of this screen assumes the
 * opposite: decide fast, because it is cheap to fix.
 */
import { Page, Note } from "@/components/primitives";
import { Curate, type Draft, type Subject } from "@/components/Curate";
import { CurateBatch } from "@/components/CurateBatch";
import { classProposals, displayOf, idForName, load, mainProposals, nameOf, resolveId, search as searchIngredients } from "@/lib/data";
import { linesFor } from "@/lib/lines";
import { times, type Times } from "@/lib/enriched";
import { sourceText } from "@/lib/source";
import { allAgentDrafts, allCurations, queueCost, queueMix, queueable,
  type AgentDraft, type Curation, staleMains } from "@/lib/curation";
import { submitCuration, submitAndReturn } from "./actions";
import { aliasDrop, aliasSet, edgeAdd, edgeRemove, fixLine, glossSet, mergeNode, openIngredient, promoteAlias, removeNode, renameNode, suggest }
  from "./ingredients/[id]/actions";
import { isRealWait } from "@/lib/waiting";
import { needsFermentCall } from "@/lib/waiting";

export const dynamic = "force-dynamic";

/**
 * How many recipes one page carries. The cost of a bigger number is real —
 * every subject fetches its source live (`sourceText`) — and the benefit
 * flattens fast: the point of the batch is staying on one page through a
 * sitting, not holding the whole corpus.
 */
const BATCH = 10;

/**
 * What the source claimed, prep and cook together: `totalMinutes` when it gives
 * one, otherwise the sum of the parts. `undefined` — not 0 — when it gives
 * nothing, so "no time stated" stays distinguishable from "instant".
 */
function sourceMinutes(t: Times): number | undefined {
  if (t.totalMinutes) return t.totalMinutes;
  const sum = (t.prepMinutes ?? 0) + (t.cookMinutes ?? 0);
  return sum > 0 ? sum : undefined;
}

/**
 * A saved row, back into form state.
 *
 * Every field falls back to the same guess the queue would have offered, so a
 * partially-filled old row is completed rather than blanked — including rows
 * written before a field existed. Quality and dish type left the FORM on
 * 2026-08-17 but not the round-trip: a saved value survives a revisit exactly
 * because it is carried here and the save writes it back when present.
 */
function savedDraft(c: Curation, fresh: Draft): Draft {
  return {
    recipe_id: c.recipe_id,
    drop_reason: c.drop_reason ?? "",
    equipment: c.equipment ?? [],
    quality: c.quality ?? "",
    cuisines: c.cuisines ?? (c.cuisine ? [c.cuisine] : fresh.cuisines),
    dish_type: c.dish_type ?? "",
    make_ahead: c.make_ahead ?? fresh.make_ahead,
    note: c.note ?? "",
    substitutes: c.substitutes ?? [],
    bad_lines: c.bad_lines ?? [],
    line_notes: Object.fromEntries((c.line_notes ?? []).map((l) => [l.raw, l.note])),
    tiers: Object.fromEntries((c.tier_overrides ?? []).map((t) => [t.raw, t.optional])),
    main_ingredients: c.main_ingredients ?? [],
    // Saved ids back to the names the form edits in — same trip as everything
    // else here; a stale id (a node that left the ontology) drops out.
    resolutions: Object.fromEntries((c.resolutions ?? [])
      .map((r) => [r.raw, nameOf(r.to)])
      .filter(([, name]) => !!name)),
    // Ids back to names through the redirect map, so a merge since the save
    // shows the surviving name; an id we no longer hold at all drops out
    // (`nameOf` echoes unknown ids, so the round-trip check catches them).
    added: (c.added_ingredients ?? [])
      .map((aid) => nameOf(resolveId(aid)))
      .filter((n) => !!idForName(n)),
    // Titles resolved by the caller, which has the corpus in hand.
    components: fresh.components,
    line_components: fresh.line_components,
  };
}

/**
 * The ontology's own vocabulary, for the curation form's free-text fields.
 *
 * The same `search` every other surface uses, so a curator is offered exactly
 * the names the matcher will later look for.
 */
async function searchAction(q: string) {
  "use server";
  return searchIngredients(q).map((i) => ({
    id: i.id, name: i.name, recipes: i.recipes, via: i.via,
  }));
}

/**
 * Recipe titles for the component picker, the CALLING recipe's source first —
 * "1 recipe of my chicken stock" names a sibling post on the same blog almost
 * every time. The source is a parameter now that one page holds several
 * recipes: the batch binds it per row, the revisit page binds it once.
 */
async function searchRecipesAction(source: string, q: string):
  Promise<Array<{ id: string; title: string; source: string }>> {
  "use server";
  /* Punctuation-folded on BOTH sides: hirokoliston titles carry decorative
     quotes ("'Nametake' Enoki"), and a plain substring test cannot cross
     them — typing the phrase found nothing (curator report, 2026-08-21). */
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const term = norm(q);
  if (term.length < 2) return [];
  const all = load().allRecipes.filter((x) => norm(x.title).includes(term));
  return [...all.filter((x) => x.source === source),
          ...all.filter((x) => x.source !== source)]
    .slice(0, 8)
    .map((x) => ({ id: x.id, title: x.title, source: x.source }));
}

export default async function CuratePage(
  { searchParams }: { searchParams: Promise<{ id?: string; after?: string; focus?: string }> },
) {
  const { id, after, focus } = await searchParams;
  // The queue's whole job is the ungated corpus.
  const { allRecipes: recipes } = load();
  const done = allCurations();
  /**
   * `?after=` — the queue, past a recipe you are done looking at.
   *
   * Inside a batch, "move on without judging" is the fold itself. This
   * parameter survives for the boundary case — the recipe at the head of a
   * FRESH batch you never want to see again — and for old links.
   * Exactly one recipe is skipped, never a range.
   */
  /**
   * `?focus=ferment` — the queue, narrowed to one question.
   *
   * Source order is right for working through the corpus and useless for
   * working through a QUESTION. The long ferments are a question: recipes where
   * the automatic rule cannot decide and a human can, in seconds each, because
   * the answer is usually plain from the title. See `needsFermentCall`.
   *
   * A filter rather than a separate screen: everything else here — the form,
   * the keys, the save — already works, and a second queue would be a second
   * thing to keep in step with the first.
   */
  const focused = focus === "ferment";
  // The sourcing rule (`queueable`): Asian cuisines from curator-validated
  // sources only. The classifier's cuisine covers the untagged rows.
  const proposals = classProposals();
  const inQueue = (r: (typeof recipes)[number]) => queueable(r, proposals[r.id]?.cuisine);
  /**
   * Completeness first — the curator's ask (2026-08-17) — then creators
   * rotating within a band (2026-08-18). The policy and its reasons live with
   * `queueCost` and `queueMix`; this is only the wiring.
   */
  const queue = queueMix(
    recipes
      .filter((r) => !done[r.id] && r.id !== after)
      .filter((r) => !focused || needsFermentCall(r))
      .filter(inQueue),
    queueCost,
    // Innermost: fewest ingredients first (curator, 2026-08-20) — the
    // fastest judgeable recipe of each creator leads every round.
    (r) => r.requires.length,
  );
  const total = focused ? recipes.filter(needsFermentCall).length
    : recipes.filter(inQueue).length;

  // An explicit id wins over the queue — that is the whole point of revisiting,
  // and it must work for uncurated recipes too so the list can link every row.
  const single = id ? recipes.find((x) => x.id === id) : undefined;

  if (id && !single) {
    return (
      <Page>
        <Note>
          No recipe with id {id}. <a href="/curate/list">all recipes →</a>
        </Note>
      </Page>
    );
  }
  if (!id && queue.length === 0) {
    return (
      <Page>
        <Note>
          Everything curated: {Object.keys(done).length} of {total}.
          {" "}<a href="/curate/list">all recipes →</a>
        </Note>
      </Page>
    );
  }

  const pencil = allAgentDrafts();

  /**
   * A fresh form, pre-filled from the machine draft (CURATION-RULES §1).
   *
   * Field by field, never a spread: quality and dish_type stay out — they have
   * no on-screen control, so a pre-fill would save machine output disguised as
   * a judgment — and a field the draft omits keeps the pipeline's guess rather
   * than being blanked. The draft's verdict travels separately as `suggested`:
   * shown beside the title, never a pressed button.
   */
  function draftedDraft(a: AgentDraft, fresh: Draft): Draft {
    return {
      ...fresh,
      drop_reason: a.drop_reason ?? fresh.drop_reason,
      cuisines: a.cuisines ?? (a.cuisine ? [a.cuisine] : fresh.cuisines),
      make_ahead: a.make_ahead ?? fresh.make_ahead,
      note: a.note ?? fresh.note,
      substitutes: a.substitutes ?? fresh.substitutes,
      bad_lines: a.bad_lines ?? fresh.bad_lines,
      line_notes: a.line_notes
        ? Object.fromEntries(a.line_notes.map((l) => [l.raw, l.note]))
        : fresh.line_notes,
      tiers: a.tier_overrides
        ? Object.fromEntries(a.tier_overrides.map((t) => [t.raw, t.optional]))
        : fresh.tiers,
      main_ingredients: a.main_ingredients?.length
        ? a.main_ingredients.slice(0, 2)
        : fresh.main_ingredients,
      components: a.components?.length
        ? a.components
            .map((cid) => recipes.find((x) => x.id === cid))
            .filter((x): x is NonNullable<typeof x> => !!x)
            .map((x) => ({ id: x.id, title: x.title }))
        : fresh.components,
      /* Drafted per-line recipe links, same id→title trip as the saved path —
         a pre-fill the curator confirms with the verdict, never a judgment. */
      line_components: a.line_components?.length
        ? Object.fromEntries(a.line_components
            .map((lc) => [lc.raw, recipes.find((x) => x.id === lc.recipe_id)] as const)
            .filter((e): e is [string, NonNullable<(typeof recipes)[number]>] => !!e[1])
            .map(([raw, r]) => [raw, { id: r.id, title: r.title }]))
        : fresh.line_components,
    };
  }

  /** One recipe, assembled into everything the form needs. */
  async function subjectFor(r: NonNullable<typeof single>, mode: Subject["mode"]):
    Promise<Subject> {
    const saved = done[r.id] ?? null;
    const drafted_by_agent = pencil[r.id];
    const t = times().get(r.url) ?? {};
    // Fetched live, never stored — see src/lib/source.ts on why that is within
    // RECIPE-SPEC §1. It replaces opening a tab, which is what the curator was
    // doing anyway.
    const src = await sourceText(r.url);
    const lines = linesFor(r.id).map((l) => {
      /* LIVE RE-RESOLUTION, line view — the recipe's `requires` already
         re-resolves against the overlaid vocabulary (lib/data `load()`), but
         this display read the static lines file and kept showing "unresolved"
         for a surface the curator had just aliased. Same lookup, same rule:
         a head that now names a node renders resolved. */
      const live = !l.node && !l.nodes?.length && !l.dropped && l.head
        ? idForName(l.head) : undefined;
      const nodes = l.nodes?.length ? l.nodes : live ? [live] : [];
      return {
      ...l,
      node: l.node ?? live ?? null,
      nodes,
      nodeName: (l.node ?? live) ? nameOf((l.node ?? live)!) : "",
      nodeNames: nodes.map(nameOf),
      /* Display-only: "korean red pepper paste - gochujang". The canonical
         names above keep feeding saves and the sheet; these feed eyes. */
      nodeLabels: nodes.map(displayOf),
      // The resolution stamp, as names — the pre-fill the curator confirms
      // or overrides (RESOLUTION-SPEC §1).
      ...(l.resolved ? { resolvedName: nameOf(l.resolved), resolutionTier: l.resolution } : {}),
      // A dropped line is still shown — the curator should be able to see we
      // made the call, and disagree with it — but it is styled as settled, not
      // asked.
      ...(l.dropped ? { dropped: l.dropped } : {}),
      };
    });

    /**
     * The drafted classification, if `npm run classify` has reached this recipe.
     *
     * It outranks the older per-field guesses below because it is the only one
     * that read the TITLE. `r.cuisine` comes from the site's own tag and calls a
     * Korean blogger's tiramisu Korean. It stays as the fallback for the recipes
     * classify has not reached — a partial pass must not blank the fields it did
     * not touch.
     */
    const drafted = classProposals()[r.id];

    // Every field pre-filled with the best guess we have (DECISIONS §5).
    const fresh: Draft = {
      recipe_id: r.id,
      drop_reason: "",
      equipment: [],
      /*
        Quality and dish type left the form on 2026-08-17 (see Curate.tsx for
        the reasoning). Fresh drafts no longer carry a guess for either — with
        no control on screen to correct it, a pre-fill would write
        machine output into the curation file disguised as a human judgement,
        and that file is the parser's test set. The classifier's dish_type
        stays in its own proposals file, where the resolution table reads it.
      */
      quality: "",
      cuisines: [drafted?.cuisine || r.cuisine || "unresolved"],
      dish_type: "",
      /*
        Pre-filled from the derived lead time, through the SAME rule the grid
        uses — see `isRealWait`.

        It used to be a bare `leadMinutes >= 60`, which is where 166 recipes went
        wrong: the enrichment pass reads any duration near the end of a method as
        lead time, so "refrigerator for up to 3 days" and "keeps a week" arrived
        as waits. The form would then suggest "needs a head start" for precisely
        the recipes the grid had already judged to be storage advice — and a
        curated answer overrules the grid permanently, so the wrong default would
        have been confirmed into the data one keypress at a time.

        A default that argues with the product is worse than no default.
        The curator still overrules either way, with one key.
      */
      make_ahead: drafted ? drafted.make_ahead : isRealWait(t),
      note: "",
      substitutes: [],
      added: [],
      bad_lines: [],
      line_notes: {},
      tiers: {},
      resolutions: {},
      // Pre-filled from the proposer (RECIPE-SPEC §4c), never locked: the
      // curator corrects a guess rather than facing a blank field, and one
      // click on the chip removes a wrong one.
      main_ingredients: (drafted?.main_ingredients?.length
        ? drafted.main_ingredients
        : mainProposals()[r.id]?.ids ?? []).slice(0, 2),
      /* Saved components resolve to id+title here, where the corpus is in
         hand — a stale id (a component that left the index) drops out rather
         than rendering as a blank chip. Fresh rows start empty; nothing
         proposes components, a human names them. */
      components: (saved?.components ?? [])
        .map((cid) => recipes.find((x) => x.id === cid))
        .filter((x): x is NonNullable<typeof x> => !!x)
        .map((x) => ({ id: x.id, title: x.title })),
      /* Same trip for the per-line recipe links — a stale id drops out. */
      line_components: Object.fromEntries((saved?.line_components ?? [])
        .map((lc) => [lc.raw, recipes.find((x) => x.id === lc.recipe_id)] as const)
        .filter((e): e is [string, NonNullable<(typeof recipes)[number]>] => !!e[1])
        .map(([raw, r]) => [raw, { id: r.id, title: r.title }])),
    };

    return {
      id: r.id, title: r.title, url: r.url, source: r.source, image: "",
      lines,
      leadReason: t.leadReason,
      sourceMinutes: sourceMinutes(t),
      method: src.instructions,
      notes: src.notes,
      sourceError: src.error,
      position: { done: Object.keys(done).length, total },
      mode,
      savedAt: saved?.curated_at,
      savedVerdict: saved?.verdict,
      resumeHref: mode === "revisit" && queue[0] ? "/curate" : undefined,
      draft: saved ? savedDraft(saved, fresh)
        : drafted_by_agent ? draftedDraft(drafted_by_agent, fresh)
        : fresh,
      /* Only while uncurated — once a human has judged, the machine's
         suggestion is noise beside their answer. */
      suggested: !saved && drafted_by_agent ? {
        verdict: drafted_by_agent.verdict,
        why: drafted_by_agent.draft_why,
        dispute: drafted_by_agent.cuisine_dispute,
      } : undefined,
      // §4c: a saved main that has fallen out of `requires` is a flag for a
      // human, never a silent deletion.
      staleMains: staleMains(saved, r.requires).map((mid) => ({ id: mid, name: nameOf(mid) })),
    };
  }

  /* The ingredient sheet's server half — QC-SPEC §4's sideways door, wired
     into both modes. Each property is a server action reference. */
  const ingredientActions = {
    open: openIngredient, rename: renameNode, gloss: glossSet, remove: removeNode,
    aliasSet, aliasDrop, promoteAlias, mergeNode, fixLine, edgeAdd, edgeRemove, suggest,
  };

  if (single) {
    return (
      <Page>
        {/* Saving a revisit returns to the list — same form, one recipe. */}
        <Curate subject={await subjectFor(single, "revisit")} onSave={submitAndReturn}
                ingredient={ingredientActions}
                search={searchAction}
                searchRecipes={searchRecipesAction.bind(null, single.source)} />
      </Page>
    );
  }

  // The batch: assembled in parallel because each subject fetches its source.
  const subjects = await Promise.all(
    queue.slice(0, BATCH).map((r) => subjectFor(r, "batch")));

  return (
    <Page>
      <CurateBatch subjects={subjects}
                   done={Object.keys(done).length} total={total}
                   onSave={submitCuration}
                   ingredient={ingredientActions}
                   search={searchAction} searchRecipes={searchRecipesAction} />
    </Page>
  );
}
