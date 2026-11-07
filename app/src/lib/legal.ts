/**
 * The published legal documents, read from `legal/` at request time.
 *
 * ── Why the markdown is the source, and not a TSX page ─────────────────────
 *
 * These two documents are quoted by other things. `lib/pool.ts` refuses to
 * build a partner file until the privacy policy is real, `lib/consent.ts` holds
 * a consent string that the policy reproduces verbatim, and the partner
 * contract clauses in `legal/partner-data-clauses.md` depend on §5.1's third
 * condition word for word. A second copy of that text, hand-transcribed into
 * JSX, is a copy that will disagree with the first one — and the failure mode is
 * a promise made on the website that the contract does not carry.
 *
 * So there is one file per document, it lives in `legal/`, and this renders it.
 * Editing the policy is editing the policy.
 *
 * ── Rendered on the server, shipped as HTML ────────────────────────────────
 *
 * `marked` runs here and never reaches the browser. A legal page is the last
 * thing that should depend on JavaScript having loaded, and this way it is a
 * document — readable with scripts off, selectable, printable, and findable with
 * the browser's own search.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { marked } from "marked";

/**
 * Find `legal/`, walking up from wherever the process was started.
 *
 * The same pattern `lib/data` uses, and for the same reason: the
 * app is a nested package and `cwd` differs between `next dev` in `app/`, a
 * production start from the repo root, and a test runner.
 */
function legalDir(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const c = resolve(dir, "legal");
    if (existsSync(resolve(c, "privacy-policy.md"))) return c;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}

export type LegalDoc = { html: string; title: string };

/**
 * One document, as HTML.
 *
 * Returns `null` rather than throwing when the file is missing, so a deployment
 * that forgot to copy `legal/` renders a 404 on one page instead of a 500 on
 * every page that links to it.
 */
export function legalDoc(file: "privacy-policy" | "terms"): LegalDoc | null {
  const dir = legalDir();
  if (!dir) return null;
  const path = resolve(dir, `${file}.md`);
  if (!existsSync(path)) return null;

  const md = readFileSync(path, "utf8");
  /* The `# Heading` on line one, so the browser tab and the page agree without
     the title being written down twice. */
  const title = md.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "JipBap";
  return { html: marked.parse(md, { async: false }), title };
}
