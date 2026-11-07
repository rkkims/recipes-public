/**
 * Everything the page needs to tell you, in one strip.
 *
 * The Cook page could stack six padded, left-bordered blocks before the gallery
 * began: a lifted dietary filter, the hidden-recipe count, tonight's plan, an
 * active Use-today pin — plus first run or the welcome-back review above them.
 * Every one is individually justified. Together they were a wall, and the
 * gallery they were explaining had been pushed off the screen.
 *
 * ── Ordered by what they cost you to miss ──────────────────────────────────
 *
 * Not by when they were added, which is what a stack of independently-rendered
 * blocks amounts to. Two of these change WHAT YOU ARE LOOKING AT and the rest
 * are context, so the ones that alter the result set come first — a hard filter
 * you have forgotten is the single most confusing state the product can be in.
 *
 * ── One container, tight rows ──────────────────────────────────────────────
 *
 * Each notice was its own bordered, padded block, which is the right treatment
 * for one and the wrong treatment for four. Grouped, they read as a status area
 * and cost about a fifth of the height.
 */
import type { ReactNode } from "react";

export type Notice = {
  /** Sort key: `filter` alters the results, `info` explains them. */
  kind: "filter" | "info";
  key: string;
  children: ReactNode;
};

export function Notices({ items }: { items: Notice[] }) {
  if (!items.length) return null;
  // A filter you forgot beats a fact you already know.
  const sorted = [...items].sort((a, b) =>
    Number(a.kind === "info") - Number(b.kind === "info"));

  return (
    <div className="notices" role="status">
      {sorted.map((n) => (
        <p key={n.key} className={n.kind === "filter" ? "notice notice-filter" : "notice"}>
          {n.children}
        </p>
      ))}
    </div>
  );
}
