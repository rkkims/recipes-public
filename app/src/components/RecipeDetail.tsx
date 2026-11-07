/**
 * What the recipe modal contains — UX-SPEC §5.
 *
 * A server component, so the user's history and notes are read where they live
 * and never shipped for recipes nobody opened. The modal chrome around it is
 * client-side (`RecipeModal`); this is the part that knows things.
 *
 * The order is the spec's: what you have, what you are missing, what you said
 * last time, and only then the way out. *"The user leaves only after deciding,
 * and the decision is ours."*
 */
import Link from "next/link";
import { Chip, ChipRow, SourceLabel } from "./primitives";
import { RecipeIngredients } from "./RecipeIngredients";
import type { IngredientState } from "./StateWidget";
import type { ActionResult } from "@/lib/result";
import { sourceRating as believable } from "@/lib/rating";
import { LeaveToCook } from "./LeaveToCook";
import { ModalShot } from "./Shot";

export type DetailIngredient = {
  id: string;
  name: string;
  /** In the pantry (directly or through a relation). */
  have: boolean;
  /** Recipe marks it optional — missing one costs nothing. */
  optional?: boolean;
  /** §3a: covered by something BROADER than the recipe asked for. */
  check?: string;
  /** Weee link, list-only and modal-only (UX-SPEC §5, §4). */
  buyUrl?: string;
  /**
   * The pantry row a tap on this chip edits, and its current flags.
   *
   * Usually the ingredient itself. For a requirement covered through a relation
   * it is what the user ACTUALLY holds — see the note in `IngredientChips`.
   */
  targetId?: string;
  targetName?: string;
  state?: IngredientState;
};


export function RecipeDetail({ recipeId, title, source, creatorHref, payoff, sheet, url, image, cuisine, sourceRating,
                               confirmed, ingredients, incomplete, diet, steps,
                               components, usedIn, onUpdate, live = false,
                               history, children, actions, more, save }: {
  /** Recipes this one uses as an ingredient — resolved to title + href by the
      caller, because only the caller knows which pool the id lives in and
      which surface (sheet or page) the link should open. */
  /** Recipes this one uses as ingredients. Rendered as Related-recipe cards
      at the foot of the ingredient section; their ingredients are folded
      into the list above either way. */
  components?: Array<{ id: string; title: string; href: string; image?: string }>;
  /** The reverse: kept recipes that use THIS one as an ingredient. */
  usedIn?: Array<{ id: string; title: string; href: string; image?: string }>;
  /**
   * Only the exit needs it, and only to remember that you walked out of THIS
   * recipe — see `lib/cooking`. Everything else here is already resolved to
   * names and states by the caller.
   */
  recipeId: string;
  title: string;
  source: string;
  /**
   * The creator page behind the source name, when the corpus knows one.
   * The name becomes a link and nothing else changes: same words, same
   * position — a reader who does not care sees the caption they always saw,
   * and one who taps it lands on everything else that creator has made.
   */
  creatorHref?: string;
  /**
   * The checkoff's answer, rendered INSIDE the body — CHECKOFF-SPEC §3.
   * It was a sibling after this component, which worked on a page (normal
   * flow) and landed outside `.modal-body` in the modal: present in the HTML,
   * below the sheet's padded content, and read by nobody. A slot puts it on
   * every surface in the same place, after the way out.
   */
  payoff?: React.ReactNode;
  /** The ingredient sheet's full depth — see `RecipeIngredients`. */
  sheet?: React.ComponentProps<typeof RecipeIngredients>["sheet"];
  url: string;
  image?: string;
  cuisine?: string;
  /** The SOURCE's rating out of 5 — never the user's own. Labelled as such. */
  sourceRating?: number;
  /**
   * CREATOR-SPEC §5's badge: the ingredient list below was confirmed by the
   * person who wrote the recipe, not read by a parser. Set only by the claims
   * overlay, so the words can promise exactly what happened.
   */
  confirmed?: boolean;
  ingredients: DetailIngredient[];
  incomplete: boolean;
  /**
   * Where this recipe stands against the user's dietary settings — USER-SPEC §6.
   *
   * The modal opens recipes from the UNFILTERED set on purpose: a link to a
   * recipe should open it, and silently showing nothing is the one thing §6
   * forbids. That decision was made, correctly, and the disclosure that
   * justifies it was never written — `page.tsx` claimed "the modal says so
   * instead" while this component mentioned diet nowhere at all.
   *
   * So the screen where the decision is actually made now carries the caveat,
   * and it distinguishes three states that are genuinely different:
   *
   *   - `hiddenWhy` — we would have hidden this, and here is why
   *   - `unexaminable` — there is nothing to check, which is NOT the same as
   *     clean and must never read as it
   *   - `filtering` — a filter is on and this one passed, which is still only a
   *     claim about what we could SEE
   */
  diet?: { hiddenWhy?: string; unexaminable?: boolean; filtering?: boolean };
  /**
   * Makes the chips actionable (UX-SPEC §1). Optional so a surface that has no
   * business writing — a shared link, say — can render the same detail read-only
   * rather than pretending to offer a control that goes nowhere.
   */
  onUpdate?: (id: string, next: IngredientState) => Promise<ActionResult>;
  /**
   * The page behind this reads its pantry from the device — passed straight
   * through to `RecipeIngredients`, where the reason is written out. The home
   * page sets it; the surfaces slice C has yet to convert do not.
   */
  live?: boolean;
  /**
   * The method — present ONLY for a recipe the user owns (`OwnRecipe.steps`).
   *
   * The corpus never has this and never will: we hold a reading of other
   * people's ingredient lists, not their instructions, and the exit button
   * below is how you reach those. A recipe the user typed in is theirs.
   */
  steps?: string;
  /**
   * "My version", the read half — what happened LAST time.
   *
   * Above the exit, because it is an input to the decision the modal exists to
   * serve. `children` holds the recording half, which cannot be written until
   * the cooking has happened and therefore comes after. See `MyVersionRead`.
   */
  history?: React.ReactNode;
  /** The recording half, and the summary view when that is what is open. */
  children?: React.ReactNode;
  /** Made it / Save / Plan. */
  actions?: React.ReactNode;
  /** The `⋯` menu — rare, consequential things about this recipe. */
  more?: React.ReactNode;
  /**
   * The save heart, laid over the photo — the same place it sits on the card.
   *
   * A control the user already knows from the grid should not move when the
   * grid's card becomes the modal's hero. It is the one action worth taking
   * before you have read anything, which is why it rides the image rather than
   * queueing with Plan and Made-it further down.
   */
  save?: React.ReactNode;
}) {
  const have = ingredients.filter((i) => i.have);
  const need = ingredients.filter((i) => !i.have && !i.optional);
  const extras = ingredients.filter((i) => !i.have && i.optional);
  const checks = ingredients.filter((i) => i.check);

  return (
    <>
      {/* The heart rides the photo, the same corner it occupies on the card it
          was opened from — `.card-save` positions itself, so the shot only has
          to be a positioned ancestor. */}
      {/* No photo, no perch. The heart still has to exist, so it gets a bar of
          its own rather than disappearing with the image — and a photo that
          FAILS has to reach the same bar, which is why the whole block swaps
          rather than just the tag. `.modal-shot` has no height of its own, so
          an empty one would leave the heart in a collapsed box. */}
      <ModalShot {...(image ? { image } : {})} save={save} />

      <div className="modal-body">
        {/* The dish leads; the rare action waits behind `⋯`, the same shape it
            takes on an ingredient. "Don't recommend" is used occasionally and
            would otherwise sit beside Save and Plan, which are used constantly. */}
        <div className="modal-head">
          <h2 className="modal-title">{title}</h2>
          {more && <div className="modal-more">{more}</div>}
        </div>
        <p className="card-source">
          {creatorHref
            ? <a className="source-link" href={creatorHref}><SourceLabel source={source} /></a>
            : <SourceLabel source={source} />}{cuisine && cuisine !== "unresolved" && ` · ${cuisine}`}
          {/* Both were in `recipe-index.json` from the day it was built and
              read by nothing. `serves` is the one that answers "is this dinner
              or a side"; the rating is the SOURCE's and says so, because an
              unlabelled ★ beside a dish you have cooked reads as your own. */}
          {/* Believed or dropped — see `lib/rating`. */}
          {believable(sourceRating) !== undefined && (
            <span title={`${source} readers rated this ${believable(sourceRating)!.toFixed(1)} out of 5`}>
              {" "}★{believable(sourceRating)!.toFixed(1)}
            </span>
          )}
          {/* CREATOR-SPEC §5: never the profile's check — the two badges answer
              different questions and must not share a glyph. This one is a pen:
              the creator wrote this list, not a parser. */}
          {confirmed && (
            <span className="detail-confirmed"
                  title="The creator confirmed this ingredient list themselves">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
                   strokeLinejoin="round" aria-hidden="true">
                <path d="M17 3l4 4L8 20l-5 1 1-5L17 3z" />
              </svg>
              Creator-confirmed
            </span>
          )}
        </p>

        {/* USER-SPEC §6, at the moment of the decision rather than only on the
            grid behind it. Three different states, never collapsed. */}
        {diet?.hiddenWhy && (
          <p className="card-warn diet-warn">
            This one is normally hidden for you: <b>{diet.hiddenWhy}</b>. Shown
            because you opened it directly.
          </p>
        )}
        {diet?.unexaminable && (
          <p className="card-warn diet-warn">
            No ingredients recorded, so your filters couldn’t check this one.
            That isn’t the same as clear.
          </p>
        )}
        {diet?.filtering && !diet.hiddenWhy && !diet.unexaminable && (
          <p className="note diet-note">
            Passed your filters, but we only hide what we can <i>see</i>.{" "}
            <b>Check the source.</b>
          </p>
        )}

        {/*
          Owned vs missing has to be obvious at a glance (§5). Two shelves, not
          one list with ticks — the question "can I cook this tonight" is
          answered by the SIZE of the second one, before anything is read.

          No time band: `RECIPE-SPEC` §4a says show nothing where we have no
          time rather than a dash or a guess, and the index carries none.
        */}
        {/*
          Writable: the shelves re-sort themselves as the pantry is corrected,
          so a chip you have just ticked leaves "You need" and joins "You have"
          rather than turning green under the wrong heading. That needs one
          state map across all three sections, which is a client concern — see
          `RecipeIngredients`.
        */}
        {onUpdate && <RecipeIngredients ingredients={ingredients} onUpdate={onUpdate}
                                        live={live} {...(sheet ? { sheet } : {})} />}

        {/* Read-only: nothing can change, so the server's split is the whole
            truth and there is no reason to ship a component to re-derive it. */}
        {!onUpdate && (
          <section>
            <h3 className="modal-h3">You have <span className="count">{have.length}</span></h3>
            {have.length === 0
              ? <p className="note">Nothing in this one yet.</p>
              : <ChipRow>{have.map((i) => <Chip key={i.id} label={i.name} tone="have" />)}</ChipRow>}
          </section>
        )}

        {/* A recipe saved without its ingredients — a bookmark, not a defect.
            Said plainly, with what it costs and how to fix it. */}
        {ingredients.length === 0 && (
          <p className="card-warn">
            No ingredients, so it won’t match your pantry.
          </p>
        )}

        {/*
          Absent, not empty, when nothing is missing.

          It used to say "Nothing — you can cook this now", which is the one
          claim on this screen the reader has already made for themselves: they
          opened this from a shelf that told them they could cook it, and the
          section directly above just listed every ingredient as had. A heading
          reading "You need 0" over a line confirming zero is furniture, and it
          sits where the eye lands hardest.

          "Optional" below has always worked this way, so this is the file's own
          idiom rather than a new rule.
        */}
        {!onUpdate && need.length > 0 && (
          <section>
            <h3 className="modal-h3">You need <span className="count">{need.length}</span></h3>
            <ChipRow>{need.map((i) => <Chip key={i.id} label={i.name} tone="missing" />)}</ChipRow>
          </section>
        )}

        {!onUpdate && extras.length > 0 && (
          <section>
            <h3 className="modal-h3">Optional</h3>
            <ChipRow>{extras.map((i) => <Chip key={i.id} label={i.name} tone="plain" />)}</ChipRow>
          </section>
        )}

        {/* INGREDIENT-SPEC §3a — never applied silently (§5). */}
        {checks.length > 0 && (
          <ul className="recipe-checks">
            {checks.map((i) => (
              <li key={i.id}>
                Calls for <b>{i.name}</b>, you have <b>{i.check}</b>. Check the source that
                what you have works.
              </li>
            ))}
          </ul>
        )}

        {/* Related recipes — the dishes this one is built FROM and the
            dishes it goes INTO, as cards at the foot of the ingredient
            section (curator's ask, 2026-08-21; replaces the prose lines).
            The fold still counts a component's ingredients in the list
            above; the card is where the relationship lives. */}
        {((components?.length ?? 0) + (usedIn?.length ?? 0)) > 0 && (
          <div className="related">
            <p className="related-head">Related recipes</p>
            <ul className="related-list">
              {(components ?? []).map((c) => (
                <li key={c.id}>
                  <Link className="related-card" href={c.href} scroll={false}>
                    {c.image
                      ? <img className="related-shot" src={c.image} alt="" loading="lazy" />
                      : <span className="related-shot related-noshot" aria-hidden="true" />}
                    <span className="related-body">
                      <span className="related-title">{c.title}</span>
                      <span className="related-label">Used as an ingredient here</span>
                    </span>
                  </Link>
                </li>
              ))}
              {(usedIn ?? []).map((u) => (
                <li key={u.id}>
                  <Link className="related-card" href={u.href} scroll={false}>
                    {u.image
                      ? <img className="related-shot" src={u.image} alt="" loading="lazy" />
                      : <span className="related-shot related-noshot" aria-hidden="true" />}
                    <span className="related-body">
                      <span className="related-title">{u.title}</span>
                      <span className="related-label">Uses this recipe</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/*
          Only reachable by a direct link now: `servable` keeps unread recipes
          out of every shelf and every search. So this is the one place it can
          appear, and it says what it COSTS rather than describing our parser —
          the counts above are a claim about the lines we could read, and this
          is the warning that they are not the whole recipe.
        */}
        {incomplete && (
          <p className="card-warn">
            We couldn’t place every ingredient, so the counts above are
            incomplete. Full list on {source}.
          </p>
        )}

        {/* Your own method, rendered where you would cook from it. */}
        {steps && (
          <section>
            <h3 className="modal-h3">How you make it</h3>
            <p className="recipe-steps">{steps}</p>
          </section>
        )}

        {/* What you did LAST time — decision input, so it comes before the way
            out. The recording half is below it. */}
        {history}

        {/*
          The way out, and the last thing you do BEFORE cooking (§5).

          One button, never interstitial, never delayed: "the tap that means I'm
          cooking this is the one tap in the product that must not be taxed."
          It used to sit at 1,196px in an 844px modal because the recording block
          was stacked in front of it; that block is now below, so the tap costs
          one short scroll instead of the whole panel.

          The return trip is named INSIDE the button rather than under it.

          It names the trip as the user's own benefit, which §5 says is the only
          moment they are listening — and that moment is the tap itself. Sitting
          below as its own line it was a caption to a control the eye had already
          left, on the last thing before the user leaves for someone else's site.
          On the button it is read as part of deciding to press it.
        */}
        <div className="modal-exit">
          <LeaveToCook recipeId={recipeId} url={url} />
        </div>

        {/* Plan it for another night, or edit your own recipe — the alternatives
            to cooking it now, so they sit with the way out rather than above it. */}
        {actions && <div className="modal-actions">{actions}</div>}

        {children}

        {payoff}
      </div>
    </>
  );
}
