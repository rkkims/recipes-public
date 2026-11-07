import { ImageResponse } from "next/og";
import { markPaths, markStroke } from "@/lib/mark";

/**
 * The browser-tab icon.
 *
 * A file convention rather than another entry in `icons/[size]`: Next only
 * emits the `<link rel="icon">` tag for `app/icon`, and an icon nothing links
 * to is an icon no tab shows. Same drawing, same `lib/mark`, so it cannot
 * drift from the home-screen icon it sits beside in a bookmark list.
 *
 * Why it exists at all: word of mouth is the distribution plan, and the tab
 * icon is how someone who opened this on Tuesday finds it again among twenty
 * tabs on Saturday. That is the same argument the page metadata makes.
 *
 * 32px, and browsers downscale to 16 themselves. Drawn at 0.82 of the square
 * rather than the 0.68 `icons/[size]` uses — that margin is there so Android
 * can mask the home-screen icon into a circle without clipping the mark, and
 * nothing masks a favicon, so spending it here would only make the bowl
 * smaller in the one place it is already smallest.
 */
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

const INNER = 32;

/*
  The mark's own margins, cropped away here and only here.

  The 24-unit viewBox carries air on every side (the bowl spans x 3.4–20.6,
  y ≈4.3–20.3) because the other renderings need it — Android masks the
  home-screen icon into a circle and the nav sits the mark beside text. A
  favicon needs none of it. This box hugs the ink EXACTLY: bounds plus half
  the stroke (≈0.6 units at this weight), squared on the wider axis — the
  bowl's rims touch the tile's left and right edges, and the leftover breath
  above and below is the shape's own aspect, not a margin.
*/
const CROP = { x: 2.78, y: 3.08, span: 18.45 };

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex",
          /* No tile at all — the reviewer stripped the background twice (first
             the dark shell, then the white card): the mark floats on whatever
             the tab bar is. Ink-black, near-full-bleed, and a third bolder
             than the in-app weight, because a favicon is read at a squint. */
          alignItems: "center", justifyContent: "center", background: "transparent",
        }}
      >
        {/* Stroke computed for the size the 24-unit space EFFECTIVELY renders
            at after the crop, so the line stays the same device weight the
            uncropped drawing had — bigger bowl, not a heavier one. */}
        <svg width={INNER} height={INNER}
             viewBox={`${CROP.x} ${CROP.y} ${CROP.span} ${CROP.span}`} fill="none"
             stroke="#000000" strokeWidth={markStroke(INNER * (24 / CROP.span)) * 1.35}
             strokeLinecap="round" strokeLinejoin="round">
          {markPaths(INNER * (24 / CROP.span)).map((d) => <path key={d} d={d} />)}
        </svg>
      </div>
    ),
    size,
  );
}
