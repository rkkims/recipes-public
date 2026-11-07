/**
 * The account page — what we hold, how to take it, how to end it.
 *
 * ── Why a page appeared where there was none ──────────────────────────────
 *
 * Accounts arrived at v1 with exactly two controls: a sign-in form and a "Sign
 * out" link in the nav. That is enough to have an account and not enough to
 * LEAVE one, and leaving is the half a person is entitled to. Apple's guideline
 * 5.1.1(v) says the same thing in store terms — an app that offers account
 * creation must offer account deletion inside the app — but the reason to build
 * it is that the privacy policy has promised deletion since day one and the way
 * to collect on that promise was to email a human.
 *
 * ── Shaped like the sign-in page, deliberately ───────────────────────────
 *
 * No nav, no pantry drawer, the brand as the way out. This is a destination you
 * arrive at on purpose, do one thing, and leave; a page that carried the whole
 * app's furniture would invite reading it as somewhere to be.
 *
 * ── The order of the three things ────────────────────────────────────────
 *
 * Take your data, then sign out, then delete. That is ascending order of
 * consequence, and it puts the export directly above the button that makes the
 * export impossible. Nobody should have to think of it themselves at the moment
 * they are about to lose the chance.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/owner";
import { getOwner } from "@/lib/store";
import { CloseAccount } from "@/components/CloseAccount";
import { SignOutButton } from "@/components/SignOutButton";
import { deleteAccount, signOut } from "../auth/actions";
import { Brand } from "@/components/Brand";
import { BackLink } from "@/components/BackLink";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return { title: "Your account · JipBap" };
}

/** Plain English, because "2026-08-11T16:04:00Z" is not an answer to "since when". */
function since(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default async function Account() {
  const user = await currentUser();
  /* Signed out, there is no account to manage. Sent to the form rather than
     shown an empty page explaining that — the same move `signin` makes in
     reverse. */
  if (!user) redirect("/signin");

  const owner = getOwner(user.owner_id);
  /* Counted so the delete confirmation can name what goes. "Delete everything"
     is a phrase; "42 ingredients and 7 cooks" is a fact, and it is the fact
     that makes someone stop and think if they should. */
  const held = Object.keys(owner?.ingredients ?? {}).length;
  const cooks = (owner?.cooks ?? []).length;
  const saved = Object.values(owner?.recipes ?? {}).filter((r) => r.saved).length;
  const own = (owner?.own ?? []).length;

  return (
    <main className="page auth-page" id="main">
      {/*
        A way out that is a LINK, not `router.back()`.

        This page is reached from the nav, so history usually holds the app —
        but it is also where a "delete my account" link in an email would land,
        and where someone arrives after a bookmark. `back()` there exits the
        site entirely, which is the one thing a back control must not do. A link
        home always means the same thing.

        The chevron is drawn rather than typed, like every other mark here: a
        glyph inherits the label's size and reads as punctuation.
      */}
      <p className="page-brand">
        {/* The mark first, and it is the real one — this page used to draw the
            name as bare text while every other surface draws the bowl beside
            it, so arriving here felt like leaving the product. */}
        <Brand />
        <BackLink href="/" />
      </p>

      <div className="account">
        <h2 className="account-h">Your account</h2>
        <p className="account-who">
          {/* The id where one exists; the email is the name only for accounts
              from before ids landed (CREATORS-TAB-SPEC §6). */}
          <b>{user.username ?? user.email}</b>
          {since(user.created_at) && <span className="account-since">since {since(user.created_at)}</span>}
        </p>

        {/* What is actually here, in the plainest form there is. It doubles as
            the answer to "is this the right account" for anyone who has two. */}
        <ul className="account-holds">
          <li><b>{held}</b> {held === 1 ? "ingredient" : "ingredients"}</li>
          <li><b>{saved}</b> saved {saved === 1 ? "recipe" : "recipes"}</li>
          <li><b>{own}</b> of your own {own === 1 ? "recipe" : "recipes"}</li>
          <li><b>{cooks}</b> {cooks === 1 ? "cook" : "cooks"} recorded</li>
        </ul>

        {/*
          No explanations under these two.

          "Download my data" and "Sign out" are the two most understood controls
          on the internet, and a sentence under each was telling a reader
          something they knew before they arrived. The rule this page follows:
          say what a control COSTS, never what it does. Only the last one costs
          anything, so only the last one gets a line.

          A plain link rather than a fetch for the export: the browser has to be
          able to SAVE it, and a server action returns a value to JavaScript
          rather than a file to the download manager.
        */}
        <div className="account-row">
          <a className="account-export" href="/export" download>Download my data</a>
          <SignOutButton onSignOut={signOut} />
        </div>

        {/* SS5a's door, said once where a signed-in person already is. The
            question stands on its own line (the user's wording, 2026-08-16),
            so the ask reads before the pitch. */}
        <p className="note">
          Publish recipes somewhere?
          <br />
          <Link href="/creators/start">Start your creator page</Link>:
          permanently free, and your recipes keep linking to you.
        </p>

        <h3 className="account-h3 account-h3-end">Close your account</h3>
        <p className="note">
          Deletes your login and everything above. It cannot be undone.
        </p>
        <CloseAccount held={held} cooks={cooks} saved={saved} own={own}
                      onDelete={deleteAccount} />
      </div>
    </main>
  );
}
