/**
 * Claim a creator page — CREATOR-SPEC §5, the half that needs nobody's OAuth.
 *
 * Identity is per channel, and the DOMAIN channel has web-native proofs: a
 * meta tag, a file, or a DNS TXT record (`lib/claims.ts` argues why DNS is
 * load-bearing — it is the one proof a challenge-walled host cannot block).
 * Platform channels wait for platform apps; claiming the domain verifies the
 * domain, and only it (§1: controlling the site says nothing about who runs
 * the TikTok).
 *
 * Signed-in only, and unapologetically: a claim is a durable relationship
 * between a person and this page, and an anonymous cookie is neither durable
 * nor a person. The token is minted per (creator, account) and never expires
 * — DNS takes however long it takes.
 *
 * After a successful claim the same page becomes the settings surface:
 * display name and affiliate tag, §5's exact table of what a claim changes.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { Page, Note, Section } from "@/components/primitives";
import { Nav } from "@/components/Nav";
import { channelsOf, creatorByHandle, domainOf } from "@/lib/creators";
import { claimOf, tokenFor } from "@/lib/claims";
import { currentUser } from "@/lib/owner";
import { ClaimPanel } from "@/components/ClaimPanel";
import { saveSettings, verifyClaim, withdrawPage } from "./actions";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return { title: "Claim your page · JipBap", robots: { index: false } };
}

export default async function ClaimPage(
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const creator = creatorByHandle(handle);
  if (!creator) notFound();
  const site = domainOf(creator.id);
  /* A provable channel is enough, and it no longer has to be a domain: the
     YouTube prover exists (`findChannelProof`), and a §5a row registered with
     only a YouTube channel was walking in the door and then 404ing HERE.
     Nothing to prove against at all is still a 404. */
  if (!site && channelsOf(creator.id).length === 0) notFound();

  const user = await currentUser();
  const claim = claimOf(creator.id);

  return (
    <Page>
      <Nav user={!!user} />
      <h1 className="page-title">
        {claim ? `${creator.displayName}` : `Claim ${creator.displayName}`}
      </h1>

      {/* The pitch stands BEFORE the sign-in gate, in the reviewer's three
          questions — who are you, what do I get, what does it cost — because
          that is the order a creator actually scans. Shipped claims only:
          every sentence is true of this site today. */}
      {(!claim || (user && claim.user_id === user.id)) && (
        <>
          <Section title="Who we are">
            <p className="claim-pitch">
              JipBap recommends recipes to home cooks from what&apos;s already
              in their kitchen. When a cook wants to make one of yours, we send
              them to it on your platform: your website, YouTube, TikTok, or
              Instagram. We don&apos;t host recipes and we don&apos;t keep your
              audience. Every recipe links out to you. Cooks find dishes they
              can actually make; creators get cooks who actually cook them.
            </p>
          </Section>

          <Section title="What claiming gets you">
            <p className="claim-pitch">
              Your own page, showing only your recipes. A cook who liked one of
              your dishes finds their next one from you, matched to what&apos;s
              already in their kitchen, and can save your recipes to come back
              to. Your back catalogue gets visited again, by the cooks most
              likely to cook it.
            </p>
            <ul className="claim-benefits">
              <li><b>A verified check by your name</b>, and the display name is
                yours to set.</li>
              <li><b>Collections</b>: group your recipes your way, shown at
                the top of your page.</li>
            </ul>
          </Section>

          <Section title="Add your recipes yourself">
            <p className="claim-pitch">
              Paste a link, mark its ingredients as required or optional, done.
              The recipe joins search right away, and cooks can see whether
              they can make it. We add recipes too, but our queue is long and
              nobody can read your recipe like you do. It takes under five
              minutes, and we only ever store the ingredient list. The method
              stays with your video.
            </p>
          </Section>

          <Section title="What it costs">
            <p className="claim-pitch">
              Nothing. Owning your page is free, permanently.
            </p>
          </Section>
        </>
      )}

      {/* SS6a allows re-claiming after removal - channels are sold and
          inherited, and the person at the other end is often not the person
          who left. But the claim machinery and the listing are separate:
          proving the channel makes the page yours, it does not relist it. */}
      {creator.status === "removed" && (
        <Section title="About this page">
          <Note>
            This page is not listed right now. Claiming it still works and
            makes it yours, but it stays unlisted until we lift that, so
            write to us as well.
          </Note>
        </Section>
      )}

      {!user && (
        <Section title="Sign in first">
          <Note>
            A claim ties this page to an account, so it needs one:{" "}
            <Link href={`/signin?next=${encodeURIComponent(`/creators/${creator.handle}/claim`)}`}>
              sign in or create yours
            </Link>{" "}
            and you will land back here. Nothing about the page changes until
            a proof passes.
          </Note>
        </Section>
      )}

      {user && claim && claim.user_id !== user.id && (
        <Section title="Already claimed">
          {/* SS6a: a dispute about the channel IS a button now - the proof
              re-runs, and whoever controls the channel today is who it
              belongs to. What stays a conversation is everything the proof
              cannot settle. */}
          <Note>
            This page was claimed on {claim.claimed_at.slice(0, 10)}. If that
            was you on another account, sign in there instead. If the channel
            is yours, run the proof below: a pass makes the page yours, the
            earlier verification becomes void, and its custom settings revert.
            Anything the proof cannot settle is a conversation, write to us.
          </Note>
        </Section>
      )}

      {user && (
        <ClaimPanel
          creatorId={creator.id}
          site={site}
          channels={channelsOf(creator.id)}
          token={claim && claim.user_id === user.id ? null : tokenFor(creator.id, user.id)}
          claimed={claim && claim.user_id === user.id ? {
            at: claim.claimed_at,
            displayName: claim.display_name ?? "",
            affiliateTag: claim.affiliate_tag ?? "",
            bio: claim.bio ?? "",
            avatarUrl: claim.avatar_url ?? "",
            links: {
              youtube: claim.channels?.find((c) => c.kind === "youtube")?.url ?? "",
              instagram: claim.channels?.find((c) => c.kind === "instagram")?.url ?? "",
              tiktok: claim.channels?.find((c) => c.kind === "tiktok")?.url ?? "",
            },
            withdrawn: !!claim.withdrawn_at,
          } : null}
          onVerify={verifyClaim}
          onSave={saveSettings}
          onWithdraw={withdrawPage}
        />
      )}

      <Note>
        <Link href={`/creators/${creator.handle}`}>← Back to the page</Link>
      </Note>
    </Page>
  );
}
