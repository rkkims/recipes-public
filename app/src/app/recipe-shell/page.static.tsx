/*
 * The recipe shell — static mode only (there is no `page.tsx` beside it, so
 * the server build has no such route).
 *
 * One file for every recipe the export did not prerender. The Worker
 * (`deploy/cloudflare/site-worker.ts`) redirects `/recipe/<id>` here as
 * `?id=<id>` when no file matches, and `RecipeShell` draws the recipe from the bundle. What is
 * the same for every recipe is decided here at build: the staples, the meals
 * and the two actions (aliased to their device stand-ins in static mode).
 */
import type { Metadata } from "next";
import { Page } from "@/components/primitives";
import { Nav } from "@/components/Nav";
import { BackLink } from "@/components/BackLink";
import { TimeZone } from "@/components/TimeZone";
import { RecipeShell } from "@/components/RecipeShell";
import { PLAN_BUTTON } from "@/lib/surface";
import { searchIngredients } from "@/app/shelf-actions";
import { readPastedIngredients } from "@/app/actions";
import { starterList } from "@/lib/starter";
import { MEALS } from "@/lib/store";

export const metadata: Metadata = { title: "Recipe · JipBap" };

export default function RecipeShellPage() {
  return (
    <Page>
      <TimeZone />
      <Nav user={false} />
      <p className="page-backline">
        <BackLink href="/" label="Back" />
      </p>
      <article className="recipe-page" id="main" tabIndex={-1}>
        <RecipeShell stapleIds={starterList().map((s) => s.id)} meals={[...MEALS]}
                     showPlanButton={PLAN_BUTTON}
                     search={searchIngredients} onParse={readPastedIngredients} />
      </article>
    </Page>
  );
}
