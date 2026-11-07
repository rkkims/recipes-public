import "./globals.css";
import type { ReactNode } from "react";
import { AckProvider } from "@/components/Ack";
import { PanelsProvider } from "@/components/Panels";
import { ServiceWorker } from "@/components/ServiceWorker";
import { InstallPrompt } from "@/components/InstallPrompt";
import { Footer } from "@/components/Footer";
import { GridStatusProvider } from "@/components/GridStatus";
import { TapMeter } from "@/components/TapMeter";
import { ReportButton } from "@/components/ReportButton";
import { fileReport } from "@/app/actions";
import { STATIC } from "@/lib/static-mode";

/**
 * The origin every absolute URL in metadata is resolved against.
 *
 * Without it Next emits relative `og:url` and `og:image`, which every scraper
 * that matters discards — so a link pasted into a Reddit thread or a group chat
 * renders as a bare URL. That paste is the distribution plan, not a nicety.
 *
 * Overridable because the app also runs on a bare IP and on localhost, where a
 * hard-coded domain would point previews at a host the reader cannot see.
 *
 * `.com` rather than `.app`, decided 2026-08-12: word of mouth is the whole
 * distribution plan, and a person half-remembering a name types `.com`. The
 * TLD has no effect on ranking either way. `.app` redirects here.
 */
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://jipbap.com";

export const metadata = {
  metadataBase: new URL(SITE),
  /* Bare, and inherited by the app surfaces that carry no metadata of their own
     (`/list`, `/calendar`, `/my-recipes`). Those are browser tabs for someone
     already inside the product, so they get the name and nothing else — the
     search-facing title lives on `page.tsx`, which is the only page that is
     both public and worth ranking. */
  title: "JipBap",
  /* The fallback SERP snippet and link preview for anything without its own.
     Written the same way the manifest says it, because they are the same
     sentence to the same stranger. */
  description:
    "Asian home cooking: what you can cook right now, from what's already in your kitchen.",
  applicationName: "JipBap",
  openGraph: {
    siteName: "JipBap",
    type: "website",
    locale: "en_US",
  },
  /* `summary_large_image` and no image: the card falls through to
     `opengraph-image.tsx`, which draws one. Naming the card type here means
     every route gets the wide layout without repeating itself. */
  twitter: { card: "summary_large_image" as const },
  /**
   * The three file conventions static mode cannot use, named explicitly.
   *
   * `manifest.ts`, `icon.tsx` and `opengraph-image.tsx` are METADATA routes,
   * discovered by filename against `pageExtensions` — and static mode narrows
   * that list to `static.tsx` so that the route allowlist can be mechanical
   * (see `page.static.tsx`). A `.static` shim for a metadata route is
   * discovered by Next and then not built by Turbopack, whose metadata pipeline
   * only handles `.js/.jsx/.ts/.tsx`. So in static mode the same three things
   * are served from ordinary paths and pointed at from here:
   *
   *   - the manifest is written into the export by `build-static` from the very
   *     same `manifest.ts`, so the PWA install path (§12) survives intact
   *   - the tab icon becomes the 192px raster the manifest already asks for
   *     (`icons/[size]`, a normal route handler with its own
   *     `generateStaticParams`)
   *   - the share card becomes `/og`, which calls `opengraph-image.tsx`'s own
   *     default export — one drawing, two doors
   *
   * Server mode is untouched: `STATIC` folds to `false` at build time and both
   * spreads disappear.
   */
  ...(STATIC ? {
    manifest: "/manifest.webmanifest",
    openGraph: {
      siteName: "JipBap",
      type: "website" as const,
      locale: "en_US",
      images: [{ url: "/og", width: 1200, height: 630 }],
    },
  } : {}),
  /* iOS ignores the manifest's icons for the home screen and reads this. Kept
     to the bare name: this is the label under the home screen icon, where iOS
     truncates hard and a tagline would become "what can I…". */
  /* `default`, not `black-translucent`. Translucent lets the page run under
     the status bar and paints its text light — which was right on a dark
     shell and is white-on-white now. */
  appleWebApp: { capable: true, title: "JipBap", statusBarStyle: "default" as const },
  /* `icon` is named explicitly even though `app/icon.tsx` is a file convention
     Next would wire up on its own. Declaring `icons` at all opts out of that
     detection, so with only `apple` here the tab icon rendered, served, and
     was linked by nothing. */
  /* `?v=2` busts the browser's favicon cache, which outlives every other
     cache a browser has — the reviewer was still seeing a pre-rice-bowl icon.
     Bump the number whenever the mark changes; nothing else reads it. */
  icons: { icon: STATIC ? "/icons/192?v=6" : "/icon?v=6", apple: "/icons/180?v=4" },
};

/* The bar behind the status bar when launched from the home screen, and the
   viewport rule that lets the tab bar sit against the bottom edge. */
export const viewport = {
  /*
    The browser chrome tint, and it has to match the page.

    It was `#0f1a14` — the dark shell the icon is drawn on — which was right
    when the app could be dark. On a light-only site it paints a near-black bar
    above a white page, and on iOS it pairs with a translucent status bar whose
    text is then white on white. White, to match `--light-bg`.
  */
  themeColor: "#ffffff",
  viewportFit: "cover" as const,
};

/*
  The blocking `<head>` script that read a stored theme before first paint is
  gone with the theme. It existed so a dark-mode user never saw a white flash;
  with one palette there is nothing to apply and nothing to flash, and the head
  loses a render-blocking script on every page load.
*/

export default function RootLayout({ children }: { children: ReactNode }) {
  /* `suppressHydrationWarning` was for the theme attribute the script above
     wrote before React arrived. Nothing writes to `<html>` now, so a mismatch
     here would be a real bug and should be allowed to say so. */
  return (
    <html lang="en">
      {/* Impact's site verification for the Instacart affiliate program.
          Their snippet carries the id in a nonstandard `value` attribute and
          their checker may look for exactly that, so this emits BOTH `value`
          and `content` (spread, because React's meta typing knows only the
          standard one). React 19 hoists it into <head> from here. */}
      <meta name="impact-site-verification"
            {...{ value: "d39ebdaf-6b34-4f40-8823-327d119c2c00" }}
            content="d39ebdaf-6b34-4f40-8823-327d119c2c00" />
      {/* FlexOffers (Umall, Kroger) — standard content attribute, same hoist. */}
      <meta name="fo-verify" content="d78db549-1696-4562-a8fb-d521882e975d" />
      {/* Here rather than in `Shell`, because `Shell` is not on every page —
          `/recipe/[id]` has none, and an acknowledgement that vanished on one
          surface would teach people not to trust it on the others. */}
      {/* `PanelsProvider` outside, because the nav owns the controls and the
          shell owns the panels, and those two are siblings on every page. */}
      <body>
        <PanelsProvider>
          <GridStatusProvider>
          <AckProvider>
            <ServiceWorker />
            {children}
            {/* Every route, including the legal documents and the offline page
                — see `Footer`. It is the only place the affiliate relationship
                is stated site-wide. */}
            <Footer />
            <InstallPrompt />
            {/* Diagnostic, off unless ?perf=1 — see `TapMeter`. Delete when the
                "why is it slow on my phone" question is answered. */}
            <TapMeter />
            {/* On every page because a bug is found on whichever page it is on,
                and the cost of switching apps to write it down is the report
                not getting written. A dogfooding tool — delete it, its action
                and `lib/reports.ts` when there are users who are not us. */}
            {/* Not in static mode: the board it writes to is a file on the VM
                (`data/app/reports.jsonl`), and a button that always fails is
                worse than no button. It is a dogfooding tool by its own
                comment, so it retires with the machine it reports to. */}
            {!STATIC && <ReportButton onReport={fileReport} />}
          </AckProvider>
          </GridStatusProvider>
        </PanelsProvider>
      </body>
    </html>
  );
}
