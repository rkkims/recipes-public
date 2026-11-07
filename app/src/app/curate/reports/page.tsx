/**
 * The reports, read back.
 *
 * Under `/curate` deliberately: nginx already gates that whole path with basic
 * auth (see `deploy/nginx-jipbap.conf`), so this inherits the lock instead of
 * inventing a second one. A review tool that needs its own password is a review
 * tool with a second password to leak.
 *
 * Newest first, everything shown, no triage. The value here is that the context
 * a person could not be bothered to type is present — URL, viewport, browser,
 * worker version — and it is present precisely because nobody typed it.
 */
import { allReports } from "@/lib/reports";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return { title: "Reports · curate" };
}

/** "3 minutes ago" beats an ISO string for the thing you filed while cooking. */
function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return iso;
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** The browser, from the string nobody wants to read in full. */
function browser(ua: string | undefined): string {
  if (!ua) return "";
  if (/iPhone|iPad/.test(ua)) return /CriOS/.test(ua) ? "Chrome on iOS" : "Safari on iOS";
  if (/Android/.test(ua)) return "Android";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "other";
}

export default async function Reports() {
  const reports = allReports();

  return (
    <main className="page" id="main">
      <h2 className="account-h">Reports</h2>
      <p className="note">
        {reports.length === 0
          ? "Nothing filed yet."
          : `${reports.length} filed, newest first.`}
      </p>

      <ol className="reportlist">
        {reports.map((r, i) => (
          <li key={`${r.at}-${i}`} className="reportitem">
            {/* The kind first and drawn as a tag: scanning forty reports is
                looking for one layer at a time, and a word in a row of grey
                metadata is not scannable. */}
            <p className="reportitem-what">
              <span className="reportkind-tag">{r.kind ?? "unsorted"}</span>
              {r.what}
            </p>
            <p className="reportitem-meta">
              <b>{ago(r.at)}</b>
              <code>{r.url}</code>
              {r.viewport && <span>{r.viewport}</span>}
              {browser(r.ua) && <span>{browser(r.ua)}</span>}
              {r.sw && <span>sw {r.sw}</span>}
              <span>{r.email ?? r.owner}</span>
            </p>
          </li>
        ))}
      </ol>
    </main>
  );
}
