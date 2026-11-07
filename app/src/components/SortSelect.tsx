"use client";

/**
 * The shelf's sort, as a select — the reviewer's call over the earlier row of
 * links, which read fine at four options and would not survive a fifth. A
 * NATIVE select: the platform picker is better than anything rebuilt in a
 * div, especially on the phones this page will actually be read on.
 *
 * Navigation, not state: choosing pushes the query param and the server
 * re-sorts, so the address stays shareable and the back button undoes a sort
 * like it undoes everything else.
 */
import { useRouter } from "next/navigation";

export function SortSelect({ current, options }: {
  current: string;
  options: ReadonlyArray<readonly [string, string]>;
}) {
  const router = useRouter();
  return (
    <label className="sortselect">
      {/* No visible "sort by" — the options are phrases that announce
          themselves ("fewest missing ingredients" cannot be anything else),
          and the label survives for screen readers. */}
      <span className="visually-hidden">sort by</span>
      <select value={current}
              onChange={(e) => router.push(e.target.value ? `?sort=${e.target.value}` : "?")}>
        {options.map(([key, name]) => (
          <option key={name} value={key}>{name}</option>
        ))}
      </select>
    </label>
  );
}
