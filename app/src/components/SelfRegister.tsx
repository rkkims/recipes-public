"use client";

/**
 * The §5a door as a form: a name, a channel, and nothing else to fill in.
 *
 * No review and no waiting room, so the submit lands directly on the claim
 * page — registering and proving are one walk, and the page is exactly as
 * live as the proof makes it. The duplicate answer is a link, not a dead
 * end: if the site is already indexed, the right door is its claim page.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Note, Panel } from "@/components/primitives";
import { parsePlatformLink, platformLabel, type PlatformLink } from "@/lib/platforms";

export function SelfRegister({ onRegister }: {
  onRegister: (input: { display_name: string; kind: "domain" | "youtube"; where: string;
                        platforms?: string[] })
    => Promise<{ ok: true; handle: string } | { ok: false; error: string; claimHandle?: string }>;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"domain" | "youtube">("domain");
  const [where, setWhere] = useState("");
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [claimHandle, setClaimHandle] = useState<string | null>(null);
  /**
   * Their other platforms, one paste at a time — CREATORS-TAB-SPEC §5. An
   * indexed creator arrives with channels the crawl found; whoever walks in
   * this door arrives with none, so the door takes them here. The raw link is
   * kept beside the parse: the parse is what the row SHOWS, the raw is what
   * the server re-reads.
   */
  const [platforms, setPlatforms] = useState<Array<{ raw: string; link: PlatformLink }>>([]);
  const [platformDraft, setPlatformDraft] = useState("");
  const [platformNote, setPlatformNote] = useState("");

  const addPlatform = () => {
    const link = parsePlatformLink(platformDraft);
    if (!link) {
      setPlatformNote("Paste a YouTube, Instagram or TikTok profile link.");
      return;
    }
    setPlatformNote("");
    // One per platform: pasting a second Instagram replaces the first, which
    // is what someone correcting a typo means by pasting again.
    setPlatforms([...platforms.filter((p) => p.link.kind !== link.kind),
                  { raw: platformDraft.trim(), link }]);
    setPlatformDraft("");
  };

  return (
    <Panel>
      {/* `.selfreg` exists for the inputs: nothing else scoped this form, so
          the name and site boxes rendered at the browser's default size. */}
      <div className="selfreg">
      <label className="field">
        <span className="field-label">Your name, as cooks should see it</span>
        <input value={name} onChange={(e) => setName(e.target.value)}
               placeholder="Aunt Mi's Kitchen" />
      </label>

      <div className="claim-channels" role="tablist" aria-label="where you publish">
        {(["domain", "youtube"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k}
                  className={`claim-ch ch-${k}${kind === k ? " on" : ""}`}
                  onClick={() => { setKind(k); setWhere(""); }}>
            {k === "domain" ? "Website" : "YouTube"}
          </button>
        ))}
      </div>

      <label className="field">
        <span className="field-label">
          {kind === "domain"
            ? "Your site (you will prove it is yours next)"
            : "Your channel's @handle or URL (you will prove it is yours next)"}
        </span>
        <input value={where} onChange={(e) => setWhere(e.target.value)}
               placeholder={kind === "domain" ? "auntmis.kitchen" : "@auntmiskitchen"} />
      </label>

      {/* One paste, one row, add another — never a grid of empty optional
          fields. The primary channel above is the provable one; these are
          where else cooks can find them, shown on the page unverified the
          same way crawled channels are. No visible label (the user's call,
          2026-08-16): the placeholder carries the instruction, the aria-label
          carries the name. */}
      <div className="field">
        <div className="platform-add">
          <input value={platformDraft}
                 placeholder="your other platforms: paste a profile link…"
                 aria-label="Your other platforms"
                 onChange={(e) => { setPlatformDraft(e.target.value); setPlatformNote(""); }}
                 onKeyDown={(e) => {
                   if (e.key === "Enter") { e.preventDefault(); addPlatform(); }
                 }} />
          <Button kind="plain" disabled={!platformDraft.trim()} onClick={addPlatform}>
            Add
          </Button>
        </div>
      </div>
      {platformNote && <p className="note">{platformNote}</p>}
      {platforms.length > 0 && (
        <ul className="platform-rows">
          {platforms.map((p) => (
            <li key={p.link.kind} className="platform-row">
              <b>{platformLabel(p.link.kind)}</b> · {p.link.handle}
              <button type="button" className="platform-drop" title="remove"
                      aria-label={`Remove ${platformLabel(p.link.kind)}`}
                      onClick={() => setPlatforms(platforms.filter((x) => x.link.kind !== p.link.kind))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="cook-line">
        <Button kind="primary" disabled={pending || !name.trim() || !where.trim()}
                onClick={() => start(async () => {
                  setNote(""); setClaimHandle(null);
                  const r = await onRegister({ display_name: name, kind, where,
                    ...(platforms.length ? { platforms: platforms.map((p) => p.raw) } : {}) });
                  if (r.ok) router.push(`/creators/${r.handle}/claim`);
                  else { setNote(r.error); setClaimHandle(r.claimHandle ?? null); }
                })}>
          Create the page
        </Button>
        {note && (
          <span className="note">
            {note}
            {claimHandle && (
              <>{" "}<Link href={`/creators/${claimHandle}/claim`}>Claim it</Link></>
            )}
          </span>
        )}
      </p>
      <Note>
        Next step is proving the channel is yours, on the page this creates.
        The page stays invisible until a proof passes. Right now we can verify
        a website or a YouTube channel; TikTok and Meta verification is in the
        works.
      </Note>
      </div>
    </Panel>
  );
}
