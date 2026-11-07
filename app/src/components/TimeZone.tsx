"use client";

/**
 * Tell the server which timezone the browser is in, once.
 *
 * Renders nothing. It exists because every date in this product is a LOCAL
 * calendar day — which square is today, whether "Made it" is offered, which day
 * a cook is filed under — and the server does not run in the user's zone. This
 * one runs in UTC, so without this a Californian evening is filed under
 * tomorrow.
 *
 * It writes the cookie from the CLIENT rather than calling a server action,
 * because an action would be a round trip and a re-render on every first visit.
 * The cookie is read on the next request; `router.refresh()` makes that
 * immediate when the value actually changed.
 *
 * The guard matters: without comparing against what is already stored, this
 * would refresh on every mount, and every refresh remounts it.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function TimeZone() {
  const router = useRouter();

  useEffect(() => {
    let tz: string | undefined;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;   // very old browser; the server's zone is the fallback
    }
    if (!tz) return;

    const current = document.cookie.split("; ")
      .find((c) => c.startsWith("tz="))?.slice(3);
    if (current === tz) return;

    // A year, `Lax`, and not `Secure` — this has to work on plain http in
    // development, and it carries nothing private: a timezone is not an
    // identifier we would not otherwise have.
    document.cookie =
      `tz=${encodeURIComponent(tz)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    router.refresh();
  }, [router]);

  return null;
}
