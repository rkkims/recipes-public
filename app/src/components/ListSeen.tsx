"use client";

/**
 * `list_viewed` — the top of ATTRIBUTION-SPEC §2's funnel.
 *
 * `buyblock_shown` fires only when something on the list is hard to find, so
 * on its own it cannot say how often the list is seen at all — and every rate
 * downstream needs that number under it. A client effect rather than a server
 * log line, deliberately: a server render counts crawlers and every
 * revalidation, and the fact being recorded is "a person had the list open".
 *
 * Renders nothing. Fires once per mount. Carries a count and no ids — which
 * items were listed is `buyblock_shown`'s business, and only for the rows the
 * block actually offered.
 */
import { useEffect, useRef } from "react";
import { beacon } from "@/lib/beacon";

export function ListSeen({ n }: { n: number }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    beacon("list_viewed", { n });
  });
  return null;
}
