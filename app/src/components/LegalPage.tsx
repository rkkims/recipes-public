/**
 * The shell both legal documents render into.
 *
 * ── Why there is no nav on it ──────────────────────────────────────────────
 *
 * These pages are reached from a footer link, from an affiliate disclosure, and
 * from outside — an affiliate reviewer opening the URL cold, or someone checking
 * what we do with a pantry before they build one. None of those readers want the
 * tab bar, the pantry drawer or the theme toggle; they want a document. So it
 * gets a link home and nothing else.
 *
 * `dangerouslySetInnerHTML` is the right tool and it is worth saying why it is
 * safe here: the HTML comes from two markdown files in this repository, rendered
 * on the server at build time. There is no user input anywhere in the path. The
 * day any of this text becomes something a user can supply, this stops being
 * acceptable and the renderer needs sanitising — which is the tripwire this
 * comment exists to be.
 */
import { Brand } from "@/components/Brand";
import { BackLink } from "@/components/BackLink";

export function LegalPage({ html }: { html: string }) {
  return (
    <main className="page legal-page" id="main">
      {/*
        The brand, as it is drawn everywhere else. These pages carry no nav, so
        this is the only mark of what site you are on.

        Beside it, a Back — and the old comment here explained why there wasn't
        one: an arrow ON the brand made the name read as a button's label. That
        argument was about the arrow's position, and it was taken as an argument
        against the control. The policy is reached from a footer link on
        whatever page you were reading; landing you on the Cook page instead of
        back on that page is the product forgetting where you were. Opposite the
        mark, the way `/account` and `/signin` do it.
      */}
      <p className="page-brand">
        <Brand />
        <BackLink href="/" />
      </p>
      {/* No second set of links at the bottom: the root layout's footer is
          already there on this route, and two footers is one too many. */}
      <article className="legal-body" dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}
