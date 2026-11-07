/**
 * What the checkoff says back — CHECKOFF-SPEC §3, rendered.
 *
 * Renderable from either shell. It was a server component so that a chip tap
 * would re-render it through the action's revalidation; the recipe page holds
 * its pantry on the device now (STATIC-SPEC §2), so the recompute happens on
 * the tap's own frame and this draws whatever `alsoCookable` last returned.
 *
 * Silence is a state, same rule as `BuyBlock`: with an empty pantry there is
 * nothing honest to say here (the seeding prompt is that surface's job), and
 * rendering "you can make 0 things" would read as a verdict on the kitchen
 * when it is only a verdict on an empty form.
 */
import { RecipeCard } from "@/components/Gallery";
import type { AlsoCookable } from "@/lib/payoff";

export function Payoff({ needCount, also, hrefFor, heading, creatorHrefs }: {
  /** Required lines still missing — the chips above carry the details. */
  needCount: number;
  also: AlsoCookable;
  /** The surface decides its own addressing: `?recipe=` in the modal, `/recipe/` outside. */
  hrefFor: (id: string) => string;
  /** Names the grid when it is creator-scoped — "you can cook these from X". */
  heading?: string;
  /**
   * Recipe id → the creator's page, supplied rather than looked up.
   *
   * `creatorOfRecipe` reads the creator index off disk, which is the whole
   * reason this file could not run on a device. It is a per-deploy fact about
   * the shelf rather than about the kitchen, so the page hands it over once —
   * `HomeGrid`'s `meta` prop, narrowed to the one field this needs.
   */
  creatorHrefs?: Record<string, string>;
}) {
  /* The gap line ("you need N things") was here and the reviewer cut it —
     the chips directly above already say it item by item, and a count under a
     list of the counted is the page reading itself aloud. What remains is only
     what the chips CANNOT say: that nothing is missing, and what else the
     pantry already covers. */
  /* "You have everything for this." was the last sentence standing and the
     reviewer cut it too — the chips above say it by being all green. The
     payoff is now purely the grid: dishes, or nothing. */
  if (also.count === 0) return null;

  return (
    <section className="payoff" aria-label="what your pantry covers">
      {also.count > 0 && (
        <>
          {/* No sentence above the grid — the reviewer cut it: cards announce
              themselves, and a count over a visible set is the page reading
              itself aloud. ALL cookable dishes render, not a teaser three;
              the grid is the answer, whole. */}
          {heading && <h3 className="payoff-heading">{heading}</h3>}
          <div className="gallery">
            {also.top.map((r) => (
              <RecipeCard key={r.id} title={r.title} source={r.source}
                          {...((h) => h ? { creatorHref: h } : {})(creatorHrefs?.[r.id])}
                          href={hrefFor(r.id)}
                          away={0} missing={[]} uses={[]} checks={[]}
                          incomplete={false}
                          {...(r.image ? { image: r.image } : {})}
                          {...(r.confirmed ? { confirmed: true } : {})} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
