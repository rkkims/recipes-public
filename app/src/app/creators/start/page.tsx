/**
 * The open door — CREATOR-SPEC §5a.
 *
 * Any recipe creator may start a page: no application, no review, no
 * follower minimum, because §4 refuses to store the numbers a threshold
 * would need and the architecture does the filtering anyway — we never host
 * instructions, so a recipe with no live home on a proved channel is one we
 * structurally cannot accept. The gate sits on the payoff (the add action
 * checks the link), never on the person.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Page, Note, Section } from "@/components/primitives";
import { Nav } from "@/components/Nav";
import { BackLink } from "@/components/BackLink";
import { currentUser } from "@/lib/owner";
import { SelfRegister } from "@/components/SelfRegister";
import { registerCreator } from "./actions";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: "Start your creator page · JipBap",
    description: "Any recipe creator can have a page here. Prove your channel, add your recipes, keep your audience.",
  };
}

export default async function StartPage() {
  const user = await currentUser();

  return (
    <Page>
      <Nav user={!!user} />
      {/* A way out that is not the browser's own button. This page is a long
          pitch reached from "Are you a creator?", and someone who reads it and
          decides no had nothing on screen taking them back. A link to the
          creators tab rather than `router.back()`, for the reason the sign-in
          page gives: arriving from a bookmark or a link, back leaves the site. */}
      <p className="page-backline">
        <BackLink href="/creators" />
      </p>
      <h1 className="page-title">Start your creator page</h1>

      {/* The claim page's three questions — who are you, what do I get, what
          does it cost — in the same order, because whoever lands here from
          "Are you a creator?" is the same person scanning for the same three
          answers (CREATORS-TAB-SPEC §5). Shared copy, not a shared component:
          the claim page talks to someone whose page exists; this talks to
          someone whose page does not exist yet. */}
      <Section title="Who we are">
        <p className="claim-pitch">
          JipBap recommends recipes to home cooks from what&apos;s already in
          their kitchen. When a cook wants to make one of yours, we send them
          to it on your platform: your website, YouTube, TikTok, or Instagram.
          We don&apos;t host recipes and we don&apos;t keep your audience.
          Every recipe links out to you.
        </p>
      </Section>

      <Section title="What a page gets you">
        <p className="claim-pitch">
          Your own page, showing only your recipes. A cook who liked one of
          your dishes finds their next one from you, matched to what&apos;s
          already in their kitchen, and can save your recipes to come back to.
          Adding a recipe is pasting a link and marking its ingredients. We
          only ever store the ingredient list; the method stays with your
          video or your site.
        </p>
        <p className="claim-pitch">
          Because your page starts empty, you add where you publish yourself,
          one link at a time, and it all shows on your page. Prove the main
          channel is yours and the page goes live with a verified check. Right
          now we can verify a website or a YouTube channel; TikTok and Meta
          verification is in the works.
        </p>
      </Section>

      <Section title="What it costs">
        <p className="claim-pitch">
          Nothing. Owning your page is free, permanently.
        </p>
      </Section>

      {user ? (
        <Section title="Your page">
          <SelfRegister onRegister={registerCreator} />
        </Section>
      ) : (
        <Section title="Sign in first">
          <Note>
            Your page ties to an account, so it needs one:{" "}
            <Link href="/signin?new=1&next=%2Fcreators%2Fstart">create yours</Link> or{" "}
            <Link href="/signin?next=%2Fcreators%2Fstart">sign in</Link>, and
            you will land back here.
          </Note>
        </Section>
      )}
    </Page>
  );
}
