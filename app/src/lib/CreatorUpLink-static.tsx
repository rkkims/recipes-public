/**
 * The creator link on a recipe page, in static mode — the link, and only the
 * link.
 *
 * `next.config.mjs` swaps `@/components/CreatorUpLink` for this, and the reason
 * is mechanical: the real component holds two inline server actions, and Next
 * refuses to export a build containing any server action at all — reachable or
 * not. So the block needs a stand-in whatever it renders.
 *
 * It rendered NOTHING until the creator pages joined the export, on the honest
 * reading that a link to `/creators/<handle>` was a link to a 404. That is no
 * longer true: there is a prerendered page for every creator with a recipe on
 * the shelf, and a recipe page only exists for a recipe on the shelf, so the
 * link this draws always lands. It is also the whole of distribution channel 2
 * — a creator's audience arrives on one dish and this is the one step to the
 * rest of their shelf — which is exactly what static mode must not quietly
 * delete.
 *
 * ── The half that genuinely cannot come ───────────────────────────────────
 *
 * The claimant's controls beside it — fix the ingredient list, hide this from
 * your page, edit or remove your own recipe — are writes against claim data,
 * and there is no server to hear them. They render nothing rather than as
 * buttons that would fail, and STATIC-SPEC §7b names that loss outright:
 * *"the creator-page-as-bio-link channel becomes read-only until the
 * sync-shaped Worker grows a claim endpoint"*. Read-only is what this is.
 */
/* Props are typed loosely on purpose: typecheck resolves the CALL SITE against
   the real component (tsconfig's `@/*` paths do not know about the bundler's
   alias), so this file only has to be runtime-compatible. Importing the real
   module's types from here would be a module aliased to itself. */
import Link from "next/link";

export function CreatorUpLink(
  { creator }: {
    recipe: unknown;
    creator?: { handle: string; displayName: string } | null;
  },
) {
  if (!creator) return null;
  return (
    <p className="note creator-up">
      <Link href={`/creators/${creator.handle}`}>
        ← View {creator.displayName}&apos;s recipes
      </Link>
    </p>
  );
}
