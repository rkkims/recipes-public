/**
 * The curation ledger — everything judged, and what is coming next.
 *
 * Exists so a decision is never final by accident. The queue screen is designed
 * for speed, which only works if the reviewer knows they can come back; this is
 * where they come back to.
 *
 * Three views, one page:
 *
 *   - **curated** — every saved judgement, most recently touched first. Small and
 *     growing slowly, so it is shown in full
 *   - **coming up** — the next slice of the queue. Capped, because the corpus is
 *     ~4,900 recipes and a full dump is neither renderable nor readable
 *   - **search** (`?q=`) — the whole corpus by title or source, for finding one
 *     specific recipe. The only way to reach a pending recipe that is not near the
 *     front of the queue
 */
import { Page, Note, Section, Empty } from "@/components/primitives";
import { load } from "@/lib/data";
import { allAgentDrafts, allCurations, queueCost, queueMix,
  type AgentDraft, type Curation, staleMains } from "@/lib/curation";

export const dynamic = "force-dynamic";

/** How much of the queue to show unasked. Enough to plan a session, not a scroll. */
const UPCOMING = 30;
/** Search results cap. A query matching thousands is a query to narrow, not render. */
const MAX_HITS = 100;
/** Page size for browsing the drafted keeps — the review docs chunk at 250, and
    matching it means "page 3 here" and "chunk 3 on disk" name the same recipes. */
const KEEPS_PAGE = 250;

type Row = { id: string; title: string; source: string; url: string; requires: string[] };

function Rows({ rows, curations, drafts }: {
  rows: Row[]; curations: Record<string, Curation>; drafts: Record<string, AgentDraft>;
}) {
  return (
    <div className="ledger">
      {rows.map((r) => {
        const c = curations[r.id];
        const d = drafts[r.id];
        return (
          <div key={r.id} className="ledger-row">
            <a className="ledger-title" href={`/curate?id=${r.id}`}>{r.title}</a>
            <span className="ledger-source">{r.source}</span>
            {c
              ? <>
                  <span className={`tag ${c.verdict === "keep" ? "tag-have"
                                       : c.verdict === "drop" ? "tag-missing" : "tag-warn"}`}>
                    {c.verdict}
                  </span>
                  {c.quality && <span className="tag">{c.quality}</span>}
                  {c.dish_type && <span className="tag">{c.dish_type}</span>}
                  {/* Banded, never minutes — RECIPE-SPEC §4a. */}
                  {c.make_ahead && <span className="tag tag-urgent">make ahead</span>}
                  {c.bad_lines?.length
                    ? <span className="tag tag-warn">{c.bad_lines.length} bad line{c.bad_lines.length > 1 ? "s" : ""}</span>
                    : null}
                  {/* RECIPE-SPEC §4c — a saved main ingredient the recipe no
                      longer requires. Findable from the ledger so it does not
                      wait for someone to reopen the recipe by chance. */}
                  {staleMains(c, r.requires).length
                    ? <span className="tag tag-warn">main ingredient gone</span>
                    : null}
                  <span className="ledger-when">{c.curated_at.slice(0, 10)}</span>
                </>
              : d
                ? <>
                    {/* The machine draft's call, labeled as a draft; the one-line
                        reason rides the hover so the row stays a row. Clicking
                        through opens the form pre-filled (CURATION-RULES §1). */}
                    <span title={d.draft_why}
                          className={`tag ${d.verdict === "keep" ? "tag-have"
                                         : d.verdict === "drop" ? "tag-missing" : "tag-warn"}`}>
                      draft: {d.verdict}{d.verdict === "drop" && d.drop_reason ? ` (${d.drop_reason})` : ""}
                    </span>
                    {d.cuisine_dispute && <span className="tag tag-warn">cuisine? {d.cuisine_dispute}</span>}
                    {d.bad_lines?.length
                      ? <span className="tag tag-warn">{d.bad_lines.length} bad line{d.bad_lines.length > 1 ? "s" : ""}</span>
                      : null}
                  </>
                : <span className="tag">pending</span>}
            <a className="ledger-src" href={r.url} target="_blank" rel="noreferrer">source ↗</a>
          </div>
        );
      })}
    </div>
  );
}

export default async function ListPage(
  { searchParams }: { searchParams: Promise<{ q?: string; keeps?: string }> },
) {
  const { q, keeps } = await searchParams;
  // The list's whole job is the ungated corpus.
  const { allRecipes: recipes } = load();
  const curations = allCurations();
  const drafts = allAgentDrafts();
  const query = (q ?? "").trim().toLowerCase();

  /**
   * The draft exceptions — where the machine's judgment most needs a human.
   *
   * Uncurated only: once the curator saves, the question is answered and the
   * row leaves the section, so these lists empty themselves as the exceptions
   * get settled. The same groups lead `data/curation/drafts-review.md`; this
   * is that reading list, in the tool, one click from the pre-filled form.
   */
  const exception = (test: (d: AgentDraft) => boolean) =>
    recipes.filter((r) => !curations[r.id] && drafts[r.id] && test(drafts[r.id]!));
  const draftDrops = exception((d) => d.verdict === "drop");
  const draftDisputes = exception((d) => !!d.cuisine_dispute);
  const draftSkips = exception((d) => d.verdict === "skip");

  /**
   * The passed ones — every pending recipe the draft says to keep, undisputed.
   * The bulk of the corpus, so it renders only when asked (`?keeps=N`), a page
   * at a time, in queue order: page N here holds the same recipes as review
   * chunk N on disk, so the offline doc and this list stay one numbering.
   */
  const draftKeeps = queueMix(
    recipes.filter((r) =>
      !curations[r.id] && drafts[r.id]?.verdict === "keep" && !drafts[r.id]?.cuisine_dispute),
    queueCost);
  const keepsPage = keeps ? Math.max(1, parseInt(keeps, 10) || 1) : 0;
  const keepsPages = Math.ceil(draftKeeps.length / KEEPS_PAGE);

  const curated = recipes
    .filter((r) => curations[r.id])
    .sort((a, b) =>
      curations[b.id]!.curated_at.localeCompare(curations[a.id]!.curated_at));
  /* The KPI the sitting is for (curator ask, 2026-08-21): human keeps, not
     drafts — the number of recipes actually earning a place in the product. */
  const kept = curated.filter((r) => curations[r.id]!.verdict === "keep").length;
  // Same order the queue will serve them in, so the list is an honest preview.
  // Mirrors the queue's order, innermost criterion included — the list must
  // show the same "next" the queue will serve.
  const pending = queueMix(recipes.filter((r) => !curations[r.id]), queueCost,
    (r) => r.requires.length);

  const hits = query
    ? recipes.filter((r) =>
        r.title.toLowerCase().includes(query) || r.source.toLowerCase().includes(query))
    : [];

  return (
    <Page>
      <Section title="Curation" count={curated.length}
               action={<span className="note"><a href="/curate/tree">ontology tree</a>{" · "}<a href="/curate">back to the queue →</a></span>}>
        <Note>
          <strong>{kept} kept</strong> · {curated.length} of {recipes.length} judged
          · {pending.length} to go.
          Click any title to open it. A curated recipe loads with its saved
          judgement and saving replaces it.
        </Note>
        {/* Plain GET form: no client JS, and the query stays in the URL so a
            search is linkable and survives a reload. */}
        <form className="search" method="get" action="/curate/list">
          <input name="q" defaultValue={q ?? ""} placeholder="find a recipe by title or source" />
          <button className="btn btn-plain" type="submit">Search</button>
        </form>
      </Section>

      {query && (
        <Section title={`Matches for “${q}”`} count={hits.length}>
          {hits.length === 0
            ? <Empty>Nothing matches. Try a shorter query.</Empty>
            : <>
                {hits.length > MAX_HITS && (
                  <Note>showing the first {MAX_HITS} of {hits.length}; narrow the query to see the rest</Note>
                )}
                <Rows rows={hits.slice(0, MAX_HITS)} curations={curations} drafts={drafts} />
              </>}
        </Section>
      )}

      {draftDrops.length > 0 && (
        <Section title="Drafted drops" count={draftDrops.length}>
          <Note>
            recipes the draft says not to keep, each with its reason. Open one to
            confirm or overrule; a saved judgement removes it from this list
          </Note>
          <Rows rows={draftDrops} curations={curations} drafts={drafts} />
        </Section>
      )}

      {draftDisputes.length > 0 && (
        <Section title="Cuisine disputes" count={draftDisputes.length}>
          <Note>
            kept by the draft, but flagged as possibly outside the queue&rsquo;s
            cuisines — the out-of-scope call is yours
          </Note>
          <Rows rows={draftDisputes} curations={curations} drafts={drafts} />
        </Section>
      )}

      {draftSkips.length > 0 && (
        <Section title="Drafted skips" count={draftSkips.length}>
          <Note>
            nothing parsed yet — parser backlog, not judgments
          </Note>
          <Rows rows={draftSkips} curations={curations} drafts={drafts} />
        </Section>
      )}

      <Section title="Drafted keeps" count={draftKeeps.length}
               action={keepsPage === 0 && draftKeeps.length > 0
                 ? <span className="note"><a href="/curate/list?keeps=1">browse →</a></span>
                 : undefined}>
        {keepsPage === 0
          ? <Note>
              the passed ones — everything the draft says to keep, no questions
              attached. They arrive pre-filled as you work the queue; browse to
              scan them as a list instead
            </Note>
          : <>
              <Note>
                page {keepsPage} of {keepsPages}, queue order — same recipes as
                review chunk {keepsPage} on disk.
                {keepsPage > 1 && <>{" "}<a href={`/curate/list?keeps=${keepsPage - 1}`}>← previous</a></>}
                {keepsPage < keepsPages && <>{" "}<a href={`/curate/list?keeps=${keepsPage + 1}`}>next →</a></>}
              </Note>
              <Rows rows={draftKeeps.slice((keepsPage - 1) * KEEPS_PAGE, keepsPage * KEEPS_PAGE)}
                    curations={curations} drafts={drafts} />
            </>}
      </Section>

      <Section title="Curated" count={curated.length}>
        {curated.length === 0
          ? <Empty>Nothing curated yet.</Empty>
          : <Rows rows={curated} curations={curations} drafts={drafts} />}
      </Section>

      <Section title="Coming up" count={pending.length}>
        {pending.length === 0
          ? <Empty>Queue is empty: everything is judged.</Empty>
          : <>
              <Rows rows={pending.slice(0, UPCOMING)} curations={curations} drafts={drafts} />
              {pending.length > UPCOMING && (
                <Note>
                  and {pending.length - UPCOMING} more, in queue order. Use search
                  to reach a specific one
                </Note>
              )}
            </>}
      </Section>
    </Page>
  );
}
