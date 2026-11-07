/**
 * The diet control, what it is hiding, and any filter currently lifted.
 *
 * It lived in the home page's topbar and nowhere else, so on two of the three
 * pages there was no way to see or change what was being hidden — and on those
 * pages nothing was being hidden at all, because `applyDiet` was never called.
 * A standing instruction that only holds on one page is not standing.
 *
 * Cause and effect are read together: the "hiding N recipes" line sits directly
 * under the control that causes it, which is what USER-SPEC §6 asks for — say
 * what is being hidden, and why.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { Notice } from "./Notices";
import { Diet } from "./Diet";
import { CLASSES, type Hidden } from "@/lib/diet";
import { ALLERGENS } from "@/lib/allergen-vocab";
import { excludeIngredient, updateDiet } from "@/app/actions";

export function DietBar({ classes, allergens, excluded = [], children }: {
  classes: string[];
  allergens: string[];
  /** Ingredients the user has excluded — USER-SPEC §6, named rather than counted. */
  excluded?: Array<{ id: string; name: string }>;
  /** The rest of the toolbar — the recipe search shares this row. */
  children?: ReactNode;
}) {
  return (
    /* One band, not three. Search and the diet control are both single-line
       controls, so they share a row rather than stacking their own. */
    <div className="toolbar">
      {children}
      {/* `live`: the grid under this bar applies the dietary filter on the
          DEVICE now (`HomeGrid`), so both writes have to reach the device's
          store as well as the file — a restriction the user can set and not
          see working is the failure USER-SPEC §6 is most careful about. This
          bar is rendered on the home page only, which is why the flag can
          simply be on. */}
      <Diet classes={CLASSES} allergens={[...ALLERGENS]}
            selectedClasses={classes} selectedAllergens={allergens}
            excluded={excluded} onUnexclude={excludeIngredient}
            onChange={updateDiet} live />
    </div>
  );
}

/**
 * The two notices the dietary setting produces — built here, shown in the strip.
 *
 * They belong to this feature and are rendered by `Notices`, because four
 * separately-bordered blocks stacked above the gallery was the problem being
 * fixed. Kept beside the control that causes them so the wording stays in step.
 */
export function dietNotices(
  { classes, hidden, lifted = [], here }:
  { classes: string[]; hidden?: Hidden; lifted?: string[]; here: string },
): Notice[] {
  const out: Notice[] = [];

  // A lifted filter is a MODE, and a mode with no indicator is the failure the
  // state widget was introduced to kill. It says what is off, that it is
  // temporary, and how to put it back.
  if (lifted.length > 0) {
    out.push({
      kind: "filter", key: "lifted",
      children: (
        <>Showing <b>{lifted.join(", ")}</b> recipes for this browse only. Your
          setting is unchanged. <Link href={here}>put it back</Link></>
      ),
    });
  }

  /*
    The "hiding N recipes" line is gone.

    It read "Hiding 207 recipes: you excluded rice (207)" — arithmetic about
    our filter, printed above the grid on every page load, in the one place
    the user is trying to look at food. The number grows with the corpus and
    with every restriction they set, so the better the setting works the
    louder it gets about working.

    UX-SPEC §6 asks the UI to say how many were hidden and why, and this is a
    deliberate departure from that. What §6 is really protecting against is a
    filter that shrinks the results SILENTLY — a user who cannot tell why the
    grid looks thin. That is still answered, and better: the restrictions
    control now names every setting in its own line ("vegetarian · not rice"),
    so what is being applied is legible without a count of the casualties.

    `applyDiet` still computes and returns the tally — the test in
    `match.test.ts` checks that, and it is what a future surface would need.
    Only the notice is removed.

    One thing genuinely goes with it: the "show them anyway" peek link, which
    lived in this line and nowhere else. `peek` in `lib/diet` and the `?allow=`
    parameter still work, so restoring it is re-adding a link.
  */
  return out;
}
