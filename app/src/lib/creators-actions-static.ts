/**
 * `app/creators/actions.ts` with the server taken away — the same swap
 * `lib/actions-static.ts` makes, for the same mechanical reason.
 *
 * `next.config.mjs` aliases `@/app/creators/actions` to this file in static
 * mode. Next refuses to export a site if a single server action is compiled
 * into the build at all, and `lib/dual-write` imports the follow write at the
 * top of the module — so the file carrying `"use server"` has to be gone from
 * the graph, and something of the same shape has to stand where it stood.
 *
 * ── Following still works. It was never the server's to begin with ────────
 *
 * `owner.follows` is device state (`owner-core.setFollowing`), and it always
 * was: the server copy is the mirror, the same as the pantry's. So `setFollow`
 * reports success here because the follow DID happen, in `localStorage`,
 * before this was called — `dual-write` applies the device half first and
 * skips the mirror outright in static mode.
 *
 * ── The two reads answer from nothing, and nothing asks them ──────────────
 *
 * `searchCreators` and `followedCreators` rank creators by servable recipe
 * count across the whole corpus and resolve follows through the claim overlay,
 * both of which are filesystem reads. The static Creators tab does not call
 * them: it reads the bundle's `creators` section and the device's own follows
 * (`CreatorsDirectory`), which is the same answer computed where the answer
 * lives. These are the floor under that, not the plan.
 */
import type { ActionResult } from "./result";

export type CreatorHit = {
  handle: string;
  name: string;
  avatar: string | null;
  lowRes: boolean;
  recipes: number;
  following: boolean;
};

/** The write already landed on the device — see the header. */
export async function setFollow(_handle: string, _on: boolean): Promise<ActionResult> {
  return { ok: true };
}

export async function searchCreators(_q: string):
  Promise<{ following: CreatorHit[]; others: CreatorHit[] }> {
  return { following: [], others: [] };
}

export async function followedCreators(): Promise<CreatorHit[]> {
  return [];
}
