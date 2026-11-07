/**
 * The one account page: sign in, or create one.
 *
 * A place rather than a modal, because it is a destination — something links
 * here, a redirect lands here, and it should survive a reload and a back
 * button. The nav is deliberately absent: a form with three fields does not
 * need a pantry drawer beside it, and the way out is the brand.
 *
 * Someone already signed in is sent home rather than shown a form for the thing
 * they have just done.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/owner";
import { AuthForm } from "@/components/AuthForm";
import { signIn, signUp } from "../auth/actions";
import { Brand } from "@/components/Brand";
import { BackLink } from "@/components/BackLink";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return { title: "Sign in · JipBap" };
}

export default async function SignIn({ searchParams }: {
  searchParams: Promise<{ new?: string; next?: string }>;
}) {
  const { new: wantsNew, next } = await searchParams;
  /*
    Where signing in RETURNS you — the follow pill and the claim gate both
    send people here mid-task, and landing them on the home page threw the
    task away. Internal paths only: a value that does not start with a single
    "/" could send a fresh session to another origin, which is a phishing
    door, so anything else falls back to home.
  */
  const dest = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  if (await currentUser()) redirect(dest);

  return (
    <main className="page auth-page" id="main">
      {/*
        The brand, as it is drawn everywhere else. These pages carry no nav, so
        this is the only mark of what site you are on.

        A back link opposite it, matching the account page. It matters more
        here than there: this is the page a "sign in to keep your pantry"
        prompt sends you to, and someone who followed that and changed their
        mind had no way back to what they were doing except the browser's own
        button. A link home rather than `router.back()`, for the same reason
        the account page uses one — arriving from a bookmark or an email, back
        leaves the site entirely.
      */}
      <p className="page-brand">
        <Brand />
        <BackLink href="/" />
      </p>
      <AuthForm start={wantsNew ? "up" : "in"} next={dest}
                onSignIn={signIn} onSignUp={signUp} />
    </main>
  );
}
