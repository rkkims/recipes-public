/**
 * The ingredient queue — the review that fixes 300 recipes at once.
 *
 * `/curate` is recipe-at-a-time and has 40 decisions behind it. The ingredient
 * pipeline has ~1,850, because a call on `gochugaru` lands on every recipe that
 * wants it and a call on one recipe lands on one. This page is the surface for
 * the largest remaining queue: `data/qc/unknown.csv`, ~1,950 strings the corpus
 * produced and the ontology could not place.
 *
 * It exists here rather than in `npm run qc-ui` for the reason stated in
 * `lib/unknowns.ts`: that tool refuses `unknown.csv` because the file has no
 * `id` column. The surface is the key, and once you say so the queue is
 * reviewable.
 *
 * Force-dynamic and never cached: this reads two files that change under it
 * every time the reviewer answers, and a cached queue would re-serve a row
 * already decided.
 */
import Link from "next/link";
import { Page, Note, Section } from "@/components/primitives";
import { CurateIngredient } from "@/components/CurateIngredient";
import { progress, queue } from "@/lib/unknowns";
import { flagParse, recordUnknown, suggestNodes } from "./actions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Ingredient queue" };

export default async function IngredientQueue() {
  const [row] = queue(1);
  const p = progress();
  const remaining = p.total - p.decided;
  const linesLeft = p.lines - p.linesDone;

  return (
    <Page>
      <Section title="Unknown ingredients" count={remaining}>
        <CurateIngredient
          row={row ?? null}
          remaining={remaining}
          linesLeft={linesLeft}
          onDecide={recordUnknown}
          onSuggest={suggestNodes}
          onFlagParse={flagParse}
        />
      </Section>

      <Note>
        {p.decided.toLocaleString()} of {p.total.toLocaleString()} surfaces decided
        {p.lines > 0 && <> · {Math.round((p.linesDone / p.lines) * 100)}% of affected corpus lines</>}
        {" · "}
        <Link href="/curate">recipe queue</Link>
      </Note>

      {/*
        The decisions here are inert until `learn` runs. Saying so on the page
        is not a nicety: a reviewer who answers 200 rows and sees no change in
        matching would reasonably conclude the tool is broken, when in fact the
        alias table simply has not been written yet.
      */}
      <Note>
        Answers land in <code>data/decisions/unknown.csv</code>. Run{" "}
        <code>npm run apply-edits</code> to write the alias verdicts into the
        ontology tables, then <code>npm run build-ontology</code>. The{" "}
        <code>new</code> and <code>reject</code> calls stay recorded for the
        promote path.
      </Note>
    </Page>
  );
}
