"use client";

/**
 * "This is wrong" — a button, on every page, during dogfooding.
 *
 * ── Why it is worth a permanent corner ───────────────────────────────────
 *
 * The person finding the bugs is holding a phone in a kitchen. The competing
 * option is a spreadsheet in another app, and the cost of switching is not the
 * seconds — it is that the note gets written later, from memory, without the
 * URL. Context is the half that decays fastest and the half that makes a report
 * actionable.
 *
 * So the typing is only the part a human has: what they expected. Everything a
 * machine can know, the machine collects — the exact address including its
 * query, the viewport, the user agent, the service worker version, and which
 * kitchen was on screen.
 *
 * ── It is a tool, not a feature ──────────────────────────────────────────
 *
 * There is no triage, no severity, no email. It writes a line to a log and says
 * thank you. Delete this component, its line in the layout and `lib/reports.ts`
 * when the product has users who are not us.
 */
import { useEffect, useState, useTransition } from "react";
import { Dialog } from "./Dialog";
import { REPORT_KINDS, type ReportKind } from "@/lib/report-kinds";
import type { ActionResult } from "@/lib/result";

export function ReportButton({ onReport }: {
  onReport: (r: {
    what: string; kind: ReportKind; url: string;
    viewport?: string; ua?: string; sw?: string;
  }) => Promise<ActionResult>;
}) {
  const [open, setOpen] = useState(false);
  const [what, setWhat] = useState("");
  /* Defaults to the commonest kind rather than to a blank "choose one".
     An unset select is a second required field; a wrong-but-editable
     default costs a triage correction and never blocks the report. */
  const [kind, setKind] = useState<ReportKind>("app function");
  const [failed, setFailed] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  /** The worker's version, asked for once — the closest thing to a build id. */
  const [sw, setSw] = useState<string | undefined>();

  useEffect(() => {
    /* `navigator.serviceWorker` does not exist on an insecure origin, which is
       every deploy until the domain has a certificate. Absent is a fine answer
       and a telling one: a report with no worker version came from a build
       where the whole offline layer was inert. */
    navigator.serviceWorker?.getRegistration?.()
      .then((r) => {
        const url = r?.active?.scriptURL;
        if (url) setSw(new URL(url).searchParams.get("v") ?? "registered");
      })
      .catch(() => { /* nothing to say */ });
  }, []);

  const close = () => { setOpen(false); setWhat(""); setFailed(null); };

  const send = () => {
    if (!what.trim() || pending) return;
    setFailed(null);
    start(async () => {
      const r = await onReport({
        what: what.trim(),
        kind,
        /* The full address, not the pathname. Half the bugs in this product
           have been about a query parameter: the open recipe, the cuisine
           chip, the search term. */
        url: location.pathname + location.search,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        ua: navigator.userAgent,
        ...(sw ? { sw } : {}),
      });
      if (!r.ok) { setFailed(r.error); return; }
      setDone(true);
      close();
      /* Said once and briefly. A confirmation that has to be dismissed is a
         second interaction for a tool whose whole point is being cheap. */
      setTimeout(() => setDone(false), 2200);
    });
  };

  return (
    <>
      <button type="button" className="reportfab" onClick={() => setOpen(true)}
              aria-label="Report a problem" title="Report a problem">
        {/* Drawn, not typed — a glyph would inherit the label's size and read
            as punctuation. The house rule for every mark in this product. */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"
             stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
          <path d="M12 8v5" /><path d="M12 16.5v.01" />
          <circle cx="12" cy="12" r="9" />
        </svg>
        <span className="reportfab-word">Report</span>
      </button>

      {done && <p className="reportdone" role="status">Logged. Thanks.</p>}

      {open && (
        <Dialog label="Report a problem" onClose={close}>
          <h3 className="account-dlg-h">What went wrong?</h3>
          {/* Nothing about what gets attached. It is collected either way, so
              the sentence was asking the reporter to read a fact they cannot
              act on — in the box whose whole purpose is being fast. */}
          <label className="account-confirm">
            {/* No placeholder. An example in the box is a suggestion about
                what counts as worth reporting, and the answer is everything. */}
            <textarea rows={4} value={what} autoFocus
                      onChange={(e) => setWhat(e.target.value)} />
          </label>

          {/* Below the box, not above it. The thing to do on opening this is
              type; a control between the heading and the field would make
              categorising the first act, and the category is worth nothing
              without the sentence. */}
          <label className="account-confirm reportkind">
            <span>Which part?</span>
            <select value={kind} disabled={pending}
                    onChange={(e) => setKind(e.target.value as ReportKind)}>
              {REPORT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          </label>
          {failed && <p className="fail">Not saved: {failed}</p>}
          <div className="account-confirm-row">
            <button type="button" className="account-btn" onClick={close} disabled={pending}>
              Cancel
            </button>
            <button type="button" className="account-btn account-primary"
                    disabled={!what.trim() || pending} onClick={send}>
              {pending ? "Saving…" : "Log it"}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
