import { ImageResponse } from "next/og";
import { markPaths, markStroke } from "@/lib/mark";

/**
 * The link preview card, drawn rather than shipped — same argument as
 * `icons/[size]`: this repo holds no binary assets, so the card is rendered
 * from the same two colours and the same `lib/mark` paths as the app icon, and
 * cannot drift from them.
 *
 * It applies to every route that does not name its own image. That includes
 * a recipe with no photo, which is why the card says what the product is rather
 * than only its name — for that reader it is the whole description.
 *
 * Dark, unlike the app. The card is not chrome; it sits in someone else's feed,
 * where the mark needs to survive a white Reddit page and a black Discord one.
 */
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "JipBap: Asian home cooking, from what's already in your kitchen";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex",
          flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 28, background: "#0f1a14", color: "#e8f3ec",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <svg width={132} height={132} viewBox="0 0 24 24" fill="none"
             stroke="#7bd6a0" strokeWidth={markStroke(132)}
             strokeLinecap="round" strokeLinejoin="round">
          {markPaths(132).map((d) => <path key={d} d={d} />)}
        </svg>
        <div style={{ display: "flex", alignItems: "baseline", gap: 20 }}>
          <div style={{ fontSize: 92, fontWeight: 700, letterSpacing: -2 }}>JipBap</div>
          {/* The hangul is here for the reader who knows the word, and because
              it is the only place the name explains itself without a sentence. */}
          <div style={{ fontSize: 62, color: "#7bd6a0" }}>집밥</div>
        </div>
        <div style={{ fontSize: 34, color: "#a7bdb0", maxWidth: 820, textAlign: "center" }}>
          Asian home cooking: what you can cook right now, from what&apos;s
          already in your kitchen.
        </div>
      </div>
    ),
    size,
  );
}
