/**
 * Where a creator lives, as a row of marks.
 *
 * Lifted out of `creators/[handle]/page.tsx` unchanged — same order, same
 * glyphs, same labels. It moved for one reason: the static creator page draws
 * the identical row, and forty lines of hand-drawn SVG copied into a second
 * file is forty lines that will disagree with the first one the next time a
 * platform is added.
 *
 * The domain text grew into a row the moment YouTube joined it. Marks are
 * drawn, not typed; each link carries its name for the screen reader the icon
 * cannot serve. Kinds we have no icon for never reach here — `linksOf` drops
 * them rather than rendering mystery chrome.
 */
export function CreatorLinks(
  { name, links }: { name: string; links: Array<{ kind: string; href: string }> },
) {
  return (
    <span className="creator-links">
      {links.map(({ kind, href }) => {
        const label = kind === "domain" ? `${name}'s website`
          : kind === "youtube" ? `${name} on YouTube`
          : kind === "instagram" ? `${name} on Instagram`
          : `${name} on TikTok`;
        return (
          <a key={kind} href={href} rel="noopener" aria-label={label}>
            {kind === "domain" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                   strokeLinejoin="round" aria-hidden="true">
                <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
                <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
              </svg>
            ) : kind === "youtube" ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                   strokeLinejoin="round" aria-hidden="true">
                <rect x="2.5" y="5.5" width="19" height="13" rx="3.5" />
                <path d="M10 9.3l5 2.7-5 2.7z" fill="currentColor" stroke="none" />
              </svg>
            ) : kind === "instagram" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                   strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" stroke="none" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                   stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                   strokeLinejoin="round" aria-hidden="true">
                <path d="M9 12.5a4 4 0 1 0 4 4V4.5c.6 2.2 2.3 3.9 5 4.3" />
              </svg>
            )}
          </a>
        );
      })}
    </span>
  );
}
