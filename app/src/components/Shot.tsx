"use client";

/**
 * A hotlinked photograph that knows how to fail.
 *
 * Every recipe image in the product is hotlinked from the source blog —
 * `RECIPE-SPEC` §1a wants cached derivatives and that pipeline does not exist,
 * so the alternative is a gallery with no pictures. The surfaces all handled
 * the case where a recipe carries NO image, and none of them handled the case
 * where it carries one that will not load. Those are different failures with
 * the same remedy, and only the first was wired.
 *
 * It is not hypothetical and it is not one row. Found live on 2026-08-20: every
 * `maangchi.com`-hosted image answers **403** — no referrer, with referrer,
 * browser user-agent, all of them — and 372 of that source's recipes carry one.
 * `referrerPolicy="no-referrer"` was already on these tags, which is the fix for
 * a referrer check and no help at all against a blanket block. So the browser
 * painted its own broken-image glyph on the home grid, which is the single worst
 * thing to have on a page an affiliate reviewer is about to look at.
 *
 * §122 of the spec predicted this exact class — *"some sources block hotlinking
 * by referrer, some publish no `og:image`, some 404"* — and the render path
 * covered the middle one.
 *
 * The remedy has to be client-side: whether a URL loads is not knowable at
 * render time, on the server, for someone else's host. Dropping dead URLs at
 * index time is the better OUTPUT and cannot replace this — it needs a crawl
 * pass, it goes stale, and it cannot see a source that starts blocking next
 * week. This is the net under that, and it costs one state cell per image.
 *
 * The state is the failed URL rather than a boolean, so a card that is handed a
 * new `src` tries again instead of staying dark from a previous recipe's
 * failure.
 */
import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * Did this tag already fail, before React was watching?
 *
 * The trap that made the first version of this component do nothing. These
 * pages are server-rendered, so the browser starts fetching the image while
 * the HTML is still streaming — long before hydration attaches an `onError`
 * handler. A 403 answers fast. The error event fires into a document with no
 * listener, React never hears it, and the broken glyph stays on screen while
 * the component sits there believing everything is fine.
 *
 * `complete` with a zero `naturalWidth` is that history: the browser finished
 * with this tag and got no pixels. Checked once on mount, which is the first
 * moment we are allowed to look. `onError` still covers everything that fails
 * AFTER hydration; neither one is sufficient alone.
 */
const alreadyFailed = (el: HTMLImageElement | null): boolean =>
  !!el && el.complete && el.naturalWidth === 0;

export function Shot({ src, alt = "", className, fallback, loading = "lazy" }: {
  src?: string;
  alt?: string;
  className?: string;
  /** What to draw instead — the surface's own "no photo" treatment. */
  fallback: ReactNode;
  loading?: "lazy" | "eager";
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (src && alreadyFailed(ref.current)) setFailed(src);
  }, [src]);

  if (!src || failed === src) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} src={src} alt={alt} loading={loading} referrerPolicy="no-referrer"
         {...(className ? { className } : {})}
         onError={() => setFailed(src)} />
  );
}

/**
 * The recipe modal's photo, which is a block rather than a tag.
 *
 * `.modal-shot` has no height of its own — it is a positioned wrapper the heart
 * perches on, sized by the image inside it. So a failed photo cannot simply
 * leave an empty wrapper behind; the heart would sit in a collapsed box. The
 * "no photo" case already had an answer for that, `.modal-save-bare`, and a
 * failed photo has to arrive at the same one. Hence the whole block swaps.
 */
export function ModalShot({ image, save }: { image?: string; save?: ReactNode }) {
  const [failed, setFailed] = useState<string | null>(null);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (image && alreadyFailed(ref.current)) setFailed(image);
  }, [image]);

  const usable = image && failed !== image;
  if (usable) {
    return (
      <div className="modal-shot">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={ref} src={image} alt="" referrerPolicy="no-referrer"
             onError={() => setFailed(image)} />
        {save}
      </div>
    );
  }
  return save ? <div className="modal-save-bare">{save}</div> : null;
}
