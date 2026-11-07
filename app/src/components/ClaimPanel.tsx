"use client";

/**
 * The claim, from the claimant's side of the table.
 *
 * Pre-claim it is three things in order: what claiming gets you (real,
 * shipped benefits only — a pitch that names unshipped features is a debt
 * collector's letter to ourselves), which channel you will prove, and the
 * proof itself. One channel is enough; CREATOR-SPEC §1 keeps verification
 * per channel, so the claim records exactly which one passed.
 *
 * Website and YouTube verify today. Instagram and TikTok are listed but
 * honest: their profile pages answer our server with rate limits and
 * challenge shells, so their proof waits for platform sign-in — a disabled
 * row that says so beats a Check button that always fails.
 *
 * Post-claim: the settings a claim unlocks — display name and affiliate tag,
 * CREATOR-SPEC §5's table — editable in place.
 */
import { useState, useTransition } from "react";
import { Button, Note, Panel, Section } from "@/components/primitives";
import type { Proof } from "@/lib/claims";

type Channel = { kind: string; handle: string };

const KIND_NAME: Record<string, string> = {
  domain: "Website", youtube: "YouTube", instagram: "Instagram", tiktok: "TikTok",
};
const LIVE = new Set(["domain", "youtube"]);

export function ClaimPanel({ creatorId, site, channels, token, claimed, onVerify, onSave, onWithdraw }: {
  creatorId: string;
  /** Null for a page whose only channel is a platform — the domain proof
      rows simply do not render, and the claimed note names no site. */
  site: string | null;
  channels: Channel[];
  /** Present pre-claim only. */
  token: string | null;
  claimed: {
    at: string; displayName: string; affiliateTag: string;
    bio: string; avatarUrl: string;
    links: { youtube: string; instagram: string; tiktok: string };
    withdrawn: boolean;
  } | null;
  onVerify: (handle: string, kind: string) => Promise<{ ok: true; proof: Proof } | { ok: false; error: string }>;
  onSave: (handle: string, patch: {
    display_name?: string; affiliate_tag?: string;
    bio?: string; avatar_url?: string;
    channels?: Array<{ kind: string; url: string }>;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  onWithdraw: (handle: string, on: boolean) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const handle = typeof window !== "undefined"
    ? window.location.pathname.split("/")[2] ?? "" : "";
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [name, setName] = useState(claimed?.displayName ?? "");
  const [tag, setTag] = useState(claimed?.affiliateTag ?? "");
  const [bio, setBio] = useState(claimed?.bio ?? "");
  const [avatar, setAvatar] = useState(claimed?.avatarUrl ?? "");
  const [links, setLinks] = useState(claimed?.links ?? { youtube: "", instagram: "", tiktok: "" });
  const ordered = [...channels].sort((a, b) =>
    Number(LIVE.has(b.kind)) - Number(LIVE.has(a.kind)));
  const [kind, setKind] = useState(ordered.find((c) => LIVE.has(c.kind))?.kind ?? "domain");

  if (claimed) {
    return (
      <Section title="Your page">
        <Panel>
          <Note>Claimed {claimed.at.slice(0, 10)}{site ? `, verified against ${site}` : ""}.</Note>
          <label className="field">
            <span className="field-label">Display name (blank keeps ours)</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">A line about you, under your name (200 characters)</span>
            <input value={bio} maxLength={200} onChange={(e) => setBio(e.target.value)}
                   placeholder="what you cook, in your words" />
          </label>
          <label className="field">
            <span className="field-label">Profile picture link (https, square works best; blank keeps your site icon)</span>
            <input value={avatar} onChange={(e) => setAvatar(e.target.value)}
                   placeholder="https://…/you.jpg" />
          </label>
          {(["youtube", "instagram", "tiktok"] as const).map((k) => (
            <label className="field" key={k}>
              <span className="field-label">
                {KIND_NAME[k]} link (blank {claimed.links[k] ? "removes it" : "leaves it off"})
              </span>
              <input value={links[k]}
                     onChange={(e) => setLinks({ ...links, [k]: e.target.value })}
                     placeholder={`https://www.${k}.com/…`} />
            </label>
          ))}
          <label className="field">
            <span className="field-label">
              {/* Held, not live — the pitch stopped promising this and the
                  label must not either. It starts running when creator shop
                  links ship. */}
              Weee! affiliate tag (saved now, used when creator shop links go live)
            </span>
            <input value={tag} onChange={(e) => setTag(e.target.value)}
                   placeholder="left blank, our tag runs" />
          </label>
          <p className="cook-line">
            <Button kind="primary" disabled={pending}
                    onClick={() => start(async () => {
                      const r = await onSave(handle, {
                        display_name: name, affiliate_tag: tag,
                        bio, avatar_url: avatar,
                        channels: (["youtube", "instagram", "tiktok"] as const)
                          .filter((k) => links[k].trim())
                          .map((k) => ({ kind: k, url: links[k].trim() })),
                      });
                      setNote(r.ok ? "saved" : r.error);
                    })}>
              Save
            </Button>
            {note && <span className="note">{note}</span>}
          </p>

          {/* CREATOR-SPEC §6, as a button: honoured immediately, reversible,
              no retention flow. The copy states the effect, not a plea. */}
          <div className="withdraw-row">
            <button type="button"
                    className={claimed.withdrawn ? "standing-btn on" : "standing-btn"}
                    aria-pressed={claimed.withdrawn}
                    disabled={pending}
                    onClick={() => start(async () => {
                      const r = await onWithdraw(handle, !claimed.withdrawn);
                      setNote(r.ok
                        ? claimed.withdrawn ? "restored: live again" : "withdrawn: invisible except to you"
                        : r.error);
                    })}>
              {claimed.withdrawn ? "Withdrawn: press to restore" : "Withdraw this page"}
            </button>
            <span className="note">
              Takes effect immediately: the page and your recipes leave display
              and matching. Reversible any time, and nothing is deleted.
            </span>
          </div>
        </Panel>
      </Section>
    );
  }

  const active = ordered.find((c) => c.kind === kind);

  return (
    <>
      <Section title="Prove a channel is yours">
        <Panel>
          <Note>Any one channel is enough. Your token never expires, and
            checking is free to retry:</Note>
          <p><code className="claim-token">{token}</code></p>

          <div className="claim-channels" role="tablist" aria-label="channel to verify">
            {ordered.map((c) => (
              <button key={c.kind} type="button" role="tab"
                      aria-selected={kind === c.kind}
                      className={`claim-ch ch-${c.kind}${kind === c.kind ? " on" : ""}${LIVE.has(c.kind) ? "" : " off"}`}
                      disabled={!LIVE.has(c.kind)}
                      onClick={() => setKind(c.kind)}>
                {KIND_NAME[c.kind] ?? c.kind}
                {!LIVE.has(c.kind) && <span className="note"> soon</span>}
              </button>
            ))}
          </div>

          {active?.kind === "domain" && site && (
            <ol className="claim-ways">
              <li>
                Add to your homepage&apos;s <code>&lt;head&gt;</code>:{" "}
                <code>{`<meta name="jipbap-claim" content="${token}">`}</code>
              </li>
              <li>
                Or upload a file at <code>https://{site}/jipbap-claim.txt</code>{" "}
                containing the token
              </li>
              <li>
                Or add a DNS TXT record (works even if your host blocks bots):{" "}
                <code>{`_jipbap-claim.${site.replace(/^www\./, "")}`}</code> ={" "}
                <code>{`jipbap-claim=${token}`}</code>
              </li>
            </ol>
          )}
          {active?.kind === "youtube" && (
            <ol className="claim-ways">
              <li>
                Open YouTube Studio → Customization → paste the token anywhere
                in your channel <b>description</b>, and publish.
              </li>
              <li>
                Then press Check. Edits can take a few minutes to show. You
                can remove the token once verified.
              </li>
            </ol>
          )}
          {/* Said to everyone, not only to pages that already list a TikTok
              or Instagram channel: what we can verify is a fact about us, and
              hiding it until someone adds the channel makes it look like a
              fact about them. Plain claim, no mechanism (the copy rule). */}
          <Note>
            Right now we can verify a website or a YouTube channel. TikTok and
            Meta verification is in the works.
          </Note>

          <p className="cook-line">
            <Button kind="primary" disabled={pending || !active || !LIVE.has(active.kind)}
                    onClick={() => start(async () => {
                      setNote("");
                      const r = await onVerify(handle, kind);
                      setNote(r.ok ? `verified via ${r.proof}. This page is yours.` : r.error);
                    })}>
              {pending ? "checking…" : "Check now"}
            </Button>
            {note && <span className="note">{note}</span>}
          </p>
        </Panel>
      </Section>
    </>
  );
}
