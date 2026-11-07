/**
 * The checkoff's answer — CHECKOFF-SPEC §3.
 *
 * Ticking chips on a recipe writes the pantry and, until now, said nothing
 * back. The spec's argument: the payoff is the first evidence a visitor gets
 * that this product does something a recipe page does not, and it has to land
 * on the same screen, seconds after an action they wanted to take anyway.
 *
 * Two lines, in this order:
 *
 *   the gap     "you need 2 things"       — already carried by the chips and
 *                                           their buy links; the sentence here
 *                                           is the count made legible
 *   the return  "you can already make 3   — THIS is the conversion, and it is
 *                other things"              the half that was missing
 *
 * The return is computed the same way the home page's "Can cook now" shelf is:
 * `rank` with `maxMissing: 0` over the servable corpus. Same engine, same
 * answer, arriving on the surface where the pantry just changed.
 */
import { rank, type Recipe } from "./match";
import type { Pantry } from "./match";

export type AlsoCookable = {
  count: number;
  top: Array<{ id: string; title: string; source: string; image?: string; confirmed?: boolean }>;
};

/**
 * Every OTHER recipe the pantry now covers in full.
 *
 * An empty pantry returns zero rather than computing anything: for a stranger
 * the honest answer is the seeding prompt (§2), not "you can make 0 things" —
 * which reads as a verdict on their kitchen when it is only a verdict on an
 * empty form.
 */
export function alsoCookable(
  recipes: Recipe[], pantry: Pantry, excludeId: string, limit = Infinity,
  /**
   * Withdrawn creators' recipes — CREATOR-SPEC §6/§6a.
   *
   * This called `servable`, which reads the claims and creator tables off
   * disk to answer the same question. That made the whole module server-only,
   * and this rank has to run on the DEVICE now (the recipe page's payoff
   * recomputes on every chip tick, and a round trip per tick is the cost the
   * inversion exists to remove). So the withdrawal list is passed in — the
   * same shape the grid already receives as `hiddenIds`, from the same server
   * read, because a withdrawal is a runtime judgement that must reach a device
   * holding an older bundle.
   *
   * The `unresolved` half of `servable` stays here: it is a property of the
   * row, needs nothing to check, and must never be forgotten by a caller.
   */
  hidden: ReadonlySet<string> = new Set(),
): AlsoCookable {
  if (pantry.have.size === 0) return { count: 0, top: [] };
  const servable = recipes.filter((r) => r.unresolved.length === 0 && !hidden.has(r.id));
  const cookable = rank(servable, pantry, { maxMissing: 0 })
    .filter((m) => m.recipe.id !== excludeId);
  return {
    count: cookable.length,
    top: cookable.slice(0, limit).map((m) => ({
      id: m.recipe.id, title: m.recipe.title, source: m.recipe.source,
      ...(m.recipe.image ? { image: m.recipe.image } : {}),
      ...(m.recipe.confirmed ? { confirmed: true } : {}),
    })),
  };
}
