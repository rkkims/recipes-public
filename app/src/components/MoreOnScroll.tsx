"use client";

/**
 * The next page of cards, fetched when you reach the bottom rather than tapped.
 *
 * ── It is still a link, and that is deliberate ─────────────────────────────
 *
 * The old control was `?n=60` in an anchor: the server sliced the list and the
 * back button undid it. That is a good design and this keeps all of it — the
 * anchor is still rendered, still navigable, still the whole mechanism. The
 * observer only *presses it for you*.
 *
 * What that buys is everything the URL was already buying. The count stays in
 * the address bar, so a reload keeps your place forty cards down and back closes
 * the page rather than dumping you at the top. With scripts off, or before
 * hydration, or if the observer never fires, the link is there to tap. Nothing
 * here is the only way to reach anything.
 *
 * A client-side accumulating list would have been the other shape, and it throws
 * that away: state that only exists in a component is state a reload loses, and
 * the reason `?n=` was chosen over `useState` in the first place is written up
 * where `shown` is computed.
 *
 * ── Why it fires early, and only once per page ─────────────────────────────
 *
 * `rootMargin` reaches 600px below the viewport, so the request starts while the
 * user is still reading the last row and the cards are usually there before they
 * arrive. The guard is on the href rather than a boolean: one fetch per distinct
 * URL, so a sentinel that flickers in and out of view during a scroll cannot
 * queue the same page twice, and the next href is free to fire as soon as the
 * new props land.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function MoreOnScroll({ href }: {
  /** Where the next page lives — the same URL the anchor points at. */
  href: string;
}) {
  const router = useRouter();
  const mark = useRef<HTMLParagraphElement>(null);
  /** The href we have already asked for. One request per page, not per scroll. */
  const asked = useRef<string | null>(null);

  useEffect(() => {
    const el = mark.current;
    if (!el) return;
    /* Old browsers without the observer keep the anchor and lose nothing else. */
    if (typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting || asked.current === href) continue;
        asked.current = href;
        /* `scroll: false` — this is the same page with more in it. Jumping to
           the top on every page-in is the one thing infinite scroll must not do. */
        router.push(href, { scroll: false });
      }
    }, { rootMargin: "600px 0px" });

    io.observe(el);
    return () => io.disconnect();
  }, [href, router]);

  /*
    One word, and it is the truthful one.

    It read "Showing 24 of 1,238 · show 24 more". Every number in that sentence
    was about our pagination rather than about cooking: a person scrolling a
    grid of dinners is not keeping a running total of how much of the corpus
    they have consumed, and "1,238" is a boast dressed as a status line. The
    row also announced how far the browsing had to go, which is exactly the
    discouraging arithmetic an infinite scroll exists to avoid.

    The anchor stays — it is still the whole mechanism (see above), and with
    scripts off it is still the way to the next page. Only its wording changed.
  */
  return (
    <p className="note foot gallery-more" ref={mark}>
      <Link href={href} scroll={false}>Loading…</Link>
    </p>
  );
}
