import Link from "next/link";
import { markPaths } from "@/lib/mark";

/**
 * The name, with the mark beside it, linking home.
 *
 * One component because the lockup appears on four surfaces — the nav, the
 * legal pages, the account page and sign-in — and three of those carry no nav
 * at all. Four copies of a logo is four chances for one of them to keep the old
 * one after a change, which is the whole reason `lib/mark` exists.
 *
 * ── Two details that are decisions, not defaults ────────────────────────────
 *
 * **`currentColor`, never the accent.** Chrome gets no accent colour anywhere
 * in this app; the mark is chrome here, so it takes the ink of the text it sits
 * against. The green belongs to the app icon and the link card, which are
 * surfaces someone sees outside the product rather than inside it.
 *
 * **26px, which lands on the simplified drawing.** `markPaths` steps down to
 * five scallops and drops the foot below 64px, so this is the reduced mark by
 * construction — correct, because at roughly the height of a capital letter the
 * eight scallops would close into a smudge.
 *
 * The stroke is set here rather than taken from `markStroke`. That function's
 * floor is about device pixels — keeping a thin line from greying out — and
 * this is a different problem: the mark stands beside a 700-weight wordmark,
 * and matching its optical weight matters more at this one size than the
 * legibility floor does.
 *
 * The name is capitalised on both syllables because that is what the word IS:
 * 집밥 is jip + bap, house and rice, and `JipBap` shows the seam that `jipbap`
 * hides. The domain stays lowercase; domains always are.
 */
export function Brand() {
  return (
    <Link className="nav-brand" href="/">
      <svg width={26} height={26} viewBox="0 0 24 24" fill="none"
           stroke="currentColor" strokeWidth={1.7}
           strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {markPaths(26).map((d) => <path key={d} d={d} />)}
      </svg>
      JipBap
    </Link>
  );
}
