"use client";

/**
 * The three places this product has, plus the two inventory panels.
 *
 * It exists because two of the places were unfindable. The calendar hung off a
 * single inline link in the home page's filter row, and "my recipes" was a tab
 * inside a gallery. A product with three places needs three visible places.
 *
 * ── Two shapes, because a thumb and a cursor want different things ─────────
 *
 * **Phone: the bar is at the BOTTOM.** That is where the thumb rests, and the
 * top of a phone is the one part of the screen a hand holding it cannot reach.
 * Everything about this product is one-handed by design (§1's constraint is
 * "mobile web, one thumb, standing in front of an open fridge"), and the
 * navigation was the last thing still living out of reach.
 *
 * **Desk and tablet: a single top bar**, places on the left, panels on the
 * right. There is no reach problem with a cursor, and a fixed bottom bar would
 * spend vertical space that the grid wants.
 *
 * ── The panels layer, they do not navigate ────────────────────────────────
 *
 * On a phone the two panel controls sit in a row ABOVE the three places, drawn
 * as a shelf over them. That is literally what they do: a panel opens over
 * whichever page you are on and the page stays live behind it (§4d, rule 3 —
 * neither is a mode). In the same row as Cook and Meal plan they would read as
 * a fourth and fifth destination, which is the one thing they are not.
 *
 * Icon only, in both bars. They are permanent furniture on every page, and a
 * word beside a fridge and a basket is read once and never again — but the name
 * still exists for anyone who cannot see the drawing.
 */
import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { usePanels } from "./Panels";
import { listed } from "@/lib/surface";
import { markPaths } from "@/lib/mark";
import { Brand } from "./Brand";
/* Shared with `BackLink`, which asks the same question about a different URL. */
import { placeOf } from "@/lib/place";
import { STATIC } from "@/lib/static-mode";

/**
 * Ordered by how often they are wanted, not by when they were built.
 *
 * Your own library sits next to Cook because it is the other thing you reach
 * for constantly; the calendar is a weekly act and can be the far one.
 *
 * Two of them are filtered out at v1 — see `lib/surface`. The list keeps them
 * in place and in order rather than commenting them out, because the ordering
 * argument above is the thing worth preserving and it is only legible when all
 * four are written down.
 */
const ALL_PLACES = [
  { href: "/", label: "Cook", icon: "cook" as const },
  /* Between Cook and the library: the people whose recipes fill both. */
  { href: "/creators", label: "Creators", icon: "people" as const },
  { href: "/my-recipes", label: "My recipes", icon: "book" as const },
  { href: "/calendar", label: "Meal plan", icon: "calendar" as const },
  /* A place, not a panel — §4d. You stand in a shop with this as the only thing
     on screen, which is a page's job and not a drawer's. */
  { href: "/list", label: "Grocery list", icon: "basket" as const },
];

/**
 * What this build actually shows. Both bars read this, so they cannot disagree.
 *
 * `/creators` was dropped in static mode while the page was not in the export —
 * a tab pointing at a 404 is worse than a tab that is not there. It ships now:
 * a directory and one prerendered page per creator with a recipe on the shelf,
 * with the shelf's distances, the saves and the follow read from the device.
 * What is still missing there is the claim, and the page says so itself.
 */
const PLACES = ALL_PLACES.filter((p) => listed(p.href));

const TITLES: Record<string, string> = {
  "/": "What can I cook",
  "/creators": "Creators",
  "/my-recipes": "My recipes",
  "/calendar": "Meal plan",
  "/list": "Grocery list",
};

/**
 * Drawn, not typed — the same rule the shell's controls follow.
 *
 * Glyphs are thin by design, occupy a fraction of their em box, and change
 * weight with whatever font the platform substitutes. As SVG the geometry is
 * ours and `currentColor` keeps them in step with each state.
 */
function Icon({ shape }: { shape: "cook" | "people" | "book" | "calendar" | "fridge" | "basket" }) {
  const p = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none",
              stroke: "currentColor", strokeWidth: 1.8,
              strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
              "aria-hidden": true };
  if (shape === "cook") {
    /* The brand mark, at the one place in the UI where the tab and the product
       mean the same thing: "what can I cook" IS the app. Every other icon here
       is a verb drawn plainly, so this is the single exception — see `lib/mark`
       for why it is drawn at five scallops and not eight at 22px.

       If it ever reads as a logo squatting in a tab rather than as this tab's
       own icon, the pan it replaced was `<circle cx="11" cy="12" r="6" />` plus
       `<path d="M17 12h5" />`, and putting it back costs one line. */
    return (
      <svg {...p}>
        {markPaths(22).map((d) => <path key={d} d={d} />)}
      </svg>
    );
  }
  if (shape === "people") {
    /* Two figures, not one: one person is "account", and Account already
       lives in `.nav-end`. Two is a community you browse — which is what the
       tab is. Same non-crossing rule as the mark: the second head sits clear
       of the first, and the far shoulder starts where the near one has already
       ended. */
    return (
      <svg {...p}>
        <circle cx="9.2" cy="8.4" r="3.1" />
        <path d="M3.8 19.5c.7-3.9 2.9-5.9 5.4-5.9s4.7 2 5.4 5.9" />
        <circle cx="16.6" cy="7.4" r="2.4" />
        <path d="M16.8 13.3c2.4.4 3.9 2.3 4.3 5.4" />
      </svg>
    );
  }
  if (shape === "book") {
    return <svg {...p}><path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z" /><path d="M9 4v11" /></svg>;
  }
  if (shape === "calendar") {
    return <svg {...p}><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>;
  }
  if (shape === "basket") {
    return <svg {...p}><path d="M4 8h16l-1.6 11H5.6z" /><path d="M9 8l1.5-4h3L15 8" /></svg>;
  }
  // Fridge: a tall box with a divider and two handles. Reads as a fridge at
  // 22px in a way a generic box does not.
  return (
    <svg {...p}>
      <rect x="5.5" y="2.5" width="13" height="19" rx="2" />
      <path d="M5.5 10h13M9 6.5v2M9 13.5v2.5" />
    </svg>
  );
}

/*
  One prop, and it is a fact rather than a control: whether this request has an
  account behind it, so the corner can say "sign in" or "sign out". Read by the
  page from `currentUser()` and threaded, because this is a client component and
  a session is a fact about the request.

  The old ones existed only to feed the sign-up ask —
  `pantryCount` was §9's trigger and `sharing` was forwarded to the account
  dialog — and every page was computing `heldCount()` and `sharingState()` on
  every render to supply them. They are removed at the call sites too rather
  than left as ignored arguments, because a prop nobody reads is a prop somebody
  later tries to use.
*/
export function Nav({ user = false }: { user?: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const { openBoth, closeAll, anyOpen } = usePanels();
  const place = placeOf(path);

  /**
   * Tabs return you to where you left, not to the top of the place.
   *
   * Leave Cook mid-scroll for a creator's page, come back, and a bare `/`
   * would deal a new grid (a fresh seed) with your place in it gone. So each
   * departure RECORDS the full URL under the place it left, and each arrival
   * prefers the recorded URL over the bare one (CREATORS-TAB-SPEC §3).
   *
   * Recorded after EVERY committed render (the effect below carries no
   * dependency array on purpose) and again at click time. Neither alone
   * covers everything: the modal and the shuffle live in the query string,
   * and query-only navigations never change `usePathname`, so an effect keyed
   * on it would miss exactly the state worth returning to — while click-time
   * recording misses every departure that is not a tab (the creator link
   * inside the recipe modal is the whole feature). sessionStorage, not
   * localStorage: "where I left" is a session-scale fact, and yesterday's
   * position is stale rather than helpful.
   *
   * Modified clicks (new tab, window) pass through untouched and get the bare
   * place, which is the right meaning for "open this fresh somewhere else".
   * Tapping the tab you are already on also passes through: the bare URL is
   * how a tab resets to its own top.
   */
  useEffect(() => {
    try {
      const from = placeOf(window.location.pathname);
      if (from) sessionStorage.setItem(`place:${from}`,
        window.location.pathname + window.location.search);
    } catch { /* private mode: tabs still navigate, they just forget */ }
  });

  const go = (e: React.MouseEvent, href: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    let stored: string | null = null;
    try {
      const from = placeOf(window.location.pathname);
      if (from) sessionStorage.setItem(`place:${from}`,
        window.location.pathname + window.location.search);
      if (from !== href) stored = sessionStorage.getItem(`place:${href}`);
    } catch { /* private mode: tabs still navigate, they just forget */ }
    if (stored && stored !== href) {
      e.preventDefault();
      router.push(stored);
    }
  };

  return (
    <>
      {/* Off-screen until focused. The pantry sits before the gallery in source
          order on every page, so reaching the first recipe by keyboard cost 35
          Tab presses from a cold load. */}
      <a className="skip" href="#main">Skip to content</a>
      <h1 className="sr-only">{TITLES[path] ?? "JipBap"}</h1>

      {/* ── the top bar: everywhere, but it sheds the places on a phone ──── */}
      <nav className="nav" aria-label="Main">
        {/* The mark and the name, together — see `Brand`, which also carries
            the note about why both syllables are capitalised. */}
        <Brand />
        {/*
          What this is, said once, on every page.

          Nothing on screen admitted the shape of the corpus — half Korean, a
          quarter Chinese — so a stranger arriving at a grid of kimchi jjigae
          and dan dan noodles under the words "what can I cook" had to infer the
          scope from the output. The inference people draw from thirty
          unfamiliar dishes is "this is not for me" rather than "this is
          Korean": a wrong conclusion, reached for a reason we created.

          Two halves, and the second one is the load-bearing one. "Cook Asian at
          home" sets the register; *"from what's in your kitchen"* is the actual
          claim, and it is the sentence that separates this from every other
          recipe site — you are not searching, you are being told what is
          already possible.

          "Asian" is looser than the corpus, which is a known trade: there are
          64 Thai recipes here and no Indian ones. It buys a line a person will
          read over a list they would skim, and the cuisine bar on the grid
          shows the real distribution within one tap.

          In the bar rather than on the home page: an affiliate reviewer, or
          anyone following a shared link, lands on `/recipe/[id]` and never
          sees a home page at all.
        */}
        <span className="nav-tag">Cook Asian at home, from what’s in your kitchen</span>
        {/*
          The places, as a group, centred in the bar.

          They used to run on immediately after the tagline, which put the whole
          bar's weight on the left and left a wide empty stretch before the
          controls on the right. Grouping them lets `margin: auto` do the
          centring — a span rather than three loose links, because centring
          three siblings individually is not a thing flex can be asked for.
        */}
        <span className="nav-places">
          {PLACES.map((p) => (
            <Link key={p.href} className="nav-link" href={p.href}
                  // `placeOf` matches exactly, except the Creators prefix —
                  // see its note.
                  aria-current={place === p.href ? "page" : undefined}
                  onClick={(e) => go(e, p.href)}>
              {p.label}
            </Link>
          ))}
        </span>

        {/*
          The panels, right-aligned. §4d: a control each, and each carries its
          own state — `aria-pressed`, because these toggle something that stays
          rather than navigating somewhere.

          When the sign-up button moves into this bar it belongs to the RIGHT of
          these, so the two inventory controls stay adjacent to each other.
        */}
        {/*
          Nothing but the theme control on this side.

          The pantry lost its icon because the drawer is already beside the grid
          at this width, with its own controls on it — a second control for a
          panel you can SEE is furniture. The basket followed it: `/list` is one
          of the four named places in this bar now, so the icon was the same
          destination twice, three inches apart, one of them wordless.
        */}
        {/*
          One quiet link, and no ask.

          The sign-up BUTTON went for a reason that still holds: §9 puts the
          ask after the product has been useful, and a call to action in
          permanent chrome asks on arrival, on every page, of someone who has
          not been given anything yet.

          A way to reach an account you already have is a different thing. It
          is navigation, not persuasion — the same weight as a place in the
          bar, and worthless to anyone who does not already want it. Signed in,
          it becomes the way out.
        */}
        <span className="nav-end">
          {/*
            Signed in, this is "Account" rather than "Sign out".

            Sign out is still one tap from here and has not moved far, but it
            was the ONLY account control that existed, which made leaving the
            product easy and closing it impossible. A link to the place where
            all three live — take your data, sign out, close the account — is
            the version that can hold the third one.
          */}
          {/*
            Static mode has no sign-in to offer, and says so rather than
            offering one — STATIC-SPEC §7b keeps accounts, on the API Worker,
            and that Worker is not this build. A "Sign in" link here would go
            to a page the export does not contain; a silent gap would leave
            someone with an account wondering where it went. So the corner
            carries the sentence instead, and it is the same sentence sync
            gives (§3's "the same honest note").
          */}
          {STATIC
            ? <span className="nav-link note" title="Your kitchen is kept on this device">
                On this device
              </span>
            : user
            ? <Link className="nav-link" href="/account">Account</Link>
            /* The pathname rides along so signing in returns here — the same
               courtesy the follow pill and the claim gate extend. Pathname
               only: the query holds the modal and the shuffle, and reopening
               a modal over a page that just changed identity is not "back". */
            : <Link className="nav-link"
                    href={path === "/" ? "/signin"
                      : `/signin?next=${encodeURIComponent(path)}`}>
                Sign in
              </Link>}
        </span>
      </nav>

      {/*
        ── the bottom bar: phones only ──────────────────────────────────────
        A peer of the three places rather than a floating button, because it is
        the fourth thing you switch to and it should cost the same gesture.
      */}
      <nav className="tabbar" aria-label="Main">
        {/*
          Two rows, and the order says what they are.

          The panels sit ABOVE the three places because that is what they do to
          them: a panel opens OVER whichever page you are on and the page stays
          live behind it (§4d, rule 3 — neither is a mode). Sitting in the same
          row as Cook and Meal plan, they read as a fourth and fifth destination,
          which is the one thing they are not — tapping List does not take you
          anywhere, it lays something over where you already are.
        */}
        {/*
          The pantry is a disc above the bar, not a shelf across it.

          It had a full-width row of its own, tinted and ruled off, spending a
          whole band of a phone screen on one icon — and the band was there to
          say "this layers over the page rather than navigating". That reading is
          worth keeping and it does not need a row: a control that floats OVER
          the content, in front of it, says the same thing by being drawn that
          way.

          Bottom right, above the tab bar, because that is where a thumb rests
          on the hand holding the phone — the same argument that put the places
          at the bottom in the first place. It is `position: fixed`, so it stays
          reachable however far down the grid you are.
        */}
        {/*
          One disc, BOTH shelves.

          It toggled `pantry` alone, which left the grocery list inside the
          drawer hidden by `.panels-no-list` — so the panel opened showing half
          of itself and the other half had no control anywhere on a phone. The
          basket that used to open it went when `/list` became one of the named
          places, and nothing took over the job for the copy that lives in the
          drawer.

          Both, then: what is in the kitchen and what is still to buy are the
          two halves of one question, and on a phone they stack anyway.
        */}
        <button type="button" className="pantry-fab" aria-pressed={anyOpen}
                onClick={() => (anyOpen ? closeAll() : openBoth())}
                aria-label="Pantry and grocery list" title="Pantry and grocery list">
          <Icon shape="fridge" />
        </button>

        <div className="tabbar-places">
          {/*
            Named, not just drawn.

            The icons were on their own, on the argument that a word beside a pan
            and a basket is read once and never again. That holds for a mark
            everyone already knows — a house, a magnifier — and these are not
            those: a circle with a line coming out of it is a pan only once you
            have been told, and the book and the basket are a coin toss between
            "my recipes", "saved" and "shopping". Three destinations is few
            enough that the words cost one line of a bar that already exists.

            `aria-label` goes, because the text IS the label now and keeping both
            makes a screen reader choose between two names for one link.
          */}
          {PLACES.map((p) => (
            <Link key={p.href} className="tabbar-item" href={p.href}
                  aria-current={place === p.href ? "page" : undefined}
                  title={p.label} onClick={(e) => go(e, p.href)}>
              <Icon shape={p.icon} />
              <span className="tabbar-label">{p.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
