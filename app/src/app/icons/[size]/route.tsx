/**
 * The app icon, drawn rather than shipped — UX-SPEC §12.
 *
 * A manifest needs raster icons at fixed sizes, and this repo has no binary
 * assets and no image pipeline. `ImageResponse` renders them at build time from
 * the same two colours the app uses, so the icon cannot drift from the product's
 * palette and there is nothing to re-export when it changes.
 *
 * One route for every size the manifest and iOS ask for, rather than three files
 * that would have to agree with each other.
 */
import { ImageResponse } from "next/og";
import { markPaths, markStroke } from "@/lib/mark";

/** The sizes that are actually referenced — anything else is a 404, not a guess. */
const SIZES = new Set([180, 192, 512]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size: raw } = await params;
  const size = Number(raw);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex",
          alignItems: "center", justifyContent: "center",
          background: "#ffffff", color: "#1c2b22",
          /* No rounded corners: every platform masks the icon its own way, and
             a radius baked in shows as a dark ring inside the mask. */
          fontSize: size * 0.62, fontWeight: 700,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        {/* A bowl of rice — `lib/mark`, which also decides how much of it to
            draw at this size and how heavy the line has to be to survive. */}
        <svg width={size * 0.68} height={size * 0.68} viewBox="0 0 24 24" fill="none"
             stroke="#2e9e5b" strokeWidth={markStroke(size * 0.68)}
             strokeLinecap="round" strokeLinejoin="round">
          {markPaths(size * 0.68).map((d) => <path key={d} d={d} />)}
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}

/** Pre-render all three at build time rather than on a cold request. */
export function generateStaticParams() {
  return [...SIZES].map((s) => ({ size: String(s) }));
}
