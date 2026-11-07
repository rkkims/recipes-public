"use client";

/**
 * The way back, on every page that is not a place — Richard's rule, 2026-08-18.
 *
 * The tab bar answers "take me to X". It does not answer "take me back to what
 * I was just looking at", and the pages where that is the only question are
 * exactly the ones with no tab of their own: a recipe opened from a shared
 * link, a creator's page reached from that recipe, the privacy policy reached
 * from a footer. Those were leaving the browser's own back button as the only
 * exit, which on a phone is a gesture and on a kiosk is nothing.
 *
 * ── A link first, `back()` second ─────────────────────────────────────────
 *
 * `router.back()` alone is wrong for a cold arrival: someone landing here from
 * a bookmark, a search result or a shared link has no previous page in this
 * tab, and back takes them off the site — which is why `/account` and `/signin`
 * hardcoded a link home instead, and lost the "back" behaviour for everyone
 * else. This is both, in the honest order: the element IS a link to `href`, so
 * it works with no JavaScript and for the cold arrival, and JavaScript upgrades
 * it to a real back when there is somewhere to go back TO.
 *
 * ── How it knows ──────────────────────────────────────────────────────────
 *
 * `navigation.currentEntry.index > 0` — the Navigation API's own answer to "is
 * there an earlier entry in this tab's session". Measured: 0 on a cold load, 1
 * after one in-app link, 0 again in a fresh tab opened straight onto the page.
 *
 * The two obvious alternatives both fail here. `history.length` counts entries
 * the tab had before it ever reached us and never shrinks, so it says "yes" to
 * a cold arrival in a reused tab. `document.referrer` stays empty across App
 * Router client navigations, so it says "no" to the case this exists for —
 * every footer tap into the policy. Where the API is missing (Firefox, today)
 * the referrer check is the fallback, and where that is empty too the link
 * behaves as a link, which is the safe end of the trade.
 *
 * ── Back does not cross a tab boundary ────────────────────────────────────
 *
 * Richard's rule, 2026-08-18: "back from make-a-creator-page goes to the
 * creators page". Reach `/creators/start` from your account and history's
 * previous entry is `/account` — a different tab — so `back()` would answer a
 * question about the creators section by leaving it. Within a place the browser
 * history IS the right answer, because everything in it is the same tab's
 * story; across places the tab's own root is.
 *
 * So: when this page belongs to a place, back() only when the entry behind it
 * belongs to the SAME place, and `href` otherwise. The Navigation API carries
 * each entry's url, which is what makes the comparison possible at all.
 *
 * Pages in no place — the policy, the terms, sign-in, a recipe — have no
 * boundary to protect, and there back-to-wherever-you-were stands. That is the
 * whole point of the control on them: the policy is read from a footer link on
 * some other page, and landing you on Cook instead of back on that page is the
 * product forgetting where you were.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { placeOf } from "@/lib/place";

export function BackLink({ href, label = "Back", className = "page-back" }: {
  /** Where to go when there is no history to go back to. Never `undefined`:
      a back control that can dead-end is the thing this replaces. */
  href: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [canReturn, setCanReturn] = useState(false);

  /* In an effect, so the server and the first client render agree on a plain
     link and the upgrade happens after hydration. Reading `navigation` during
     render would be a hydration mismatch on every one of these pages. */
  useEffect(() => {
    const here = placeOf(window.location.pathname);
    const nav = (window as unknown as {
      navigation?: {
        currentEntry?: { index?: number };
        entries?: () => Array<{ url?: string }>;
      };
    }).navigation;

    const index = nav?.currentEntry?.index;
    if (typeof index === "number") {
      if (index <= 0) return;                       // cold arrival: the link stands
      if (!here) { setCanReturn(true); return; }    // no place, no boundary
      const prev = nav?.entries?.()[index - 1]?.url;
      try {
        setCanReturn(!!prev && placeOf(new URL(prev).pathname) === here);
      } catch { /* an unparseable entry is not one we can vouch for */ }
      return;
    }

    /* No Navigation API: the referrer is all there is, and it can answer both
       questions at once when it is there at all. */
    try {
      const ref = new URL(document.referrer);
      setCanReturn(ref.origin === window.location.origin
        && (!here || placeOf(ref.pathname) === here));
    } catch { /* no referrer, or not a URL: the link stands */ }
  }, []);

  return (
    <Link className={className} href={href}
          onClick={(e) => {
            if (!canReturn) return;
            /* Modified clicks are the user asking for a new tab or a copied
               address, and `back()` would answer neither. */
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            router.back();
          }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"
           stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 5l-7 7 7 7" />
      </svg>
      {label}
    </Link>
  );
}
