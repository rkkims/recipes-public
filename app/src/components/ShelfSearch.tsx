"use client";

/**
 * Search within one shelf — the creator page's collection, today.
 *
 * The same navigation-not-state contract as `SortSelect` beside it: typing
 * pushes `?q=` (debounced past the router), the server filters, the address
 * stays shareable and the back button undoes a search like it undoes
 * everything else. `replace` rather than `push` while typing, so a search is
 * one history entry and not one per keystroke.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function ShelfSearch({ placeholder, scope, onSuggest }: {
  placeholder: string;
  /** Passed back to `onSuggest` — the creator handle, here. */
  scope?: string;
  /** Title suggestions within the shelf; picking one jumps to the recipe. */
  onSuggest?: (scope: string, q: string) => Promise<Array<{ id: string; title: string }>>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [hits, setHits] = useState<Array<{ id: string; title: string }>>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function onChange(v: string) {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (v.trim()) next.set("q", v.trim()); else next.delete("q");
      router.replace(`?${next.toString()}`, { scroll: false });
      if (onSuggest && scope && v.trim().length >= 2)
        void onSuggest(scope, v).then(setHits);
      else setHits([]);
    }, 250);
  }

  return (
    <span className="shelfsearch-wrap">
      <input className="shelfsearch" type="search" value={q}
             placeholder={placeholder} aria-label="search this collection"
             onChange={(e) => onChange(e.target.value)}
             onBlur={() => setTimeout(() => setHits([]), 200)} />
      {hits.length > 0 && (
        <ul className="shelfsearch-hits">
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => router.push(`/recipe/${h.id}`)}>
                {h.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
